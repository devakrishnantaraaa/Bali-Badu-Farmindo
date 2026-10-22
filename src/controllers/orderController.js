const db = require('../config/db');
const googleCalendarService = require('../services/googleCalendarService');
const { recalibrateProductStock } = require('./stockController');

async function createOrder(req, res) {
    const client = await db.getClient();
    try {
        const { customer_id, items, payment_type, due_date } = req.body;

        if (!customer_id || !items || !Array.isArray(items) || items.length === 0 || !payment_type) {
            return res.status(400).json({ error: 'Customer ID, items array, and payment_type are required' });
        }

        await client.query('BEGIN');

        // 1. Validate customer existence and get payment terms
        let customerRes;
        try {
            customerRes = await client.query('SELECT name, payment_terms FROM customers WHERE id = $1', [customer_id]);
        } catch (e) {
            // fallback if payment_terms column not present yet
            customerRes = await client.query('SELECT name FROM customers WHERE id = $1', [customer_id]);
        }

        if (customerRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer not found' });
        }
        const customerName = customerRes.rows[0].name;
        const customerPaymentTerms = customerRes.rows[0].payment_terms || 'REGULER';

        // -------------------------------------------------------------
        // Check active "Gantung Nota" according to Customer Payment Terms
        // -------------------------------------------------------------
        const unpaidCheck = await client.query(
            `SELECT invoice_number, amount_due - amount_paid AS remaining 
             FROM invoices 
             WHERE customer_id = $1 AND status = 'GANTUNG' 
             ORDER BY created_at ASC`,
            [customer_id]
        );

        let pendingInvoiceWarning = null;
        const pendingCount = unpaidCheck.rows.length;
        const totalRemaining = unpaidCheck.rows.reduce((sum, r) => sum + parseFloat(r.remaining), 0);

        if (customerPaymentTerms === 'GANTUNG_1_NOTA') {
            // "Gantung 1 nota (buat popup pemberitahuan kl ada 2 Nota pending)"
            if (pendingCount >= 2) {
                pendingInvoiceWarning = {
                    title: 'Peringatan Termin: Gantung 1 Nota!',
                    message: `Customer "${customerName}" memiliki ${pendingCount} nota pending (melebihi batas 1 nota gantung)!`,
                    terms: 'Gantung 1 Nota',
                    pending_count: pendingCount,
                    invoice_number: unpaidCheck.rows.map(r => r.invoice_number).join(', '),
                    remaining: totalRemaining
                };
            }
        } else if (pendingCount > 0) {
            // Informational warning for other terms with pending invoice
            pendingInvoiceWarning = {
                title: 'Pemberitahuan Nota Gantung',
                message: `Customer "${customerName}" memiliki ${pendingCount} nota pending sebelumnya.`,
                terms: customerPaymentTerms,
                pending_count: pendingCount,
                invoice_number: unpaidCheck.rows[0].invoice_number,
                remaining: totalRemaining
            };
        }

        // 2. Validate product stocks and calculate total
        let totalAmount = 0;
        const processedItems = [];

        for (const item of items) {
            const productRes = await client.query(
                'SELECT id, name, current_stock, price_per_unit FROM products WHERE id = $1 FOR UPDATE',
                [item.product_id]
            );

            if (productRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: `Product ID ${item.product_id} not found` });
            }

            const product = productRes.rows[0];
            const qty = parseFloat(item.quantity);
            const unitPrice = item.unit_price ? parseFloat(item.unit_price) : parseFloat(product.price_per_unit);

            if (parseFloat(product.current_stock) < qty) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Stok tidak mencukupi untuk produk ${product.name}. Stok tersedia: ${product.current_stock}, diminta: ${qty}`
                });
            }

            const subtotal = qty * unitPrice;
            totalAmount += subtotal;

            processedItems.push({
                product_id: product.id,
                product_name: product.name,
                quantity: qty,
                unit_price: unitPrice,
                subtotal: subtotal,
                current_stock: parseFloat(product.current_stock)
            });
        }

        // 3. Create Sales Order
        const orderNum = `ORD-${Date.now()}`;
        const orderDateTimestamp = (req.body.order_date) ? `${req.body.order_date} 12:00:00` : null;

        const orderRes = await client.query(
            orderDateTimestamp 
                ? `INSERT INTO orders (order_number, customer_id, total_amount, status, created_at)
                   VALUES ($1, $2, $3, 'CONFIRMED', $4)
                   RETURNING *`
                : `INSERT INTO orders (order_number, customer_id, total_amount, status)
                   VALUES ($1, $2, $3, 'CONFIRMED')
                   RETURNING *`,
            orderDateTimestamp 
                ? [orderNum, customer_id, totalAmount, orderDateTimestamp]
                : [orderNum, customer_id, totalAmount]
        );
        const order = orderRes.rows[0];

        // 4. Create Order Items & Update Stock + Stock Movement
        for (const pItem of processedItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [order.id, pItem.product_id, pItem.quantity, pItem.unit_price, pItem.subtotal]
            );

            // Deduct stock (initial)
            const newStock = pItem.current_stock - pItem.quantity;
            await client.query(
                `UPDATE products SET current_stock = $1 WHERE id = $2`,
                [newStock, pItem.product_id]
            );

            // Log movement
            await client.query(
                orderDateTimestamp
                    ? `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, reference_id, notes, created_at)
                       VALUES ($1, 'PENJUALAN', $2, $3, $4, $5, $6)`
                    : `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, reference_id, notes)
                       VALUES ($1, 'PENJUALAN', $2, $3, $4, $5)`,
                orderDateTimestamp
                    ? [pItem.product_id, pItem.quantity, newStock, orderNum, '', orderDateTimestamp]
                    : [pItem.product_id, pItem.quantity, newStock, orderNum, '']
            );

            // Recalibrate stock movements chronologically
            await recalibrateProductStock(client, pItem.product_id);
        }

        // 5. Create Invoice
        const invoiceNum = `INV-${Date.now()}`;
        const isPending = (payment_type === 'PENDING' || payment_type === 'CREDIT');
        const invoiceStatus = isPending ? 'GANTUNG' : 'LUNAS';
        const initialPaid = isPending ? 0.00 : totalAmount;
        const normalizedPaymentType = isPending ? 'CREDIT' : (payment_type === 'TRANSFER' ? 'TRANSFER' : 'CASH');

        let googleCalEventId = null;
        if (isPending && due_date) {
            googleCalEventId = await googleCalendarService.createDueDateReminder({
                invoiceNumber: invoiceNum,
                customerName: customerName,
                amountDue: totalAmount,
                dueDate: due_date
            });
        }

        const invoiceRes = await client.query(
            orderDateTimestamp
                ? `INSERT INTO invoices (invoice_number, order_id, customer_id, payment_type, amount_due, amount_paid, status, due_date, google_calendar_event_id, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                   RETURNING *`
                : `INSERT INTO invoices (invoice_number, order_id, customer_id, payment_type, amount_due, amount_paid, status, due_date, google_calendar_event_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   RETURNING *`,
            orderDateTimestamp
                ? [invoiceNum, order.id, customer_id, normalizedPaymentType, totalAmount, initialPaid, invoiceStatus, due_date || null, googleCalEventId, orderDateTimestamp]
                : [invoiceNum, order.id, customer_id, normalizedPaymentType, totalAmount, initialPaid, invoiceStatus, due_date || null, googleCalEventId]
        );

        // Jika transaksi langsung LUNAS, otomatis catat payment validated (metode CEK awal '-' sampai user memilih)
        if (!isPending) {
            const payNum = `PAY-${Date.now()}`;
            await client.query(
                orderDateTimestamp
                    ? `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at, created_at)
                       VALUES ($1, $2, $3, $4, '-', TRUE, $5, $6)`
                    : `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at)
                       VALUES ($1, $2, $3, $4, '-', TRUE, CURRENT_TIMESTAMP)`,
                orderDateTimestamp
                    ? [payNum, invoiceRes.rows[0].id, customer_id, totalAmount, orderDateTimestamp, orderDateTimestamp]
                    : [payNum, invoiceRes.rows[0].id, customer_id, totalAmount]
            );
        }

        await client.query('COMMIT');

        return res.status(201).json({
            message: 'Order created successfully',
            order: order,
            invoice: invoiceRes.rows[0],
            pending_warning: pendingInvoiceWarning
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

async function deleteOrderById(req, res) {
    const { order_id } = req.params;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Cari item pesanan untuk mengembalikan stok produk (restore stock)
        const itemsRes = await client.query(
            `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
            [order_id]
        );

        for (const item of itemsRes.rows) {
            await client.query(
                `UPDATE products SET current_stock = current_stock + $1 WHERE id = $2`,
                [parseFloat(item.quantity), item.product_id]
            );
        }

        // Hapus log pergerakan stok terkait order
        const orderRes = await client.query(`SELECT order_number FROM orders WHERE id = $1`, [order_id]);
        if (orderRes.rows.length > 0) {
            const orderNum = orderRes.rows[0].order_number;
            await client.query(`DELETE FROM stock_movements WHERE reference_id = $1`, [orderNum]);
        }

        // Hapus pembayaran & invoice terkait
        const invRes = await client.query(`SELECT id FROM invoices WHERE order_id = $1`, [order_id]);
        for (const inv of invRes.rows) {
            await client.query(`DELETE FROM payments WHERE invoice_id = $1`, [inv.id]);
        }
        await client.query(`DELETE FROM invoices WHERE order_id = $1`, [order_id]);

        // Hapus item pesanan dan order
        await client.query(`DELETE FROM order_items WHERE order_id = $1`, [order_id]);
        await client.query(`DELETE FROM orders WHERE id = $1`, [order_id]);

        // Kalibrasi ulang sisa stok berjalan untuk setiap produk terkait
        for (const item of itemsRes.rows) {
            await recalibrateProductStock(client, item.product_id);
        }

        await client.query('COMMIT');
        return res.json({ message: 'Transaksi penjualan berhasil dihapus dan stok barang telah dikembalikan!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting order:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

async function importDailySales(req, res) {
    const client = await db.getClient();
    try {
        const { rows } = req.body;
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'Tidak ada data transaksi yang dikirim untuk di-import.' });
        }

        await client.query('BEGIN');

        // 1. Ambil semua master customer untuk pencocokan fleksibel (case-insensitive & spasi berlebih)
        const custRes = await client.query('SELECT id, name FROM customers');
        const customerMap = new Map();
        custRes.rows.forEach(c => {
            const key = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (key) customerMap.set(key, c.id);
        });

        // 2. Ambil semua master produk yang ada di database
        const prodRes = await client.query('SELECT id, name, current_stock, price_per_unit FROM products');
        let productList = prodRes.rows;

        function resolveProduct(codeOrName) {
            if (!productList.length) return null;
            if (!codeOrName) return productList[0];
            const target = String(codeOrName).trim().toUpperCase();

            // Cek nama persis
            for (const p of productList) {
                const pName = (p.name || '').trim().toUpperCase();
                if (pName === target) return p;
            }

            // Pemetaan kode standar: TG, TB, TK, OMEGA
            if (target === 'TG' || target.includes('MEDIUM') || target.includes('GEMUK')) {
                const found = productList.find(p => {
                    const n = p.name.toUpperCase();
                    return n === 'TG' || n.includes('TG') || n.includes('MEDIUM') || n.includes('GEMUK');
                });
                if (found) return found;
            }
            if (target === 'TB' || target.includes('SUPER') || target.includes('BESAR')) {
                const found = productList.find(p => {
                    const n = p.name.toUpperCase();
                    return n === 'TB' || n.includes('TB') || n.includes('SUPER') || n.includes('BESAR');
                });
                if (found) return found;
            }
            if (target === 'TK' || target.includes('KAMPONG') || target.includes('KECIL')) {
                const found = productList.find(p => {
                    const n = p.name.toUpperCase();
                    return n === 'TK' || n.includes('TK') || n.includes('KAMPONG') || n.includes('KECIL');
                });
                if (found) return found;
            }
            if (target === 'OMEGA' || target === 'OMG') {
                const found = productList.find(p => {
                    const n = p.name.toUpperCase();
                    return n === 'OMEGA' || n.includes('OMEGA') || n.includes('OMG');
                });
                if (found) return found;
            }

            return productList[0];
        }

        let importedCount = 0;
        const now = Date.now();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rawCustName = (row.customer_name || 'Customer Umum').trim();
            const custKey = rawCustName.toLowerCase().replace(/\s+/g, ' ');

            // Customer lookup / auto create
            let customerId = customerMap.get(custKey);
            if (!customerId) {
                const randomPhone = `08${Math.floor(1000000000 + Math.random() * 9000000000)}`;
                const newCustRes = await client.query(
                    `INSERT INTO customers (name, phone, address) 
                     VALUES ($1, $2, 'Dibuat otomatis via Import Excel') 
                     RETURNING id`,
                    [rawCustName, randomPhone]
                );
                customerId = newCustRes.rows[0].id;
                customerMap.set(custKey, customerId);
            }

            // Product lookup / fallback
            let product = resolveProduct(row.ket || row.product_code);
            if (!product) {
                const defaultProdName = row.ket ? String(row.ket).toUpperCase() : 'TG';
                const newProdRes = await client.query(
                    `INSERT INTO products (name, unit, current_stock, price_per_unit) 
                     VALUES ($1, 'krat', 0, $2) RETURNING id, name, current_stock, price_per_unit`,
                    [defaultProdName, Number(row.harga) || 0]
                );
                product = newProdRes.rows[0];
                productList.push(product);
            }

            const qty = Math.max(0, parseFloat(row.penjualan || row.quantity || 0));
            if (qty <= 0) continue; // Lewati jika tidak ada jumlah penjualan

            const unitPrice = parseFloat(row.harga || row.unit_price || product.price_per_unit || 0);
            const totalAmount = parseFloat(row.total || row.total_amount || (qty * unitPrice));
            const topStatus = String(row.top || 'LUNAS').trim().toUpperCase();
            const isLunas = (topStatus === 'LUNAS');
            const amountPaid = isLunas ? totalAmount : Math.max(0, parseFloat(row.pembayaran || row.amount_paid || 0));
            const paymentType = isLunas ? 'CASH' : 'CREDIT';
            const invoiceStatus = isLunas ? 'LUNAS' : 'GANTUNG';
            const cekMethod = (row.cek && String(row.cek).trim() !== '-') ? String(row.cek).trim() : (isLunas ? 'Setor' : '-');
            const transferDate = (row.transfer && /^\d{4}-\d{2}-\d{2}$/.test(String(row.transfer).trim())) ? String(row.transfer).trim() : null;

            // Tanggal order
            const orderDateStr = (row.order_date && /^\d{4}-\d{2}-\d{2}$/.test(String(row.order_date).trim())) 
                ? String(row.order_date).trim() 
                : new Date().toISOString().split('T')[0];
            const orderTimestamp = `${orderDateStr} 12:00:00`;

            const orderNum = `ORD-IMP-${now}-${i + 1}`;

            // 1. Insert order
            const orderRes = await client.query(
                `INSERT INTO orders (order_number, customer_id, total_amount, status, created_by, created_at)
                 VALUES ($1, $2, $3, 'CONFIRMED', 'Import Excel', $4)
                 RETURNING id`,
                [orderNum, customerId, totalAmount, orderTimestamp]
            );
            const orderId = orderRes.rows[0].id;

            // 2. Insert order item
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [orderId, product.id, qty, unitPrice, totalAmount]
            );

            // 3. Update stock (diizinkan minus)
            const currentStockNum = parseFloat(product.current_stock || 0);
            const newStock = currentStockNum - qty;
            product.current_stock = newStock;
            await client.query(
                `UPDATE products SET current_stock = $1 WHERE id = $2`,
                [newStock, product.id]
            );

            // 4. Catat stock movement
            await client.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, reference_id, notes, created_at)
                 VALUES ($1, 'PENJUALAN', $2, $3, $4, $5, $6)`,
                [product.id, qty, newStock, orderNum, `Penjualan Import Excel: ${rawCustName}`, orderTimestamp]
            );

            // 5. Insert invoice
            const invNum = `INV-IMP-${now}-${i + 1}`;
            const invRes = await client.query(
                `INSERT INTO invoices (invoice_number, order_id, customer_id, payment_type, amount_due, amount_paid, status, transfer_date, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [invNum, orderId, customerId, paymentType, totalAmount, amountPaid, invoiceStatus, transferDate, orderTimestamp]
            );
            const invoiceId = invRes.rows[0].id;

            // 6. Insert payment jika lunas atau ada pembayaran
            if (amountPaid > 0 || isLunas) {
                const payNum = `PAY-IMP-${now}-${i + 1}`;
                await client.query(
                    `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at, created_at)
                     VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)`,
                    [payNum, invoiceId, customerId, amountPaid, cekMethod, orderTimestamp, orderTimestamp]
                );
            }

            importedCount++;
        }

        // 7. Kalibrasi ulang semua produk yang terkena dampak import penjualan secara kronologis
        const uniqueProductIds = Array.from(new Set(productList.map(p => p.id)));
        for (const pid of uniqueProductIds) {
            await recalibrateProductStock(client, pid);
        }

        await client.query('COMMIT');
        return res.status(201).json({
            message: `Berhasil mengimpor ${importedCount} data transaksi penjualan harian!`,
            imported_count: importedCount
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error importing daily sales:', err);
        return res.status(500).json({ error: `Gagal mengimpor data: ${err.message}` });
    } finally {
        client.release();
    }
}

module.exports = {
    createOrder,
    deleteOrderById,
    importDailySales
};

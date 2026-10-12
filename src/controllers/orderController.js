const db = require('../config/db');
const googleCalendarService = require('../services/googleCalendarService');

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
        const orderRes = await client.query(
            `INSERT INTO orders (order_number, customer_id, total_amount, status)
             VALUES ($1, $2, $3, 'CONFIRMED')
             RETURNING *`,
            [orderNum, customer_id, totalAmount]
        );
        const order = orderRes.rows[0];

        // 4. Create Order Items & Update Stock + Stock Movement
        for (const pItem of processedItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [order.id, pItem.product_id, pItem.quantity, pItem.unit_price, pItem.subtotal]
            );

            // Deduct stock
            const newStock = pItem.current_stock - pItem.quantity;
            await client.query(
                `UPDATE products SET current_stock = $1 WHERE id = $2`,
                [newStock, pItem.product_id]
            );

            // Log movement
            await client.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, reference_id, notes)
                 VALUES ($1, 'PENJUALAN', $2, $3, $4, $5)`,
                [pItem.product_id, pItem.quantity, newStock, orderNum, `Penjualan Nota ${orderNum}`]
            );
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
            `INSERT INTO invoices (invoice_number, order_id, customer_id, payment_type, amount_due, amount_paid, status, due_date, google_calendar_event_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [invoiceNum, order.id, customer_id, normalizedPaymentType, totalAmount, initialPaid, invoiceStatus, due_date || null, googleCalEventId]
        );

        // Jika transaksi langsung LUNAS, otomatis catat payment validated agar masuk ke laporan setoran
        if (!isPending) {
            const payNum = `PAY-${Date.now()}`;
            await client.query(
                `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at)
                 VALUES ($1, $2, $3, $4, 'TRANSFER', TRUE, CURRENT_TIMESTAMP)`,
                [payNum, invoiceRes.rows[0].id, customer_id, totalAmount]
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

module.exports = {
    createOrder
};

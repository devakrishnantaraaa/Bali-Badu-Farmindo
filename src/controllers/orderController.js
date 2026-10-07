const db = require('../config/db');
const googleCalendarService = require('../services/googleCalendarService');

async function createOrder(req, res) {
    const client = await db.getClient();
    try {
        const { customer_id, items, payment_type, due_date } = req.body;

        if (!customer_id || !items || !Array.isArray(items) || items.length === 0 || !payment_type) {
            return res.status(400).json({ error: 'Customer ID, items array, and payment_type are required' });
        }

        if (payment_type === 'CREDIT' && !due_date) {
            return res.status(400).json({ error: 'Due date is strictly required for CREDIT (Gantung Nota) orders' });
        }

        await client.query('BEGIN');

        // -------------------------------------------------------------
        // STRICT RULE #3: Check if customer has active "Gantung Nota"
        // -------------------------------------------------------------
        const unpaidCheck = await client.query(
            `SELECT invoice_number, amount_due - amount_paid AS remaining 
             FROM invoices 
             WHERE customer_id = $1 AND status = 'GANTUNG' 
             LIMIT 1`,
            [customer_id]
        );

        if (unpaidCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                error: 'BLOCK_ORDER_UNPAID_CREDIT',
                message: `Pembelian ditolak! Customer masih memiliki nota gantung (${unpaidCheck.rows[0].invoice_number}) sebesar Rp ${unpaidCheck.rows[0].remaining}. Pelunasan / validasi setoran diperlukan!`
            });
        }

        // 1. Validate customer existence
        const customerRes = await client.query('SELECT name FROM customers WHERE id = $1', [customer_id]);
        if (customerRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer not found' });
        }
        const customerName = customerRes.rows[0].name;

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
        const invoiceStatus = payment_type === 'CREDIT' ? 'GANTUNG' : 'LUNAS';
        const initialPaid = payment_type === 'CREDIT' ? 0.00 : totalAmount;

        let googleCalEventId = null;
        if (payment_type === 'CREDIT') {
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
            [invoiceNum, order.id, customer_id, payment_type, totalAmount, initialPaid, invoiceStatus, due_date || null, googleCalEventId]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            message: 'Order created successfully',
            order: order,
            invoice: invoiceRes.rows[0]
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

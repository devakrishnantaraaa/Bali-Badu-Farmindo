const db = require('../config/db');

// Submit Payment / Setoran for an Invoice
async function submitPayment(req, res) {
    try {
        const { invoice_id, amount, payment_method, reference_number } = req.body;

        if (!invoice_id || !amount || amount <= 0 || !payment_method) {
            return res.status(400).json({ error: 'Invoice ID, valid positive amount, and payment method required' });
        }

        const invoiceRes = await db.query('SELECT * FROM invoices WHERE id = $1', [invoice_id]);
        if (invoiceRes.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const invoice = invoiceRes.rows[0];

        const payNum = `PAY-${Date.now()}`;
        const paymentRes = await db.query(
            `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, reference_number, is_validated)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE)
             RETURNING *`,
            [payNum, invoice.id, invoice.customer_id, amount, payment_method, reference_number || null]
        );

        return res.status(201).json({
            message: 'Setoran/Pembayaran berhasil didaftarkan. Menunggu validasi Admin.',
            payment: paymentRes.rows[0]
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Admin Validates Payment -> Updates Invoice to LUNAS & Unlocks Customer
async function validatePayment(req, res) {
    const client = await db.getClient();
    try {
        const { payment_id } = req.params;

        await client.query('BEGIN');

        // 1. Fetch payment
        const payRes = await client.query('SELECT * FROM payments WHERE id = $1 FOR UPDATE', [payment_id]);
        if (payRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment record not found' });
        }

        const payment = payRes.rows[0];
        if (payment.is_validated) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Payment is already validated' });
        }

        // 2. Update payment as validated
        await client.query(
            `UPDATE payments 
             SET is_validated = TRUE, validated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [payment_id]
        );

        // 3. Update invoice amount_paid & status
        const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [payment.invoice_id]);
        const invoice = invRes.rows[0];

        const newAmountPaid = parseFloat(invoice.amount_paid) + parseFloat(payment.amount);
        let newStatus = invoice.status;

        if (newAmountPaid >= parseFloat(invoice.amount_due)) {
            newStatus = 'LUNAS';
        }

        await client.query(
            `UPDATE invoices 
             SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $3`,
            [newAmountPaid, newStatus, invoice.id]
        );

        await client.query('COMMIT');

        return res.json({
            message: `Pembayaran berhasil divalidasi. Status Nota: ${newStatus}`,
            invoice_status: newStatus,
            amount_paid_total: newAmountPaid
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// List all pending setoran/payments for admin validation
async function getPendingPayments(req, res) {
    try {
        const queryText = `
            SELECT p.id AS payment_id, p.payment_number, p.amount, p.payment_method, p.reference_number, p.created_at,
                   i.invoice_number, i.amount_due, i.amount_paid, c.name AS customer_name
            FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            JOIN customers c ON p.customer_id = c.id
            WHERE p.is_validated = FALSE
            ORDER BY p.created_at ASC
        `;
        const result = await db.query(queryText);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    submitPayment,
    validatePayment,
    getPendingPayments
};

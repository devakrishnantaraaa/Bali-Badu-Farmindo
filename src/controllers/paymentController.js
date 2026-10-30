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

// Direct Validate Invoice (e.g., dari Rekap Penjualan Harian)
async function validateInvoiceDirectly(req, res) {
    const client = await db.getClient();
    try {
        const { invoice_id } = req.params;
        const { payment_method } = req.body; // CASH / TRANSFER

        await client.query('BEGIN');

        const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoice_id]);
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }
        const invoice = invRes.rows[0];

        const sisa = parseFloat(invoice.amount_due) - parseFloat(invoice.amount_paid);
        if (sisa <= 0 && invoice.status === 'LUNAS') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invoice ini sudah lunas sebelumnya.' });
        }

        const payNum = `PAY-${Date.now()}`;
        const method = payment_method || (invoice.payment_type === 'CREDIT' ? 'TRANSFER' : invoice.payment_type);

        // Record validated payment
        await client.query(
            `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at)
             VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP)`,
            [payNum, invoice.id, invoice.customer_id, sisa, method]
        );

        // Update invoice to LUNAS
        await client.query(
            `UPDATE invoices 
             SET amount_paid = amount_due, status = 'LUNAS', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [invoice.id]
        );

        await client.query('COMMIT');

        return res.json({
            message: `Invoice ${invoice.invoice_number} berhasil divalidasi LUNAS!`,
            invoice_id: invoice.id,
            status: 'LUNAS'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// Update Invoice Payment Fields Inline (TOP, CEK/METODE, TGL TRANSFER) dari Rekap Penjualan Harian
async function updateInvoiceFields(req, res) {
    const client = await db.getClient();
    try {
        const { invoice_id } = req.params;
        const { top_status, payment_method, transfer_date, notes } = req.body;

        await client.query('BEGIN');

        const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoice_id]);
        if (invRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }
        const invoice = invRes.rows[0];

        // 1. Update status TOP (LUNAS / GANTUNG / PENDING)
        if (top_status) {
            if (top_status === 'LUNAS') {
                await client.query(
                    `UPDATE invoices 
                     SET status = 'LUNAS', amount_paid = amount_due, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $1`,
                    [invoice.id]
                );
            } else if (top_status === 'PENDING' || top_status === 'GANTUNG') {
                await client.query(
                    `UPDATE invoices 
                     SET status = 'GANTUNG', amount_paid = 0, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $1`,
                    [invoice.id]
                );
            }
        }

        // 1b. Update transfer_date HANYA jika transfer_date memang dikirim oleh user
        if (transfer_date !== undefined) {
            const formattedTransferDate = transfer_date ? transfer_date : null;
            await client.query(
                `UPDATE invoices 
                 SET transfer_date = $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $2`,
                [formattedTransferDate, invoice.id]
            );
        }

        // 1c. Update catatan / notes (angka maupun huruf)
        if (notes !== undefined) {
            const cleanNotes = notes !== null ? String(notes) : '';
            await client.query(
                `UPDATE invoices 
                 SET notes = $1, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $2`,
                [cleanNotes, invoice.id]
            );
            if (invoice.order_id) {
                await client.query(
                    `UPDATE orders 
                     SET notes = $1 
                     WHERE id = $2`,
                    [cleanNotes, invoice.order_id]
                );
            }
        }

        // 2. Update atau catat pembayaran/metode (CEK: Transfer / Setor / OK / -)
        const existingPayment = await client.query(
            `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [invoice.id]
        );

        if (existingPayment.rows.length > 0) {
            const currentPayment = existingPayment.rows[0];
            const updates = [];
            const values = [];
            let idx = 1;

            // HANYA ubah payment_method (kolom CEK) jika payment_method dikirim secara eksplisit di body
            if (payment_method !== undefined && payment_method !== null) {
                const cleanMethod = (payment_method === '' || payment_method === '-') ? '-' : payment_method;
                updates.push(`payment_method = $${idx++}`);
                values.push(cleanMethod);
            }

            // HANYA ubah tanggal pada payment jika transfer_date dikirim di body
            if (transfer_date !== undefined) {
                const targetDate = transfer_date ? new Date(transfer_date) : invoice.created_at;
                updates.push(`created_at = $${idx++}`);
                values.push(targetDate);
            }

            if (updates.length > 0) {
                updates.push(`is_validated = TRUE`);
                values.push(currentPayment.id);
                await client.query(
                    `UPDATE payments 
                     SET ${updates.join(', ')} 
                     WHERE id = $${idx}`,
                    values
                );
            }
        } else if (top_status === 'LUNAS' || (payment_method !== undefined && payment_method !== null && payment_method !== '' && payment_method !== '-')) {
            const payNum = `PAY-${Date.now()}`;
            const pDate = transfer_date ? new Date(transfer_date) : (invoice.transfer_date ? new Date(invoice.transfer_date) : invoice.created_at);
            const finalMethod = (payment_method !== undefined && payment_method !== null && payment_method !== '' && payment_method !== '-')
                ? payment_method
                : '-';

            await client.query(
                `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, $6)`,
                [payNum, invoice.id, invoice.customer_id, invoice.amount_due, finalMethod, pDate]
            );
        }

        await client.query('COMMIT');

        return res.json({
            message: `Data pembayaran invoice ${invoice.invoice_number} berhasil diperbarui!`,
            invoice_id: invoice.id
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// Bulk Update Setoran (Ubah CEK ke Setor & set transfer_date untuk banyak nota sekaligus)
async function bulkUpdateDeposits(req, res) {
    const client = await db.getClient();
    try {
        const { invoice_ids, payment_method = 'Setor', transfer_date } = req.body;

        if (!Array.isArray(invoice_ids) || invoice_ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada nota yang dipilih.' });
        }

        const targetTransferDate = transfer_date ? transfer_date : new Date().toISOString().split('T')[0];
        const cleanMethod = (payment_method && payment_method.trim()) ? payment_method.trim() : 'Setor';

        await client.query('BEGIN');

        // 1. Update transfer_date pada invoices
        await client.query(
            `UPDATE invoices 
             SET transfer_date = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ANY($2::int[])`,
            [targetTransferDate, invoice_ids]
        );

        // 2. Update existing payments for these invoices (ubah payment_method ke 'Setor' & update tanggal)
        await client.query(
            `UPDATE payments 
             SET payment_method = $1, created_at = $2, is_validated = TRUE 
             WHERE invoice_id = ANY($3::int[])`,
            [cleanMethod, new Date(targetTransferDate), invoice_ids]
        );

        // 3. Jaga-jaga jika ada invoice terpilih yang belum punya row di payments
        const unpaidInvoices = await client.query(
            `SELECT i.id, i.customer_id, i.amount_due 
             FROM invoices i 
             WHERE i.id = ANY($1::int[]) 
               AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)`,
            [invoice_ids]
        );

        for (const row of unpaidInvoices.rows) {
            const payNum = `PAY-${Date.now()}-${row.id}`;
            await client.query(
                `INSERT INTO payments (payment_number, invoice_id, customer_id, amount, payment_method, is_validated, validated_at, created_at)
                 VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, $6)`,
                [payNum, row.id, row.customer_id, row.amount_due, cleanMethod, new Date(targetTransferDate)]
            );
        }

        await client.query('COMMIT');

        return res.json({
            message: `Berhasil mengubah ${invoice_ids.length} transaksi menjadi "${cleanMethod}" dengan tanggal transfer ${targetTransferDate}!`,
            updated_count: invoice_ids.length
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

module.exports = {
    submitPayment,
    validatePayment,
    getPendingPayments,
    validateInvoiceDirectly,
    updateInvoiceFields,
    bulkUpdateDeposits
};

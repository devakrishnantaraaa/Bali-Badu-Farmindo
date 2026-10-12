const db = require('../config/db');

async function getCustomers(req, res) {
    try {
        const result = await db.query('SELECT * FROM customers ORDER BY name ASC');
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function createCustomer(req, res) {
    try {
        const { name, phone, address, payment_terms } = req.body;
        const cleanPhone = (phone && phone.trim() !== '') ? phone.trim() : null;
        if (!name || !cleanPhone) {
            return res.status(400).json({ error: 'Nama customer dan nomor HP/WhatsApp wajib diisi' });
        }

        const cleanTerms = payment_terms || 'REGULER';
        let result;
        try {
            // Attempt insert with payment_terms column
            result = await db.query(
                'INSERT INTO customers (name, phone, address, payment_terms) VALUES ($1, $2, $3, $4) RETURNING *',
                [name.trim(), cleanPhone, address || null, cleanTerms]
            );
        } catch (colErr) {
            // If payment_terms column doesn't exist yet, add it automatically
            if (colErr.code === '42703') { // undefined_column
                await db.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'REGULER'");
                result = await db.query(
                    'INSERT INTO customers (name, phone, address, payment_terms) VALUES ($1, $2, $3, $4) RETURNING *',
                    [name.trim(), cleanPhone, address || null, cleanTerms]
                );
            } else {
                throw colErr;
            }
        }
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ 
                error: `Nomor HP/WhatsApp "${req.body.phone}" sudah terdaftar untuk customer lain! Silakan gunakan nomor HP yang berbeda atau nomor unik.` 
            });
        }
        return res.status(500).json({ error: error.message });
    }
}

async function updateCustomer(req, res) {
    try {
        const { id } = req.params;
        const { name, phone, address, payment_terms } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nama customer wajib diisi' });
        }

        const cleanPhone = (phone && phone.trim() !== '') ? phone.trim() : null;
        const cleanTerms = payment_terms || 'REGULER';

        const result = await db.query(
            `UPDATE customers 
             SET name = $1, phone = $2, address = $3, payment_terms = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [name.trim(), cleanPhone, address || null, cleanTerms, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer tidak ditemukan' });
        }

        return res.json({
            message: 'Data customer berhasil diperbarui!',
            customer: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({
                error: `Nomor HP/WhatsApp "${req.body.phone}" sudah terdaftar untuk customer lain!`
            });
        }
        return res.status(500).json({ error: error.message });
    }
}

async function deleteCustomer(req, res) {
    try {
        const { id } = req.params;

        // Cek apakah customer memiliki riwayat order
        const orderCheck = await db.query('SELECT COUNT(*) FROM orders WHERE customer_id = $1', [id]);
        if (parseInt(orderCheck.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Customer tidak dapat dihapus karena sudah memiliki riwayat transaksi/nota penjualan. Anda dapat mengubah nama/kontaknya jika diperlukan.'
            });
        }

        const result = await db.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer tidak ditemukan' });
        }

        return res.json({
            message: `Customer "${result.rows[0].name}" berhasil dihapus dari sistem!`,
            deletedCustomer: result.rows[0]
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer
};


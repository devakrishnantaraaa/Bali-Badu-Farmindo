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
        const { name, phone, address } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ error: 'Customer name and phone number required' });
        }

        const result = await db.query(
            'INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3) RETURNING *',
            [name, phone, address || null]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getCustomers,
    createCustomer
};

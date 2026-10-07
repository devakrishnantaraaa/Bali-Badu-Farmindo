const db = require('../config/db');

// Daily Sales Report
async function getDailySales(req, res) {
    try {
        const { date } = req.query; // YYYY-MM-DD (defaults to TODAY)
        const targetDate = date || new Date().toISOString().split('T')[0];

        const queryText = `
            SELECT 
                o.id AS order_id, 
                o.order_number, 
                c.name AS customer_name, 
                o.total_amount, 
                i.payment_type, 
                i.status AS invoice_status, 
                o.created_at
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN invoices i ON o.id = i.order_id
            WHERE o.status = 'CONFIRMED' 
              AND DATE(o.created_at AT TIME ZONE 'UTC') = $1
            ORDER BY o.created_at DESC
        `;
        
        const summaryText = `
            SELECT 
                COUNT(o.id) AS total_orders, 
                COALESCE(SUM(o.total_amount), 0) AS total_revenue
            FROM orders o
            WHERE o.status = 'CONFIRMED' 
              AND DATE(o.created_at AT TIME ZONE 'UTC') = $1
        `;

        const [ordersRes, summaryRes] = await Promise.all([
            db.query(queryText, [targetDate]),
            db.query(summaryText, [targetDate])
        ]);

        return res.json({
            date: targetDate,
            summary: summaryRes.rows[0],
            orders: ordersRes.rows
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Monthly Sales Recap
async function getMonthlyRecap(req, res) {
    try {
        const queryText = `
            SELECT 
                DATE_TRUNC('day', o.created_at) AS date,
                COUNT(o.id) AS total_orders,
                SUM(o.total_amount) AS daily_revenue
            FROM orders o
            WHERE o.status = 'CONFIRMED'
              AND o.created_at >= DATE_TRUNC('month', CURRENT_DATE)
              AND o.created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
            GROUP BY 1
            ORDER BY 1 ASC
        `;
        const result = await db.query(queryText);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Outstanding Debt List (Daftar Gantung Nota)
async function getOutstandingDebts(req, res) {
    try {
        const queryText = `
            SELECT 
                i.id AS invoice_id,
                i.invoice_number,
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone,
                i.amount_due,
                i.amount_paid,
                (i.amount_due - i.amount_paid) AS remaining_debt,
                i.due_date,
                i.google_calendar_event_id,
                CASE 
                    WHEN i.due_date < CURRENT_DATE THEN 'OVERDUE'
                    WHEN i.due_date = CURRENT_DATE THEN 'DUE_TODAY'
                    ELSE 'PENDING'
                END AS debt_status
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.status = 'GANTUNG'
            ORDER BY i.due_date ASC
        `;
        const result = await db.query(queryText);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getDailySales,
    getMonthlyRecap,
    getOutstandingDebts
};

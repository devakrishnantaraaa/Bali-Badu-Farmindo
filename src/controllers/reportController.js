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

// Rekap Setoran Harian (Gambar 2: Customer, Nominal, Metode, Cek/Setor, Tanggal Transfer)
async function getDailyDeposits(req, res) {
    try {
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const queryText = `
            SELECT 
                p.id AS payment_id,
                p.payment_number,
                c.name AS customer_name,
                i.invoice_number,
                p.amount,
                p.payment_method,
                p.reference_number,
                p.is_validated,
                p.validated_at,
                p.created_at
            FROM payments p
            JOIN customers c ON p.customer_id = c.id
            JOIN invoices i ON p.invoice_id = i.id
            WHERE DATE(p.created_at AT TIME ZONE 'UTC') = $1
            ORDER BY p.created_at DESC
        `;
        const result = await db.query(queryText, [targetDate]);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Monthly Sales Recap (Gambar 3: Tanggal, Total Penjualan, Total Lunas, Total Pending, Total Krat)
async function getMonthlyRecap(req, res) {
    try {
        const { month, year } = req.query;
        const currentYear = year || new Date().getFullYear();
        const currentMonth = month || (new Date().getMonth() + 1);

        const queryText = `
            SELECT 
                DATE(o.created_at) AS date_label,
                COALESCE(SUM(o.total_amount), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN i.status = 'LUNAS' THEN o.total_amount ELSE i.amount_paid END), 0) AS total_lunas,
                COALESCE(SUM(CASE WHEN i.status = 'GANTUNG' THEN (i.amount_due - i.amount_paid) ELSE 0 END), 0) AS total_pending,
                COALESCE(SUM(oi.quantity), 0) AS total_krat
            FROM orders o
            JOIN invoices i ON o.id = i.order_id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE EXTRACT(MONTH FROM o.created_at) = $1 
              AND EXTRACT(YEAR FROM o.created_at) = $2
            GROUP BY DATE(o.created_at)
            ORDER BY DATE(o.created_at) ASC
        `;
        const result = await db.query(queryText, [currentMonth, currentYear]);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Outstanding Debt List & Pending Invoices Grouped By Customer (Gambar 4)
async function getOutstandingDebts(req, res) {
    try {
        const queryText = `
            SELECT 
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone,
                COALESCE(SUM(i.amount_due - i.amount_paid), 0) AS total_remaining_debt,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'invoice_id', i.id,
                        'invoice_number', i.invoice_number,
                        'amount_due', i.amount_due,
                        'amount_paid', i.amount_paid,
                        'remaining_debt', (i.amount_due - i.amount_paid),
                        'due_date', i.due_date,
                        'created_at', i.created_at,
                        'debt_status', CASE 
                            WHEN i.due_date < CURRENT_DATE THEN 'OVERDUE'
                            WHEN i.due_date = CURRENT_DATE THEN 'DUE_TODAY'
                            ELSE 'PENDING'
                        END
                    ) ORDER BY i.due_date ASC
                ) AS invoices_list
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.status = 'GANTUNG'
            GROUP BY c.id, c.name, c.phone
            ORDER BY total_remaining_debt DESC
        `;
        const result = await db.query(queryText);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getDailySales,
    getDailyDeposits,
    getMonthlyRecap,
    getOutstandingDebts
};

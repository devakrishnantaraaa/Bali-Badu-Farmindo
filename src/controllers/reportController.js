const db = require('../config/db');

// Daily Sales Report (Per Tanggal, Rentang Periode, atau Filter Customer)
async function getDailySales(req, res) {
    try {
        const { date, start_date, end_date, customer_id } = req.query; // YYYY-MM-DD
        let whereClause = "WHERE o.status = 'CONFIRMED'";
        let queryParams = [];

        if (customer_id && customer_id !== 'ALL') {
            queryParams.push(customer_id);
            whereClause += ` AND o.customer_id = $${queryParams.length}`;
        }

        if (start_date && end_date) {
            queryParams.push(start_date, end_date);
            whereClause += ` AND DATE(o.created_at) >= $${queryParams.length - 1} AND DATE(o.created_at) <= $${queryParams.length}`;
        } else if (start_date) {
            queryParams.push(start_date);
            whereClause += ` AND DATE(o.created_at) >= $${queryParams.length}`;
        } else if (end_date) {
            queryParams.push(end_date);
            whereClause += ` AND DATE(o.created_at) <= $${queryParams.length}`;
        } else if (date && date !== 'ALL') {
            queryParams.push(date);
            whereClause += ` AND DATE(o.created_at) = $${queryParams.length}`;
        }
        // Jika tidak ada filter tanggal / kosong, semua penjualan ditampilkan tanpa filter tanggal

        const queryText = `
            SELECT 
                o.id AS order_id, 
                o.order_number, 
                i.id AS invoice_id,
                i.invoice_number,
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.address AS customer_address, 
                o.total_amount, 
                i.payment_type, 
                i.status AS invoice_status, 
                i.amount_due,
                i.amount_paid,
                (i.amount_due - i.amount_paid) AS sisa_pembayaran,
                o.created_at,
                COALESCE(oi.quantity, 0) AS penjualan_qty,
                COALESCE(oi.unit_price, 0) AS harga_satuan,
                COALESCE(p.name, 'Telur') AS product_name,
                COALESCE(p.unit, 'kg') AS product_unit,
                i.transfer_date,
                COALESCE(i.notes, o.notes, '') AS notes,
                p2.payment_method AS last_payment_method,
                p2.created_at AS last_payment_date
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            JOIN invoices i ON o.id = i.order_id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            LEFT JOIN LATERAL (
                SELECT payment_method, created_at
                FROM payments
                WHERE invoice_id = i.id
                ORDER BY created_at DESC LIMIT 1
            ) p2 ON TRUE
            ${whereClause}
            ORDER BY o.created_at ASC, o.id ASC
        `;
        
        const result = await db.query(queryText, queryParams);

        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Rekap Setoran Harian (Hanya memunculkan transaksi yang status CEK nya OK, tanggal berapapun itu)
async function getDailyDeposits(req, res) {
    try {
        const queryText = `
            SELECT 
                p.id AS payment_id,
                p.payment_number,
                c.name AS customer_name,
                i.id AS invoice_id,
                i.invoice_number,
                p.amount AS setoran_amount,
                p.payment_method,
                p.reference_number,
                p.is_validated,
                p.validated_at,
                i.transfer_date,
                p.created_at AS payment_created_at,
                COALESCE(i.transfer_date, p.created_at) AS tgl_transfer,
                o.created_at AS tgl_nota,
                o.total_amount AS total_nota,
                i.status AS invoice_status,
                i.amount_due,
                i.amount_paid,
                (i.amount_due - i.amount_paid) AS sisa_pembayaran,
                COALESCE(oi.quantity, 0) AS penjualan_qty,
                COALESCE(oi.unit_price, 0) AS harga_satuan,
                COALESCE(prod.name, 'Telur') AS product_name
            FROM payments p
            JOIN customers c ON p.customer_id = c.id
            JOIN invoices i ON p.invoice_id = i.id
            JOIN orders o ON i.order_id = o.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products prod ON oi.product_id = prod.id
            WHERE UPPER(TRIM(COALESCE(p.payment_method, ''))) = 'OK'
            ORDER BY COALESCE(i.transfer_date, p.created_at) ASC, p.id ASC
        `;
        const result = await db.query(queryText);
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Monthly Sales Recap (Gambar 3: Row Labels, Penjualan., Lunas, Pending, /Krat)
async function getMonthlyRecap(req, res) {
    try {
        const { month, year } = req.query;
        let whereClause = "WHERE o.status = 'CONFIRMED'";
        let queryParams = [];

        const hasSpecificMonth = month && month !== 'ALL';
        const hasSpecificYear = year && year !== 'ALL';

        if (hasSpecificMonth && hasSpecificYear) {
            whereClause += " AND EXTRACT(MONTH FROM o.created_at) = $1 AND EXTRACT(YEAR FROM o.created_at) = $2";
            queryParams.push(Number(month), Number(year));
        } else if (hasSpecificMonth) {
            whereClause += " AND EXTRACT(MONTH FROM o.created_at) = $1";
            queryParams.push(Number(month));
        } else if (hasSpecificYear) {
            whereClause += " AND EXTRACT(YEAR FROM o.created_at) = $1";
            queryParams.push(Number(year));
        }

        const queryText = `
            SELECT 
                DATE(o.created_at) AS date_raw,
                TO_CHAR(o.created_at, 'DD/MM/YYYY') AS date_label,
                COALESCE(SUM(o.total_amount), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN i.status = 'LUNAS' THEN o.total_amount ELSE i.amount_paid END), 0) AS total_lunas,
                COALESCE(SUM(CASE WHEN i.status = 'GANTUNG' THEN (i.amount_due - i.amount_paid) ELSE 0 END), 0) AS total_pending,
                COALESCE(SUM(oi.quantity), 0) AS total_krat
            FROM orders o
            JOIN invoices i ON o.id = i.order_id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClause}
            GROUP BY DATE(o.created_at), TO_CHAR(o.created_at, 'DD/MM/YYYY')
            ORDER BY DATE(o.created_at) ASC
        `;
        const result = await db.query(queryText, queryParams);

        // Jika bulan dan tahun spesifik dipilih, tampilkan kalender 1 bulan penuh (misal 1 - 31 Okt 2027)
        if (hasSpecificMonth && hasSpecificYear) {
            const targetMonth = Number(month);
            const targetYear = Number(year);
            const totalDaysInMonth = new Date(targetYear, targetMonth, 0).getDate();
            const daysMap = {};

            result.rows.forEach(r => {
                let key = r.date_label;
                if (!key && r.date_raw) {
                    const dt = new Date(r.date_raw);
                    const dd = String(dt.getDate()).padStart(2, '0');
                    const mm = String(dt.getMonth() + 1).padStart(2, '0');
                    const yyyy = dt.getFullYear();
                    key = `${dd}/${mm}/${yyyy}`;
                }
                if (key) daysMap[key] = r;
            });

            const fullMonthlyRows = [];
            for (let day = 1; day <= totalDaysInMonth; day++) {
                const dd = String(day).padStart(2, '0');
                const mm = String(targetMonth).padStart(2, '0');
                const dateLabel = `${dd}/${mm}/${targetYear}`;
                const dateRaw = `${targetYear}-${mm}-${dd}`;

                if (daysMap[dateLabel]) {
                    fullMonthlyRows.push({
                        ...daysMap[dateLabel],
                        has_transaction: true
                    });
                } else {
                    fullMonthlyRows.push({
                        date_raw: dateRaw,
                        date_label: dateLabel,
                        total_sales: 0,
                        total_lunas: 0,
                        total_pending: 0,
                        total_krat: 0,
                        has_transaction: false
                    });
                }
            }
            return res.json(fullMonthlyRows);
        }

        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Outstanding Debt List & Pending Invoices Grouped By Customer (Gambar 4)
async function getOutstandingDebts(req, res) {
    try {
        let queryText = `
            SELECT 
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone,
                c.payment_terms,
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
            GROUP BY c.id, c.name, c.phone, c.payment_terms
            ORDER BY total_remaining_debt DESC
        `;
        let result;
        try {
            result = await db.query(queryText);
        } catch (colErr) {
            // fallback if payment_terms column not present yet
            const fallbackQuery = `
                SELECT 
                    c.id AS customer_id,
                    c.name AS customer_name,
                    c.phone,
                    'REGULER' AS payment_terms,
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
            result = await db.query(fallbackQuery);
        }
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Global Inventory & Valuation Report (Semua Produk, Mutasi & Nilai Aset)
async function getGlobalInventoryReport(req, res) {
    try {
        const { month, year } = req.query;

        // Ambil semua produk
        const productsRes = await db.query('SELECT * FROM products ORDER BY id ASC');
        const products = productsRes.rows;

        // Ambil semua pergerakan stok urut kronologis
        const movQuery = `
            SELECT sm.product_id, sm.movement_type, sm.quantity, 
                   COALESCE(sm.damaged_qty, 0) AS damaged_qty, 
                   sm.physical_stock, 
                   COALESCE(sm.adjustment_qty, 0) AS adjustment_qty, 
                   sm.balance_after, sm.created_at, sm.price
            FROM stock_movements sm
            ORDER BY sm.created_at ASC, sm.id ASC
        `;
        const movRes = await db.query(movQuery);
        const movements = movRes.rows;

        const hasFilter = (month && month !== 'ALL') || (year && year !== 'ALL');
        const targetMonth = month && month !== 'ALL' ? parseInt(month, 10) : null;
        const targetYear = year && year !== 'ALL' ? parseInt(year, 10) : null;

        const report = products.map(p => {
            const prodMovs = movements.filter(m => m.product_id === p.id);

            let initialStock = 0;
            let inQty = 0;
            let outQty = 0;
            let damagedQty = 0;
            let adjQty = 0;
            let finalStock = parseFloat(p.current_stock || 0);

            if (hasFilter) {
                let lastSeenBalance = 0;
                let foundInPeriod = false;

                prodMovs.forEach(m => {
                    const dt = new Date(m.created_at);
                    const mMonth = dt.getMonth() + 1;
                    const mYear = dt.getFullYear();

                    let isBefore = false;
                    if (targetYear !== null && mYear < targetYear) {
                        isBefore = true;
                    } else if ((targetYear === null || mYear === targetYear) && targetMonth !== null && mMonth < targetMonth) {
                        isBefore = true;
                    }

                    const inPeriod = (targetYear === null || mYear === targetYear) && (targetMonth === null || mMonth === targetMonth);

                    if (isBefore) {
                        initialStock = parseFloat(m.balance_after || 0);
                        lastSeenBalance = initialStock;
                    } else if (inPeriod) {
                        foundInPeriod = true;
                        const q = parseFloat(m.quantity || 0);
                        if (m.movement_type === 'BARANG_MASUK') inQty += q;
                        if (m.movement_type === 'PENJUALAN') outQty += q;
                        damagedQty += parseFloat(m.damaged_qty || 0);
                        adjQty += parseFloat(m.adjustment_qty || 0);
                        lastSeenBalance = parseFloat(m.balance_after || 0);
                    }
                });

                finalStock = foundInPeriod ? lastSeenBalance : initialStock;
            } else {
                prodMovs.forEach(m => {
                    const q = parseFloat(m.quantity || 0);
                    if (m.movement_type === 'BARANG_MASUK') inQty += q;
                    if (m.movement_type === 'PENJUALAN') outQty += q;
                    damagedQty += parseFloat(m.damaged_qty || 0);
                    adjQty += parseFloat(m.adjustment_qty || 0);
                });
                finalStock = parseFloat(p.current_stock || 0);
                initialStock = 0;
            }

            const unitPrice = parseFloat(p.price_per_unit || 0);
            const assetValue = finalStock * unitPrice;

            return {
                id: p.id,
                product_id: p.id,
                name: p.name,
                product_name: p.name,
                unit: p.unit || 'krat',
                unit_price: unitPrice,
                price_per_unit: unitPrice,
                initial_stock: initialStock,
                in_qty: inQty,
                out_qty: outQty,
                damaged_qty: damagedQty,
                adjustment_qty: adjQty,
                final_stock: finalStock,
                asset_value: assetValue,
                status: finalStock <= 10 ? 'KRITIS' : (finalStock <= 50 ? 'MENIPIS' : 'AMAN')
            };
        });

        return res.json(report);
    } catch (error) {
        console.error('Error getGlobalInventoryReport:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getDailySales,
    getDailyDeposits,
    getMonthlyRecap,
    getOutstandingDebts,
    getGlobalInventoryReport
};

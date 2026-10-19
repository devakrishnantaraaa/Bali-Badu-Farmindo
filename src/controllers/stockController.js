const db = require('../config/db');

// Add Incoming Goods (Barang Masuk)
async function recordIncomingGoods(req, res) {
    const client = await db.getClient();
    try {
        const { product_id, quantity, notes, incoming_date } = req.body;
        
        if (!product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Valid product_id and positive quantity required' });
        }

        await client.query('BEGIN');

        // 1. Update product stock
        const updateRes = await client.query(
            `UPDATE products 
             SET current_stock = current_stock + $1 
             WHERE id = $2 
             RETURNING current_stock`,
            [quantity, product_id]
        );

        if (updateRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        const balanceAfter = updateRes.rows[0].current_stock;

        // 2. Log stock movement
        let movementRes;
        if (incoming_date) {
            movementRes = await client.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
                 VALUES ($1, 'BARANG_MASUK', $2, $3, $4, $5)
                 RETURNING *`,
                [product_id, quantity, balanceAfter, notes || 'Penerimaan Barang Masuk', new Date(incoming_date)]
            );
        } else {
            movementRes = await client.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes)
                 VALUES ($1, 'BARANG_MASUK', $2, $3, $4)
                 RETURNING *`,
                [product_id, quantity, balanceAfter, notes || 'Penerimaan Barang Masuk']
            );
        }

        await client.query('COMMIT');
        return res.status(201).json({
            message: 'Barang Masuk recorded successfully',
            movement: movementRes.rows[0],
            new_stock: balanceAfter
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// Record Stock Adjustment (Penyesuaian, Rusak, & Stok Fisik)
async function recordStockAdjustment(req, res) {
    const client = await db.getClient();
    try {
        const { product_id, damaged_qty, physical_stock, adjustment_qty, notes } = req.body;
        
        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }

        await client.query('BEGIN');

        // Fetch current product stock
        const pRes = await client.query('SELECT current_stock FROM products WHERE id = $1 FOR UPDATE', [product_id]);
        if (pRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentStock = parseFloat(pRes.rows[0].current_stock);
        const damaged = damaged_qty ? parseFloat(damaged_qty) : 0;
        const adj = adjustment_qty ? parseFloat(adjustment_qty) : 0;
        
        // Target balance can be set by physical stock or adjustment math
        let balanceAfter = physical_stock !== undefined && physical_stock !== '' 
            ? parseFloat(physical_stock) 
            : currentStock - damaged + adj;

        if (balanceAfter < 0) balanceAfter = 0;

        // Update product stock
        await client.query('UPDATE products SET current_stock = $1 WHERE id = $2', [balanceAfter, product_id]);

        // Log movement with damaged_qty, physical_stock, adjustment_qty, and notes
        const movementRes = await client.query(
            `INSERT INTO stock_movements (product_id, movement_type, quantity, damaged_qty, physical_stock, adjustment_qty, balance_after, notes)
             VALUES ($1, 'PENYESUAIAN', $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [product_id, Math.abs(adj), damaged, balanceAfter, adj, balanceAfter, notes || 'Penyesuaian Stok Audit']
        );

        await client.query('COMMIT');
        return res.status(201).json({
            message: 'Stock adjustment saved successfully',
            movement: movementRes.rows[0],
            new_stock: balanceAfter
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// Get Kartu Stok Ledger
async function getStockLedger(req, res) {
    try {
        const { product_id } = req.query;

        // Auto-sync: Pastikan setiap produk yang ada di sistem tercatat stok awal (BARANG_MASUK)
        try {
            // 1. Cari produk yang BELUM memiliki mutasi BARANG_MASUK (Stok Awal)
            const productsWithoutInitialStock = await db.query(`
                SELECT p.id, p.name, p.current_stock, p.created_at 
                FROM products p
                WHERE NOT EXISTS (
                    SELECT 1 FROM stock_movements sm 
                    WHERE sm.product_id = p.id AND sm.movement_type = 'BARANG_MASUK'
                )
            `);

            for (const prod of productsWithoutInitialStock.rows) {
                // Hitung total kuantitas penjualan/keluar yang sudah tercatat
                const salesAgg = await db.query(`
                    SELECT 
                        COALESCE(SUM(quantity), 0) AS total_out,
                        MIN(created_at) AS earliest_movement_date
                    FROM stock_movements 
                    WHERE product_id = $1 AND movement_type = 'PENJUALAN'
                `, [prod.id]);

                const totalOut = parseFloat(salesAgg.rows[0]?.total_out) || 0;
                const currStock = parseFloat(prod.current_stock) || 0;
                const initialStock = currStock + totalOut;

                // Tentukan tanggal stok awal: sebelum transaksi penjualan pertama, atau tanggal produk dibuat
                const earliestDate = salesAgg.rows[0]?.earliest_movement_date;
                let initialDate;
                if (earliestDate) {
                    const d = new Date(earliestDate);
                    initialDate = new Date(d.getTime() - 5 * 60 * 1000); // 5 menit sebelum penjualan pertama
                } else {
                    initialDate = prod.created_at || new Date();
                }

                await db.query(`
                    INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
                    VALUES ($1, 'BARANG_MASUK', $2, $3, $4, $5)
                `, [
                    prod.id, 
                    initialStock, 
                    initialStock, 
                    '', 
                    initialDate
                ]);
            }

            // 2. Auto-sync pesanan penjualan (orders) yang belum tercatat di stock_movements
            const missingOrders = await db.query(`
                SELECT oi.product_id, oi.quantity, o.order_number, o.created_at
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE NOT EXISTS (
                    SELECT 1 FROM stock_movements sm 
                    WHERE sm.product_id = oi.product_id AND sm.reference_id = o.order_number
                )
            `);

            for (const mOrd of missingOrders.rows) {
                await db.query(`
                    INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, reference_id, notes, created_at)
                    VALUES ($1, 'PENJUALAN', $2, 0, $3, '', $4)
                `, [
                    mOrd.product_id,
                    parseFloat(mOrd.quantity) || 0,
                    mOrd.order_number,
                    mOrd.created_at || new Date()
                ]);
            }

            // 3. Kalibrasi ulang sisa stok (balance_after) per produk secara kronologis
            const allProducts = await db.query('SELECT id FROM products');
            for (const p of allProducts.rows) {
                const movs = await db.query(`
                    SELECT id, movement_type, quantity, 
                           COALESCE(damaged_qty, 0) AS damaged_qty, 
                           COALESCE(adjustment_qty, 0) AS adjustment_qty, 
                           balance_after
                    FROM stock_movements
                    WHERE product_id = $1
                    ORDER BY created_at ASC, id ASC
                `, [p.id]);

                let running = 0;
                for (const m of movs.rows) {
                    const q = parseFloat(m.quantity) || 0;
                    const dmg = parseFloat(m.damaged_qty) || 0;
                    const adj = parseFloat(m.adjustment_qty) || 0;

                    if (m.movement_type === 'BARANG_MASUK') {
                        running += q;
                    } else if (m.movement_type === 'PENJUALAN') {
                        running -= q;
                    }

                    if (dmg > 0) {
                        running -= dmg;
                    }
                    if (adj !== 0) {
                        running += adj;
                    }

                    if (parseFloat(m.balance_after) !== running) {
                        await db.query('UPDATE stock_movements SET balance_after = $1 WHERE id = $2', [running, m.id]);
                    }
                }
                // Pastikan current_stock di tabel products sinkron dengan mutasi akhir
                await db.query('UPDATE products SET current_stock = $1 WHERE id = $2', [running, p.id]);
            }

            // 4. Bersihkan teks otomatis bawaan agar kolom Keterangan bersih untuk diketik manual
            await db.query(`
                UPDATE stock_movements 
                SET notes = '' 
                WHERE notes = 'Stok Awal Sistem' 
                   OR notes = 'Stok Awal' 
                   OR notes LIKE 'Penjualan Nota%'
            `);
        } catch (syncErr) {
            console.warn('Notice (stock movements auto-sync):', syncErr.message);
        }

        let queryText = `
            SELECT sm.id, sm.created_at, p.name AS product_name, p.unit, p.price_per_unit, sm.movement_type, 
                   sm.quantity, 
                   COALESCE(sm.damaged_qty, 0) AS damaged_qty, 
                   sm.physical_stock, 
                   COALESCE(sm.adjustment_qty, 0) AS adjustment_qty,
                   sm.balance_after, sm.reference_id, sm.notes
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
        `;
        const params = [];

        if (product_id && product_id !== 'ALL' && product_id !== 'undefined' && product_id !== 'null') {
            queryText += ` WHERE sm.product_id = $1`;
            params.push(product_id);
        }

        queryText += ` ORDER BY sm.created_at ASC, sm.id ASC LIMIT 1000`;

        const result = await db.query(queryText, params);
        return res.json(result.rows);
    } catch (error) {
        console.error('Error getStockLedger:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Get All Products & Current Stock
async function getProducts(req, res) {
    try {
        const result = await db.query('SELECT * FROM products ORDER BY id ASC');
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Create New Product
async function createProduct(req, res) {
    const client = await db.getClient();
    try {
        const { name, unit, current_stock, stock_date, price_per_unit } = req.body;
        if (!name) return res.status(400).json({ error: 'Nama produk wajib diisi' });

        await client.query('BEGIN');

        const initialStock = parseFloat(current_stock || 0);

        const queryText = `
            INSERT INTO products (name, unit, current_stock, price_per_unit)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await client.query(queryText, [
            name,
            unit || 'krat',
            initialStock,
            price_per_unit || 0
        ]);

        const newProduct = result.rows[0];

        // Jika ada stok awal > 0, catat mutasi stok awal di stock_movements
        if (initialStock > 0) {
            const dateVal = stock_date ? new Date(stock_date) : new Date();
            await client.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
                 VALUES ($1, 'BARANG_MASUK', $2, $3, $4, $5)`,
                [newProduct.id, initialStock, initialStock, 'Stok Awal', dateVal]
            );
        }

        await client.query('COMMIT');

        return res.status(201).json({
            message: 'Produk baru berhasil ditambahkan!',
            product: newProduct
        });
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

// Update Product (e.g. Nama, Unit, Harga Default Pasar)
async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const { name, unit, price_per_unit, current_stock } = req.body;

        if (!name) return res.status(400).json({ error: 'Nama produk wajib diisi' });

        let result;
        if (current_stock !== undefined && current_stock !== null && current_stock !== '') {
            const newStock = parseFloat(current_stock) || 0;
            result = await db.query(
                `UPDATE products 
                 SET name = $1, unit = $2, price_per_unit = $3, current_stock = $4
                 WHERE id = $5
                 RETURNING *`,
                [name, unit || 'kg', price_per_unit || 0, newStock, id]
            );

            // Perbarui mutasi BARANG_MASUK stok awal agar sinkron dengan stok baru
            const salesCheck = await db.query('SELECT COUNT(*) FROM stock_movements WHERE product_id = $1 AND movement_type = \'PENJUALAN\'', [id]);
            const hasSales = parseInt(salesCheck.rows[0]?.count) > 0;

            if (!hasSales) {
                await db.query(`
                    UPDATE stock_movements 
                    SET quantity = $1, balance_after = $1
                    WHERE product_id = $2 AND movement_type = 'BARANG_MASUK'
                `, [newStock, id]);
            } else {
                const salesAgg = await db.query(`
                    SELECT COALESCE(SUM(quantity), 0) AS total_out
                    FROM stock_movements 
                    WHERE product_id = $1 AND movement_type = 'PENJUALAN'
                `, [id]);
                const totalOut = parseFloat(salesAgg.rows[0]?.total_out) || 0;
                const adjustedInitial = newStock + totalOut;
                await db.query(`
                    UPDATE stock_movements 
                    SET quantity = $1
                    WHERE id = (
                        SELECT id FROM stock_movements 
                        WHERE product_id = $2 AND movement_type = 'BARANG_MASUK' 
                        ORDER BY created_at ASC LIMIT 1
                    )
                `, [adjustedInitial, id]);
            }
        } else {
            result = await db.query(
                `UPDATE products 
                 SET name = $1, unit = $2, price_per_unit = $3
                 WHERE id = $4
                 RETURNING *`,
                [name, unit || 'kg', price_per_unit || 0, id]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        return res.json({
            message: 'Data produk & stok berhasil diperbarui!',
            product: result.rows[0]
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Delete Product
async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        // Cek apakah produk memiliki riwayat transaksi penjualan
        const orderCheck = await db.query('SELECT COUNT(*) FROM order_items WHERE product_id = $1', [id]);
        if (parseInt(orderCheck.rows[0].count) > 0) {
            return res.status(400).json({
                error: 'Produk ini tidak dapat dihapus karena sudah memiliki riwayat transaksi/nota penjualan. Anda dapat mengubah namanya atau menyetel stok menjadi 0.'
            });
        }

        // Cek apakah produk memiliki riwayat stok movement
        const movementCheck = await db.query('SELECT COUNT(*) FROM stock_movements WHERE product_id = $1', [id]);
        if (parseInt(movementCheck.rows[0].count) > 0) {
            // Hapus mutasi stok terkait jika hanya barang masuk / penyesuaian uji coba
            await db.query('DELETE FROM stock_movements WHERE product_id = $1', [id]);
        }

        const result = await db.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        return res.json({
            message: `Produk "${result.rows[0].name}" berhasil dihapus dari sistem!`,
            deletedProduct: result.rows[0]
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Update Keterangan / Notes pada baris Kartu Stok secara manual
async function updateStockLedgerNotes(req, res) {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const noteVal = notes !== undefined && notes !== null ? String(notes) : '';
        await db.query('UPDATE stock_movements SET notes = $1 WHERE id = $2', [noteVal, id]);
        return res.json({ success: true, message: 'Keterangan berhasil disimpan', id, notes: noteVal });
    } catch (error) {
        console.error('Error updateStockLedgerNotes:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    recordIncomingGoods,
    recordStockAdjustment,
    getStockLedger,
    updateStockLedgerNotes,
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct
};


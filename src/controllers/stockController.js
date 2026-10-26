const db = require('../config/db');

// Helper: Kalibrasi ulang saldo stok berjalan (balance_after) dan stok produk saat ini (current_stock)
// berdasarkan urutan kronologis transaksi (created_at ASC, id ASC)
async function recalibrateProductStock(clientOrDb, productId) {
    if (!productId || productId === 'ALL') return 0;
    try {
        const movs = await clientOrDb.query(`
            SELECT id, movement_type, quantity, 
                   COALESCE(damaged_qty, 0) AS damaged_qty, 
                   physical_stock,
                   COALESCE(adjustment_qty, 0) AS adjustment_qty, 
                   balance_after
            FROM stock_movements
            WHERE product_id = $1
            ORDER BY created_at ASC, id ASC
        `, [productId]);

        let running = 0;
        for (const m of movs.rows) {
            const q = parseFloat(m.quantity) || 0;
            const dmg = parseFloat(m.damaged_qty) || 0;
            const adj = parseFloat(m.adjustment_qty) || 0;

            if (m.physical_stock !== null && m.physical_stock !== undefined && m.movement_type === 'PENYESUAIAN') {
                running = parseFloat(m.physical_stock);
            } else {
                if (m.movement_type === 'BARANG_MASUK') {
                    running += q;
                } else if (m.movement_type === 'PENJUALAN') {
                    running -= q;
                }
                if (dmg > 0) running -= dmg;
                if (adj !== 0) running += adj;
            }

            if (parseFloat(m.balance_after) !== running) {
                await clientOrDb.query('UPDATE stock_movements SET balance_after = $1 WHERE id = $2', [running, m.id]);
            }
        }
        await clientOrDb.query('UPDATE products SET current_stock = $1 WHERE id = $2', [running, productId]);
        return running;
    } catch (err) {
        console.warn('Notice (recalibrateProductStock):', err.message);
        return 0;
    }
}

// Add Incoming Goods (Barang Masuk)
async function recordIncomingGoods(req, res) {
    const client = await db.getClient();
    try {
        const { product_id, quantity, notes, incoming_date, price } = req.body;
        
        if (!product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Valid product_id and positive quantity required' });
        }

        await client.query('BEGIN');

        // 1. Log stock movement
        const dateVal = incoming_date ? new Date(incoming_date) : new Date();
        const priceVal = price ? parseFloat(price) : 0;
        const movementRes = await client.query(
            `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at, price)
             VALUES ($1, 'BARANG_MASUK', $2, 0, $3, $4, $5)
             RETURNING *`,
            [product_id, quantity, notes || 'Penerimaan Barang Masuk', dateVal, priceVal]
        );

        // 2. Kalibrasi ulang sisa stok berjalan secara kronologis
        const balanceAfter = await recalibrateProductStock(client, product_id);

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
        const { product_id, damaged_qty, physical_stock, adjustment_qty, notes, adjustment_date } = req.body;
        
        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }

        await client.query('BEGIN');

        const damaged = damaged_qty ? parseFloat(damaged_qty) : 0;
        const adj = adjustment_qty ? parseFloat(adjustment_qty) : 0;
        const phys = (physical_stock !== undefined && physical_stock !== null && physical_stock !== '') ? parseFloat(physical_stock) : null;
        const dateVal = adjustment_date ? new Date(adjustment_date.includes('T') ? adjustment_date : `${adjustment_date}T12:00:00`) : new Date();

        // Log movement with damaged_qty, physical_stock, adjustment_qty, and notes
        const movementRes = await client.query(
            `INSERT INTO stock_movements (product_id, movement_type, quantity, damaged_qty, physical_stock, adjustment_qty, balance_after, notes, created_at)
             VALUES ($1, 'PENYESUAIAN', $2, $3, $4, $5, 0, $6, $7)
             RETURNING *`,
            [product_id, Math.abs(adj), damaged, phys, adj, notes || 'Penyesuaian Stok Audit', dateVal]
        );

        // Kalibrasi ulang sisa stok berjalan secara kronologis
        const balanceAfter = await recalibrateProductStock(client, product_id);

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

        // Selalu pastikan sisa stok (balance_after) dan stok produk sinkron kronologis
        try {
            if (product_id && product_id !== 'ALL' && product_id !== 'undefined' && product_id !== 'null') {
                await recalibrateProductStock(db, product_id);
            } else {
                const allProducts = await db.query('SELECT id FROM products');
                for (const p of allProducts.rows) {
                    await recalibrateProductStock(db, p.id);
                }
            }
        } catch (syncErr) {
            console.warn('Notice (stock movements sync):', syncErr.message);
        }

        let queryText = `
            SELECT sm.id, sm.created_at, sm.product_id, p.name AS product_name, p.unit, p.price_per_unit, sm.movement_type, 
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

        queryText += ` ORDER BY sm.created_at ASC, sm.id ASC LIMIT 2000`;

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

// Hapus baris pergerakan stok manual/duplikat dan hitung ulang saldo stok
async function deleteStockMovement(req, res) {
    const { id } = req.params;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const check = await client.query('SELECT product_id FROM stock_movements WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Data mutasi stok tidak ditemukan' });
        }
        const productId = check.rows[0].product_id;
        await client.query('DELETE FROM stock_movements WHERE id = $1', [id]);

        // Kalibrasi ulang saldo stok berjalan dan stok produk saat ini
        const running = await recalibrateProductStock(client, productId);

        await client.query('COMMIT');
        return res.json({ message: 'Riwayat mutasi stok berhasil dihapus', new_stock: running });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleteStockMovement:', error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}

module.exports = {
    recalibrateProductStock,
    recordIncomingGoods,
    recordStockAdjustment,
    getStockLedger,
    updateStockLedgerNotes,
    deleteStockMovement,
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct
};



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
        let queryText = `
            SELECT sm.id, sm.created_at, p.name AS product_name, p.unit, p.price_per_unit, sm.movement_type, 
                   sm.quantity, sm.damaged_qty, sm.physical_stock, sm.adjustment_qty,
                   sm.balance_after, sm.reference_id, sm.notes
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
        `;
        const params = [];

        if (product_id && product_id !== 'ALL') {
            queryText += ` WHERE sm.product_id = $1`;
            params.push(product_id);
        }

        queryText += ` ORDER BY sm.created_at DESC LIMIT 200`;

        const result = await db.query(queryText, params);
        return res.json(result.rows);
    } catch (error) {
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
    try {
        const { name, unit, current_stock, price_per_unit } = req.body;
        if (!name) return res.status(400).json({ error: 'Nama produk wajib diisi' });

        const queryText = `
            INSERT INTO products (name, unit, current_stock, price_per_unit)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await db.query(queryText, [
            name,
            unit || 'krat',
            current_stock || 0,
            price_per_unit || 0
        ]);
        return res.status(201).json({
            message: 'Produk baru berhasil ditambahkan!',
            product: result.rows[0]
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

// Update Product (e.g. Nama, Unit, Harga Default Pasar)
async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const { name, unit, price_per_unit } = req.body;

        if (!name) return res.status(400).json({ error: 'Nama produk wajib diisi' });

        const result = await db.query(
            `UPDATE products 
             SET name = $1, unit = $2, price_per_unit = $3
             WHERE id = $4
             RETURNING *`,
            [name, unit || 'kg', price_per_unit || 0, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        return res.json({
            message: 'Data produk & harga berhasil diperbarui!',
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

module.exports = {
    recordIncomingGoods,
    recordStockAdjustment,
    getStockLedger,
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct
};


const { Pool } = require('pg');
require('dotenv').config();

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'inventory_telor'
    });

// Pastikan kolom-kolom penting ada di database
let migrationsExecuted = false;
async function runAutoMigrations() {
  if (migrationsExecuted) return;
  migrationsExecuted = true;
  try {
    await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transfer_date DATE');
  } catch (err) {
    console.warn('Notice (transfer_date column check):', err.message);
  }

  try {
    await pool.query(`
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS damaged_qty NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS physical_stock NUMERIC(12, 2);
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS adjustment_qty NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_id VARCHAR(100);
      ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    try {
      // Penyesuaian jadwal stok masuk September sesuai data user:
      // 01-Sep: TB 300
      // 01-Sep: TG 150
      // 05-Sep: OMEGA 5
      // 06-Sep: TB 475
      // 07-Sep: TG 150
      const prodsRes = await pool.query('SELECT id, name FROM products');
      let tbId = null, tgId = null, omegaId = null;

      for (const p of prodsRes.rows) {
        const n = (p.name || '').toUpperCase().trim();
        if (n === 'TB' || n.includes('TB') || n.includes('SUPER')) {
          if (!tbId) tbId = p.id;
        }
        if (n === 'TG' || n.includes('TG') || n.includes('MEDIUM') || n.includes('GEMUK')) {
          if (!tgId) tgId = p.id;
        }
        if (n === 'OMEGA' || n === 'OMG' || n.includes('OMEGA') || n.includes('OMG') || n.includes('KAMPONG')) {
          if (!omegaId) omegaId = p.id;
        }
      }

      if (!tbId) {
        const res = await pool.query("INSERT INTO products (name, unit, current_stock, price_per_unit) VALUES ('TB', 'krat', 300, 46000) RETURNING id");
        tbId = res.rows[0].id;
      }
      if (!tgId) {
        const res = await pool.query("INSERT INTO products (name, unit, current_stock, price_per_unit) VALUES ('TG', 'krat', 288, 42000) RETURNING id");
        tgId = res.rows[0].id;
      }
      if (!omegaId) {
        const res = await pool.query("INSERT INTO products (name, unit, current_stock, price_per_unit) VALUES ('OMEGA', 'krat', 5, 62000) RETURNING id");
        omegaId = res.rows[0].id;
      }

      // Pastikan nama produk di tabel products konsisten
      await pool.query("UPDATE products SET name = 'TB' WHERE id = $1 AND name != 'TB'", [tbId]);
      await pool.query("UPDATE products SET name = 'TG' WHERE id = $1 AND name != 'TG'", [tgId]);
      await pool.query("UPDATE products SET name = 'OMEGA' WHERE id = $1 AND name != 'OMEGA'", [omegaId]);

      // Hapus mutasi BARANG_MASUK stok awal lama untuk 3 produk ini (termasuk yang 475)
      await pool.query(`
        DELETE FROM stock_movements 
        WHERE movement_type = 'BARANG_MASUK'
          AND product_id IN ($1, $2, $3)
      `, [tbId, tgId, omegaId]);

      // Hapus juga secara spesifik jika ada sisa data 475
      await pool.query('DELETE FROM stock_movements WHERE quantity = 475');

      // Masukkan transaksi stok masuk sesuai kebutuhan user (TB cukup 300):
      // 1. 01-Sep: TB 300
      await pool.query(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
        VALUES ($1, 'BARANG_MASUK', 300, 300, '', '2026-09-01 07:00:00+08')
      `, [tbId]);

      // 2. 01-Sep: TG 150
      await pool.query(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
        VALUES ($1, 'BARANG_MASUK', 150, 150, '', '2026-09-01 07:00:00+08')
      `, [tgId]);

      // 3. 05-Sep: OMEGA 5
      await pool.query(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
        VALUES ($1, 'BARANG_MASUK', 5, 5, '', '2026-09-05 07:00:00+08')
      `, [omegaId]);

      // 4. 07-Sep: TG 150
      await pool.query(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
        VALUES ($1, 'BARANG_MASUK', 150, 291, '', '2026-09-07 07:00:00+08')
      `, [tgId]);

      // Update stok TB di tabel products menjadi 300
      await pool.query('UPDATE products SET current_stock = 300 WHERE id = $1', [tbId]);

    } catch (err) {
      console.warn('Notice (September stock schedule migration):', err.message);
    }
  } catch (err) {
    console.warn('Notice (stock_movements columns check):', err.message);
  }
}
runAutoMigrations();

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};

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
      ALTER TABLE products DROP CONSTRAINT IF EXISTS products_current_stock_check;
      ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_balance_after_check;
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

      // Hapus hanya duplikat transaksi 475 pada tgl 06-Sep jika ada lebih dari 1 baris (karena dobel klik)
      await pool.query(`
        DELETE FROM stock_movements
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY product_id, movement_type, quantity, DATE(created_at) 
              ORDER BY id ASC
            ) as rnum
            FROM stock_movements
            WHERE quantity = 475
          ) t WHERE t.rnum > 1
        );
      `);
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

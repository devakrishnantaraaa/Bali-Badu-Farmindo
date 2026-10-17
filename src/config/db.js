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
  } catch (err) {
    console.warn('Notice (stock_movements columns check):', err.message);
  }
}
runAutoMigrations();

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};

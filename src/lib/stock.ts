import { PoolClient } from 'pg';
import pool from './db';

export async function recalibrateProductStock(
  clientOrDb: PoolClient | typeof pool = pool,
  productId: number | string
): Promise<number> {
  const pId = typeof productId === 'string' ? parseInt(productId, 10) : productId;
  if (!pId || isNaN(pId)) return 0;

  try {
    const movs = await clientOrDb.query(
      `SELECT id, movement_type, quantity, 
              COALESCE(damaged_qty, 0) AS damaged_qty, 
              physical_stock,
              COALESCE(adjustment_qty, 0) AS adjustment_qty, 
              balance_after
       FROM stock_movements
       WHERE product_id = $1
       ORDER BY created_at ASC, id ASC`,
      [pId]
    );

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
      if (dmg > 0) running -= dmg;
      if (adj !== 0) running += adj;

      if (parseFloat(m.balance_after) !== running) {
        await clientOrDb.query('UPDATE stock_movements SET balance_after = $1 WHERE id = $2', [running, m.id]);
      }
    }

    await clientOrDb.query('UPDATE products SET current_stock = $1 WHERE id = $2', [running, pId]);
    return running;
  } catch (err: any) {
    console.warn('Notice (recalibrateProductStock):', err.message);
    return 0;
  }
}


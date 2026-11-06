import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';
import { recalibrateProductStock } from '@/lib/stock';

export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { product_id, damaged_qty, physical_stock, adjustment_qty, notes, adjustment_date } = body;

    if (!product_id) {
      return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
    }

    await client.query('BEGIN');

    const damaged = damaged_qty ? parseFloat(damaged_qty) : 0;
    const adj = adjustment_qty ? parseFloat(adjustment_qty) : 0;
    const phys =
      physical_stock !== undefined && physical_stock !== null && physical_stock !== ''
        ? parseFloat(physical_stock)
        : null;
    const dateVal = adjustment_date
      ? new Date(adjustment_date.includes('T') ? adjustment_date : `${adjustment_date}T12:00:00`)
      : new Date();

    const movementRes = await client.query(
      `INSERT INTO stock_movements (product_id, movement_type, quantity, damaged_qty, physical_stock, adjustment_qty, balance_after, notes, created_at)
       VALUES ($1, 'PENYESUAIAN', $2, $3, $4, $5, 0, $6, $7)
       RETURNING *`,
      [product_id, Math.abs(adj), damaged, phys, adj, notes || 'Penyesuaian Stok Audit', dateVal]
    );

    const balanceAfter = await recalibrateProductStock(client, product_id);

    await client.query('COMMIT');

    return NextResponse.json(
      {
        message: 'Stock adjustment saved successfully',
        movement: movementRes.rows[0],
        new_stock: balanceAfter,
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}


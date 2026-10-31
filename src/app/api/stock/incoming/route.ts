import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';
import { recalibrateProductStock } from '@/lib/stock';

export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || (authUser.role !== 'SUPER_ADMIN' && authUser.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { product_id, quantity, notes, incoming_date, price } = body;

    const qty = parseFloat(quantity);
    if (!product_id || isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'Valid product_id and positive quantity required' },
        { status: 400 }
      );
    }

    await client.query('BEGIN');

    const dateVal = incoming_date ? new Date(incoming_date) : new Date();
    const priceVal = price ? parseFloat(price) : 0;

    const movementRes = await client.query(
      `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at, price)
       VALUES ($1, 'BARANG_MASUK', $2, 0, $3, $4, $5)
       RETURNING *`,
      [product_id, qty, notes || 'Penerimaan Barang Masuk', dateVal, priceVal]
    );

    const balanceAfter = await recalibrateProductStock(client, product_id);

    await client.query('COMMIT');

    return NextResponse.json(
      {
        message: 'Barang Masuk recorded successfully',
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


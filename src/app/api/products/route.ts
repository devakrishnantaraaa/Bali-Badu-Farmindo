import { NextRequest, NextResponse } from 'next/server';
import pool, { getClient } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || (authUser.role !== 'SUPER_ADMIN' && authUser.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name, unit, current_stock, stock_date, price_per_unit } = body;
    if (!name) return NextResponse.json({ error: 'Nama produk wajib diisi' }, { status: 400 });

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
      price_per_unit || 0,
    ]);

    const newProduct = result.rows[0];

    if (initialStock > 0) {
      const dateVal = stock_date ? new Date(stock_date) : new Date();
      await client.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, notes, created_at)
         VALUES ($1, 'BARANG_MASUK', $2, $3, $4, $5)`,
        [newProduct.id, initialStock, initialStock, 'Stok Awal', dateVal]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json(
      { message: 'Produk baru berhasil ditambahkan!', product: newProduct },
      { status: 201 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}


import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || (authUser.role !== 'SUPER_ADMIN' && authUser.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, unit, price_per_unit, current_stock } = body;

    if (!name) return NextResponse.json({ error: 'Nama produk wajib diisi' }, { status: 400 });

    let result;
    if (current_stock !== undefined && current_stock !== null && current_stock !== '') {
      const newStock = parseFloat(current_stock) || 0;
      result = await pool.query(
        `UPDATE products 
         SET name = $1, unit = $2, price_per_unit = $3, current_stock = $4
         WHERE id = $5
         RETURNING *`,
        [name, unit || 'krat', price_per_unit || 0, newStock, id]
      );
    } else {
      result = await pool.query(
        `UPDATE products 
         SET name = $1, unit = $2, price_per_unit = $3
         WHERE id = $4
         RETURNING *`,
        [name, unit || 'krat', price_per_unit || 0, id]
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Data produk berhasil diperbarui!',
      product: result.rows[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const orderCheck = await pool.query('SELECT COUNT(*) FROM order_items WHERE product_id = $1', [id]);
    if (parseInt(orderCheck.rows[0].count, 10) > 0) {
      return NextResponse.json(
        {
          error:
            'Produk ini tidak dapat dihapus karena sudah memiliki riwayat transaksi/nota penjualan.',
        },
        { status: 400 }
      );
    }

    await pool.query('DELETE FROM stock_movements WHERE product_id = $1', [id]);
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      message: `Produk "${result.rows[0].name}" berhasil dihapus!`,
      deletedProduct: result.rows[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


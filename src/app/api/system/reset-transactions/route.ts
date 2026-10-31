import { NextRequest, NextResponse } from 'next/server';
import pool, { getClient } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const client = await getClient();
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    await client.query('BEGIN');
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM stock_movements');

    if (body && body.reset_stock_to_zero) {
      await client.query('UPDATE products SET current_stock = 0');
    }

    await client.query('COMMIT');
    return NextResponse.json({
      message: 'Seluruh riwayat transaksi nota penjualan, pembayaran, invoice, dan mutasi stok berhasil dibersihkan!',
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}


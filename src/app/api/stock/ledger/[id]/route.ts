import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';
import { recalibrateProductStock } from '@/lib/stock';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await getClient();
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    await client.query('BEGIN');
    const check = await client.query('SELECT product_id FROM stock_movements WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Data mutasi stok tidak ditemukan' }, { status: 404 });
    }

    const productId = check.rows[0].product_id;
    await client.query('DELETE FROM stock_movements WHERE id = $1', [id]);

    const running = await recalibrateProductStock(client, productId);

    await client.query('COMMIT');
    return NextResponse.json({ message: 'Riwayat mutasi stok berhasil dihapus', new_stock: running });
  } catch (error: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}


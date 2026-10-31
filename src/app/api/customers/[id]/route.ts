import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, phone, address, payment_terms } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nama customer wajib diisi' }, { status: 400 });
    }

    const cleanPhone = phone && phone.trim() !== '' ? phone.trim() : null;
    const cleanTerms = payment_terms || 'REGULER';

    const result = await pool.query(
      `UPDATE customers 
       SET name = $1, phone = $2, address = $3, payment_terms = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name.trim(), cleanPhone, address || null, cleanTerms, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Data customer berhasil diperbarui!',
      customer: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Nomor HP/WhatsApp sudah terdaftar untuk customer lain!' },
        { status: 400 }
      );
    }
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

    const orderCheck = await pool.query('SELECT COUNT(*) FROM orders WHERE customer_id = $1', [id]);
    if (parseInt(orderCheck.rows[0].count, 10) > 0) {
      return NextResponse.json(
        {
          error:
            'Customer tidak dapat dihapus karena sudah memiliki riwayat transaksi/nota penjualan.',
        },
        { status: 400 }
      );
    }

    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({
      message: `Customer "${result.rows[0].name}" berhasil dihapus!`,
      deletedCustomer: result.rows[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


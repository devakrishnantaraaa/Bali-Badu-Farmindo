import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await pool.query('SELECT * FROM customers ORDER BY name ASC');
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, address, payment_terms } = body;
    const cleanPhone = phone && phone.trim() !== '' ? phone.trim() : null;

    if (!name || !cleanPhone) {
      return NextResponse.json(
        { error: 'Nama customer dan nomor HP/WhatsApp wajib diisi' },
        { status: 400 }
      );
    }

    const cleanTerms = payment_terms || 'REGULER';
    let result;
    try {
      result = await pool.query(
        'INSERT INTO customers (name, phone, address, payment_terms) VALUES ($1, $2, $3, $4) RETURNING *',
        [name.trim(), cleanPhone, address || null, cleanTerms]
      );
    } catch (colErr: any) {
      if (colErr.code === '42703') {
        await pool.query(
          "ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'REGULER'"
        );
        result = await pool.query(
          'INSERT INTO customers (name, phone, address, payment_terms) VALUES ($1, $2, $3, $4) RETURNING *',
          [name.trim(), cleanPhone, address || null, cleanTerms]
        );
      } else {
        throw colErr;
      }
    }

    return NextResponse.json(result.rows[0], { status: 201 });
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


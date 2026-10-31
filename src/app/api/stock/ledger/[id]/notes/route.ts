import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { notes } = body;
    const noteVal = notes !== undefined && notes !== null ? String(notes) : '';

    await pool.query('UPDATE stock_movements SET notes = $1 WHERE id = $2', [noteVal, id]);
    return NextResponse.json({ success: true, message: 'Keterangan berhasil disimpan', id, notes: noteVal });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


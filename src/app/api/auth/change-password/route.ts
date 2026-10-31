import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUserFromRequest, comparePassword, hashPassword } from '@/lib/auth';

export async function PUT(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sesi login tidak valid. Silakan login kembali.' }, { status: 401 });
    }

    const body = await req.json();
    const { old_password, new_password, confirm_password } = body;

    if (!old_password || !new_password) {
      return NextResponse.json({ error: 'Password lama dan password baru wajib diisi.' }, { status: 400 });
    }

    const cleanOld = String(old_password).trim();
    const cleanNew = String(new_password).trim();

    if (cleanNew.length < 6) {
      return NextResponse.json({ error: 'Password baru minimal harus 6 karakter.' }, { status: 400 });
    }

    if (confirm_password && cleanNew !== String(confirm_password).trim()) {
      return NextResponse.json({ error: 'Konfirmasi password baru tidak cocok.' }, { status: 400 });
    }

    if (cleanOld === cleanNew) {
      return NextResponse.json({ error: 'Password baru tidak boleh sama dengan password lama.' }, { status: 400 });
    }

    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [authUser.id]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Data akun tidak ditemukan.' }, { status: 404 });
    }

    const user = userRes.rows[0];
    const isMatch = await comparePassword(cleanOld, user.password_hash);
    if (!isMatch) {
      return NextResponse.json({ error: 'Password lama yang Anda masukkan salah.' }, { status: 400 });
    }

    const newHash = await hashPassword(cleanNew);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, authUser.id]);

    return NextResponse.json({
      success: true,
      message: 'Password akun Anda berhasil diperbarui!',
    });
  } catch (error: any) {
    console.error('Error change-password:', error);
    return NextResponse.json({ error: 'Gagal memperbarui password: ' + error.message }, { status: 500 });
  }
}


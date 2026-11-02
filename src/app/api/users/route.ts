import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest, hashPassword } from '@/lib/auth';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Akses Ditolak! Fitur ini khusus untuk Super Admin.' }, { status: 403 });
    }

    const res = await pool.query(
      `SELECT id, username, full_name, role, created_at 
       FROM users 
       ORDER BY id ASC`
    );

    return NextResponse.json(res.rows);
  } catch (err: any) {
    console.error('Error GET /api/users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Akses Ditolak! Fitur ini khusus untuk Super Admin.' }, { status: 403 });
    }

    const body = await req.json();
    const { username, password, full_name, role } = body;

    if (!username || !password || !full_name || !role) {
      return NextResponse.json(
        { error: 'Username, password, nama lengkap, dan role wajib diisi.' },
        { status: 400 }
      );
    }

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MARKETING'];
    const cleanRole = String(role).toUpperCase();
    if (!validRoles.includes(cleanRole)) {
      return NextResponse.json({ error: 'Role tidak valid. Pilih SUPER_ADMIN, ADMIN, atau MARKETING.' }, { status: 400 });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanFullName = String(full_name).trim();

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter.' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(String(password));

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, full_name, role, created_at`,
      [cleanUsername, hashedPassword, cleanFullName, cleanRole]
    );

    return NextResponse.json({ message: 'User berhasil didaftarkan', user: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Username sudah digunakan. Silakan gunakan username lain.' }, { status: 400 });
    }
    console.error('Error POST /api/users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


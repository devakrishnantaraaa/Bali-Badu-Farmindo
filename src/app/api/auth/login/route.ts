import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username dan password wajib diisi' }, { status: 400 });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    let targetUsername = cleanUsername;
    if (cleanUsername === 'super_admin' || cleanUsername === 'super admin') {
      targetUsername = 'superadmin';
    }

    let userRes = await pool.query('SELECT * FROM users WHERE username = $1', [targetUsername]);
    if (userRes.rows.length === 0) {
      userRes = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1', [cleanUsername]);
    }

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Username tidak terdaftar.' }, { status: 401 });
    }

    const user = userRes.rows[0];
    const isValid = await comparePassword(cleanPassword, user.password_hash);

    if (!isValid) {
      return NextResponse.json({ error: 'Password salah. Silakan periksa kembali password Anda.' }, { status: 401 });
    }

    const userPayload = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };

    const token = signToken(userPayload);

    return NextResponse.json({
      message: 'Login successful',
      token,
      user: userPayload,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Database error: ' + error.message }, { status: 500 });
  }
}


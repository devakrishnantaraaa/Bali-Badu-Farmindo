import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest, hashPassword } from '@/lib/auth';
import pool from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Akses Ditolak! Fitur ini khusus untuk Super Admin.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { full_name, role, password } = body;

    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MARKETING'];
    const cleanRole = role ? String(role).toUpperCase() : userCheck.rows[0].role;
    if (!validRoles.includes(cleanRole)) {
      return NextResponse.json({ error: 'Role tidak valid. Pilih SUPER_ADMIN, ADMIN, atau MARKETING.' }, { status: 400 });
    }

    const cleanFullName = full_name ? String(full_name).trim() : userCheck.rows[0].full_name;

    if (password && String(password).trim().length > 0) {
      const cleanPassword = String(password).trim();
      if (cleanPassword.length < 6) {
        return NextResponse.json({ error: 'Password baru minimal 6 karakter.' }, { status: 400 });
      }
      const newHash = await hashPassword(cleanPassword);
      await pool.query(
        `UPDATE users 
         SET full_name = $1, role = $2, password_hash = $3 
         WHERE id = $4`,
        [cleanFullName, cleanRole, newHash, id]
      );
    } else {
      await pool.query(
        `UPDATE users 
         SET full_name = $1, role = $2 
         WHERE id = $3`,
        [cleanFullName, cleanRole, id]
      );
    }

    const updated = await pool.query(
      'SELECT id, username, full_name, role, created_at FROM users WHERE id = $1',
      [id]
    );

    return NextResponse.json({ message: 'User berhasil diperbarui', user: updated.rows[0] });
  } catch (err: any) {
    console.error('Error PUT /api/users/[id]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = getAuthUserFromRequest(req);
    if (!authUser || authUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Akses Ditolak! Fitur ini khusus untuk Super Admin.' }, { status: 403 });
    }

    const { id } = await params;
    if (parseInt(id) === parseInt(String(authUser.id))) {
      return NextResponse.json({ error: 'Tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.' }, { status: 400 });
    }

    const userCheck = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return NextResponse.json({ message: `User '${userCheck.rows[0].username}' berhasil dihapus.` });
  } catch (err: any) {
    console.error('Error DELETE /api/users/[id]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


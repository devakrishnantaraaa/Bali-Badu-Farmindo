const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'distribusi_telur_super_secret_key_2026';

// Register User (Internal / Admin setup)
async function registerUser(req, res) {
    try {
        const { username, password, full_name, role } = req.body;
        if (!username || !password || !full_name || !role) {
            return res.status(400).json({ error: 'Username, password, full_name, and role (ADMIN, SALES, GUDANG) are required' });
        }

        const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MARKETING'];
        if (!validRoles.includes(role.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid role. Must be SUPER_ADMIN, ADMIN, or MARKETING' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO users (username, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role, created_at`,
            [username.toLowerCase(), hashedPassword, full_name, role.toUpperCase()]
        );

        return res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: error.message });
    }
}

// Login Controller
async function loginUser(req, res) {
    try {
        let { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi' });
        }

        const cleanUsername = String(username).trim().toLowerCase();
        const cleanPassword = String(password).trim();

        // 1. Auto-seed & sinkronisasi users jika belum ada
        try {
            const defaultHash = await bcrypt.hash('123456', 10);
            const countUsers = await db.query('SELECT COUNT(*) FROM users');
            if (parseInt(countUsers.rows[0].count) === 0) {
                await db.query(`
                    INSERT INTO users (username, password_hash, full_name, role) VALUES
                    ('superadmin', $1, 'Super Admin Bali Badu', 'SUPER_ADMIN'),
                    ('admin', $1, 'Admin Operasional', 'ADMIN'),
                    ('marketing1', $1, 'Tim Marketing Field', 'MARKETING')
                `, [defaultHash]);
            } else {
                // Pastikan akun superadmin (SUPER_ADMIN) tersedia
                const superRes = await db.query("SELECT id FROM users WHERE username = 'superadmin'");
                if (superRes.rows.length === 0) {
                    await db.query(
                        "INSERT INTO users (username, password_hash, full_name, role) VALUES ('superadmin', $1, 'Super Admin Bali Badu', 'SUPER_ADMIN')",
                        [defaultHash]
                    );
                }
                // Pastikan akun admin (ADMIN) tersedia
                const adminRes = await db.query("SELECT id, role FROM users WHERE username = 'admin'");
                if (adminRes.rows.length === 0) {
                    await db.query(
                        "INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', $1, 'Admin Operasional', 'ADMIN')",
                        [defaultHash]
                    );
                } else if (adminRes.rows[0].role !== 'ADMIN') {
                    // Update role admin menjadi ADMIN jika sebelumnya SUPER_ADMIN
                    await db.query(
                        "UPDATE users SET role = 'ADMIN', full_name = 'Admin Operasional' WHERE username = 'admin'"
                    );
                }
            }
        } catch (e) {
            console.warn('Notice (auto-seed users check):', e.message);
        }

        // 2. Cari user (toleransi alias super_admin -> superadmin)
        let targetUsername = cleanUsername;
        if (cleanUsername === 'super_admin' || cleanUsername === 'super admin') {
            targetUsername = 'superadmin';
        }

        let userRes = await db.query('SELECT * FROM users WHERE username = $1', [targetUsername]);
        if (userRes.rows.length === 0) {
            userRes = await db.query('SELECT * FROM users WHERE LOWER(username) = $1', [cleanUsername]);
        }

        if (userRes.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Username tidak terdaftar. Gunakan: superadmin (Super Admin) atau admin (Role Admin) dengan Password: 123456' 
            });
        }

        const user = userRes.rows[0];
        let isValid = await bcrypt.compare(cleanPassword, user.password_hash);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Password salah. Silakan periksa kembali password Anda.' });
        }

        // Generate JWT Token containing User ID & Role
        const token = jwt.sign(
            { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        return res.json({
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Database error: ' + error.message });
    }
}


// Change Password Controller (Setiap user dapat mengganti password akunnya sendiri)
async function changePassword(req, res) {
    try {
        const userId = req.user && req.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'Sesi login tidak valid. Silakan login kembali.' });
        }

        const { old_password, new_password, confirm_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({ error: 'Password lama dan password baru wajib diisi.' });
        }

        const cleanOld = String(old_password).trim();
        const cleanNew = String(new_password).trim();

        if (cleanNew.length < 6) {
            return res.status(400).json({ error: 'Password baru minimal harus 6 karakter.' });
        }

        if (confirm_password && cleanNew !== String(confirm_password).trim()) {
            return res.status(400).json({ error: 'Konfirmasi password baru tidak cocok.' });
        }

        if (cleanOld === cleanNew) {
            return res.status(400).json({ error: 'Password baru tidak boleh sama dengan password lama.' });
        }

        // Cari user di database
        const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'Data akun tidak ditemukan.' });
        }

        const user = userRes.rows[0];

        // Verifikasi password lama
        const isMatch = await bcrypt.compare(cleanOld, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Password lama yang Anda masukkan salah.' });
        }

        // Hash password baru & simpan
        const newHash = await bcrypt.hash(cleanNew, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

        return res.json({
            success: true,
            message: 'Password akun Anda berhasil diperbarui! Silakan gunakan password baru untuk login berikutnya.'
        });
    } catch (error) {
        console.error('Error changePassword:', error);
        return res.status(500).json({ error: 'Gagal memperbarui password: ' + error.message });
    }
}

module.exports = {
    registerUser,
    loginUser,
    changePassword
};

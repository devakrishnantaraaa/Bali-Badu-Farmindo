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

        const validRoles = ['SUPER_ADMIN', 'MARKETING'];
        if (!validRoles.includes(role.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid role. Must be SUPER_ADMIN or MARKETING' });
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
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const userRes = await db.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = userRes.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
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
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    registerUser,
    loginUser
};

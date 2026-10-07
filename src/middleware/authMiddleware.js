const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'distribusi_telur_super_secret_key_2026';

// Middleware to authenticate JWT Token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <TOKEN>

    if (!token) {
        return res.status(401).json({ error: 'Access token required. Please login first.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired access token.' });
        }
        req.user = decodedUser;
        next();
    });
}

// Middleware to enforce Role-Based Access Control (RBAC)
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Unauthorized user payload.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access Denied! Role '${req.user.role}' is not authorized to access this feature. Required roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    authorizeRoles
};

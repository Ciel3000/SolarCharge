// src/middleware/auth.js
// Local JWT authentication & admin check

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { logSystemEvent } = require('../services/logger');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function verifyLocalJWT(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Express middleware: verify local JWT and attach req.user
 */
async function supabaseAuthMiddleware(req, res, next) {
  try {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      await logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.AUTH, 'Missing or invalid Authorization header');
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = auth.replace('Bearer ', '');
    const payload = await verifyLocalJWT(token);

    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role || 'user',
    };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Authentication failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Express middleware: require admin role
 * Checks: 1) JWT token 'role' claim, 2) users.is_admin database flag
 */
async function requireAdmin(req, res, next) {
  try {
    const { user_id } = req.user;

    // First: check JWT role claim
    if (req.user.role === 'admin') {
      console.log('Admin access granted via JWT role:', req.user.role);
      return next();
    }

    // Second: check database is_admin flag
    const [rows] = await pool.query('SELECT is_admin FROM users WHERE user_id = ?', [user_id]);
    if (rows.length === 0 || !rows[0].is_admin) {
      await logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.AUTH, `Unauthorized admin access attempt by user ${user_id}`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err.message);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Admin check error for user ${req.user?.user_id}: ${err.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { supabaseAuthMiddleware, requireAdmin };

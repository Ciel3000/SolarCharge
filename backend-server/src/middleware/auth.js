// src/middleware/auth.js
// Supabase JWT authentication & admin check

const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { logSystemEvent } = require('../services/logger');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

let supabaseRemoteJwkSet = null;
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

async function getSupabaseRemoteJwkSet() {
  if (!SUPABASE_JWKS_URL) return null;
  if (!supabaseRemoteJwkSet) {
    const jose = await import('jose');
    supabaseRemoteJwkSet = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));
  }
  return supabaseRemoteJwkSet;
}

async function verifySupabaseJWT(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.alg) throw new Error('Invalid token: missing algorithm');
  const alg = decoded.header.alg;
  const jose = await import('jose');

  if (alg === 'ES256' || alg === 'RS256') {
    if (!SUPABASE_JWKS_URL) {
      throw new Error(
        'SUPABASE_JWKS_URL is required for ES256/RS256 tokens. Set it to https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json'
      );
    }
    const JWKS = await getSupabaseRemoteJwkSet();
    const { payload } = await jose.jwtVerify(token, JWKS);
    return payload;
  }

  if (alg === 'HS256') {
    if (!SUPABASE_JWT_SECRET) throw new Error('SUPABASE_JWT_SECRET is required for HS256 tokens');
    return jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
  }

  throw new Error(`Unsupported JWT algorithm: ${alg}`);
}

/**
 * Express middleware: verify Supabase JWT and attach req.user
 */
async function supabaseAuthMiddleware(req, res, next) {
  try {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      await logSystemEvent(pool, LOG_TYPES.WARN, LOG_SOURCES.AUTH, 'Missing or invalid Authorization header');
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = auth.replace('Bearer ', '');
    const payload = await verifySupabaseJWT(token);
    req.user = {
      user_id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    await logSystemEvent(pool, LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Authentication failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Express middleware: require admin role
 * Checks: 1) JWT token 'role' claim (if present), 2) users.is_admin database flag
 */
async function requireAdmin(req, res, next) {
  try {
    const { user_id } = req.user;

    // First: check JWT role claim (if Supabase token includes admin role)
    if (req.user.role === 'admin' || req.user.role === 'service_role') {
      console.log('Admin access granted via JWT role:', req.user.role);
      return next();
    }

    // Second: check database is_admin flag
    const result = await pool.query('SELECT is_admin FROM users WHERE user_id = $1', [user_id]);
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      await logSystemEvent(pool, LOG_TYPES.WARN, LOG_SOURCES.AUTH, `Unauthorized admin access attempt by user ${user_id}`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err.message);
    await logSystemEvent(pool, LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Admin check error for user ${req.user?.user_id}: ${err.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { supabaseAuthMiddleware, requireAdmin };

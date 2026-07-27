// src/controllers/authController.js
// Local authentication controller

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { logSystemEvent } = require('../services/logger');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY = '30d';

// Signup
async function signup(req, res, next) {
  try {
    const { email, password, fname, lname, contact_number } = req.body;

    // Check if user exists
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    const user_id = require('uuid').v4();

    // Insert user
    await pool.query(
      'INSERT INTO users (user_id, email, password_hash, fname, lname, contact_number, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, email, password_hash, fname, lname, contact_number, true] // Auto-verify for dev
    );

    // Generate tokens
    const accessToken = generateAccessToken(user_id, email);
    const refreshToken = generateRefreshToken(user_id);

    await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.AUTH, `User signed up: ${email}`, user_id);

    res.status(201).json({
      user: { user_id, email, fname, lname },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// Login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const [users] = await pool.query(
      'SELECT user_id, email, password_hash, fname, lname, is_admin FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

    const accessToken = generateAccessToken(user.user_id, user.email);
    const refreshToken = generateRefreshToken(user.user_id);

    await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.AUTH, `User logged in: ${email}`, user.user_id);

    res.json({
      user: { user_id: user.user_id, email: user.email, fname: user.fname, lname: user.lname, is_admin: user.is_admin },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// Refresh token
async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refresh_token, JWT_SECRET);

    const [users] = await pool.query(
      'SELECT user_id, email, fname, lname, is_admin FROM users WHERE user_id = ?',
      [decoded.user_id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = users[0];
    const accessToken = generateAccessToken(user.user_id, user.email);
    const newRefreshToken = generateRefreshToken(user.user_id);

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

// Forgot password
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      // Don't reveal if email exists
      return res.json({ message: 'If email exists, reset link sent' });
    }

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?',
      [resetToken, resetExpires, users[0].user_id]
    );

    // TODO: Send email with reset link
    // For local dev, log the token
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ message: 'If email exists, reset link sent' });
  } catch (err) {
    next(err);
  }
}

// Reset password
async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    const [users] = await pool.query(
      'SELECT user_id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE user_id = ?',
      [password_hash, users[0].user_id]
    );

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
}

// Helper functions
function generateAccessToken(userId, email) {
  return jwt.sign(
    { user_id: userId, email, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign(
    { user_id: userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

module.exports = {
  signup,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  generateAccessToken,
};

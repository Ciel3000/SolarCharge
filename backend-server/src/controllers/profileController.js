// src/controllers/profileController.js
// User profile CRUD

const pool = require('../config/database');

// Get own profile
async function getProfile(req, res, next) {
  try {
    const { user_id } = req.user;
    const [rows] = await pool.query(
      'SELECT user_id, fname, lname, email, contact_number, is_admin, created_at, last_login FROM users WHERE user_id = ?',
      [user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Update own profile
async function updateProfile(req, res, next) {
  try {
    const { user_id } = req.user;
    const { fname, lname, contact_number, email } = req.body;

    await pool.query(
      'UPDATE users SET fname = ?, lname = ?, contact_number = ?, email = ?, updated_at = NOW() WHERE user_id = ?',
      [fname, lname, contact_number, email, user_id]
    );

    const [updated] = await pool.query(
      'SELECT user_id, fname, lname, email, contact_number, is_admin FROM users WHERE user_id = ?',
      [user_id]
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile };

// src/services/logger.js
// System logging utility

const pool = require('../config/database');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

async function logSystemEvent(logType, source, message, userId = null) {
  try {
    await pool.query(
      'INSERT INTO system_logs (log_type, source, message, user_id) VALUES (?, ?, ?, ?)',
      [logType, source, message, userId]
    );
  } catch (err) {
    console.error('Failed to write to system_logs table:', err.message);
  }
}

module.exports = { logSystemEvent };

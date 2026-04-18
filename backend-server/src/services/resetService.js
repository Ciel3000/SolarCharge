// src/services/resetService.js
// Background cron job for rolling 24h reset on user_usage

const cron = require('node-cron');
const pool = require('../config/database');

async function runDailyUsageReset() {
  try {
    const result = await pool.query(`
      UPDATE user_usage
      SET total_consumed_mah = 0,
          last_reset_at = NOW()
      WHERE last_reset_at <= NOW() - INTERVAL '24 hours'
      RETURNING user_id
    `);
    console.log(`[resetService] Reset usage for ${result.rowCount} user(s).`);
  } catch (error) {
    console.error('[resetService] Error resetting usage:', error.message);
  }
}

// Run every 15 minutes
cron.schedule('*/15 * * * *', () => {
  runDailyUsageReset();
});

module.exports = { runDailyUsageReset };
// src/jobs/systemJobs.js
// Background system jobs (cron-like tasks)

const pool = require('../config/database');
const chargingService = require('../services/chargingService');
const { logSystemEvent } = require('../services/logger');
const state = require('../services/state');
const {
  SESSION_STATUS,
  CHARGER_STATES,
  MQTT_TOPICS,
  CONFIG,
  LOG_TYPES,
  LOG_SOURCES,
} = require('../utils/constants');

function startStaleSessionChecker(mqttClient) {
  const { INACTIVITY_TIMEOUT_SECONDS, STALE_SESSION_CHECK_INTERVAL_MS } = CONFIG;

  async function checkStaleActiveSessions() {
    try {
      console.log('Checking for stale active sessions...');
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Running stale session checker');

      const staleSessions = await pool.query(
        `SELECT
            cs.session_id,
            cs.port_id,
            cp.device_mqtt_id,
            cp.port_number_in_device,
            cs.last_status_update,
            cs.energy_consumed_kwh,
            EXTRACT(EPOCH FROM (NOW() - cs.last_status_update)) AS seconds_since_update
         FROM charging_session cs
         JOIN charging_port cp ON cs.port_id = cp.port_id
         WHERE cs.session_status = $1
           AND cs.last_status_update < NOW() - (INTERVAL '1 second' * $2)`,
        [SESSION_STATUS.ACTIVE, INACTIVITY_TIMEOUT_SECONDS * 2]
      );

      if (staleSessions.rows.length > 0) {
        console.log(`Found ${staleSessions.rows.length} stale active sessions.`);
        await logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.BACKEND, `Found ${staleSessions.rows.length} stale active sessions`);

        for (const session of staleSessions.rows) {
          console.log(`Cleaning up stale session ${session.session_id} (${Math.round(session.seconds_since_update)}s since last update)`);
          await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Cleaning up stale session ${session.session_id}`);

          // Send OFF command to device
          if (session.device_mqtt_id && session.port_number_in_device) {
            const controlTopic = `${MQTT_TOPICS.CONTROL}${session.device_mqtt_id}`;
            const mqttPayload = JSON.stringify({ command: CHARGER_STATES.OFF, port_number: session.port_number_in_device });
            mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
              if (err) {
                console.error(`Failed to publish cleanup OFF command for stale session ${session.session_id}:`, err);
                logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed cleanup OFF for stale session ${session.session_id}: ${err.message}`);
              } else {
                console.log(`Sent cleanup OFF command for stale session ${session.session_id}`);
                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Sent cleanup OFF for stale session ${session.session_id}`);
              }
            });
          }

          // Calculate cost and mark session completed
          const sessionCost = await chargingService.calculateSessionCost(session.session_id, session.energy_consumed_kwh || 0);

          await pool.query(
            "UPDATE charging_session SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2 WHERE session_id = $3",
            [SESSION_STATUS.COMPLETED, sessionCost, session.session_id]
          );
          await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Session ${session.session_id} marked auto-completed by stale checker. Cost: $${sessionCost.toFixed(2)}`);

          // Clean up in-memory state
          if (session.device_mqtt_id && session.port_number_in_device) {
            const sessionKey = `${session.device_mqtt_id}_${session.port_number_in_device}`;
            delete state.activeChargerSessions[sessionKey];
            if (state.activePortTimers[sessionKey]) {
              clearTimeout(state.activePortTimers[sessionKey].timerId);
              delete state.activePortTimers[sessionKey];
            }
          }
        }
      } else {
        console.log('No stale active sessions found.');
      }
    } catch (error) {
      console.error('Error checking for stale sessions:', error);
      await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error checking for stale sessions: ${error.message}`);
    }
  }

  // Initial run then interval
  checkStaleActiveSessions();
  setInterval(checkStaleActiveSessions, STALE_SESSION_CHECK_INTERVAL_MS);
  console.log(`Stale session checker set to run every ${STALE_SESSION_CHECK_INTERVAL_MS / 1000 / 60} minutes.`);
}

function startExpiredSubscriptionChecker() {
  setInterval(async () => {
    try {
      console.log('Checking for expired subscriptions...');
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Running expired subscription checker');

      const result = await pool.query(
        `UPDATE user_subscription
         SET is_active = false
         WHERE is_active = true
           AND end_date <= NOW()
         RETURNING user_subscription_id, user_id, end_date`
      );

      if (result.rows.length > 0) {
        console.log(`Deactivated ${result.rows.length} expired subscriptions:`);
        await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Deactivated ${result.rows.length} expired subscriptions`);
      } else {
        console.log('No expired subscriptions found');
      }
    } catch (error) {
      console.error('Error checking expired subscriptions:', error);
      await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error checking expired subscriptions: ${error.message}`);
    }
  }, 60 * 60 * 1000);
}

function startBorrowedAmountProcessor() {
  setInterval(async () => {
    try {
      console.log('Processing borrowed amounts for next day penalties...');
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Running borrowed amount processor');

      const { rows } = await pool.query(`
        SELECT user_subscription_id, user_id, borrowed_mah_pending, borrowed_mah_today
        FROM user_subscription
        WHERE borrowed_mah_pending > 0
          AND last_borrow_date < CURRENT_DATE
          AND is_active = true
      `);

      for (const row of rows) {
        const totalDeduction = row.borrowed_mah_today + row.borrowed_mah_pending;

        await pool.query(
          `UPDATE user_subscription
           SET borrowed_mah_pending = $1,
               borrowed_mah_today = 0,
               updated_at = NOW()
           WHERE user_subscription_id = $2`,
          [totalDeduction, row.user_subscription_id]
        );

        console.log(`Applied ${totalDeduction} mAh deduction (${row.borrowed_mah_today} borrowed + ${row.borrowed_mah_pending} penalty) for user ${row.user_id}`);
        await logSystemEvent(
          LOG_TYPES.INFO,
          LOG_SOURCES.SUBSCRIPTION,
          `Applied ${totalDeduction} mAh deduction for borrowed amount`,
          row.user_id
        );
      }

      if (rows.length > 0) {
        console.log(`Processed ${rows.length} borrowed amount penalties`);
      }
    } catch (error) {
      console.error('Error processing borrowed amounts:', error);
      await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error processing borrowed amounts: ${error.message}`);
    }
  }, 60 * 60 * 1000);
}

function startDailyQuotaReset() {
  setInterval(async () => {
    try {
      const now = new Date();
      // Only run at midnight (00:00)
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        console.log('Running daily quota reset for all users...');
        await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Running daily quota reset');

        const { rows } = await pool.query(`
          UPDATE user_subscription
          SET current_daily_mah_consumed = 0,
              last_quota_reset = NOW(),
              borrowed_mah_today = 0
          WHERE is_active = true
            AND (current_daily_mah_consumed > 0 OR borrowed_mah_today > 0)
          RETURNING user_subscription_id, user_id, current_daily_mah_consumed, borrowed_mah_today
        `);

        if (rows.length > 0) {
          console.log(`Reset daily quota for ${rows.length} users`);
          await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Reset daily quota for ${rows.length} users`);

          rows.forEach(row => {
            console.log(`Reset user ${row.user_id}: consumed=${row.current_daily_mah_consumed} mAh, borrowed=${row.borrowed_mah_today} mAh`);
          });
        } else {
          console.log('No users needed daily quota reset');
        }
      }
    } catch (error) {
      console.error('Error during daily quota reset:', error);
      await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error during daily quota reset: ${error.message}`);
    }
  }, 60 * 1000); // Check every minute
}

module.exports = {
  startStaleSessionChecker,
  startExpiredSubscriptionChecker,
  startBorrowedAmountProcessor,
  startDailyQuotaReset,
};

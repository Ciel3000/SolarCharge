// src/services/chargingService.js
// Core charging session management, MQTT handling, and device state

const pool = require('../config/database');
const { logSystemEvent } = require('./logger');
const subscriptionService = require('./subscriptionService');
const state = require('./state');
const {
  SESSION_STATUS,
  PORT_STATUS,
  CHARGER_STATES,
  LOG_TYPES,
  LOG_SOURCES,
  MQTT_TOPICS,
  CONFIG,
  ESP32_STATION_CLIENT_ID,
} = require('../utils/constants');

// Destructure configuration constants for direct use
const {
  INACTIVITY_TIMEOUT_SECONDS,
  PREMIUM_USER_MAX_ACTIVE_SLOTS,
  MAX_REASONABLE_CONSUMPTION,
  DEFAULT_PRICE_PER_MAH,
} = CONFIG;

// Destructure shared state
const { activeChargerSessions, activePortTimers, fullChargeNotificationState, sessionLocks } = state;

// Helper: acquire a mutex lock for a session key
async function acquireSessionLock(sessionKey, timeoutMs = 5000) {
  const startTime = Date.now();
  while (sessionLocks.has(sessionKey)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Session lock timeout - port is busy');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  sessionLocks.set(sessionKey, true);
  return () => sessionLocks.delete(sessionKey);
}

// Helper: validate consumption value
function validateConsumption(consumption) {
  if (consumption === null || consumption === undefined || isNaN(consumption) || consumption < 0) {
    return 0;
  }
  if (consumption > CONFIG.MAX_REASONABLE_CONSUMPTION) {
    return CONFIG.MAX_REASONABLE_CONSUMPTION;
  }
  return consumption;
}

// Helper: calculate cost for a session using total mAh consumed
async function calculateSessionCost(sessionId, totalMah) {
  try {
    const sessionResult = await pool.query(
      'SELECT station_id FROM charging_session WHERE session_id = $1',
      [sessionId]
    );
    if (sessionResult.rows.length > 0) {
      const stationId = sessionResult.rows[0].station_id;
      const stationPricing = await pool.query(
        'SELECT price_per_mah FROM charging_station WHERE station_id = $1',
        [stationId]
      );
      const pricePerMAH = stationPricing.rows[0]?.price_per_mah || CONFIG.DEFAULT_PRICE_PER_MAH;
      return totalMah * pricePerMAH;
    }
  } catch (error) {
    console.error(`Error calculating session cost for session ${sessionId}:`, error);
  }
  return 0;
}

// Helper: fetch active session for a port
async function getActiveSessionForPort(portId) {
  if (!portId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT session_id, user_id, station_id
       FROM charging_session
       WHERE port_id = $1 AND session_status = $2
       ORDER BY start_time DESC
       LIMIT 1`,
      [portId, SESSION_STATUS.ACTIVE]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Failed to fetch active session for port:', error);
    return null;
  }
}

// Helper: fetch latest user device telemetry
async function getLatestUserDeviceTelemetry(userId) {
  if (!userId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT device_id, device_name, device_model, current_battery_level, is_charging, last_updated
       FROM user_devices
       WHERE user_id = $1
       ORDER BY last_updated DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Failed to fetch user device telemetry:', error);
    return null;
  }
}

function deviceTelemetryIsFresh(record) {
  if (!record?.last_updated) return false;
  const lastUpdated = new Date(record.last_updated);
  if (Number.isNaN(lastUpdated.getTime())) return false;
  const secondsSince = (Date.now() - lastUpdated.getTime()) / 1000;
  return secondsSince <= CONFIG.USER_DEVICE_ONLINE_THRESHOLD_SECONDS;
}

function formatSecondsAgo(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function buildDeviceNotificationContext({ telemetry, fallbackUsed, extraParts = [] }) {
  const contextParts = [...extraParts];
  if (telemetry?.device_name) {
    const descriptor = telemetry.device_model
      ? `${telemetry.device_name} (${telemetry.device_model})`
      : telemetry.device_name;
    contextParts.push(`Device: ${descriptor}`);
  }
  if (telemetry?.current_battery_level !== null && telemetry?.current_battery_level !== undefined) {
    contextParts.push(`Reported level: ${Math.round(telemetry.current_battery_level)}%`);
  }
  if (telemetry?.last_updated) {
    contextParts.push(`Telemetry updated ${formatSecondsAgo(new Date(telemetry.last_updated))} ago`);
  }
  if (fallbackUsed) {
    contextParts.push('Device telemetry unavailable; using station sensors');
  }
  return contextParts.length > 0 ? contextParts.join(' • ') : null;
}

// Notification event handlers
async function handleFullChargeReadyEvent({ deviceId, actualPortId, portNumber, reason }) {
  try {
    const session = await getActiveSessionForPort(actualPortId);
    if (!session) {
      await logSystemEvent(
        LOG_TYPES.WARN,
        LOG_SOURCES.MQTT,
        `Full-charge ready event without active session for port ${actualPortId}`
      );
      return;
    }

    const sessionId = session.session_id;
    const currentState = fullChargeNotificationState.get(sessionId);
    if (currentState?.fullSentAt) {
      return; // Already notified
    }

    const telemetry = await getLatestUserDeviceTelemetry(session.user_id);
    const telemetryFresh = deviceTelemetryIsFresh(telemetry);
    const meetsStrictConditions = telemetryFresh && telemetry?.is_charging;
    const resolvedPortNumber = portNumber ?? 'unknown';

    const content = meetsStrictConditions
      ? `Your ${telemetry?.device_name || 'device'} on Port ${resolvedPortNumber} is fully charged. We'll disconnect in about a minute.`
      : `Port ${resolvedPortNumber} sensors detected your charging session is complete. We'll disconnect in about a minute.`;

    const context = buildDeviceNotificationContext({
      telemetry,
      fallbackUsed: !meetsStrictConditions,
      extraParts: reason ? [`Reason: ${reason}`] : [],
    });

    // Insert notification using pool directly
    await pool.query(
      `INSERT INTO notification (user_id, notification_type, notification_context, notification_content)
       VALUES ($1, $2::notification_type, $3, $4)`,
      [session.user_id, 'success', context, content]
    );
    await logSystemEvent(
      LOG_TYPES.INFO,
      LOG_SOURCES.MQTT,
      `Notification (success) queued for user ${session.user_id}: ${content.substring(0, 120)}`,
      session.user_id
    );

    fullChargeNotificationState.set(sessionId, {
      userId: session.user_id,
      portId: actualPortId,
      portNumber,
      deviceId,
      fullSentAt: new Date(),
      fallbackUsed: !meetsStrictConditions,
      disconnectSent: false,
    });
  } catch (error) {
    console.error('handleFullChargeReadyEvent error:', error);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to process full-charge ready event: ${error.message}`);
  }
}

async function handleFullChargeDisconnectEvent({ actualPortId, portNumber, reason }) {
  try {
    const session = await getActiveSessionForPort(actualPortId);
    if (!session) {
      await logSystemEvent(
        LOG_TYPES.WARN,
        LOG_SOURCES.MQTT,
        `Full-charge disconnect event without active session for port ${actualPortId}`
      );
      return;
    }

    const sessionId = session.session_id;
    const currentState = fullChargeNotificationState.get(sessionId) || {};

    if (currentState.disconnectSent) {
      return;
    }

    const resolvedPortNumber = portNumber ?? 'unknown';
    const elapsedSeconds = currentState.fullSentAt
      ? Math.max(0, Math.round((Date.now() - currentState.fullSentAt.getTime()) / 1000))
      : null;

    const contextParts = [];
    if (elapsedSeconds !== null) {
      contextParts.push(`Auto-disconnected ${elapsedSeconds}s after full-charge alert`);
    }
    if (reason) {
      contextParts.push(`Reason: ${reason}`);
    }
    if (!currentState.fullSentAt) {
      contextParts.push('Sensor-based auto-disconnect');
    }

    await pool.query(
      `INSERT INTO notification (user_id, notification_type, notification_context, notification_content)
       VALUES ($1, $2::notification_type, $3, $4)`,
      [session.user_id, 'info', contextParts.length ? contextParts.join(' • ') : null, `Charging session on Port ${resolvedPortNumber} has been disconnected automatically.`]
    );

    fullChargeNotificationState.set(sessionId, {
      ...currentState,
      disconnectSent: true,
    });
  } catch (error) {
    console.error('handleFullChargeDisconnectEvent error:', error);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to process full-charge disconnect event: ${error.message}`);
  }
}

// Inactivity timeout handler
async function handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, sessionId) {
  const sessionKey = `${deviceId}_${internalPortNumber}`;
  console.log(`Timer expired for ${sessionKey}. Checking for inactivity.`);
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Inactivity check for session ${sessionId} on ${sessionKey}`);

  try {
    const sessionCheck = await pool.query(
      `SELECT session_id, session_status, last_status_update, energy_consumed_kwh, energy_consumed_mah
       FROM charging_session
       WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionCheck.rows.length > 0 && sessionCheck.rows[0].session_status === SESSION_STATUS.ACTIVE) {
      const lastUpdate = sessionCheck.rows[0].last_status_update;
      const energyConsumed = parseFloat(sessionCheck.rows[0].energy_consumed_kwh) || 0;
      const mAhConsumed = parseFloat(sessionCheck.rows[0].energy_consumed_mah) || 0;
      const now = new Date();

      const secondsSinceLastActivity = lastUpdate
        ? Math.floor((now - new Date(lastUpdate)) / 1000)
        : INACTIVITY_TIMEOUT_SECONDS + 1;

      console.log(`${sessionKey}: ${secondsSinceLastActivity} seconds since last activity.`);

      if (secondsSinceLastActivity >= INACTIVITY_TIMEOUT_SECONDS) {
        // Send OFF command to ESP32 via MQTT (global mqttClient passed from outside)
        const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
        const mqttPayload = JSON.stringify({ command: CHARGER_STATES.OFF, port_number: internalPortNumber });
        // Note: mqttClient will be provided by config/mqtt.js; we need a way to publish.
        // We'll attach a publish function to this service or receive mqttClient dependency.
        // For simplicity, we will store a global (module-level) variable for mqttClient.
        if (global.mqttClient) {
          global.mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
            if (err) {
              console.error(`Failed to publish automatic OFF command to ${controlTopic}:`, err);
              logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed auto OFF command for ${sessionKey}: ${err.message}`);
            } else {
              console.log(`Automatically sent OFF command to ${deviceId} Port ${internalPortNumber} due to inactivity (${secondsSinceLastActivity}s).`);
              logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Sent auto OFF command for ${sessionKey} (session ${sessionId}) due to inactivity`);
            }
          });
        }

        const sessionCost = await calculateSessionCost(sessionId, mAhConsumed);

        await pool.query(
          `UPDATE charging_session
           SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2
           WHERE session_id = $3`,
          [SESSION_STATUS.COMPLETED, sessionCost, sessionId]
        );
        console.log(`Marked session ${sessionId} as '${SESSION_STATUS.COMPLETED}' due to inactivity. Final Cost: $${sessionCost.toFixed(2)}`);
        await logSystemEvent(
          LOG_TYPES.INFO,
          LOG_SOURCES.BACKEND,
          `Session ${sessionId} auto-completed due to inactivity. Cost: $${sessionCost.toFixed(2)}`
        );

        // Update daily consumption via UPSERT on user_usage
        const userResult = await pool.query('SELECT user_id FROM charging_session WHERE session_id = $1', [sessionId]);
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].user_id;
          await pool.query(
            `INSERT INTO user_usage (user_id, total_consumed_mah, last_reset_at)
             VALUES ($2, $1, NOW())
             ON CONFLICT (user_id) DO UPDATE
               SET total_consumed_mah = user_usage.total_consumed_mah + EXCLUDED.total_consumed_mah`,
            [mAhConsumed, userId]
          );
          console.log(`Inactivity: Updated daily consumption for user ${userId} by ${mAhConsumed.toFixed(0)} mAh`);
        }

        // Clean up state
        delete activeChargerSessions[sessionKey];
        delete activePortTimers[sessionKey];
        fullChargeNotificationState.delete(sessionId);
      } else {
        // Reset timer
        console.log(`Session ${sessionId} for ${sessionKey} is still active. Resetting inactivity timer.`);
        activePortTimers[sessionKey] = {
          timerId: setTimeout(
            () => handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, sessionId),
            INACTIVITY_TIMEOUT_SECONDS * 1000
          ),
          lastConsumptionTime: Date.now(),
        };
        console.log(`Inactivity: Reset timer for ${sessionKey} for another ${INACTIVITY_TIMEOUT_SECONDS} seconds`);
      }
    } else {
      console.log(`Session ${sessionId} for ${sessionKey} was already inactive or not found. No auto turn-off needed.`);
      delete activeChargerSessions[sessionKey];
      delete activePortTimers[sessionKey];
      console.log(`Inactivity: Cleaned up tracking maps for ${sessionKey}`);
    }
  } catch (error) {
    console.error(`Error during inactivity turn-off for ${sessionKey}:`, error);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error during inactivity turn-off for ${sessionKey}: ${error.message}`);
  }
}

// Finalize a session from device event (e.g., OFF event from device)
async function finalizeSessionFromDeviceEvent({ deviceId, portNumberInDevice, actualPortId, endReason = 'device_event', source = LOG_SOURCES.MQTT }) {
  if (!deviceId || !portNumberInDevice || !actualPortId) {
    return false;
  }

  const sessionKey = `${deviceId}_${portNumberInDevice}`;
  let sessionRow;
  let sessionId = activeChargerSessions[sessionKey];

  if (sessionId) {
    const { rows } = await pool.query(
      `SELECT session_id, user_id, energy_consumed_kwh, energy_consumed_mah
       FROM charging_session
       WHERE session_id = $1 AND session_status = $2`,
      [sessionId, SESSION_STATUS.ACTIVE]
    );
    if (rows.length > 0) {
      sessionRow = rows[0];
    } else {
      sessionId = null;
    }
  }

  if (!sessionId) {
    const result = await pool.query(
      `SELECT session_id, user_id, energy_consumed_kwh, energy_consumed_mah
       FROM charging_session
       WHERE port_id = $1 AND session_status = $2
       ORDER BY start_time DESC
       LIMIT 1`,
      [actualPortId, SESSION_STATUS.ACTIVE]
    );
    if (result.rows.length === 0) {
      return false;
    }
    sessionRow = result.rows[0];
    sessionId = sessionRow.session_id;
  }

  const energyConsumed = parseFloat(sessionRow.energy_consumed_kwh) || 0;
  const mAhConsumed = parseFloat(sessionRow.energy_consumed_mah) || 0;
  const sessionCost = await calculateSessionCost(sessionId, mAhConsumed);

  const updateResult = await pool.query(
    `UPDATE charging_session
     SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2
     WHERE session_id = $3 AND session_status = $4`,
    [SESSION_STATUS.COMPLETED, sessionCost, sessionId, SESSION_STATUS.ACTIVE]
  );

  if (updateResult.rowCount === 0) {
    return false;
  }

  if (sessionRow.user_id) {
    await pool.query(
      `INSERT INTO user_usage (user_id, total_consumed_mah, last_reset_at)
       VALUES ($2, $1, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET total_consumed_mah = user_usage.total_consumed_mah + EXCLUDED.total_consumed_mah`,
      [mAhConsumed, sessionRow.user_id]
    );
  }

  delete activeChargerSessions[sessionKey];
  if (activePortTimers[sessionKey]) {
    clearTimeout(activePortTimers[sessionKey].timerId);
    delete activePortTimers[sessionKey];
  }
  fullChargeNotificationState.delete(sessionId);

  await pool.query(
    `UPDATE charging_port
     SET current_status = $1, is_occupied = false, last_status_update = NOW()
     WHERE port_id = $2`,
    [PORT_STATUS.AVAILABLE, actualPortId]
  );

  await logSystemEvent(
    LOG_TYPES.INFO,
    source,
    `Auto-completed session ${sessionId} for ${sessionKey}. Reason: ${endReason}`
  );

  return true;
}

// MQTT status message handler (called from usage/message dispatcher)
async function handleMqttStatusMessage(payload, deviceId, actualPortId, isPremiumPort) {
  const { status, charger_state, timestamp, port_number, event_type, reason } = payload;
  const currentTimestamp = new Date(timestamp);

  let mapped_current_status;
  if (status === 'offline') {
    mapped_current_status = PORT_STATUS.OFFLINE;
  } else if (charger_state === CHARGER_STATES.ON) {
    mapped_current_status = isPremiumPort ? PORT_STATUS.CHARGING_PREMIUM : PORT_STATUS.CHARGING_FREE;
  } else if (charger_state === CHARGER_STATES.OFF) {
    mapped_current_status = PORT_STATUS.AVAILABLE;
  } else {
    mapped_current_status = PORT_STATUS.AVAILABLE;
  }

  // Log device status
  await pool.query(
    `INSERT INTO device_status_logs (device_id, port_id, status_message, charger_state, timestamp)
     VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))`,
    [deviceId, actualPortId, status, charger_state, timestamp]
  );

  // Upsert current device status
  await pool.query(
    `INSERT INTO current_device_status (device_id, port_id, status_message, charger_state, last_update)
     VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))
     ON CONFLICT (device_id, port_id) DO UPDATE SET
        status_message = $3,
        charger_state = $4,
        last_update = TO_TIMESTAMP($5 / 1000.0)`,
    [deviceId, actualPortId, status, charger_state, timestamp]
  );

  // Update charging port status
  await pool.query(
    `UPDATE charging_port
     SET current_status = $1, is_occupied = $2, last_status_update = $3
     WHERE port_id = $4`,
    [
      mapped_current_status,
      mapped_current_status === PORT_STATUS.CHARGING_FREE ||
      mapped_current_status === PORT_STATUS.CHARGING_PREMIUM ||
      mapped_current_status === PORT_STATUS.OCCUPIED,
      currentTimestamp,
      actualPortId,
    ]
  );

  console.log(`MQTT: Updated status for ${deviceId} Port ${port_number}: ${mapped_current_status}, Charger: ${charger_state}`);
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Status update for ${deviceId} Port ${port_number}: ${mapped_current_status}, Charger: ${charger_state}`);

  // Handle special events
  if (event_type === 'PORT_FULL_READY') {
    await handleFullChargeReadyEvent({ deviceId, actualPortId, portNumber: port_number, reason });
  } else if (event_type === 'PORT_AUTO_OFF_FULL' || (reason === 'FULL_CHARGE' && charger_state === CHARGER_STATES.OFF)) {
    await handleFullChargeDisconnectEvent({ actualPortId, portNumber: port_number, reason });
  }

  // If port turned OFF, finalize session
  if (Number.isInteger(port_number) && charger_state === CHARGER_STATES.OFF) {
    const endReason = reason || status || 'device_reported_off';
    const eventSource = event_type ? `${LOG_SOURCES.MQTT}:${event_type}` : LOG_SOURCES.MQTT;
    await finalizeSessionFromDeviceEvent({
      deviceId,
      portNumberInDevice: port_number,
      actualPortId,
      endReason,
      source: eventSource,
    });
  }
}

// Process usage topic
async function processUsageMessage(payload, deviceId, portNumberInDevice, actualPortId, isPremiumPort) {
  const serverTimestamp = new Date();
  const rawConsumption = Number(payload.consumption);
  const consumptionAmps = Number.isFinite(rawConsumption) ? rawConsumption : 0;
  const deviceTimestampMs = Number(payload.timestamp);
  const hasDeviceTimestamp = Number.isFinite(deviceTimestampMs);
  const charger_state = payload.charger_state;

  const validatedConsumption = validateConsumption(consumptionAmps * CONFIG.NOMINAL_CHARGING_VOLTAGE_DC);

  console.log(
    `MQTT: Processing usage for ${deviceId}_${portNumberInDevice}. Charger: ${charger_state}, ` +
    `Consumption: ${consumptionAmps.toFixed(3)}A (~${validatedConsumption.toFixed(2)}W)`
  );

  // Store raw consumption data (Amps)
  await pool.query(
    `INSERT INTO consumption_data (session_id, device_id, port_number, consumption_watts, timestamp, charger_state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [activeChargerSessions[`${deviceId}_${portNumberInDevice}`], deviceId, portNumberInDevice, consumptionAmps, serverTimestamp, charger_state]
  );

  if (validatedConsumption > 0) {
    const sessionKey = `${deviceId}_${portNumberInDevice}`;
    let currentSessionId = activeChargerSessions[sessionKey];

    // If not in memory (e.g., after backend restart), look up active session from DB
    if (!currentSessionId) {
      const portIdResult = await pool.query(
        'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
        [deviceId, portNumberInDevice]
      );
      if (portIdResult.rows.length > 0) {
        const actualPortId = portIdResult.rows[0].port_id;
        const sessionResult = await pool.query(
          'SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = $2',
          [actualPortId, SESSION_STATUS.ACTIVE]
        );
        if (sessionResult.rows.length > 0) {
          currentSessionId = sessionResult.rows[0].session_id;
          // Cache it for future messages
          activeChargerSessions[sessionKey] = currentSessionId;
          console.log(`MQTT: Reconnected session ${currentSessionId} for ${sessionKey} from DB`);
        }
      }
    }

    if (currentSessionId) {
      const totalMahFromDevice = Number(payload.total_mah) || 0;
      
      // Check if this is the first MQTT message for this session (initial_total_mah not set yet)
      const sessionResult = await pool.query(
        'SELECT initial_total_mah FROM charging_session WHERE session_id = $1',
        [currentSessionId]
      );
      const initialTotalMah = sessionResult.rows[0]?.initial_total_mah;
      
      let sessionMahConsumed = 0;
      let shouldUpdateInitial = false;
      
      if (initialTotalMah === null || initialTotalMah === undefined || initialTotalMah === 0) {
        // First message: establish baseline
        shouldUpdateInitial = true;
        sessionMahConsumed = 0; // No consumption recorded yet for this session
        console.log(`MQTT: Setting initial_total_mah=${totalMahFromDevice} for session ${currentSessionId}`);
      } else {
        // Subsequent messages: compute delta
        if (totalMahFromDevice >= initialTotalMah) {
          sessionMahConsumed = totalMahFromDevice - initialTotalMah;
        } else {
          // ESP32 reset its counter - treat current total as consumed and reset baseline
          sessionMahConsumed = totalMahFromDevice;
          shouldUpdateInitial = true;
          console.warn(`MQTT: ESP32 reset detected for ${sessionKey}. Resetting baseline.`);
        }
      }
      
      // Calculate kWh from session mAh using nominal voltage (3.7V for Li-ion)
      const kwhFromSession = (sessionMahConsumed * 3.7) / (1000 * 1000);

      // Build UPDATE query dynamically based on whether we need to set initial_total_mah
      if (shouldUpdateInitial) {
        await pool.query(
          `UPDATE charging_session
           SET energy_consumed_kwh = $1,
               energy_consumed_mah = $2::real,
               total_mah_consumed = $3,
               initial_total_mah = $4,
               last_status_update = $5
           WHERE session_id = $6`,
          [kwhFromSession, sessionMahConsumed, sessionMahConsumed, totalMahFromDevice, serverTimestamp, currentSessionId]
        );
      } else {
        await pool.query(
          `UPDATE charging_session
           SET energy_consumed_kwh = $1,
               energy_consumed_mah = $2::real,
               total_mah_consumed = $3,
               last_status_update = $4
           WHERE session_id = $5`,
          [kwhFromSession, sessionMahConsumed, sessionMahConsumed, serverTimestamp, currentSessionId]
        );
      }

      // Update daily consumption - accumulate session delta
      const userResult = await pool.query('SELECT user_id FROM charging_session WHERE session_id = $1', [currentSessionId]);
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].user_id;
        await pool.query(
          `INSERT INTO user_usage (user_id, total_consumed_mah, last_reset_at)
           VALUES ($1, $2::integer, NOW())
           ON CONFLICT (user_id) DO UPDATE
             SET total_consumed_mah = user_usage.total_consumed_mah + EXCLUDED.total_consumed_mah`,
          [userId, Math.round(sessionMahConsumed)]
        );
      }

      // Reset inactivity timer
      if (activePortTimers[sessionKey]) {
        clearTimeout(activePortTimers[sessionKey].timerId);
        activePortTimers[sessionKey].lastConsumptionTime = Date.now();
        activePortTimers[sessionKey].timerId = setTimeout(
          () => handleInactivityTurnOff(deviceId, portNumberInDevice, actualPortId, currentSessionId),
          CONFIG.INACTIVITY_TIMEOUT_SECONDS * 1000
        );
        console.log(`MQTT: Timer reset for ${sessionKey} due to new consumption.`);
      } else {
        console.warn(`MQTT: No active timer found for ${sessionKey} when consumption received.`);
        activePortTimers[sessionKey] = {
          timerId: setTimeout(
            () => handleInactivityTurnOff(deviceId, portNumberInDevice, actualPortId, currentSessionId),
            CONFIG.INACTIVITY_TIMEOUT_SECONDS * 1000
          ),
          lastConsumptionTime: Date.now(),
        };
      }
    } else {
      console.log(`MQTT: Consumption stored for ${deviceId} Port ${portNumberInDevice} but no active session.`);
    }
  } else {
    console.warn(`MQTT: Ignoring invalid consumption (${consumptionAmps}A) for ${deviceId} Port ${portNumberInDevice}`);
  }
}

// Main MQTT message dispatcher
async function handleMqttMessage(topic, message) {
  console.log(`Received message on ${topic}: ${message.toString()}`);
  const messageString = message.toString();

  try {
    let payload;
    if (topic === `${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}` && messageString === 'offline') {
      payload = {
        status: 'offline',
        charger_state: CHARGER_STATES.UNKNOWN,
        timestamp: Date.now(),
        port_number: -1,
      };
      console.warn(`MQTT: Converted plain "offline" LWT to JSON for ${topic}`);
    } else {
      payload = JSON.parse(messageString);
    }

    console.log(`MQTT: Parsed payload for ${topic}:`, JSON.stringify(payload, null, 2));

    const deviceId = topic.split('/')[2];
    const portNumberInDevice = payload.port_number;

    // Guard: skip invalid port_number for usage/status unless it's station-level status
    if (
      (topic.startsWith(MQTT_TOPICS.USAGE) || topic.startsWith(MQTT_TOPICS.STATUS)) &&
      (portNumberInDevice === undefined || portNumberInDevice < 1)
    ) {
      if (topic === `${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}` && (payload.status === 'online' || payload.status === 'offline')) {
        console.log(`MQTT: Station ${deviceId} is ${payload.status}. No specific port_id.`);
        return;
      }
      console.warn(`MQTT: Received message on ${topic} from ${deviceId} without valid port_number. Skipping.`);
      return;
    }

    // Look up actual port_id (UUID)
    const portIdResult = await pool.query(
      'SELECT port_id, is_premium FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
      [deviceId, portNumberInDevice]
    );
    const actualPortId = portIdResult.rows[0]?.port_id;
    const isPremiumPort = portIdResult.rows[0]?.is_premium;

    if (!actualPortId) {
      console.warn(`MQTT: No charging_port found for device_id: ${deviceId} and port_number_in_device: ${portNumberInDevice}. Skipping.`);
      return;
    }

    const sessionKey = `${deviceId}_${portNumberInDevice}`;

    if (topic.startsWith(MQTT_TOPICS.USAGE)) {
      await processUsageMessage(payload, deviceId, portNumberInDevice, actualPortId, isPremiumPort);
    } else if (topic.startsWith(MQTT_TOPICS.STATUS)) {
      await handleMqttStatusMessage(payload, deviceId, actualPortId, isPremiumPort);
    } else if (topic.startsWith('station/')) {
      console.log(`MQTT: Processing generic station data: ${JSON.stringify(payload)}`);
    }
  } catch (error) {
    console.error('MQTT: Error processing message:', error);
    await logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Error processing message on topic "${topic}": ${error.message}`);
  }
}

// ============================
// Public API methods for controllers
// ============================

// Start a charging session (ON command via API)
async function startSession({ deviceId, portNumber, userId, stationId }) {
  const sessionKey = `${deviceId}_${portNumber}`;
  let unlock;
  try {
    unlock = await acquireSessionLock(sessionKey);
  } catch (lockError) {
    console.error(`Failed to acquire session lock for ${sessionKey}:`, lockError);
    throw { status: 409, message: 'Port is currently busy. Please try again in a moment.', details: lockError.message };
  }

  try {
    // Validate user and quota
    const quotaCheck = await subscriptionService.checkUserQuota(userId);
    if (!quotaCheck.canCharge) {
      throw { status: 403, message: 'Daily quota exceeded', quotaInfo: quotaCheck };
    }

    // Check active session slots
    const activeCount = await subscriptionService.checkUserActiveSessions(userId);
    if (activeCount >= CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS) {
      const msg = `You can only have ${CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS} active charging session${CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS > 1 ? 's' : ''} at a time.`;
      throw { status: 409, message: msg, slotInfo: { activeSessions: activeCount, maxSlots: CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS } };
    }

    // Find port_id and is_premium
    const portResult = await pool.query(
      'SELECT port_id, is_premium FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
      [deviceId, parseInt(portNumber)]
    );
    const actualPortId = portResult.rows[0]?.port_id;
    const isPremiumPort = portResult.rows[0]?.is_premium;
    if (!actualPortId) {
      throw { status: 404, message: `Port ${portNumber} not found for device ${deviceId}.` };
    }

    // Check for existing active session on this port
    const existingSession = await pool.query(
      'SELECT session_id, user_id FROM charging_session WHERE port_id = $1 AND session_status = $2',
      [actualPortId, SESSION_STATUS.ACTIVE]
    );

    let currentSessionId;
    if (existingSession.rows.length === 0) {
      const sessionResult = await pool.query(
        `INSERT INTO charging_session
         (user_id, port_id, station_id, start_time, session_status, is_premium, energy_consumed_kwh, total_mah_consumed, initial_total_mah, last_status_update)
         VALUES ($1, $2, $3, NOW(), $4, $5, 0, 0, NULL, NOW())
         RETURNING session_id`,
        [userId, actualPortId, stationId, SESSION_STATUS.ACTIVE, isPremiumPort]
      );
      currentSessionId = sessionResult.rows[0].session_id;
      activeChargerSessions[sessionKey] = currentSessionId;
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New charging session ${currentSessionId} started for ${sessionKey} by user ${userId}`, userId);
    } else {
      // Port occupied by same user (resume)
      if (existingSession.rows[0].user_id !== userId) {
        throw { status: 409, message: 'Port is currently occupied by another user.' };
      }
      currentSessionId = existingSession.rows[0].session_id;
      activeChargerSessions[sessionKey] = currentSessionId;
      await pool.query("UPDATE charging_session SET last_status_update = NOW() WHERE session_id = $1", [currentSessionId]);
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Resumed active session ${currentSessionId} for ${sessionKey} by user ${userId}`, userId);
    }

    // Start inactivity timer
    if (activePortTimers[sessionKey]) {
      clearTimeout(activePortTimers[sessionKey].timerId);
    }
    activePortTimers[sessionKey] = {
      timerId: setTimeout(
        () => handleInactivityTurnOff(deviceId, portNumber, actualPortId, currentSessionId),
        CONFIG.INACTIVITY_TIMEOUT_SECONDS * 1000
      ),
      lastConsumptionTime: Date.now(),
    };
    console.log(`API: Inactivity timer started for ${sessionKey}.`);

    // Send MQTT ON command
    const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
    const mqttPayload = JSON.stringify({ command: CHARGER_STATES.ON, port_number: parseInt(portNumber) });
    if (global.mqttClient) {
      global.mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`Failed to publish ON command to ${controlTopic}:`, err);
          logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed ON command for ${sessionKey}: ${err.message}`);
        } else {
          console.log(`API: Sent MQTT ON to ${deviceId} Port ${portNumber}.`);
        }
      });
    }

    // Update port status to charging immediately (optimistic)
    const newPortStatus = isPremiumPort ? PORT_STATUS.CHARGING_PREMIUM : PORT_STATUS.CHARGING_FREE;
    await pool.query(
      `UPDATE charging_port
       SET current_status = $1, is_occupied = true, last_status_update = NOW()
       WHERE port_id = $2`,
      [newPortStatus, actualPortId]
    );

    return { status: 'Command sent', deviceId, portNumber: parseInt(portNumber), command: 'ON', sessionId: currentSessionId };
  } finally {
    if (unlock) unlock();
  }
}

// Stop a charging session (OFF command via API)
async function stopSession({ deviceId, portNumber, userId }) {
  const sessionKey = `${deviceId}_${portNumber}`;
  let unlock;
  try {
    unlock = await acquireSessionLock(sessionKey);
  } catch (lockError) {
    console.error(`Failed to acquire session lock for ${sessionKey}:`, lockError);
    throw { status: 409, message: 'Port is currently busy. Please try again in a moment.', details: lockError.message };
  }

  try {
    const internalPortNumber = parseInt(portNumber);
    const portResult = await pool.query(
      'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
      [deviceId, internalPortNumber]
    );
    const actualPortId = portResult.rows[0]?.port_id;
    if (!actualPortId) {
      throw { status: 404, message: `Port ${portNumber} not found for device ${deviceId}.` };
    }

    const sessionCheck = await pool.query(
      `SELECT session_id, user_id, energy_consumed_kwh, energy_consumed_mah
       FROM charging_session
       WHERE port_id = $1 AND session_status = $2`,
      [actualPortId, SESSION_STATUS.ACTIVE]
    );

    if (sessionCheck.rows.length > 0) {
      const dbSession = sessionCheck.rows[0];
      if (dbSession.user_id !== userId) {
        throw { status: 403, message: 'You can only end your own active session on this port.' };
      }

      const sessionId = dbSession.session_id;
      const energyConsumed = parseFloat(dbSession.energy_consumed_kwh) || 0;
      // user_usage.total_consumed_mah is INTEGER, so round to whole number
      const mAhConsumed = Math.round(parseFloat(dbSession.energy_consumed_mah) || 0);

      const sessionCost = await calculateSessionCost(sessionId, mAhConsumed);

      await pool.query(
        `UPDATE charging_session
         SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2
         WHERE session_id = $3 AND session_status = $4`,
        [SESSION_STATUS.COMPLETED, sessionCost, sessionId, SESSION_STATUS.ACTIVE]
      );

      await pool.query(
        `INSERT INTO user_usage (user_id, total_consumed_mah, last_reset_at)
         VALUES ($2, $1, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET total_consumed_mah = user_usage.total_consumed_mah + EXCLUDED.total_consumed_mah`,
        [mAhConsumed, userId]
      );

      delete activeChargerSessions[sessionKey];
      if (activePortTimers[sessionKey]) {
        clearTimeout(activePortTimers[sessionKey].timerId);
        delete activePortTimers[sessionKey];
      }
      fullChargeNotificationState.delete(sessionId);

      // Send MQTT OFF command
      const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
      const mqttPayload = JSON.stringify({ command: CHARGER_STATES.OFF, port_number: internalPortNumber });
      if (global.mqttClient) {
        global.mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
          if (err) {
            console.error(`Failed to publish OFF command to ${controlTopic}:`, err);
            logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed OFF command for ${sessionKey}: ${err.message}`);
          } else {
            console.log(`API: Sent MQTT OFF to ${deviceId} Port ${portNumber}.`);
          }
        });
      }

      // Update port status to available
      await pool.query(
        `UPDATE charging_port
         SET current_status = $1, is_occupied = false, last_status_update = NOW()
         WHERE port_id = $2`,
        [PORT_STATUS.AVAILABLE, actualPortId]
      );

      await logSystemEvent(
        LOG_TYPES.INFO,
        LOG_SOURCES.API,
        `Session ${sessionId} ended for ${sessionKey}. Cost: $${sessionCost.toFixed(2)}`,
        userId
      );

      return { status: 'Command sent', deviceId, portNumber: internalPortNumber, command: 'OFF', sessionId };
    } else {
      console.log(`API: No active session for ${deviceId} Port ${internalPortNumber} when stopping.`);
      // Still send OFF anyway
      const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
      const mqttPayload = JSON.stringify({ command: CHARGER_STATES.OFF, port_number: internalPortNumber });
      if (global.mqttClient) {
        global.mqttClient.publish(controlTopic, mqttPayload, { qos: 1 });
      }
      return { status: 'No active session', commandSent: true };
    }
  } finally {
    if (unlock) unlock();
  }
}

// Get all device status summary
async function getAllDeviceStatus() {
  const result = await pool.query(`
    SELECT
      cp.device_mqtt_id as device_id,
      cp.port_id,
      COALESCE(cds.status_message, 'online') as status_message,
      COALESCE(cds.charger_state, 'OFF') as charger_state,
      COALESCE(cds.last_update, NOW()) as last_update,
      cp.port_number_in_device,
      cs.total_mah_consumed,
      cs.energy_consumed_kwh,
      cs.session_id
    FROM charging_port cp
    LEFT JOIN current_device_status cds ON cp.port_id = cds.port_id
    LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = $1
    ORDER BY cp.device_mqtt_id, cp.port_number_in_device
  `, [SESSION_STATUS.ACTIVE]);
  return result.rows;
}

// Get all device consumption data
async function getAllDeviceConsumption() {
  const result = await pool.query(`
    SELECT
      cp.device_mqtt_id as device_id,
      cp.port_number_in_device as port_number,
      COALESCE(cs.total_mah_consumed, 0) as total_mah_consumed,
      COALESCE(cs.energy_consumed_kwh, 0) as energy_consumed_kwh,
      COALESCE(cs.last_status_update, NOW()) as timestamp,
      (SELECT AVG(sub.consumption_watts)
       FROM (
         SELECT consumption_watts
         FROM consumption_data cd
         WHERE cd.device_id = cp.device_mqtt_id
           AND cd.port_number = cp.port_number_in_device
           AND cd.timestamp > NOW() - INTERVAL '1 minute'
         ORDER BY cd.timestamp DESC
         LIMIT 6
       ) sub) as recent_consumption_watts
    FROM charging_port cp
    LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = $1
    ORDER BY cp.device_mqtt_id, cp.port_number_in_device
  `, [SESSION_STATUS.ACTIVE]);

  return result.rows.map((row) => {
    const totalMah = Number(row.total_mah_consumed) || 0;
    const recentAmps = Number(row.recent_consumption_watts) || 0;
    const currentConsumption = recentAmps > 0 ? recentAmps * 1000 : 0;
    return {
      device_id: row.device_id,
      port_number: row.port_number,
      total_mah: totalMah,
      current_consumption: currentConsumption,
      energy_consumed_kwh: Number(row.energy_consumed_kwh) || 0,
      timestamp: row.timestamp,
    };
  });
}

// Get consumption for a specific device/port
async function getDeviceConsumption(deviceId, portNumber) {
  const portIdResult = await pool.query(
    'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
    [deviceId, parseInt(portNumber)]
  );
  const actualPortId = portIdResult.rows[0]?.port_id;
  if (!actualPortId) {
    throw { status: 404, message: 'Port not found for this device.' };
  }

  const result = await pool.query(
    `SELECT consumption_watts, timestamp, charger_state
     FROM consumption_data
     WHERE device_id = $1 AND session_id IN (
       SELECT session_id FROM charging_session WHERE port_id = $2
     )
     ORDER BY timestamp DESC
     LIMIT 100`,
    [deviceId, actualPortId]
  );
  return result.rows;
}

// Sync full station state (status, consumption, active sessions)
async function reconcileStationState(stationId) {
  if (!stationId) return;

  const statusResult = await pool.query(`
    SELECT
      cp.device_mqtt_id as device_id,
      cp.port_id,
      COALESCE(cds.status_message, 'online') as status_message,
      COALESCE(cds.charger_state, 'OFF') as charger_state,
      COALESCE(cds.last_update, NOW()) as last_update,
      cp.port_number_in_device,
      cs.total_mah_consumed,
      cs.energy_consumed_kwh,
      cs.session_id
    FROM charging_port cp
    LEFT JOIN current_device_status cds ON cp.port_id = cds.port_id
    LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = $2
    WHERE cp.station_id = $1
    ORDER BY cp.device_mqtt_id, cp.port_number_in_device
  `, [stationId, SESSION_STATUS.ACTIVE]);

  const consumptionResult = await pool.query(`
    SELECT
      cp.device_mqtt_id as device_id,
      cp.port_number_in_device as port_number,
      COALESCE(cs.total_mah_consumed, 0) as total_mah_consumed,
      COALESCE(cs.energy_consumed_kwh, 0) as energy_consumed_kwh,
      COALESCE(cs.last_status_update, NOW()) as timestamp,
      (SELECT AVG(sub.consumption_watts)
       FROM (
         SELECT consumption_watts
         FROM consumption_data cd
         WHERE cd.device_id = cp.device_mqtt_id
           AND cd.port_number = cp.port_number_in_device
           AND cd.timestamp > NOW() - INTERVAL '1 minute'
         ORDER BY cd.timestamp DESC
         LIMIT 6
       ) sub) as recent_consumption_watts
    FROM charging_port cp
    LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = $2
    WHERE cp.station_id = $1
    ORDER BY cp.device_mqtt_id, cp.port_number_in_device
  `, [stationId, SESSION_STATUS.ACTIVE]);

  const consumptionData = consumptionResult.rows.map((row) => {
    const totalMah = Number(row.total_mah_consumed) || 0;
    const recentAmps = Number(row.recent_consumption_watts) || 0;
    const currentConsumption = recentAmps > 0 ? recentAmps * 1000 : 0;
    return {
      device_id: row.device_id,
      port_number: row.port_number,
      total_mah: totalMah,
      current_consumption: currentConsumption,
      energy_consumed_kwh: Number(row.energy_consumed_kwh) || 0,
      timestamp: row.timestamp,
    };
  });

  const activeSessionsResult = await pool.query(
    `SELECT session_id, user_id, port_id, station_id, start_time, energy_consumed_kwh, energy_consumed_mah
     FROM charging_session
     WHERE station_id = $1 AND session_status = $2`,
    [stationId, SESSION_STATUS.ACTIVE]
  );

  return {
    status: statusResult.rows,
    consumption: consumptionData,
    activeSessions: activeSessionsResult.rows,
  };
}

// ============= User Usage Analytics =============

/**
 * Get aggregated usage statistics for a user across all charging sessions
 * Returns total sessions, duration, energy, and cost for the current month
 */
async function getUserUsageStats(userId) {
  // Calculate start and end of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const result = await pool.query(`
    SELECT
      COUNT(session_id) as total_sessions,
      COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))/60), 0) as total_duration_minutes,
      COALESCE(SUM(energy_consumed_kwh), 0) as total_energy_kwh,
      COALESCE(SUM(energy_consumed_mah), 0) as total_energy_mah,
      COALESCE(SUM(cost), 0) as total_cost
    FROM charging_session
    WHERE user_id = $1
      AND start_time >= $2
      AND start_time <= $3
      AND session_status = ANY($4::session_status[])
  `, [userId, startOfMonth, endOfMonth, [SESSION_STATUS.COMPLETED, SESSION_STATUS.ACTIVE]]);

  const row = result.rows[0];
  return {
    totalSessions: Number(row.total_sessions) || 0,
    totalDuration: Math.round(Number(row.total_duration_minutes) || 0),
    totalEnergyKWH: Number(row.total_energy_kwh) || 0,
    totalEnergyMAH: Number(row.total_energy_mah) || 0,
    totalCost: Number(row.total_cost) || 0,
  };
}

// Expose mqttClient setter (called from mqtt.js at init)
function setMqttClient(client) {
  global.mqttClient = client;
}

module.exports = {
  handleMqttMessage,
  startSession,
  stopSession,
  getAllDeviceStatus,
  getAllDeviceConsumption,
  getDeviceConsumption,
  reconcileStationState,
  setMqttClient,
  getActiveSessionForPort,
  getLatestUserDeviceTelemetry,
  calculateSessionCost,
  getUserUsageStats,
};

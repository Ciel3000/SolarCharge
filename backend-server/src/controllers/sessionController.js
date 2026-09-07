// src/controllers/sessionController.js
// Session-related endpoints

const chargingService = require('../services/chargingService');
const pool = require('../config/database');
const { SESSION_STATUS } = require('../utils/constants');

// GET /api/sessions/active - Public list of active sessions
async function getActiveSessionsPublic(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        cs.session_id,
        cs.user_id,
        CONCAT(u.fname, ' ', u.lname) AS user_name,
        cs.port_id,
        cp.port_number_in_device,
        cs.station_id,
        s.station_name,
        cs.start_time,
        cs.energy_consumed_kwh,
        cs.energy_consumed_mah,
        cs.total_mah_consumed,
        cs.session_status,
        cs.last_status_update,
        cs.cost
      FROM charging_session cs
      JOIN users u ON cs.user_id = u.user_id
      JOIN charging_port cp ON cs.port_id = cp.port_id
      JOIN charging_station s ON cs.station_id = s.station_id
      WHERE cs.session_status = ?
      ORDER BY cs.start_time DESC
    `, [SESSION_STATUS.ACTIVE]);

    // Transform to match frontend expectations: alias port_number_in_device as port_number
    const activeSessions = result[0].map(session => ({
      ...session, // include all original fields
      port_number: session.port_number_in_device // add alias for frontend compatibility
    }));

    res.json(activeSessions);
  } catch (err) {
    next(err);
  }
}

// GET /api/sessions/active/user - Auth: user's own active sessions
async function getUserActiveSessions(req, res, next) {
  const { user_id } = req.user;
  try {
    const result = await pool.query(`
      SELECT
        cs.session_id,
        cs.start_time,
        cs.total_mah_consumed,
        cs.energy_consumed_kwh,
        cp.port_number_in_device,
        cp.device_mqtt_id,
        s.station_name,
        s.station_id
      FROM charging_session cs
      JOIN charging_port cp ON cs.port_id = cp.port_id
      JOIN charging_station s ON cs.station_id = s.station_id
      WHERE cs.user_id = ? AND cs.session_status = ?
      ORDER BY cs.start_time DESC
    `, [user_id, SESSION_STATUS.ACTIVE]);

    // Transform to match frontend expectations: alias port_number_in_device as port_number
    const sessions = result[0].map(row => ({
      session_id: row.session_id,
      start_time: row.start_time,
      total_mah_consumed: row.total_mah_consumed,
      energy_consumed_kwh: row.energy_consumed_kwh,
      port_number: row.port_number_in_device, // Alias to match frontend
      device_mqtt_id: row.device_mqtt_id,
      station_name: row.station_name,
      station_id: row.station_id
    }));

    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

// GET /api/sessions/:sessionId/consumption - Auth: view session consumption details
async function getSessionConsumption(req, res, next) {
  const { sessionId } = req.params;
  const { user_id } = req.user;

  try {
    const sessionResult = await pool.query(`
      SELECT
        cs.session_id,
        cs.energy_consumed_kwh,
        cs.energy_consumed_mah,
        cs.total_mah_consumed,
        cs.start_time,
        cs.end_time,
        cs.session_status,
        cs.cost,
        CONCAT(u.fname, ' ', u.lname) AS user_name,
        cp.port_number_in_device,
        s.station_name
      FROM charging_session cs
      JOIN users u ON cs.user_id = u.user_id
      JOIN charging_port cp ON cs.port_id = cp.port_id
      JOIN charging_station s ON cs.station_id = s.station_id
      WHERE cs.session_id = ? AND cs.user_id = ?
    `, [sessionId, user_id]);

    if (sessionResult[0].length === 0) {
      return res.status(404).json({ error: 'Session not found or not owned by user' });
    }

    // Get consumption data for this session
    const consumptionResult = await pool.query(`
      SELECT consumption_watts, timestamp, charger_state
      FROM consumption_data
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `, [sessionId]);

    res.json({
      session: sessionResult[0][0],
      consumption: consumptionResult[0],
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/stations/:stationId/consumption - Auth: station consumption overview
async function getStationConsumption(req, res, next) {
  const { stationId } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        cp.port_number_in_device,
        cp.device_mqtt_id,
        COALESCE(cs.total_mah_consumed, 0) as total_mah,
        COALESCE(cs.energy_consumed_kwh, 0) as energy_kwh,
        cs.session_status,
        cs.last_status_update as timestamp,
        (SELECT cd.consumption_watts
         FROM consumption_data cd
         WHERE cd.device_id = cp.device_mqtt_id
           AND cd.port_number = cp.port_number_in_device
         ORDER BY cd.timestamp DESC
         LIMIT 1) as current_consumption_watts
      FROM charging_port cp
      LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = ?
      WHERE cp.station_id = ? AND cp.is_premium = true
      ORDER BY cp.port_number_in_device
    `, [SESSION_STATUS.ACTIVE, stationId]);

    const consumptionData = result[0].map(row => {
      const currentWatts = Number(row.current_consumption_watts) || 0;
      // Watts to Amps conversion (assuming nominal voltage)
      const currentConsumption = currentWatts > 0 ? (currentWatts / 13) * 1000 : 0;
      return {
        port_number: row.port_number_in_device,
        device_id: row.device_mqtt_id,
        total_mah: Number(row.total_mah) || 0,
        current_consumption: currentConsumption,
        energy_kwh: Number(row.energy_kwh) || 0,
        session_status: row.session_status,
        timestamp: row.timestamp,
      };
    });

    res.json(consumptionData);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getActiveSessionsPublic,
  getUserActiveSessions,
  getSessionConsumption,
  getStationConsumption,
};

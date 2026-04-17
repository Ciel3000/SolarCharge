// src/services/stationService.js
// Station and port management

const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logSystemEvent } = require('./logger');
const {
  LOG_TYPES,
  LOG_SOURCES,
  PORT_STATUS,
  CONFIG,
  SESSION_STATUS,
} = require('../utils/constants');

// Public: Get all active stations with summary
function getAllStations() {
  return pool.query(`
    SELECT 
      s.station_id,
      s.station_name,
      s.location_description,
      s.latitude,
      s.longitude,
      s.is_active,
      s.current_battery_level,
      s.price_per_mah,
      COUNT(p.port_id) as total_ports,
      COUNT(CASE WHEN p.current_status = 'available' THEN 1 END) as available_ports
    FROM charging_station s
    LEFT JOIN charging_port p ON s.station_id = p.station_id
    GROUP BY s.station_id
    ORDER BY s.station_name
  `).then(res => res.rows);
}

// Public: Get single station details
function getStationById(stationId) {
  return pool.query(
    'SELECT * FROM charging_station WHERE station_id = $1',
    [stationId]
  ).then(res => res.rows[0]);
}

// Admin: Get all stations for admin dashboard (includes more fields)
function getAllStationsAdmin() {
  return pool.query(`
    SELECT 
      s.station_id,
      s.station_name,
      s.location_description,
      s.latitude,
      s.longitude,
      s.solar_panel_wattage,
      s.battery_capacity_mah,
      s.current_battery_level,
      s.is_active,
      s.created_at,
      s.last_maintenance_date,
      s.price_per_mah,
      COALESCE(s.device_mqtt_id, p.device_mqtt_id, 'ESP32_CHARGER_STATION_001') as device_mqtt_id,
      s.num_free_ports,
      s.num_premium_ports,
      COUNT(p.port_id) as total_ports
    FROM charging_station s
    LEFT JOIN charging_port p ON s.station_id = p.station_id
    GROUP BY s.station_id, s.station_name, s.location_description, s.latitude, s.longitude,
             s.solar_panel_wattage, s.battery_capacity_mah, s.current_battery_level,
             s.is_active, s.created_at, s.last_maintenance_date, s.price_per_mah,
             s.device_mqtt_id, p.device_mqtt_id, s.num_free_ports, s.num_premium_ports
    ORDER BY s.created_at DESC
  `).then(res => res.rows);
}

// Admin: Create station with ports
async function createStation({
  station_name,
  location_description,
  latitude,
  longitude,
  solar_panel_wattage,
  battery_capacity_mah,
  device_mqtt_id,
  num_free_ports,
  num_premium_ports,
  is_active,
  current_battery_level,
  price_per_mah,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stationResult = await client.query(
      `INSERT INTO charging_station
       (station_name, location_description, latitude, longitude, solar_panel_wattage,
        battery_capacity_mah, is_active, current_battery_level, created_at, price_per_mah, device_mqtt_id, num_free_ports, num_premium_ports)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
       RETURNING station_id`,
      [
        station_name,
        location_description,
        latitude,
        longitude,
        solar_panel_wattage,
        battery_capacity_mah,
        is_active,
        current_battery_level,
        price_per_mah,
        device_mqtt_id,
        num_free_ports,
        num_premium_ports,
      ]
    );

    const stationId = stationResult.rows[0].station_id;

    // Only create premium ports (since system detects them)
    for (let i = 0; i < num_premium_ports; i++) {
      await client.query(
        `INSERT INTO charging_port
         (station_id, port_number_in_device, is_premium, is_occupied, current_status, device_mqtt_id)
         VALUES ($1, $2, true, false, $3, $4)`,
        [stationId, i + 1, PORT_STATUS.AVAILABLE, device_mqtt_id]
      );
    }

    await client.query('COMMIT');
    await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New station ${stationId} created by admin`);
    return { station_id: stationId };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create station error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Admin: Update station
async function updateStation(stationId, updates) {
  const {
    station_name,
    location_description,
    latitude,
    longitude,
    solar_panel_wattage,
    battery_capacity_mah,
    device_mqtt_id,
    num_free_ports,
    num_premium_ports,
    is_active,
    current_battery_level,
    price_per_mah,
  } = updates;

  const result = await pool.query(
    `UPDATE charging_station
     SET station_name = $1, location_description = $2, latitude = $3, longitude = $4,
         solar_panel_wattage = $5, battery_capacity_mah = $6, is_active = $7,
         current_battery_level = $8, price_per_mah = $9, device_mqtt_id = $10,
         num_free_ports = $11, num_premium_ports = $12
     WHERE station_id = $13
     RETURNING station_id`,
    [
      station_name,
      location_description,
      latitude,
      longitude,
      solar_panel_wattage,
      battery_capacity_mah,
      is_active,
      current_battery_level,
      price_per_mah,
      device_mqtt_id,
      num_free_ports,
      num_premium_ports,
      stationId,
    ]
  );
  if (result.rows.length === 0) {
    throw new Error('Station not found');
  }
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Station ${stationId} updated by admin`);
  return result.rows[0];
}

// Admin: Delete station (cascading)
async function deleteStation(stationId) {
  // Verify station exists
  const check = await pool.query('SELECT station_id FROM charging_station WHERE station_id = $1', [stationId]);
  if (check.rows.length === 0) throw new Error('Station not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete related data in order (FK constraints)
    await client.query(
      `DELETE FROM consumption_data
       WHERE session_id IN (SELECT session_id FROM charging_session WHERE station_id = $1)`,
      [stationId]
    );
    await client.query(
      `DELETE FROM current_device_status
       WHERE port_id IN (SELECT port_id FROM charging_port WHERE station_id = $1)`,
      [stationId]
    );
    await client.query(
      `DELETE FROM device_status_logs
       WHERE port_id IN (SELECT port_id FROM charging_port WHERE station_id = $1)`,
      [stationId]
    );
    await client.query(`DELETE FROM charging_session WHERE station_id = $1`, [stationId]);
    await client.query(`DELETE FROM charging_port WHERE station_id = $1`, [stationId]);
    await client.query(`DELETE FROM station_maintenance WHERE station_id = $1`, [stationId]);
    await client.query(`DELETE FROM charging_station WHERE station_id = $1`, [stationId]);

    await client.query('COMMIT');
    await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Station ${stationId} and related data deleted by admin`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete station error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ============= Admin Stats =============

async function getAdminDashboardStats() {
  const [users, stations, ports, sessions, revenue] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active FROM users`),
    pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_active = true THEN 1 END) as active FROM charging_station`),
    pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN current_status = 'available' THEN 1 END) as available FROM charging_port`),
    pool.query(`
      SELECT
        COUNT(CASE WHEN start_time > CURRENT_DATE THEN 1 END) as today,
        COUNT(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week,
        COUNT(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month
      FROM charging_session
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN cost ELSE 0 END), 0) as today,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN cost ELSE 0 END), 0) as week,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN cost ELSE 0 END), 0) as month
      FROM charging_session
    `),
  ]);

  return {
    users: users.rows[0],
    stations: stations.rows[0],
    ports: ports.rows[0],
    sessions: sessions.rows[0],
    revenue: revenue.rows[0],
  };
}

async function getRecentSessions(limit = 5) {
  const result = await pool.query(`
    SELECT
      cs.session_id as id,
      CONCAT(u.fname, ' ', u.lname) as user_name,
      s.station_name,
      cp.port_number_in_device as port,
      cs.start_time,
      cs.end_time,
      EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time))/60 as duration,
      cs.energy_consumed_kwh as energy,
      cs.energy_consumed_mah as energy_mah,
      cs.cost,
      cs.session_status as status
    FROM charging_session cs
    JOIN users u ON cs.user_id = u.user_id
    JOIN charging_station s ON cs.station_id = s.station_id
    JOIN charging_port cp ON cs.port_id = cp.port_id
    ORDER BY cs.start_time DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

async function getSystemStatus() {
  const [errors, statusLog] = await Promise.all([
    pool.query(`SELECT COUNT(*) as error_count FROM system_logs WHERE log_type = 'error' AND timestamp > NOW() - INTERVAL '24 hours'`),
    pool.query(`SELECT timestamp as last_update FROM system_logs ORDER BY timestamp DESC LIMIT 1`),
  ]);
  const status = errors.rows[0].error_count > 0 ? 'Warning' : 'Operational';
  const lastUpdate = statusLog.rows.length > 0 ? statusLog.rows[0].last_update : new Date();
  return { status, lastUpdate };
}

async function getBatteryLevels() {
  const result = await pool.query(`
    SELECT
      station_name,
      current_battery_level as level,
      CASE
        WHEN current_battery_level > 70 THEN 'Good'
        WHEN current_battery_level > 40 THEN 'Warning'
        ELSE 'Critical'
      END as status
    FROM charging_station
    ORDER BY station_name
  `);
  return result.rows;
}

async function getSessionsAdmin({ range = 'week', station = 'all', status = 'all' }) {
  let timeFilter;
  switch (range) {
    case 'day': timeFilter = "start_time > CURRENT_DATE"; break;
    case 'week': timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'"; break;
    case 'month': timeFilter = "start_time > CURRENT_DATE - INTERVAL '30 days'"; break;
    case 'year': timeFilter = "start_time > CURRENT_DATE - INTERVAL '365 days'"; break;
    default: timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'";
  }

  let stationFilter = station !== 'all' ? `AND cs.station_id = '${station}'` : '';
  let statusFilter = status !== 'all' ? `AND cs.session_status = '${status}'` : '';

  const base = `
    SELECT
      cs.session_id as id,
      CONCAT(u.fname, ' ', u.lname) as user_name,
      s.station_name,
      cp.port_number_in_device as port,
      cs.start_time,
      cs.end_time,
      EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time))/60 as duration,
      cs.energy_consumed_kwh as energy,
      cs.energy_consumed_mah as energy_mah,
      cs.cost,
      cs.session_status as status
    FROM charging_session cs
    JOIN users u ON cs.user_id = u.user_id
    JOIN charging_station s ON cs.station_id = s.station_id
    JOIN charging_port cp ON cs.port_id = cp.port_id
    WHERE ${timeFilter}
  `;

  const fullQuery = base + ` ${stationFilter} ${statusFilter} ORDER BY cs.start_time DESC`;
  const result = await pool.query(fullQuery);
  return result.rows;
}

async function getRevenueStats({ range = 'week' }) {
  let timeFilter;
  switch (range) {
    case 'day': timeFilter = "start_time > CURRENT_DATE"; break;
    case 'week': timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'"; break;
    case 'month': timeFilter = "start_time > CURRENT_DATE - INTERVAL '30 days'"; break;
    case 'year': timeFilter = "start_time > CURRENT_DATE - INTERVAL '365 days'"; break;
    default: timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'";
  }
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN cost ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN cost ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN cost ELSE 0 END), 0) as month
    FROM charging_session
    WHERE ${timeFilter}
  `);
  return result.rows[0];
}

async function getUsageStats({ range = 'week' }) {
  let timeFilter;
  switch (range) {
    case 'day': timeFilter = "start_time > CURRENT_DATE"; break;
    case 'week': timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'"; break;
    case 'month': timeFilter = "start_time > CURRENT_DATE - INTERVAL '30 days'"; break;
    case 'year': timeFilter = "start_time > CURRENT_DATE - INTERVAL '365 days'"; break;
    default: timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'";
  }
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN energy_consumed_kwh ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN energy_consumed_kwh ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN energy_consumed_kwh ELSE 0 END), 0) as month
    FROM charging_session
    WHERE ${timeFilter}
  `);
  return result.rows[0];
}

async function getAdminLogs(limit = 100) {
  const result = await pool.query(
    `SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============= Additional Helpers =============

// Get station consumption data (authenticated)
async function getStationConsumption(stationId) {
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
    LEFT JOIN charging_session cs ON cp.port_id = cs.port_id AND cs.session_status = $1
    WHERE cp.station_id = $2 AND cp.is_premium = true
    ORDER BY cp.port_number_in_device
  `, [SESSION_STATUS.ACTIVE, stationId]);

  return result.rows.map(row => {
    const currentWatts = Number(row.current_consumption_watts) || 0;
    const currentConsumption = currentWatts > 0 ? (currentWatts / CONFIG.NOMINAL_CHARGING_VOLTAGE_DC) * 1000 : 0;
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
}

// Get port by device and port number
function getPortByDeviceAndNumber(deviceId, portNumber) {
  return pool.query(
    `SELECT cp.port_id, cp.is_premium, cs.station_id
     FROM charging_port cp
     JOIN charging_station cs ON cp.station_id = cs.station_id
     WHERE cp.device_mqtt_id = $1 AND cp.port_number_in_device = $2`,
    [deviceId, portNumber]
  ).then(res => res.rows[0]);
}

module.exports = {
  // Stations (public)
  getAllStations,
  getStationById,

  // Stations (admin)
  getAllStationsAdmin,
  createStation,
  updateStation,
  deleteStation,

  // Admin Dashboard
  getAdminDashboardStats,
  getRecentSessions,
  getSystemStatus,
  getBatteryLevels,
  getSessionsAdmin,
  getRevenueStats,
  getUsageStats,
  getAdminLogs,

  // Additional
  getStationConsumption,

  // Helpers
  getPortByDeviceAndNumber,
};

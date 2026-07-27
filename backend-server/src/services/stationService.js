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
async function getAllStations() {
  const [rows] = await pool.query(`
    SELECT
      s.station_id,
      s.station_name,
      s.location_description,
      s.latitude,
      s.longitude,
      s.is_active,
      s.current_battery_level,
      s.price_per_mah,
      s.num_free_ports,
      s.num_premium_ports,
      s.device_mqtt_id,
      COUNT(p.port_id) as total_ports,
      SUM(CASE WHEN p.current_status = 'available' THEN 1 ELSE 0 END) as available_ports,
      SUM(CASE WHEN p.current_status = 'available' AND p.is_premium = true THEN 1 ELSE 0 END) as available_premium_ports
    FROM charging_station s
    LEFT JOIN charging_port p ON s.station_id = p.station_id
    GROUP BY s.station_id, s.device_mqtt_id
    ORDER BY s.station_name
  `);
  return rows;
}

// Public: Get single station details
async function getStationById(stationId) {
  const [rows] = await pool.query(`
    SELECT
      s.*,
      COUNT(p.port_id) as total_ports,
      SUM(CASE WHEN p.current_status = 'available' THEN 1 ELSE 0 END) as available_ports,
      SUM(CASE WHEN p.current_status = 'available' AND p.is_premium = true THEN 1 ELSE 0 END) as available_premium_ports
    FROM charging_station s
    LEFT JOIN charging_port p ON s.station_id = p.station_id
    WHERE s.station_id = ?
    GROUP BY s.station_id
  `, [stationId]);
  return rows[0];
}

// Admin: Get all stations for admin dashboard (includes more fields)
async function getAllStationsAdmin() {
  const [rows] = await pool.query(`
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
  `);
  return rows;
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
  const client = await pool.getConnection();
  try {
    await client.query('BEGIN');

    const [stationResult] = await client.query(
      `INSERT INTO charging_station
       (station_name, location_description, latitude, longitude, solar_panel_wattage,
        battery_capacity_mah, is_active, current_battery_level, created_at, price_per_mah, device_mqtt_id, num_free_ports, num_premium_ports)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
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

    const stationId = stationResult.insertId;

    // Create all ports (both free and premium)
    const totalPorts = num_free_ports + num_premium_ports;
    for (let i = 0; i < totalPorts; i++) {
      const isPremium = i >= num_free_ports; // First num_free_ports are free, rest are premium
      await client.query(
        `INSERT INTO charging_port
         (station_id, port_number, port_number_in_device, port_type, is_premium, is_occupied, current_status, device_mqtt_id)
         VALUES (?, ?, ?, ?, ?, false, ?, ?)`,
        [
          stationId,
          i + 1,
          i + 1,
          'Type2',
          isPremium,
          PORT_STATUS.AVAILABLE,
          device_mqtt_id
        ]
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

  const [rows] = await pool.query(
    `UPDATE charging_station
     SET station_name = ?, location_description = ?, latitude = ?, longitude = ?,
         solar_panel_wattage = ?, battery_capacity_mah = ?, is_active = ?,
         current_battery_level = ?, price_per_mah = ?, device_mqtt_id = ?,
         num_free_ports = ?, num_premium_ports = ?
     WHERE station_id = ?`,
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
  if (rows.affectedRows === 0) {
    throw new Error('Station not found');
  }
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Station ${stationId} updated by admin`);
  return { station_id: stationId };
}

// Admin: Delete station (cascading)
async function deleteStation(stationId) {
  // Verify station exists
  const [check] = await pool.query('SELECT station_id FROM charging_station WHERE station_id = ?', [stationId]);
  if (check.length === 0) throw new Error('Station not found');

  const client = await pool.getConnection();
  try {
    await client.query('BEGIN');

    // Delete related data in order (FK constraints)
    await client.query(
      `DELETE FROM consumption_data
       WHERE session_id IN (SELECT session_id FROM charging_session WHERE station_id = ?)`,
      [stationId]
    );
    await client.query(
      `DELETE FROM current_device_status
       WHERE port_id IN (SELECT port_id FROM charging_port WHERE station_id = ?)`,
      [stationId]
    );
    await client.query(
      `DELETE FROM device_status_logs
       WHERE port_id IN (SELECT port_id FROM charging_port WHERE station_id = ?)`,
      [stationId]
    );
    await client.query(`DELETE FROM charging_session WHERE station_id = ?`, [stationId]);
    await client.query(`DELETE FROM charging_port WHERE station_id = ?`, [stationId]);
    await client.query(`DELETE FROM station_maintenance WHERE station_id = ?`, [stationId]);
    await client.query(`DELETE FROM charging_station WHERE station_id = ?`, [stationId]);

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
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN last_login > NOW() - INTERVAL 30 DAY THEN 1 ELSE 0 END) as active FROM users`),
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active FROM charging_station`),
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN current_status = 'available' THEN 1 ELSE 0 END) as available FROM charging_port`),
    pool.query(`
      SELECT
        SUM(CASE WHEN start_time > CURRENT_DATE THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 7 DAY THEN 1 ELSE 0 END) as week,
        SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 30 DAY THEN 1 ELSE 0 END) as month
      FROM charging_session
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN cost ELSE 0 END), 0) as today,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 7 DAY THEN cost ELSE 0 END), 0) as week,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 30 DAY THEN cost ELSE 0 END), 0) as month
      FROM charging_session
    `),
  ]);

  return {
    users: users[0],
    stations: stations[0],
    ports: ports[0],
    sessions: sessions[0],
    revenue: revenue[0],
  };
}

async function getRecentSessions(limit = 5) {
  const [rows] = await pool.query(`
    SELECT
      cs.session_id as id,
      CONCAT(u.fname, ' ', u.lname) as user_name,
      s.station_name,
      cp.port_number_in_device as port,
      cs.start_time,
      cs.end_time,
      TIMESTAMPDIFF(MINUTE, cs.start_time, COALESCE(cs.end_time, NOW())) as duration,
      cs.energy_consumed_kwh as energy,
      cs.energy_consumed_mah as energy_mah,
      cs.cost,
      cs.session_status as status
    FROM charging_session cs
    JOIN users u ON cs.user_id = u.user_id
    JOIN charging_station s ON cs.station_id = s.station_id
    JOIN charging_port cp ON cs.port_id = cp.port_id
    ORDER BY cs.start_time DESC
    LIMIT ?
  `, [limit]);
  return rows;
}

async function getSystemStatus() {
  const [errors, statusLog] = await Promise.all([
    pool.query(`SELECT COUNT(*) as error_count FROM system_logs WHERE log_type = 'error' AND timestamp > NOW() - INTERVAL 24 HOUR`),
    pool.query(`SELECT timestamp as last_update FROM system_logs ORDER BY timestamp DESC LIMIT 1`),
  ]);
  const status = errors[0].error_count > 0 ? 'Warning' : 'Operational';
  const lastUpdate = statusLog.length > 0 ? statusLog[0].last_update : new Date();
  return { status, lastUpdate };
}

async function getBatteryLevels() {
  const [rows] = await pool.query(`
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
  return rows;
}

async function getSessionsAdmin({ range = 'week', station = 'all', status = 'all' }) {
  let timeFilter;
  switch (range) {
    case 'day': timeFilter = "start_time > CURRENT_DATE"; break;
    case 'week': timeFilter = "start_time > CURRENT_DATE - INTERVAL 7 DAY"; break;
    case 'month': timeFilter = "start_time > CURRENT_DATE - INTERVAL 30 DAY"; break;
    case 'year': timeFilter = "start_time > CURRENT_DATE - INTERVAL 365 DAY"; break;
    default: timeFilter = "start_time > CURRENT_DATE - INTERVAL 7 DAY";
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
      TIMESTAMPDIFF(MINUTE, cs.start_time, COALESCE(cs.end_time, NOW())) as duration,
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
  const [rows] = await pool.query(fullQuery);
  return rows;
}

async function getRevenueStats({ range = 'week' }) {
  try {
    // --- Payments revenue queries only (subscriptions, quota extensions, etc.) ---
    const dailyPaymentsQuery = `
      SELECT
        DATE(created_at) as date,
        SUM(amount) as amount,
        COUNT(*) as sessions
      FROM
        payments
      WHERE
        status = 'completed' AND created_at > CURRENT_DATE - INTERVAL 7 DAY
      GROUP BY
        DATE(created_at)
      ORDER BY
        date
    `;

    const weeklyPaymentsQuery = `
      SELECT
        YEARWEEK(created_at) as date,
        SUM(amount) as amount,
        COUNT(*) as sessions
      FROM
        payments
      WHERE
        status = 'completed' AND created_at > CURRENT_DATE - INTERVAL 28 DAY
      GROUP BY
        YEARWEEK(created_at)
      ORDER BY
        date
    `;

    const monthlyPaymentsQuery = `
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as date,
        SUM(amount) as amount,
        COUNT(*) as sessions
      FROM
        payments
      WHERE
        status = 'completed' AND created_at > CURRENT_DATE - INTERVAL 6 MONTH
      GROUP BY
        DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY
        date
    `;

    const totalPaymentsQuery = `
      SELECT SUM(amount) as total FROM payments WHERE status = 'completed'
    `;

    // Execute all queries in parallel
    const [dailyPayments, weeklyPayments, monthlyPayments, totalPayments] = await Promise.all([
      pool.query(dailyPaymentsQuery),
      pool.query(weeklyPaymentsQuery),
      pool.query(monthlyPaymentsQuery),
      pool.query(totalPaymentsQuery)
    ]);

    // Convert rows to expected format with proper number conversion
    const formatRows = (rows) => {
      return rows.map(item => ({
        date: item.date,
        amount: Number(item.amount) || 0,
        sessions: Number(item.sessions) || 0
      })).sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const daily = formatRows(dailyPayments);
    const weekly = formatRows(weeklyPayments);
    const monthly = formatRows(monthlyPayments);
    const total = Number(totalPayments[0]?.total) || 0;

    return { daily, weekly, monthly, total };
  } catch (error) {
    console.error('Error fetching revenue stats:', error);
    throw error;
  }
}

// Get subscription analytics: most sold plans, revenue by plan, active subscriptions
async function getSubscriptionAnalytics() {
  try {
    // Query to get plan-level aggregation from paypal_orders (successful completed payments)
    const planAnalyticsQuery = `
      SELECT
        sp.plan_id,
        sp.plan_name,
        sp.price,
        sp.duration_type,
        COUNT(po.plan_id) as total_sales,
        SUM(po.amount) as total_revenue,
        MAX(po.created_at) as last_sale_date
      FROM
        paypal_orders po
      JOIN
        subscription_plans sp ON po.plan_id = sp.plan_id
      WHERE
        po.status = 'completed' AND po.plan_id IS NOT NULL
      GROUP BY
        sp.plan_id, sp.plan_name, sp.price, sp.duration_type
      ORDER BY
        total_sales DESC
      LIMIT 10
    `;

    // Query to get active subscriptions count by plan
    const activeSubscriptionsQuery = `
      SELECT
        sp.plan_id,
        sp.plan_name,
        COUNT(us.user_subscription_id) as active_count
      FROM
        user_subscription us
      JOIN
        subscription_plans sp ON us.plan_id = sp.plan_id
      WHERE
        us.is_active = true AND us.end_date > NOW()
      GROUP BY
        sp.plan_id, sp.plan_name
      ORDER BY
        active_count DESC
    `;

    // Query to get payment type breakdown
    const paymentTypeBreakdownQuery = `
      SELECT
        payment_type,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM
        payments
      WHERE
        status = 'completed'
      GROUP BY
        payment_type
      ORDER BY
        total_amount DESC
    `;

    // Execute all queries with individual error handling
    let planAnalytics, activeSubscriptions, paymentBreakdown;
    try {
      [planAnalytics] = await pool.query(planAnalyticsQuery);
    } catch (e) {
      console.error('Plan analytics query failed:', e.message);
      throw new Error(`Plan analytics query failed: ${e.message}`);
    }
    try {
      [activeSubscriptions] = await pool.query(activeSubscriptionsQuery);
    } catch (e) {
      console.error('Active subscriptions query failed:', e.message);
      throw new Error(`Active subscriptions query failed: ${e.message}`);
    }
    try {
      [paymentBreakdown] = await pool.query(paymentTypeBreakdownQuery);
    } catch (e) {
      console.error('Payment breakdown query failed:', e.message);
      throw new Error(`Payment breakdown query failed: ${e.message}`);
    }

    // Format plan analytics with proper number conversion
    const topPlans = planAnalytics.map(row => ({
      planId: row.plan_id,
      planName: row.plan_name,
      price: Number(row.price) || 0,
      durationType: row.duration_type,
      totalSales: Number(row.total_sales) || 0,
      totalRevenue: Number(row.total_revenue) || 0,
      lastSaleDate: row.last_sale_date
    }));

    // Format active subscriptions
    const activeSubsByPlan = activeSubscriptions.map(row => ({
      planId: row.plan_id,
      planName: row.plan_name,
      activeCount: Number(row.active_count) || 0
    }));

    // Format payment breakdown
    const paymentTypes = paymentBreakdown.map(row => ({
      paymentType: row.payment_type,
      count: Number(row.count) || 0,
      totalAmount: Number(row.total_amount) || 0
    }));

    return {
      topPlans,
      activeSubscriptions: activeSubsByPlan,
      paymentBreakdown: paymentTypes
    };
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    throw error;
  }
}

async function getUsageStats({ range = 'week' }) {
  let timeFilter;
  switch (range) {
    case 'day': timeFilter = "start_time > CURRENT_DATE"; break;
    case 'week': timeFilter = "start_time > CURRENT_DATE - INTERVAL 7 DAY"; break;
    case 'month': timeFilter = "start_time > CURRENT_DATE - INTERVAL 30 DAY"; break;
    case 'year': timeFilter = "start_time > CURRENT_DATE - INTERVAL 365 DAY"; break;
    default: timeFilter = "start_time > CURRENT_DATE - INTERVAL 7 DAY";
  }
  const [rows] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN energy_consumed_kwh ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 7 DAY THEN energy_consumed_kwh ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL 30 DAY THEN energy_consumed_kwh ELSE 0 END), 0) as month
    FROM charging_session
    WHERE ${timeFilter}
  `);
  return rows[0];
}

async function getAdminLogs(limit = 100) {
  const [rows] = await pool.query(
    `SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

// ============= Additional Helpers =============

// Get station consumption data (authenticated)
async function getStationConsumption(stationId) {
  const [rows] = await pool.query(`
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

  return rows.map(row => {
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
async function getPortByDeviceAndNumber(deviceId, portNumber) {
  const [rows] = await pool.query(
    `SELECT cp.port_id, cp.is_premium, cs.station_id
     FROM charging_port cp
     JOIN charging_station cs ON cp.station_id = cs.station_id
     WHERE cp.device_mqtt_id = ? AND cp.port_number_in_device = ?`,
    [deviceId, portNumber]
  );
  return rows[0];
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
  getSubscriptionAnalytics,
  getUsageStats,
  getAdminLogs,

  // Additional
  getStationConsumption,

  // Helpers
  getPortByDeviceAndNumber,
};

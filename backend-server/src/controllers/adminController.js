// src/controllers/adminController.js
// Admin dashboard endpoints

const stationService = require('../services/stationService');
const userService = require('../services/userService');
const subscriptionService = require('../services/subscriptionService');
const { logSystemEvent } = require('../services/logger');
const { SESSION_STATUS } = require('../utils/constants');

const pool = require('../config/database');

// Dashboard stats
async function getDashboardStats(req, res, next) {
  try {
    const stats = await stationService.getAdminDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// Recent sessions
async function getRecentSessions(req, res, next) {
  try {
    const sessions = await stationService.getRecentSessions(5);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

// System status
async function getSystemStatus(req, res, next) {
  try {
    const status = await stationService.getSystemStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

// Battery levels
async function getBatteryLevels(req, res, next) {
  try {
    const levels = await stationService.getBatteryLevels();
    res.json(levels);
  } catch (err) {
    next(err);
  }
}

// User CRUD
async function getAllUsers(req, res, next) {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  const { userId } = req.params;
  try {
    const user = await userService.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  const { fname, lname, email, contact_number, is_admin, plan_id } = req.body;
  try {
    const result = await userService.createUser({ fname, lname, email, contact_number, is_admin, plan_id });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  const { userId } = req.params;
  const { fname, lname, contact_number, is_admin, plan_id } = req.body;
  console.log('updateUser called:', { userId, fname, lname, contact_number, is_admin, plan_id });
  try {
    const result = await userService.updateUser(userId, { fname, lname, contact_number, is_admin, plan_id });
    console.log('updateUser result:', result);
    res.json(result);
  } catch (err) {
    console.error('updateUser error:', err);
    next(err);
  }
}

async function deleteUser(req, res, next) {
  const { userId } = req.params;
  try {
    const result = await userService.deleteUser(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Station CRUD
async function getAllStations(req, res, next) {
  try {
    const stations = await stationService.getAllStationsAdmin();
    res.json(stations);
  } catch (err) {
    next(err);
  }
}

async function createStation(req, res, next) {
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
  } = req.body;

  try {
    const result = await stationService.createStation({
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
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function updateStation(req, res, next) {
  const { stationId } = req.params;
  const updates = req.body;
  try {
    const result = await stationService.updateStation(stationId, updates);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteStation(req, res, next) {
  const { stationId } = req.params;
  try {
    await stationService.deleteStation(stationId);
    res.json({ message: 'Station deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// Sessions list with filters
async function getSessionsAdmin(req, res, next) {
  const { range = 'week', station = 'all', status = 'all' } = req.query;
  try {
    const sessions = await stationService.getSessionsAdmin({ range, station, status });
    res.json(sessions);
  } catch (err) {
    console.error('Admin sessions fetch error:', err.message);
    console.error('Query params:', { range, station, status });
    next(err);
  }
}

// Revenue stats
async function getRevenueStats(req, res, next) {
  const { range = 'week' } = req.query;
  try {
    const stats = await stationService.getRevenueStats({ range });
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// Usage stats
async function getUsageStats(req, res, next) {
  const { range = 'week' } = req.query;
  try {
    const stats = await stationService.getUsageStats({ range });
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// System logs
async function getAdminLogs(req, res, next) {
  const { limit = 100 } = req.query;
  try {
    const logs = await stationService.getAdminLogs(parseInt(limit));
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

// Admin: Fix expired subscriptions
async function fixExpiredSubscriptions(req, res, next) {
  try {
    const result = await subscriptionService.fixExpiredSubscriptions();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Admin: Quota pricing management
async function getAllQuotaPricing(req, res, next) {
  try {
    const pricing = await subscriptionService.getAllQuotaPricing();
    res.json(pricing);
  } catch (err) {
    next(err);
  }
}

async function updateQuotaPricing(req, res, next) {
  const { id, extension_type, price_per_transaction, extension_amount_mah, is_active } = req.body;
  try {
    await subscriptionService.updateQuotaPricing(id, { extension_type, price_per_transaction, extension_amount_mah, is_active });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// Admin: Confirm extension payment
async function confirmExtensionPayment(req, res, next) {
  const { extensionId } = req.params;
  try {
    const extension = await subscriptionService.confirmExtensionPayment(extensionId);
    res.json(extension);
  } catch (err) {
    next(err);
  }
}

// Admin: All extensions
async function getAllExtensionsAdmin(req, res, next) {
  try {
    const extensions = await subscriptionService.getAllExtensions();
    res.json(extensions);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Dashboard
  getDashboardStats,
  getRecentSessions,
  getSystemStatus,
  getBatteryLevels,

  // Users
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,

  // Stations
  getAllStations,
  createStation,
  updateStation,
  deleteStation,

  // Sessions & Reports
  getSessionsAdmin,
  getRevenueStats,
  getUsageStats,

  // Logs
  getAdminLogs,

  // Maintenance
  fixExpiredSubscriptions,

  // Quota pricing
  getAllQuotaPricing,
  updateQuotaPricing,
  confirmExtensionPayment,
  getAllExtensionsAdmin,
};

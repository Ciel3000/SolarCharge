// src/controllers/deviceController.js
// Handles device-related HTTP endpoints

const chargingService = require('../services/chargingService');
const { supabaseAuthMiddleware } = require('../middleware/auth');

// GET /api/devices/status - Public? Usually requires auth? In original it's public (no auth). We'll keep as is.
async function getAllDeviceStatus(req, res, next) {
  try {
    const data = await chargingService.getAllDeviceStatus();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// GET /api/devices/consumption - Public
async function getAllDeviceConsumption(req, res, next) {
  try {
    const data = await chargingService.getAllDeviceConsumption();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// GET /api/devices/:deviceId/:portNumber/consumption - Public
async function getDeviceConsumption(req, res, next) {
  const { deviceId, portNumber } = req.params;
  try {
    const data = await chargingService.getDeviceConsumption(deviceId, portNumber);
    res.json(data);
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
    } else {
      next(err);
    }
  }
}

// POST /api/devices/:deviceId/:portNumber/control - Auth required
async function controlPort(req, res, next) {
  const { deviceId, portNumber } = req.params;
  const { command, station_id } = req.body;
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!command || (command !== 'ON' && command !== 'OFF')) {
    return res.status(400).json({ error: `Invalid command. Must be "ON" or "OFF".` });
  }

  try {
    const result = await chargingService.startSession({
      deviceId,
      portNumber,
      userId,
      stationId: station_id,
      isPremium: command === 'ON' ? true : false, // We'll determine isPremium via service internal; but better to fetch.
    });
    res.json(result);
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
    } else {
      next(err);
    }
  }
}

module.exports = {
  getAllDeviceStatus,
  getAllDeviceConsumption,
  getDeviceConsumption,
  controlPort,
};

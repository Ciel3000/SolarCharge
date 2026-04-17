// src/controllers/stationController.js
// Public station endpoints

const stationService = require('../services/stationService');
const chargingService = require('../services/chargingService');

async function listStations(req, res, next) {
  try {
    const stations = await stationService.getAllStations();
    res.json(stations);
  } catch (err) {
    next(err);
  }
}

async function getStation(req, res, next) {
  const { stationId } = req.params;
  try {
    const station = await stationService.getStationById(stationId);
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json(station);
  } catch (err) {
    next(err);
  }
}

// GET /api/stations/:stationId/consumption (auth)
async function getStationConsumption(req, res, next) {
  const { stationId } = req.params;
  try {
    const data = await stationService.getStationConsumption(stationId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// GET /api/stations/:stationId/sync (public)
async function syncStation(req, res, next) {
  const { stationId } = req.params;
  try {
    const data = await chargingService.reconcileStationState(stationId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listStations,
  getStation,
  getStationConsumption,
  syncStation,
};

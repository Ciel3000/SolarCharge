// src/routes/stations.js
// Station endpoints (public + protected)

const router = require('express').Router();
const stationController = require('../controllers/stationController');
const { supabaseAuthMiddleware } = require('../middleware/auth');

// Public
router.get('/', stationController.listStations);
router.get('/:stationId', stationController.getStation);

// Auth required
router.get('/:stationId/consumption', supabaseAuthMiddleware, stationController.getStationConsumption);
router.get('/:stationId/sync', stationController.syncStation);

module.exports = router;

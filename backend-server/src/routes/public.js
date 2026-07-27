// src/routes/public.js
// Public routes (no auth required)

const router = require('express').Router();
const publicController = require('../controllers/publicController');

router.get('/stations', publicController.getPublicStations);
router.get('/stations/:stationId', publicController.getPublicStation);

module.exports = router;

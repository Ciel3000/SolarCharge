// src/routes/devices.js
// Device-related endpoints

const router = require('express').Router();
const deviceController = require('../controllers/deviceController');
const { CHARGER_STATES, CONFIG } = require('../utils/constants');
const pool = require('../config/database');
const { logSystemEvent } = require('../services/logger');

// Public endpoints (no auth)
router.get('/status', deviceController.getAllDeviceStatus);
router.get('/consumption', deviceController.getAllDeviceConsumption);
router.get('/:deviceId/:portNumber/consumption', deviceController.getDeviceConsumption);

// Auth required for control
router.post('/:deviceId/:portNumber/control', deviceController.controlPort);

// Config/slot-limits
router.get('/config/slot-limits', async (req, res) => {
  res.json({ premiumUserMaxActiveSlots: CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS });
});

// Legacy ESP32 command endpoint (station-level control)
router.post('/esp32/command', async (req, res) => {
  const { action, stationId, portId } = req.body;
  console.log(`Received command from frontend: Action=${action}, Station=${stationId}, Port=${portId}`);
  await logSystemEvent('info', 'api', `Legacy ESP32 command received: Action=${action}, Station=${stationId}, Port=${portId}`);

  const topic = `station/${stationId}/control`;
  let message = '';
  if (action === 'activate' && portId === 1) message = 'relay1_on';
  else if (action === 'deactivate' && portId === 1) message = 'relay1_off';
  else if (action === 'activate' && portId === 2) message = 'relay2_on';
  else if (action === 'deactivate' && portId === 2) message = 'relay2_off';
  else {
    await logSystemEvent('warning', 'api', `Invalid legacy ESP32 action or portId: Action=${action}, Port=${portId}`);
    return res.status(400).json({ error: 'Invalid action or portId' });
  }

  if (!global.mqttClient) {
    return res.status(503).json({ error: 'MQTT client not available' });
  }

  global.mqttClient.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error('MQTT publish error:', err);
      logSystemEvent('error', 'mqtt', `Failed to publish legacy MQTT command ${message} to ${topic}: ${err.message}`);
      return res.status(500).json({ error: 'Failed to publish MQTT message' });
    }
    res.json({ success: true, message: `Published ${message} to ${topic}` });
    logSystemEvent('info', 'mqtt', `Published legacy command ${message} to ${topic}`);
  });
});

module.exports = router;

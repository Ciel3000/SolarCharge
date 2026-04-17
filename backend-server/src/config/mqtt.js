// src/config/mqtt.js - MQTT client setup for EMQX Cloud
// Creates MQTT client, connects, subscribes, and dispatches messages to chargingService

const mqtt = require('mqtt');
const { MQTT_TOPICS, ESP32_STATION_CLIENT_ID } = require('../utils/constants');

// MQTT connection options from environment
const options = {
  host: process.env.EMQX_HOST,
  port: Number.parseInt(process.env.EMQX_PORT, 10),
  protocol: 'mqtts', // TLS/SSL for port 8883
  username: process.env.EMQX_USERNAME,
  password: process.env.EMQX_PASSWORD,
  clientId: ESP32_STATION_CLIENT_ID,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30 * 1000,
  // TLS: use provided CA cert, fallback to permissive for dev if explicitly allowed
  ca: (() => {
    const certPath = process.env.EMQX_CA_CERT_PATH;
    if (certPath) {
      try {
        const fs = require('fs');
        return fs.readFileSync(certPath);
      } catch (e) {
        console.error('Failed to read CA cert file:', e.message);
      }
    }
    const pem = process.env.EMQX_CA_CERT;
    if (pem) {
      const normalized = pem.includes('-----BEGIN CERTIFICATE-----')
        ? pem.replace(/\\n/g, '\n').trim()
        : pem;
      return Buffer.from(normalized, 'utf-8');
    }
    return undefined;
  })(),
  rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
};

// Create MQTT client with TLS options
const client = mqtt.connect(options);

// Expose client globally immediately (available even before connection)
global.mqttClient = client;

// Lazy-load chargingService to avoid circular dependency
let chargingService = null;
function getChargingService() {
  if (!chargingService) {
    chargingService = require('../services/chargingService');
  }
  return chargingService;
}

// Connection event handlers
client.on('connect', () => {
  console.log('[MQTT] Connected to EMQX Cloud');

  // Subscribe to relevant topics
  // Usage data: charger/usage/{deviceId}
  client.subscribe(MQTT_TOPICS.USAGE + '+', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to usage topic:', err);
    else console.log('[MQTT] Subscribed to usage topic:', MQTT_TOPICS.USAGE + '+');
  });

  // Status data: charger/status/{deviceId}
  client.subscribe(MQTT_TOPICS.STATUS + '+', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to status topic:', err);
    else console.log('[MQTT] Subscribed to status topic:', MQTT_TOPICS.STATUS + '+');
  });

  // Station generic status: station/+/status
  client.subscribe(MQTT_TOPICS.STATION_GENERIC_STATUS, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to station status topic:', err);
    else console.log('[MQTT] Subscribed to station status topic:', MQTT_TOPICS.STATION_GENERIC_STATUS);
  });

  // Inject mqttClient into chargingService (sets global and service reference)
  const cs = getChargingService();
  if (cs && cs.setMqttClient) {
    cs.setMqttClient(client);
  }
});

client.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
});

client.on('close', () => {
  console.log('[MQTT] Connection closed');
});

client.on('offline', () => {
  console.log('[MQTT] Client offline');
});

client.on('reconnect', () => {
  console.log('[MQTT] Reconnecting...');
});

// Message dispatcher: forward all messages to chargingService.handleMqttMessage
client.on('message', (topic, message) => {
  try {
    const payload = message.toString();
    const cs = getChargingService();
    if (cs && cs.handleMqttMessage) {
      cs.handleMqttMessage(topic, payload);
    } else {
      console.error('[MQTT] chargingService not available for message handling');
    }
  } catch (err) {
    console.error('[MQTT] Error processing message:', err.message);
  }
});

// Export factory function expected by server.js
function createMqttClient() {
  return client;
}

module.exports = {
  createMqttClient,
  connect: () => client,
  getClient: () => client,
};

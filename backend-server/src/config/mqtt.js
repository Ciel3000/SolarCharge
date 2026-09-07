// src/config/mqtt.js
// MQTT client setup - supports both local (Aedes/Mosquitto) and cloud (EMQX) modes

const mqtt = require('mqtt');
const { MQTT_TOPICS } = require('../utils/constants');

// Detect if we're running locally
const isLocal = process.env.EMQX_HOST === 'localhost' || !process.env.EMQX_HOST;

// Ensure we have a valid client ID - read directly from env with fallback
const mqttClientId = process.env.MQTT_CLIENT_ID || 'backend-server-001';

console.log(`[MQTT Config] isLocal=${isLocal}, host=${process.env.EMQX_HOST || 'localhost'}, port=${process.env.EMQX_PORT || 1883}, clientId=${mqttClientId}`);

const options = {
  host: process.env.EMQX_HOST || 'localhost',
  port: Number.parseInt(process.env.EMQX_PORT, 10) || 1883,
  protocol: isLocal ? 'mqtt' : 'mqts',
  username: process.env.EMQX_USERNAME,
  password: process.env.EMQX_PASSWORD,
  clientId: mqttClientId,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30 * 1000,
  // Only use TLS for cloud connections
  ...(isLocal ? {} : {
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
  }),
};

console.log('[MQTT Config] Creating MQTT client with options:', JSON.stringify({ ...options, password: options.password ? '***' : '' }));

// Create MQTT client
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
  console.log(`[MQTT] Connected to ${isLocal ? 'local' : 'cloud'} broker`);

  // Subscribe to relevant topics
  client.subscribe(MQTT_TOPICS.USAGE + '+', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to usage topic:', err);
    else console.log('[MQTT] Subscribed to usage topic:', MQTT_TOPICS.USAGE + '+');
  });

  client.subscribe(MQTT_TOPICS.STATUS + '+', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to status topic:', err);
    else console.log('[MQTT] Subscribed to status topic:', MQTT_TOPICS.STATUS + '+');
  });

  client.subscribe(MQTT_TOPICS.STATION_GENERIC_STATUS, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Failed to subscribe to station status topic:', err);
    else console.log('[MQTT] Subscribed to station status topic:', MQTT_TOPICS.STATION_GENERIC_STATUS);
  });

  // Inject mqttClient into chargingService
  const cs = getChargingService();
  if (cs && cs.setMqttClient) {
    cs.setMqttClient(client);
  }
});

client.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
  console.error('[MQTT] Error stack:', err.stack);
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

client.on('disconnect', (packet) => {
  console.log('[MQTT] Disconnected:', packet);
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

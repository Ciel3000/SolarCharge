const express = require('express');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

// EMQX Cloud credentials - use environment variables for security
const mqttHost = process.env.EMQX_HOST || 'zfd47f32.ala.asia-southeast1.emqxsl.com';
const mqttPort = process.env.EMQX_PORT || 8883;
const mqttUser = process.env.EMQX_USERNAME || 'your_username';
const mqttPass = process.env.EMQX_PASSWORD || 'your_password';

// EMQX Cloud connection options with proper TLS
const mqttOptions = {
  username: mqttUser,
  password: mqttPass,
  protocol: 'mqtts',
  rejectUnauthorized: false, // For development - set to true in production with proper certificates
  keepalive: 60,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  clean: true
};

const client = mqtt.connect(`mqtts://${mqttHost}:${mqttPort}`, mqttOptions);

client.on('connect', () => {
  console.log('Connected to EMQX Cloud!');
  // Subscribe to status topics
  client.subscribe('station/+/status', (err) => {
    if (err) {
      console.error('Error subscribing to status topics:', err);
    } else {
      console.log('Subscribed to station status topics');
    }
  });
});

client.on('error', (err) => {
  console.error('MQTT connection error:', err);
});

client.on('reconnect', () => {
  console.log('Reconnecting to EMQX Cloud...');
});

client.on('close', () => {
  console.log('MQTT connection closed');
});

// Handle incoming messages
client.on('message', (topic, message) => {
  console.log(`Received message on ${topic}: ${message.toString()}`);
  // Handle different message types here
  try {
    const data = JSON.parse(message.toString());
    // Process the data as needed
  } catch (error) {
    console.error('Error parsing MQTT message:', error);
  }
});

app.post('/api/activate-port', (req, res) => {
  const { station_id, port } = req.body;
  if (!station_id || !port) return res.status(400).json({ error: 'Missing station_id or port' });

  const topic = `station/${station_id}/control`;
  const message = port === 1 ? 'relay1_on' : 'relay2_on';

  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error('MQTT publish error:', err);
      return res.status(500).json({ error: 'Failed to publish MQTT message' });
    }
    res.json({ success: true, message: `Published ${message} to ${topic}` });
  });
});

app.post('/api/deactivate-port', (req, res) => {
  const { station_id, port } = req.body;
  if (!station_id || !port) return res.status(400).json({ error: 'Missing station_id or port' });

  const topic = `station/${station_id}/control`;
  const message = port === 1 ? 'relay1_off' : 'relay2_off';

  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error('MQTT publish error:', err);
      return res.status(500).json({ error: 'Failed to publish MQTT message' });
    }
    res.json({ success: true, message: `Published ${message} to ${topic}` });
  });
});

app.listen(3001, () => console.log('API server running on port 3001'));
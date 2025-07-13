const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt'); // <--- ADD THIS IMPORT
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// --- Supabase PostgreSQL connection ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Be cautious with this in production. Better to use trusted CAs.
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to Supabase PostgreSQL database');
  }
});

// --- MQTT Broker Configuration (Add these back) ---
const MQTT_BROKER_HOST = process.env.EMQX_HOST;
const MQTT_PORT = process.env.EMQX_PORT || 8883; // TLS Port
const MQTT_USERNAME = process.env.EMQX_USERNAME;
const MQTT_PASSWORD = process.env.EMQX_PASSWORD;
const EMQX_CA_CERT = process.env.EMQX_CA_CERT; // Stored in .env or as string literal

const mqttOptions = {
    clientId: `backend_server_${Math.random().toString(16).substr(2, 8)}`,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true,
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Or true if using prod CA
    ca: EMQX_CA_CERT,
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
};

const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER_HOST}:${MQTT_PORT}`, mqttOptions); // <--- Use mqttClient to avoid conflict with 'client' in other contexts

// --- MQTT Event Handlers (Add these back) ---
mqttClient.on('connect', () => {
    console.log('Backend connected to EMQX Cloud MQTT broker');
    mqttClient.subscribe('charger/usage/#', { qos: 1 }, (err) => {
        if (!err) console.log('Subscribed to charger/usage/#');
    });
    mqttClient.subscribe('charger/status/#', { qos: 1 }, (err) => {
        if (!err) console.log('Subscribed to charger/status/#');
    });
    mqttClient.subscribe('station/+/status', { qos: 1 }, (err) => {
        if (!err) console.log('Subscribed to station status topics');
    });
});

mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
    try {
        const payload = JSON.parse(message.toString());

        // Handle charger topics
        if (topic.startsWith('charger/usage/')) {
            const deviceId = topic.split('/')[2];
            const { consumption, timestamp, charger_state } = payload;
            // INSERT into your consumption_data table
            await pool.query(
                'INSERT INTO consumption_data (device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0), $4)',
                [deviceId, consumption, timestamp, charger_state]
            );
            console.log(`Stored consumption for ${deviceId}: ${consumption}W`);

        } else if (topic.startsWith('charger/status/')) {
            const deviceId = topic.split('/')[2];
            const { status, charger_state, timestamp } = payload;
            // INSERT into device_status_logs and UPSERT into current_device_status
            await pool.query(
                'INSERT INTO device_status_logs (device_id, status_message, charger_state, timestamp) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0))',
                [deviceId, status, charger_state, timestamp]
            );
            await pool.query(
                'INSERT INTO current_device_status (device_id, status_message, charger_state, last_update) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0)) ON CONFLICT (device_id) DO UPDATE SET status_message = $2, charger_state = $3, last_update = TO_TIMESTAMP($4 / 1000.0)',
                [deviceId, status, charger_state, timestamp]
            );
            console.log(`Updated status for ${deviceId}: ${status}, Charger: ${charger_state}`);
        }
        // Handle existing station topics
        else if (topic.startsWith('station/')) {
            // Process the data as needed for existing station functionality
            // This might also involve database operations based on your schema
            console.log(`Processing station data: ${JSON.stringify(payload)}`);
        }

    } catch (error) {
        console.error('Error processing MQTT message:', error);
    }
});

mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
});

mqttClient.on('close', () => {
    console.log('MQTT client disconnected.');
});

mqttClient.on('reconnect', () => {
    console.log('Reconnecting to EMQX Cloud...');
});


// --- Your Existing Routes (Stations, Readings, Users) ---
// ... (Your /api/stations, /api/readings, /api/users routes here, unchanged) ...


// --- New API Endpoints for Charger Devices (Add these back) ---
app.get('/api/devices/:deviceId/consumption', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const result = await pool.query(
            'SELECT consumption_watts, timestamp, charger_state FROM consumption_data WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 100',
            [deviceId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching consumption data:', error);
        res.status(500).json({ error: 'Failed to fetch consumption data' });
    }
});

app.get('/api/devices/status', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM current_device_status');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});

app.post('/api/devices/:deviceId/control', (req, res) => {
    const { deviceId } = req.params;
    const { command } = req.body;

    if (!command || (command !== 'ON' && command !== 'OFF')) {
        return res.status(400).json({ error: 'Invalid command. Must be "ON" or "OFF".' });
    }

    const controlTopic = `charger/control/${deviceId}`;
    mqttClient.publish(controlTopic, command, { qos: 1 }, (err) => { // <--- Use mqttClient
        if (err) {
            console.error(`Failed to publish control command to ${controlTopic}:`, err);
            return res.status(500).json({ error: 'Failed to send control command' });
        }
        console.log(`Sent command '${command}' to ${deviceId}`);
        res.json({ status: 'Command sent', deviceId, command });
    });
});

// Existing endpoint for ESP32 commands (kept for backward compatibility)
app.post('/api/esp32/command', async (req, res) => {
    const { action, stationId, portId } = req.body;

    console.log(`Received command from frontend: Action=${action}, Station=${stationId}, Port=${portId}`);

    const topic = `station/${stationId}/control`;
    let message = '';
    if (action === 'activate' && portId === 1) message = 'relay1_on';
    else if (action === 'deactivate' && portId === 1) message = 'relay1_off';
    else if (action === 'activate' && portId === 2) message = 'relay2_on';
    else if (action === 'deactivate' && portId === 2) message = 'relay2_off';
    else return res.status(400).json({ error: 'Invalid action or portId' });

    mqttClient.publish(topic, message, (err) => { // <--- Use mqttClient
        if (err) {
            console.error('MQTT publish error:', err);
            return res.status(500).json({ error: 'Failed to publish MQTT message' });
        }
        res.json({ success: true, message: `Published ${message} to ${topic}` });
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  mqttClient.end(() => { // <--- Close MQTT client first
    console.log('MQTT client disconnected.');
    pool.end(() => { // <--- Then close database pool
      console.log('Database pool closed.');
      process.exit(0);
    });
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  mqttClient.end(() => { // <--- Close MQTT client first
    console.log('MQTT client disconnected.');
    pool.end(() => { // <--- Then close database pool
      console.log('Database pool closed.');
      process.exit(0);
    });
  });
});
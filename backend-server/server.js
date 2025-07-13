const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt'); // <--- ADD THIS IMPORT
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const activeChargerSessions = {};

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
const ESP32_STATION_CLIENT_ID = "ESP32_CHARGER_STATION_001"

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

const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER_HOST}:${MQTT_PORT}`, mqttOptions);

// --- MQTT Event Handlers ---
mqttClient.on('connect', () => {
    console.log('Backend connected to EMQX Cloud MQTT broker');
    // Subscribe to topics for the single station device ID
    mqttClient.subscribe(`charger/usage/${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => { // <--- CHANGED Topic
        if (!err) console.log(`Subscribed to charger/usage/${ESP32_STATION_CLIENT_ID}`);
    });
    mqttClient.subscribe(`charger/status/${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => { // <--- CHANGED Topic
        if (!err) console.log(`Subscribed to charger/status/${ESP32_STATION_CLIENT_ID}`);
    });
    mqttClient.subscribe('station/+/status', { qos: 1 }, (err) => {
        if (!err) console.log('Subscribed to station status topics');
    });
});


mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
    try {
        let payload;
        const messageString = message.toString();

        // Specific handling for 'offline' LWT from ESP32_CHARGER_STATION_001
        if (topic === `charger/status/${ESP32_STATION_CLIENT_ID}` && messageString === 'offline') {
            payload = {
                status: "offline",
                // Assuming "UNKNOWN" for both ports if the whole station goes offline without port data
                charger_state: "UNKNOWN",
                timestamp: Date.now(),
                // Add default port numbers to handle the structure later
                port_number: -1 // Special indicator for station-level offline
            };
            console.warn(`Converted plain "offline" LWT to JSON for ${topic}`);
        } else {
            payload = JSON.parse(messageString);
        }

        // Extract the deviceId (which is now the station's ID)
        const deviceId = topic.split('/')[2]; // e.g., ESP32_CHARGER_STATION_001

        // Extract port_number from payload (will be undefined for station-level status)
        const portNumberInDevice = payload.port_number; // Get port_number from the payload

        // Skip if message doesn't contain a valid port_number for usage/status, unless it's a generic station status
        if ((topic.startsWith('charger/usage/') || topic.startsWith('charger/status/')) && (portNumberInDevice === undefined || portNumberInDevice < 1)) {
            // This is crucial. If payload has no port_number, it's either an old message or a pure station status without port detail.
            // Only process if it's the station-wide 'online'/'offline' status (handled above for 'offline')
            if (topic === `charger/status/${ESP32_STATION_CLIENT_ID}` && payload.status === 'online') {
                // This is the overall station online status. You can log it, but it doesn't map to a specific port_id in DB.
                console.log(`Station ${deviceId} is online. No specific port_id for this message.`);
                // You might update a 'station_status' table if you had one.
                return;
            }
            // For any other message without a port_number, just log and return.
            console.warn(`Received message on ${topic} from ${deviceId} without a valid port_number. Skipping.`);
            return;
        }

        // 1. Find the charging_port.id using both device_mqtt_id (station ID) and port_number_in_device
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, portNumberInDevice]
        );
        const actualPortId = portIdResult.rows[0]?.port_id;

        if (!actualPortId) {
            console.warn(`No charging_port found for device_id: ${deviceId} and port_number_in_device: ${portNumberInDevice}. Skipping message processing.`);
            return;
        }

        // Determine unique key for session tracking
        const sessionKey = `${deviceId}_${portNumberInDevice}`;
        let currentSessionId = activeChargerSessions[sessionKey];

        // --- Handle charger/usage topic (same logic, but using new variables) ---
        if (topic.startsWith('charger/usage/')) {
            const { consumption, timestamp, charger_state } = payload;
            const currentTimestamp = new Date(timestamp);

            if (charger_state === 'ON') {
                if (!currentSessionId) {
                    const existingActiveSession = await pool.query(
                        "SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = 'active'",
                        [actualPortId] // Use actualPortId here
                    );

                    if (existingActiveSession.rows.length === 0) {
                        const sessionResult = await pool.query(
                            'INSERT INTO charging_session (port_id, start_time, session_status) VALUES ($1, $2, $3) RETURNING session_id',
                            [actualPortId, currentTimestamp, 'active']
                        );
                        currentSessionId = sessionResult.rows[0].session_id;
                        activeChargerSessions[sessionKey] = currentSessionId;
                        console.log(`Started new charging session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    } else {
                        currentSessionId = existingActiveSession.rows[0].session_id;
                        activeChargerSessions[sessionKey] = currentSessionId;
                        console.log(`Resumed existing active session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    }
                }

                if (currentSessionId) {
                    await pool.query(
                        'INSERT INTO consumption_data (session_id, device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                        [currentSessionId, deviceId, consumption, timestamp, charger_state]
                    );
                    console.log(`Stored consumption for ${deviceId} Port ${portNumberInDevice} in session ${currentSessionId}: ${consumption}W`);

                    const intervalSeconds = 10;
                    const kwhIncrement = (consumption * intervalSeconds) / (1000 * 3600);

                    await pool.query(
                        'UPDATE charging_session SET energy_consumed_kwh = COALESCE(energy_consumed_kwh, 0) + $1, last_status_update = $2 WHERE session_id = $3',
                        [kwhIncrement, currentTimestamp, currentSessionId]
                    );
                }

            } else if (charger_state === 'OFF') {
                if (currentSessionId) {
                    await pool.query(
                        "UPDATE charging_session SET end_time = $1, session_status = 'completed', last_status_update = $2 WHERE session_id = $3 AND session_status = 'active'",
                        [currentTimestamp, currentTimestamp, currentSessionId]
                    );
                    console.log(`Ended charging session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    delete activeChargerSessions[sessionKey];
                }
            }
        }

        // --- Handle charger/status topic ---
        else if (topic.startsWith('charger/status/')) {
            const { status, charger_state, timestamp } = payload;
            const currentTimestamp = new Date(timestamp);

            // Insert into device_status_logs
            await pool.query(
                'INSERT INTO device_status_logs (device_id, port_id, status_message, charger_state, timestamp) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                [deviceId, actualPortId, status, charger_state, timestamp] // <--- NEW: Include port_id
            );

            // Upsert into current_device_status
            await pool.query(
                'INSERT INTO current_device_status (device_id, port_id, status_message, charger_state, last_update) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0)) ON CONFLICT (device_id, port_id) DO UPDATE SET status_message = $3, charger_state = $4, last_update = TO_TIMESTAMP($5 / 1000.0)', // <--- NEW: ON CONFLICT on device_id AND port_id
                [deviceId, actualPortId, status, charger_state, timestamp] // <--- NEW: Include port_id
            );
            console.log(`Updated status for ${deviceId} Port ${portNumberInDevice}: ${status}, Charger: ${charger_state}`);

            // Update charging_port table for real-time status
            await pool.query(
                'UPDATE charging_port SET current_status = $1, is_active = $2, last_status_update = $3 WHERE port_id = $4',
                [status, (charger_state === 'ON'), currentTimestamp, actualPortId] // Use actualPortId for WHERE
            );
        }

        // ... (rest of message handler for other topics) ...

    } catch (error) {
        console.error('Error processing MQTT message:', error);
    }
});

// --- REST API Endpoints (Updated to include portNumber where needed) ---

// Get consumption data for a specific device (station) AND port
app.get('/api/devices/:deviceId/:portNumber/consumption', async (req, res) => { // <--- NEW: portNumber in URL
    const { deviceId, portNumber } = req.params;
    try {
        // First, find the actual port_id UUID
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, parseInt(portNumber)] // Ensure portNumber is integer
        );
        const actualPortId = portIdResult.rows[0]?.port_id;

        if (!actualPortId) {
            return res.status(404).json({ error: 'Port not found for this device.' });
        }

        const result = await pool.query(
            'SELECT consumption_watts, timestamp, charger_state FROM consumption_data WHERE device_id = $1 AND session_id IN (SELECT session_id FROM charging_session WHERE port_id = $2) ORDER BY timestamp DESC LIMIT 100', // <--- Use port_id to filter sessions
            [deviceId, actualPortId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching consumption data:', error);
        res.status(500).json({ error: 'Failed to fetch consumption data' });
    }
});

// Get all current device/port statuses
app.get('/api/devices/status', async (req, res) => {
    try {
        // Fetch current status directly from current_device_status, it now has port_id
        const result = await pool.query('SELECT * FROM current_device_status');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});

// Send control command to a specific device (station) AND port
app.post('/api/devices/:deviceId/:portNumber/control', (req, res) => { // <--- NEW: portNumber in URL
    const { deviceId, portNumber } = req.params;
    const { command } = req.body;

    if (!command || (command !== 'ON' && command !== 'OFF')) {
        return res.status(400).json({ error: 'Invalid command. Must be "ON" or "OFF".' });
    }

    // Publish to the station's control topic, but payload specifies the port
    const controlTopic = `charger/control/${deviceId}`;
    const payload = JSON.stringify({ command: command, port_number: parseInt(portNumber) }); // <--- NEW: Payload includes port_number

    mqttClient.publish(controlTopic, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error(`Failed to publish control command to ${controlTopic}:`, err);
            return res.status(500).json({ error: 'Failed to send control command' });
        }
        console.log(`Sent command '${command}' to ${deviceId} Port ${portNumber}.`);
        res.json({ status: 'Command sent', deviceId, portNumber, command }); // Return portNumber
    });
});

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

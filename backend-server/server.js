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

mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
    try {
        let payload;
        const messageString = message.toString();

        // Handle the LWT 'offline' string (Option B for now if ESP32 not updated yet)
        // Ideally, update ESP32 to send JSON LWT (Option A)
        if (topic.startsWith('charger/status/') && messageString === 'offline') {
            payload = {
                status: "offline",
                charger_state: "UNKNOWN", // Default state when offline
                timestamp: Date.now() // Use current time in milliseconds
            };
            console.warn(`Converted plain "offline" LWT to JSON for ${topic}`);
        } else {
            payload = JSON.parse(messageString);
        }

        // --- Handle charger/usage topic ---
        if (topic.startsWith('charger/usage/')) {
            const deviceId = topic.split('/')[2];
            const { consumption, timestamp, charger_state } = payload;
            const currentTimestamp = new Date(timestamp); // Convert milliseconds to Date object

            let currentSessionId = activeChargerSessions[deviceId];

            // 1. Find the charging_port.id associated with this deviceId
            //    This assumes you have added 'device_mqtt_id' to your 'charging_port' table.
            const portIdResult = await pool.query('SELECT id FROM charging_port WHERE device_mqtt_id = $1', [deviceId]);
            const portId = portIdResult.rows[0]?.id; // Get the id of the charging_port

            if (!portId) {
                console.warn(`No charging_port found for device_id: ${deviceId}. Cannot start/update session for consumption data.`);
                // Optionally, you might want to store this raw data in a separate "unlinked_consumption_data" table
                // or just skip if it can't be linked to a port.
                return; // Exit if no port is linked
            }

            // 2. Manage the charging_session based on charger_state
            if (charger_state === 'ON') {
                // If no session is being tracked in memory, or backend restarted
                if (!currentSessionId) {
                    // Check if there's an existing active session in DB for this port
                    const existingActiveSession = await pool.query(
                        "SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = 'active'",
                        [portId]
                    );

                    if (existingActiveSession.rows.length === 0) {
                        // No active session found, create a new one
                        const sessionResult = await pool.query(
                            'INSERT INTO charging_session (port_id, start_time, session_status) VALUES ($1, $2, $3) RETURNING session_id', // <--- RETURNING session_id
                            [portId, currentTimestamp, 'active']
                        );
                        currentSessionId = sessionResult.rows[0].session_id; // <--- Get the UUID
                        activeChargerSessions[deviceId] = currentSessionId; // Store in memory
                        console.log(`Started new charging session ${currentSessionId} for port ${portId} (${deviceId})`);
                    } else {
                        // Backend restarted, but session was already active in DB
                        currentSessionId = existingActiveSession.rows[0].session_id;
                        activeChargerSessions[deviceId] = currentSessionId;
                        console.log(`Resumed existing active session ${currentSessionId} for port ${portId} (${deviceId})`);
                    }
                }

                // 3. Insert granular consumption data linked to the session
                if (currentSessionId) { // Ensure we have a session ID
                    await pool.query(
                        'INSERT INTO consumption_data (session_id, device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                        [currentSessionId, deviceId, consumption, timestamp, charger_state] // <--- Pass session_id here
                    );
                    console.log(`Stored consumption for ${deviceId} in session ${currentSessionId}: ${consumption}W`);

                    // 4. Optional: Accumulate energy_consumed_kwh in charging_session
                    const intervalSeconds = 10; // ESP32 publishes every 10 seconds
                    const kwhIncrement = (consumption * intervalSeconds) / (1000 * 3600); // Convert Watts to kWh

                    await pool.query(
                        'UPDATE charging_session SET energy_consumed_kwh = COALESCE(energy_consumed_kwh, 0) + $1, last_status_update = $2 WHERE session_id = $3',
                        [kwhIncrement, currentTimestamp, currentSessionId]
                    );
                }

            } else if (charger_state === 'OFF') {
                // 5. End the session when charger_state goes OFF
                if (currentSessionId) { // Only if there's an active session being tracked
                    await pool.query(
                        "UPDATE charging_session SET end_time = $1, session_status = 'completed', last_status_update = $2 WHERE session_id = $3 AND session_status = 'active'",
                        [currentTimestamp, currentTimestamp, currentSessionId]
                    );
                    console.log(`Ended charging session ${currentSessionId} for port ${portId} (${deviceId})`);
                    delete activeChargerSessions[deviceId]; // Remove from tracking
                }
                // If OFF state is received but no session is active, do nothing or log
            }

        } // --- End charger/usage topic handling ---

        // --- Handle charger/status topic ---
        // This is primarily for device online/offline status and current charger state
        else if (topic.startsWith('charger/status/')) {
            const deviceId = topic.split('/')[2];
            const { status, charger_state, timestamp } = payload;
            const currentTimestamp = new Date(timestamp);

            // Insert into device_status_logs
            await pool.query(
                'INSERT INTO device_status_logs (device_id, status_message, charger_state, timestamp) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0))',
                [deviceId, status, charger_state, timestamp]
            );

            // Upsert into current_device_status
            await pool.query(
                'INSERT INTO current_device_status (device_id, status_message, charger_state, last_update) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0)) ON CONFLICT (device_id) DO UPDATE SET status_message = $2, charger_state = $3, last_update = TO_TIMESTAMP($4 / 1000.0)',
                [deviceId, status, charger_state, timestamp]
            );
            console.log(`Updated status for ${deviceId}: ${status}, Charger: ${charger_state}`);

            // Optional: Update charging_port table for real-time status as well
            const portIdResult = await pool.query('SELECT id FROM charging_port WHERE device_mqtt_id = $1', [deviceId]);
            const portId = portIdResult.rows[0]?.id;
            if (portId) {
                await pool.query(
                    'UPDATE charging_port SET current_status = $1, is_active = $2, last_status_update = $3 WHERE id = $4',
                    [status, (charger_state === 'ON'), currentTimestamp, portId]
                );
            }
        }

    } catch (error) {
        console.error('Error processing MQTT message:', error);
    }
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

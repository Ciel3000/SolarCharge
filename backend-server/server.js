const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
    'http://localhost:3000', // Your local frontend development server
    // !!! IMPORTANT: Add your deployed frontend URL here when it's ready !!!
    // e.g., 'https://your-frontend-app.onrender.com',
    // e.g., 'https://your-custom-domain.com'
  ];

// --- Global state for active sessions (maps `${deviceId}_${portNumberInDevice}` -> session_id) ---
// This must be declared once globally, outside any function.
const activeChargerSessions = {};

// Middleware
// Enables Cross-Origin Resource Sharing
app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      // OR if the origin is in our allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS: Blocking request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true // Important if you're sending cookies or authorization headers
  }));
app.use(express.json()); // Parses incoming JSON requests

// --- Supabase PostgreSQL connection Pool ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true, // Set to true for production when providing CA
        ca: process.env.DB_CA_CERT // <--- This is where your new Render ENV var goes
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

// --- MQTT Broker Configuration (from EMQX Cloud) ---
const MQTT_BROKER_HOST = process.env.EMQX_HOST;
const MQTT_PORT = process.env.EMQX_PORT || 8883; // TLS Port
const MQTT_USERNAME = process.env.EMQX_USERNAME;
const MQTT_PASSWORD = process.env.EMQX_PASSWORD;
const EMQX_CA_CERT = process.env.EMQX_CA_CERT; // CA certificate content from .env

// The unique ID for the single ESP32 that manages the entire station (multiple ports)
const ESP32_STATION_CLIENT_ID = "ESP32_CHARGER_STATION_001"; // <--- IMPORTANT: Must match ESP32 firmware's mqttClientId

// MQTT Client Options
const mqttOptions = {
    clientId: `backend_server_${Math.random().toString(16).substring(2, 10)}`, // Unique ID for backend
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true, // Clean session (no persistent session for backend)
    rejectUnauthorized: process.env.NODE_ENV === 'production', // Ensure server cert is valid in production
    ca: EMQX_CA_CERT, // Provide the CA certificate
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
};

// Create MQTT client instance
const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER_HOST}:${MQTT_PORT}`, mqttOptions);

// --- MQTT Event Handlers ---
mqttClient.on('connect', () => {
    console.log('Backend connected to EMQX Cloud MQTT broker');
    // Subscribe to topics for the single station device ID
    mqttClient.subscribe(`charger/usage/${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => {
        if (!err) console.log(`Subscribed to charger/usage/${ESP32_STATION_CLIENT_ID}`);
    });
    mqttClient.subscribe(`charger/status/${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => {
        if (!err) console.log(`Subscribed to charger/status/${ESP32_STATION_CLIENT_ID}`);
    });
    // Existing station topics (if any, adjust topic string as needed)
    mqttClient.subscribe('station/+/status', { qos: 1 }, (err) => {
        if (!err) console.log('Subscribed to station status topics');
    });
});

// --- Main MQTT Message Processing Handler ---
mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
    try {
        let payload;
        const messageString = message.toString();

        // Handle specific plain string LWT from ESP32, converting it to JSON structure
        if (topic === `charger/status/${ESP32_STATION_CLIENT_ID}` && messageString === 'offline') {
            payload = {
                status: "offline",
                charger_state: "UNKNOWN", // Default state when whole station goes offline
                timestamp: Date.now(),
                port_number: -1 // Special indicator for station-level offline message (will be ignored by port-specific logic)
            };
            console.warn(`Converted plain "offline" LWT to JSON for ${topic}`);
        } else {
            // Attempt to parse as JSON for all other messages
            payload = JSON.parse(messageString);
        }

        // Extract the deviceId (which is the station's MQTT Client ID)
        const deviceId = topic.split('/')[2]; // e.g., ESP32_CHARGER_STATION_001

        // Extract port_number from payload (will be undefined for generic station-level status)
        const portNumberInDevice = payload.port_number;

        // --- Guard: Skip processing if port_number is invalid or missing for a usage/status message ---
        // Unless it's the specific station-level 'online' or 'offline' status.
        if ((topic.startsWith('charger/usage/') || topic.startsWith('charger/status/')) && (portNumberInDevice === undefined || portNumberInDevice < 1)) {
            if (topic === `charger/status/${ESP32_STATION_CLIENT_ID}` && (payload.status === 'online' || payload.status === 'offline')) {
                // This is the overall station status (e.g., station came online/offline).
                // It doesn't map to a specific port_id in the DB for consumption/charger_state.
                console.log(`Station ${deviceId} is ${payload.status}. No specific port_id for this message.`);
                // You could update a 'station_status' table here if you had one.
                return;
            }
            console.warn(`Received message on ${topic} from ${deviceId} without a valid port_number. Skipping.`);
            return; // Exit here for invalid portNumber messages
        }

        // --- Find the actual port_id (UUID) from charging_port table ---
        // This query links the ESP32's ID and its internal port number to a unique DB port_id.
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, portNumberInDevice]
        );
        const actualPortId = portIdResult.rows[0]?.port_id; // Get the port_id UUID

        if (!actualPortId) {
            console.warn(`No charging_port found for device_id: ${deviceId} and port_number_in_device: ${portNumberInDevice}. Skipping message processing.`);
            return; // Cannot process if a specific port mapping is not found in DB
        }

        // Determine unique key for session tracking using deviceId and internal port number
        const sessionKey = `${deviceId}_${portNumberInDevice}`;
        let currentSessionId = activeChargerSessions[sessionKey]; // Get session_id from in-memory map

        // --- Handle charger/usage topic (for consumption data and session management) ---
        if (topic.startsWith('charger/usage/')) {
            const { consumption, timestamp, charger_state } = payload;
            const currentTimestamp = new Date(timestamp); // Convert milliseconds to Date object

            // Logic to START or RESUME a charging session
            // This entire 'if' block ONLY executes if charger_state is 'ON'
            if (charger_state === 'ON') {
                if (!currentSessionId) { // No active session tracked in memory
                    // Check if there's already an active session in DB for this port (e.g., backend restarted)
                    const existingActiveSession = await pool.query(
                        "SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = 'active'",
                        [actualPortId]
                    );

                    if (existingActiveSession.rows.length === 0) {
                        // No active session found in DB, create a new one
                        const sessionResult = await pool.query(
                            'INSERT INTO charging_session (port_id, start_time, session_status) VALUES ($1, $2, $3) RETURNING session_id',
                            [actualPortId, currentTimestamp, 'active']
                        );
                        currentSessionId = sessionResult.rows[0].session_id; // Capture the new UUID
                        activeChargerSessions[sessionKey] = currentSessionId; // Store in memory map
                        console.log(`Started new charging session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    } else {
                        // Backend restarted, but session was already active in DB
                        currentSessionId = existingActiveSession.rows[0].session_id;
                        activeChargerSessions[sessionKey] = currentSessionId;
                        console.log(`Resumed existing active session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    }
                }

                // --- INSERT Consumption Data (ONLY if charger_state is ON AND a valid session is active) ---
                if (currentSessionId) { // This check is crucial to prevent null session_id inserts
                    await pool.query(
                        'INSERT INTO consumption_data (session_id, device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                        [currentSessionId, deviceId, consumption, timestamp, charger_state]
                    );
                    console.log(`Stored consumption for ${deviceId} Port ${portNumberInDevice} in session ${currentSessionId}: ${consumption}W`);

                    // --- Update energy_consumed_kwh in charging_session ---
                    const intervalSeconds = 10; // ESP32 publishes every 10 seconds
                    const kwhIncrement = (consumption * intervalSeconds) / (1000 * 3600); // Watts * seconds / (1000W/kW * 3600s/hr)

                    await pool.query(
                        'UPDATE charging_session SET energy_consumed_kwh = COALESCE(energy_consumed_kwh, 0) + $1, last_status_update = $2 WHERE session_id = $3',
                        [kwhIncrement, currentTimestamp, currentSessionId]
                    );
                } else {
                    console.error(`ERROR: Charger ON for ${deviceId} Port ${portNumberInDevice} but currentSessionId is null. Consumption insert skipped.`);
                }

            } else if (charger_state === 'OFF') {
                // --- Logic to END a charging session ---
                // IMPORTANT: NO consumption_data INSERT occurs when charger_state is OFF.
                // Consumption is only recorded during active (ON) sessions.
                if (currentSessionId) { // Only try to end a session if one is being tracked
                    await pool.query(
                        "UPDATE charging_session SET end_time = $1, session_status = 'completed', last_status_update = $2 WHERE session_id = $3 AND session_status = 'active'",
                        [currentTimestamp, currentTimestamp, currentSessionId]
                    );
                    console.log(`Ended charging session ${currentSessionId} for port ${actualPortId} (Device: ${deviceId}, PortNum: ${portNumberInDevice})`);
                    delete activeChargerSessions[sessionKey]; // Remove from tracking map
                } else {
                    console.log(`Received OFF state for ${deviceId} Port ${portNumberInDevice}, but no active session found to end.`);
                }
            }
        }

        // --- Handle charger/status topic (for overall device/port status updates) ---
        else if (topic.startsWith('charger/status/')) {
            const { status, charger_state, timestamp } = payload;
            const currentTimestamp = new Date(timestamp);

            // Insert into device_status_logs (historical log of status changes)
            await pool.query(
                'INSERT INTO device_status_logs (device_id, port_id, status_message, charger_state, timestamp) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                [deviceId, actualPortId, status, charger_state, timestamp]
            );

            // Upsert into current_device_status (latest status for quick retrieval)
            // ON CONFLICT uses (device_id, port_id) as its unique constraint
            await pool.query(
                'INSERT INTO current_device_status (device_id, port_id, status_message, charger_state, last_update) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0)) ON CONFLICT (device_id, port_id) DO UPDATE SET status_message = $3, charger_state = $4, last_update = TO_TIMESTAMP($5 / 1000.0)',
                [deviceId, actualPortId, status, charger_state, timestamp]
            );
            console.log(`Updated status for ${deviceId} Port ${portNumberInDevice}: ${status}, Charger: ${charger_state}`);

            // Update charging_port table for real-time status display in the main schema
            await pool.query(
                'UPDATE charging_port SET current_status = $1, is_active = $2, last_status_update = $3 WHERE port_id = $4',
                [status, (charger_state === 'ON'), currentTimestamp, actualPortId]
            );
        }

        // --- Handle other existing station topics (if any) ---
        else if (topic.startsWith('station/')) {
            console.log(`Processing station data: ${JSON.stringify(payload)}`);
            // Add your specific logic for station-level data here if needed
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


// --- REST API Endpoints (Updated for multi-port station) ---

// Basic test route
app.get('/', (req, res) => {
    res.send('SolarCharge Backend is running!');
});

// Get consumption data for a specific device (station) AND internal port number
app.get('/api/devices/:deviceId/:portNumber/consumption', async (req, res) => {
    const { deviceId, portNumber } = req.params;
    try {
        // Find the actual port_id (UUID) from charging_port table
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, parseInt(portNumber)] // Ensure portNumber is integer
        );
        const actualPortId = portIdResult.rows[0]?.port_id;

        if (!actualPortId) {
            console.warn(`API: Port not found for deviceId ${deviceId} and portNumber ${portNumber}.`);
            return res.status(404).json({ error: 'Port not found for this device.' });
        }

        // Fetch consumption data linked to sessions for this specific actualPortId
        const result = await pool.query(
            'SELECT consumption_watts, timestamp, charger_state FROM consumption_data WHERE device_id = $1 AND session_id IN (SELECT session_id FROM charging_session WHERE port_id = $2) ORDER BY timestamp DESC LIMIT 100',
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
        // JOIN current_device_status with charging_port to get port_number_in_device
        const result = await pool.query(`
            SELECT 
                cds.device_id, 
                cds.port_id, 
                cds.status_message, 
                cds.charger_state, 
                cds.last_update, 
                cp.port_number_in_device 
            FROM 
                current_device_status cds
            JOIN 
                charging_port cp ON cds.port_id = cp.port_id
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});

// Send control command to a specific device (station) AND internal port number
app.post('/api/devices/:deviceId/:portNumber/control', (req, res) => {
    const { deviceId, portNumber } = req.params;
    const { command } = req.body; // Expects { "command": "ON" | "OFF", "port_number": 1 | 2 }

    if (!command || (command !== 'ON' && command !== 'OFF')) {
        return res.status(400).json({ error: 'Invalid command. Must be "ON" or "OFF".' });
    }

    // Publish to the station's control topic, but payload specifies the port to control
    const controlTopic = `charger/control/${deviceId}`;
    const payload = JSON.stringify({ command: command, port_number: parseInt(portNumber) }); // Payload includes port_number

    mqttClient.publish(controlTopic, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error(`Failed to publish control command to ${controlTopic}:`, err);
            return res.status(500).json({ error: 'Failed to send control command' });
        }
        console.log(`Sent command '${command}' to ${deviceId} Port ${portNumber}.`);
        res.json({ status: 'Command sent', deviceId, portNumber, command }); // Return portNumber in response
    });
});


// --- Your Existing API Routes for overall application management ---
// (These routes are for your 'stations', 'readings', 'users' tables from your diagram)
// Example:
/*
app.get('/api/stations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stations ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});
app.get('/api/stations/:id', async (req, res) => { /* ... */ /* });
app.post('/api/stations', async (req, res) => { /* ... */ /* });
app.put('/api/stations/:id', async (req, res) => { /* ... */ /* });
app.delete('/api/stations/:id', async (req, res) => { /* ... */ /* });

app.get('/api/readings', async (req, res) => { /* ... */ /* });
app.get('/api/stations/:id/readings', async (req, res) => { /* ... */ /* });
app.post('/api/readings', async (req, res) => { /* ... */ /* });

app.get('/api/users', async (req, res) => { /* ... */ /* });
app.get('/api/users/:id', async (req, res) => { /* ... */ /* });
app.post('/api/users', async (req, res) => { /* ... */ /* });
app.put('/api/users/:id', async (req, res) => { /* ... */ /* });
app.delete('/api/users/:id', async (req, res) => { /* ... */ /* });
*/

// Existing endpoint for ESP32 commands (kept for backward compatibility, adjust if needed)
// This endpoint might be redundant if /api/devices/:deviceId/:portNumber/control is used.
// If your frontend still calls this, ensure it's functional.
app.post('/api/esp32/command', async (req, res) => {
    const { action, stationId, portId } = req.body;

    console.log(`Received command from frontend: Action=${action}, Station=${stationId}, Port=${portId}`);

    const topic = `station/${stationId}/control`;
    let message = '';
    // This part assumes a very specific legacy message format, might need updating for multi-port
    // If your ESP32_CHARGER_STATION_001 handles relay1_on/relay2_on, then this is okay.
    // If it expects JSON like {"command": "ON", "port_number": 1}, you need to build that payload.
    if (action === 'activate' && portId === 1) message = 'relay1_on';
    else if (action === 'deactivate' && portId === 1) message = 'relay1_off';
    else if (action === 'activate' && portId === 2) message = 'relay2_on';
    else if (action === 'deactivate' && portId === 2) message = 'relay2_off';
    else return res.status(400).json({ error: 'Invalid action or portId' });

    mqttClient.publish(topic, message, (err) => {
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

// Error handling middleware (catches unhandled errors in async routes)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handlers
process.on('SIGINT', () => { // Handles Ctrl+C
    console.log('Shutting down server (SIGINT)...');
    mqttClient.end(() => { // Close MQTT client first
        console.log('MQTT client disconnected.');
        pool.end(() => { // Then close database pool
            console.log('Database pool closed.');
            process.exit(0);
        });
    });
});

process.on('SIGTERM', () => { // Handles termination signals from Render
    console.log('Shutting down server (SIGTERM)...');
    mqttClient.end(() => { // Close MQTT client first
        console.log('MQTT client disconnected.');
        pool.end(() => { // Then close database pool
            console.log('Database pool closed.');
            process.exit(0);
        });
    });
});

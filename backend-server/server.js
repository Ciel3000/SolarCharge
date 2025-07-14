const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt');
require('dotenv').config(); // Load environment variables from .env file
const fetch = require('node-fetch'); // For JWKS
const jwt = require('jsonwebtoken'); // For JWT decode/verify

const app = express();
const PORT = process.env.PORT || 3001;

// --- Global state for active sessions and timers ---
// activeChargerSessions: Maps `${deviceId}_${portNumberInDevice}` -> session_id
const activeChargerSessions = {};
// activePortTimers: Maps `${deviceId}_${portNumberInDevice}` -> { timerId: setTimeout_ID, lastConsumptionTime: Date.now() }
const activePortTimers = {};
const INACTIVITY_TIMEOUT_SECONDS = 60; // 60 seconds for inactivity timeout (changed from 100)

// Middleware
const allowedOrigins = [
  'http://localhost:3000', // Your local frontend development server
  // !!! IMPORTANT: Add your deployed frontend URL here when it's ready !!!
  // e.g., 'https://your-frontend-app.onrender.com',
  // e.g., 'https://your-custom-domain.com'
];

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
        // Keep rejectUnauthorized: true for production for security
        rejectUnauthorized: true, // <--- Set to true for production if providing CA
        ca: process.env.DB_CA_CERT // <--- Provide the CA certificate content
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

// --- Helper function to handle automatic port turn-off due to inactivity ---
async function handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, sessionId) {
    const sessionKey = `${deviceId}_${internalPortNumber}`;
    console.log(`Timer expired for ${sessionKey}. Checking for inactivity.`);

    try {
        // Check if the session is still active in the DB (important if backend restarted)
        const sessionCheck = await pool.query(
            "SELECT session_id, session_status, last_status_update FROM charging_session WHERE session_id = $1",
            [sessionId]
        );

        if (sessionCheck.rows.length > 0 && sessionCheck.rows[0].session_status === 'active') {
            const lastUpdate = sessionCheck.rows[0].last_status_update;
            const now = new Date();
            
            // Calculate seconds since last activity
            const secondsSinceLastActivity = lastUpdate ? 
                Math.floor((now - new Date(lastUpdate)) / 1000) : 
                INACTIVITY_TIMEOUT_SECONDS + 1; // If no last_status_update, assume it's inactive
            
            console.log(`${sessionKey}: ${secondsSinceLastActivity} seconds since last activity.`);
            
            // Only deactivate if truly inactive for the timeout period
            if (secondsSinceLastActivity >= INACTIVITY_TIMEOUT_SECONDS) {
                // Send OFF command to ESP32
                const controlTopic = `charger/control/${deviceId}`;
                const mqttPayload = JSON.stringify({ command: 'OFF', port_number: internalPortNumber });
                mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`Failed to publish automatic OFF command to ${controlTopic}:`, err);
                    } else {
                        console.log(`Automatically sent OFF command to ${deviceId} Port ${internalPortNumber} due to inactivity (${secondsSinceLastActivity}s).`);
                    }
                });

                // Mark session as auto_completed in DB
                await pool.query(
                    "UPDATE charging_session SET end_time = NOW(), session_status = 'auto_completed', last_status_update = NOW() WHERE session_id = $1",
                    [sessionId]
                );
                console.log(`Marked session ${sessionId} as 'auto_completed' due to inactivity.`);

                // Clear from in-memory tracking
                delete activeChargerSessions[sessionKey];
                delete activePortTimers[sessionKey];
            } else {
                // If still active but timer expired, reset the timer
                console.log(`Session ${sessionId} for ${sessionKey} is still active. Resetting inactivity timer.`);
                activePortTimers[sessionKey] = {
                    timerId: setTimeout(
                        () => handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, sessionId),
                        INACTIVITY_TIMEOUT_SECONDS * 1000
                    ),
                    lastConsumptionTime: Date.now()
                };
            }
        } else {
            console.log(`Session ${sessionId} for ${sessionKey} was already inactive or not found. No auto turn-off needed.`);
            delete activeChargerSessions[sessionKey]; // Clean up if session was manually ended but timer persisted
            delete activePortTimers[sessionKey];
        }
    } catch (error) {
        console.error(`Error during inactivity turn-off for ${sessionKey}:`, error);
    }
}


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
                charger_state: "UNKNOWN",
                timestamp: Date.now(),
                port_number: -1 // Special indicator for station-level offline message (will be ignored by port-specific logic)
            };
            console.warn(`MQTT: Converted plain "offline" LWT to JSON for ${topic}`);
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
                console.log(`MQTT: Station ${deviceId} is ${payload.status}. No specific port_id for this message.`);
                return;
            }
            console.warn(`MQTT: Received message on ${topic} from ${deviceId} without a valid port_number. Skipping.`);
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
            console.warn(`MQTT: No charging_port found for device_id: ${deviceId} and port_number_in_device: ${portNumberInDevice}. Skipping message processing.`);
            return; // Cannot process if a specific port mapping is not found in DB
        }

        // Determine unique key for session tracking using deviceId and internal port number
        const sessionKey = `${deviceId}_${portNumberInDevice}`;
        const currentSessionId = activeChargerSessions[sessionKey]; // Get session_id from in-memory map

        // --- Handle charger/usage topic (for consumption data and session management) ---
        if (topic.startsWith('charger/usage/')) {
            const { consumption, timestamp, charger_state } = payload;
            const currentTimestamp = new Date(timestamp); // Convert milliseconds to Date object

            if (charger_state === 'ON') { // Only insert consumption if charger is ON
                if (currentSessionId) { // Only insert if an active session is tracked (created by API)
                    // Validate consumption value to prevent negative or unreasonable readings
                    const validatedConsumption = validateConsumption(consumption);
                    
                    if (validatedConsumption > 0) { // Only record if consumption is positive
                        await pool.query(
                            'INSERT INTO consumption_data (session_id, device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                            [currentSessionId, deviceId, validatedConsumption, timestamp, charger_state]
                        );
                        console.log(`MQTT: Stored consumption for ${deviceId} Port ${portNumberInDevice} in session ${currentSessionId}: ${validatedConsumption}W`);

                        const intervalSeconds = 10; // ESP32 publishes every 10 seconds
                        const kwhIncrement = (validatedConsumption * intervalSeconds) / (1000 * 3600); // Watts * seconds / (1000W/kW * 3600s/hr)

                        // --- Calculate mAh Increment (assuming a nominal charging voltage, e.g., 12V for the battery) ---
                        const NOMINAL_CHARGING_VOLTAGE_DC = 12; // Volts DC. Adjust this based on your battery system.
                        const currentAmps = validatedConsumption / NOMINAL_CHARGING_VOLTAGE_DC; // Amps = Watts / Volts
                        const mAhIncrement = (currentAmps * 1000) * (intervalSeconds / 3600); // mAh = Amps * 1000 * (seconds / 3600)

                        await pool.query(
                            'UPDATE charging_session SET energy_consumed_kwh = COALESCE(energy_consumed_kwh, 0) + $1, total_mah_consumed = COALESCE(total_mah_consumed, 0) + $2, last_status_update = $3 WHERE session_id = $4',
                            [kwhIncrement, mAhIncrement, currentTimestamp, currentSessionId]
                        );

                        // --- Reset inactivity timer on new consumption data ---
                        if (activePortTimers[sessionKey]) {
                            clearTimeout(activePortTimers[sessionKey].timerId);
                            activePortTimers[sessionKey].lastConsumptionTime = Date.now();
                            activePortTimers[sessionKey].timerId = setTimeout(
                                () => handleInactivityTurnOff(deviceId, portNumberInDevice, actualPortId, currentSessionId),
                                INACTIVITY_TIMEOUT_SECONDS * 1000
                            );
                            console.log(`MQTT: Timer reset for ${sessionKey} due to new consumption.`);
                        }
                    } else {
                        console.warn(`MQTT: Ignoring invalid consumption value (${consumption}W) for ${deviceId} Port ${portNumberInDevice}`);
                    }
                } else {
                    console.warn(`MQTT: Charger ON for ${deviceId} Port ${portNumberInDevice} but no active session found in memory. Consumption insert skipped.`);
                }
            } else if (charger_state === 'OFF') {
                // No session ending here. Session ending is handled by API POST /control or inactivity timer.
                console.log(`MQTT: Received OFF state for ${deviceId} Port ${portNumberInDevice}. Consumption not logged for OFF state.`);
            }
        }

        // --- Handle charger/status topic (for overall device/port status updates) ---
        else if (topic.startsWith('charger/status/')) {
            const { status, charger_state, timestamp } = payload;
            const currentTimestamp = new Date(timestamp);

            // --- DEBUGGING: Log payload for status messages ---
            console.log(`MQTT Status Payload Debug: deviceId=${deviceId}, portNumberInDevice=${portNumberInDevice}, status=${status}, charger_state=${charger_state}, timestamp=${timestamp}`);
            // --- END DEBUGGING ---

            // Corrected INSERT for device_status_logs
            await pool.query(
                `INSERT INTO device_status_logs (device_id, port_id, status_message, charger_state, timestamp)
                 VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))`, // Corrected parameter order for TO_TIMESTAMP
                [deviceId, actualPortId, status, charger_state, timestamp]
            );

            // Corrected UPSERT for current_device_status
            await pool.query(
                `INSERT INTO current_device_status (device_id, port_id, status_message, charger_state, last_update)
                 VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))
                 ON CONFLICT (device_id, port_id) DO UPDATE SET
                    status_message = $3,
                    charger_state = $4,
                    last_update = TO_TIMESTAMP($5 / 1000.0)`, // Corrected parameter order for TO_TIMESTAMP
                [deviceId, actualPortId, status, charger_state, timestamp]
            );
            console.log(`MQTT: Updated status for ${deviceId} Port ${portNumberInDevice}: ${status}, Charger: ${charger_state}`);

            // Update charging_port table for real-time status display in the main schema
            await pool.query(
                'UPDATE charging_port SET current_status = $1, is_occupied = $2, last_status_update = $3 WHERE port_id = $4',
                [status, (charger_state === 'ON'), currentTimestamp, actualPortId]
            );
        }

        // --- Handle other existing station topics (if any) ---
        else if (topic.startsWith('station/')) {
            console.log(`MQTT: Processing station data: ${JSON.stringify(payload)}`);
        }

    } catch (error) {
        console.error('MQTT: Error processing MQTT message:', error);
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
        // First, find the actual port_id (UUID) from charging_port table
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, parseInt(portNumber)] // Ensure portNumber is integer
        );
        const actualPortId = portIdResult.rows[0]?.port_id;

        if (!actualPortId) {
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
        // LEFT JOIN charging_session to get total_mah_consumed for active sessions
        const result = await pool.query(`
            SELECT
                cds.device_id,
                cds.port_id,
                cds.status_message,
                cds.charger_state,
                cds.last_update,
                cp.port_number_in_device,
                cs.total_mah_consumed, -- <--- NEW: Include total_mah_consumed
                cs.session_id -- <--- NEW: Include session_id for debugging/linking
            FROM
                current_device_status cds
            JOIN
                charging_port cp ON cds.port_id = cp.port_id
            LEFT JOIN -- Use LEFT JOIN to include ports even if no active session
                charging_session cs ON cds.port_id = cs.port_id AND cs.session_status = 'active'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});

// Send control command to a specific device (station) AND internal port number
app.post('/api/devices/:deviceId/:portNumber/control', async (req, res) => {
    const { deviceId, portNumber } = req.params;
    const { command, user_id, station_id } = req.body; // <--- IMPORTANT: Now expecting user_id and station_id

    if (!command || (command !== 'ON' && command !== 'OFF')) {
        return res.status(400).json({ error: 'Invalid command. Must be "ON" or "OFF".' });
    }

    const controlTopic = `charger/control/${deviceId}`;
    const internalPortNumber = parseInt(portNumber); // Ensure it's an integer

    try {
        // Find the actual port_id (UUID) from charging_port table
        const portIdResult = await pool.query(
            'SELECT port_id FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, internalPortNumber]
        );
        const actualPortId = portIdResult.rows[0]?.port_id;

        if (!actualPortId) {
            console.warn(`API: Port not found for deviceId ${deviceId} and portNumber ${internalPortNumber}.`);
            return res.status(404).json({ error: `Port ${internalPortNumber} not found for device ${deviceId}.` });
        }

        // Session Management Logic (Moved from MQTT handler to API handler)
        const sessionKey = `${deviceId}_${internalPortNumber}`;
        let currentSessionId = activeChargerSessions[sessionKey];

        if (command === 'ON') {
            if (!user_id || !station_id) {
                return res.status(400).json({ error: 'user_id and station_id are required to start a session.' });
            }

            // Check if there's already an active session in DB for this port
            const existingActiveSession = await pool.query(
                "SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = 'active'",
                [actualPortId]
            );

            if (existingActiveSession.rows.length === 0) {
                // No active session found in DB, create a new one
                const sessionResult = await pool.query(
                    'INSERT INTO charging_session (user_id, port_id, station_id, start_time, session_status, is_premium, energy_consumed_kwh, total_mah_consumed, last_status_update) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, NOW()) RETURNING session_id',
                    [user_id, actualPortId, station_id, 'active', true, 0, 0] // Initialize energy and mAh consumed to 0
                );
                currentSessionId = sessionResult.rows[0].session_id;
                activeChargerSessions[sessionKey] = currentSessionId;
                console.log(`API: Started new charging session ${currentSessionId} for port ${actualPortId} (User: ${user_id})`);
            } else {
                // Session already active (e.g., backend restarted, or multiple ON commands)
                currentSessionId = existingActiveSession.rows[0].session_id;
                activeChargerSessions[sessionKey] = currentSessionId; // Ensure in-memory map is updated
                
                // Update the last_status_update to reset inactivity timer
                await pool.query(
                    "UPDATE charging_session SET last_status_update = NOW() WHERE session_id = $1",
                    [currentSessionId]
                );
                
                console.log(`API: Resuming existing active session ${currentSessionId} for port ${actualPortId} (User: ${user_id})`);
            }

            // --- Start/Reset inactivity timer when charger is turned ON via API ---
            if (activePortTimers[sessionKey]) {
                clearTimeout(activePortTimers[sessionKey].timerId);
            }
            activePortTimers[sessionKey] = {
                timerId: setTimeout(
                    () => handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, currentSessionId),
                    INACTIVITY_TIMEOUT_SECONDS * 1000
                ),
                lastConsumptionTime: Date.now() // Initialize last consumption time
            };
            console.log(`API: Inactivity timer started for ${sessionKey}.`);

        } else if (command === 'OFF') {
            if (currentSessionId) {
                // Get current consumption values before ending session
                const sessionData = await pool.query(
                    "SELECT energy_consumed_kwh, total_mah_consumed FROM charging_session WHERE session_id = $1",
                    [currentSessionId]
                );
                
                const energyConsumed = sessionData.rows[0]?.energy_consumed_kwh || 0;
                const mAhConsumed = sessionData.rows[0]?.total_mah_consumed || 0;
                
                // End the active session in DB
                await pool.query(
                    "UPDATE charging_session SET end_time = NOW(), session_status = 'completed', last_status_update = NOW() WHERE session_id = $1 AND session_status = 'active'",
                    [currentSessionId]
                );
                console.log(`API: Ended charging session ${currentSessionId} for port ${actualPortId}. Energy consumed: ${energyConsumed.toFixed(3)} kWh, ${mAhConsumed.toFixed(0)} mAh`);
                delete activeChargerSessions[sessionKey]; // Remove from tracking map

                // --- Clear inactivity timer when charger is turned OFF via API ---
                if (activePortTimers[sessionKey]) {
                    clearTimeout(activePortTimers[sessionKey].timerId);
                    delete activePortTimers[sessionKey];
                    console.log(`API: Inactivity timer cleared for ${sessionKey}.`);
                }

            } else {
                console.log(`API: Received OFF command for ${deviceId} Port ${internalPortNumber}, but no active session found to end in memory.`);
                // Check DB for active session if in-memory map is not definitive
                const activeSessionCheck = await pool.query(
                    "SELECT session_id FROM charging_session WHERE port_id = $1 AND session_status = 'active'",
                    [actualPortId]
                );
                
                if (activeSessionCheck.rows.length > 0) {
                    const dbSessionId = activeSessionCheck.rows[0].session_id;
                    // End the session found in DB
                    await pool.query(
                        "UPDATE charging_session SET end_time = NOW(), session_status = 'completed', last_status_update = NOW() WHERE session_id = $1",
                        [dbSessionId]
                    );
                    console.log(`API: Ended charging session ${dbSessionId} found in DB for port ${actualPortId}.`);
                }
            }
        }

        // Publish MQTT command (payload remains the same for ESP32)
        const mqttPayload = JSON.stringify({ command: command, port_number: internalPortNumber });

        mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
            if (err) {
                console.error(`Failed to publish control command to ${controlTopic}:`, err);
                return res.status(500).json({ error: 'Failed to send control command via MQTT' });
            }
            console.log(`API: Sent MQTT command '${command}' to ${deviceId} Port ${internalPortNumber}.`);
            
            // Return session details including consumption data if available
            if (command === 'ON') {
                res.json({ 
                    status: 'Command sent', 
                    deviceId, 
                    portNumber: internalPortNumber, 
                    command, 
                    sessionId: currentSessionId 
                });
            } else {
                // For OFF command, try to include the consumption data
                res.json({ 
                    status: 'Command sent', 
                    deviceId, 
                    portNumber: internalPortNumber, 
                    command
                });
            }
        });

    } catch (error) {
        console.error('Error processing control command:', error);
        res.status(500).json({ error: `Failed to process control command: ${error.message}` });
    }
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

// --- Admin API Routes ---

// Admin Dashboard Stats
app.get('/api/admin/dashboard/stats', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    // Get user stats
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active
      FROM users
    `);
    
    // Get station stats
    const stationStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active
      FROM charging_station
    `);
    
    // Get port stats
    const portStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_occupied = false THEN 1 END) as available,
        COUNT(CASE WHEN is_occupied = true THEN 1 END) as occupied
      FROM charging_port
    `);
    
    // Get session stats
    const sessionStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN start_time > CURRENT_DATE THEN 1 END) as today,
        COUNT(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week,
        COUNT(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month
      FROM charging_session
    `);
    
    // Get revenue stats
    const revenueStats = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE THEN cost ELSE 0 END), 0) as today,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '7 days' THEN cost ELSE 0 END), 0) as week,
        COALESCE(SUM(CASE WHEN start_time > CURRENT_DATE - INTERVAL '30 days' THEN cost ELSE 0 END), 0) as month
      FROM charging_session
    `);
    
    res.json({
      users: userStats.rows[0],
      stations: stationStats.rows[0],
      ports: portStats.rows[0],
      sessions: sessionStats.rows[0],
      revenue: revenueStats.rows[0]
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Recent Sessions for Dashboard
app.get('/api/admin/sessions/recent', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cs.session_id as id,
        CONCAT(u.fname, ' ', u.lname) as user_name,
        s.station_name,
        cp.port_number_in_device as port,
        cs.start_time,
        cs.end_time,
        EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time))/60 as duration,
        cs.energy_consumed_kwh as energy,
        cs.cost,
        cs.session_status as status
      FROM 
        charging_session cs
      JOIN 
        users u ON cs.user_id = u.user_id
      JOIN 
        charging_station s ON cs.station_id = s.station_id
      JOIN 
        charging_port cp ON cs.port_id = cp.port_id
      ORDER BY 
        cs.start_time DESC
      LIMIT 5
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Recent sessions error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// System Status
app.get('/api/admin/system/status', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    // Check if any critical errors in last 24 hours
    const errors = await pool.query(`
      SELECT COUNT(*) as error_count
      FROM system_logs
      WHERE log_type = 'error' AND timestamp > NOW() - INTERVAL '24 hours'
    `);
    
    // Get latest system status log
    const statusLog = await pool.query(`
      SELECT timestamp as last_update
      FROM system_logs
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    const status = errors.rows[0].error_count > 0 ? 'Warning' : 'Operational';
    const lastUpdate = statusLog.rows.length > 0 ? statusLog.rows[0].last_update : new Date();
    
    res.json({
      status,
      lastUpdate
    });
  } catch (err) {
    console.error('System status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Station Battery Levels
app.get('/api/admin/stations/battery', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        station_name,
        current_battery_level as level,
        CASE 
          WHEN current_battery_level > 70 THEN 'Good'
          WHEN current_battery_level > 40 THEN 'Warning'
          ELSE 'Critical'
        END as status
      FROM 
        charging_station
      ORDER BY 
        station_name
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Battery levels error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Users Management
app.get('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        user_id, 
        fname, 
        lname, 
        email, 
        contact_number,
        is_admin, 
        created_at, 
        last_login
      FROM users
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { fname, lname, email, contact_number, is_admin } = req.body;
    
    // In a real implementation, you'd also create the Supabase auth user
    // For now, we'll just create the user in the database
    const result = await pool.query(
      `INSERT INTO users (fname, lname, email, contact_number, is_admin, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING user_id, fname, lname, email, contact_number, is_admin, created_at`,
      [fname, lname, email, contact_number, is_admin]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create user error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { fname, lname, contact_number, is_admin } = req.body;
    
    const result = await pool.query(
      `UPDATE users
       SET fname = $1, lname = $2, contact_number = $3, is_admin = $4
       WHERE user_id = $5
       RETURNING user_id, fname, lname, email, contact_number, is_admin, created_at`,
      [fname, lname, contact_number, is_admin, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Stations Management
app.get('/api/admin/stations', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        station_id, 
        station_name, 
        location_description, 
        latitude, 
        longitude,
        solar_panel_wattage,
        battery_capacity_kwh,
        current_battery_level,
        is_active,
        created_at,
        last_maintenance_date,
        (SELECT COUNT(*) FROM charging_port WHERE station_id = s.station_id AND is_premium = false) as num_free_ports,
        (SELECT COUNT(*) FROM charging_port WHERE station_id = s.station_id AND is_premium = true) as num_premium_ports
      FROM 
        charging_station s
      ORDER BY 
        created_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Admin stations error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/stations', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { 
      station_name, 
      location_description, 
      latitude, 
      longitude,
      solar_panel_wattage,
      battery_capacity_kwh,
      num_free_ports,
      num_premium_ports,
      is_active,
      current_battery_level
    } = req.body;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert station
      const stationResult = await client.query(
        `INSERT INTO charging_station 
         (station_name, location_description, latitude, longitude, solar_panel_wattage, 
          battery_capacity_kwh, is_active, current_battery_level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING station_id`,
        [station_name, location_description, latitude, longitude, solar_panel_wattage, 
         battery_capacity_kwh, is_active, current_battery_level]
      );
      
      const stationId = stationResult.rows[0].station_id;
      
      // Create free ports
      for (let i = 0; i < num_free_ports; i++) {
        await client.query(
          `INSERT INTO charging_port 
           (station_id, port_number_in_device, is_premium, is_occupied, current_status, device_mqtt_id)
           VALUES ($1, $2, false, false, 'available', $3)`,
          [stationId, i + 1, `ESP32_CHARGER_STATION_${stationId.substring(0, 3)}`]
        );
      }
      
      // Create premium ports
      for (let i = 0; i < num_premium_ports; i++) {
        await client.query(
          `INSERT INTO charging_port 
           (station_id, port_number_in_device, is_premium, is_occupied, current_status, device_mqtt_id)
           VALUES ($1, $2, true, false, 'available', $3)`,
          [stationId, num_free_ports + i + 1, `ESP32_CHARGER_STATION_${stationId.substring(0, 3)}`]
        );
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ station_id: stationId, message: 'Station created successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Create station error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/stations/:stationId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { stationId } = req.params;
    const { 
      station_name, 
      location_description, 
      latitude, 
      longitude,
      solar_panel_wattage,
      battery_capacity_kwh,
      is_active,
      current_battery_level
    } = req.body;
    
    const result = await pool.query(
      `UPDATE charging_station
       SET station_name = $1, location_description = $2, latitude = $3, longitude = $4,
           solar_panel_wattage = $5, battery_capacity_kwh = $6, is_active = $7, 
           current_battery_level = $8
       WHERE station_id = $9
       RETURNING station_id`,
      [station_name, location_description, latitude, longitude, solar_panel_wattage,
       battery_capacity_kwh, is_active, current_battery_level, stationId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json({ message: 'Station updated successfully' });
  } catch (err) {
    console.error('Update station error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/stations/:stationId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { stationId } = req.params;
    
    // Check if station exists
    const stationCheck = await pool.query('SELECT station_id FROM charging_station WHERE station_id = $1', [stationId]);
    if (stationCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete related charging sessions
      await client.query(`
        DELETE FROM charging_session
        WHERE station_id = $1
      `, [stationId]);
      
      // Delete related charging ports
      await client.query(`
        DELETE FROM charging_port
        WHERE station_id = $1
      `, [stationId]);
      
      // Delete station
      await client.query(`
        DELETE FROM charging_station
        WHERE station_id = $1
      `, [stationId]);
      
      await client.query('COMMIT');
      
      res.json({ message: 'Station deleted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Delete station error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Sessions & Reports
app.get('/api/admin/sessions', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { range = 'week', station = 'all', status = 'all' } = req.query;
    
    let timeFilter;
    switch (range) {
      case 'day':
        timeFilter = "start_time > CURRENT_DATE";
        break;
      case 'week':
        timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'month':
        timeFilter = "start_time > CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'year':
        timeFilter = "start_time > CURRENT_DATE - INTERVAL '365 days'";
        break;
      default:
        timeFilter = "start_time > CURRENT_DATE - INTERVAL '7 days'";
    }
    
    let stationFilter = station !== 'all' ? `AND cs.station_id = '${station}'` : '';
    let statusFilter = status !== 'all' ? `AND cs.session_status = '${status}'` : '';
    
    const query = `
      SELECT 
        cs.session_id as id,
        CONCAT(u.fname, ' ', u.lname) as user_name,
        s.station_name,
        cp.port_number_in_device as port,
        cs.start_time,
        cs.end_time,
        EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time))/60 as duration,
        cs.energy_consumed_kwh as energy,
        cs.cost,
        cs.session_status as status
      FROM 
        charging_session cs
      JOIN 
        users u ON cs.user_id = u.user_id
      JOIN 
        charging_station s ON cs.station_id = s.station_id
      JOIN 
        charging_port cp ON cs.port_id = cp.port_id
      WHERE 
        ${timeFilter} ${stationFilter} ${statusFilter}
      ORDER BY 
        cs.start_time DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Sessions error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/revenue', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    
    // Get daily revenue for the last 7 days
    const dailyQuery = `
      SELECT 
        DATE(start_time) as date,
        SUM(cost) as amount,
        COUNT(*) as sessions
      FROM 
        charging_session
      WHERE 
        start_time > CURRENT_DATE - INTERVAL '7 days'
      GROUP BY 
        DATE(start_time)
      ORDER BY 
        date
    `;
    
    // Get weekly revenue for the last 4 weeks
    const weeklyQuery = `
      SELECT 
        DATE_TRUNC('week', start_time) as date,
        SUM(cost) as amount,
        COUNT(*) as sessions
      FROM 
        charging_session
      WHERE 
        start_time > CURRENT_DATE - INTERVAL '28 days'
      GROUP BY 
        DATE_TRUNC('week', start_time)
      ORDER BY 
        date
    `;
    
    // Get monthly revenue for the last 6 months
    const monthlyQuery = `
      SELECT 
        DATE_TRUNC('month', start_time) as date,
        SUM(cost) as amount,
        COUNT(*) as sessions
      FROM 
        charging_session
      WHERE 
        start_time > CURRENT_DATE - INTERVAL '6 months'
      GROUP BY 
        DATE_TRUNC('month', start_time)
      ORDER BY 
        date
    `;
    
    // Get total revenue
    const totalQuery = `
      SELECT SUM(cost) as total
      FROM charging_session
    `;
    
    const dailyResult = await pool.query(dailyQuery);
    const weeklyResult = await pool.query(weeklyQuery);
    const monthlyResult = await pool.query(monthlyQuery);
    const totalResult = await pool.query(totalQuery);
    
    res.json({
      daily: dailyResult.rows,
      weekly: weeklyResult.rows,
      monthly: monthlyResult.rows,
      total: totalResult.rows[0].total || 0
    });
  } catch (err) {
    console.error('Revenue error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/usage', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { range = 'week' } = req.query;
    
    // Get usage by station
    const byStationQuery = `
      SELECT 
        s.station_name,
        COUNT(cs.session_id) as sessions,
        SUM(cs.energy_consumed_kwh) as energy,
        SUM(EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time))/60) as duration
      FROM 
        charging_session cs
      JOIN 
        charging_station s ON cs.station_id = s.station_id
      WHERE 
        cs.start_time > CURRENT_DATE - INTERVAL '30 days'
      GROUP BY 
        s.station_name
      ORDER BY 
        sessions DESC
    `;
    
    // Get usage by hour of day
    const byHourQuery = `
      SELECT 
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as sessions
      FROM 
        charging_session
      WHERE 
        start_time > CURRENT_DATE - INTERVAL '30 days'
      GROUP BY 
        EXTRACT(HOUR FROM start_time)
      ORDER BY 
        hour
    `;
    
    // Get usage by day of week
    const byDayQuery = `
      SELECT 
        TO_CHAR(start_time, 'Day') as day,
        COUNT(*) as sessions
      FROM 
        charging_session
      WHERE 
        start_time > CURRENT_DATE - INTERVAL '30 days'
      GROUP BY 
        TO_CHAR(start_time, 'Day'), EXTRACT(DOW FROM start_time)
      ORDER BY 
        EXTRACT(DOW FROM start_time)
    `;
    
    const byStationResult = await pool.query(byStationQuery);
    const byHourResult = await pool.query(byHourQuery);
    const byDayResult = await pool.query(byDayQuery);
    
    res.json({
      byStation: byStationResult.rows,
      byHour: byHourResult.rows,
      byDay: byDayResult.rows
    });
  } catch (err) {
    console.error('Usage error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin Logs
app.get('/api/admin/logs', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { range = '24h' } = req.query;
    
    let timeFilter;
    switch (range) {
      case '1h':
        timeFilter = "timestamp > NOW() - INTERVAL '1 hour'";
        break;
      case '24h':
        timeFilter = "timestamp > NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        timeFilter = "timestamp > NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        timeFilter = "timestamp > NOW() - INTERVAL '30 days'";
        break;
      default:
        timeFilter = "timestamp > NOW() - INTERVAL '24 hours'";
    }
    
    const query = `
      SELECT 
        log_id,
        timestamp,
        log_type,
        source,
        message,
        user_id,
        (SELECT email FROM users WHERE user_id = system_logs.user_id) as user_email
      FROM 
        system_logs
      WHERE 
        ${timeFilter}
      ORDER BY 
        timestamp DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Logs error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

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

    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
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
            // Clear all active timers on shutdown
            for (const key in activePortTimers) {
                clearTimeout(activePortTimers[key].timerId);
            }
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
            // Clear all active timers on shutdown
            for (const key in activePortTimers) {
                clearTimeout(activePortTimers[key].timerId);
            }
            process.exit(0);
        });
    });
});

// --- Supabase JWT Authentication Middleware ---
// Helper to get JWKS and verify JWT
const SUPABASE_JWKS_URL = process.env.SUPABASE_JWKS_URL || 'https://bhiitpltxlcgefugftre.supabase.co/auth/v1/keys'; // Change to your project
let cachedJwks = null;
let cachedJwksAt = 0;
async function getSupabaseJwks() {
  if (cachedJwks && Date.now() - cachedJwksAt < 60 * 60 * 1000) return cachedJwks;
  const res = await fetch(SUPABASE_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  const { keys } = await res.json();
  cachedJwks = keys;
  cachedJwksAt = Date.now();
  return keys;
}
function getKeyFromJwks(kid, jwks) {
  return jwks.find(k => k.kid === kid);
}
function certToPEM(cert) {
  // Convert x5c to PEM format
  let pem = cert.match(/.{1,64}/g).join('\n');
  pem = `-----BEGIN CERTIFICATE-----\n${pem}\n-----END CERTIFICATE-----\n`;
  return pem;
}
async function verifySupabaseJWT(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Invalid JWT');
  const kid = decoded.header.kid;
  const jwks = await getSupabaseJwks();
  const key = getKeyFromJwks(kid, jwks);
  if (!key) throw new Error('No matching JWKS key');
  const pem = certToPEM(key.x5c[0]);
  return jwt.verify(token, pem, { algorithms: ['RS256'] });
}

// Express middleware
async function supabaseAuthMiddleware(req, res, next) {
  try {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = auth.replace('Bearer ', '');
    const payload = await verifySupabaseJWT(token);
    req.user = {
      user_id: payload.sub,
      email: payload.email,
      role: payload.role,
      // Add more claims if needed
    };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// --- Role-based admin middleware ---
async function requireAdmin(req, res, next) {
  try {
    // req.user.user_id is set by auth middleware
    const { user_id } = req.user;
    const result = await pool.query('SELECT is_admin FROM users WHERE user_id = $1', [user_id]);
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}

// --- /api/me endpoint ---
app.get('/api/me', supabaseAuthMiddleware, async (req, res) => {
  try {
    const { user_id } = req.user;
    // Get user profile
    const userResult = await pool.query('SELECT user_id, fname, lname, is_admin FROM users WHERE user_id = $1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];
    let admin_access_level = null;
    if (user.is_admin) {
      // Get admin profile
      const adminResult = await pool.query('SELECT access_level FROM admin_profiles WHERE user_id = $1', [user_id]);
      if (adminResult.rows.length > 0) {
        admin_access_level = adminResult.rows[0].access_level;
      }
    }
    res.json({
      user_id: user.user_id,
      fname: user.fname,
      lname: user.lname,
      is_admin: user.is_admin,
      admin_access_level
    });
  } catch (err) {
    console.error('/api/me error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Example admin-only endpoint ---
app.get('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT user_id, fname, lname, is_admin FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Example user-only endpoint (profile) ---
app.get('/api/user/profile', supabaseAuthMiddleware, async (req, res) => {
  try {
    const { user_id } = req.user;
    const result = await pool.query('SELECT user_id, fname, lname, is_admin FROM users WHERE user_id = $1', [user_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('User profile error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to validate consumption readings
function validateConsumption(consumption) {
    // If consumption is null, undefined, NaN, or negative, return 0
    if (consumption === null || consumption === undefined || isNaN(consumption) || consumption < 0) {
        return 0;
    }
    
    // If consumption is unreasonably high (e.g., > 10kW), cap it
    // Adjust this threshold based on your actual charging hardware capabilities
    const MAX_REASONABLE_CONSUMPTION = 10000; // 10kW in watts
    if (consumption > MAX_REASONABLE_CONSUMPTION) {
        return MAX_REASONABLE_CONSUMPTION;
    }
    
    // Return the validated consumption
    return consumption;
}

// Get consumption data for a specific session
app.get('/api/sessions/:sessionId/consumption', async (req, res) => {
    const { sessionId } = req.params;
    try {
        // Get session details including consumption data
        const sessionResult = await pool.query(
            `SELECT 
                cs.session_id, 
                cs.energy_consumed_kwh, 
                cs.total_mah_consumed,
                cs.start_time,
                cs.end_time,
                cs.session_status,
                cs.last_status_update,
                u.fname || ' ' || u.lname AS user_name,
                cp.port_number_in_device,
                cst.station_name
            FROM 
                charging_session cs
            JOIN 
                users u ON cs.user_id = u.user_id
            JOIN 
                charging_port cp ON cs.port_id = cp.port_id
            JOIN 
                charging_station cst ON cs.station_id = cst.station_id
            WHERE 
                cs.session_id = $1`,
            [sessionId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get consumption data points
        const consumptionResult = await pool.query(
            `SELECT 
                consumption_watts, 
                timestamp, 
                charger_state
            FROM 
                consumption_data
            WHERE 
                session_id = $1
            ORDER BY 
                timestamp ASC`,
            [sessionId]
        );

        // Format the response
        const session = sessionResult.rows[0];
        const consumptionData = consumptionResult.rows;
        
        // Calculate duration in minutes
        const startTime = new Date(session.start_time);
        const endTime = session.end_time ? new Date(session.end_time) : new Date();
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
        
        // Calculate average power in watts
        const avgPower = consumptionData.length > 0 ? 
            consumptionData.reduce((sum, point) => sum + point.consumption_watts, 0) / consumptionData.length : 0;
        
        res.json({
            session_id: session.session_id,
            user_name: session.user_name,
            station_name: session.station_name,
            port_number: session.port_number_in_device,
            start_time: session.start_time,
            end_time: session.end_time,
            status: session.session_status,
            duration_minutes: durationMinutes,
            energy_consumed_kwh: parseFloat(session.energy_consumed_kwh || 0).toFixed(3),
            total_mah_consumed: Math.round(session.total_mah_consumed || 0),
            avg_power_watts: Math.round(avgPower),
            last_update: session.last_status_update,
            consumption_points: consumptionData.map(point => ({
                timestamp: point.timestamp,
                watts: point.consumption_watts,
                state: point.charger_state
            }))
        });
    } catch (error) {
        console.error('Error fetching session consumption data:', error);
        res.status(500).json({ error: 'Failed to fetch session consumption data' });
    }
});

// Get all active charging sessions
app.get('/api/sessions/active', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                cs.session_id, 
                cs.user_id,
                u.fname || ' ' || u.lname AS user_name,
                cs.port_id,
                cp.port_number_in_device,
                cs.station_id,
                cst.station_name,
                cs.start_time,
                cs.energy_consumed_kwh,
                cs.total_mah_consumed,
                cs.is_premium,
                cs.last_status_update,
                EXTRACT(EPOCH FROM (NOW() - cs.start_time))/60 AS duration_minutes
            FROM 
                charging_session cs
            JOIN 
                users u ON cs.user_id = u.user_id
            JOIN 
                charging_port cp ON cs.port_id = cp.port_id
            JOIN 
                charging_station cst ON cs.station_id = cst.station_id
            WHERE 
                cs.session_status = 'active'
            ORDER BY 
                cs.start_time DESC`
        );
        
        // Format the response
        const activeSessions = result.rows.map(session => ({
            session_id: session.session_id,
            user_id: session.user_id,
            user_name: session.user_name,
            port_id: session.port_id,
            port_number: session.port_number_in_device,
            station_id: session.station_id,
            station_name: session.station_name,
            start_time: session.start_time,
            duration_minutes: Math.round(session.duration_minutes),
            energy_consumed_kwh: parseFloat(session.energy_consumed_kwh || 0).toFixed(3),
            total_mah_consumed: Math.round(session.total_mah_consumed || 0),
            is_premium: session.is_premium,
            last_update: session.last_status_update
        }));
        
        res.json(activeSessions);
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        res.status(500).json({ error: 'Failed to fetch active sessions' });
    }
});

// --- Periodic check for stale sessions ---
// This function will run every 5 minutes to check for any active sessions
// that haven't been updated in more than the inactivity timeout period
function setupStaleSessionChecker() {
    const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    
    async function checkStaleActiveSessions() {
        try {
            console.log('Checking for stale active sessions...');
            
            // Find active sessions that haven't been updated in more than the inactivity timeout
            const staleSessions = await pool.query(
                `SELECT 
                    cs.session_id, 
                    cs.port_id,
                    cp.device_mqtt_id,
                    cp.port_number_in_device,
                    cs.last_status_update,
                    EXTRACT(EPOCH FROM (NOW() - cs.last_status_update)) AS seconds_since_update
                FROM 
                    charging_session cs
                JOIN 
                    charging_port cp ON cs.port_id = cp.port_id
                WHERE 
                    cs.session_status = 'active'
                    AND cs.last_status_update < NOW() - INTERVAL '${INACTIVITY_TIMEOUT_SECONDS * 2} seconds'`,
            );
            
            if (staleSessions.rows.length > 0) {
                console.log(`Found ${staleSessions.rows.length} stale active sessions.`);
                
                // Process each stale session
                for (const session of staleSessions.rows) {
                    console.log(`Cleaning up stale session ${session.session_id} (${Math.round(session.seconds_since_update)}s since last update)`);
                    
                    // Send OFF command to the device
                    if (session.device_mqtt_id && session.port_number_in_device) {
                        const controlTopic = `charger/control/${session.device_mqtt_id}`;
                        const mqttPayload = JSON.stringify({ 
                            command: 'OFF', 
                            port_number: session.port_number_in_device 
                        });
                        
                        mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
                            if (err) {
                                console.error(`Failed to publish cleanup OFF command for stale session ${session.session_id}:`, err);
                            } else {
                                console.log(`Sent cleanup OFF command for stale session ${session.session_id}`);
                            }
                        });
                    }
                    
                    // Mark the session as auto-completed in the database
                    await pool.query(
                        "UPDATE charging_session SET end_time = NOW(), session_status = 'auto_completed', last_status_update = NOW() WHERE session_id = $1",
                        [session.session_id]
                    );
                    
                    // Clean up any in-memory tracking
                    if (session.device_mqtt_id && session.port_number_in_device) {
                        const sessionKey = `${session.device_mqtt_id}_${session.port_number_in_device}`;
                        delete activeChargerSessions[sessionKey];
                        
                        if (activePortTimers[sessionKey]) {
                            clearTimeout(activePortTimers[sessionKey].timerId);
                            delete activePortTimers[sessionKey];
                        }
                    }
                }
            } else {
                console.log('No stale active sessions found.');
            }
        } catch (error) {
            console.error('Error checking for stale sessions:', error);
        }
    }
    
    // Run the check immediately on startup
    checkStaleActiveSessions();
    
    // Then set up the interval
    setInterval(checkStaleActiveSessions, CHECK_INTERVAL_MS);
    
    console.log(`Stale session checker set up to run every ${CHECK_INTERVAL_MS / 1000 / 60} minutes.`);
}

// Call this function after the database connection is established
setupStaleSessionChecker();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const mqtt = require('mqtt');
require('dotenv').config(); // Load environment variables from .env file
const jwt = require('jsonwebtoken'); // For JWT decode/verify

const app = express();
const PORT = process.env.PORT || 3001;

// --- Global state for active sessions and timers ---
// activeChargerSessions: Maps `${deviceId}_${portNumberInDevice}` -> session_id
const activeChargerSessions = {};
// activePortTimers: Maps `${deviceId}_${portNumberInDevice}` -> { timerId: setTimeout_ID, lastConsumptionTime: Date.now() }
const activePortTimers = {};

// --- Constants ---
const INACTIVITY_TIMEOUT_SECONDS = 60; // 60 seconds for inactivity timeout
const NOMINAL_CHARGING_VOLTAGE_DC = 12; // Volts DC. Adjust this based on your battery system.
const MAX_REASONABLE_CONSUMPTION = 10000; // 10kW in watts, for consumption validation

// Default price per kWh if not found in station data (e.g., for ad-hoc sessions)
const DEFAULT_PRICE_PER_KWH = 0.25; // Example: $0.25 per kWh

const STALE_SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const MQTT_TOPICS = {
    USAGE: 'charger/usage/',
    STATUS: 'charger/status/',
    CONTROL: 'charger/control/',
    STATION_GENERIC_STATUS: 'station/+/status' // For broader station status topics
};

const SESSION_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    // AUTO_COMPLETED: 'auto_completed'
};

const CHARGER_STATES = {
    ON: 'ON',
    OFF: 'OFF',
    UNKNOWN: 'UNKNOWN'
};

// **YOUR DEFINED ENUM VALUES FROM THE DATABASE**
const PORT_STATUS = {
    AVAILABLE: 'available',
    CHARGING_FREE: 'charging_free',
    CHARGING_PREMIUM: 'charging_premium',
    MAINTENANCE: 'maintenance',
    OFFLINE: 'offline',
    OCCUPIED: 'occupied', // Use 'occupied' when a port is in use but not by the current user's active session, or if it's just 'ON'
    FAULT: 'fault' // Your enum might not have this, but common
};

const LOG_TYPES = {
    INFO: 'info',
    WARN: 'warning',
    ERROR: 'error'
};

const LOG_SOURCES = {
    BACKEND: 'backend',
    MQTT: 'mqtt',
    AUTH: 'auth',
    API: 'api'
};

// Middleware
const allowedOrigins = [
    'http://localhost:3000', // Your local frontend development server
    // Allow local network access (for testing from other devices)
    /^http:\/\/192\.168\.\d+\.\d+:\d+$/, // Local network IPs
    /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,  // 10.x.x.x network
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/, // 172.16-31.x.x network
    // !!! IMPORTANT: Add your deployed frontend URL here when it's ready !!!
    'https://solar-charge-frontend.onrender.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Check if origin matches any of the regex patterns
            const isAllowed = allowedOrigins.some(allowedOrigin => {
                if (typeof allowedOrigin === 'string') {
                    return allowedOrigin === origin;
                } else if (allowedOrigin instanceof RegExp) {
                    return allowedOrigin.test(origin);
                }
                return false;
            });
            
            if (isAllowed) {
                callback(null, true);
            } else {
                console.warn(`CORS: Blocking request from origin: ${origin}`);
                callback(new Error('Not allowed by CORS'), false);
            }
        }
    },
    credentials: true // Important if you're sending cookies or authorization headers
}));
app.use(express.json()); // Parses incoming JSON requests

// --- Supabase PostgreSQL connection Pool ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        // rejectUnauthorized: true for production for security if providing CA
        rejectUnauthorized: process.env.NODE_ENV === 'production' && !!process.env.DB_CA_CERT,
        ca: process.env.DB_CA_CERT // Provide the CA certificate content
    }
});

// Helper for system logging
async function logSystemEvent(logType, source, message, userId = null) {
    try {
        await pool.query(
            'INSERT INTO system_logs (log_type, source, message, user_id) VALUES ($1, $2, $3, $4)',
            [logType, source, message, userId]
        );
    } catch (logErr) {
        console.error('Failed to write to system_logs table:', logErr);
    }
}


// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Database connection error: ${err.message}`);
    } else {
        console.log('Connected to Supabase PostgreSQL database');
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Connected to Supabase PostgreSQL database');
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
    rejectUnauthorized: process.env.NODE_ENV === 'production' && !!EMQX_CA_CERT, // Ensure server cert is valid in production
    ca: EMQX_CA_CERT, // Provide the CA certificate
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
};

// Create MQTT client instance
const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER_HOST}:${MQTT_PORT}`, mqttOptions);

// --- Helper function to calculate cost ---
async function calculateSessionCost(sessionId, energyKWH) {
    try {
        const sessionResult = await pool.query(
            "SELECT station_id FROM charging_session WHERE session_id = $1",
            [sessionId]
        );

        if (sessionResult.rows.length > 0) {
            const stationId = sessionResult.rows[0].station_id;
            const stationPricing = await pool.query(
                "SELECT price_per_kwh FROM charging_station WHERE station_id = $1",
                [stationId]
            );
            const pricePerKWH = stationPricing.rows[0]?.price_per_kwh || DEFAULT_PRICE_PER_KWH;
            return energyKWH * pricePerKWH;
        }
    } catch (error) {
        console.error(`Error calculating session cost for session ${sessionId}:`, error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error calculating session cost for ${sessionId}: ${error.message}`);
    }
    return 0; // Default to 0 if calculation fails
}


// --- Helper function to handle automatic port turn-off due to inactivity ---
async function handleInactivityTurnOff(deviceId, internalPortNumber, actualPortId, sessionId) {
    const sessionKey = `${deviceId}_${internalPortNumber}`;
    console.log(`Timer expired for ${sessionKey}. Checking for inactivity.`);
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Inactivity check for session ${sessionId} on ${sessionKey}`);

    try {
        // Check if the session is still active in the DB (important if backend restarted)
        const sessionCheck = await pool.query(
            "SELECT session_id, session_status, last_status_update, energy_consumed_kwh FROM charging_session WHERE session_id = $1",
            [sessionId]
        );

        if (sessionCheck.rows.length > 0 && sessionCheck.rows[0].session_status === SESSION_STATUS.ACTIVE) {
            const lastUpdate = sessionCheck.rows[0].last_status_update;
            const energyConsumed = parseFloat(sessionCheck.rows[0].energy_consumed_kwh) || 0;
            const now = new Date();
            
            // Calculate seconds since last activity
            const secondsSinceLastActivity = lastUpdate ? 
                Math.floor((now - new Date(lastUpdate)) / 1000) : 
                INACTIVITY_TIMEOUT_SECONDS + 1; // If no last_status_update, assume it's inactive
            
            console.log(`${sessionKey}: ${secondsSinceLastActivity} seconds since last activity.`);
            
            // Only deactivate if truly inactive for the timeout period
            if (secondsSinceLastActivity >= INACTIVITY_TIMEOUT_SECONDS) {
                // Send OFF command to ESP32
                const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
                const mqttPayload = JSON.stringify({ command: CHARGER_STATES.OFF, port_number: internalPortNumber });
                mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`Failed to publish automatic OFF command to ${controlTopic}:`, err);
                        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed auto OFF command for ${sessionKey}: ${err.message}`);
                    } else {
                        console.log(`Automatically sent OFF command to ${deviceId} Port ${internalPortNumber} due to inactivity (${secondsSinceLastActivity}s).`);
                        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Sent auto OFF command for ${sessionKey} (session ${sessionId}) due to inactivity`);
                    }
                });

                // Calculate final cost
                const sessionCost = await calculateSessionCost(sessionId, energyConsumed);

                // Mark session as auto_completed in DB
                await pool.query(
                    "UPDATE charging_session SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2 WHERE session_id = $3",
                    [SESSION_STATUS.COMPLETED, sessionCost, sessionId] // sessionId instead of session.session_id
                )
                console.log(`Marked session ${sessionId} as '${SESSION_STATUS.COMPLETED}' due to inactivity. Final Cost: $${sessionCost.toFixed(2)}`);
                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Session ${sessionId} auto-completed due to inactivity. Cost: $${sessionCost.toFixed(2)}`);

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
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error during inactivity turn-off for ${sessionKey}: ${error.message}`);
    }
}


// --- MQTT Event Handlers ---
mqttClient.on('connect', () => {
    console.log('Backend connected to EMQX Cloud MQTT broker');
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, 'Backend connected to EMQX Cloud MQTT broker');
    // Subscribe to topics for the single station device ID
    mqttClient.subscribe(`${MQTT_TOPICS.USAGE}${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => {
        if (!err) console.log(`Subscribed to ${MQTT_TOPICS.USAGE}${ESP32_STATION_CLIENT_ID}`);
        else logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to subscribe to ${MQTT_TOPICS.USAGE}${ESP32_STATION_CLIENT_ID}: ${err.message}`);
    });
    mqttClient.subscribe(`${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}`, { qos: 1 }, (err) => {
        if (!err) console.log(`Subscribed to ${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}`);
        else logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to subscribe to ${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}: ${err.message}`);
    });
    // Existing station topics (if any, adjust topic string as needed)
    mqttClient.subscribe(MQTT_TOPICS.STATION_GENERIC_STATUS, { qos: 1 }, (err) => {
        if (!err) console.log(`Subscribed to ${MQTT_TOPICS.STATION_GENERIC_STATUS}`);
        else logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to subscribe to ${MQTT_TOPICS.STATION_GENERIC_STATUS}: ${err.message}`);
    });
});

// --- Main MQTT Message Processing Handler ---
mqttClient.on('message', async (topic, message) => {
    console.log(`Received message on ${topic}: ${message.toString()}`);
    let payload;
    const messageString = message.toString();

    // --- FOR DEBUGGING ---
    console.log(`DEBUG: Raw MQTT Message String for parsing: '${messageString}'`);
    console.log(`DEBUG: Message length: ${messageString.length}`);
    // --- END DEBUGGING ---
    
    try {
        // Handle specific plain string LWT from ESP32, converting it to JSON structure
        if (topic === `${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}` && messageString === 'offline') {
            payload = {
                status: "offline",
                charger_state: CHARGER_STATES.UNKNOWN,
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
        if ((topic.startsWith(MQTT_TOPICS.USAGE) || topic.startsWith(MQTT_TOPICS.STATUS)) && (portNumberInDevice === undefined || portNumberInDevice < 1)) {
            if (topic === `${MQTT_TOPICS.STATUS}${ESP32_STATION_CLIENT_ID}` && (payload.status === 'online' || payload.status === 'offline')) {
                // This is the overall station status (e.g., station came online/offline).
                // It doesn't map to a specific port_id in the DB for consumption/charger_state.
                console.log(`MQTT: Station ${deviceId} is ${payload.status}. No specific port_id for this message.`);
                return;
            }
            console.warn(`MQTT: Received message on ${topic} from ${deviceId} without a valid port_number. Skipping.`);
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.MQTT, `Received message without valid port_number: Topic ${topic}, Payload ${messageString}`);
            return; // Exit here for invalid portNumber messages
        }

        // --- Find the actual port_id (UUID) from charging_port table ---
        // This query links the ESP32's ID and its internal port number to a unique DB port_id.
        const portIdResult = await pool.query(
            'SELECT port_id, is_premium FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2', // Fetch is_premium
            [deviceId, portNumberInDevice]
        );
        const actualPortId = portIdResult.rows[0]?.port_id; // Get the port_id UUID
        const isPremiumPort = portIdResult.rows[0]?.is_premium; // Get is_premium

        if (!actualPortId) {
            console.warn(`MQTT: No charging_port found for device_id: ${deviceId} and port_number_in_device: ${portNumberInDevice}. Skipping message processing.`);
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.MQTT, `No charging_port found for device_id: ${deviceId}, port: ${portNumberInDevice}. Topic: ${topic}`);
            return; // Cannot process if a specific port mapping is not found in DB
        }

        // Determine unique key for session tracking using deviceId and internal port number
        const sessionKey = `${deviceId}_${portNumberInDevice}`;
        const currentSessionId = activeChargerSessions[sessionKey]; // Get session_id from in-memory map

        // --- Handle charger/usage topic (for consumption data and session management) ---
        if (topic.startsWith(MQTT_TOPICS.USAGE)) {
            const { consumption, timestamp, charger_state } = payload;
            const currentTimestamp = new Date(timestamp); // Convert milliseconds to Date object

            if (charger_state === CHARGER_STATES.ON) { // Only insert consumption if charger is ON
                if (currentSessionId) { // Only insert if an active session is tracked (created by API)
                    // Validate consumption value to prevent negative or unreasonable readings
                    const validatedConsumption = validateConsumption(consumption);
                    
                    if (validatedConsumption > 0) { // Only record if consumption is positive
                        await pool.query(
                            'INSERT INTO consumption_data (session_id, device_id, consumption_watts, timestamp, charger_state) VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5)',
                            [currentSessionId, deviceId, validatedConsumption, timestamp, charger_state]
                        );
                        console.log(`MQTT: Stored consumption for ${deviceId} Port ${portNumberInDevice} in session ${currentSessionId}: ${validatedConsumption}W`);
                        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Consumption: ${validatedConsumption}W for session ${currentSessionId}`);

                        const intervalSeconds = 10; // ESP32 publishes every 10 seconds
                        const kwhIncrement = (validatedConsumption * intervalSeconds) / (1000 * 3600); // Watts * seconds / (1000W/kW * 3600s/hr)

                        // --- Calculate mAh Increment (assuming a nominal charging voltage, e.g., 12V for the battery) ---
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
                        logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.MQTT, `Invalid consumption value (${consumption}W) for ${sessionKey}`);
                    }
                } else {
                    console.warn(`MQTT: Charger ON for ${deviceId} Port ${portNumberInDevice} but no active session found in memory. Consumption insert skipped.`);
                    logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.MQTT, `Charger ON for ${sessionKey} but no active session tracked`);
                }
            } else if (charger_state === CHARGER_STATES.OFF) {
                // No session ending here. Session ending is handled by API POST /control or inactivity timer.
                console.log(`MQTT: Received OFF state for ${deviceId} Port ${portNumberInDevice}. Consumption not logged for OFF state.`);
            }
        }

        // --- Handle charger/status topic (for overall device/port status updates) ---
        else if (topic.startsWith(MQTT_TOPICS.STATUS)) {
            // Pass the payload and newly fetched isPremiumPort to the dedicated handler
            await handleMqttStatusMessage(payload, deviceId, actualPortId, isPremiumPort);
        }

        // --- Handle other existing station topics (if any) ---
        else if (topic.startsWith('station/')) {
            console.log(`MQTT: Processing generic station data: ${JSON.stringify(payload)}`);
            logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Generic station data: ${JSON.stringify(payload)}`);
        }

    } catch (error) {
        console.error('MQTT: Error processing MQTT message:', error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Error processing message on topic "${topic}" with payload "${messageString}": ${error.message}`);
    }
});


mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
    logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `MQTT client error: ${err.message}`);
});

mqttClient.on('close', () => {
    console.log('MQTT client disconnected.');
    logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.MQTT, 'MQTT client disconnected.');
});

mqttClient.on('reconnect', () => {
    console.log('Reconnecting to EMQX Cloud...');
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, 'Reconnecting to EMQX Cloud...');
});


// --- REST API Endpoints (Updated for multi-port station) ---

// Basic test route
app.get('/', (req, res) => {
    res.send('SolarCharge Backend is running!');
});

//GET all subscription plans
app.get('/api/subscription/plans', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        // Use standard pg pool.query which returns a result object
        const result = await pool.query(
            `SELECT * FROM subscription_plans ORDER BY price ASC`
        );
        // The data is in result.rows
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching subscription plans:', error.message);
        res.status(500).json({ error: 'Internal Server Error: Could not fetch plans.' });
    }
});

//Public endpoint to get all stations for the home page/map
app.get('/api/stations', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                s.station_id, 
                s.station_name, 
                s.location_description, 
                s.latitude, 
                s.longitude, 
                s.is_active,
                s.current_battery_level,
                s.price_per_kwh,
                COUNT(p.port_id) as total_ports,
                COUNT(CASE WHEN p.current_status = 'available' THEN 1 END) as available_ports
            FROM charging_station s
            LEFT JOIN charging_port p ON s.station_id = p.station_id
            GROUP BY s.station_id
            ORDER BY s.station_name;
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stations:', error.message);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});

app.get('/api/stations/:stationId', async (req, res) => {
    const { stationId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM charging_station WHERE station_id = $1`,
            [stationId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Station not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(`Error fetching station ${stationId}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch station details' });
    }
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
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Consumption data request for non-existent port: Device ${deviceId}, Port ${portNumber}`);
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
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching consumption data for ${deviceId}/${portNumber}: ${error.message}`);
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
                cs.total_mah_consumed,
                cs.energy_consumed_kwh, -- Include KWH for active sessions
                cs.session_id
            FROM
                current_device_status cds
            JOIN
                charging_port cp ON cds.port_id = cp.port_id
            LEFT JOIN -- Use LEFT JOIN to include ports even if no active session
                charging_session cs ON cds.port_id = cs.port_id AND cs.session_status = '${SESSION_STATUS.ACTIVE}'
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching device status:', error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching all device status: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});

// Send control command to a specific device (station) AND internal port number
app.post('/api/devices/:deviceId/:portNumber/control', async (req, res) => {
    const { deviceId, portNumber } = req.params;
    const { command, user_id, station_id } = req.body;

    if (!command || (command !== CHARGER_STATES.ON && command !== CHARGER_STATES.OFF)) {
        logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Invalid control command: ${command}`);
        return res.status(400).json({ error: `Invalid command. Must be "${CHARGER_STATES.ON}" or "${CHARGER_STATES.OFF}".` });
    }

    const controlTopic = `${MQTT_TOPICS.CONTROL}${deviceId}`;
    const internalPortNumber = parseInt(portNumber);

    try {
        // Find the actual port_id (UUID) and is_premium from charging_port table
        const portIdResult = await pool.query(
            'SELECT port_id, is_premium FROM charging_port WHERE device_mqtt_id = $1 AND port_number_in_device = $2',
            [deviceId, internalPortNumber]
        );
        const actualPortId = portIdResult.rows[0]?.port_id;
        const isPremiumPort = portIdResult.rows[0]?.is_premium;


        if (!actualPortId) {
            console.warn(`API: Port not found for deviceId ${deviceId} and portNumber ${internalPortNumber}.`);
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Control command for non-existent port: Device ${deviceId}, Port ${internalPortNumber}`);
            return res.status(404).json({ error: `Port ${internalPortNumber} not found for device ${deviceId}.` });
        }

        // Session Management Logic (Moved from MQTT handler to API handler)
        const sessionKey = `${deviceId}_${internalPortNumber}`;
        let currentSessionId = activeChargerSessions[sessionKey];

        // Determine the port status to set in the DB
        let newPortStatusForDb;
        if (command === CHARGER_STATES.ON) {
            newPortStatusForDb = isPremiumPort ? PORT_STATUS.CHARGING_PREMIUM : PORT_STATUS.CHARGING_FREE;
        } else { // command === CHARGER_STATES.OFF
            newPortStatusForDb = PORT_STATUS.AVAILABLE;
        }


        if (command === CHARGER_STATES.ON) {
            if (!user_id || !station_id) {
                logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Attempt to start session without user_id or station_id for ${sessionKey}`);
                return res.status(400).json({ error: 'user_id and station_id are required to start a session.' });
            }

            // Check if there's already an active session in DB for this port
            const existingActiveSession = await pool.query(
                "SELECT session_id, user_id FROM charging_session WHERE port_id = $1 AND session_status = $2",
                [actualPortId, SESSION_STATUS.ACTIVE]
            );

            if (existingActiveSession.rows.length === 0) {
                // No active session found in DB, create a new one
                const sessionResult = await pool.query(
                    'INSERT INTO charging_session (user_id, port_id, station_id, start_time, session_status, is_premium, energy_consumed_kwh, total_mah_consumed, last_status_update) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, NOW()) RETURNING session_id',
                    [user_id, actualPortId, station_id, SESSION_STATUS.ACTIVE, isPremiumPort, 0, 0] // Initialize energy and mAh consumed to 0
                );
                currentSessionId = sessionResult.rows[0].session_id;
                activeChargerSessions[sessionKey] = currentSessionId;
                console.log(`API: Started new charging session ${currentSessionId} for port ${actualPortId} (User: ${user_id})`);
                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New charging session ${currentSessionId} started for ${sessionKey} by user ${user_id}`);
            } else {
                // Session already active
                currentSessionId = existingActiveSession.rows[0].session_id;
                
                // If the existing session is by a *different* user, it's occupied!
                if (existingActiveSession.rows[0].user_id !== user_id) {
                    logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `User ${user_id} tried to activate occupied port ${sessionKey}. Occupied by ${existingActiveSession.rows[0].user_id}.`);
                    return res.status(409).json({ error: 'Port is currently occupied by another user.' });
                }

                activeChargerSessions[sessionKey] = currentSessionId; // Ensure in-memory map is updated
                
                // Update the last_status_update to reset inactivity timer
                await pool.query(
                    "UPDATE charging_session SET last_status_update = NOW() WHERE session_id = $1",
                    [currentSessionId]
                );
                
                console.log(`API: Resuming existing active session ${currentSessionId} for port ${actualPortId} (User: ${user_id})`);
                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Resuming active session ${currentSessionId} for ${sessionKey} by user ${user_id}`);
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

        } else if (command === CHARGER_STATES.OFF) {
            // Check if the session is currently active by this user
            const sessionCheck = await pool.query(
                "SELECT session_id, user_id, energy_consumed_kwh, total_mah_consumed FROM charging_session WHERE port_id = $1 AND session_status = $2",
                [actualPortId, SESSION_STATUS.ACTIVE]
            );

            if (sessionCheck.rows.length > 0) {
                const dbSession = sessionCheck.rows[0];
                if (dbSession.user_id !== user_id) { // Ensure only the session owner can end it via API
                    logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `User ${user_id} tried to end session ${dbSession.session_id} not owned by them.`);
                    return res.status(403).json({ error: 'You can only end your own active session on this port.' });
                }

                currentSessionId = dbSession.session_id; // Set currentSessionId from DB
                const energyConsumed = parseFloat(dbSession.energy_consumed_kwh) || 0;
                const mAhConsumed = parseFloat(dbSession.total_mah_consumed) || 0;
                
                // Calculate final cost
                const sessionCost = await calculateSessionCost(currentSessionId, energyConsumed);

                // End the active session in DB
                await pool.query(
                    "UPDATE charging_session SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2 WHERE session_id = $3 AND session_status = $4",
                    [SESSION_STATUS.COMPLETED, sessionCost, currentSessionId, SESSION_STATUS.ACTIVE]
                );
                console.log(`API: Ended charging session ${currentSessionId} for port ${actualPortId}. Energy consumed: ${energyConsumed.toFixed(3)} kWh, ${mAhConsumed.toFixed(0)} mAh. Cost: $${sessionCost.toFixed(2)}`);
                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Session ${currentSessionId} ended for ${sessionKey}. Cost: $${sessionCost.toFixed(2)}`);
                delete activeChargerSessions[sessionKey]; // Remove from tracking map

                // --- Clear inactivity timer when charger is turned OFF via API ---
                if (activePortTimers[sessionKey]) {
                    clearTimeout(activePortTimers[sessionKey].timerId);
                    delete activePortTimers[sessionKey];
                    console.log(`API: Inactivity timer cleared for ${sessionKey}.`);
                }

            } else {
                console.log(`API: Received OFF command for ${deviceId} Port ${internalPortNumber}, but no active session found for user ${user_id}.`);
                logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `OFF command for ${sessionKey} by user ${user_id} but no active session.`);
                // If no session, still attempt to turn off the physical charger
            }
        }

        // --- Update charging_port table for real-time status display in the main schema
        // This is done after session management, using the `newPortStatusForDb`
        await pool.query(
            'UPDATE charging_port SET current_status = $1, is_occupied = $2, last_status_update = NOW() WHERE port_id = $3',
            [newPortStatusForDb, (newPortStatusForDb === PORT_STATUS.CHARGING_FREE || newPortStatusForDb === PORT_STATUS.CHARGING_PREMIUM || newPortStatusForDb === PORT_STATUS.OCCUPIED), actualPortId]
        );
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Port ${actualPortId} status set to '${newPortStatusForDb}' by API command '${command}'.`);


        // Publish MQTT command (payload remains the same for ESP32)
        const mqttPayload = JSON.stringify({ command: command, port_number: internalPortNumber });

        mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
            if (err) {
                console.error(`Failed to publish control command to ${controlTopic}:`, err);
                logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to publish control command '${command}' to ${controlTopic}: ${err.message}`);
                return res.status(500).json({ error: 'Failed to send control command via MQTT' });
            }
            console.log(`API: Sent MQTT command '${command}' to ${deviceId} Port ${internalPortNumber}.`);
            
            res.json({ 
                status: 'Command sent', 
                deviceId, 
                portNumber: internalPortNumber, 
                command, 
                sessionId: currentSessionId // Might be null if OFF command for no active session
            });
        });

    } catch (error) {
        console.error('Error processing control command:', error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error processing control command for ${deviceId}/${portNumber}: ${error.message}`);
        res.status(500).json({ error: `Failed to process control command: ${error.message}` });
    }
});

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
                COUNT(CASE WHEN current_status = '${PORT_STATUS.AVAILABLE}' THEN 1 END) as available,
                COUNT(CASE WHEN current_status = '${PORT_STATUS.OCCUPIED}' THEN 1 END) as occupied
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
        // This query now relies on the 'cost' column being present in charging_session
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin dashboard stats fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Dashboard stats error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Dashboard stats error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

// Recent Sessions for Dashboard
app.get('/api/admin/sessions/recent', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        // This query now relies on the 'cost' column being present in charging_session
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Recent sessions fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Recent sessions error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Recent sessions error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

// System Status
app.get('/api/admin/system/status', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        // Check if any critical errors in last 24 hours
        // This query now relies on the 'system_logs' table
        const errors = await pool.query(`
            SELECT COUNT(*) as error_count
            FROM system_logs
            WHERE log_type = '${LOG_TYPES.ERROR}' AND timestamp > NOW() - INTERVAL '24 hours'
        `);
        
        // Get latest system status log
        // This query now relies on the 'system_logs' table
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'System status fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('System status error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `System status error: ${err.message}`, req.user.user_id);
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Station battery levels fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Battery levels error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Battery levels error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

// // Admin Users Management
// app.get('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
//     try {
//         const result = await pool.query(`
//             SELECT 
//                 user_id, 
//                 fname, 
//                 lname, 
//                 email, 
//                 contact_number,
//                 is_admin, 
//                 created_at, 
//                 last_login
//             FROM users
//             ORDER BY created_at DESC
//         `);
        
//         res.json(result.rows);
//         logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin users list fetched successfully', req.user.user_id);
//     } catch (err) {
//         console.error('Admin users error:', err.message);
//         logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Admin users error: ${err.message}`, req.user.user_id);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

app.post('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    const { fname, lname, email, contact_number, is_admin, plan_id, password } = req.body;
    // Note: Creating a Supabase Auth user from the backend requires admin privileges
    // and is more complex. This example focuses on the public.users table.
    // A complete solution would involve using the Supabase Admin SDK.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // This is a placeholder for creating the auth.users entry.
        // You would typically use a Supabase admin client for this.
        // For now, we assume the user_id is created separately or you have a trigger.
        // Let's assume a user_id is generated or passed in for this example.
        // const { data: authUser, error: authError } = await supabase.auth.admin.createUser({ email, password, ... });
        // if (authError) throw authError;
        // const userId = authUser.user.id;

        const newUserResult = await client.query(
            `INSERT INTO users (fname, lname, email, contact_number, is_admin, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING user_id`,
            [fname, lname, email, contact_number, is_admin]
        );
        const userId = newUserResult.rows[0].user_id;

        if (plan_id) {
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + 1);
            await client.query(
                `INSERT INTO user_subscription (user_id, plan_id, start_date, end_date, is_active)
                 VALUES ($1, $2, NOW(), $3, true)`,
                [userId, plan_id, endDate]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'User created successfully', user_id: userId });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New user ${userId} created by admin`, req.user.user_id);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Create user error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Create user error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// app.put('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
//     try {
//         const { userId } = req.params;
//         const { fname, lname, contact_number, is_admin } = req.body;
        
//         const result = await pool.query(
//             `UPDATE users
//              SET fname = $1, lname = $2, contact_number = $3, is_admin = $4
//              WHERE user_id = $5
//              RETURNING user_id, fname, lname, email, contact_number, is_admin, created_at`,
//             [fname, lname, contact_number, is_admin, userId]
//         );
        
//         if (result.rows.length === 0) {
//             logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Attempt to update non-existent user ${userId}`, req.user.user_id);
//             return res.status(404).json({ error: 'User not found' });
//         }
        
//         res.json(result.rows[0]);
//         logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} updated by admin`, req.user.user_id);
//     } catch (err) {
//         console.error('Update user error:', err.message);
//         logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Update user error for ${userId}: ${err.message}`, req.user.user_id);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

app.put('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { fname, lname, contact_number, is_admin, plan_id } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Update user details
        await client.query(
            `UPDATE users SET fname = $1, lname = $2, contact_number = $3, is_admin = $4, updated_at = NOW()
             WHERE user_id = $5`,
            [fname, lname, contact_number, is_admin, userId]
        );

        // 2. Get user's current active subscription
        const currentSubResult = await client.query(
            `SELECT user_subscription_id, plan_id FROM user_subscription
             WHERE user_id = $1 AND is_active = true`,
            [userId]
        );
        const currentSub = currentSubResult.rows[0];
        const currentPlanId = currentSub?.plan_id;
        const newPlanId = plan_id || null; // Handle empty string from form

        // 3. Check if subscription needs to change
        if (currentPlanId !== newPlanId) {
            // Deactivate old subscription if it exists
            if (currentSub) {
                await client.query(
                    `UPDATE user_subscription SET is_active = false, end_date = NOW()
                     WHERE user_subscription_id = $1`,
                    [currentSub.user_subscription_id]
                );
            }
            // Add new subscription if a new plan was selected
            if (newPlanId) {
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 1);
                await client.query(
                    `INSERT INTO user_subscription (user_id, plan_id, start_date, end_date, is_active)
                     VALUES ($1, $2, NOW(), $3, true)`,
                    [userId, newPlanId, endDate]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'User updated successfully' });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} updated by admin`, req.user.user_id);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Update user error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Update user error for ${userId}: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

// app.delete('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
//     try {
//         const { userId } = req.params;
        
//         // Check if user exists
//         const userCheck = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
//         if (userCheck.rows.length === 0) {
//             logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Attempt to delete non-existent user ${userId}`, req.user.user_id);
//             return res.status(404).json({ error: 'User not found' });
//         }
        
//         // Delete user
//         await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
        
//         res.json({ message: 'User deleted successfully' });
//         logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} deleted by admin`, req.user.user_id);
//     } catch (err) {
//         console.error('Delete user error:', err.message);
//         logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Delete user error for ${userId}: ${err.message}`, req.user.user_id);
//         res.status(500).json({ error: 'Server error' });
//     }
// });

// Admin Stations Management

app.delete('/api/admin/users/:userId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Note: The order is important due to foreign key constraints.
        // Delete related records before deleting the user.
        await client.query('DELETE FROM payment WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM daily_energy_usage WHERE user_id = $1', [userId]);
        // Cascading deletes for sessions and their consumption data
        await client.query(`DELETE FROM consumption_data WHERE session_id IN (SELECT session_id FROM charging_session WHERE user_id = $1)`, [userId]);
        await client.query('DELETE FROM charging_session WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM user_subscription WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM admin_profiles WHERE user_id = $1', [userId]);

        // Finally, delete the user from the public.users table
        const result = await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
        
        // You would also need to delete the user from auth.users using the admin SDK
        // await supabase.auth.admin.deleteUser(userId);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await client.query('COMMIT');
        res.json({ message: 'User deleted successfully' });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} deleted by admin`, req.user.user_id);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete user error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Delete user error for ${userId}: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

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
                price_per_kwh, -- Include price_per_kwh
                (SELECT COUNT(*) FROM charging_port WHERE station_id = s.station_id AND is_premium = false) as num_free_ports,
                (SELECT COUNT(*) FROM charging_port WHERE station_id = s.station_id AND is_premium = true) as num_premium_ports
            FROM 
                charging_station s
            ORDER BY 
                created_at DESC
        `);
        
        res.json(result.rows);
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin stations list fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Admin stations error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Admin stations error: ${err.message}`, req.user.user_id);
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
            current_battery_level,
            price_per_kwh // New field
        } = req.body;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Insert station
            const stationResult = await client.query(
                `INSERT INTO charging_station 
                 (station_name, location_description, latitude, longitude, solar_panel_wattage, 
                  battery_capacity_kwh, is_active, current_battery_level, created_at, price_per_kwh)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
                 RETURNING station_id`,
                [station_name, location_description, latitude, longitude, solar_panel_wattage, 
                 battery_capacity_kwh, is_active, current_battery_level, price_per_kwh]
            );
            
            const stationId = stationResult.rows[0].station_id;
            
            // Create free ports
            for (let i = 0; i < num_free_ports; i++) {
                await client.query(
                    `INSERT INTO charging_port 
                     (station_id, port_number_in_device, is_premium, is_occupied, current_status, device_mqtt_id)
                     VALUES ($1, $2, false, false, '${PORT_STATUS.AVAILABLE}', $3)`,
                    [stationId, i + 1, `ESP32_CHARGER_STATION_${stationId.substring(0, 3)}`]
                );
            }
            
            // Create premium ports
            for (let i = 0; i < num_premium_ports; i++) {
                await client.query(
                    `INSERT INTO charging_port 
                     (station_id, port_number_in_device, is_premium, is_occupied, current_status, device_mqtt_id)
                     VALUES ($1, $2, true, false, '${PORT_STATUS.AVAILABLE}', $3)`,
                    [stationId, num_free_ports + i + 1, `ESP32_CHARGER_STATION_${stationId.substring(0, 3)}`]
                );
            }
            
            await client.query('COMMIT');
            
            res.status(201).json({ station_id: stationId, message: 'Station created successfully' });
            logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New station ${stationId} created by admin`, req.user.user_id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Create station error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Create station error: ${err.message}`, req.user.user_id);
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
            current_battery_level,
            price_per_kwh // New field
        } = req.body;
        
        const result = await pool.query(
            `UPDATE charging_station
             SET station_name = $1, location_description = $2, latitude = $3, longitude = $4,
                 solar_panel_wattage = $5, battery_capacity_kwh = $6, is_active = $7, 
                 current_battery_level = $8, price_per_kwh = $9
             WHERE station_id = $10
             RETURNING station_id`,
            [station_name, location_description, latitude, longitude, solar_panel_wattage,
             battery_capacity_kwh, is_active, current_battery_level, price_per_kwh, stationId]
        );
        
        if (result.rows.length === 0) {
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Attempt to update non-existent station ${stationId}`, req.user.user_id);
            return res.status(404).json({ error: 'Station not found' });
        }
        
        res.json({ message: 'Station updated successfully' });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Station ${stationId} updated by admin`, req.user.user_id);
    } catch (err) {
        console.error('Update station error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Update station error for ${stationId}: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/stations/:stationId', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        const { stationId } = req.params;
        
        // Check if station exists
        const stationCheck = await pool.query('SELECT station_id FROM charging_station WHERE station_id = $1', [stationId]);
        if (stationCheck.rows.length === 0) {
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Attempt to delete non-existent station ${stationId}`, req.user.user_id);
            return res.status(404).json({ error: 'Station not found' });
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Note: Deleting sessions associated with ports first, then ports, then station
            // This is important due to foreign key constraints.
            // Also need to delete from consumption_data and current_device_status
            
            // 1. Delete consumption data linked to sessions for this station's ports
            await client.query(`
                DELETE FROM consumption_data
                WHERE session_id IN (
                    SELECT session_id FROM charging_session
                    WHERE station_id = $1
                )
            `, [stationId]);

            // 2. Delete current device status entries for this station's ports
            await client.query(`
                DELETE FROM current_device_status
                WHERE port_id IN (
                    SELECT port_id FROM charging_port
                    WHERE station_id = $1
                )
            `, [stationId]);

            // 3. Delete device status logs for this station's ports
            await client.query(`
                DELETE FROM device_status_logs
                WHERE port_id IN (
                    SELECT port_id FROM charging_port
                    WHERE station_id = $1
                )
            `, [stationId]);

            // 4. Delete related charging sessions
            await client.query(`
                DELETE FROM charging_session
                WHERE station_id = $1
            `, [stationId]);
            
            // 5. Delete related charging ports
            await client.query(`
                DELETE FROM charging_port
                WHERE station_id = $1
            `, [stationId]);
            
            // 6. Delete station maintenance records (if any are tied to station_id)
            await client.query(`
                DELETE FROM station_maintenance
                WHERE station_id = $1
            `, [stationId]);

            // 7. Delete station
            await client.query(`
                DELETE FROM charging_station
                WHERE station_id = $1
            `, [stationId]);
            
            await client.query('COMMIT');
            
            res.json({ message: 'Station and all associated data deleted successfully' });
            logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Station ${stationId} and associated data deleted by admin`, req.user.user_id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Delete station error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Delete station error for ${stationId}: ${err.message}`, req.user.user_id);
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin sessions list fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Sessions error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Sessions error: ${err.message}`, req.user.user_id);
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin revenue reports fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Revenue error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Revenue error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/usage', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        const { range = 'week' } = req.query; // 'range' is currently not used in these specific queries, but kept for consistency
        
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin usage reports fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Usage error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Usage error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin Logs
app.get('/api/admin/logs', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        const { range = '24h', type = 'all', source = 'all' } = req.query; // Added type and source filters
        
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

        let typeFilter = type !== 'all' ? `AND log_type = '${type}'` : '';
        let sourceFilter = source !== 'all' ? `AND source = '${source}'` : '';
        
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
                ${timeFilter} ${typeFilter} ${sourceFilter}
            ORDER BY 
                timestamp DESC
            LIMIT 500 -- Limit logs to prevent massive responses
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin logs fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Logs error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Logs error: ${err.message}`, req.user.user_id);
        res.status(500).json({ error: 'Server error' });
    }
});

// Existing endpoint for ESP32 commands (kept for backward compatibility, adjust if needed)
// This endpoint might be redundant if /api/devices/:deviceId/:portNumber/control is used.
// If your frontend still calls this, ensure it's functional.
app.post('/api/esp32/command', async (req, res) => {
    const { action, stationId, portId } = req.body;

    console.log(`Received command from frontend: Action=${action}, Station=${stationId}, Port=${portId}`);
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Legacy ESP32 command received: Action=${action}, Station=${stationId}, Port=${portId}`);

    const topic = `station/${stationId}/control`;
    let message = '';
    // This part assumes a very specific legacy message format, might need updating for multi-port
    // If your ESP32_CHARGER_STATION_001 handles relay1_on/relay2_on, then this is okay.
    // If it expects JSON like {"command": "ON", "port_number": 1}, you need to build that payload.
    if (action === 'activate' && portId === 1) message = 'relay1_on';
    else if (action === 'deactivate' && portId === 1) message = 'relay1_off';
    else if (action === 'activate' && portId === 2) message = 'relay2_on';
    else if (action === 'deactivate' && portId === 2) message = 'relay2_off';
    else {
        logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Invalid legacy ESP32 action or portId: Action=${action}, Port=${portId}`);
        return res.status(400).json({ error: 'Invalid action or portId' });
    }

    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
            console.error('MQTT publish error:', err);
            logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed to publish legacy MQTT command ${message} to ${topic}: ${err.message}`);
            return res.status(500).json({ error: 'Failed to publish MQTT message' });
        }
        res.json({ success: true, message: `Published ${message} to ${topic}` });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Published legacy command ${message} to ${topic}`);
    });
});


// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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
                cs.cost, -- Include cost here
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
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `Session consumption request for non-existent session ${sessionId}`);
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
            cost: parseFloat(session.cost || 0).toFixed(2), // Format cost
            avg_power_watts: Math.round(avgPower),
            last_update: session.last_status_update,
            consumption_points: consumptionData.map(point => ({
                timestamp: point.timestamp,
                watts: point.consumption_watts,
                state: point.charger_state
            }))
        });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Session consumption data fetched for session ${sessionId}`);
    } catch (error) {
        console.error('Error fetching session consumption data:', error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching session consumption data for ${sessionId}: ${error.message}`);
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
                cs.session_status = '${SESSION_STATUS.ACTIVE}'
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Active sessions list fetched');
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching active sessions: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch active sessions' });
    }
});

// Get current user's subscription details and recent billing history
app.get('/api/user/subscription', supabaseAuthMiddleware, async (req, res) => {
    try {
        const { user_id } = req.user; // Get user_id from the authenticated request

        // Fetch current active subscription for the user
        const subscriptionResult = await pool.query(`
            SELECT
                us.user_subscription_id,
                us.start_date,
                us.end_date,
                us.is_active as status, -- Rename to status for frontend clarity
                us.current_daily_mwh_consumed,
                sp.plan_id,
                sp.plan_name,
                sp.description,
                sp.price,
                sp.daily_mwh_limit,
                sp.max_session_duration_hours,
                sp.fast_charging_access,
                sp.priority_access,
                sp.cooldown_percentage,
                sp.cooldown_time_hour
            FROM
                user_subscription us
            JOIN
                subscription_plans sp ON us.plan_id = sp.plan_id
            WHERE
                us.user_id = $1
                AND us.is_active = TRUE
            ORDER BY us.start_date DESC
            LIMIT 1;
        `, [user_id]);

        const subscription = subscriptionResult.rows.length > 0 ? subscriptionResult.rows[0] : null;

        // Fetch recent billing history for the user
        const billingHistoryResult = await pool.query(`
            SELECT
                payment_id,
                amount,
                currency,
                payment_date as date, -- Rename to 'date' for frontend clarity
                payment_status as status, -- Rename to 'status'
                transaction_id
            FROM
                payment
            WHERE
                user_id = $1
            ORDER BY payment_date DESC
            LIMIT 5; -- Fetch last 5 payments
        `, [user_id]);

        const billingHistory = billingHistoryResult.rows;

        // Process subscription features for frontend display (e.g., create a list of strings)
        if (subscription) {
            const features = [];
            if (subscription.daily_mwh_limit) features.push(`${subscription.daily_mwh_limit} MWh daily limit`);
            if (subscription.max_session_duration_hours) features.push(`${subscription.max_session_duration_hours} hour max session`);
            if (subscription.fast_charging_access) features.push('Fast Charging Access');
            if (subscription.priority_access) features.push('Priority Access');
            if (subscription.cooldown_percentage && subscription.cooldown_time_hour) {
                features.push(`${subscription.cooldown_percentage}% cooldown in ${subscription.cooldown_time_hour}h`);
            }
            subscription.features = features;

            // Add a simulated 'next_billing_date' if not directly in DB
            // Assuming monthly billing from start_date
            const startDate = new Date(subscription.start_date);
            subscription.next_billing_date = new Date(startDate.setMonth(startDate.getMonth() + 1));
        }


        res.json({ subscription, billing_history: billingHistory });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${user_id} fetched subscription data.`);
    } catch (err) {
        console.error('API Error fetching user subscription data:', err);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching subscription for user ${req.user?.user_id}: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch subscription data.' });
    }
});

// Allows a user to cancel their own subscription
app.post('/api/subscription/cancel', supabaseAuthMiddleware, async (req, res) => {
    const { user_id } = req.user; // Get user_id from the verified JWT

    try {
        // Find the user's current active subscription
        const { rows } = await pool.query(
            `SELECT user_subscription_id FROM user_subscription
             WHERE user_id = $1 AND is_active = true`,
            [user_id]
        );

        const activeSubscription = rows[0];

        if (!activeSubscription) {
            return res.status(404).json({ error: 'No active subscription found to cancel.' });
        }

        // Deactivate the subscription by setting is_active to false and end_date to now
        await pool.query(
            `UPDATE user_subscription
             SET is_active = false, end_date = NOW()
             WHERE user_subscription_id = $1`,
            [activeSubscription.user_subscription_id]
        );

        res.status(200).json({ message: 'Subscription cancelled successfully.' });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${user_id} cancelled their subscription.`, user_id);

    } catch (error) {
        console.error(`Error cancelling subscription for user ${user_id}:`, error.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error cancelling subscription: ${error.message}`, user_id);
        res.status(500).json({ error: 'Internal Server Error: Could not cancel subscription.' });
    }
});

// Get current user's monthly usage statistics
app.get('/api/user/usage', supabaseAuthMiddleware, async (req, res) => {
    try {
        const { user_id } = req.user; // Get user_id from the authenticated request

        // Calculate start and end of current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Fetch aggregated usage data for the current month from charging_session
        const usageResult = await pool.query(`
            SELECT
                COUNT(session_id) as total_sessions,
                COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))/60), 0) as total_duration_minutes,
                COALESCE(SUM(energy_consumed_kwh), 0) as total_energy_kwh,
                COALESCE(SUM(cost), 0) as total_cost
            FROM
                charging_session
            WHERE
                user_id = $1
                AND start_time >= $2
                AND start_time <= $3
                -- REVISED LINE HERE: Use ANY() with an array parameter and explicit casting
                AND session_status = ANY($4::session_status[]);
        `, [
            user_id,
            startOfMonth,
            endOfMonth,
            // Pass the valid enum values as an array for the $4 parameter
            [SESSION_STATUS.COMPLETED, SESSION_STATUS.ACTIVE]
        ])

        const usageData = usageResult.rows[0];

        res.json({
            totalSessions: parseInt(usageData.total_sessions || 0),
            totalDuration: parseFloat(usageData.total_duration_minutes || 0).toFixed(0), // Round to nearest minute
            totalEnergyKWH: parseFloat(usageData.total_energy_kwh || 0).toFixed(2), // 2 decimal places
            totalCost: parseFloat(usageData.total_cost || 0).toFixed(2) // 2 decimal places
        });
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${user_id} fetched usage data.`);
    } catch (err) {
        console.error('API Error fetching user usage data:', err);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Error fetching usage for user ${req.user?.user_id}: ${err.message}`);
        res.status(500).json({ error: 'Failed to fetch usage data.' });
    }
});

// --- /api/me endpoint ---
app.get('/api/me', supabaseAuthMiddleware, async (req, res) => {
    try {
        const { user_id } = req.user;
        // Get user profile
        const userResult = await pool.query('SELECT user_id, fname, lname, is_admin FROM users WHERE user_id = $1', [user_id]);
        if (userResult.rows.length === 0) {
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.API, `User profile request for non-existent user ${user_id}`);
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User profile fetched for ${user_id}`);
    } catch (err) {
        console.error('/api/me error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `/api/me error for user ${req.user?.user_id}: ${err.message}`);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Example admin-only endpoint ---
app.get('/api/admin/users', supabaseAuthMiddleware, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.user_id, u.fname, u.lname, u.email, u.contact_number, u.is_admin, u.created_at, u.last_login,
                sub.plan_id,
                sp.plan_name
            FROM users u
            LEFT JOIN user_subscription sub ON u.user_id = sub.user_id AND sub.is_active = true
            LEFT JOIN subscription_plans sp ON sub.plan_id = sp.plan_id
            ORDER BY u.created_at DESC
        `);
        
        // Format the response to nest subscription data as the frontend expects
        const formattedUsers = result.rows.map(user => ({
            ...user,
            subscription: user.plan_id ? {
                plan_id: user.plan_id,
                plan_name: user.plan_name
            } : null
        }));

        res.json(formattedUsers);
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, 'Admin users list fetched successfully', req.user.user_id);
    } catch (err) {
        console.error('Admin users error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `Admin users error: ${err.message}`, req.user.user_id);
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
        logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User profile fetched for ${user_id}`);
    } catch (err) {
        console.error('User profile error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.API, `User profile error for ${req.user?.user_id}: ${err.message}`);
        res.status(500).json({ error: 'Server error' });
    }
});



// Error handling middleware (catches unhandled errors in async routes)
app.use((err, req, res, next) => {
    console.error(err.stack);
    logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Unhandled API error: ${err.message}`, req.user?.user_id);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Server started on port ${PORT}`);
});

// Graceful shutdown handlers
process.on('SIGINT', () => { // Handles Ctrl+C
    console.log('Shutting down server (SIGINT)...');
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Server shutting down (SIGINT)').finally(() => {
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
});

process.on('SIGTERM', () => { // Handles termination signals from Render
    console.log('Shutting down server (SIGTERM)...');
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Server shutting down (SIGTERM)').finally(() => {
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
});

// --- Supabase JWT Authentication Middleware ---
// Helper to get JWKS and verify JWT
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
let cachedJwks = null;
let cachedJwksAt = 0;
// Note: You removed SUPABASE_JWKS_URL, so getSupabaseJwks might not be needed if only using HS256.
// If you are using RS256, you need to provide SUPABASE_JWKS_URL and use this function.
// For now, I've left it as is assuming your verifySupabaseJWT uses HS256 with a secret.
async function getSupabaseJwks() {
    if (cachedJwks && Date.now() - cachedJwksAt < 60 * 60 * 1000) return cachedJwks;
    try {
        // This URL needs to be defined if you plan to use RS256 for JWT verification.
        // const res = await fetch(SUPABASE_JWKS_URL);
        // if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.statusText}`);
        // const { keys } = await res.json();
        // cachedJwks = keys;
        // cachedJwksAt = Date.now();
        // logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.AUTH, 'Successfully fetched Supabase JWKS');
        // return keys;
        throw new Error("JWKS fetching is not configured or necessary for HS256.");
    } catch (err) {
        console.error('Failed to fetch JWKS:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Failed to fetch Supabase JWKS: ${err.message}`);
        throw err;
    }
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
     if (!SUPABASE_JWT_SECRET) {
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, 'SUPABASE_JWT_SECRET environment variable is not set!');
        throw new Error('Server misconfiguration: JWT secret is missing for HS256 verification.');
    }

    try {
        // For HS256, you directly use the shared secret for verification
        // The `kid` is not used in symmetric (HS256) verification against a JWKS.
        return jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        // Re-throw the error after logging for consistency
        console.error('JWT verification error with HS256:', error.message);
        throw error;
    }
}

// Express middleware
async function supabaseAuthMiddleware(req, res, next) {
    try {
        const auth = req.headers['authorization'];
        if (!auth || !auth.startsWith('Bearer ')) {
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.AUTH, 'Missing or invalid Authorization header');
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
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Authentication failed: ${err.message}`);
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
            logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.AUTH, `Unauthorized admin access attempt by user ${user_id}`);
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (err) {
        console.error('Admin check error:', err.message);
        logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.AUTH, `Admin check error for user ${req.user?.user_id}: ${err.message}`);
        return res.status(500).json({ error: 'Server error' });
    }
}

// Helper function to handle MQTT status messages and update DB
async function handleMqttStatusMessage(payload, deviceId, actualPortId, isPremiumPort) {
    const { status, charger_state, timestamp } = payload;
    const currentTimestamp = new Date(timestamp);

    let mapped_current_status;

    // Logic to map MQTT status/charger_state to DB enum (port_status)
    if (status === 'offline') {
        mapped_current_status = PORT_STATUS.OFFLINE;
    } else if (charger_state === CHARGER_STATES.ON) {
        // When the charger is ON, it's either free or premium charging
        mapped_current_status = isPremiumPort ? PORT_STATUS.CHARGING_PREMIUM : PORT_STATUS.CHARGING_FREE;
    } else if (charger_state === CHARGER_STATES.OFF) {
        // When the charger is OFF and not offline, it's available
        mapped_current_status = PORT_STATUS.AVAILABLE;
    } else {
        // Default or unknown states
        mapped_current_status = PORT_STATUS.AVAILABLE;
    }

    // Insert into device_status_logs
    await pool.query(
        `INSERT INTO device_status_logs (device_id, port_id, status_message, charger_state, timestamp)
         VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))`,
        [deviceId, actualPortId, status, charger_state, timestamp]
    );

    // UPSERT into current_device_status
    await pool.query(
        `INSERT INTO current_device_status (device_id, port_id, status_message, charger_state, last_update)
         VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0))
         ON CONFLICT (device_id, port_id) DO UPDATE SET
            status_message = $3,
            charger_state = $4,
            last_update = TO_TIMESTAMP($5 / 1000.0)`,
        [deviceId, actualPortId, status, charger_state, timestamp]
    );

    // This is the critical update to charging_port's current_status
    await pool.query(
        'UPDATE charging_port SET current_status = $1, is_occupied = $2, last_status_update = $3 WHERE port_id = $4',
        [
            mapped_current_status,
            // is_occupied is true if the port is in a 'charging' or 'occupied' state
            (mapped_current_status === PORT_STATUS.CHARGING_FREE ||
             mapped_current_status === PORT_STATUS.CHARGING_PREMIUM ||
             mapped_current_status === PORT_STATUS.OCCUPIED),
            currentTimestamp,
            actualPortId
        ]
    );
    console.log(`MQTT: Updated status for ${deviceId} Port ${payload.port_number}: ${mapped_current_status}, Charger: ${charger_state}`);
    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Status update for ${deviceId} Port ${payload.port_number}: ${mapped_current_status}, Charger: ${charger_state}`);
}

// Helper function to validate consumption readings
function validateConsumption(consumption) {
    // If consumption is null, undefined, NaN, or negative, return 0
    if (consumption === null || consumption === undefined || isNaN(consumption) || consumption < 0) {
        return 0;
    }
    
    // If consumption is unreasonably high (e.g., > 10kW), cap it
    // Adjust this threshold based on your actual charging hardware capabilities
    if (consumption > MAX_REASONABLE_CONSUMPTION) {
        return MAX_REASONABLE_CONSUMPTION;
    }
    
    // Return the validated consumption
    return consumption;
}


// --- Periodic check for stale sessions ---
// This function will run every 5 minutes to check for any active sessions
// that haven't been updated in more than the inactivity timeout period
function setupStaleSessionChecker() {
    
    async function checkStaleActiveSessions() {
        try {
            console.log('Checking for stale active sessions...');
            logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, 'Running stale session checker');
            
            // Find active sessions that haven't been updated in more than the inactivity timeout
            const staleSessions = await pool.query(
                `SELECT 
                    cs.session_id, 
                    cs.port_id,
                    cp.device_mqtt_id,
                    cp.port_number_in_device,
                    cs.last_status_update,
                    cs.energy_consumed_kwh, -- Need energy for cost calculation
                    EXTRACT(EPOCH FROM (NOW() - cs.last_status_update)) AS seconds_since_update
                FROM 
                    charging_session cs
                JOIN 
                    charging_port cp ON cs.port_id = cp.port_id
                WHERE 
                    cs.session_status = '${SESSION_STATUS.ACTIVE}'
                    AND cs.last_status_update < NOW() - INTERVAL '${INACTIVITY_TIMEOUT_SECONDS * 2} seconds'`,
            );
            
            if (staleSessions.rows.length > 0) {
                console.log(`Found ${staleSessions.rows.length} stale active sessions.`);
                logSystemEvent(LOG_TYPES.WARN, LOG_SOURCES.BACKEND, `Found ${staleSessions.rows.length} stale active sessions`);
                
                // Process each stale session
                for (const session of staleSessions.rows) {
                    console.log(`Cleaning up stale session ${session.session_id} (${Math.round(session.seconds_since_update)}s since last update)`);
                    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Cleaning up stale session ${session.session_id}`);

                    // Send OFF command to the device
                    if (session.device_mqtt_id && session.port_number_in_device) {
                        const controlTopic = `${MQTT_TOPICS.CONTROL}${session.device_mqtt_id}`;
                        const mqttPayload = JSON.stringify({ 
                            command: CHARGER_STATES.OFF, 
                            port_number: session.port_number_in_device 
                        });
                        
                        mqttClient.publish(controlTopic, mqttPayload, { qos: 1 }, (err) => {
                            if (err) {
                                console.error(`Failed to publish cleanup OFF command for stale session ${session.session_id}:`, err);
                                logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.MQTT, `Failed cleanup OFF for stale session ${session.session_id}: ${err.message}`);
                            } else {
                                console.log(`Sent cleanup OFF command for stale session ${session.session_id}`);
                                logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.MQTT, `Sent cleanup OFF for stale session ${session.session_id}`);
                            }
                        });
                    }
                    
                    // Calculate final cost before marking as completed
                    const sessionCost = await calculateSessionCost(session.session_id, session.energy_consumed_kwh || 0);

                    // Mark the session as auto-completed in the database
                    await pool.query(
                        "UPDATE charging_session SET end_time = NOW(), session_status = $1, last_status_update = NOW(), cost = $2 WHERE session_id = $3",
                        [SESSION_STATUS.COMPLETED, sessionCost, session.session_id] // Corrected variable name
                    );
                    logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.BACKEND, `Session ${session.session_id} marked auto-completed by stale checker. Cost: $${sessionCost.toFixed(2)}`);
                    
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
            logSystemEvent(LOG_TYPES.ERROR, LOG_SOURCES.BACKEND, `Error checking for stale sessions: ${error.message}`);
        }
    }
    
    // Run the check immediately on startup
    checkStaleActiveSessions();
    
    // Then set up the interval
    setInterval(checkStaleActiveSessions, STALE_SESSION_CHECK_INTERVAL_MS);
    
    console.log(`Stale session checker set up to run every ${STALE_SESSION_CHECK_INTERVAL_MS / 1000 / 60} minutes.`);
}

// Call this function after the database connection is established
setupStaleSessionChecker();

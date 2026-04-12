# MQTT Configuration - New EMQX Cloud Project

## Overview
This document outlines the MQTT configuration used in the SolarCharge project and what needs to be updated when creating a new EMQX Cloud deployment.

---

## Current MQTT Settings (from env.example)

| Variable | Current Value |
|----------|---------------|
| EMQX_HOST | gab0171b.ala.asia-southeast1.emqxsl.com |
| EMQX_PORT | 8883 (TLS) |
| EMQX_USERNAME | SolarUser |
| EMQX_PASSWORD | SolarPass |
| EMQX_CA_CERT | (certificate content) |

---

## MQTT Topics

| Topic | Purpose | Direction |
|-------|---------|-----------|
| `charger/usage/{deviceId}` | Power consumption data (Amps) | ESP32 -> Backend |
| `charger/status/{deviceId}` | Charger ON/OFF status | ESP32 -> Backend |
| `charger/control/{deviceId}` | Control commands | Backend -> ESP32 |
| `station/+/status` | Generic station status | ESP32 -> Backend |

**Example:**
- `charger/usage/ESP32_CHARGER_STATION_001`
- `charger/status/ESP32_CHARGER_STATION_001`
- `charger/control/ESP32_CHARGER_STATION_001`

---

## Device ID Configuration

**File:** `backend-server/server.js` (line 193)

- **ESP32 Client ID**: `ESP32_CHARGER_STATION_001`
- This must match your ESP32 firmware's `mqttClientId`
- Update `ESP32_STATION_CLIENT_ID` in server.js (line 193) if changed

```javascript
const ESP32_STATION_CLIENT_ID = "ESP32_CHARGER_STATION_001";
```

---

## Backend MQTT Config

**File:** `backend-server/server.js` (lines 186-209)

```javascript
const MQTT_BROKER_HOST = process.env.EMQX_HOST;
const MQTT_PORT = process.env.EMQX_PORT || 8883;
const MQTT_USERNAME = process.env.EMQX_USERNAME;
const MQTT_PASSWORD = process.env.EMQX_PASSWORD;
const EMQX_CA_CERT = process.env.EMQX_CA_CERT;

const mqttOptions = {
    clientId: `backend_server_${Math.random().toString(16).substring(2, 10)}`,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clean: true,
    rejectUnauthorized: process.env.NODE_ENV === 'production' && !!EMQX_CA_CERT,
    ca: EMQX_CA_CERT,
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
};

const mqttClient = mqtt.connect(`mqtts://${MQTT_BROKER_HOST}:${MQTT_PORT}`, mqttOptions);
```

---

## Steps to Update for New EMQX Project

### 1. Create New EMQX Cloud Deployment
- Sign up at https://cloud.emqx.com
- Create new deployment
- Note the connection details

### 2. Update Backend .env
**File:** `backend-server/.env`

```env
EMQX_HOST=gab0171b.ala.asia-southeast1.emqxsl.com
EMQX_PORT=8883
EMQX_USERNAME=your_new_username
EMQX_PASSWORD=your_new_password
EMQX_CA_CERT=-----BEGIN CERTIFICATE-----
... (new certificate content from EMQX dashboard)
-----END CERTIFICATE-----
```

### 3. Update Database Credentials (if Supabase was deleted)
**File:** `backend-server/.env`
```env
DATABASE_URL=postgres://user:password@host:5432/dbname
```

### 4. Update Frontend .env (if Supabase was deleted)
**File:** `frontend/.env`

```env
REACT_APP_SUPABASE_URL=https://new-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_new_anon_key
SUPABASE_JWT_SECRET=your_new_jwt_secret
```

### 5. Verify ESP32 Configuration
**File:** ESP32 firmware (ino/cpp file)
```cpp
const char* mqttServer = "gab0171b.ala.asia-southeast1.emqxsl.com";
const int mqttPort = 8883;
const char* mqttClientId = "ESP32_CHARGER_STATION_001";
```

---

## Database Tables Referenced

The MQTT integration works with these tables:

| Table | Purpose |
|------|---------|
| `charging_port` | Maps `device_mqtt_id` + `port_number_in_device` to `port_id` |
| `charging_session` | Active sessions with energy tracking |
| `consumption_data` | Power consumption logs |
| `current_device_status` | Live device status |
| `system_logs` | MQTT event logging |

**File:** `backend-server/server.js` (line 689)

Key query:
```sql
SELECT port_id, is_premium FROM charging_port 
WHERE device_mqtt_id = $1 AND port_number_in_device = $2
```

---

## Testing MQTT Connection

**File:** `backend-server/server.js`

1. Start backend: `npm start` (in backend-server)
2. Check logs for: "Backend connected to EMQX Cloud MQTT broker"
3. Subscribe to topics in EMQX dashboard to verify messages

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MQTT not connecting | Verify EMQX_HOST, credentials, CA cert |
| Messages not received | Check topic subscriptions in `backend-server/server.js` line 625-637 |
| Port not found | Verify `device_mqtt_id` in `charging_port` table matches ESP32 client ID |
| LWT offline message | ESP32 sends `offline` on disconnect - handled in `backend-server/server.js` line 652 |
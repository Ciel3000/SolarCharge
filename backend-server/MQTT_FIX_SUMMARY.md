# MQTT Connection Fix - Complete Summary

## Problem Diagnosis

The MQTT connection issues were caused by:

1. **Client ID Conflict**: Both ESP32 and backend were using the same MQTT client ID (`ESP32_CHARGER_STATION_001`), causing them to repeatedly disconnect each other.
2. **LWT Trigger Loop**: When either device disconnected, the ESP32's Last Will and Testament would publish an "offline" message, creating a vicious cycle.
3. **Hardcoded Station ID**: Backend code assumed only one station with a specific ID, not future-proof for multiple stations.
4. **ESP32 WiFi/MQTT Resilience**: The ESP32 lacked robust WiFi reconnection and had no MQTT keepalive configuration.
5. **Database Connection Pool**: Supabase connection pool settings were not optimized, leading to ECONNRESET errors under load.

## Changes Made

### Backend Changes

#### 1. Unique MQTT Client ID
**Files:** `backend-server/src/utils/constants.js`, `backend-server/src/config/mqtt.js`, `backend-server/.env`, `backend-server/env.example`

- Added `BACKEND_MQTT_CLIENT_ID` constant with fallback `'backend-server-001'`
- Backend MQTT client now uses this unique ID instead of `ESP32_STATION_CLIENT_ID`
- Configurable via environment variable `MQTT_CLIENT_ID`

#### 2. Multi-Station MQTT Handler
**File:** `backend-server/src/services/chargingService.js`

- Removed hardcoded `ESP32_STATION_CLIENT_ID` checks
- LWT and station-status handling now works with ANY station ID from topic
- Dynamic `deviceId` extraction from topic ensures scalability

#### 3. Clean Station Queries
**File:** `backend-server/src/services/stationService.js`

- Removed hardcoded `'ESP32_CHARGER_STATION_001'` fallback in `getAllStationsAdmin`
- Stations without `device_mqtt_id` now correctly return `NULL`

#### 4. Database Pool Optimization
**File:** `backend-server/src/config/database.js`

- Added `max: 10` (respect Supabase tier limits)
- `idleTimeoutMillis: 10000` (close idle connections before Supabase pooler timeout)
- `connectionTimeoutMillis: 5000`
- `keepAlive: true`

### ESP32 Changes

#### 1. Configurable MQTT Client ID via WiFiManager
**File:** `firmware/esp32-solar-charge/ESPcode updated`

- Added `WiFiManagerParameter custom_mqtt_client_id` for client ID configuration
- Default remains `ESP32_CHARGER_STATION_001` but can be changed via config portal
- Each station can now have a unique ID without recompiling

#### 2. Dynamic MQTT Topics
- Replaced hardcoded topic strings with dynamic `topicUsage`, `topicStatus`, `topicControl` arrays
- `buildTopics()` function constructs topics from `mqttClientId` at startup
- Ensures MQTT topics always match the configured client ID

#### 3. Improved WiFi Resilience
- Added automatic WiFi reconnection in `loop()`
- If WiFi drops, ESP32 actively reconnects with 10s timeout
- Prevents indefinite MQTT reconnect loops when WiFi is down

#### 4. MQTT Keepalive
- Added `client.setKeepAlive(30)` to send MQTT PINGREQ every 30 seconds
- Maintains connection through firewalls/NAT and detects failures faster

## Files Modified

### Backend
- `backend-server/src/utils/constants.js`
- `backend-server/src/config/mqtt.js`
- `backend-server/src/services/chargingService.js`
- `backend-server/src/services/stationService.js`
- `backend-server/src/config/database.js`
- `backend-server/.env`
- `backend-server/env.example`

### ESP32
- `firmware/esp32-solar-charge/ESPcode updated`

## Deployment Instructions

### 1. Backend (Already Restarted)
If not already done:
```bash
cd backend-server
npm run dev
```
Backend will load `MQTT_CLIENT_ID=backend-server-001` from `.env`.

### 2. Flash ESP32 with Updated Code
- Compile and upload the modified `ESPcode updated` to your ESP32
- **Important:** The first time you flash, the ESP32 will still have default client ID `ESP32_CHARGER_STATION_001`. This is fine for a single station.
- For additional stations, configure each ESP32's unique client ID via WiFiManager config portal:
  - Power on ESP32, wait for WiFi AP `ESP32_Charger_AP` to appear
  - Connect to AP, navigate to `192.168.4.1`
  - Set **MQTT Client ID** to a unique value (e.g., `ESP32_CHARGER_STATION_002`)
  - Save and restart

### 3. Verify Operation
**Backend logs should show:**
```
[MQTT] Connected to EMQX Cloud
```
(No immediate "offline" LWT messages unless ESP32 truly disconnects)

**ESP32 serial should show:**
```
Connecting to MQTT...connected
Published station status: online
```
And remain connected.

**Backend should receive:**
```
Received message on charger/status/ESP32_CHARGER_STATION_001: {"status":"online",...}
```
And then port status messages when chargers activate.

### 4. Configure Stations in Database
For each physical station:
- In the admin dashboard, create/edit a station
- Set **Device MQTT ID** to match the ESP32's client ID exactly
- Ensure `device_mqtt_id` matches what's in the MQTT topic

## Expected Outcome

- ✅ No more MQTT client ID conflicts
- ✅ Stable MQTT connections (both sides)
- ✅ ESP32 automatically reconnects to WiFi if dropped
- ✅ MQTT keepalive prevents silent disconnects
- ✅ Database connections stable (no ECONNRESET)
- ✅ System scales to multiple stations seamlessly

## Troubleshooting

### If ESP32 still disconnects frequently:
1. Check WiFi signal strength (RSSI). Consider a better antenna or repeater.
2. Verify power supply is stable (no voltage sags when relays switch).
3. Monitor ESP32 serial for reset messages or watchdog bites.
4. Ensure EMQX Cloud credentials are correct.

### If backend still shows database errors:
1. Check Supabase connection limits; increase `max` in pool if needed.
2. Verify network connectivity to Supabase region.
3. Consider increasing `idleTimeoutMillis` to 15000 if errors persist.

### To add a new station:
1. Flash an ESP32 with this firmware.
2. Use WiFiManager to set a unique **MQTT Client ID** (e.g., `ESP32_CHARGER_STATION_002`).
3. In the backend admin panel, add a new station with `device_mqtt_id = ESP32_CHARGER_STATION_002`.
4. The backend will automatically start receiving messages from the new station.

## Technical Notes

- **LWT (Last Will and Testament):** ESP32 registers an LWT with broker that publishes `{"status":"offline",...}` if the connection is lost unexpectedly. This is normal and desired.
- **Topic Structure:** All MQTT topics now follow `charger/<type>/<client_id>` pattern, ensuring isolation between stations.
- **Backend as Aggregator:** The backend is a separate MQTT client that subscribes to wildcard topics (`charger/status/+`, `charger/usage/+`) to receive data from all stations.
- **No Single Point of Failure:** Each component (backend, each ESP32) has its own MQTT client ID, eliminating connection battles.

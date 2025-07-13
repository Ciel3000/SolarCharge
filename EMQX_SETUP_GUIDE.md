# EMQX Cloud Migration Guide

This guide will help you migrate from HiveMQ to EMQX Cloud for your Solar Charge Project.

## EMQX Cloud Connection Details

- **Broker Address**: `zfd47f32.ala.asia-southeast1.emqxsl.com`
- **MQTT over TLS/SSL Port**: `8883`
- **WebSocket over TLS/SSL Port**: `8084`

## Setup Steps

### 1. Backend Configuration

#### For `backend/` directory:
1. Copy `env.example` to `.env`:
   ```bash
   cd backend
   cp env.example .env
   ```

2. Edit `.env` with your EMQX credentials:
   ```env
   EMQX_HOST=zfd47f32.ala.asia-southeast1.emqxsl.com
   EMQX_PORT=8883
   EMQX_USERNAME=your_actual_username
   EMQX_PASSWORD=your_actual_password
   ```

3. Install dependencies and start:
   ```bash
   npm install
   npm run dev
   ```

#### For `backend-server/` directory:
1. Copy `env.example` to `.env`:
   ```bash
   cd backend-server
   cp env.example .env
   ```

2. Edit `.env` with your EMQX credentials:
   ```env
   EMQX_HOST=zfd47f32.ala.asia-southeast1.emqxsl.com
   EMQX_PORT=8883
   EMQX_USERNAME=your_actual_username
   EMQX_PASSWORD=your_actual_password
   ```

3. Install dependencies and start:
   ```bash
   npm install
   npm run dev
   ```

### 2. ESP32 Firmware Configuration

1. Edit `firmware/esp32-solar-charge/src/config.h`:
   ```cpp
   // WiFi Configuration
   #define WIFI_SSID "your_wifi_ssid"
   #define WIFI_PASSWORD "your_wifi_password"
   
   // MQTT Configuration - EMQX Cloud
   #define MQTT_BROKER "zfd47f32.ala.asia-southeast1.emqxsl.com"
   #define MQTT_PORT 8883
   #define MQTT_USERNAME "your_actual_username"
   #define MQTT_PASSWORD "your_actual_password"
   #define MQTT_CLIENT_ID "ESP32_SolarCharge_001"
   ```

2. Build and upload the firmware:
   ```bash
   cd firmware/esp32-solar-charge
   pio run --target upload
   pio device monitor
   ```

### 3. Testing the Connection

#### Test Backend Connection:
```bash
# Check if backend connects to EMQX
curl -X POST http://localhost:3000/api/activate-port \
  -H "Content-Type: application/json" \
  -d '{"station_id": "001", "port": 1}'
```

#### Test ESP32 Connection:
1. Monitor the ESP32 serial output
2. Look for "Connected to EMQX Cloud!" message
3. Check for sensor data being published

### 4. MQTT Topics

The system uses these MQTT topics:

- **Control**: `station/001/control` - Send relay commands
- **Status**: `station/001/status` - Receive relay status
- **Sensor Data**: `station/001/sensor` - Receive sensor readings

### 5. Relay Commands

Send these messages to `station/001/control`:
- `relay1_on` - Turn on relay 1
- `relay1_off` - Turn off relay 1
- `relay2_on` - Turn on relay 2
- `relay2_off` - Turn off relay 2

### 6. Troubleshooting

#### Common Issues:

1. **Connection Failed**:
   - Check WiFi credentials in ESP32 config
   - Verify EMQX credentials
   - Ensure TLS/SSL port 8883 is used

2. **Certificate Errors**:
   - Backend uses `rejectUnauthorized: false` for development
   - Set to `true` in production with proper certificates

3. **ESP32 Not Connecting**:
   - Check serial monitor for error messages
   - Verify MQTT broker address and credentials
   - Ensure WiFi connection is stable

4. **Messages Not Received**:
   - Check topic subscriptions
   - Verify QoS settings
   - Monitor MQTT client state

### 7. Security Notes

- Use environment variables for credentials
- Enable TLS/SSL in production
- Use strong passwords
- Consider certificate-based authentication
- Implement proper access control

### 8. Production Deployment

For production:
1. Set `rejectUnauthorized: true` in backend MQTT options
2. Use proper SSL certificates
3. Implement authentication and authorization
4. Set up monitoring and logging
5. Configure backup and redundancy

## Support

If you encounter issues:
1. Check the serial monitor for ESP32 errors
2. Review backend server logs
3. Test MQTT connection with a client like MQTT Explorer
4. Verify EMQX Cloud dashboard for connection status 
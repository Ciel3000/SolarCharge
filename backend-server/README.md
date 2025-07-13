# SolarCharge Backend Server

A Node.js backend server for the SolarCharge project that handles MQTT communication with ESP32 devices, PostgreSQL database operations, and REST API endpoints.

## Features

- **MQTT Communication**: Connects to EMQX Cloud broker for real-time device communication
- **PostgreSQL Database**: Stores device consumption data and status logs
- **REST API**: Provides endpoints for device control and data retrieval
- **TLS Security**: Secure MQTT connections with proper certificate validation
- **Graceful Shutdown**: Proper cleanup of connections on server shutdown

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

1. Install PostgreSQL on your system
2. Create a new database for the project
3. Run the database schema:

```bash
psql -U your_username -d your_database -f database_schema.sql
```

### 3. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

- **EMQX Cloud**: Get credentials from your EMQX Cloud deployment
- **PostgreSQL**: Configure your database connection
- **EMQX CA Certificate**: Get the CA certificate from your EMQX Cloud deployment

### 4. Start the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Device Management

#### Get Device Consumption Data
```
GET /api/devices/:deviceId/consumption
```
Returns the last 100 consumption records for a specific device.

#### Get All Device Status
```
GET /api/devices/status
```
Returns the current status of all devices.

#### Control Device
```
POST /api/devices/:deviceId/control
Content-Type: application/json

{
  "command": "ON" | "OFF"
}
```
Sends control commands to devices via MQTT.

### Legacy ESP32 Commands (Backward Compatibility)

#### Send ESP32 Command
```
POST /api/esp32/command
Content-Type: application/json

{
  "action": "activate" | "deactivate",
  "stationId": "station_id",
  "portId": 1 | 2
}
```

## MQTT Topics

The server subscribes to and publishes on the following topics:

### Subscriptions
- `charger/usage/#` - Device consumption data
- `charger/status/#` - Device status updates
- `station/+/status` - Station status (legacy)

### Publications
- `charger/control/:deviceId` - Device control commands
- `station/:stationId/control` - Station control (legacy)

## Database Schema

### Tables

1. **consumption_data**: Stores device power consumption readings
2. **device_status_logs**: Historical device status logs
3. **current_device_status**: Latest status for each device

### Indexes

Performance indexes are created on:
- `device_id` columns
- `timestamp` columns

## Error Handling

The server includes comprehensive error handling for:
- Database connection issues
- MQTT connection failures
- Invalid API requests
- Message parsing errors

## Security

- TLS encryption for MQTT connections
- Environment variable configuration
- Input validation on API endpoints
- Proper error messages without exposing sensitive data

## Development

### Running Tests
```bash
npm test
```

### Code Formatting
```bash
npm run format
```

### Linting
```bash
npm run lint
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**: Check your PostgreSQL credentials and ensure the database is running
2. **MQTT Connection Error**: Verify your EMQX Cloud credentials and CA certificate
3. **Port Already in Use**: Change the PORT in your .env file

### Logs

The server provides detailed logging for:
- MQTT connection status
- Database operations
- API requests
- Error conditions

## License

ISC License - see LICENSE file for details. 
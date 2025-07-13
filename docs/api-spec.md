# Solar Charge Project - API Specification

## Base URL
```
http://localhost:5000/api
```

## Authentication
All API endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Solar Panel Data

#### GET /solar
Get all solar panel readings.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "solarVoltage": 24.5,
      "solarCurrent": 2.1,
      "batteryVoltage": 12.8,
      "chargeStatus": 1,
      "timestamp": "2023-07-15T10:30:00Z"
    }
  ]
}
```

#### POST /solar
Create a new solar panel reading.

**Request Body:**
```json
{
  "solarVoltage": 24.5,
  "solarCurrent": 2.1,
  "batteryVoltage": 12.8,
  "chargeStatus": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "solarVoltage": 24.5,
    "solarCurrent": 2.1,
    "batteryVoltage": 12.8,
    "chargeStatus": 1,
    "timestamp": "2023-07-15T10:30:00Z"
  }
}
```

### Charging Station Data

#### GET /charging
Get all charging station data.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "stationId": "station-001",
      "status": "charging",
      "currentUser": "user-123",
      "startTime": "2023-07-15T10:00:00Z",
      "endTime": null,
      "energyDelivered": 5.2
    }
  ]
}
```

#### POST /charging
Create a new charging session.

**Request Body:**
```json
{
  "stationId": "station-001",
  "userId": "user-123",
  "action": "start"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "stationId": "station-001",
    "status": "charging",
    "currentUser": "user-123",
    "startTime": "2023-07-15T10:30:00Z",
    "endTime": null,
    "energyDelivered": 0
  }
}
```

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid input data",
  "details": "solarVoltage must be a positive number"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error"
}
```

## Data Models

### Solar Reading
```json
{
  "solarVoltage": "number (required)",
  "solarCurrent": "number (required)",
  "batteryVoltage": "number (required)",
  "chargeStatus": "number (0 or 1, required)",
  "timestamp": "date (auto-generated)"
}
```

### Charging Session
```json
{
  "stationId": "string (required)",
  "userId": "string (required)",
  "status": "string (charging|completed|error)",
  "startTime": "date (auto-generated)",
  "endTime": "date (optional)",
  "energyDelivered": "number (kWh)"
}
``` 
# Solar Charge Project - Database Schema

## Overview

The application uses MongoDB as the primary database. This document outlines the database collections and their schemas.

## Collections

### 1. Solar Readings

Stores real-time data from solar panels and batteries.

```javascript
{
  _id: ObjectId,
  solarVoltage: Number,      // Solar panel voltage in volts
  solarCurrent: Number,      // Solar panel current in amperes
  batteryVoltage: Number,    // Battery voltage in volts
  chargeStatus: Number,      // 0 = not charging, 1 = charging
  temperature: Number,       // Temperature in Celsius (optional)
  powerOutput: Number,       // Calculated power output in watts
  timestamp: Date,           // When the reading was taken
  deviceId: String,          // ESP32 device identifier
  location: {                // GPS coordinates (optional)
    type: "Point",
    coordinates: [longitude, latitude]
  }
}
```

**Indexes:**
- `timestamp: -1` (descending)
- `deviceId: 1`
- `location: "2dsphere"`

### 2. Charging Sessions

Tracks individual charging sessions.

```javascript
{
  _id: ObjectId,
  sessionId: String,         // Unique session identifier
  stationId: String,         // Charging station identifier
  userId: String,            // User identifier
  status: String,            // "active", "completed", "cancelled", "error"
  startTime: Date,           // Session start time
  endTime: Date,             // Session end time (null if active)
  energyDelivered: Number,   // Energy delivered in kWh
  cost: Number,              // Cost in currency units
  paymentStatus: String,     // "pending", "paid", "failed"
  vehicleInfo: {             // Vehicle information (optional)
    make: String,
    model: String,
    year: Number
  },
  notes: String              // Additional notes
}
```

**Indexes:**
- `sessionId: 1` (unique)
- `stationId: 1`
- `userId: 1`
- `startTime: -1`
- `status: 1`

### 3. Users

User account information.

```javascript
{
  _id: ObjectId,
  userId: String,            // Unique user identifier
  email: String,             // User email address
  passwordHash: String,      // Hashed password
  firstName: String,         // User's first name
  lastName: String,          // User's last name
  phone: String,             // Phone number (optional)
  role: String,              // "user", "admin", "operator"
  isActive: Boolean,         // Account status
  createdAt: Date,           // Account creation date
  lastLogin: Date,           // Last login timestamp
  preferences: {             // User preferences
    notifications: Boolean,
    language: String,
    timezone: String
  }
}
```

**Indexes:**
- `userId: 1` (unique)
- `email: 1` (unique)
- `role: 1`

### 4. Charging Stations

Information about charging stations.

```javascript
{
  _id: ObjectId,
  stationId: String,         // Unique station identifier
  name: String,              // Station name
  location: {                // GPS coordinates
    type: "Point",
    coordinates: [longitude, latitude]
  },
  address: String,           // Physical address
  status: String,            // "active", "maintenance", "offline"
  maxPower: Number,          // Maximum power output in kW
  connectorTypes: [String],  // Available connector types
  pricing: {                 // Pricing information
    rate: Number,            // Price per kWh
    currency: String
  },
  operator: String,          // Station operator
  installationDate: Date,    // When station was installed
  lastMaintenance: Date      // Last maintenance date
}
```

**Indexes:**
- `stationId: 1` (unique)
- `location: "2dsphere"`
- `status: 1`

### 5. System Logs

Application and system logs.

```javascript
{
  _id: ObjectId,
  timestamp: Date,           // Log timestamp
  level: String,             // "info", "warning", "error", "debug"
  component: String,         // "frontend", "backend", "firmware"
  message: String,           // Log message
  details: Object,           // Additional details
  userId: String,            // User who triggered the log (optional)
  sessionId: String,         // Related session (optional)
  ipAddress: String          // IP address (optional)
}
```

**Indexes:**
- `timestamp: -1`
- `level: 1`
- `component: 1`

## Data Relationships

- **Solar Readings** → **Charging Sessions**: Linked by timestamp and location
- **Charging Sessions** → **Users**: Linked by userId
- **Charging Sessions** → **Charging Stations**: Linked by stationId
- **System Logs** → **Users**: Linked by userId (optional)

## Data Retention

- **Solar Readings**: 1 year (archived after)
- **Charging Sessions**: 3 years
- **Users**: Indefinite (unless deleted)
- **Charging Stations**: Indefinite
- **System Logs**: 6 months

## Backup Strategy

- Daily automated backups
- Point-in-time recovery available
- Offsite backup storage
- Monthly backup testing 
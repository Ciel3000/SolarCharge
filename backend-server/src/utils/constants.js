// src/utils/constants.js
// Centralized enums and configuration values

const SESSION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

const PORT_STATUS = {
  AVAILABLE: 'available',
  CHARGING_FREE: 'charging_free',
  CHARGING_PREMIUM: 'charging_premium',
  MAINTENANCE: 'maintenance',
  OFFLINE: 'offline',
  OCCUPIED: 'occupied',
  FAULT: 'fault',
};

const CHARGER_STATES = {
  ON: 'ON',
  OFF: 'OFF',
  UNKNOWN: 'UNKNOWN',
};

const LOG_TYPES = {
  INFO: 'info',
  WARN: 'warning',
  ERROR: 'error',
};

const LOG_SOURCES = {
  BACKEND: 'backend',
  MQTT: 'mqtt',
  AUTH: 'auth',
  API: 'api',
  SUBSCRIPTION: 'subscription',
};

const MQTT_TOPICS = {
  USAGE: 'charger/usage/',
  STATUS: 'charger/status/',
  CONTROL: 'charger/control/',
  STATION_GENERIC_STATUS: 'station/+/status',
};

const CONFIG = {
  INACTIVITY_TIMEOUT_SECONDS: 300, // 5 minutes
  DEVICE_STATUS_STALE_THRESHOLD_SECONDS: 45,
  USER_DEVICE_ONLINE_THRESHOLD_SECONDS: 120,
  NOMINAL_CHARGING_VOLTAGE_DC: 13,
  MAX_REASONABLE_CONSUMPTION: 10000,
  PREMIUM_USER_MAX_ACTIVE_SLOTS: 2,
  DEFAULT_PRICE_PER_MAH: 0.25,
  STALE_SESSION_CHECK_INTERVAL_MS: 5 * 60 * 1000,
};

const ESP32_STATION_CLIENT_ID = 'ESP32_CHARGER_STATION_001';

module.exports = {
  SESSION_STATUS,
  PORT_STATUS,
  CHARGER_STATES,
  LOG_TYPES,
  LOG_SOURCES,
  MQTT_TOPICS,
  CONFIG,
  ESP32_STATION_CLIENT_ID,
};

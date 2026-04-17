// src/services/state.js
// In-memory application state (singleton)

const activeChargerSessions = {}; // key: `${deviceId}_${portNumber}` -> sessionId
const activePortTimers = {}; // key: `${deviceId}_${portNumber}` -> { timerId, lastConsumptionTime }
const fullChargeNotificationState = new Map(); // sessionId -> state
const sessionLocks = new Map(); // sessionKey -> lock status

module.exports = {
  activeChargerSessions,
  activePortTimers,
  fullChargeNotificationState,
  sessionLocks,
};

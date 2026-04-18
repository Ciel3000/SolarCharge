// server.js - Entry point
// Minimal bootstrap: loads env, creates app, starts MQTT and jobs

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');
const { createMqttClient } = require('./src/config/mqtt');
const { startCleanupJob } = require('./src/jobs/cleanupOrders');
const {
  startStaleSessionChecker,
  startExpiredSubscriptionChecker,
  startBorrowedAmountProcessor,
  startDailyQuotaReset,
} = require('./src/jobs/systemJobs');

// Initialize database pool (side-effect)
require('./src/config/database');

// Start MQTT client (sets global.mqttClient and service reference)
const mqttClient = createMqttClient();

// Create Express app
const app = createApp();

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`SolarCharge Backend running on port ${PORT}`);
});

// Start background system jobs
startStaleSessionChecker(mqttClient);
startExpiredSubscriptionChecker();
startBorrowedAmountProcessor();
startDailyQuotaReset(require('./src/config/database'));

// Start rolling 24h reset service
require('./src/services/resetService');

// Start PayPal orders cleanup job (runs hourly)
startCleanupJob(require('./src/config/database'));

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  mqttClient.end();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

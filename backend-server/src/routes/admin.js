// src/routes/admin.js
// Admin-only routes

const router = require('express').Router();
const adminController = require('../controllers/adminController');

// All routes require admin middleware (applied in app.js via route registration)

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/sessions/recent', adminController.getRecentSessions);
router.get('/system/status', adminController.getSystemStatus);
router.get('/stations/battery', adminController.getBatteryLevels);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUser);
router.post('/users', adminController.createUser);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);

// Station management
router.get('/stations', adminController.getAllStations);
router.post('/stations', adminController.createStation);
router.put('/stations/:stationId', adminController.updateStation);
router.delete('/stations/:stationId', adminController.deleteStation);

// Sessions and reports
router.get('/sessions', adminController.getSessionsAdmin);
router.get('/revenue', adminController.getRevenueStats);
router.get('/revenue/subscription-analytics', adminController.getSubscriptionAnalytics);
router.get('/usage', adminController.getUsageStats);

// Logs
router.get('/logs', adminController.getAdminLogs);

// Maintenance
router.post('/fix-expired-subscriptions', adminController.fixExpiredSubscriptions);

// Quota pricing
router.get('/quota/pricing', adminController.getAllQuotaPricing);
router.put('/quota/pricing', adminController.updateQuotaPricing);
router.get('/quota/extensions', adminController.getAllExtensionsAdmin);
router.put('/quota/extensions/:extensionId/confirm-payment', adminController.confirmExtensionPayment);

module.exports = router;

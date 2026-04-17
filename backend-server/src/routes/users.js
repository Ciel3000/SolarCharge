// src/routes/users.js
// User profile, devices, notifications (auth required)

const router = require('express').Router();
const userController = require('../controllers/userController');
const subscriptionController = require('../controllers/subscriptionController');
const { supabaseAuthMiddleware } = require('../middleware/auth');

// All routes use supabase auth
router.use(supabaseAuthMiddleware);

// Profile
router.get('/profile', userController.getProfile);
router.get('/me', userController.getMe);

// Devices
router.get('/devices', userController.getUserDevices);
router.post('/devices', userController.addDevice);

// Notifications
router.get('/notifications', userController.getUserNotifications);
router.get('/notifications/unread-count', userController.getUnreadCount);
router.put('/notifications/:notificationId/read', userController.markNotificationRead);
router.put('/notifications/mark-all-read', userController.markAllNotificationsRead);
router.delete('/notifications/:notificationId', userController.deleteNotification);

// Subscription & Usage
router.get('/subscription', subscriptionController.getUserSubscription);
router.get('/subscription-history', subscriptionController.getSubscriptionHistory);
router.get('/usage', subscriptionController.getUserUsage);
router.get('/quota-status', subscriptionController.getUserQuotaStatus);

module.exports = router;

// src/controllers/userController.js
// User profile, devices, and notifications

const userService = require('../services/userService');
const notificationService = require('../services/notificationService');
const { supabaseAuthMiddleware } = require('../middleware/auth');

// ============= Profile =============

async function getProfile(req, res, next) {
  const { user_id } = req.user;
  try {
    const profile = await userService.getUserProfile(user_id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  const { user_id } = req.user;
  try {
    const user = await userService.getCurrentUser(user_id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

// ============= Devices =============

async function getUserDevices(req, res, next) {
  const { user_id } = req.user;
  try {
    const devices = await userService.getUserDevices(user_id);
    res.json(devices);
  } catch (err) {
    next(err);
  }
}

async function addDevice(req, res, next) {
  const { user_id } = req.user;
  const { device_name, device_model, device_type, is_charging, current_battery_level } = req.body;
  try {
    const device = await userService.addUserDevice(user_id, {
      device_name,
      device_model,
      device_type,
      is_charging,
      current_battery_level,
    });
    res.status(201).json(device);
  } catch (err) {
    next(err);
  }
}

// ============= Notifications =============

async function getUserNotifications(req, res, next) {
  const { user_id } = req.user;
  const { limit = 50, offset = 0 } = req.query;
  try {
    const notifications = await notificationService.getUserNotifications(user_id, parseInt(limit), parseInt(offset));
    res.json(notifications);
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  const { user_id } = req.user;
  try {
    const count = await notificationService.getUnreadCount(user_id);
    res.json({ unreadCount: count });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  const { user_id } = req.user;
  const { notificationId } = req.params;
  try {
    const notification = await notificationService.markAsRead(notificationId, user_id);
    res.json(notification);
  } catch (err) {
    if (err.message === 'Notification not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  const { user_id } = req.user;
  try {
    const result = await notificationService.markAllRead(user_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteNotification(req, res, next) {
  const { user_id } = req.user;
  const { notificationId } = req.params;
  try {
    await notificationService.deleteNotification(notificationId, user_id);
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'Notification not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  // Profile
  getProfile,
  getMe,

  // Devices
  getUserDevices,
  addDevice,

  // Notifications
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
};

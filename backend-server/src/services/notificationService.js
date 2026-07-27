// src/services/notificationService.js
// User notification management

const pool = require('../config/database');
const { logSystemEvent } = require('./logger');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

async function createUserNotification({ userId, type = 'info', content, context = null }) {
  if (!userId || !content) return;

  const allowedTypes = ['info', 'success', 'warning', 'error'];
  const normalizedType = allowedTypes.includes(type) ? type : 'info';

  try {
    await pool.query(
      `INSERT INTO notification (user_id, notification_type, notification_context, notification_content)
       VALUES (?, ?, ?, ?)`,
      [userId, normalizedType, context || null, content]
    );
    await logSystemEvent(
      LOG_TYPES.INFO,
      LOG_SOURCES.BACKEND,
      `Notification (${normalizedType}) queued for user ${userId}: ${content.substring(0, 120)}`,
      userId
    );
  } catch (error) {
    console.error('Notification insert error:', error);
    await logSystemEvent(
      LOG_TYPES.ERROR,
      LOG_SOURCES.BACKEND,
      `Failed to persist notification for user ${userId}: ${error.message}`,
      userId
    );
  }
}

function getUserNotifications(userId, limit = 50, offset = 0) {
  return pool.query(`
    SELECT
      notification_id,
      notification_type,
      notification_context,
      notification_content,
      is_read,
      created_at
    FROM notification
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, parseInt(limit), parseInt(offset)]).then(res => res[0]);
}

function getUnreadCount(userId) {
  return pool.query(
    `SELECT COUNT(*) as unread_count FROM notification WHERE user_id = ? AND is_read = false`,
    [userId]
  ).then(res => parseInt(res[0][0].unread_count));
}

async function markAsRead(notificationId, userId) {
  const result = await pool.query(
    `UPDATE notification
     SET is_read = true, updated_at = NOW()
     WHERE notification_id = ? AND user_id = ?
    `,
    [notificationId, userId]
  );
  if (result[0].length === 0) throw new Error('Notification not found');
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Notification marked as read for user ${userId}`);
  return result[0][0];
}

async function markAllRead(userId) {
  const result = await pool.query(
    `UPDATE notification
     SET is_read = true, updated_at = NOW()
     WHERE user_id = ? AND is_read = false
    `,
    [userId]
  );
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `All notifications marked as read for user ${userId}`);
  return { message: 'All notifications marked as read', updatedCount: result[0].length };
}

async function deleteNotification(notificationId, userId) {
  const result = await pool.query(
    'DELETE FROM notification WHERE notification_id = ? AND user_id = ?',
    [notificationId, userId]
  );
  if (result[0].length === 0) throw new Error('Notification not found');
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `Notification ${notificationId} deleted by user ${userId}`);
  return result[0][0];
}

module.exports = {
  createUserNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  deleteNotification,
};

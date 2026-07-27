// src/services/userService.js
// User management, profile, devices, and admin user CRUD

const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logSystemEvent } = require('./logger');
const { LOG_TYPES, LOG_SOURCES } = require('../utils/constants');

// ============= User Profile =============

function getCurrentUser(userId) {
  return pool.query(`
    SELECT user_id, fname, lname, email, contact_number, is_admin, created_at, last_login
    FROM users
    WHERE user_id = ?
  `, [userId]).then(res => res[0][0]);
}

function getUserProfile(userId) {
  return pool.query(`
    SELECT u.user_id, u.fname, u.lname, u.email, u.contact_number, u.is_admin, u.created_at,
           us.plan_id, sp.plan_name, us.is_active as subscription_active,
           us.end_date as subscription_end_date
    FROM users u
    LEFT JOIN user_subscription us ON u.user_id = us.user_id AND us.is_active = true AND us.end_date > NOW()
    LEFT JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    WHERE u.user_id = ?
    ORDER BY us.created_at DESC
    LIMIT 1
  `, [userId]).then(res => res[0][0]);
}

// ============= User Devices =============

function getUserDevices(userId) {
  return pool.query(`
    SELECT device_id, device_name, device_model, current_battery_level,
           is_charging, last_updated, created_at
    FROM user_devices
    WHERE user_id = ?
    ORDER BY last_updated DESC
  `, [userId]).then(res => res[0]);
}

async function addUserDevice(userId, deviceData) {
  const { device_name, device_model, device_type, is_charging, current_battery_level } = deviceData;

  // Check if device already exists for this user (by type and name)
  const existing = await pool.query(
    `SELECT device_id FROM user_devices WHERE user_id = ? AND device_type = ? AND device_name = ?`,
    [userId, device_type, device_name]
  );

  if (existing[0].length > 0) {
    // Update existing device
    const result = await pool.query(
      `UPDATE user_devices
       SET device_model = ?, is_charging = ?, current_battery_level = ?, last_updated = NOW()
       WHERE device_id = ?
      `,
      [device_model, is_charging, current_battery_level, existing[0][0].device_id]
    );
    return result[0][0];
  } else {
    // Insert new device
    const deviceId = uuidv4();
    const result = await pool.query(
      `INSERT INTO user_devices
       (device_id, user_id, device_type, device_name, device_model, is_charging, current_battery_level, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [deviceId, userId, device_type, device_name, device_model, is_charging, current_battery_level]
    );
    return result[0][0];
  }
}

// ============= Admin User CRUD =============

function getAllUsers() {
  return pool.query(`
    SELECT GROUP BY u.user_id
           u.user_id, u.fname, u.lname, u.email, u.contact_number, u.is_admin, u.created_at, u.last_login,
           us.plan_id, sp.plan_name, us.is_active as subscription_active, us.end_date as subscription_end_date
    FROM users u
    LEFT JOIN user_subscription us ON u.user_id = us.user_id AND us.is_active = true AND us.end_date > NOW()
    LEFT JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    ORDER BY u.user_id, us.created_at DESC
  `).then(res => res[0]);
}

function getUserById(userId) {
  return pool.query(
    'SELECT user_id, fname, lname, email, contact_number, is_admin, created_at FROM users WHERE user_id = ?',
    [userId]
  ).then(res => res[0][0]);
}

async function createUser({ fname, lname, email, contact_number, is_admin, plan_id }) {
  // Placeholder: In production, use Supabase Admin SDK to create auth user
  const newUserId = uuidv4(); // replace with actual auth user ID
  await pool.query(
    `INSERT INTO users (user_id, fname, lname, email, contact_number, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [newUserId, fname, lname, email, contact_number, is_admin || false]
  );

  if (plan_id) {
    const planResult = await pool.query(
      `SELECT duration_type, duration_value FROM subscription_plans WHERE plan_id = ?`,
      [plan_id]
    );
    if (planResult[0].length > 0) {
      const plan = planResult[0][0];
      const endDate = new Date();
      switch (plan.duration_type) {
        case 'daily': endDate.setDate(endDate.getDate() + plan.duration_value); break;
        case 'weekly': endDate.setDate(endDate.getDate() + (plan.duration_value * 7)); break;
        case 'monthly': endDate.setMonth(endDate.getMonth() + plan.duration_value); break;
        case 'quarterly': endDate.setMonth(endDate.getMonth() + (plan.duration_value * 3)); break;
        case 'yearly': endDate.setFullYear(endDate.getFullYear() + plan.duration_value); break;
        default: endDate.setMonth(endDate.getMonth() + 1);
      }
      await pool.query(
        `INSERT INTO user_subscription (user_subscription_id, user_id, plan_id, is_active, start_date, end_date, current_daily_mah_consumed)
         VALUES (?, ?, ?, true, NOW(), ?, 0)`,
        [uuidv4(), newUserId, plan_id, endDate.toISOString()]
      );
    }
  }

  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `New user ${newUserId} created by admin`);
  return { user_id: newUserId };
}

async function updateUser(userId, { fname, lname, contact_number, is_admin, plan_id }) {
  await pool.query(
    `UPDATE users SET fname = ?, lname = ?, contact_number = ?, is_admin = ?, updated_at = NOW()
     WHERE user_id = ?`,
    [fname, lname, contact_number, is_admin, userId]
  );

  // Update subscription if plan changed
  if (plan_id !== undefined) {
    // Deactivate all active subscriptions first (replace, not stack)
    await pool.query(
      `UPDATE user_subscription
       SET is_active = false, end_date = NOW()
       WHERE user_id = ? AND is_active = true`,
      [userId]
    );
    
    // Add new subscription if plan_id provided
    if (plan_id) {
      const planResult = await pool.query(
        `SELECT duration_type, duration_value FROM subscription_plans WHERE plan_id = ?`,
        [plan_id]
      );
      if (planResult[0].length > 0) {
        const plan = planResult[0][0];
        const endDate = new Date();
        switch (plan.duration_type) {
          case 'daily': endDate.setDate(endDate.getDate() + plan.duration_value); break;
          case 'weekly': endDate.setDate(endDate.getDate() + (plan.duration_value * 7)); break;
          case 'monthly': endDate.setMonth(endDate.getMonth() + plan.duration_value); break;
          case 'quarterly': endDate.setMonth(endDate.getMonth() + (plan.duration_value * 3)); break;
          case 'yearly': endDate.setFullYear(endDate.getFullYear() + plan.duration_value); break;
          default: endDate.setMonth(endDate.getMonth() + 1);
        }
        await pool.query(
          `INSERT INTO user_subscription (user_subscription_id, user_id, plan_id, is_active, start_date, end_date)
           VALUES (?, ?, ?, true, NOW(), ?)`,
          [uuidv4(), userId, plan_id, endDate.toISOString()]
        );
      }
    }
  }

  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} updated by admin`);
  return { success: true };
}

async function deleteUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete related records (respecting foreign keys)
    await client.query('DELETE FROM quota_extensions WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM payment WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM daily_energy_usage WHERE user_id = ?', [userId]);
    await client.query(
      `DELETE FROM consumption_data
       WHERE session_id IN (SELECT session_id FROM charging_session WHERE user_id = ?)`,
      [userId]
    );
    await client.query('DELETE FROM charging_session WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM user_subscription WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM notification WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM user_devices WHERE user_id = ?', [userId]);
    await client.query('DELETE FROM admin_profiles WHERE user_id = ?', [userId]);

    const result = await client.query('DELETE FROM users WHERE user_id = ?', [userId]);
    if (result.rowCount === 0) {
      throw new Error('User not found');
    }

    await client.query('COMMIT');
    await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.API, `User ${userId} deleted by admin`);
    return { message: 'User deleted successfully' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete user error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  // Profile
  getCurrentUser,
  getUserProfile,

  // Devices
  getUserDevices,
  addUserDevice,

  // Admin User CRUD
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};

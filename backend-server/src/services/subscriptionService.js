// src/services/subscriptionService.js
// Subscription, quota, and pricing management

const pool = require('../config/database');
const { logSystemEvent } = require('./logger');
const {
  SESSION_STATUS,
  LOG_TYPES,
  LOG_SOURCES,
  CONFIG,
} = require('../utils/constants');

// Active session count for a user
async function checkUserActiveSessions(userId) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as active_count FROM charging_session WHERE user_id = $1 AND session_status = $2',
      [userId, SESSION_STATUS.ACTIVE]
    );
    return parseInt(result.rows[0].active_count) || 0;
  } catch (error) {
    console.error('Error checking user active sessions:', error);
    return 0;
  }
}

// Quota validation with daily reset
async function checkUserQuota(userId) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        us.current_daily_mah_consumed,
        us.borrowed_mah_today,
        us.last_quota_reset,
        sp.daily_mah_limit
      FROM user_subscription us
      JOIN subscription_plans sp ON us.plan_id = sp.plan_id
      WHERE us.user_id = $1 AND us.is_active = true
      ORDER BY us.created_at DESC LIMIT 1
    `, [userId]);

    if (rows.length === 0) {
      return {
        canCharge: false,
        reason: 'No active subscription found',
        availableQuota: 0,
        totalUsed: 0,
        dailyLimit: 0,
        borrowedToday: 0,
      };
    }

    const subscription = rows[0];
    const dailyLimit = Number(subscription.daily_mah_limit) || 0;
    const consumed = Number(subscription.current_daily_mah_consumed) || 0;
    const borrowedToday = Number(subscription.borrowed_mah_today) || 0;
    const lastQuotaReset = subscription.last_quota_reset;

    // Check for new day to reset
    const now = new Date();
    const lastResetDate = lastQuotaReset ? new Date(lastQuotaReset) : null;
    const isNewDay = !lastResetDate ||
      lastResetDate.getDate() !== now.getDate() ||
      lastResetDate.getMonth() !== now.getMonth() ||
      lastResetDate.getFullYear() !== now.getFullYear();

    if (isNewDay && consumed > 0) {
      await pool.query(`
        UPDATE user_subscription
        SET current_daily_mah_consumed = 0,
            last_quota_reset = NOW(),
            borrowed_mah_today = 0
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      console.log(`Daily quota reset for user ${userId}. Previous consumption: ${consumed} mAh`);
      await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.SUBSCRIPTION, `Daily quota reset for user ${userId}`, userId);

      const dailyQuotaRemaining = Math.max(0, dailyLimit);
      const borrowedQuotaAvailable = 0;
      const availableQuota = dailyQuotaRemaining; // no borrowed yet

      return {
        canCharge: availableQuota > 0,
        reason: availableQuota > 0 ? 'Quota available' : 'Daily quota reached. Please purchase an extension.',
        availableQuota,
        totalUsed: 0,
        dailyLimit,
        borrowedToday: 0,
      };
    }

    // Normal calculation
    const dailyQuotaRemaining = Math.max(0, dailyLimit - consumed);
    const borrowedQuotaAvailable = consumed >= dailyLimit ? borrowedToday : 0;
    const availableQuota = dailyQuotaRemaining + borrowedQuotaAvailable;
    const canCharge = availableQuota > 0;

    return {
      canCharge,
      reason: canCharge ? 'Quota available' : 'Daily quota reached. Please purchase an extension.',
      availableQuota,
      totalUsed: consumed,
      dailyLimit,
      borrowedToday,
    };
  } catch (error) {
    console.error('Error checking user quota:', error);
    return {
      canCharge: false,
      reason: 'Error checking quota',
      availableQuota: 0,
      totalUsed: 0,
      dailyLimit: 0,
      borrowedToday: 0,
    };
  }
}

// ============= Subscription Plans (Admin) =============

function getAllPlans() {
  return pool.query('SELECT * FROM subscription_plans ORDER BY price ASC').then(res => res.rows);
}

function getPlanById(planId) {
  return pool.query(
    'SELECT * FROM subscription_plans WHERE plan_id = $1 AND is_active = true',
    [planId]
  ).then(res => res.rows[0]).then(plan => {
    if (!plan) throw new Error('Plan not found or inactive');
    return plan;
  });
}

// ============= User Subscription (User-facing) =============

function getUserSubscription(userId) {
  return pool.query(`
    SELECT 
      us.user_subscription_id,
      us.user_id,
      us.plan_id,
      us.start_date,
      us.end_date,
      us.is_active,
      us.is_active as status,
      us.current_daily_mah_consumed,
      us.borrowed_mah_today,
      us.borrowed_mah_pending,
      us.last_quota_reset,
      us.created_at,
      us.updated_at,
      sp.plan_name,
      sp.price::numeric as price,
      sp.daily_mah_limit,
      sp.duration_type,
      sp.duration_value,
      sp.description,
      sp.max_session_duration_hours,
      sp.fast_charging_access,
      sp.priority_access,
      sp.cooldown_percentage,
      sp.cooldown_time_hour,
      CASE 
        WHEN us.is_active = false THEN 'Discontinued'
        WHEN us.end_date <= NOW() THEN 'Expired'
        WHEN us.is_active = true AND us.end_date > NOW() THEN 'Active'
        ELSE 'Unknown'
      END as subscription_status,
      CASE sp.duration_type
        WHEN 'daily' THEN CASE WHEN sp.duration_value = 1 THEN '1 Day' ELSE sp.duration_value || ' Days' END
        WHEN 'weekly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Week' ELSE sp.duration_value || ' Weeks' END
        WHEN 'monthly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Month' ELSE sp.duration_value || ' Months' END
        WHEN 'quarterly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Quarter' ELSE sp.duration_value || ' Quarters' END
        WHEN 'yearly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Year' ELSE sp.duration_value || ' Years' END
        ELSE '1 Month'
      END as duration_display
    FROM user_subscription us
    JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    WHERE us.user_id = $1 AND us.is_active = true
    ORDER BY us.created_at DESC LIMIT 1
  `, [userId]).then(res => {
    const row = res.rows[0];
    if (row && typeof row.price === 'string') {
      row.price = parseFloat(row.price);
    }
    return row;
  });
}

function getSubscriptionHistory(userId) {
  return pool.query(`
    SELECT 
      us.user_subscription_id,
      us.user_id,
      us.plan_id,
      us.start_date,
      us.end_date,
      us.is_active,
      us.current_daily_mah_consumed,
      us.borrowed_mah_today,
      us.last_quota_reset,
      us.created_at,
      us.updated_at,
      sp.plan_name,
      sp.price::numeric as price,
      sp.daily_mah_limit,
      sp.duration_type,
      sp.duration_value,
      sp.description,
      CASE 
        WHEN us.is_active = false THEN 'Discontinued'
        WHEN us.end_date <= NOW() THEN 'Expired'
        WHEN us.is_active = true AND us.end_date > NOW() THEN 'Active'
        ELSE 'Unknown'
      END as subscription_status,
      CASE sp.duration_type
        WHEN 'daily' THEN CASE WHEN sp.duration_value = 1 THEN '1 Day' ELSE sp.duration_value || ' Days' END
        WHEN 'weekly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Week' ELSE sp.duration_value || ' Weeks' END
        WHEN 'monthly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Month' ELSE sp.duration_value || ' Months' END
        WHEN 'quarterly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Quarter' ELSE sp.duration_value || ' Quarters' END
        WHEN 'yearly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Year' ELSE sp.duration_value || ' Years' END
        ELSE '1 Month'
      END as duration_display
    FROM user_subscription us
    JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    WHERE us.user_id = $1
    ORDER BY us.created_at DESC
  `, [userId]).then(res => {
    // Ensure price is numeric in all rows
    const rows = res.rows;
    if (rows) {
      rows.forEach(row => {
        if (row && typeof row.price === 'string') {
          row.price = parseFloat(row.price);
        }
      });
    }
    return rows;
  });
}

async function cancelSubscription(userId) {
  const result = await pool.query(
    'SELECT user_subscription_id FROM user_subscription WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  if (result.rows.length === 0) {
    throw new Error('No active subscription found');
  }
  const subId = result.rows[0].user_subscription_id;
  await pool.query(
    'UPDATE user_subscription SET is_active = false, end_date = NOW() WHERE user_subscription_id = $1',
    [subId]
  );
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.SUBSCRIPTION, `User ${userId} cancelled their subscription`);
  return { cancelled: true };
}

function getUserUsage(userId) {
  return pool.query(`
    SELECT current_daily_mah_consumed, borrowed_mah_today, last_quota_reset
    FROM user_subscription
    WHERE user_id = $1 AND is_active = true
  `, [userId]).then(res => {
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      currentDailyMahConsumed: Number(row.current_daily_mah_consumed) || 0,
      borrowedMahToday: Number(row.borrowed_mah_today) || 0,
      lastQuotaReset: row.last_quota_reset,
    };
  });
}

// ============= Quota Extensions (Purchase) =============

function getQuotaPricing(extensionType = 'direct_purchase') {
  return pool.query(
    `SELECT id, extension_type, price_per_transaction, extension_amount_mah, is_active
     FROM quota_extension_pricing
     WHERE extension_type = $1 AND is_active = true`,
    [extensionType]
  ).then(res => {
    if (res.rows.length === 0) throw new Error('Quota extension pricing not found or inactive');
    return res.rows[0];
  });
}

function getAllQuotaPricing() {
  return pool.query(
    `SELECT * FROM quota_extension_pricing WHERE is_active = true ORDER BY price_per_transaction ASC`
  ).then(res => res.rows);
}

function updateQuotaPricing(id, fields) {
  const { extension_type, price_per_transaction, extension_amount_mah, is_active } = fields;
  return pool.query(
    `UPDATE quota_extension_pricing
     SET extension_type = $1, price_per_transaction = $2, extension_amount_mah = $3, is_active = $4
     WHERE id = $5`,
    [extension_type, price_per_transaction, extension_amount_mah, is_active, id]
  );
}

async function purchaseQuotaExtension(userId, extensionType) {
  const pricing = await getQuotaPricing(extensionType);
  const extensionAmountMah = pricing.extension_amount_mah;
  const price = pricing.price_per_transaction;

  // Get active subscription for this user
  const subResult = await pool.query(
    'SELECT user_subscription_id FROM user_subscription WHERE user_id = $1 AND is_active = true',
    [userId]
  );
  const subscriptionId = subResult.rows[0]?.user_subscription_id || null;

  const extensionId = require('uuid').v4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await pool.query(
    `INSERT INTO quota_extensions
     (id, user_id, subscription_id, purchased_amount_mah, total_cost, payment_status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6)`,
    [extensionId, userId, subscriptionId, extensionAmountMah, price, expiresAt.toISOString()]
  );

  // Immediately add to borrowed quota (will be used for charging)
  await pool.query(
    `UPDATE user_subscription
     SET borrowed_mah_today = COALESCE(borrowed_mah_today, 0) + $1
     WHERE user_id = $2 AND is_active = true`,
    [extensionAmountMah, userId]
  );

  await logSystemEvent(
    LOG_TYPES.INFO,
    LOG_SOURCES.SUBSCRIPTION,
    `User ${userId} purchased quota extension: ${extensionAmountMah} mAh for $${price}`
  );

  return {
    extensionId,
    addedQuota: extensionAmountMah,
    cost: price,
  };
}

function getExtensionStatus(extensionId) {
  return pool.query(
    `SELECT * FROM quota_extensions WHERE id = $1`,
    [extensionId]
  ).then(res => res.rows[0]);
}

function getAllExtensions() {
  return pool.query(`
    SELECT qe.*, u.fname, u.lname, us.plan_id
    FROM quota_extensions qe
    LEFT JOIN users u ON qe.user_id = u.user_id
    LEFT JOIN user_subscription us ON qe.subscription_id = us.user_subscription_id
    ORDER BY qe.created_at DESC
  `).then(res => res.rows);
}

async function confirmExtensionPayment(extensionId) {
  const result = await pool.query(
    `UPDATE quota_extensions
     SET payment_status = 'completed', paid_at = NOW()
     WHERE id = $1 AND payment_status = 'pending'
     RETURNING *`,
    [extensionId]
  );
  if (result.rows.length === 0) {
    throw new Error('Extension not found or already processed');
  }
  const ext = result.rows[0];
  await logSystemEvent(
    LOG_TYPES.INFO,
    LOG_SOURCES.SUBSCRIPTION,
    `Admin confirmed payment for quota extension ${extensionId} for user ${ext.user_id}`
  );
  return ext;
}

// ============= Admin: Fix Expired Subscriptions =============

async function fixExpiredSubscriptions() {
  const result = await pool.query(
    `UPDATE user_subscription
     SET is_active = false, end_date = NOW()
     WHERE is_active = true
       AND end_date IS NOT NULL
       AND end_date < NOW()`
  );
  await logSystemEvent(
    LOG_TYPES.INFO,
    LOG_SOURCES.SUBSCRIPTION,
    `Fixed ${result.rowCount} expired subscriptions`
  );
  return { fixed: result.rowCount };
}

// ============= Helpers =============

function getDurationDisplayText(durationType, durationValue) {
  switch (durationType) {
    case 'daily':
      return durationValue === 1 ? '1 Day' : `${durationValue} Days`;
    case 'weekly':
      return durationValue === 1 ? '1 Week' : `${durationValue} Weeks`;
    case 'monthly':
      return durationValue === 1 ? '1 Month' : `${durationValue} Months`;
    case 'quarterly':
      return durationValue === 1 ? '3 Months' : `${durationValue * 3} Months`;
    case 'yearly':
      return durationValue === 1 ? '1 Year' : `${durationValue} Years`;
    default:
      return '1 Month';
  }
}

function calculateNextBillingDate(startDate, durationType, durationValue) {
  const next = new Date(startDate);
  switch (durationType) {
    case 'daily':
      next.setDate(next.getDate() + durationValue);
      break;
    case 'weekly':
      next.setDate(next.getDate() + (durationValue * 7));
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + durationValue);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + (durationValue * 3));
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + durationValue);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

module.exports = {
  // Quota
  checkUserQuota,
  checkUserActiveSessions,

  // Plans
  getAllPlans,
  getPlanById,

  // User subscription
  getUserSubscription,
  getSubscriptionHistory,
  cancelSubscription,
  getUserUsage,

  // Quota extensions
  getQuotaPricing,
  getAllQuotaPricing,
  updateQuotaPricing,
  purchaseQuotaExtension,
  getExtensionStatus,
  getAllExtensions,
  confirmExtensionPayment,

  // Admin
  fixExpiredSubscriptions,

  // Utils
  getDurationDisplayText,
  calculateNextBillingDate,
};

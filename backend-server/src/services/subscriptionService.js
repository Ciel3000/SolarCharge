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
      'SELECT COUNT(*) as active_count FROM charging_session WHERE user_id = ? AND session_status = ?',
      [userId, SESSION_STATUS.ACTIVE]
    );
    return parseInt(result[0][0].active_count) || 0;
  } catch (error) {
    console.error('Error checking user active sessions:', error);
    return 0;
  }
}

// Quota validation using shared pool model
async function checkUserQuota(userId) {
  try {
    // Step 1 - Get total available quota from all active subscriptions
    const quotaRes = await pool.query(`
      SELECT COALESCE(SUM(sp.daily_mah_limit), 0) AS total_limit
      FROM user_subscription us
      JOIN subscription_plans sp ON us.plan_id = sp.plan_id
      WHERE us.user_id = ?
        AND us.is_active = true
        AND us.end_date > NOW()
    `, [userId]);

    // Step 2 - Get user consumption from user_usage table
    const usageRes = await pool.query(`
      SELECT total_consumed_mah, last_reset_at
      FROM user_usage
      WHERE user_id = ?
    `, [userId]);

    const totalLimit = Number(quotaRes[0][0]?.total_limit || 0);
    const totalConsumed = Number(usageRes[0][0]?.total_consumed_mah || 0);
    const remaining = Math.max(0, totalLimit - totalConsumed);
    const canCharge = totalConsumed < totalLimit;

    return {
      canCharge,
      reason: canCharge ? 'Quota available' : 'Daily quota reached. Please purchase an extension.',
      totalLimit,
      totalConsumed,
      remaining,
    };
  } catch (error) {
    console.error('Error checking user quota:', error);
    return {
      canCharge: false,
      reason: 'Error checking quota',
      totalLimit: 0,
      totalConsumed: 0,
      remaining: 0,
    };
  }
}

// ============= Subscription Plans (Admin) =============

function getAllPlans() {
  return pool.query('SELECT * FROM subscription_plans ORDER BY price ASC').then(res => res[0]);
}

function getPlanById(planId) {
  return pool.query(
    'SELECT * FROM subscription_plans WHERE plan_id = ? AND is_active = true',
    [planId]
  ).then(res => res[0][0]).then(plan => {
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
      us.created_at,
      us.updated_at,
      sp.plan_name,
      sp.price as price,
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
        WHEN 'daily' THEN CASE WHEN sp.duration_value = 1 THEN '1 Day' ELSE CONCAT(sp.duration_value, ' Days') END
        WHEN 'weekly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Week' ELSE CONCAT(sp.duration_value, ' Weeks') END
        WHEN 'monthly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Month' ELSE CONCAT(sp.duration_value, ' Months') END
        WHEN 'quarterly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Quarter' ELSE CONCAT(sp.duration_value, ' Quarters') END
        WHEN 'yearly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Year' ELSE CONCAT(sp.duration_value, ' Years') END
        ELSE '1 Month'
      END as duration_display
    FROM user_subscription us
    JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    WHERE us.user_id = ? AND us.is_active = true AND us.end_date > NOW()
    ORDER BY us.created_at DESC
  `, [userId]).then(async res => {
    const rows = res[0];
    
    // Ensure price is numeric in all rows
    if (rows) {
      rows.forEach(row => {
        if (row && typeof row.price === 'string') {
          row.price = parseFloat(row.price);
        }
      });
    }

    // Get user usage for aggregate
    const usageRes = await pool.query(`
      SELECT total_consumed_mah, last_reset_at
      FROM user_usage
      WHERE user_id = ?
    `, [userId]);
    
    const usageRow = usageRes[0][0];
    const aggregateDailyLimit = rows.reduce((s, r) => s + Number(r.daily_mah_limit || 0), 0);
    const totalConsumedMah = Number(usageRow?.total_consumed_mah || 0);

    return {
      primary: rows[0] || null,
      active_subscriptions: rows,
      aggregate_daily_limit: aggregateDailyLimit,
      total_consumed_mah: totalConsumedMah,
      last_reset_at: usageRow?.last_reset_at || null,
    };
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
      sp.price as price,
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
        WHEN 'daily' THEN CASE WHEN sp.duration_value = 1 THEN '1 Day' ELSE CONCAT(sp.duration_value, ' Days') END
        WHEN 'weekly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Week' ELSE CONCAT(sp.duration_value, ' Weeks') END
        WHEN 'monthly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Month' ELSE CONCAT(sp.duration_value, ' Months') END
        WHEN 'quarterly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Quarter' ELSE CONCAT(sp.duration_value, ' Quarters') END
        WHEN 'yearly' THEN CASE WHEN sp.duration_value = 1 THEN '1 Year' ELSE CONCAT(sp.duration_value, ' Years') END
        ELSE '1 Month'
      END as duration_display
    FROM user_subscription us
    JOIN subscription_plans sp ON us.plan_id = sp.plan_id
    WHERE us.user_id = ?
    ORDER BY us.created_at DESC
  `, [userId]).then(res => {
    // Ensure price is numeric in all rows
    const rows = res[0];
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

async function cancelSubscription(userId, subscriptionId = null) {
  let targetId;

  if (subscriptionId) {
    // Security: verify ownership
    const verify = await pool.query(
      `SELECT user_subscription_id FROM user_subscription
       WHERE user_subscription_id = ? AND user_id = ? AND is_active = true`,
      [subscriptionId, userId]
    );
    if (verify[0].length === 0)
      throw new Error('Subscription not found or does not belong to this user.');
    targetId = subscriptionId;
  } else {
    const recent = await pool.query(
      `SELECT user_subscription_id FROM user_subscription
       WHERE user_id = ? AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (recent[0].length === 0) throw new Error('No active subscription found.');
    targetId = recent[0][0].user_subscription_id;
  }

  const result = await pool.query(
    `UPDATE user_subscription
     SET is_active = false, end_date = NOW(), updated_at = NOW()
     WHERE user_subscription_id = ?`,
    [targetId]
  );
  await logSystemEvent(LOG_TYPES.INFO, LOG_SOURCES.SUBSCRIPTION, `User ${userId} cancelled subscription ${targetId}`);
  return result[0][0];
}

function getUserUsage(userId) {
  return pool.query(`
    SELECT total_consumed_mah, last_reset_at
    FROM user_usage
    WHERE user_id = ?
  `, [userId]).then(res => {
    if (res[0].length === 0) return null;
    const row = res[0][0];
    return {
      total_consumed_mah: Number(row.total_consumed_mah) || 0,
      last_reset_at: row.last_reset_at,
    };
  });
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
    `Fixed ${result.affectedRows} expired subscriptions`
  );
  return { fixed: result.affectedRows };
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

  // Admin
  fixExpiredSubscriptions,

  // Utils
  getDurationDisplayText,
  calculateNextBillingDate,
};

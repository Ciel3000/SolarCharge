// src/controllers/subscriptionController.js
// Handles subscription, quota, pricing endpoints, and user usage

const subscriptionService = require('../services/subscriptionService');
const chargingService = require('../services/chargingService');
const pool = require('../config/database');
const { supabaseAuthMiddleware } = require('../middleware/auth');
const { calculateNextBillingDate } = require('../services/subscriptionService');

// GET /api/subscription/plans - Admin only
async function getPlans(req, res, next) {
  try {
    // Admin middleware ensures only admins reach here
    const plans = await subscriptionService.getAllPlans();
    res.json(plans);
  } catch (err) {
    next(err);
  }
}

// GET /api/user/subscription - User's active subscription with billing history
async function getUserSubscription(req, res, next) {
  const { user_id } = req.user;
  try {
    const data = await subscriptionService.getUserSubscription(user_id);

    // Fetch recent billing history (last 5 payments)
    const billingHistoryResult = await pool.query(`
      SELECT
        id,
        amount,
        currency,
        created_at as date,
        status,
        paypal_order_id as transaction_id
      FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `, [user_id]);
    const billingHistory = billingHistoryResult[0];

    // Enrich primary subscription if active
    if (data.primary) {
      const sub = data.primary;
      // Build features array from plan fields
      const features = [];
      if (sub.daily_mah_limit) features.push(`${sub.daily_mah_limit} mAh daily limit`);
      if (sub.max_session_duration_hours) features.push(`${sub.max_session_duration_hours} hour max session`);
      if (sub.fast_charging_access) features.push('Fast Charging Access');
      if (sub.priority_access) features.push('Priority Access');
      if (sub.cooldown_percentage && sub.cooldown_time_hour) {
        features.push(`${sub.cooldown_percentage}% cooldown in ${sub.cooldown_time_hour}h`);
      }
      sub.features = features;

      // duration_display already computed by service
      // Compute next_billing_date
      if (sub.start_date) {
        sub.next_billing_date = calculateNextBillingDate(
          new Date(sub.start_date),
          sub.duration_type,
          sub.duration_value
        );
      }
    }

    res.json({
      subscription: data.primary,
      active_subscriptions: data.active_subscriptions || [],
      aggregate: {
        daily_limit: data.aggregate_daily_limit,
        total_consumed: data.total_consumed_mah,
        remaining: Math.max(0, data.aggregate_daily_limit - data.total_consumed_mah),
      },
      billing_history: billingHistory,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/user/subscription-history - User's subscription history
async function getSubscriptionHistory(req, res, next) {
  const { user_id } = req.user;
  try {
    const history = await subscriptionService.getSubscriptionHistory(user_id);
    res.json({ subscription_history: history });
  } catch (err) {
    next(err);
  }
}

// POST /api/subscription/cancel - Cancel user's subscription
async function cancelSubscription(req, res, next) {
  const { user_id } = req.user;
  const { subscription_id } = req.body;
  try {
    const result = await subscriptionService.cancelSubscription(user_id, subscription_id || null);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/user/usage - User's overall charging usage statistics
async function getUserUsage(req, res, next) {
  const { user_id } = req.user;
  try {
    const usage = await chargingService.getUserUsageStats(user_id);
    res.json(usage);
  } catch (err) {
    next(err);
  }
}

// GET /api/quota/pricing - Public extension pricing
async function getQuotaPricing(req, res, next) {
  try {
    // Quota extensions removed - return empty array
    res.json([]);
  } catch (err) {
    next(err);
  }
}

// GET /api/user/quota-status - User's quota status
async function getUserQuotaStatus(req, res, next) {
  const { user_id } = req.user;
  try {
    const quotaCheck = await subscriptionService.checkUserQuota(user_id);
    res.json(quotaCheck);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlans,
  getUserSubscription,
  getSubscriptionHistory,
  cancelSubscription,
  getUserUsage,
  getQuotaPricing,
  getUserQuotaStatus,
};
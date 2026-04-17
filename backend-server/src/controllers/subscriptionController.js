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
    const subscription = await subscriptionService.getUserSubscription(user_id);

    // Fetch recent billing history (last 5 payments)
    const billingHistoryResult = await pool.query(`
      SELECT
        payment_id as id,
        amount,
        currency,
        payment_date as date,
        payment_status as status,
        transaction_id
      FROM payment
      WHERE user_id = $1
      ORDER BY payment_date DESC
      LIMIT 5
    `, [user_id]);
    const billingHistory = billingHistoryResult.rows;

    // Enrich subscription if active
    if (subscription) {
      // Build features array from plan fields
      const features = [];
      if (subscription.daily_mah_limit) features.push(`${subscription.daily_mah_limit} mAh daily limit`);
      if (subscription.max_session_duration_hours) features.push(`${subscription.max_session_duration_hours} hour max session`);
      if (subscription.fast_charging_access) features.push('Fast Charging Access');
      if (subscription.priority_access) features.push('Priority Access');
      if (subscription.cooldown_percentage && subscription.cooldown_time_hour) {
        features.push(`${subscription.cooldown_percentage}% cooldown in ${subscription.cooldown_time_hour}h`);
      }
      subscription.features = features;

      // duration_display already computed by service
      // Compute next_billing_date
      if (subscription.start_date) {
        subscription.next_billing_date = calculateNextBillingDate(
          new Date(subscription.start_date),
          subscription.duration_type,
          subscription.duration_value
        );
      }
    }

    res.json({ subscription, billing_history: billingHistory });
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
  try {
    const result = await subscriptionService.cancelSubscription(user_id);
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
    const pricing = await subscriptionService.getAllQuotaPricing();
    res.json(pricing);
  } catch (err) {
    next(err);
  }
}

// POST /api/quota/purchase-extension - Buy quota extension
async function purchaseQuotaExtension(req, res, next) {
  const { user_id } = req.user;
  const { extensionType } = req.body;
  try {
    const result = await subscriptionService.purchaseQuotaExtension(user_id, extensionType || 'direct_purchase');
    res.json(result);
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

// GET /api/quota/extension-status/:extensionId - Check extension status
async function getExtensionStatus(req, res, next) {
  const { extensionId } = req.params;
  const { user_id } = req.user;
  try {
    const extension = await subscriptionService.getExtensionStatus(extensionId);
    if (!extension || extension.user_id !== user_id) {
      return res.status(404).json({ error: 'Extension not found' });
    }
    res.json(extension);
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
  purchaseQuotaExtension,
  getUserQuotaStatus,
  getExtensionStatus,
};

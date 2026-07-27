// src/controllers/subscriptionPlanController.js
// Subscription plans CRUD

const pool = require('../config/database');
const { supabaseAuthMiddleware, requireAdmin } = require('../middleware/auth');

// Get all active plans
async function getPlans(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Get all plans (admin)
async function getAllPlans(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM subscription_plans ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Create plan (admin)
async function createPlan(req, res, next) {
  try {
    const { plan_name, description, price, daily_mah_limit, max_session_duration_hours,
            fast_charging_access, priority_access, cooldown_percentage, cooldown_time_hour,
            duration_type, duration_value, paypal_link } = req.body;

    const plan_id = require('uuid').v4();
    const [result] = await pool.query(
      `INSERT INTO subscription_plans
       (plan_id, plan_name, description, price, daily_mah_limit, max_session_duration_hours,
        fast_charging_access, priority_access, cooldown_percentage, cooldown_time_hour,
        duration_type, duration_value, paypal_link, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true)`,
      [plan_id, plan_name, description, price, daily_mah_limit, max_session_duration_hours,
       fast_charging_access, priority_access, cooldown_percentage, cooldown_time_hour,
       duration_type, duration_value, paypal_link]
    );

    const [newPlan] = await pool.query('SELECT * FROM subscription_plans WHERE plan_id = ?', [plan_id]);
    res.status(201).json(newPlan[0]);
  } catch (err) {
    next(err);
  }
}

// Update plan (admin)
async function updatePlan(req, res, next) {
  try {
    const { planId } = req.params;
    const updates = req.body;

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(planId);

    await pool.query(`UPDATE subscription_plans SET ${setClause} WHERE plan_id = ?`, values);

    const [updated] = await pool.query('SELECT * FROM subscription_plans WHERE plan_id = ?', [planId]);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

// Delete plan (admin)
async function deletePlan(req, res, next) {
  try {
    const { planId } = req.params;
    await pool.query('DELETE FROM subscription_plans WHERE plan_id = ?', [planId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlans,
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
};

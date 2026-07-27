// src/routes/subscriptionPlans.js
// Subscription plans routes

const router = require('express').Router();
const planController = require('../controllers/subscriptionPlanController');
const { supabaseAuthMiddleware, requireAdmin } = require('../middleware/auth');

// Public
router.get('/', planController.getPlans);

// Admin
router.get('/all', supabaseAuthMiddleware, requireAdmin, planController.getAllPlans);
router.post('/', supabaseAuthMiddleware, requireAdmin, planController.createPlan);
router.put('/:planId', supabaseAuthMiddleware, requireAdmin, planController.updatePlan);
router.delete('/:planId', supabaseAuthMiddleware, requireAdmin, planController.deletePlan);

module.exports = router;

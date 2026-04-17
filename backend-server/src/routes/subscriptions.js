// src/routes/subscriptions.js
// Subscription management routes

const router = require('express').Router();
const { supabaseAuthMiddleware, requireAdmin } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Admin: get all subscription plans
router.get('/plans', supabaseAuthMiddleware, requireAdmin, subscriptionController.getPlans);

// User: cancel subscription
router.post('/cancel', supabaseAuthMiddleware, subscriptionController.cancelSubscription);

module.exports = router;
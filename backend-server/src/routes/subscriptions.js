// src/routes/subscriptions.js
// Subscription management routes

const router = require('express').Router();
const { supabaseAuthMiddleware } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// User: cancel subscription
router.post('/cancel', supabaseAuthMiddleware, subscriptionController.cancelSubscription);

module.exports = router;
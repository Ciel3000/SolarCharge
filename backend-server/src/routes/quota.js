// src/routes/quota.js
// Quota endpoints

const router = require('express').Router();
const { supabaseAuthMiddleware } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Public: get all pricing
router.get('/pricing', subscriptionController.getQuotaPricing);

// User: check own quota status
router.get('/user/quota-status', supabaseAuthMiddleware, subscriptionController.getUserQuotaStatus);

module.exports = router;

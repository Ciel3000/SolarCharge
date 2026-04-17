// src/routes/quota.js
// Quota extension endpoints

const router = require('express').Router();
const { supabaseAuthMiddleware } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptionController');

// Public: get all pricing
router.get('/pricing', subscriptionController.getQuotaPricing);

// User: purchase extension
router.post('/purchase-extension', supabaseAuthMiddleware, subscriptionController.purchaseQuotaExtension);

// User: check own quota status
router.get('/user/quota-status', supabaseAuthMiddleware, subscriptionController.getUserQuotaStatus);

// User: check extension status
router.get('/extension-status/:extensionId', supabaseAuthMiddleware, subscriptionController.getExtensionStatus);

module.exports = router;

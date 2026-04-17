// src/routes/sessions.js
// Session-related endpoints

const router = require('express').Router();
const sessionController = require('../controllers/sessionController');
const { supabaseAuthMiddleware } = require('../middleware/auth');

// Public: active sessions list (for frontend map/dashboard)
router.get('/active', sessionController.getActiveSessionsPublic);

// Auth required endpoints
router.get('/active/user', supabaseAuthMiddleware, sessionController.getUserActiveSessions);
router.get('/:sessionId/consumption', supabaseAuthMiddleware, sessionController.getSessionConsumption);

module.exports = router;

// src/routes/profile.js
// User profile routes

const router = require('express').Router();
const profileController = require('../controllers/profileController');
const { supabaseAuthMiddleware } = require('../middleware/auth');

router.use(supabaseAuthMiddleware);

router.get('/profile', profileController.getProfile);
router.put('/profile', profileController.updateProfile);

module.exports = router;

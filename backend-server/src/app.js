// src/app.js
// Express application setup

const express = require('express');
const cors = require('cors');
const path = require('path');

// Config
const { allowedOrigins, isOriginAllowed } = require('./config/cors');

// Middleware
const { supabaseAuthMiddleware, requireAdmin } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Route modules
const devicesRouter = require('./routes/devices');
const stationsRouter = require('./routes/stations');
const sessionsRouter = require('./routes/sessions');
const usersRouter = require('./routes/users');
const subscriptionsRouter = require('./routes/subscriptions');
const quotaRouter = require('./routes/quota');
const adminRouter = require('./routes/admin');
const paymentsRouter = require('./routes/payments');
const userController = require('./controllers/userController');

function createApp() {
  const app = express();

  // CORS setup
  app.use(cors({
    origin: isOriginAllowed,
    credentials: true,
  }));
  app.use(express.json());

  // CORS preflight handler
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin;
      const isAllowed = !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.some(o => o instanceof RegExp && o.test(origin));
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).send();
      }
    }
    next();
  });

   // Public routes
   app.get('/', (req, res) => res.send('SolarCharge Backend is running!'));
   app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
   app.get('/api/me', supabaseAuthMiddleware, userController.getMe);
   
   // Config routes
   const { CONFIG } = require('./utils/constants');
   app.get('/api/config/slot-limits', (req, res) => {
     res.json({ premiumUserMaxActiveSlots: CONFIG.PREMIUM_USER_MAX_ACTIVE_SLOTS });
   });

   // API routes
   app.use('/api/devices', devicesRouter);
   app.use('/api/stations', stationsRouter);
   app.use('/api/sessions', sessionsRouter);
   app.use('/api/user', usersRouter);
   app.use('/api/subscription', subscriptionsRouter);
   app.use('/api/quota', quotaRouter);
   app.use('/api/admin', supabaseAuthMiddleware, requireAdmin, adminRouter);
   app.use('/api/payment', paymentsRouter);

  // Debug endpoint (dev only)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/env', (req, res) => {
      res.json({
        SUPABASE_JWKS_URL: process.env.SUPABASE_JWKS_URL || 'NOT SET',
        SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ? 'SET' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
      });
    });
  }

  // 404
  app.use(notFound);

  // Error handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

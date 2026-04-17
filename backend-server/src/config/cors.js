// src/config/cors.js
// CORS allowed origins configuration

const allowedOrigins = [
  'http://localhost:3000',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
  /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+$/,
  'https://solar-charge-frontend.onrender.com',
];

function isOriginAllowed(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  const isAllowed = allowedOrigins.some((allowedOrigin) => {
    if (typeof allowedOrigin === 'string') return allowedOrigin === origin;
    if (allowedOrigin instanceof RegExp) return allowedOrigin.test(origin);
    return false;
  });
  if (isAllowed) {
    callback(null, true);
  } else {
    console.warn(`CORS: Blocking request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'), false);
  }
}

module.exports = { allowedOrigins, isOriginAllowed };

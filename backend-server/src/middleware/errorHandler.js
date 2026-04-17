// src/middleware/errorHandler.js
// Central error handling

function notFound(req, res, next) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = { notFound, errorHandler };

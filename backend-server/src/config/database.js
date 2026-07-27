// src/config/database.js
// MySQL connection pool

const mysql = require('mysql2/promise');

function createPool() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'solar_charge';
  const port = process.env.DB_PORT || 3306;

  return mysql.createPool({
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
}

const pool = createPool();

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('Connected to local MySQL database');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

module.exports = pool;

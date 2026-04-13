// backend-server/pool.js
// Export the pool for use in route files

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function resolveDatabaseUrl() {
    const direct = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
    if (direct) return direct;
    const host = process.env.DB_HOST;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    if (!host || !user || password === undefined || password === '') {
        return undefined;
    }
    const port = process.env.DB_PORT || 5432;
    const name = process.env.DB_NAME || 'postgres';
    const enc = encodeURIComponent;
    return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(name)}`;
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
    console.warn('WARNING: Set DATABASE_URL or DB_HOST + DB_USER + DB_PASSWORD in backend-server/.env');
}

const dbPool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
});

module.exports = dbPool;

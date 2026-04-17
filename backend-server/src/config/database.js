// src/config/database.js
// PostgreSQL connection pool

const { Pool } = require('pg');

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

let supabasePoolerTenantHintShown = false;
function warnSupabasePoolerMismatchOnce(err) {
  const msg = err && err.message ? String(err.message) : '';
  if (supabasePoolerTenantHintShown || !msg.includes('Tenant or user not found')) return;
  supabasePoolerTenantHintShown = true;
  console.error(`
[Database] Supabase pooler: "Tenant or user not found"
Your connection username must be postgres.<project_ref> where <project_ref> is the ID in your Supabase URL.
Example: https://abrrhepysnsqihmiivzv.supabase.co  →  user postgres.abrrhepysnsqihmiivzv (not an old project ref).
Fix: Supabase Dashboard → Project Settings → Database → copy "Connection string" (URI).
Use the password for that project. Database name is usually "postgres" unless you created another DB.
`);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  warnSupabasePoolerMismatchOnce(err);
  console.error('Unexpected database pool error:', err);
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    warnSupabasePoolerMismatchOnce(err);
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to Supabase PostgreSQL database');
  }
});

module.exports = pool;

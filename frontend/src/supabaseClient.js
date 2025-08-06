// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// *** ABSOLUTELY ESSENTIAL DEBUG LOGS - DO NOT REMOVE ***
console.log('--- SUPABASE CLIENT DEBUG START ---');
console.log('Current directory (from process.cwd if available):', typeof process !== 'undefined' && process.cwd ? process.cwd() : 'N/A');
console.log('Attempting to read environment variables...');
console.log('Full process.env object:', typeof process !== 'undefined' && process.env ? process.env : 'process.env is undefined/not accessible');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log('Value of REACT_APP_SUPABASE_URL (read from env):', supabaseUrl);
console.log('Value of REACT_APP_SUPABASE_ANON_KEY (read from env, first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'N/A');
console.log('--- SUPABASE CLIENT DEBUG END ---');
// ******************************************************

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Supabase URL or Anon Key is missing. Check .env in root and ensure REACT_APP_ prefix.');
  // Do NOT throw an error here for now, so we can see all logs
  // throw new Error('Supabase credentials are not set.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('Supabase client creation attempted.');
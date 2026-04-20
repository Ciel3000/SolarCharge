// =============================================================================
// SUPABASE CLIENT CONFIGURATION
// =============================================================================
// This module creates the Supabase клиент (client) for connecting to the backend database.
// It uses environment variables for API credentials stored in the .env file.

import { createClient } from '@supabase/supabase-js';

// Read credentials from environment variables
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Validate that required credentials are present
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  console.error('Required: REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
  throw new Error('Supabase credentials are not set. Please check your .env file.');
}

// Create and export the Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { createClient } from '@supabase/supabase-js';

// Supabase Project URL and Public Key (anon key)
// IMPORTANT: Replace these with your actual Supabase project URL and anon key.
// For production, these should be loaded from environment variables.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://bhiitpltxlcgefugftre.supabase.co'; // e.g., 'https://abcde12345.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWl0cGx0eGxjZ2VmdWdmdHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0MTU3MjIsImV4cCI6MjA2Njk5MTcyMn0.FtpPRGIP5gXIIo84gyB-DJq2npGxrEDmvd2mEPvmxzo'; // e.g., 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// Create a single Supabase client for your application
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('Supabase client initialized.');
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Anon Key (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'N/A');

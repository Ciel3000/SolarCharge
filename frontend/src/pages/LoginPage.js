import React, { useState } from 'react';
import { supabase } from '../supabaseClient'; // Import Supabase client

function LoginPage({ navigateTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
      setMessage('Signed in successfully!');
      console.log('Sign in data:', data);
      // App.js's onAuthStateChange listener will handle navigation to landing page
    } catch (error) {
      setMessage(`Sign in error: ${error.message}`);
      console.error('Sign in error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-4">
          Login to SolarCharge
        </h1>
        {message && (
          <p className="mb-4 p-2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300">
            {message}
          </p>
        )}
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Logging In...' : 'Sign In'}
          </button>
        </form>
        <p className="mt-4 text-gray-600">
          Don't have an account?{' '}
          <button
            onClick={() => navigateTo('signup')}
            className="text-blue-600 hover:underline font-semibold"
          >
            Sign Up
          </button>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Add React Router hooks
import { supabase } from '../supabaseClient'; // Import Supabase client
import { useAuth } from '../contexts/AuthContext'; // Import useAuth

function SignUpPage({ navigateTo }) {
  const { session, isAdmin } = useAuth(); // Get auth state
  const location = useLocation(); // Get location object
  const navigate = useNavigate(); // Get navigate function
  
  // Pre-fill email if passed through navigation state
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(location.state?.message || '');

  // Redirect if user is already logged in
  useEffect(() => {
    if (session) {
      // User is already logged in, redirect them
      const targetPath = isAdmin ? '/admin/dashboard' : '/home';
      navigate(targetPath, { replace: true });
    }
  }, [session, isAdmin, navigate]);

  // Check if user was redirected here for a specific reason
  const redirectFrom = location.state?.from;
  const referralCode = location.state?.referralCode;

  useEffect(() => {
    // Show different messages based on how user arrived
    if (location.state?.reason === 'subscription_required') {
      setMessage('Please create an account to access our charging stations.');
    } else if (referralCode) {
      setMessage(`Welcome! You've been referred to SolarCharge. Use code: ${referralCode}`);
    }
  }, [location.state, referralCode]);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            referral_code: referralCode || null
          }
        }
      });

      if (error) {
        throw error;
      }
      setMessage('Sign up successful! Check your email for a confirmation link.');
      console.log('Sign up data:', data);
      
      // Redirect to intended page after signup if specified
      if (redirectFrom) {
        setTimeout(() => navigate(redirectFrom, { replace: true }), 2000);
      }
      // App.js's onAuthStateChange listener will handle navigation to landing page
    } catch (error) {
      setMessage(`Sign up error: ${error.message}`);
      console.error('Sign up error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-teal-600 mb-4">
          Sign Up for SolarCharge
        </h1>
        {message && (
          <p className="mb-4 p-2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300">
            {message}
          </p>
        )}
        <form onSubmit={handleSignUp} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
            required
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Signing Up...' : 'Sign Up'}
          </button>
        </form>
        <p className="mt-4 text-gray-600">
          Already have an account?{' '}
          <button
            onClick={() => navigateTo('login')}
            className="text-green-600 hover:underline font-semibold"
          >
            Login
          </button>
        </p>
      </div>
    </div>
  );
}

export default SignUpPage;
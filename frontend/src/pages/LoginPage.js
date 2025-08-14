// frontend/src/pages/LoginPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Add React Router hooks
import { supabase } from '../supabaseClient'; // Import Supabase client
import { useAuth } from '../contexts/AuthContext'; // Import useAuth

// Add the 'message' prop here
function LoginPage({ navigateTo, message }) {
  const { session, isAdmin } = useAuth(); // Get auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const location = useLocation(); // Get location object
  const navigate = useNavigate(); // Get navigate function
  
  // Initialize internal message state with the prop message or location state message
  const [displayMessage, setDisplayMessage] = useState(
    message || location.state?.message || ''
  );

  // Check if user was redirected here from a protected route
  const redirectFrom = location.state?.from;
  const redirectReason = location.state?.reason;

  // Redirect if user is already logged in
  useEffect(() => {
    if (session) {
      // User is already logged in, redirect them
      const targetPath = isAdmin ? '/admin/dashboard' : '/home';
      navigate(targetPath, { replace: true });
    }
  }, [session, isAdmin, navigate]);

  // Update the displayed message if the prop changes (e.g., from App.js redirect)
  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
    } else if (location.state?.message) {
      setDisplayMessage(location.state.message);
    } else if (redirectReason) {
      // Show appropriate message based on redirect reason
      switch (redirectReason) {
        case 'unauthorized':
          setDisplayMessage('Please log in to access this page.');
          break;
        case 'session_expired':
          setDisplayMessage('Your session has expired. Please log in again.');
          break;
        case 'admin_required':
          setDisplayMessage('Administrator privileges required.');
          break;
        default:
          setDisplayMessage('Please log in to continue.');
      }
    }
  }, [message, location.state]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setDisplayMessage(''); // Clear previous messages on new sign-in attempt
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
      setDisplayMessage('Signed in successfully!');
      console.log('Sign in data:', data);
      
      // Redirect to the intended page if there was one, otherwise let App.js handle navigation
      if (redirectFrom) {
        navigate(redirectFrom, { replace: true });
      }
      // App.js's onAuthStateChange listener will handle navigation if no redirect
    } catch (error) {
      setDisplayMessage(`Sign in error: ${error.message}`); // Set error message
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
        {displayMessage && ( // <-- Display messages from internal state
          <p className="mb-4 p-2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300">
            {displayMessage}
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
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              tabIndex="-1"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
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
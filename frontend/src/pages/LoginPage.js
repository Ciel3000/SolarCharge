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
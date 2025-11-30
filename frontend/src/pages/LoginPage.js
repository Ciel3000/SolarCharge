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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Animated Background Orbs with brand colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Sun-colored orb */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        {/* Lightning-colored orb */}
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        {/* Solar panel colored accent */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
      </div>

      {/* Glass Card */}
      <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden max-w-md w-full p-8 sm:p-10 text-center animate-fade-in" style={{ 
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
      }}>
        {/* Shimmer effect overlay */}
        <div className="absolute inset-0 opacity-30" style={{
          background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
          animation: 'shimmer 3s ease-in-out infinite'
        }}></div>
        
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center justify-center mb-6 animate-fade-in-down">
            <div className="relative">
              <img 
                src="/img/solarchargelogo.png" 
                alt="SolarCharge Logo" 
                className="h-20 md:h-24 w-auto drop-shadow-2xl animate-logo-float"
              />
              {/* Glow effect */}
              <div className="absolute inset-0 blur-xl opacity-50 animate-pulse-slow" style={{
                background: 'radial-gradient(circle, rgba(249, 210, 23, 0.4) 0%, transparent 70%)'
              }}></div>
            </div>
          </div>
          
          {/* Heading with gradient */}
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6 animate-fade-in-down delay-200" style={{
            background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 40px rgba(56, 182, 255, 0.3)'
          }}>
            Login to SolarCharge
          </h1>
          
          {displayMessage && (
            <div className="mb-6 p-3 rounded-xl backdrop-blur-md animate-fade-in-down delay-300" style={{
              background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
              border: '1px solid rgba(249, 210, 23, 0.3)',
              color: '#000b3d'
            }}>
              {displayMessage}
            </div>
          )}
          
          <form onSubmit={handleSignIn} className="flex flex-col gap-4 animate-fade-in-up delay-400">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="p-4 rounded-xl backdrop-blur-md border border-white/30 focus:outline-none focus:ring-2 transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                color: '#000b3d',
                boxShadow: '0 4px 16px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#38b6ff';
                e.target.style.boxShadow = '0 4px 16px 0 rgba(56, 182, 255, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.target.style.boxShadow = '0 4px 16px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)';
              }}
              required
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="p-4 pr-12 rounded-xl backdrop-blur-md border border-white/30 focus:outline-none focus:ring-2 w-full transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                  color: '#000b3d',
                  boxShadow: '0 4px 16px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#38b6ff';
                  e.target.style.boxShadow = '0 4px 16px 0 rgba(56, 182, 255, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.target.style.boxShadow = '0 4px 16px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)';
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors duration-200 focus:outline-none"
                style={{ color: '#000b3d', opacity: 0.7 }}
                onMouseEnter={(e) => e.target.style.opacity = '1'}
                onMouseLeave={(e) => e.target.style.opacity = '0.7'}
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
              className="group relative px-8 py-4 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                focusRingColor: 'rgba(56, 182, 255, 0.5)'
              }}
              disabled={loading}
            >
              <span className="relative z-10 flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {loading ? 'Logging In...' : 'Sign In'}
              </span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
              }}></div>
            </button>
          </form>
          
          <p className="mt-6 text-base animate-fade-in-up delay-500" style={{ color: '#000b3d', opacity: 0.8 }}>
            Don't have an account?{' '}
            <button
              onClick={() => navigateTo('signup')}
              className="font-semibold transition-all duration-200 hover:scale-105"
              style={{ color: '#38b6ff' }}
              onMouseEnter={(e) => e.target.style.color = '#f9d217'}
              onMouseLeave={(e) => e.target.style.color = '#38b6ff'}
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
// frontend/src/pages/ResetPasswordPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function ResetPasswordPage({ navigateTo }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isValidToken, setIsValidToken] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setIsValidToken(false);
          return;
        }

        if (session) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setIsValidToken(false);
      }
    };

    checkSession();
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!password) {
      setError('Please enter a new password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        throw updateError;
      }

      setMessage('Password updated successfully! Redirecting to login...');
      
      setTimeout(() => {
        navigateTo('login', { message: 'Password updated successfully. Please log in with your new password.' });
      }, 2000);
      
    } catch (error) {
      setError(`Error: ${error.message}`);
      console.error('Password update error:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        </div>

        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden max-w-md w-full p-8 sm:p-10 text-center animate-fade-in" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="relative z-10">
            <div className="text-6xl mb-4 animate-logo-float">⚡</div>
            <h1 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>
              Invalid Reset Link
            </h1>
            <p className="mb-6" style={{ color: '#000b3d', opacity: 0.7 }}>
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <button
              onClick={() => navigateTo('forgot-password')}
              className="group relative px-8 py-4 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none"
              style={{
                background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              }}
            >
              Request New Link
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4 animate-fade-in-down delay-200" style={{
            background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 40px rgba(56, 182, 255, 0.3)'
          }}>
            Set New Password
          </h1>

          <p className="mb-6 animate-fade-in-down delay-300" style={{ color: '#000b3d', opacity: 0.8 }}>
            Enter your new password below.
          </p>
          
          {message && (
            <div className="mb-6 p-3 rounded-xl backdrop-blur-md animate-fade-in-down delay-300" style={{
              background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
              border: '1px solid rgba(56, 182, 255, 0.3)',
              color: '#000b3d'
            }}>
              {message}
            </div>
          )}
          
          {error && (
            <div className="mb-6 p-3 rounded-xl backdrop-blur-md animate-fade-in-down delay-300" style={{
              background: 'linear-gradient(135deg, rgba(255, 100, 100, 0.2) 0%, rgba(255, 100, 100, 0.1) 100%)',
              border: '1px solid rgba(255, 100, 100, 0.3)',
              color: '#cc0000'
            }}>
              {error}
            </div>
          )}
          
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4 animate-fade-in-up delay-400">
            <input
              type="password"
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                {loading ? 'Updating...' : 'Update Password'}
              </span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
              }}></div>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
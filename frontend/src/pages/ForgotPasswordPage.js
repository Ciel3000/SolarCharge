// frontend/src/pages/ForgotPasswordPage.js
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function ForgotPasswordPage({ navigateTo }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setMessage('Password reset email sent! Check your inbox for further instructions.');
    } catch (error) {
      setError(`Error: ${error.message}`);
      console.error('Password reset error:', error.message);
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
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4 animate-fade-in-down delay-200" style={{
            background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 40px rgba(56, 182, 255, 0.3)'
          }}>
            Reset Your Password
          </h1>

          <p className="mb-6 animate-fade-in-down delay-300" style={{ color: '#000b3d', opacity: 0.8 }}>
            Enter your email address and we'll send you a link to reset your password.
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
                  <path d="M10 2C5.582 2 2 5.582 2 10s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 14c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/>
                  <path d="M10 5v5l4 2-1 1-3-3V5h1z"/>
                </svg>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
              }}></div>
            </button>
          </form>
          
          <p className="mt-6 text-base animate-fade-in-up delay-500" style={{ color: '#000b3d', opacity: 0.8 }}>
            Remember your password?{' '}
            <button
              onClick={() => navigateTo('login')}
              className="font-semibold transition-all duration-200 hover:scale-105"
              style={{ color: '#38b6ff' }}
              onMouseEnter={(e) => e.target.style.color = '#f9d217'}
              onMouseLeave={(e) => e.target.style.color = '#38b6ff'}
            >
              Back to Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
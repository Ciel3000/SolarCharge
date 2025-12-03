// frontend/src/components/Navigation.js
import React, { useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Import Link, useLocation, useNavigate
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

// Remove currentPage from props as we'll use useLocation().pathname
function Navigation({ navigateTo, handleSignOut }) {
  const { session, user, isAdmin, isLoading, subscription } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation(); // Get current location object
  const navigate = useNavigate(); // Get navigate function from react-router-dom

  // Helper function for scroll-to-section.
  const scrollToSection = useCallback((sectionId) => {
    setIsMenuOpen(false); // Close mobile menu immediately

    if (location.pathname !== '/landing') {
      // If not on the landing page, navigate there first, passing scroll target in state
      navigate('/landing', { state: { scrollTo: sectionId } });
    } else {
      // Already on landing page, just scroll
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [navigate, location.pathname]); // Dependencies for useCallback

  // Helper function to check if a route is active (for better visual feedback)
  const isActiveRoute = useCallback((routePath) => {
    if (routePath === '/home' && location.pathname === '/') return false; // Don't highlight home for root
    return location.pathname === routePath || location.pathname.startsWith(routePath + '/');
  }, [location.pathname]);

  // Define navigation links based on user's authentication and subscription status
  const getNavLinks = useCallback(() => {
    const links = [];

    if (session) {
      // Admin links (only if isAdmin is true)
      if (isAdmin) {
        links.push({ name: 'Dashboard', path: '/admin/dashboard', type: 'internal', admin: true });
        links.push({ name: 'Users', path: '/admin/users', type: 'internal', admin: true });
        links.push({ name: 'Plans', path: '/admin/plans', type: 'internal', admin: true });
        links.push({ name: 'Stations', path: '/admin/stations', type: 'internal', admin: true });
        links.push({ name: 'Sessions', path: '/admin/sessions', type: 'internal', admin: true });
        links.push({ name: 'Revenue', path: '/admin/revenue', type: 'internal', admin: true });
        links.push({ name: 'System', path: '/admin/system-status', type: 'internal', admin: true });
        links.push({ name: 'Logs', path: '/admin/logs', type: 'internal', admin: true });
        links.push({ name: 'Quota Pricing', path: '/admin/quota-pricing', type: 'internal', admin: true });
      } else {
        // Regular user links (not admin)
        links.push({ name: 'Home', path: '/home', type: 'internal' });
        
        if (subscription) {
          // Links for subscribed users
          links.push({ name: 'Stations', path: '/stations', type: 'internal' });
          links.push({ name: 'Usage', path: '/usage', type: 'internal' });
          links.push({ name: 'Subscription', path: '/subscription', type: 'internal' });
          links.push({ name: 'Profile', path: '/profile', type: 'internal' });
        } else {
          // Links for non-subscribed users
          links.push({ name: 'Stations', path: '/stations', type: 'internal' });
          links.push({ name: 'Subscription', path: '/subscription', type: 'internal' });
          links.push({ name: 'Profile', path: '/profile', type: 'internal' });
        }
      }
    } else {
      // Public/unauthenticated user links (for landing page sections)
      links.push({ name: 'Home', path: 'hero', type: 'scroll' });
      links.push({ name: 'Why Choose Us', path: 'features', type: 'scroll' });
      links.push({ name: 'Stations', path: 'stations', type: 'scroll' });
    }

    return links;
  }, [session, isAdmin, subscription]); // Dependencies for useCallback

  const navLinks = getNavLinks();

  // Check if we're on login or signup page to highlight the opposite button
  const isOnLoginPage = location.pathname === '/login';
  const isOnSignupPage = location.pathname === '/signup';
  const isOnLandingPage = location.pathname === '/landing' || location.pathname === '/';

  // Only show loading during initial app load, not for tab switches or minor updates
  if (isLoading && !session) {
    return (
      <nav 
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-white/30 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img 
              src="/img/solarchargelogo.png" 
              alt="SolarCharge Logo" 
              className="h-10 w-auto drop-shadow-lg"
            />
            <span className="text-xl font-bold" style={{ color: '#000b3d' }}>SolarCharge</span>
          </div>
          <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>Loading...</div>
        </div>
      </nav>
    );
  }

  return (
    <nav 
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-white/30 shadow-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            {/* Logo now uses Link to navigate to the appropriate starting page */}
            <Link
              to={session ? (isAdmin ? "/admin/dashboard" : "/home") : "/landing"}
              className="flex items-center space-x-2 focus:outline-none hover:opacity-80 transition-opacity"
            >
              <img 
                src="/img/solarchargelogo.png" 
                alt="SolarCharge Logo" 
                className="h-10 w-auto drop-shadow-lg"
              />
              <span className="text-xl font-bold" style={{ color: '#000b3d' }}>SolarCharge</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              link.type === 'scroll' ? (
                // Scroll links remain buttons
                <button
                  key={link.path}
                  onClick={() => scrollToSection(link.path)}
                  className="font-medium transition-all duration-200 hover:scale-105"
                  style={{ color: '#000b3d' }}
                  onMouseEnter={(e) => e.target.style.color = '#38b6ff'}
                  onMouseLeave={(e) => e.target.style.color = '#000b3d'}
                >
                  {link.name}
                </button>
              ) : (
                // Internal links use Link component
                <Link
                  key={link.path}
                  to={link.path}
                  className={`font-medium transition-all duration-200 hover:scale-105
                             ${isActiveRoute(link.path) ? 'border-b-2' : ''}`}
                  style={{ 
                    color: isActiveRoute(link.path) ? '#38b6ff' : '#000b3d',
                    borderColor: isActiveRoute(link.path) ? '#38b6ff' : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveRoute(link.path)) {
                      e.target.style.color = '#38b6ff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveRoute(link.path)) {
                      e.target.style.color = '#000b3d';
                    }
                  }}
                >
                  {link.name}
                </Link>
              )
            ))}

            {!session ? (
              <div className="flex items-center space-x-4">
                {/* Login Button - transitions between text and highlighted */}
                <button
                  onClick={() => { navigateTo('login'); setIsMenuOpen(false); }}
                  className={`transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none ${
                    isOnSignupPage || isOnLandingPage
                      ? 'group relative px-6 py-2 rounded-xl font-bold text-white overflow-visible focus:ring-4 focus:ring-opacity-50' 
                      : 'font-medium'
                  }`}
                  style={isOnSignupPage || isOnLandingPage ? {
                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    focusRingColor: 'rgba(56, 182, 255, 0.5)',
                    outline: '2px solid rgba(56, 182, 255, 0.5)',
                    outlineOffset: '2px'
                  } : {
                    color: '#000b3d',
                    border: '2px solid rgba(56, 182, 255, 0.3)',
                    borderRadius: '0.75rem',
                    padding: '0.5rem 1.5rem'
                  }}
                  onMouseDown={(e) => {
                    if (isOnSignupPage || isOnLandingPage) {
                      e.target.style.outline = '3px solid rgba(56, 182, 255, 0.8)';
                    } else {
                      e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                      e.target.style.outlineOffset = '2px';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (isOnSignupPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isOnSignupPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                    if (!isOnSignupPage && !isOnLandingPage) {
                      e.target.style.color = '#000b3d';
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isOnSignupPage && !isOnLandingPage) {
                      e.target.style.color = '#38b6ff';
                    }
                  }}
                  onFocus={(e) => {
                    if (isOnSignupPage || isOnLandingPage) {
                      e.target.style.outline = '3px solid rgba(56, 182, 255, 0.8)';
                    } else {
                      e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                      e.target.style.outlineOffset = '2px';
                    }
                  }}
                  onBlur={(e) => {
                    if (isOnSignupPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                  }}
                >
                  {isOnSignupPage || isOnLandingPage ? (
                    <>
                      <span className="relative z-10">Login</span>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                      }}></div>
                    </>
                  ) : (
                    'Login'
                  )}
                </button>
                
                {/* Sign Up Button - transitions between text and highlighted */}
                <button
                  onClick={() => { navigateTo('signup'); setIsMenuOpen(false); }}
                  className={`transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none ${
                    isOnLoginPage || isOnLandingPage
                      ? 'group relative px-6 py-2 rounded-xl font-bold text-white overflow-visible focus:ring-4 focus:ring-opacity-50' 
                      : 'font-medium'
                  }`}
                  style={isOnLoginPage || isOnLandingPage ? {
                    background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                    boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    focusRingColor: 'rgba(249, 210, 23, 0.5)',
                    outline: '2px solid rgba(249, 210, 23, 0.5)',
                    outlineOffset: '2px'
                  } : {
                    color: '#000b3d'
                  }}
                  onMouseDown={(e) => {
                    if (isOnLoginPage || isOnLandingPage) {
                      e.target.style.outline = '3px solid rgba(249, 210, 23, 0.8)';
                    } else {
                      e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                      e.target.style.outlineOffset = '2px';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (isOnLoginPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isOnLoginPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                    if (!isOnLoginPage && !isOnLandingPage) {
                      e.target.style.color = '#000b3d';
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isOnLoginPage && !isOnLandingPage) {
                      e.target.style.color = '#38b6ff';
                    }
                  }}
                  onFocus={(e) => {
                    if (isOnLoginPage || isOnLandingPage) {
                      e.target.style.outline = '3px solid rgba(249, 210, 23, 0.8)';
                    } else {
                      e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                      e.target.style.outlineOffset = '2px';
                    }
                  }}
                  onBlur={(e) => {
                    if (isOnLoginPage || isOnLandingPage) {
                      e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                    } else {
                      e.target.style.outline = '';
                      e.target.style.outlineOffset = '';
                    }
                  }}
                >
                  {isOnLoginPage || isOnLandingPage ? (
                    <>
                      <span className="relative z-10">Sign Up</span>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(249, 210, 23, 0.3) 100%)'
                      }}></div>
                    </>
                  ) : (
                    'Sign Up'
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <NotificationBell />
                <button
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Sign out clicked!', { handleSignOut: !!handleSignOut });
                    if (handleSignOut) {
                      handleSignOut(); 
                    }
                    setIsMenuOpen(false); 
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-white transition-all duration-300 hover:scale-105 cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)',
                    boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    pointerEvents: 'auto'
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Mobile Navigation Controls */}
          <div className="md:hidden flex items-center space-x-2">
            {/* Notification Bell for Mobile */}
            {session && <NotificationBell />}
            
            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="focus:outline-none transition-colors duration-200"
              style={{ color: '#000b3d' }}
              onMouseEnter={(e) => e.target.style.color = '#38b6ff'}
              onMouseLeave={(e) => e.target.style.color = '#000b3d'}
              aria-label="Toggle navigation"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div 
              className="px-2 pt-2 pb-3 space-y-1 backdrop-blur-xl rounded-b-2xl shadow-xl border border-white/30"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}
            >
              {navLinks.map((link) => (
                link.type === 'scroll' ? (
                  <button
                    key={link.path}
                    onClick={() => scrollToSection(link.path)}
                    className="block w-full text-left px-3 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
                    style={{ 
                      color: '#000b3d',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.color = '#38b6ff';
                      e.target.style.background = 'rgba(56, 182, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.color = '#000b3d';
                      e.target.style.background = 'transparent';
                    }}
                  >
                    {link.name}
                  </button>
                ) : (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsMenuOpen(false)} // Close menu after selection
                    className="block w-full text-left px-3 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105"
                    style={{ 
                      color: isActiveRoute(link.path) ? '#38b6ff' : '#000b3d',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActiveRoute(link.path)) {
                        e.target.style.color = '#38b6ff';
                        e.target.style.background = 'rgba(56, 182, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActiveRoute(link.path)) {
                        e.target.style.color = '#000b3d';
                        e.target.style.background = 'transparent';
                      }
                    }}
                  >
                    {link.name}
                  </Link>
                )
              ))}

              {!session ? (
                <>
                  {/* Login Button - transitions between text and highlighted */}
                  <button
                    onClick={() => { navigateTo('login'); setIsMenuOpen(false); }}
                    className={`block w-full text-left px-3 py-2 rounded-lg transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none ${
                      isOnSignupPage || isOnLandingPage
                        ? 'group relative font-bold text-white overflow-visible' 
                        : 'font-medium'
                    }`}
                    style={isOnSignupPage || isOnLandingPage ? {
                      background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                      boxShadow: '0 4px 16px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                      outline: '2px solid rgba(56, 182, 255, 0.5)',
                      outlineOffset: '2px'
                    } : {
                      color: '#000b3d'
                    }}
                    onMouseDown={(e) => {
                      if (isOnSignupPage || isOnLandingPage) {
                        e.target.style.outline = '3px solid rgba(56, 182, 255, 0.8)';
                      } else {
                        e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                        e.target.style.outlineOffset = '2px';
                      }
                    }}
                    onMouseUp={(e) => {
                      if (isOnSignupPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isOnSignupPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                      if (!isOnSignupPage && !isOnLandingPage) {
                        e.target.style.color = '#000b3d';
                        e.target.style.background = 'transparent';
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isOnSignupPage && !isOnLandingPage) {
                        e.target.style.color = '#38b6ff';
                        e.target.style.background = 'rgba(56, 182, 255, 0.1)';
                      }
                    }}
                    onFocus={(e) => {
                      if (isOnSignupPage || isOnLandingPage) {
                        e.target.style.outline = '3px solid rgba(56, 182, 255, 0.8)';
                      } else {
                        e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                        e.target.style.outlineOffset = '2px';
                      }
                    }}
                    onBlur={(e) => {
                      if (isOnSignupPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(56, 182, 255, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                    }}
                  >
                    {isOnSignupPage || isOnLandingPage ? (
                      <>
                        <span className="relative z-10">Login</span>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                          background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                        }}></div>
                      </>
                    ) : (
                      'Login'
                    )}
                  </button>
                  
                  {/* Sign Up Button - transitions between text and highlighted */}
                  <button
                    onClick={() => { navigateTo('signup'); setIsMenuOpen(false); }}
                    className={`block w-full text-left px-3 py-2 rounded-lg transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none ${
                      isOnLoginPage || isOnLandingPage
                        ? 'group relative font-bold text-white overflow-visible' 
                        : 'font-medium'
                    }`}
                    style={isOnLoginPage || isOnLandingPage ? {
                      background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                      boxShadow: '0 4px 16px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                      outline: '2px solid rgba(249, 210, 23, 0.5)',
                      outlineOffset: '2px'
                    } : {
                      color: '#000b3d'
                    }}
                    onMouseDown={(e) => {
                      if (isOnLoginPage || isOnLandingPage) {
                        e.target.style.outline = '3px solid rgba(249, 210, 23, 0.8)';
                      } else {
                        e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                        e.target.style.outlineOffset = '2px';
                      }
                    }}
                    onMouseUp={(e) => {
                      if (isOnLoginPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isOnLoginPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                      if (!isOnLoginPage && !isOnLandingPage) {
                        e.target.style.color = '#000b3d';
                        e.target.style.background = 'transparent';
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isOnLoginPage && !isOnLandingPage) {
                        e.target.style.color = '#38b6ff';
                        e.target.style.background = 'rgba(56, 182, 255, 0.1)';
                      }
                    }}
                    onFocus={(e) => {
                      if (isOnLoginPage || isOnLandingPage) {
                        e.target.style.outline = '3px solid rgba(249, 210, 23, 0.8)';
                      } else {
                        e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                        e.target.style.outlineOffset = '2px';
                      }
                    }}
                    onBlur={(e) => {
                      if (isOnLoginPage || isOnLandingPage) {
                        e.target.style.outline = '2px solid rgba(249, 210, 23, 0.5)';
                      } else {
                        e.target.style.outline = '';
                        e.target.style.outlineOffset = '';
                      }
                    }}
                  >
                    {isOnLoginPage || isOnLandingPage ? (
                      <>
                        <span className="relative z-10">Sign Up</span>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                          background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(249, 210, 23, 0.3) 100%)'
                        }}></div>
                      </>
                    ) : (
                      'Sign Up'
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                    Welcome, {user?.email?.split('@')[0] || 'User'}
                  </div>
                  <button
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Mobile sign out clicked!', { handleSignOut: !!handleSignOut });
                      if (handleSignOut) {
                        handleSignOut(); 
                      }
                      setIsMenuOpen(false); 
                    }}
                    className="block w-full text-left px-3 py-2 rounded-lg font-bold text-white transition-all duration-300 hover:scale-105 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)',
                      boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                      pointerEvents: 'auto'
                    }}
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;
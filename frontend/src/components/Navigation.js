// =============================================================================
// NAVIGATION COMPONENT
// =============================================================================
// This component provides the top navigation bar for the application.
// It shows different links based on user authentication status and subscription.

import React, { useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

function Navigation({ navigateTo, handleSignOut }) {
  // Get authentication and user data from context
  const { session, user, isAdmin, isLoading, subscription } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // =============================================================================
  // STATE: Track current page and screen size
  // =============================================================================
  
  // Check if we're on the landing page (public/mobile view)
  const isOnLandingPage = location.pathname === '/landing' || location.pathname === '/';

  // Track screen size to apply mobile/desktop specific styles
  const [isMobileNav, setIsMobileNav] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => setIsMobileNav(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // =============================================================================
  // HELPER FUNCTIONS: Navigation
  // =============================================================================

  // Scroll to section on landing page
  const scrollToSection = useCallback((sectionId) => {
    setIsMenuOpen(false);

    if (location.pathname !== '/landing') {
      navigate('/landing', { state: { scrollTo: sectionId } });
    } else {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [navigate, location.pathname]);

  // Check if a route is currently active
  const isActiveRoute = useCallback((routePath) => {
    if (routePath === '/home' && location.pathname === '/') return false;
    return location.pathname === routePath || location.pathname.startsWith(routePath + '/');
  }, [location.pathname]);

  // Get navigation links based on user status
  const getNavLinks = useCallback(() => {
    const links = [];

    if (session) {
      if (isAdmin) {
        // Admin navigation links
        links.push({ name: 'Dashboard', path: '/admin/dashboard', type: 'internal', admin: true });
        links.push({ name: 'Users', path: '/admin/users', type: 'internal', admin: true });
        links.push({ name: 'Plans', path: '/admin/plans', type: 'internal', admin: true });
        links.push({ name: 'Stations', path: '/admin/stations', type: 'internal', admin: true });
        links.push({ name: 'Sessions', path: '/admin/sessions', type: 'internal', admin: true });
        links.push({ name: 'Revenue', path: '/admin/revenue', type: 'internal', admin: true });
        links.push({ name: 'System', path: '/admin/system-status', type: 'internal', admin: true });
        links.push({ name: 'Logs', path: '/admin/logs', type: 'internal', admin: true });
      } else {
        // Regular user navigation links
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
      // Public navigation links (landing page)
      links.push({ name: 'Home', path: 'hero', type: 'scroll' });
      links.push({ name: 'Why Choose Us', path: 'features', type: 'scroll' });
      links.push({ name: 'Stations', path: 'stations', type: 'scroll' });
    }

    return links;
  }, [session, isAdmin, subscription]);

  const navLinks = getNavLinks();

  // Check which auth pages are active
  const isOnLoginPage = location.pathname === '/login';
  const isOnSignupPage = location.pathname === '/signup';

  // =============================================================================
  // RENDER: Loading state
  // =============================================================================
  
  // Only show loading during initial app load
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
        </div>
      </nav>
    );
   }

// =============================================================================
   // RENDER: Main navigation
   // =============================================================================
   return (
     <nav
       className="fixed top-0 left-0 right-0 z-50"
       style={{
         // Mobile landing page: dark theme
         ...(isOnLandingPage && isMobileNav ? {
           background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
           borderBottom: '1px solid rgba(255,255,255,0.06)',
           boxShadow: 'none',
           
         } : {
           // Desktop/other pages: glassmorphism light
           background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
           borderBottom: '1px solid rgba(255,255,255,0.3)',
           boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
         })
       }}
     >
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex justify-between items-center h-16">
           {/* Logo and brand name */}
           <div className="flex items-center">
            <Link
              to={session ? (isAdmin ? "/admin/dashboard" : "/home") : "/landing"}
              className="flex items-center space-x-2 focus:outline-none hover:opacity-80 transition-opacity"
            >
              {/* Always show the logo image */}
              <img
                src="/img/solarchargelogonobg.png"
                alt="SolarCharge Logo"
                className="h-10 w-auto"
              />
              {/* Show text on all views - white on mobile landing, dark elsewhere */}
              <span className="text-sm sm:text-base font-bold" style={{ color: isOnLandingPage && isMobileNav ? '#fff' : '#000b3d' }}>
                SolarCharge
              </span>
            </Link>
          </div>

          {/* =============================================================================
             SECTION: Desktop Navigation (hidden on mobile)
          ============================================================================= */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              link.type === 'scroll' ? (
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
                {/* Login Button */}
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

                {/* Sign Up Button */}
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
                {/* <NotificationBell /> */}
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

          {/* =============================================================================
             SECTION: Mobile Navigation (hidden on desktop)
          ============================================================================= */}
          <div className="md:hidden flex items-center space-x-2">
            {/* On landing page: show login button directly (no hamburger) */}
            {isOnLandingPage && !session ? (
              <button
                onClick={() => { navigateTo('login'); setIsMenuOpen(false); }}
                className="text-xs font-bold px-3 py-1.5 rounded-xl"
                style={{
                  background: 'rgba(56,182,255,0.15)',
                  border: '1px solid rgba(56,182,255,0.3)',
                  color: '#38b6ff'
                }}
              >
                Log in
              </button>
            ) : (
              <>
                {/* Notification Bell for Mobile (only when logged in and not on landing) */}
                {/* {session && <NotificationBell />} */}

                {/* Mobile menu button */}
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="focus:outline-none transition-colors duration-200"
                  style={{ color: isOnLandingPage ? '#fff' : '#000b3d' }}
                  onMouseEnter={(e) => e.target.style.color = '#38b6ff'}
                  onMouseLeave={(e) => e.target.style.color = isOnLandingPage ? '#fff' : '#000b3d'}
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
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
    );
}

export default Navigation;
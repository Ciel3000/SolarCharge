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
      } else {
        // Regular user links (not admin)
        links.push({ name: 'Home', path: '/home', type: 'internal' });
        
        if (subscription) {
          // Links for subscribed users
          links.push({ name: 'Subscription', path: '/subscription', type: 'internal' });
          links.push({ name: 'Profile', path: '/profile', type: 'internal' });
        } else {
          // Links for non-subscribed users - include some landing page sections
          links.push({ name: 'Stations', path: 'stations', type: 'scroll' });
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

  // Only show loading during initial app load, not for tab switches or minor updates
  if (isLoading && !session) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-white/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-bold text-gray-800">SolarCharge</span>
          </div>
          <div className="text-gray-600 text-sm">Loading...</div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-white/20 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            {/* Logo now uses Link to navigate to the appropriate starting page */}
            <Link
              to={session ? (isAdmin ? "/admin/dashboard" : "/home") : "/landing"}
              className="flex items-center space-x-2 focus:outline-none"
            >
              <span className="text-2xl">⚡</span>
              <span className="text-xl font-bold text-gray-800">SolarCharge</span>
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
                  className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
                >
                  {link.name}
                </button>
              ) : (
                // Internal links use Link component
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200
                             ${isActiveRoute(link.path) ? 'text-blue-600 border-b-2 border-blue-600' : ''}`}
                >
                  {link.name}
                </Link>
              )
            ))}

            {!session ? (
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => { navigateTo('login'); setIsMenuOpen(false); }}
                  className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200"
                >
                  Login
                </button>
                <button
                  onClick={() => { navigateTo('signup'); setIsMenuOpen(false); }}
                  className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105"
                >
                  Sign Up
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
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-blue-600 focus:outline-none focus:text-blue-600"
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
            <div className="px-2 pt-2 pb-3 space-y-1 bg-white/95 backdrop-blur-md rounded-b-2xl shadow-xl border border-white/20">
              {navLinks.map((link) => (
                link.type === 'scroll' ? (
                  <button
                    key={link.path}
                    onClick={() => scrollToSection(link.path)}
                    className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                  >
                    {link.name}
                  </button>
                ) : (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsMenuOpen(false)} // Close menu after selection
                    className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                  >
                    {link.name}
                  </Link>
                )
              ))}

              {!session ? (
                <>
                  <button
                    onClick={() => { navigateTo('login'); setIsMenuOpen(false); }}
                    className="block w-full text-left px-3 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors duration-200"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => { navigateTo('signup'); setIsMenuOpen(false); }}
                    className="block w-full text-left px-3 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-teal-700 transition-all duration-200"
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 text-gray-600 text-sm">
                    Welcome, {user?.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="px-3 py-2">
                    <NotificationBell />
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
                    className="block w-full text-left px-3 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-all duration-200 cursor-pointer"
                    style={{ pointerEvents: 'auto' }}
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
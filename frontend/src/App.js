// ============================================================
// SolarCharge Main Application
// This file handles routing, authentication, and global state
// ============================================================

// React and Router imports
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// Context providers for authentication and notifications
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';

// Global components for error handling and debugging
import ErrorBoundary from './components/ErrorBoundary';
import PageVisibilityDebug from './components/PageVisibilityDebug';
import SessionStatusIndicator from './components/SessionStatusIndicator';

// Navigation components
import Navigation from './components/Navigation';
import BottomNavigation from './components/BottomNavigation';

// Public and user pages
import HomePage from './pages/HomePage';
import LandingPage from './pages/LandingPagePublic';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SubscriptionPage from './pages/SubscriptionPage';
import UsagePage from './pages/UsagePage';
import StationPage from './pages/StationPage';
import StationsPage from './pages/StationsPage';
import UserProfilePage from './pages/UserProfilePage';

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminLogs from './pages/AdminLogs';
import AdminPlans from './pages/AdminPlans';
import AdminRevenue from './pages/AdminRevenue';
import AdminSessions from './pages/AdminSessions';
import AdminStations from './pages/AdminStations';
import AdminSystemStatus from './pages/AdminSystemStatus';
import AdminUsers from './pages/AdminUsers';
import AdminQuotaPricing from './pages/AdminQuotaPricing';


// ============================================================
// AppContent Component
// Handles all routing logic, navigation, and user interactions
// ============================================================

function AppContent() {
  // Get authentication info from AuthContext
  const {
    session,
    isAdmin,
    isLoading,
    signOut,
    subscription,
    error,
    clearError,
    recoverSession,
    isRecovering
  } = useAuth();

  // Router hooks for navigation
  const navigate = useNavigate();
  const location = useLocation();

  // State for station data
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [stationsInitialized, setStationsInitialized] = useState(false);
  const [stationData, setStationData] = useState(null);

  // State for messages and loading timeout
  const [globalMessage, setGlobalMessage] = useState('');
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // ---- Effect: Show loading timeout message after 5 seconds ----
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  // ---- Effect: Handle navigation based on login status ----
  useEffect(() => {
    // Skip navigation while loading or recovering session
    if (isLoading || isRecovering) {
      return;
    }

    const currentPath = location.pathname;

    // If user is logged in
    if (session) {
      if (isAdmin) {
        // Admin users go to dashboard
        if (['/login', '/signup', '/landing', '/', '/home'].includes(currentPath)) {
          navigate('/admin/dashboard', { replace: true });
        }
      } else {
        // Regular users go to home page
        if (['/login', '/signup', '/landing', '/'].includes(currentPath)) {
          navigate('/home', { replace: true });
        }
      }
    } else {
      // Unauthenticated users go to landing page
      if (currentPath === '/') {
        navigate('/landing', { replace: true });
      }
    }
  }, [session, isAdmin, isLoading, isRecovering, location.pathname, navigate]);

  // ---- Effect: Fetch public station data from database ----
  useEffect(() => {
    async function fetchStations() {
      try {
        setLoadingStations(true);
        setStationsInitialized(true);

        const { supabase } = await import('./supabaseClient');
        const { data, error } = await supabase
          .from('public_station_view')
          .select('*');

        if (error) {
          throw error;
        }

        setStations(data);
      } catch (error) {
        console.error('Error fetching stations:', error.message);
        setGlobalMessage(`Error fetching stations: ${error.message}`);
      } finally {
        setLoadingStations(false);
      }
    }

    // Only fetch if not yet loaded
    if (!stationsInitialized && stations.length === 0) {
      fetchStations();
    } else if (stations.length > 0) {
      setLoadingStations(false);
      setStationsInitialized(true);
    } else if (stationsInitialized) {
      setLoadingStations(false);
    }
  }, [stationsInitialized, stations.length]);

  // ---- Function: Navigate to different pages ----
  const navigateTo = useCallback((path, params) => {
    setGlobalMessage('');

    // Navigate to station detail page
    if (path === 'station' && params && params.station) {
      setStationData(params.station);
      navigate(`/station?stationId=${params.station.station_id}`, {
        state: {
          station: params.station,
          from: location.pathname,
          ...params.state
        }
      });
    }
    // Already logged in, redirect to home or admin
    else if (path === 'login' && session) {
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    }
    else if (path === 'signup' && session) {
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    }
    // Navigate to login with reason message
    else if (path === 'login' && params?.reason) {
      navigate('/login', {
        state: {
          from: params.from || location.pathname,
          reason: params.reason,
          message: params.message
        }
      });
    }
    // Navigate to signup with user details
    else if (path === 'signup' && params?.email) {
      navigate('/signup', {
        state: {
          email: params.email,
          from: params.from || location.pathname,
          referralCode: params.referralCode,
          reason: params.reason,
          message: params.message
        }
      });
    }
    // Navigate to subscription page
    else if (path === 'subscription' && params?.action) {
      navigate('/subscription', {
        state: {
          from: location.pathname,
          message: params.message,
          selectedPlan: params.selectedPlan,
          action: params.action
        }
      });
    }
    // Default navigation
    else {
      const targetPath = path.startsWith('/') ? path : `/${path}`;
      navigate(targetPath, {
        state: params?.state || {}
      });
    }
  }, [navigate, session, isAdmin, location.pathname]);

  // ---- Function: Handle user sign out ----
  const handleSignOut = async () => {
    console.log('handleSignOut called!');
    setGlobalMessage('');

    try {
      console.log('Calling signOut...');

      const signOutPromise = signOut();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign out timeout')), 5000)
      );

      const { error } = await Promise.race([signOutPromise, timeoutPromise]);
      console.log('signOut result:', { error });

      if (error) {
        throw error;
      }

      console.log('Sign out successful, navigating to landing...');
      setGlobalMessage('Signed out successfully!');
      navigate('/landing');
    } catch (error) {
      console.error('Sign out error:', error);

      // Handle timeout - clear storage and redirect
      if (error.message === 'Sign out timeout') {
        console.log('Sign out timed out, forcing manual logout...');
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/landing';
        return;
      }

      setGlobalMessage(`Sign out error: ${error.message}`);
    }
  };

  // Determine which navigation to show based on current route and user type
  const currentPath = location.pathname;

  // Show header navigation on landing or any protected page (not on auth pages)
  const showHeaderNav = currentPath !== '/login' && 
                        currentPath !== '/signup' && 
                        currentPath !== '/forgot-password' && 
                        currentPath !== '/reset-password';

  // Show bottom navigation only on logged-in user protected pages (not landing, not admin)
  const showBottomNav = session && !isAdmin && 
    currentPath !== '/landing' && 
    currentPath !== '/login' &&
    currentPath !== '/signup' &&
    currentPath !== '/forgot-password' &&
    currentPath !== '/reset-password';

  // Navigation visibility flags
  const showPublicNavigation = currentPath === '/landing';
  const showAdminNavigation = showHeaderNav && isAdmin;
  const showUserNavigation = showHeaderNav && !isAdmin;

  // ---- Render: Show error screen if auth error exists ----
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 max-w-md mx-auto backdrop-blur-xl rounded-3xl shadow-2xl border border-white/30 p-8 text-center" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="text-6xl mb-4 animate-logo-float">⚡</div>
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>
            Authentication Error
          </h1>
          <p className="mb-6" style={{ color: '#000b3d', opacity: 0.7 }}>
            {error}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                clearError();
                recoverSession();
              }}
              disabled={isRecovering}
              className="w-full font-bold py-3 px-6 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                color: 'white'
              }}
            >
              {isRecovering ? '🔄 Recovering...' : '🔄 Retry'}
            </button>

            <button
              onClick={() => {
                clearError();
                navigate('/landing');
              }}
              className="w-full font-bold py-3 px-6 rounded-xl transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                border: '2px solid #38b6ff',
                color: '#000b3d',
                boxShadow: '0 4px 16px rgba(56, 182, 255, 0.2)'
              }}
            >
              🏠 Go to Landing
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main Render: Application content and routing ----
  return (
    <>
      {/* Global message bar */}
      {globalMessage && (
        <div className="fixed top-0 left-0 right-0 p-4 bg-yellow-100 text-yellow-800 border-b border-yellow-300 text-center z-50">
          {globalMessage}
        </div>
      )}

      {/* Session status indicator */}
      <SessionStatusIndicator />

      {/* Top navigation bar - show on landing, admin or user pages */}
      {showHeaderNav && (
        <Navigation
          navigateTo={navigateTo}
          handleSignOut={handleSignOut}
          isAdmin={isAdmin}
        />
      )}

      {/* Main content area with padding for navigation */}
      <div className={showHeaderNav ? "pt-0 pb-0 md:pb-0" : ""}>
        <PageVisibilityDebug />

        <Routes>
          {/* ---- Loading Screen ---- */}
          <Route path="/" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
                  <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
                </div>
                <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 max-w-md mx-auto" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                  boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                  <div className="flex flex-col items-center">
                    <div className="text-6xl mb-4 animate-logo-float">⚡</div>
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mb-4" style={{
                      borderColor: '#38b6ff',
                      borderTopColor: 'transparent'
                    }}></div>
                    <p className="text-lg font-semibold mb-2" style={{ color: '#000b3d' }}>Loading SolarCharge...</p>
                    <p className="text-sm mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>
                      {isRecovering ? 'Recovering your session...' : 'Checking your session...'}
                    </p>

                    {/* Extended loading timeout options */}
                    {loadingTimeout && (
                      <div className="mt-4 p-4 rounded-xl backdrop-blur-md text-center w-full" style={{
                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                        border: '1px solid rgba(249, 210, 23, 0.3)'
                      }}>
                        <p className="mb-4 font-semibold" style={{ color: '#000b3d' }}>Taking longer than expected...</p>
                        <div className="space-y-2">
                          <button
                            onClick={() => {
                              setLoadingTimeout(false);
                              recoverSession();
                            }}
                            disabled={isRecovering}
                            className="w-full font-bold py-2 px-4 rounded-xl transition-all duration-300 hover:scale-105 disabled:opacity-50"
                            style={{
                              background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                              boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                              color: 'white'
                            }}
                          >
                            {isRecovering ? '🔄 Recovering...' : '🔄 Retry'}
                          </button>
                          <button
                            onClick={() => navigate('/landing')}
                            className="w-full font-bold py-2 px-4 rounded-xl transition-all duration-300 hover:scale-105"
                            style={{
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                              border: '2px solid #38b6ff',
                              color: '#000b3d',
                              boxShadow: '0 4px 16px rgba(56, 182, 255, 0.2)'
                            }}
                          >
                            🏠 Go to Landing
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null
          } />

          {/* ---- Public Routes ---- */}
          <Route
            path="/landing"
            element={<LandingPage stations={stations} loading={loadingStations} navigateTo={navigateTo} />}
          />

          <Route
            path="/login"
            element={<LoginPage navigateTo={navigateTo} message={globalMessage} />}
          />

          <Route
            path="/signup"
            element={<SignUpPage navigateTo={navigateTo} />}
          />

          <Route
            path="/forgot-password"
            element={<ForgotPasswordPage navigateTo={navigateTo} />}
          />

          <Route
            path="/reset-password"
            element={<ResetPasswordPage navigateTo={navigateTo} />}
          />

          {/* ---- User Protected Routes ---- */}
          <Route
            path="/home"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this page.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} />
              ) : (
                <HomePage
                  navigateTo={navigateTo}
                  message={globalMessage}
                  stations={stations}
                  loadingStations={loadingStations}
                  handleSignOut={handleSignOut}
                />
              )
            }
          />

          <Route
            path="/subscription"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this page.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin cannot view user subscription.'} />
              ) : (
                <SubscriptionPage navigateTo={navigateTo} handleSignOut={handleSignOut} />
              )
            }
          />

          <Route
            path="/usage"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this page.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin cannot view user usage.'} />
              ) : (
                <UsagePage />
              )
            }
          />

          <Route
            path="/station"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this station details.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin should use admin station management.'} />
              ) : (
                <StationPage station={stationData} navigateTo={navigateTo} />
              )
            }
          />

          <Route
            path="/stations"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to view all stations.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin should use admin station management.'} />
              ) : (
                <StationsPage navigateTo={navigateTo} stations={stations} loadingStations={loadingStations} />
              )
            }
          />

          <Route
            path="/profile"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access your profile.'} />
              ) : isAdmin ? (
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin users should manage profiles through admin panel.'} />
              ) : (
                <UserProfilePage navigateTo={navigateTo} />
              )
            }
          />

          {/* ---- Admin Protected Routes ---- */}
          <Route path="/admin/dashboard" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/logs" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminLogs navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/plans" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminPlans navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/revenue" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminRevenue navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/sessions" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminSessions navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/stations" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminStations navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/system-status" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminSystemStatus navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/users" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminUsers navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />

          <Route path="/admin/quota-pricing" element={
            isLoading || isRecovering ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              </div>
            ) : !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminQuotaPricing />
          } />

          {/* ---- 404 Not Found Route ---- */}
          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-red-600 mb-4">404 - Page Not Found</h1>
                <p className="text-lg text-gray-700 mb-6">The page you are looking for does not exist.</p>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
                  onClick={() => navigate(session ? (isAdmin ? '/admin/dashboard' : '/home') : '/landing')}
                >
                  Go to {session ? (isAdmin ? 'Admin Dashboard' : 'Home') : 'Landing Page'}
                </button>
              </div>
            </div>
          } />
        </Routes>

        {/* Bottom navigation - only for logged-in non-admin users */}
        {showBottomNav && <BottomNavigation />}
      </div>
    </>
  );
}


// ============================================================
// App Component
// Provides context providers and router
// ============================================================

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
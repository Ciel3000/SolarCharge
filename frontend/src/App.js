// frontend/src/App.js
// This is the main application component, handling routing and global state.

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import PageVisibilityDebug from './components/PageVisibilityDebug';
import SessionStatusIndicator from './components/SessionStatusIndicator';

// Import the new page components
import HomePage from './pages/HomePage';
import LandingPage from './pages/LandingPagePublic';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import SubscriptionPage from './pages/SubscriptionPage';
import UsagePage from './pages/UsagePage';
import StationPage from './pages/StationPage';
import StationsPage from './pages/StationsPage';
import UserProfilePage from './pages/UserProfilePage';
import Navigation from './components/Navigation';

// Import admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminLogs from './pages/AdminLogs';
import AdminPlans from './pages/AdminPlans';
import AdminRevenue from './pages/AdminRevenue';
import AdminSessions from './pages/AdminSessions';
import AdminStations from './pages/AdminStations';
import AdminSystemStatus from './pages/AdminSystemStatus';
import AdminUsers from './pages/AdminUsers';
import AdminQuotaPricing from './pages/AdminQuotaPricing';

// ---
// AppContent component to house routing logic and context consumers
function AppContent() {
  const { session, isAdmin, isLoading, signOut, subscription, error, clearError, recoverSession, isRecovering } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [stationsInitialized, setStationsInitialized] = useState(false);
  const [stationData, setStationData] = useState(null);
  const [globalMessage, setGlobalMessage] = useState('');
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Effect to handle loading timeout
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 5000); // Increased to 5 seconds
      
      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  // Effect to handle navigation based on auth state changes
  useEffect(() => {
    if (isLoading || isRecovering) {
      // Still loading auth state or recovering, don't navigate yet
      return;
    }

    const currentPath = location.pathname;

    // Redirect logic for different scenarios
    if (session) {
      // User is logged in
      if (isAdmin) {
        // Admin user redirects
        if (['/login', '/signup', '/landing', '/', '/home'].includes(currentPath)) {
          navigate('/admin/dashboard', { replace: true });
        }
      } else {
        // Regular user redirects  
        if (['/login', '/signup', '/landing', '/'].includes(currentPath)) {
          navigate('/home', { replace: true });
        }
      }
    } else {
      // User is not logged in
      if (currentPath === '/') {
        navigate('/landing', { replace: true });
      }
    }
  }, [session, isAdmin, isLoading, isRecovering, location.pathname, navigate]);

  // Effect to fetch public station data
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

    // Only fetch stations if we haven't already initialized them
    if (!stationsInitialized && stations.length === 0) {
      fetchStations();
    } else if (stations.length > 0) {
      setLoadingStations(false);
      setStationsInitialized(true);
    } else if (stationsInitialized) {
      setLoadingStations(false);
    }
  }, [stationsInitialized, stations.length]);

  // Custom navigate function using React Router's navigate
  const navigateTo = useCallback((path, params) => {
    setGlobalMessage('');

    if (path === 'station' && params && params.station) {
      setStationData(params.station);
      navigate(`/station?stationId=${params.station.station_id}`, {
        state: {
          station: params.station,
          from: location.pathname,
          ...params.state
        }
      });
    } else if (path === 'login' && session) {
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    } else if (path === 'signup' && session) {
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    } else if (path === 'login' && params?.reason) {
      navigate('/login', {
        state: {
          from: params.from || location.pathname,
          reason: params.reason,
          message: params.message
        }
      });
    } else if (path === 'signup' && params?.email) {
      navigate('/signup', {
        state: {
          email: params.email,
          from: params.from || location.pathname,
          referralCode: params.referralCode,
          reason: params.reason,
          message: params.message
        }
      });
    } else if (path === 'subscription' && params?.action) {
      navigate('/subscription', {
        state: {
          from: location.pathname,
          message: params.message,
          selectedPlan: params.selectedPlan,
          action: params.action
        }
      });
    } else {
      const targetPath = path.startsWith('/') ? path : `/${path}`;
      navigate(targetPath, {
        state: params?.state || {}
      });
    }
  }, [navigate, session, isAdmin, location.pathname]);

  const handleSignOut = async () => {
    console.log('handleSignOut called!');
    setGlobalMessage('');
    try {
      console.log('Calling signOut...');
      
      const signOutPromise = signOut();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign out timeout')), 5000) // Increased timeout
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

  // Determine if Navigation component should be shown
  const showNavigation = session 
    ? !['/login', '/signup', '/landing'].includes(location.pathname)
    : ![].includes(location.pathname);
  
  const showAdminNavigation = showNavigation && isAdmin;
  const showUserNavigation = showNavigation && !isAdmin;

  // Show error message if there's an auth error
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

  // Render content based on React Router's active route
  return (
    <>
      {/* Display global message at the top, if any */}
      {globalMessage && (
        <div className="fixed top-0 left-0 right-0 p-4 bg-yellow-100 text-yellow-800 border-b border-yellow-300 text-center z-50">
          {globalMessage}
        </div>
      )}

      {/* Session Status Indicator */}
      <SessionStatusIndicator />
      
      {showNavigation && (
        <Navigation
          navigateTo={navigateTo}
          handleSignOut={handleSignOut}
        />
      )}

      {/* Add top padding to content if navigation is shown */}
      <div className={showNavigation ? "pt-16" : ""}>
        <PageVisibilityDebug />
        <Routes>
          {/* Default routes: Redirects handled by useEffect above for '/' */}
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

          {/* User Protected Routes */}
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

          {/* Admin Protected Routes */}
          <Route path="/admin/dashboard" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/logs" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminLogs navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/plans" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminPlans navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/revenue" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminRevenue navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/sessions" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminSessions navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/stations" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminStations navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/system-status" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminSystemStatus navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/users" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminUsers navigateTo={navigateTo} handleSignOut={handleSignOut} />
          } />
          <Route path="/admin/quota-pricing" element={
            !session ? <LoginPage navigateTo={navigateTo} message={'Access Denied: Please log in as an administrator.'} /> :
            !isAdmin ? <HomePage navigateTo={navigateTo} message={'Access Denied: You do not have administrator privileges.'} stations={stations} loadingStations={loadingStations} /> :
            <AdminQuotaPricing />
          } />

          {/* Catch-all for undefined routes */}
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
      </div>
    </>
  );
}

// ---
// App component to provide AuthProvider and Router context
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
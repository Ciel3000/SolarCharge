// frontend/src/App.js
// This is the main application component, handling routing and global state.

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'; // IMPORT: React Router
import { AuthProvider, useAuth } from './contexts/AuthContext'; // IMPORT: Use the AuthContext
import ErrorBoundary from './components/ErrorBoundary'; // IMPORT: Error Boundary

// Import the new page components
import HomePage from './pages/HomePage';
import LandingPage from './pages/LandingPagePublic'; // Renamed to avoid confusion with App.js in previous example
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import SubscriptionPage from './pages/SubscriptionPage';
import StationPage from './pages/StationPage';
import UserProfilePage from './pages/UserProfilePage'; // Import UserProfilePage
import Navigation from './components/Navigation'; // Import Navigation component here

// Import admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminLogs from './pages/AdminLogs';
import AdminPlans from './pages/AdminPlans';
import AdminRevenue from './pages/AdminRevenue';
import AdminSessions from './pages/AdminSessions';
import AdminStations from './pages/AdminStations';
import AdminSystemStatus from './pages/AdminSystemStatus';
import AdminUsers from './pages/AdminUsers';

// ---
// AppContent component to house routing logic and context consumers
// This component is wrapped by <Router> and <AuthProvider>
function AppContent() {
  // Use states from AuthContext
  const { session, isAdmin, isLoading, signOut, subscription, error, clearError, recoverSession } = useAuth(); // Added error handling
  const navigate = useNavigate(); // React Router's navigate hook
  const location = useLocation(); // React Router's location hook for current path

  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [stationData, setStationData] = useState(null); // Data for a specific station on StationPage
  const [globalMessage, setGlobalMessage] = useState(''); // For global messages from App.js
  const [loadingTimeout, setLoadingTimeout] = useState(false); // Track if loading is taking too long

  // Effect to handle loading timeout
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 3000); // Reduced to 3 seconds for faster UX
      
      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  // Effect to handle navigation based on auth state changes
  useEffect(() => {
    if (isLoading) {
      // Still loading auth state, don't navigate yet
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
  }, [session, isAdmin, isLoading, location.pathname, navigate]);


  // Effect to fetch public station data
  useEffect(() => {
    async function fetchStations() {
      try {
        setLoadingStations(true);
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

    // Fetch stations on initial load and potentially on session changes if stations
    // are dependent on login status (though public_station_view suggests not).
    // Avoid fetching repeatedly unless truly necessary.
    fetchStations();
  }, []); // Empty dependency array means this runs once on mount.


  // Custom navigate function using React Router's navigate
  const navigateTo = useCallback((path, params) => {
    setGlobalMessage(''); // Clear global messages on page navigation

    // Special handling for 'station' page to pass data via state
    if (path === 'station' && params && params.station) {
      setStationData(params.station); // Set data before navigating
      navigate('/station', {
        state: {
          station: params.station,
          from: location.pathname,
          ...params.state // Allow additional state to be passed
        }
      });
    } else if (path === 'login' && session) {
      // If already logged in, clicking login should redirect to home/dashboard
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    } else if (path === 'signup' && session) {
      // If already logged in, clicking signup should redirect to home/dashboard
      navigate(isAdmin ? '/admin/dashboard' : '/home');
    } else if (path === 'login' && params?.reason) {
      // Enhanced login navigation with reason and redirect info
      navigate('/login', {
        state: {
          from: params.from || location.pathname,
          reason: params.reason,
          message: params.message
        }
      });
    } else if (path === 'signup' && params?.email) {
      // Enhanced signup navigation with pre-filled data
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
      // Enhanced subscription navigation with action context
      navigate('/subscription', {
        state: {
          from: location.pathname,
          message: params.message,
          selectedPlan: params.selectedPlan,
          action: params.action
        }
      });
    } else {
      // Default navigation for other paths
      const targetPath = path.startsWith('/') ? path : `/${path}`;
      navigate(targetPath, {
        state: params?.state || {} // Allow passing state for any route
      });
    }
  }, [navigate, session, isAdmin, location.pathname]); // Updated dependencies


  const handleSignOut = async () => {
    setGlobalMessage('');
    try {
      const { error } = await signOut();
      if (error) {
        throw error;
      }
      setGlobalMessage('Signed out successfully!');
      // After signOut, AuthContext updates session to null,
      // and the useEffect will eventually redirect to landing page if at root.
      navigate('/landing'); // Explicitly navigate to landing after sign out
    } catch (error) {
      setGlobalMessage(`Sign out error: ${error.message}`);
      console.error('Sign out error:', error.message);
    }
  };

  // Determine if Navigation component should be shown
  // Show navigation for logged-in users even on root path (since they'll be redirected)
  const showNavigation = session 
    ? !['/login', '/signup', '/landing'].includes(location.pathname)  // Logged in: hide only on login/signup/landing
    : ![].includes(location.pathname); // Not logged in: also hide on root
  
  // Admin navigation should be different (or passed different props)
  const showAdminNavigation = showNavigation && isAdmin;
  const showUserNavigation = showNavigation && !isAdmin;

  // Show error message if there's an auth error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Authentication Error
          </h1>
          <p className="text-gray-600 mb-6">
            {error}
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => {
                clearError();
                recoverSession();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              🔄 Retry
            </button>
            
            <button
              onClick={() => {
                clearError();
                navigate('/landing');
              }}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
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

      {showNavigation && (
        <Navigation
          navigateTo={navigateTo}
          handleSignOut={handleSignOut}
          // You might pass a prop to Navigation to render admin-specific links
          // For now, it will render based on session/isAdmin internally if its logic supports it
        />
      )}

      {/* Add top padding to content if navigation is shown */}
      <div className={showNavigation ? "pt-16" : ""}>
        <Routes>
          {/* Default routes: Redirects handled by useEffect above for '/' */}
          <Route path="/" element={
            isLoading ? (
              <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="flex flex-col items-center max-w-md mx-auto p-8">
                  <div className="text-6xl mb-4">⚡</div>
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-lg text-gray-700">Loading SolarCharge...</p>
                  <p className="text-sm text-gray-500 mt-2">Checking your session...</p>
                  
                  {loadingTimeout && (
                    <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                      <p className="text-yellow-800 mb-4">Taking longer than expected...</p>
                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            setLoadingTimeout(false);
                            recoverSession();
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                        >
                          🔄 Retry
                        </button>
                        <button
                          onClick={() => navigate('/landing')}
                          className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                        >
                          🏠 Go to Landing
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null // Actual redirect happens in useEffect
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
              !session ? ( // If not logged in, redirect to login
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this page.'} />
              ) : isAdmin ? ( // If admin, redirect to admin dashboard
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
              ) : isAdmin ? ( // Prevent admin from accessing user subscription page
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin cannot view user subscription.'} />
              ) : (
                <SubscriptionPage navigateTo={navigateTo} handleSignOut={handleSignOut} />
              )
            }
          />
          <Route
            path="/station"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access this station details.'} />
              ) : isAdmin ? ( // Prevent admin from accessing user station control page
                <AdminDashboard navigateTo={navigateTo} handleSignOut={handleSignOut} message={'Access Denied: Admin should use admin station management.'} />
              ) : (!stationData ? (
                // If no station data is set, redirect back to home or show error
                <div className="min-h-screen flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">No Station Selected</h2>
                    <p className="text-gray-600 mb-6">Please select a station from the home page.</p>
                    <button
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
                      onClick={() => navigateTo('home')}
                    >
                      Go to Home
                    </button>
                  </div>
                </div>
              ) : (
                <StationPage station={stationData} navigateTo={navigateTo} />
              ))
            }
          />
          <Route
            path="/profile"
            element={
              !session ? (
                <LoginPage navigateTo={navigateTo} message={'Please log in to access your profile.'} />
              ) : isAdmin ? ( // Prevent admin from accessing user profile page (they have their own admin management)
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
          <AppContent />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
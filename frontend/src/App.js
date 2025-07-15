// frontend/src/App.js
// This is the main application component, handling routing and global state.

import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Import the initialized Supabase client

// Import the new page components
import HomePage from './pages/HomePage'; // Will rename file next
import LandingPage from './pages/LandingPagePublic'; // New landing page for guests
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ESP32ControlPage from './pages/ESP32ControlPage'; // NEW import
import SubscriptionPage from './pages/SubscriptionPage'; // NEW import
import StationPage from './pages/StationPage';

function App() {
  const [session, setSession] = useState(null);
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true); // Renamed for clarity
  const [currentPage, setCurrentPage] = useState('landing'); // State to manage current page
  const [stationData, setStationData] = useState(null);
  const [globalMessage, setGlobalMessage] = useState(''); // For global messages from App.js

  // Effect to listen for Supabase auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setCurrentPage(session ? 'home' : 'landing'); // Go to HomePage if logged in
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setCurrentPage(session ? 'home' : 'landing'); // Go to HomePage if logged in
    });

    return () => subscription.unsubscribe();
  }, []);

  // Effect to fetch public station data when the component mounts or session changes
  useEffect(() => {
    async function fetchStations() {
      try {
        setLoadingStations(true); // Use specific loading state for stations
        // Fetch data from the 'public_station_view' you defined in your SQL schema
        const { data, error } = await supabase
          .from('public_station_view')
          .select('*');

        if (error) {
          throw error;
        }
        setStations(data);
      } catch (error) {
        console.error('Error fetching stations:', error.message);
        setGlobalMessage(`Error fetching stations: ${error.message}`); // Use global message
      } finally {
        setLoadingStations(false); // Reset specific loading state
      }
    }

    // Only fetch stations if on the landing page or logged in
    if (currentPage === 'landing' || session) {
      fetchStations();
    }
  }, [session, currentPage]); // Re-fetch if session or page changes

  // --- Authentication Functions (handled by App.js for global sign out) ---

  const handleSignOut = async () => {
    setGlobalMessage('');
    try {
      setLoadingStations(true); // Use a general loading for global actions if needed, or refine
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setGlobalMessage('Signed out successfully!');
      // Supabase auth state change listener will automatically update session and navigate to landing
    } catch (error) {
      setGlobalMessage(`Sign out error: ${error.message}`);
      console.error('Sign out error:', error.message);
    } finally {
      setLoadingStations(false);
    }
  };

  // Function to navigate between pages
  const navigateTo = (page, params) => {
    setCurrentPage(page);
    if (page === 'station' && params && params.station) {
      setStationData(params.station);
    }
    setGlobalMessage(''); // Clear global messages on page navigation
  };

  // Render the current page based on `currentPage` state
  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return (
          <LoginPage
            navigateTo={navigateTo}
          />
        );
      case 'signup':
        return (
          <SignUpPage
            navigateTo={navigateTo}
          />
        );
      case 'home':
        if (!session) {
          // If not logged in, redirect to landing
          return <LandingPage stations={stations} loading={loadingStations} navigateTo={navigateTo} />;
        }
        return (
          <HomePage
            session={session}
            stations={stations}
            loading={loadingStations}
            handleSignOut={handleSignOut}
            navigateTo={navigateTo}
          />
        );
      case 'esp32control': // NEW case
        if (!session) {
          // If trying to access control page without session, redirect to login
          setGlobalMessage('Please log in to access the ESP32 control panel.');
          return <LoginPage navigateTo={navigateTo} />;
        }
        return (
          <ESP32ControlPage
            navigateTo={navigateTo}
            session={session}
            handleSignOut={handleSignOut}
          />
        );
      case 'subscription': // NEW case
        if (!session) {
          // If trying to access subscription page without session, redirect to login
          setGlobalMessage('Please log in to access your subscription details.');
          return <LoginPage navigateTo={navigateTo} />;
        }
        return (
          <SubscriptionPage
            navigateTo={navigateTo}
            session={session}
            handleSignOut={handleSignOut}
          />
        );
      case 'station': // NEW case
        if (!session) {
          setGlobalMessage('Please log in to view station details.');
          return <LoginPage navigateTo={navigateTo} />;
        }
        return (
          <StationPage
            session={session}
            station={stationData}
            navigateTo={navigateTo}
          />
        );
      case 'landing':
      default:
        return (
          <LandingPage
            stations={stations}
            loading={loadingStations}
            navigateTo={navigateTo}
          />
        );
    }
  };

  return (
    <>
      {/* Display global message at the top, if any */}
      {globalMessage && (
        <div className="fixed top-0 left-0 right-0 p-4 bg-yellow-100 text-yellow-800 border-b border-yellow-300 text-center z-50">
          {globalMessage}
        </div>
      )}
      {renderPage()}
    </>
  );
}

export default App;
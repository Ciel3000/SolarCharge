import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Add React Router hooks
import { useAuth } from '../contexts/AuthContext';


function HomePage({ navigateTo, message, stations: propStations, loadingStations: propLoadingStations }) {
  console.log('HomePage rendered.');

  const { session, user, subscription, plans, isLoading: authLoading } = useAuth();
  const location = useLocation(); // Get location object
  const navigate = useNavigate(); // Get navigate function

  const [displayMessage, setDisplayMessage] = useState(message || '');
  // Use props if available, otherwise fall back to internal state
  const [internalStations, setInternalStations] = useState([]);
  const [internalLoadingStations, setInternalLoadingStations] = useState(true);
  const [stationsInitialized, setStationsInitialized] = useState(false);
  
  // Use props if provided, otherwise use internal state
  const stations = propStations || internalStations;
  const loadingStations = propLoadingStations !== undefined ? propLoadingStations : internalLoadingStations;

  // Check for location state messages or URL parameters
  const locationMessage = location.state?.message;
  const scrollToSection = location.state?.scrollTo;
  const searchParams = new URLSearchParams(location.search);
  const filter = searchParams.get('filter'); // e.g., ?filter=available
  const stationId = searchParams.get('station'); // e.g., ?station=uuid

  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
    } else if (locationMessage) {
      setDisplayMessage(locationMessage);
    }
  }, [message, locationMessage]);

  // Handle scroll to section if specified
  useEffect(() => {
    if (scrollToSection) {
      const element = document.getElementById(scrollToSection);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToSection]);

  // Force refresh stations when navigating back to home page
  useEffect(() => {
    if (session && location.pathname === '/home' && stations.length === 0 && !loadingStations) {
      setStationsInitialized(false);
      setInternalStations([]);
      setInternalLoadingStations(true);
    }
  }, [session, location.pathname, stations.length, loadingStations]);

  // Enhanced station navigation with state passing
  const handleStationClick = (station) => {
    if (subscription) {
      // Use navigateTo function to properly set station data in App.js
      navigateTo('station', { 
        station, 
        state: {
          from: '/home',
          message: `Welcome to ${station.station_name}!`
        }
      });
    } else {
      openGoogleMaps(station.location_description);
    }
  };

  useEffect(() => {
    async function fetchStationsForHomePage() {
      if (!session) return;
      try {
        setInternalLoadingStations(true);
        setStationsInitialized(true);
        const { supabase } = await import('../supabaseClient');
        const { data, error } = await supabase
          .from('public_station_view')
          .select('*');

        if (error) throw error;
        setInternalStations(data);
      } catch (err) {
        console.error('HomePage: Error fetching stations:', err.message);
      } finally {
        setInternalLoadingStations(false);
      }
    }
    
    // Only fetch stations if we have a session and haven't already fetched them
    // This prevents refetching when returning from other browser tabs
    if (session && !stationsInitialized && internalStations.length === 0 && !propStations) {
      fetchStationsForHomePage();
    } else if (session && (stations.length > 0 || propStations)) {
      // If we have stations data (from props or internal), we're not loading anymore
      setInternalLoadingStations(false);
      setStationsInitialized(true);
    } else if (session && stationsInitialized) {
      // If we're initialized but have no data, we're not loading
      setInternalLoadingStations(false);
    }
  }, [session, stationsInitialized, internalStations.length, propStations]);

  const [usage, setUsage] = useState({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyKWH: 0 });

  useEffect(() => {
    async function fetchUsageAnalytics() {
      if (!session?.access_token) return;
      try {
        const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';
        const res = await fetch(`${BACKEND_URL}/api/user/usage`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch usage data.');
        const data = await res.json();
        setUsage(data);
      } catch (err) {
        console.error('HomePage: Error fetching usage analytics:', err.message);
        setUsage({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyKWH: 0 });
      }
    }
    fetchUsageAnalytics();
  }, [session]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const openGoogleMaps = (locationDescription) => {
    const encodedLocation = encodeURIComponent(locationDescription);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedLocation}`, '_blank');
  };

  // Only show loading during initial app load, not for tab switches or minor updates
  if (authLoading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-lg text-gray-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-cyan-100 flex flex-col items-center justify-center p-4 text-gray-800 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-green-400/20 to-blue-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-cyan-400/20 to-emerald-400/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-blue-400/10 to-green-400/10 rounded-full blur-3xl"></div>
      </div>

      {/* Message Display (from App.js or internal) */}
      {displayMessage && (
        <div className="fixed top-20 left-0 right-0 p-4 bg-yellow-100 text-yellow-800 border-b border-yellow-300 text-center z-50 rounded-lg mx-auto max-w-md shadow-md">
          {displayMessage}
        </div>
      )}

      {/* Main Content with top padding for fixed nav */}
      <div className="w-full pt-20">
        {/* Hero + Features Section */}
        <section id="hero-features" className="w-full max-w-5xl mx-auto py-12 px-4 md:px-8 bg-gradient-to-br from-green-100 via-blue-100 to-cyan-100 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20 overflow-hidden">
          <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-6 max-w-xl mx-auto">
            <div className="flex items-center space-x-3">
              <span className="text-4xl">⚡</span>
              <span className="text-3xl font-extrabold text-gray-800 tracking-tight">SolarCharge</span>
            </div>
            {session && (
              <div className="text-lg text-gray-700">
                Hello <span className="font-semibold">{user?.email?.split('@')[0] || 'User'}</span>!
              </div>
            )}
            {subscription ? (
              <div className="bg-white rounded-xl shadow-lg p-8 border-2 border-green-300 w-full max-w-md animate-fade-in-up flex flex-col items-center">
                <h4 className="text-xl font-bold text-green-700 mb-2 flex items-center gap-2">
                  <span className="text-green-500">🌟</span> Your Current Plan
                </h4>
                <div className="mb-2 text-lg font-semibold text-gray-800">{subscription.plan_name}</div>
                <div className="mb-2 text-gray-600">{subscription.description}</div>
                <div className="mb-2 text-gray-600"><strong>Price:</strong> {formatCurrency(subscription.price)}</div>
                <div className="mb-6 text-gray-600"><strong>Daily Limit:</strong> {subscription.daily_mah_limit} mAh</div>
                {/* Usage Analytics */}
                <div className="flex flex-row justify-center gap-6 w-full mb-6">
                  <div className="flex flex-col items-center bg-blue-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-blue-600 text-2xl font-bold">{usage.totalSessions}</span>
                    <span className="text-xs text-gray-500 mt-1">Sessions</span>
                  </div>
                  <div className="flex flex-col items-center bg-green-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-green-600 text-2xl font-bold">{usage.totalDuration}</span>
                    <span className="text-xs text-gray-500 mt-1">Minutes</span>
                  </div>
                  <div className="flex flex-col items-center bg-purple-50 rounded-lg px-4 py-2 shadow">
                    <span className="text-purple-600 text-2xl font-bold">{formatCurrency(usage.totalCost)}</span>
                    <span className="text-xs text-gray-500 mt-1">Total Cost</span>
                  </div>
                </div>
                {/* Energy Consumed and Progress Bar */}
                <div className="w-full mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600 font-medium">Energy Consumed (This Month)</span>
                    <span className="text-sm text-gray-700 font-bold">{usage.totalEnergyKWH} Ah</span>
                  </div>
                  {(() => {
                    const daysSoFar = new Date().getDate();
                    const monthlyLimit = subscription.daily_mah_limit * daysSoFar;
                    const percent = monthlyLimit > 0 ? Math.min(100, ((usage.totalEnergyKWH / monthlyLimit) * 100).toFixed(0)) : 0;
                    return (
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className={`h-4 rounded-full transition-all duration-500 ${percent < 80 ? 'bg-green-400' : percent < 100 ? 'bg-yellow-400' : 'bg-red-500'}`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    );
                  })()}
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-gray-500">{(() => {
                      const daysSoFar = new Date().getDate();
                      const monthlyLimit = subscription.daily_mah_limit * daysSoFar;
                      const percent = monthlyLimit > 0 ? Math.min(100, ((usage.totalEnergyKWH / monthlyLimit) * 100).toFixed(0)) : 0;
                      return `${percent}% of monthly limit (${monthlyLimit} mAh)`;
                    })()}</span>
                  </div>
                </div>
                <button
                  className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl transition-colors w-full"
                  onClick={() => navigateTo('subscription')}
                >
                  Manage Subscription
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center w-full animate-fade-in-up">
                <h3 className="text-2xl font-bold text-blue-700 mb-4">Choose Your Plan</h3>
                <div className="grid grid-cols-1 gap-6 w-full">
                  {plans.map(plan => (
                    <div key={plan.plan_id} className="bg-white rounded-xl shadow-lg p-6 border-2 border-blue-200 w-full">
                      <div className="text-xl font-bold text-blue-700 mb-2">{plan.plan_name}</div>
                      <div className="text-gray-600 mb-2">{plan.description}</div>
                      <div className="text-gray-600 mb-2"><strong>Price:</strong> {formatCurrency(plan.price)}</div>
                      <div className="text-gray-600 mb-4"><strong>Daily Limit:</strong> {plan.daily_mah_limit} mAh</div>
                      <button
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-xl transition-colors w-full"
                        onClick={() => navigateTo('subscription')}
                      >
                        Subscribe
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Available Stations Section */}
        <section id="stations" className="w-full max-w-5xl mx-auto bg-white/90 backdrop-blur-sm p-10 rounded-3xl shadow-2xl mb-12 relative z-10 border border-white/20">
          <div className="text-center mb-10">
            <h3 className="text-4xl font-bold text-gray-800 mb-4">Find a Charging Station Near You</h3>
            <p className="text-xl text-gray-600">Locate and use our solar-powered charging stations across the city</p>
          </div>
          {loadingStations ? (
            <div className="col-span-full text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading stations...</p>
            </div>
          ) : stations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {stations.map((station, index) => (
                <div
                  key={station.station_id}
                  className="group bg-gradient-to-br from-blue-50 to-cyan-50 p-8 rounded-2xl shadow-lg border border-blue-200 text-left transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => handleStationClick(station)}
                >
                  <div className="flex flex-col gap-2"> {/* Changed to flex-col for better stacking on small screens */}
                    <h4 className="text-2xl font-bold text-blue-800">{station.station_name}</h4>
                    <p className="text-gray-700 text-base flex items-center">
                      <svg className="w-5 h-5 mr-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                      </svg>
                      {station.location_description}
                    </p>
                  </div>

                  {/* Conditional rendering for subscribed users */}
                  {subscription && (
                    <>
                      <div className="space-y-3 text-gray-600 mt-6"> {/* Added mt-6 for spacing */}
                        <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                          <span className="flex items-center">
                            <span className="mr-2">🔌</span> Free Ports
                          </span>
                          <span className="font-bold text-blue-600">{station.available_free_ports} / {station.num_free_ports}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                          <span className="flex items-center">
                            <span className="mr-2">⚡</span> Premium Ports
                          </span>
                          <span className="font-bold text-purple-600">{station.available_premium_ports} / {station.num_premium_ports}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                          <span className="flex items-center">
                            <span className="mr-2">🔋</span> Battery Level
                          </span>
                          <span className={`font-bold ${station.current_battery_level > 50 ? 'text-green-600' : station.current_battery_level > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {station.current_battery_level}%
                          </span>
                        </div>
                      </div>

                      {station.last_maintenance_message && (
                        <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <p className="text-gray-600 text-sm flex items-center">
                            <span className="mr-2">🛠️</span> Last Maintenance: {station.last_maintenance_message}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {!subscription && (
                    <div className="mt-4 text-center text-sm text-gray-500 italic">
                      Tap to view on map. Subscribe for full details and charging.
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600">No stations found.</p>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="w-full max-w-5xl mx-auto text-center py-12 text-gray-600 relative z-10">
          <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white/20">
            <div className="flex items-center justify-center mb-4">
              <span className="text-2xl mr-2">⚡</span>
              <h3 className="text-2xl font-bold text-gray-800">SolarCharge</h3>
            </div>
            <p className="text-lg text-gray-700 mb-2">© {new Date().getFullYear()} SolarCharge. All rights reserved.</p>
            <p className="text-gray-600">Innovating for a sustainable future.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default HomePage;

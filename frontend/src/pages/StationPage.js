import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = 'https://solar-charger-backend.onrender.com';

const DEVICE_PORT_MAPPING = {
  1: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 1, label: 'Premium Port 1' },
  2: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 2, label: 'Premium Port 2' },
};

function StationPage({ station, navigateTo }) {
  const { user, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [stationData, setStationData] = useState(station || location.state?.station);
  const [loadingStation, setLoadingStation] = useState(!station && !location.state?.station);

  const [loadingPort, setLoadingPort] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [chargerPortStatus, setChargerPortStatus] = useState({});
  const [activeSessions, setActiveSessions] = useState({});
  const [portConsumption, setPortConsumption] = useState({}); // Track mAh consumption for each port

  // Refs to store interval IDs
  const statusIntervalRef = useRef(null);
  const sessionIntervalRef = useRef(null);
  const isPageVisibleRef = useRef(true);

  const fromRoute = location.state?.from || '/home';
  const premiumPorts = Object.entries(DEVICE_PORT_MAPPING);

  // Fetch station data if not provided
  useEffect(() => {
    if (!stationData && !loadingStation) {
      setLoadingStation(true);
      // Try to get station ID from URL params or localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const stationId = urlParams.get('stationId');
      
      if (stationId) {
        // Fetch station data from database
        fetchStationData(stationId);
      } else {
        // No station ID available, redirect to home
        navigate('/home');
      }
    }
  }, [stationData, loadingStation, navigate]);

  const fetchStationData = async (stationId) => {
    try {
      const { supabase } = await import('../supabaseClient');
      const { data, error } = await supabase
        .from('public_station_view')
        .select('*')
        .eq('station_id', stationId)
        .single();

      if (error) throw error;
      setStationData(data);
    } catch (err) {
      console.error('Error fetching station data:', err);
      navigate('/home');
    } finally {
      setLoadingStation(false);
    }
  };

  const fetchChargerDeviceStatus = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices/status`);
      const data = await response.json();
      const statusMap = {};
      data.forEach(deviceStatus => {
        const key = `${deviceStatus.device_id}_${deviceStatus.port_number_in_device}`;
        statusMap[key] = deviceStatus;
      });
      setChargerPortStatus(statusMap);
    } catch (error) {
      console.error('Error fetching charger device statuses:', error);
      setFeedback('Error loading port statuses.');
    }
  }, []);

  // Fetch port consumption
  const fetchPortConsumption = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices/consumption`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Handle case where response might be an error object
      if (data.error) {
        console.error('Backend error:', data.error);
        return;
      }
      
      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('Expected array response, got:', typeof data, data);
        return;
      }
      
      const consumptionMap = {};
      data.forEach(portData => {
        const key = `${portData.device_id}_${portData.port_number}`;
        consumptionMap[key] = {
          total_mah: portData.total_mah || 0,
          current_consumption: portData.current_consumption || 0,
          timestamp: portData.timestamp
        };
      });
      setPortConsumption(consumptionMap);
    } catch (error) {
      console.error('Error fetching port consumption:', error);
    }
  }, []);

  // Fetch active user sessions
  const fetchActiveUserSessions = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch active sessions.');
      const allActiveSessions = await res.json();
      const userActiveSessions = allActiveSessions.filter(s => s.user_id === user.id);

      const newActiveSessions = {};
      userActiveSessions.forEach(s => {
        const mappedPort = Object.values(DEVICE_PORT_MAPPING).find(
          map => map.internalPortNumber === s.port_number
        );
        if (mappedPort) {
          newActiveSessions[`${mappedPort.stationDeviceId}_${s.port_number}`] = s.session_id;
        }
      });

      setActiveSessions(newActiveSessions);
    } catch (err) {
      console.error('Error fetching active user sessions:', err);
      setActiveSessions({});
    }
  }, [user?.id, session?.access_token]);

  // Function to start intervals
  const startIntervals = useCallback(() => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
    
    statusIntervalRef.current = setInterval(fetchChargerDeviceStatus, 5000);
    sessionIntervalRef.current = setInterval(fetchActiveUserSessions, 10000);
    
    // Initial fetch
    fetchChargerDeviceStatus();
    fetchActiveUserSessions();
    fetchPortConsumption();
    
    // Set up consumption fetch interval (every 10 seconds)
    const consumptionInterval = setInterval(fetchPortConsumption, 10000);
    
    // Store the interval ref for cleanup
    const consumptionIntervalRef = { current: consumptionInterval };
    
    return () => {
      if (consumptionIntervalRef.current) {
        clearInterval(consumptionIntervalRef.current);
      }
    };
  }, [fetchChargerDeviceStatus, fetchActiveUserSessions, fetchPortConsumption]);

  // Function to stop intervals
  const stopIntervals = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (sessionIntervalRef.current) {
      clearInterval(sessionIntervalRef.current);
      sessionIntervalRef.current = null;
    }
  }, []);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - stop intervals to save resources
        console.log('StationPage: Tab hidden, stopping intervals');
        isPageVisibleRef.current = false;
        stopIntervals();
      } else {
        // Page is visible again - restart intervals and fetch fresh data
        console.log('StationPage: Tab visible, restarting intervals');
        isPageVisibleRef.current = true;
        
        // Immediately fetch fresh data
        fetchChargerDeviceStatus();
        fetchActiveUserSessions();
        
        // Restart intervals
        startIntervals();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup
    fetchChargerDeviceStatus();
    fetchActiveUserSessions();
    startIntervals();

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopIntervals();
    };
  }, [fetchChargerDeviceStatus, fetchActiveUserSessions, startIntervals, stopIntervals]);

  const handleControlCommand = async (frontendPortNumber, action) => {
    if (!user?.id) {
      setFeedback('User not logged in.');
      return;
    }

    const mappedPortDetails = DEVICE_PORT_MAPPING[frontendPortNumber];
    if (!mappedPortDetails) {
      setFeedback(`No mapping found for Frontend Port ${frontendPortNumber}.`);
      return;
    }

    const { stationDeviceId, internalPortNumber } = mappedPortDetails;
    const key = `${stationDeviceId}_${internalPortNumber}`;

    setLoadingPort(frontendPortNumber);
    setFeedback('');

    try {
      let res;
      if (action === 'activate') {
        res = await fetch(`${BACKEND_URL}/api/devices/${stationDeviceId}/${internalPortNumber}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            command: 'ON',
            user_id: user.id,
            station_id: stationData.station_id,
          }),
        });
        const result = await res.json();
        if (res.ok && result.sessionId) {
          setFeedback(`Charging started on ${mappedPortDetails.label}!`);
          setActiveSessions(prev => ({ ...prev, [key]: result.sessionId }));
          setChargerPortStatus(prev => ({
            ...prev,
            [key]: { ...prev[key], charger_state: 'ON', status_message: 'online' },
          }));
        } else {
          setFeedback(result.error || `Failed to start session on ${mappedPortDetails.label}.`);
        }
      } else if (action === 'deactivate') {
        res = await fetch(`${BACKEND_URL}/api/devices/${stationDeviceId}/${internalPortNumber}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            command: 'OFF',
            user_id: user.id,
          }),
        });
        const result = await res.json();
        if (res.ok) {
          setFeedback(`Charging ended on ${mappedPortDetails.label}!`);
          setActiveSessions(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
          });
          setChargerPortStatus(prev => ({
            ...prev,
            [key]: { ...prev[key], charger_state: 'OFF', status_message: 'online' },
          }));
        } else {
          setFeedback(result.error || `Failed to end session on ${mappedPortDetails.label}.`);
        }
      }
    } catch (err) {
      console.error('Network error controlling charger:', err);
      setFeedback('Network error or backend issue.');
    } finally {
      setLoadingPort(null);
    }
  };

  const getPortDisplayStatus = (frontendPortNumber) => {
    const mappedPortDetails = DEVICE_PORT_MAPPING[frontendPortNumber];
    if (!mappedPortDetails) {
      return { display: 'N/A', class: 'text-gray-500', buttonText: 'Invalid Port' };
    }

    const key = `${mappedPortDetails.stationDeviceId}_${mappedPortDetails.internalPortNumber}`;
    const status = chargerPortStatus[key];
    const isActiveSession = activeSessions[key];

    // Check if status exists and if it's explicitly offline
    if (status?.status_message === 'offline') {
      return { display: 'Offline', class: 'text-red-600', buttonText: 'Offline' };
    }

    // If no status data at all, consider it offline (device not responding)
    if (!status) {
      return { display: 'Offline', class: 'text-red-600', buttonText: 'Device Offline' };
    }

    // Check for active user session first
    if (isActiveSession) {
      return { display: 'Charging (Your Session)', class: 'text-green-600', buttonText: 'Stop Charging' };
    } else if (status.charger_state === 'ON') {
      return { display: 'In Use (Other User)', class: 'text-orange-600', buttonText: 'Occupied' };
    } else if (status.charger_state === 'OFF') {
      return { display: 'Available', class: 'text-green-600', buttonText: 'Start Charging' };
    }

    return { display: 'Unknown State', class: 'text-gray-500', buttonText: 'Unknown' };
  };

  // Show loading state if station data is not available
  if (loadingStation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-cyan-100 flex items-center justify-center p-4 text-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Loading station...</p>
        </div>
      </div>
    );
  }

  // Show error if no station data
  if (!stationData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">No Station Selected</h2>
          <p className="text-gray-600 mb-4">
            {location.state?.error || 'Please select a station from the home page.'}
          </p>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
            onClick={() => navigate(fromRoute)}
          >
            ← Back to {fromRoute === '/home' ? 'Home' : 'Previous Page'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-8 mt-8">
        <button
          className="mb-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
          onClick={() => navigate(fromRoute)}
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold text-blue-800 mb-4">{stationData.station_name}</h1>
        <p className="text-gray-700 mb-2"><strong>Location:</strong> {stationData.location_description}</p>
        <p className="text-gray-700 mb-2"><strong>Battery Level:</strong> {stationData.current_battery_level}%</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-purple-50 p-4 rounded-lg">
            <span className="text-gray-600">Premium Ports</span>
            <div className="text-2xl font-bold text-purple-600">
              {stationData.available_premium_ports} / {stationData.num_premium_ports}
            </div>
          </div>
        </div>

        {stationData.last_maintenance_message && (
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <span className="text-gray-700 text-sm">🛠️ Last Maintenance: {stationData.last_maintenance_message}</span>
          </div>
        )}

        {session && user?.id && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Control Charger Ports</h2>
            {feedback && (
              <div className="mb-4 text-center text-green-700 font-semibold">{feedback}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {premiumPorts.map(([frontendPortNumber, mappedPortDetails]) => {
                const { stationDeviceId, internalPortNumber, label } = mappedPortDetails;
                const currentStatus = getPortDisplayStatus(frontendPortNumber);
                const key = `${stationDeviceId}_${internalPortNumber}`;
                const isActiveSession = activeSessions[key];

                return (
                  <div key={frontendPortNumber} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                    <div className="text-lg font-semibold mb-2">{label}</div>
                    <div className={`mb-2 text-sm font-bold ${currentStatus.class}`}>
                      {currentStatus.display}
                    </div>
                    
                    {/* Display mAh consumption */}
                    <div className="mb-4 text-center">
                      <div className="text-xs text-gray-600 mb-1">Current Consumption</div>
                      <div className="text-lg font-bold text-blue-600">
                        {portConsumption[key] && typeof portConsumption[key].current_consumption === 'number' ? 
                          `${portConsumption[key].current_consumption.toFixed(2)} mA` : 
                          '0.00 mA'
                        }
                      </div>
                      <div className="text-xs text-gray-600 mt-1">Total: {portConsumption[key] && typeof portConsumption[key].total_mah === 'number' ? 
                        `${portConsumption[key].total_mah.toFixed(2)} mAh` : 
                        '0.00 mAh'
                      }</div>
                    </div>

                    {currentStatus.display === 'Offline' ||
                    currentStatus.display === 'Device Offline' ||
                    currentStatus.display === 'Unknown State' ||
                    currentStatus.display === 'In Use (Other User)' ? (
                      <button
                        className="bg-gray-400 text-white font-bold py-2 px-6 rounded-lg cursor-not-allowed"
                        disabled
                      >
                        {currentStatus.buttonText}
                      </button>
                    ) : isActiveSession ? (
                      <button
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                        onClick={() => handleControlCommand(frontendPortNumber, 'deactivate')}
                        disabled={loadingPort === frontendPortNumber}
                      >
                        {loadingPort === frontendPortNumber ? 'Deactivating...' : currentStatus.buttonText}
                      </button>
                    ) : (
                      <button
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                        onClick={() => handleControlCommand(frontendPortNumber, 'activate')}
                        disabled={loadingPort === frontendPortNumber}
                      >
                        {loadingPort === frontendPortNumber ? 'Activating...' : currentStatus.buttonText}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StationPage;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../utils/apiErrorHandler';
import { openGoogleMaps } from '../utils/mapUtils';

const BACKEND_URL = 'https://solar-charger-backend.onrender.com';

function StationPage({ station, navigateTo }) {
  const { user, session, handleSessionTimeout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [chargerPortStatus, setChargerPortStatus] = useState({});
  const [portConsumption, setPortConsumption] = useState({});
  const [activeSessions, setActiveSessions] = useState([]);
  const [loadingPort, setLoadingPort] = useState(null);
  const [stationData, setStationData] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [mapMessage, setMapMessage] = useState('');
  const mapMessageTimeoutRef = useRef(null);
  const [userActiveSessions, setUserActiveSessions] = useState(0);
  const [maxActiveSlots, setMaxActiveSlots] = useState(1);

  // Refs to store interval IDs
  const statusIntervalRef = useRef(null);
  const sessionIntervalRef = useRef(null);
  const isPageVisibleRef = useRef(true);
  const intervalsRef = useRef([]); // New ref for all intervals

  const fromRoute = location.state?.from || '/home';
  
  // Generate device port mapping
  const devicePortMapping = useMemo(() => {
    if (!stationData) return {};
    
    const mapping = {};
    const deviceId = stationData.device_mqtt_id || 'ESP32_CHARGER_STATION_001';
    
    // Map premium ports (1 and 2)
    for (let i = 1; i <= 2; i++) {
      mapping[i] = {
        internalPortNumber: i,
        label: `Premium Port ${i}`,
        deviceId: deviceId
      };
    }
    
    return mapping;
  }, [stationData]);

  const premiumPorts = Object.entries(devicePortMapping);

  // Fetch station data
  const fetchStationData = useCallback(async () => {
    if (station) {
      setStationData(station);
      return;
    }

    const stationFromLocation = location.state?.station;
    if (stationFromLocation) {
      setStationData(stationFromLocation);
      return;
    }

    // If no station data available, redirect to home
    navigate('/home');
  }, [station, location.state?.station, navigate]);

  // Fetch slot limits configuration
  const fetchSlotLimits = useCallback(async () => {
    try {
      const response = await apiFetch(`${BACKEND_URL}/api/config/slot-limits`, {}, { handleSessionTimeout });
      if (response.ok) {
        const config = await response.json();
        setMaxActiveSlots(config.premiumUserMaxActiveSlots);
      }
    } catch (error) {
      console.error('Error fetching slot limits config:', error);
    }
  }, [handleSessionTimeout]);

  // Effect to fetch station data on mount
  useEffect(() => {
    fetchStationData();
  }, [fetchStationData]);

  // Effect to fetch slot limits on mount
  useEffect(() => {
    fetchSlotLimits();
  }, [fetchSlotLimits]);

  const fetchChargerDeviceStatus = useCallback(async () => {
    try {
      const response = await apiFetch(`${BACKEND_URL}/api/devices/status`, {}, { handleSessionTimeout });
      
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

  // Fetch active user sessions using existing endpoint
  const fetchActiveUserSessions = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/sessions/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }, { handleSessionTimeout });
      if (!res.ok) throw new Error('Failed to fetch active sessions.');
      const allActiveSessions = await res.json();
      const userActiveSessions = allActiveSessions.filter(s => s.user_id === user.id);
      setUserActiveSessions(userActiveSessions.length);

      const newActiveSessions = {};
      userActiveSessions.forEach(s => {
        // Find the port in the current station's device mapping
        const mappedPort = Object.values(devicePortMapping).find(
          map => map.internalPortNumber === s.port_number
        );
        if (mappedPort) {
          newActiveSessions[`${mappedPort.deviceId}_${s.port_number}`] = s.session_id;
        }
      });

      setActiveSessions(newActiveSessions);
    } catch (err) {
      console.error('Error fetching active user sessions:', err);
      setActiveSessions({});
    }
  }, [user?.id, session?.access_token, devicePortMapping]);

  // Fetch consumption data using existing endpoint
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
      const deviceId = stationData?.device_mqtt_id || 'ESP32_CHARGER_STATION_001';
      
      // Initialize all ports for this station with zero consumption
      // This ensures ports without active sessions show 0 instead of stale data
      if (stationData?.num_premium_ports) {
        for (let i = 1; i <= stationData.num_premium_ports; i++) {
          const key = `${deviceId}_${i}`;
          consumptionMap[key] = {
            total_mah: 0,
            current_consumption: 0,
            timestamp: null
          };
        }
      }
      
      // Update with actual consumption data from the API
      // Only ports with active sessions will have data in the response
      data.forEach(portData => {
        const key = `${portData.device_id}_${portData.port_number}`;
        // Only update if this port belongs to the current station
        if (key.startsWith(deviceId + '_')) {
          // Only set consumption if there's actually an active session (non-zero values)
          // The API returns 0 for ports without active sessions
          const hasActiveSession = (portData.current_consumption || 0) > 0 || (portData.total_mah || 0) > 0;
          if (hasActiveSession) {
            consumptionMap[key] = {
              total_mah: portData.total_mah || 0,
              current_consumption: portData.current_consumption || 0,
              timestamp: portData.timestamp
            };
          }
          // If no active session, the initialized 0 values above will remain
        }
      });
      
      setPortConsumption(consumptionMap);
    } catch (error) {
      console.error('Error fetching port consumption:', error);
    }
  }, [stationData]);

  // Function to start intervals
  const startIntervals = useCallback(() => {
    // Status update interval (every 5 seconds)
    const statusInterval = setInterval(() => {
      if (isPageVisibleRef.current) {
        fetchChargerDeviceStatus();
      }
    }, 5000);

    // Consumption update interval (every 10 seconds)
    const consumptionInterval = setInterval(() => {
      if (isPageVisibleRef.current) {
        fetchPortConsumption();
      }
    }, 10000);

    // Session update interval (every 5 seconds for faster status updates)
    const sessionInterval = setInterval(() => {
      if (isPageVisibleRef.current) {
        fetchActiveUserSessions();
      }
    }, 5000);

    // Store interval IDs for cleanup
    intervalsRef.current = [statusInterval, consumptionInterval, sessionInterval];
  }, [fetchChargerDeviceStatus, fetchPortConsumption, fetchActiveUserSessions]);

  // Function to stop intervals
  const stopIntervals = useCallback(() => {
    if (intervalsRef.current) {
      intervalsRef.current.forEach(intervalId => clearInterval(intervalId));
      intervalsRef.current = [];
    }
  }, []);

  // Effect to start data fetching when component mounts
  useEffect(() => {
    if (stationData?.station_id) {
      // Stop any existing intervals first
      stopIntervals();
      
      // Initial data fetch
      fetchChargerDeviceStatus();
      fetchPortConsumption();
      fetchActiveUserSessions();
      
      // Start intervals
      startIntervals();
      
      // Cleanup on unmount or when dependencies change
      return () => {
        stopIntervals();
        // Clear map message timeout
        if (mapMessageTimeoutRef.current) {
          clearTimeout(mapMessageTimeoutRef.current);
        }
      };
    }
  }, [stationData?.station_id, fetchChargerDeviceStatus, fetchPortConsumption, fetchActiveUserSessions, startIntervals, stopIntervals]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('StationPage: Tab hidden, stopping intervals');
        isPageVisibleRef.current = false;
        stopIntervals();
      } else {
        console.log('StationPage: Tab visible, restarting intervals');
        isPageVisibleRef.current = true;
        
        // Immediately fetch fresh data
        fetchChargerDeviceStatus();
        fetchPortConsumption();
        fetchActiveUserSessions();
        
        // Restart intervals
        startIntervals();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchChargerDeviceStatus, fetchPortConsumption, fetchActiveUserSessions, startIntervals, stopIntervals]);

  const handleControlCommand = async (portNumber, command) => {
    if (!user || !stationData || !session?.access_token) return;
    
    const deviceId = stationData.device_mqtt_id || 'ESP32_CHARGER_STATION_001';
    
    try {
      setLoadingPort(portNumber);
      
      // Check quota before starting charging
      if (command === 'ON') {
        const quotaResponse = await apiFetch(`${BACKEND_URL}/api/user/quota-status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }, { handleSessionTimeout });
        
        if (quotaResponse.ok) {
          const quotaData = await quotaResponse.json();
          if (!quotaData.canCharge) {
            alert(`Cannot start charging: ${quotaData.reason}\n\nPlease visit the Usage page to purchase an extension.`);
            setLoadingPort(null);
            return;
          }
        }
      }
      
      const response = await apiFetch(`${BACKEND_URL}/api/devices/${deviceId}/${portNumber}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          command: command,
          user_id: user.id,
          station_id: stationData.station_id
        })
      }, { handleSessionTimeout });

      if (response.ok) {
        const result = await response.json();
        console.log(`Control command ${command} sent successfully for port ${portNumber}:`, result);
        
        // Refresh data after successful command
        setTimeout(() => {
          fetchChargerDeviceStatus();
          fetchPortConsumption();
          fetchActiveUserSessions();
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error(`Failed to send control command:`, errorData);
        
        // Handle quota-related errors with better messaging
        if (errorData.error && errorData.error.includes('quota')) {
          alert(`Cannot start charging: ${errorData.error}\n\nPlease visit the Usage page to purchase an extension.`);
        } else if (errorData.error && errorData.error.includes('active charging session')) {
          // Handle slot limit errors
          alert(`Cannot start charging: ${errorData.error}\n\nPlease stop your current charging session before starting a new one.`);
        } else {
          alert(`Error: ${errorData.error || 'Failed to send control command'}`);
        }
      }
    } catch (error) {
      console.error('Error sending control command:', error);
      alert('Error sending control command. Please try again.');
    } finally {
      setLoadingPort(null);
    }
  };

  // Simplified port status logic
  const getPortDisplayStatus = useCallback((portNumber) => {
    const deviceId = stationData?.device_mqtt_id || 'ESP32_CHARGER_STATION_001';
    const statusKey = `${deviceId}_${portNumber}`;
    
    // Get status data
    const statusData = chargerPortStatus[statusKey] || {};
    const consumptionInfo = portConsumption[statusKey] || {};
    
    // Check if current user has an active session on this port
    const userActiveSession = activeSessions[statusKey];
    
    // Determine port status
    let displayStatus = 'Available';
    let buttonText = 'Start Charging';
    let buttonDisabled = false;
    let isUserSession = false;
    
    // Check for offline status first
    if (statusData.status_message === 'offline') {
      displayStatus = 'Offline';
      buttonText = 'Start Charging';
      buttonDisabled = true;
      isUserSession = false;
    } else if (userActiveSession) {
      // User has an active session on this port
      displayStatus = 'Your Session Active';
      buttonText = 'Stop Charging';
      buttonDisabled = false;
      isUserSession = true;
    } else if (statusData.charger_state === 'ON') {
      // Port is occupied by another user or device state hasn't updated yet
      // Double-check: if no active session but charger is ON, it might be stale
      displayStatus = 'Occupied';
      buttonText = 'Start Charging';
      buttonDisabled = true;
      isUserSession = false;
    } else {
      // Port is available
      displayStatus = 'Available';
      buttonText = 'Start Charging';
      buttonDisabled = false;
      isUserSession = false;
    }
    
    // If there's no active session, clear consumption values
    let currentConsumption = 0;
    let totalMah = 0;
    
    if (userActiveSession) {
      // Only show consumption if there's an active user session
      currentConsumption = consumptionInfo.current_consumption || 0;
      totalMah = consumptionInfo.total_mah || 0;
    } else {
      // Clear consumption when session ends
      currentConsumption = 0;
      totalMah = 0;
    }
    
    return {
      displayStatus,
      buttonText,
      buttonDisabled,
      isUserSession,
      consumption: currentConsumption,
      totalMah: totalMah,
      energyKwh: 0 // Not available in old endpoint
    };
  }, [chargerPortStatus, portConsumption, activeSessions, stationData?.device_mqtt_id]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex-1">
            <p className="text-gray-700 mb-2"><strong>Location:</strong> {stationData.location_description}</p>
            {/* <p className="text-gray-700 mb-2"><strong>Device ID:</strong> {stationData.device_mqtt_id || 'Not configured'}</p> */}
          </div>
          <div className="mt-2 sm:mt-0 sm:ml-4">
            <button
              onClick={() => {
                openGoogleMaps(stationData.location_description, stationData.latitude, stationData.longitude);
                setMapMessage(`📍 Opening ${stationData.station_name} location in Google Maps`);
                // Clear any existing timeout
                if (mapMessageTimeoutRef.current) {
                  clearTimeout(mapMessageTimeoutRef.current);
                }
                // Clear message after 3 seconds
                mapMessageTimeoutRef.current = setTimeout(() => setMapMessage(''), 3000);
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
              </svg>
              View on Map
            </button>
          </div>
        </div>

        {/* Map Message */}
        {mapMessage && (
          <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg text-center">
            {mapMessage}
          </div>
        )}

        {/* Slot Status Indicator */}
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd"></path>
              </svg>
              <span className="font-semibold text-gray-700">Active Sessions:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                userActiveSessions >= maxActiveSlots 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {userActiveSessions}/{maxActiveSlots}
              </span>
              <span className="text-sm text-gray-600">
                {userActiveSessions >= maxActiveSlots ? 'Limit reached' : 'Available'}
              </span>
            </div>
          </div>
          {userActiveSessions >= maxActiveSlots && (
            <div className="mt-2 text-sm text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              ⚠️ You can only have {maxActiveSlots} active charging session{maxActiveSlots > 1 ? 's' : ''} at a time. Stop your current session{maxActiveSlots > 1 ? 's' : ''} to start a new one.
            </div>
          )}
        </div>

        {/* Debug Information - Commented out for production */}
        {/* {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg text-sm">
            <h3 className="font-bold mb-2">Debug Info:</h3>
            <p><strong>Device MQTT ID:</strong> {stationData.device_mqtt_id || 'Not set (using fallback)'}</p>
            <p><strong>Used Device ID:</strong> {stationData?.device_mqtt_id || 'ESP32_CHARGER_STATION_001'}</p>
            <p><strong>Premium Ports:</strong> {stationData.num_premium_ports}</p>
            <p><strong>Port Mapping:</strong> {JSON.stringify(devicePortMapping)}</p>
            <p><strong>Status Keys:</strong> {Object.keys(chargerPortStatus).join(', ')}</p>
            <p><strong>Active Sessions:</strong> {Object.keys(activeSessions).join(', ')}</p>
            <p><strong>Consumption Keys:</strong> {Object.keys(portConsumption).join(', ')}</p>
          </div>
        )} */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <span className="text-gray-600">Free Ports</span>
            <div className="text-2xl font-bold text-blue-600">
              {stationData.num_free_ports}
            </div>
          </div>
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Control Charger Ports</h2>
              <button
                onClick={() => {
                  fetchChargerDeviceStatus();
                  fetchActiveUserSessions();
                  fetchPortConsumption();
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"
              >
                Refresh Status
              </button>
            </div>
            {feedback && (
              <div className="mb-4 text-center text-green-700 font-semibold">{feedback}</div>
            )}
            
            {stationData.num_premium_ports > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {premiumPorts.map(([frontendPortNumber, mappedPortDetails]) => {
                  const currentStatus = getPortDisplayStatus(mappedPortDetails.internalPortNumber);
                  
                  return (
                    <div key={frontendPortNumber} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                      <div className="text-lg font-semibold mb-2">{mappedPortDetails.label}</div>
                      <div className={`mb-2 text-sm font-bold ${
                        currentStatus.displayStatus.includes('Offline') ? 'text-red-600' : 
                        currentStatus.displayStatus.includes('Your Session') ? 'text-green-600' : 
                        currentStatus.displayStatus.includes('Occupied') ? 'text-orange-600' : 
                        'text-gray-500'
                      }`}>
                        {currentStatus.displayStatus}
                      </div>
                      
                      <div className="text-center mb-4">
                        <div className="text-xs text-gray-600 mb-1">Current Consumption</div>
                        <div className="text-lg font-bold text-blue-600">
                          {currentStatus.consumption.toFixed(2)} mA
                        </div>
                        <div className="text-xs text-gray-600 mt-1">Total: {currentStatus.totalMah.toFixed(2)} mAh</div>
                      </div>

                      {currentStatus.displayStatus === 'Offline' ? (
                        <button
                          className="bg-gray-400 text-white font-bold py-2 px-6 rounded-lg cursor-not-allowed"
                          disabled
                        >
                          Offline
                        </button>
                      ) : (
                        <button
                          className={`font-bold py-2 px-6 rounded-lg transition-colors ${
                            currentStatus.buttonDisabled 
                              ? 'bg-gray-400 text-white cursor-not-allowed' 
                              : currentStatus.isUserSession
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-green-500 hover:bg-green-600 text-white'
                          }`}
                          onClick={() => handleControlCommand(mappedPortDetails.internalPortNumber, currentStatus.isUserSession ? 'OFF' : 'ON')}
                          disabled={currentStatus.buttonDisabled || loadingPort === mappedPortDetails.internalPortNumber}
                        >
                          {loadingPort === mappedPortDetails.internalPortNumber ? 'Processing...' : currentStatus.buttonText}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <div className="text-yellow-800 text-lg font-semibold mb-2">⚠️ Premium Ports Not Available</div>
                  <div className="text-yellow-700">
                    This station does not have any premium charging ports configured.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default StationPage;

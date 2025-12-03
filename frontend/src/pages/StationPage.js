import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../utils/apiErrorHandler';
import { openGoogleMaps } from '../utils/mapUtils';
import { supabase } from '../supabaseClient';

const BACKEND_URL = 'https://solar-charger-backend.onrender.com';

function StationPage({ station, navigateTo }) {
  const { user, session, subscription, handleSessionTimeout } = useAuth();
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
  const realtimeSyncTimeoutRef = useRef(null);

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

  // Get daily usage from subscription data
  const getDailyUsage = useCallback(() => {
    if (!subscription) return 0;
    // Use current_daily_mah_consumed from subscription, which is updated in real-time
    return parseFloat(subscription.current_daily_mah_consumed || 0);
  }, [subscription]);

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
          // Always update current_consumption if it exists (even if 0, to show real-time updates)
          // Only set total_mah if there's an active session
          const hasActiveSession = (portData.current_consumption || 0) > 0 || (portData.total_mah || 0) > 0;
          if (hasActiveSession || portData.current_consumption !== undefined) {
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

  const syncStationState = useCallback(async () => {
    if (!stationData?.station_id) return;

    try {
      const response = await apiFetch(`${BACKEND_URL}/api/stations/${stationData.station_id}/sync`, {}, { handleSessionTimeout });
      if (!response.ok) {
        console.error('Station sync returned non-200 status:', response.status);
      }
    } catch (error) {
      console.error('Error syncing station state:', error);
    } finally {
      await Promise.all([
        fetchChargerDeviceStatus(),
        fetchPortConsumption(),
        fetchActiveUserSessions()
      ]);
    }
  }, [stationData?.station_id, fetchChargerDeviceStatus, fetchPortConsumption, fetchActiveUserSessions, handleSessionTimeout]);

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
      syncStationState();
      
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
  }, [stationData?.station_id, syncStationState, startIntervals, stopIntervals]);

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
        syncStationState();
        
        // Restart intervals
        startIntervals();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (realtimeSyncTimeoutRef.current) {
        clearTimeout(realtimeSyncTimeoutRef.current);
        realtimeSyncTimeoutRef.current = null;
      }
    };
  }, [syncStationState, startIntervals, stopIntervals]);

  useEffect(() => {
    if (!stationData?.station_id) return;

    const channelName = `station-sync-${stationData.station_id}`;
    const channel = supabase.channel(channelName);

    const scheduleRealtimeSync = () => {
      if (realtimeSyncTimeoutRef.current) return;
      realtimeSyncTimeoutRef.current = setTimeout(() => {
        realtimeSyncTimeoutRef.current = null;
      }, 1000);
      syncStationState();
    };

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'charging_port', filter: `station_id=eq.${stationData.station_id}` },
        scheduleRealtimeSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'charging_session', filter: `station_id=eq.${stationData.station_id}` },
        scheduleRealtimeSync
      )
      .subscribe();

    return () => {
      if (realtimeSyncTimeoutRef.current) {
        clearTimeout(realtimeSyncTimeoutRef.current);
        realtimeSyncTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [stationData?.station_id, syncStationState]);

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
        await syncStationState();
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
    
    // Get current consumption (real-time, updates every 10 seconds)
    // Show current consumption if there's an active session on this port
    let currentConsumption = 0;
    if (userActiveSession) {
      // Show real-time current consumption from the API
      currentConsumption = consumptionInfo.current_consumption || 0;
    }
    
    return {
      displayStatus,
      buttonText,
      buttonDisabled,
      isUserSession,
      consumption: currentConsumption, // Real-time current consumption in mA
      energyKwh: 0 // Not available in old endpoint
    };
  }, [chargerPortStatus, portConsumption, activeSessions, stationData?.device_mqtt_id]);

  // Show error if no station data
  if (!stationData) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        {/* Animated Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 text-center" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>No Station Selected</h2>
          <p className="mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>
            {location.state?.error || 'Please select a station from the home page.'}
          </p>
          <button
            className="font-bold py-2 px-6 rounded-xl text-white transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
              boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            }}
            onClick={() => navigate(fromRoute)}
          >
            ← Back to {fromRoute === '/home' ? 'Home' : 'Previous Page'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
      </div>

      {/* Main Content */}
      <div className="w-full pt-24 pb-8">
        <div className="w-full max-w-4xl mx-auto relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          {/* Glass card effect */}
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 sm:py-12 px-6 sm:px-8 lg:px-12" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <button
              className="mb-6 font-bold py-2 px-4 rounded-xl text-white transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.8) 0%, rgba(0, 11, 61, 0.6) 100%)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 16px rgba(0, 11, 61, 0.3)'
              }}
              onClick={() => navigate(fromRoute)}
            >
              ← Back to Home
            </button>

            <h1 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: '#000b3d' }}>{stationData.station_name}</h1>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex-1">
                <p className="mb-2" style={{ color: '#000b3d', opacity: 0.8 }}><strong>Location:</strong> {stationData.location_description}</p>
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
                  className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-300 hover:scale-105 flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}
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
              <div className="mb-4 p-3 rounded-lg text-center backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                border: '1px solid rgba(56, 182, 255, 0.3)',
                color: '#000b3d'
              }}>
                {mapMessage}
              </div>
            )}

            {/* Slot Status Indicator */}
            <div className="mb-4 p-4 rounded-xl backdrop-blur-md" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm0 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" clipRule="evenodd"></path>
                  </svg>
                  <span className="font-semibold" style={{ color: '#000b3d' }}>Active Sessions:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    userActiveSessions >= maxActiveSlots 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {userActiveSessions}/{maxActiveSlots}
                  </span>
                  <span className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                    {userActiveSessions >= maxActiveSlots ? 'Limit reached' : 'Available'}
                  </span>
                </div>
              </div>
              {userActiveSessions >= maxActiveSlots && (
                <div className="mt-2 text-sm p-2 rounded backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)',
                  color: '#000b3d'
                }}>
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
              <div className="p-4 rounded-xl backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                border: '1px solid rgba(56, 182, 255, 0.3)'
              }}>
                <span style={{ color: '#000b3d', opacity: 0.8 }}>Free Ports</span>
                <div className="text-2xl font-bold" style={{ color: '#38b6ff' }}>
                  {stationData.num_free_ports}
                </div>
              </div>
              <div className="p-4 rounded-xl backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                border: '1px solid rgba(249, 210, 23, 0.3)'
              }}>
                <span style={{ color: '#000b3d', opacity: 0.8 }}>Premium Ports</span>
                <div className="text-2xl font-bold" style={{ color: '#f9d217' }}>
                  {stationData.available_premium_ports} / {stationData.num_premium_ports}
                </div>
              </div>
            </div>

            {stationData.last_maintenance_message && (
              <div className="mt-6 p-4 rounded-xl backdrop-blur-md" style={{
                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                border: '1px solid rgba(249, 210, 23, 0.3)'
              }}>
                <span className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>🛠️ Last Maintenance: {stationData.last_maintenance_message}</span>
              </div>
            )}

            {session && user?.id && (
              <div className="mt-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Control Charger Ports</h2>
                  <button
                    onClick={() => {
                      syncStationState();
                    }}
                    className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-300 hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                      boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    Refresh Status
                  </button>
                </div>
                {feedback && (
                  <div className="mb-4 text-center font-semibold backdrop-blur-md p-3 rounded-lg" style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#000b3d'
                  }}>{feedback}</div>
                )}
                
                {stationData.num_premium_ports > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {premiumPorts.map(([frontendPortNumber, mappedPortDetails]) => {
                      const currentStatus = getPortDisplayStatus(mappedPortDetails.internalPortNumber);
                      
                      return (
                        <div key={frontendPortNumber} className="group relative backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                        }}>
                          <div className="text-lg font-semibold mb-2" style={{ color: '#000b3d' }}>{mappedPortDetails.label}</div>
                          <div className={`mb-2 text-sm font-bold ${
                            currentStatus.displayStatus.includes('Offline') ? 'text-red-600' : 
                            currentStatus.displayStatus.includes('Your Session') ? 'text-green-600' : 
                            currentStatus.displayStatus.includes('Occupied') ? 'text-orange-600' : 
                            ''
                          }`} style={!currentStatus.displayStatus.includes('Offline') && !currentStatus.displayStatus.includes('Your Session') && !currentStatus.displayStatus.includes('Occupied') ? { color: '#000b3d', opacity: 0.7 } : {}}>
                            {currentStatus.displayStatus}
                          </div>
                          
                          <div className="text-center mb-4">
                            <div className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Current Consumption</div>
                            <div className="text-lg font-bold" style={{ color: '#38b6ff' }}>
                              {currentStatus.isUserSession ? currentStatus.consumption.toFixed(2) : '0.00'} mA
                            </div>
                            <div className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>
                              Daily Total: {getDailyUsage().toFixed(2)} mAh
                            </div>
                          </div>

                          {currentStatus.displayStatus === 'Offline' ? (
                            <button
                              className="font-bold py-2 px-6 rounded-xl text-white cursor-not-allowed"
                              style={{
                                background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.6) 0%, rgba(75, 85, 99, 0.6) 100%)',
                                boxShadow: '0 4px 12px rgba(107, 114, 128, 0.3)'
                              }}
                              disabled
                            >
                              Offline
                            </button>
                          ) : (
                            <button
                              className={`font-bold py-2 px-6 rounded-xl text-white transition-all duration-300 hover:scale-105 ${
                                currentStatus.buttonDisabled ? 'cursor-not-allowed' : ''
                              }`}
                              style={currentStatus.buttonDisabled ? {
                                background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.6) 0%, rgba(75, 85, 99, 0.6) 100%)',
                                boxShadow: '0 4px 12px rgba(107, 114, 128, 0.3)'
                              } : currentStatus.isUserSession ? {
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                              } : {
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                              }}
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
                    <div className="backdrop-blur-xl rounded-2xl p-6" style={{
                      background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                      border: '1px solid rgba(249, 210, 23, 0.3)'
                    }}>
                      <div className="text-lg font-semibold mb-2" style={{ color: '#000b3d' }}>⚠️ Premium Ports Not Available</div>
                      <div style={{ color: '#000b3d', opacity: 0.8 }}>
                        This station does not have any premium charging ports configured.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StationPage;

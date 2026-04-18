import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../utils/apiErrorHandler';
import { openGoogleMaps } from '../utils/mapUtils';
import { supabase } from '../supabaseClient';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function StationPage({ station, navigateTo }) {
  const { user, session, subscription, usageAggregate, handleSessionTimeout } = useAuth();
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

  // Get daily usage from usageAggregate
  const getDailyUsage = useCallback(() => {
    if (!usageAggregate) return 0;
    return parseFloat(usageAggregate.total_consumed || 0);
  }, [usageAggregate]);

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
        
        // Fetch fresh data
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
    console.log(`Starting ${command} for deviceId=${deviceId}, port=${portNumber}, stationId=${stationData.station_id}`);
    
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
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error(`Failed to send control command:`, errorData);
        
        // Handle quota-related errors with better messaging
        if (errorData.error && errorData.error.includes('quota')) {
          alert(`Cannot start charging: ${errorData.error}\n\nPlease visit the Usage page to purchase an extension.`);
        } else if (errorData.error && errorData.error.includes('active charging session')) {
          // Handle slot limit errors
          alert(`Cannot start charging: ${errorData.error}\n\nPlease stop your current charging session before starting a new one.`);
        } else {
          alert(`Error: ${errorData.error || 'Failed to send control command'}\n\nStatus: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('Error sending control command:', error);
      alert(`Error: ${error.message || 'Failed to send control command'}`);
    } finally {
      setLoadingPort(null);
    }
  };

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

  // Compute slot indicator colors based on state
  const getSlotIndicatorState = useCallback(() => {
    const isChargingActive = userActiveSessions > 0;
    const isStationFull = stationData?.num_premium_ports > 0 && 
      (stationData.available_premium_ports || 0) === 0;
    const hasOfflinePort = Object.values(chargerPortStatus).some(
      (s) => s.status_message === 'offline'
    );

    if (hasOfflinePort) {
      return {
        bg: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.2)',
        color: '#b45309',
        label: 'Partial outage',
        subLabel: hasOfflinePort ? '1 port offline' : 'Your sessions'
      };
    }
    if (isStationFull) {
      return {
        bg: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.2)',
        color: '#dc2626',
        label: 'Station full',
        subLabel: 'All slots occupied'
      };
    }
    if (isChargingActive) {
      return {
        bg: 'rgba(56,182,255,0.08)',
        border: '1px solid rgba(56,182,255,0.2)',
        color: '#38b6ff',
        label: 'Charging active',
        subLabel: `Your sessions: ${userActiveSessions} of ${maxActiveSlots} max`
      };
    }
    return {
      bg: 'rgba(16,185,129,0.08)',
      border: '1px solid rgba(16,185,129,0.2)',
      color: '#059669',
      label: 'Slots available',
      subLabel: `Your sessions: ${userActiveSessions} of ${maxActiveSlots} max`
    };
  }, [userActiveSessions, maxActiveSlots, stationData, chargerPortStatus]);

  // Compute port counts
  const portCounts = useMemo(() => {
    const freePorts = stationData?.num_free_ports || 0;
    const premiumPorts = stationData?.available_premium_ports || 0;
    const totalPorts = freePorts + premiumPorts;
    return { freePorts, premiumPorts, totalPorts };
  }, [stationData]);

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

const slotIndicatorState = getSlotIndicatorState();
  const googleMapsUrl = stationData?.latitude && stationData?.longitude 
    ? `https://www.google.com/maps/search/?api=1&query=${stationData.latitude},${stationData.longitude}`
    : null;

  const freePortsCount = stationData?.num_free_ports || 0;
  const premiumPortsCount = stationData?.available_premium_ports || 0;

  return (
    <div className="min-h-dvh flex flex-col relative" style={{ background: '#f1f3e0' }}>
      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex items-center gap-2.5 px-3.5 py-2.5"
          style={{ 
            background: 'rgba(241,243,224,0.92)', 
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}>
          <button 
            onClick={() => navigate(fromRoute)}
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.08)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">
              {stationData?.station_name}
            </p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">
              {stationData?.location_description}
            </p>
          </div>
          {googleMapsUrl && (
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(56,182,255,0.12)', border: '1px solid rgba(56,182,255,0.25)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#38b6ff">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <span className="text-[10px] font-bold" style={{ color: '#38b6ff' }}>Map</span>
            </a>
          )}
        </div>

        {/* Slot Indicator Pill */}
        <div className="mx-3.5 mb-2.5 mt-2 rounded-2xl px-3.5 py-2.5 flex items-center justify-between"
          style={{ background: slotIndicatorState.bg, border: slotIndicatorState.border }}>
          <div>
            <p className="text-xs font-bold" style={{ color: slotIndicatorState.color }}>{slotIndicatorState.label}</p>
            <p className="text-[9px] mt-0.5" style={{ color: slotIndicatorState.color, opacity: 0.7 }}>
              {slotIndicatorState.subLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-black" style={{ color: slotIndicatorState.color }}>
              {activeSessions?.length || 0}/{maxActiveSlots * 2}
            </p>
            <p className="text-[9px] text-gray-400">active now</p>
          </div>
        </div>

        {/* Port Stats Row */}
        <div className="flex gap-2 mx-3.5 mb-2.5">
          <div className="flex-1 flex items-center gap-2 p-3 rounded-2xl"
            style={{ background: 'rgba(56,182,255,0.08)', border: '1px solid rgba(56,182,255,0.15)' }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(56,182,255,0.15)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38b6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div>
              <p className="text-lg font-black" style={{ color: '#38b6ff' }}>{freePortsCount}</p>
              <p className="text-[9px]" style={{ color: '#38b6ff', opacity: 0.6 }}>Free ports</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2 p-3 rounded-2xl"
            style={{ background: 'rgba(249,210,23,0.1)', border: '1px solid rgba(249,210,23,0.25)' }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(249,210,23,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-lg font-black" style={{ color: '#b45309' }}>{premiumPortsCount}</p>
              <p className="text-[9px]" style={{ color: '#b45309', opacity: 0.6 }}>Premium</p>
            </div>
          </div>
        </div>

        {/* Maintenance Alert */}
        {stationData?.last_maintenance_message && (
          <div className="mx-3.5 mb-2.5 flex items-center gap-2 p-3 rounded-2xl"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinejoin="round">
              <path d="M12 2L2 19h20L12 2z"/>
              <path d="M12 9v4M12 16h.01"/>
            </svg>
            <p className="text-xs" style={{ color: '#b45309' }}>{stationData.last_maintenance_message}</p>
          </div>
        )}

        {/* Port Controls Header */}
        {session && user?.id && (
          <>
            <div className="flex justify-between items-center mx-3.5 mb-2">
              <h2 className="text-sm font-bold text-gray-800">Charging ports</h2>
              <button 
                onClick={syncStationState}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                style={{ background: 'rgba(56,182,255,0.1)', border: '1px solid rgba(56,182,255,0.2)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#38b6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                <span className="text-[10px] font-bold" style={{ color: '#38b6ff' }}>Refresh</span>
              </button>
            </div>

            {/* Port Cards */}
            {feedback && (
              <div className="mx-3.5 mb-2.5 text-center text-xs p-2 rounded-xl" style={{
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#059669'
              }}>{feedback}</div>
            )}

            {stationData.num_premium_ports > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 px-3.5">
                {premiumPorts.map(([frontendPortNumber, mappedPortDetails]) => {
                  const portNum = mappedPortDetails.internalPortNumber;
                  const deviceId = stationData?.device_mqtt_id || 'ESP32_CHARGER_STATION_001';
                  const statusKey = `${deviceId}_${portNum}`;
                  const statusData = chargerPortStatus[statusKey] || {};
                  const consumptionInfo = portConsumption[statusKey] || {};
                  const userSessionKey = activeSessions[statusKey];
                  const isPremium = true;
                  const isCharging = !!userSessionKey;
                  const isOffline = statusData.status_message === 'offline';
                  const isOccupied = statusData.charger_state === 'ON' && !userSessionKey;
                  
                  let statusBg, statusColor, statusBorder, statusLabel;
                  if (isOffline) {
                    statusBg = 'rgba(100,116,139,0.1)';
                    statusColor = '#64748b';
                    statusBorder = 'rgba(100,116,139,0.2)';
                    statusLabel = 'Offline';
                  } else if (isCharging) {
                    statusBg = 'rgba(56,182,255,0.1)';
                    statusColor = '#0369a1';
                    statusBorder = 'rgba(56,182,255,0.3)';
                    statusLabel = 'Charging';
                  } else if (isOccupied) {
                    statusBg = 'rgba(56,182,255,0.08)';
                    statusColor = '#64748b';
                    statusBorder = 'rgba(0,0,0,0.08)';
                    statusLabel = 'In use';
                  } else if (isPremium) {
                    statusBg = 'rgba(249,210,23,0.15)';
                    statusColor = '#b45309';
                    statusBorder = 'rgba(249,210,23,0.3)';
                    statusLabel = 'Available';
                  } else {
                    statusBg = 'rgba(16,185,129,0.1)';
                    statusColor = '#059669';
                    statusBorder = 'rgba(16,185,129,0.2)';
                    statusLabel = 'Available';
                  }

                  let btnBg, btnColor, btnBorder, buttonLabel;
                  const isDisabled = isOffline || isOccupied;
                  if (isCharging) {
                    btnBg = 'rgba(239,68,68,0.1)';
                    btnColor = '#dc2626';
                    btnBorder = '1px solid rgba(239,68,68,0.25)';
                    buttonLabel = 'Stop charging';
                  } else if (isDisabled) {
                    btnBg = 'rgba(0,0,0,0.05)';
                    btnColor = '#94a3b8';
                    btnBorder = '1px solid rgba(0,0,0,0.06)';
                    buttonLabel = isOffline ? 'Port offline' : 'Port in use';
                  } else if (isPremium) {
                    btnBg = 'rgba(249,210,23,0.9)';
                    btnColor = '#78350f';
                    btnBorder = 'none';
                    buttonLabel = 'Start charging';
                  } else {
                    btnBg = '#38b6ff';
                    btnColor = '#fff';
                    btnBorder = 'none';
                    buttonLabel = 'Start charging';
                  }

                  return (
                    <div key={frontendPortNumber} className="p-4 rounded-2xl"
                      style={{ 
                        background: 'rgba(255,255,255,0.65)', 
                        border: '1px solid rgba(255,255,255,0.9)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm font-bold text-gray-800">Port {portNum}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {isPremium ? 'Premium · Solar' : 'Standard · Free'}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold"
                          style={{ background: statusBg, color: statusColor, border: statusBorder }}>
                          {statusLabel}
                        </span>
                      </div>
                      
                      {isCharging && (
                        <div className="flex gap-2 mb-3">
                          <div className="flex-1 text-center p-2 rounded-xl"
                            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)' }}>
                            <p className="text-sm font-bold text-gray-800 leading-none">
                              {consumptionInfo.current_consumption ? (consumptionInfo.current_consumption / 1000).toFixed(2) : '0.00'} kWh
                            </p>
                            <p className="text-[9px] text-gray-400 mt-1">consumed</p>
                          </div>
                          <div className="flex-1 text-center p-2 rounded-xl"
                            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)' }}>
                            <p className="text-sm font-bold text-gray-800 leading-none">--</p>
                            <p className="text-[9px] text-gray-400 mt-1">duration</p>
                          </div>
                          <div className="flex-1 text-center p-2 rounded-xl"
                            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)' }}>
                            <p className="text-sm font-bold text-gray-800 leading-none">--</p>
                            <p className="text-[9px] text-gray-400 mt-1">cost</p>
                          </div>
                        </div>
                      )}
                      
                      <button
                        disabled={isDisabled || loadingPort === portNum}
                        onClick={() => handleControlCommand(portNum, isCharging ? 'OFF' : 'ON')}
                        className="w-full py-3 rounded-xl text-sm font-bold"
                        style={{ 
                          background: btnBg, 
                          color: btnColor, 
                          border: btnBorder,
                          cursor: isDisabled ? 'not-allowed' : 'pointer'
                        }}>
                        {loadingPort === portNum ? 'Processing...' : buttonLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mx-3.5 p-4 rounded-2xl text-center"
                style={{ background: 'rgba(249,210,23,0.1)', border: '1px solid rgba(249,210,23,0.25)' }}>
                <p className="text-sm font-semibold" style={{ color: '#b45309' }}>No premium ports available</p>
                <p className="text-xs text-gray-500 mt-1">This station has no premium charging ports configured.</p>
              </div>
            )}
          </>
        )}

        <div className="h-6"></div>
      </div>
    </div>
  );
}

export default StationPage;

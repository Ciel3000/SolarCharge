// =============================================================================
// IMPORTS
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { openGoogleMaps } from '../utils/mapUtils';
import { filterActivePlans } from '../utils/planUtils';
import { useIntervalWithVisibility } from '../utils/usePageVisibility';

// =============================================================================
// MAIN COMPONENT: HomePage
// =============================================================================
// This is the main dashboard page for logged-in users.
// It shows subscription status, usage analytics, device info, and nearby stations.
// Mobile users see a simplified view, desktop users see an enhanced layout.
//
function HomePage({ navigateTo, message, stations: propStations, loadingStations: propLoadingStations }) {
  // Get authentication data from context
  const { session, user, subscription, usageAggregate, plans, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // =============================================================================
  // STATE: Messages and stations data
  // =============================================================================
  const [displayMessage, setDisplayMessage] = useState(message || '');
  const [internalStations, setInternalStations] = useState([]);
  const [internalLoadingStations, setInternalLoadingStations] = useState(true);
  const [stationsInitialized, setStationsInitialized] = useState(false);

  // Use external stations data if provided, otherwise use internal state
  const stations = propStations || internalStations;
  const loadingStations = propLoadingStations !== undefined ? propLoadingStations : internalLoadingStations;

  // =============================================================================
  // STATE: Usage and device data
  // =============================================================================
  const [usage, setUsage] = useState({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyMAH: 0 });
  const [userDevices, setUserDevices] = useState([]);

  // =============================================================================
  // NAVIGATION STATE: Extract message and scroll target from location
  // =============================================================================
  const locationMessage = location.state?.message;
  const scrollToSection = location.state?.scrollTo;
  const searchParams = new URLSearchParams(location.search);
  const filter = searchParams.get('filter');
  const stationId = searchParams.get('station');

  // =============================================================================
  // EFFECT: Display message from props or navigation state
  // =============================================================================
  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
    } else if (locationMessage) {
      setDisplayMessage(locationMessage);
    }
  }, [message, locationMessage]);

  // =============================================================================
  // EFFECT: Scroll to section if specified in navigation state
  // =============================================================================
  useEffect(() => {
    if (scrollToSection) {
      const element = document.getElementById(scrollToSection);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToSection]);

  // =============================================================================
  // EFFECT: Reset stations when navigating to home page
  // =============================================================================
  useEffect(() => {
    if (session && location.pathname === '/home' && stations.length === 0 && !loadingStations) {
      setStationsInitialized(false);
      setInternalStations([]);
      setInternalLoadingStations(true);
    }
  }, [session, location.pathname, stations.length, loadingStations]);

  // =============================================================================
  // EFFECT: Fetch usage analytics when page loads
  // =============================================================================
  useEffect(() => {
    if (session?.access_token && location.pathname === '/home') {
      const fetchUsageAnalytics = async () => {
        try {
          const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
          const res = await fetch(`${BACKEND_URL}/api/user/usage`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (!res.ok) throw new Error('Failed to fetch usage data.');
          const data = await res.json();
          setUsage(data);
        } catch (err) {
          console.error('HomePage: Error fetching usage analytics on navigation:', err.message);
        }
      };

      fetchUsageAnalytics();
    }
  }, [session?.access_token, location.pathname]);

  // =============================================================================
  // EFFECT: Fetch stations data from database
  // =============================================================================
  useEffect(() => {
    async function fetchStationsForHomePage() {
      if (!session) return;
      try {
        setInternalLoadingStations(true);
        setStationsInitialized(true);
        const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${API_BASE}/api/public/stations`);
        if (!res.ok) throw new Error('Failed to fetch stations');
        const data = await res.json();
        setInternalStations(data);
      } catch (err) {
        console.error('HomePage: Error fetching stations:', err.message);
      } finally {
        setInternalLoadingStations(false);
      }
    }

    if (session && !stationsInitialized && internalStations.length === 0 && !propStations) {
      fetchStationsForHomePage();
    } else if (session && (stations.length > 0 || propStations)) {
      setInternalLoadingStations(false);
      setStationsInitialized(true);
    } else if (session && stationsInitialized) {
      setInternalLoadingStations(false);
    }
  }, [session, stationsInitialized, internalStations.length, propStations]);

  // =============================================================================
  // HANDLER: Station click - navigate or open maps
  // =============================================================================
  const handleStationClick = (station) => {
    if (subscription) {
      navigateTo('station', {
        station,
        state: {
          from: '/home',
          message: `Welcome to ${station.station_name}!`
        }
      });
    } else {
      openGoogleMaps(station.location_description, station.latitude, station.longitude);
      setDisplayMessage(`Opening ${station.station_name} location in Google Maps. Get a subscription to access charging controls!`);
    }
  };

  // =============================================================================
  // FUNCTION: Fetch usage analytics from backend
  // =============================================================================
  const fetchUsageAnalytics = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
      const res = await fetch(`${BACKEND_URL}/api/user/usage`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch usage data.');
      const data = await res.json();
      console.log('HomePage: Received usage data:', data);
      setUsage(data);
    } catch (err) {
      console.error('HomePage: Error fetching usage analytics:', err.message);
      setUsage({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyMAH: 0 });
    }
  }, [session?.access_token]);

  // Refresh usage data every 30 seconds when page is visible
  useIntervalWithVisibility(fetchUsageAnalytics, 30000, !!session);

  // =============================================================================
  // FUNCTION: Detect user device information
  // =============================================================================
  // Uses browser user agent to identify device type, brand, and model.
  const detectDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;

    let deviceType = 'unknown';
    let deviceName = 'Unknown Device';
    let deviceModel = 'Unknown Model';

    // Detect Android devices
    if (/Android/i.test(userAgent)) {
      deviceType = 'phone';
      deviceName = 'Android Device';

      let deviceInfo = '';

      const androidMatch = userAgent.match(/Android\s+\d+\.?\d*;\s*(.+?)\s+build/i);
      if (androidMatch) {
        deviceInfo = androidMatch[1].trim();
      }

      if (!deviceInfo) {
        const altMatch = userAgent.match(/Linux;\s*Android\s+\d+\.?\d*;\s*(.+?)\s+Build/i);
        if (altMatch) {
          deviceInfo = altMatch[1].trim();
        }
      }

      if (!deviceInfo) {
        const chromeMatch = userAgent.match(/Mobile.*Android\s+\d+\.?\d*;\s*(.+?)\s+AppleWebKit/i);
        if (chromeMatch) {
          deviceInfo = chromeMatch[1].trim();
        }
      }

      if (deviceInfo) {
        if (deviceInfo.includes('SM-') || deviceInfo.includes('Samsung') || deviceInfo.includes('GT-')) {
          deviceName = 'Samsung Galaxy';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('Pixel') || deviceInfo.includes('G')) {
          deviceName = 'Google Pixel';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('OnePlus') || deviceInfo.includes('ONEPLUS')) {
          deviceName = 'OnePlus';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('Xiaomi') || deviceInfo.includes('Redmi') || deviceInfo.includes('MI ')) {
          deviceName = 'Xiaomi';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('HUAWEI') || deviceInfo.includes('Huawei')) {
          deviceName = 'Huawei';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('OPPO') || deviceInfo.includes('Oppo')) {
          deviceName = 'OPPO';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('vivo') || deviceInfo.includes('Vivo')) {
          deviceName = 'Vivo';
          deviceModel = deviceInfo;
        } else if (deviceInfo.includes('realme') || deviceInfo.includes('Realme')) {
          deviceName = 'Realme';
          deviceModel = deviceInfo;
        } else {
          deviceModel = deviceInfo;
        }
      } else {
        deviceModel = 'Android Mobile';
      }

    // Detect iOS devices
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      if (/iPad/i.test(userAgent)) {
        deviceType = 'tablet';
        deviceName = 'iPad';
      } else if (/iPod/i.test(userAgent)) {
        deviceType = 'phone';
        deviceName = 'iPod Touch';
      } else {
        deviceType = 'phone';
        deviceName = 'iPhone';
      }

      const iosMatch = userAgent.match(/OS\s+(\d+_\d+_\d+)/i);
      if (iosMatch) {
        deviceModel = `iOS ${iosMatch[1].replace(/_/g, '.')}`;
      } else {
        deviceModel = 'iOS Device';
      }

    // Detect Windows computers
    } else if (/Windows/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Windows PC';

      if (/Windows NT 10\.0/i.test(userAgent)) {
        deviceModel = 'Windows 10/11';
      } else if (/Windows NT 6\.3/i.test(userAgent)) {
        deviceModel = 'Windows 8.1';
      } else if (/Windows NT 6\.2/i.test(userAgent)) {
        deviceModel = 'Windows 8';
      } else if (/Windows NT 6\.1/i.test(userAgent)) {
        deviceModel = 'Windows 7';
      } else {
        deviceModel = 'Windows Desktop';
      }
    // Detect Mac computers
    } else if (/Mac/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Mac';

      if (/Mac OS X 10_15/i.test(userAgent) || /Mac OS X 11_/i.test(userAgent) || /Mac OS X 12_/i.test(userAgent) || /Mac OS X 13_/i.test(userAgent)) {
        deviceModel = 'macOS (Recent)';
      } else if (/Mac OS X 10_14/i.test(userAgent)) {
        deviceModel = 'macOS Mojave';
      } else if (/Mac OS X 10_13/i.test(userAgent)) {
        deviceModel = 'macOS High Sierra';
      } else {
        deviceModel = 'macOS';
      }
    // Detect Linux computers
    } else if (/Linux/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Linux PC';

      if (/Ubuntu/i.test(userAgent)) {
        deviceModel = 'Ubuntu';
      } else if (/Fedora/i.test(userAgent)) {
        deviceModel = 'Fedora';
      } else if (/Debian/i.test(userAgent)) {
        deviceModel = 'Debian';
      } else {
        deviceModel = 'Linux';
      }
    // Detect Chromebooks
    } else if (/ChromeOS/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Chromebook';
      deviceModel = 'Chrome OS';
    }

    // Fallback for unknown devices
    if (deviceType === 'unknown') {
      deviceType = 'desktop';
      deviceName = 'Web Browser';
      deviceModel = platform || 'Unknown Platform';
    }

    return { deviceType, deviceName, deviceModel };
  };

  // =============================================================================
  // FUNCTION: Get device charging status from Battery API
  // =============================================================================
  // Queries the browser's Battery API for current charging state and level.
  const getChargingStatus = async () => {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();

        battery.addEventListener('chargingchange', () => {
          console.log('Charging status changed:', battery.charging);
        });

        battery.addEventListener('levelchange', () => {
          console.log('Battery level changed:', battery.level);
        });

        return {
          charging: battery.charging,
          batteryLevel: Math.round(battery.level * 100)
        };
      } catch (error) {
        console.log('Battery API error:', error.message);
        return { charging: false, batteryLevel: null };
      }
    }

    console.log('Battery API not available, using fallback');
    return {
      charging: false,
      batteryLevel: null
    };
  };

  // =============================================================================
  // EFFECT: Detect device and charging status when subscription changes
  // =============================================================================
  // Runs once when user gets a subscription. Detects device and saves to database.
  useEffect(() => {
    if (subscription && session) {
      const deviceInfo = detectDeviceInfo();
      console.log('Detected device info:', deviceInfo);

      getChargingStatus().then(chargingInfo => {
        console.log('Charging info:', chargingInfo);

        const device = {
          ...deviceInfo,
          isCharging: chargingInfo?.charging || false,
          batteryLevel: chargingInfo?.batteryLevel
        };

        console.log('Final device object:', device);
        setUserDevices([device]);

        saveDeviceToDatabase(device);
      });
    }
  }, [subscription, session]);

  // =============================================================================
  // FUNCTION: Save device information to database
  // =============================================================================
  const saveDeviceToDatabase = async (device) => {
    try {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${BACKEND_URL}/api/user/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          device_type: device.deviceType,
          device_name: device.deviceName,
          device_model: device.deviceModel,
          is_charging: device.isCharging,
          current_battery_level: device.batteryLevel
        }),
      });

      if (!response.ok) {
        console.warn('Device API not available yet, continuing without saving to database');
        return;
      }

      console.log('Device information saved successfully');
    } catch (error) {
      console.warn('Error saving device information (API may not be deployed yet):', error);
    }
  };

  // =============================================================================
  // FUNCTION: Update battery level periodically
  // =============================================================================
  const updateBatteryLevel = useCallback(async () => {
    if (subscription && session && userDevices.length > 0) {
      const chargingInfo = await getChargingStatus();
      let updatedDevicesSnapshot = [];
      setUserDevices(prevDevices => {
        updatedDevicesSnapshot = prevDevices.map(device => ({
          ...device,
          isCharging: chargingInfo?.charging || false,
          batteryLevel: chargingInfo?.batteryLevel
        }));
        return updatedDevicesSnapshot;
      });

      if (updatedDevicesSnapshot.length > 0) {
        saveDeviceToDatabase(updatedDevicesSnapshot[0]);
      }
    }
  }, [subscription, session, userDevices.length, saveDeviceToDatabase]);

  // Update battery level every 30 seconds
  useIntervalWithVisibility(updateBatteryLevel, 30000, subscription && session && userDevices.length > 0);

  // =============================================================================
  // HELPER FUNCTIONS: Formatting and calculations
  // =============================================================================

  // Format currency to Philippine Pesos
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0);
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Calculate kWh used from mAh
  const calculateKwhUsage = () => {
    if (!usageAggregate) return 0;
    return (usageAggregate.total_consumed || 0) / 1000;
  };

  // Calculate remaining kWh
  const calculateKwhRemaining = () => {
    if (!usageAggregate) return 0;
    return Math.max(0, (usageAggregate.remaining || 0) / 1000);
  };

  // Calculate usage percentage
  const calculateUsagePercent = () => {
    if (!usageAggregate || !usageAggregate.daily_limit) return 0;
    return Math.min(100, Math.round(((usageAggregate.total_consumed || 0) / usageAggregate.daily_limit) * 100));
  };

  // Get color for station availability indicator
  const getStationAvailabilityColor = (station) => {
    if (!subscription) return 'rgba(255,255,255,0.2)';
    const freePorts = station.num_free_ports || 0;
    const totalPorts = (station.num_free_ports || 0) + (station.num_premium_ports || 0);
    if (totalPorts === 0) return '#ef4444';
    const availabilityRatio = freePorts / totalPorts;
    if (availabilityRatio > 0.5) return '#10b981';
    if (availabilityRatio > 0) return '#f59e0b';
    return '#ef4444';
  };

  // Get text for station availability
  const getStationAvailabilityText = (station) => {
    if (!subscription) return 'Subscribe';
    const freePorts = station.num_free_ports || 0;
    if (freePorts === 0) return 'Full';
    return `${freePorts} open`;
  };

  // =============================================================================
  // RENDER: Loading state
  // =============================================================================
  if (authLoading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mx-auto mb-4" style={{
            borderColor: '#38b6ff',
            borderTopColor: 'transparent'
          }}></div>
          <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // =============================================================================
  // RENDER: Mobile layout (screens smaller than lg breakpoint)
  // =============================================================================
  // Shows: greeting, subscription status, usage stats, device info, nearby stations
  return (
    <div className="min-h-dvh flex flex-col items-start justify-start p-0 text-gray-800 relative" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
        <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)' }}></div>
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl animate-float-delay" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, transparent 70%)' }}></div>
      </div>

      {displayMessage && (
        <div className="fixed top-20 left-0 right-0 p-4 text-center z-50 rounded-lg mx-auto max-w-md shadow-md backdrop-blur-xl" style={{
          background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.2) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: '#000b3d'
        }}>
          {displayMessage}
        </div>
      )}

      {/* =============================================================================
          SECTION: Mobile Layout - User greeting and dashboard
          Shows personalized greeting, subscription status, and usage analytics
      ============================================================================= */}
      <div className="w-full pt-14 pb-20 lg:hidden">
        <div className="px-3">
          {/* User greeting */}
          <div className="flex justify-between items-center py-0.5">
            <div>
              <p className="text-[10px]" style={{ color: 'rgba(0,0,0,0.4)' }}>{getGreeting()}</p>
              <p className="text-base font-bold" style={{ color: '#000b3d' }}>{user?.name || user?.email?.split('@')[0] || 'Welcome'}</p>
            </div>
          </div>

          {/* Subscription status: active or not */}
          {subscription ? (
            <>
              {/* Active plan banner */}
              <div className="mb-1.5 bg-emerald-500/08 border border-emerald-500/40 rounded-xl p-2.5 flex justify-between items-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <div>
                    <p className="text-[10px]" style={{ color: 'rgba(16,185,129,0.8)' }}>{subscription.plan_name || subscription.subscription_plans?.plan_name || 'Solar Plan'}</p>
                  </div>
                </div>
                <p className="text-emerald-500 text-xs font-bold">{calculateKwhRemaining().toFixed(1)} kWh left</p>
              </div>

              {/* Current plan details and usage stats */}
              <div className="mb-1.5 bg-white/7 border rounded-xl p-2.5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(0,0,0,0.5)' }}>Current plan</p>
                <p className="text-sm font-bold" style={{ color: '#000b3d' }}>{subscription.plan_name || subscription.subscription_plans?.plan_name || 'Solar Pro'}</p>
                <p className="text-[10px] mb-1.5" style={{ color: 'rgba(0,0,0,0.45)' }}>Resets daily at midnight</p>

                <div className="flex gap-1.5 mb-1.5">
                  {/* Sessions count */}
                  <div className="flex-1 bg-white/6 rounded-lg p-2 text-center" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                    <p className="text-sky-500 text-lg font-bold">{calculateKwhUsage().toFixed(1)}</p>
                    <p className="text-[8px]" style={{ color: 'rgba(0,0,0,0.35)' }}>kWh used</p>
                  </div>
                  {/* Remaining energy */}
                  <div className="flex-1 bg-white/6 rounded-lg p-2 text-center" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                    <p className="text-sky-500 text-lg font-bold">{calculateKwhRemaining().toFixed(1)}</p>
                    <p className="text-[8px]" style={{ color: 'rgba(0,0,0,0.35)' }}>kWh left</p>
                  </div>
                  {/* Total sessions */}
                  <div className="flex-1 bg-white/6 rounded-lg p-2 text-center" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                    <p className="text-sky-500 text-lg font-bold">{usage.totalSessions || 0}</p>
                    <p className="text-[8px]" style={{ color: 'rgba(0,0,0,0.35)' }}>sessions</p>
                  </div>
                </div>

                {/* Usage progress bar */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px]" style={{ color: 'rgba(0,0,0,0.5)' }}>Daily usage</span>
                    <span className="text-[10px]" style={{ color: 'rgba(0,0,0,0.5)' }}>{calculateUsagePercent()}% used</span>
                  </div>
                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${calculateUsagePercent()}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Connected device display */}
              <div className="mb-1.5 bg-white/7 border rounded-xl p-2.5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(0,0,0,0.5)' }}>Your device</p>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/25 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="2" width="14" height="20" rx="2" stroke="#0ea5e9" strokeWidth="1.8"/>
                      <circle cx="12" cy="17" r="1" fill="#0ea5e9"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: '#000b3d' }}>{userDevices[0]?.deviceName || 'Unknown Device'}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(0,0,0,0.4)' }}>Connected via Bluetooth</p>
                  </div>
                </div>

                {/* Battery indicator */}
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-6 h-3 border rounded-sm relative" style={{ borderColor: 'rgba(0,0,0,0.3)' }}>
                    <div className="absolute right-[-3px] top-1/2 -translate-y-1/2 w-0.5 h-1 rounded-r" style={{ background: 'rgba(0,0,0,0.3)' }}></div>
                    <div className="h-full bg-emerald-500 rounded-sm" style={{ width: `${userDevices[0]?.batteryLevel || 0}%` }}></div>
                  </div>
                  <span className="text-emerald-500 text-xs font-bold">{userDevices[0]?.batteryLevel || 0}%</span>
                  {userDevices[0]?.isCharging && (
                    <span className="ml-auto bg-emerald-500/15 border border-emerald-500/25 rounded-md px-1.5 py-0.5 text-emerald-500 text-[10px] font-semibold">Charging</span>
                  )}
                </div>
              </div>

              {/* Start charging button */}
              <button
                className="w-full bg-sky-500 border-none rounded-xl py-2.5 text-white text-sm font-bold mb-2"
                onClick={() => navigateTo('stations')}
              >
                Start charging session
              </button>
            </>
          ) : (
            <>
              {/* No subscription prompt */}
              <div className="mb-1.5 bg-amber-500/12 border border-amber-500/25 rounded-xl p-2.5 flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 19h20L12 2z" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M12 9v4M12 16h.01" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <div>
                  <p className="text-amber-500 text-sm font-bold">No active plan</p>
                  <p className="text-amber-500/70 text-[10px]">Subscribe to start charging</p>
                </div>
              </div>

              {/* Plan selection heading with See more link */}
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-bold" style={{ color: '#000b3d' }}>Choose a plan</p>
                <p className="text-sky-500 text-xs cursor-pointer" onClick={() => navigateTo('subscription')}>See all</p>
              </div>

              {/* Horizontal scrollable plan cards - limited to top 3 */}
              <div className="flex overflow-x-auto gap-2 pb-2 -mx-3 px-3 snap-x snap-mandatory scrollbar-hide">
                {filterActivePlans(plans).slice(0, 3).map((plan) => (
                  <div key={plan.plan_id} className="flex-shrink-0 w-72 bg-white/6 rounded-xl p-2.5 snap-start" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <p className="text-sm font-bold" style={{ color: '#000b3d' }}>{plan.plan_name}</p>
                        {plan.is_popular && (
                          <span className="bg-sky-500/20 border border-sky-500/40 rounded-md px-1.5 py-0.5 text-sky-500 text-[8px] font-bold">Most popular</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sky-500 text-lg font-bold">{formatCurrency(plan.price)}</p>
                        <p className="text-[8px]" style={{ color: 'rgba(0,0,0,0.3)' }}>/ month</p>
                      </div>
                    </div>
                    <div className="mb-1.5 text-[10px]" style={{ color: 'rgba(0,0,0,0.55)' }}>{plan.description}</div>
                    <div className="mb-2 text-[10px]" style={{ color: 'rgba(0,0,0,0.55)' }}><strong>Daily Limit:</strong> {plan.daily_mah_limit} mAh</div>
                    <button
                      className="w-full bg-sky-500 border-none rounded-lg py-2 text-white text-xs font-bold"
                      onClick={() => navigateTo('subscription')}
                    >
                      Subscribe
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Nearby stations section */}
          <div className="flex justify-between items-center mb-1.5 mt-3">
            <p className="text-sm font-bold" style={{ color: '#000b3d' }}>Nearby stations</p>
            <p className="text-sky-500 text-xs cursor-pointer" onClick={() => navigateTo('stations')}>See all</p>
          </div>

          {/* Station list or loading state */}
          {loadingStations ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent mx-auto mb-1.5" style={{ borderColor: '#38b6ff', borderTopColor: 'transparent' }}></div>
              <p className="text-[10px]" style={{ color: 'rgba(0,0,0,0.4)' }}>Loading stations...</p>
            </div>
          ) : stations.length > 0 ? (
            stations.slice(0, 5).map((station) => (
              <div
                key={station.station_id}
                className="mb-2 bg-white/6 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                onClick={() => handleStationClick(station)}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getStationAvailabilityColor(station) }}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#000b3d' }}>{station.station_name}</p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(0,0,0,0.35)' }}>{station.location_description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: getStationAvailabilityColor(station) }}>{getStationAvailabilityText(station)}</p>
                  <p className="text-[8px] mt-0.5" style={{ color: 'rgba(0,0,0,0.3)' }}>{station.distance || '0.0'} km</p>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>No stations available</p>
            </div>
          )}

          <div className="h-6"></div>
        </div>
      </div>

      {/* =============================================================================
          SECTION: Desktop layout (lg breakpoint and above)
          Shows: hero section with plan/device details, stations grid, and footer
      ============================================================================= */}
      <div className="hidden lg:block w-full pt-20 pb-8">
        {/* Hero features section */}
        <section id="hero-features" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            {/* Shimmer background effect */}
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }}></div>

            <div className="relative z-10">
              {/* Logo and welcome message */}
              <div className="text-center mb-8 animate-fade-in-down">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <img
                    src="/img/solarchargelogo.png"
                    alt="SolarCharge Logo"
                    className="h-12 md:h-16 w-auto drop-shadow-lg animate-logo-float"
                  />
                  <span className="text-3xl md:text-4xl font-black tracking-tight" style={{
                    background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>SolarCharge</span>
                </div>
                {session && (
                  <div className="text-xl md:text-2xl font-semibold" style={{ color: '#000b3d' }}>
                    Welcome back, <span className="font-bold">{user?.email?.split('@')[0] || 'User'}</span>!
                  </div>
                )}
              </div>

              {/* Active subscription view */}
              {subscription ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full animate-fade-in-up">
                  {/* Plan details card */}
                  <div className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                  }}>
                    <h4 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                      <span className="text-2xl">🌟</span> Your Current Plan
                    </h4>
                    <div className="mb-6 text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.7 }}><strong>Daily Limit:</strong> {usageAggregate?.daily_limit || 0} mAh</div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full mb-6">
                      {/* Sessions stat */}
                      <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                        border: '1px solid rgba(56, 182, 255, 0.3)'
                      }}>
                        <span className="text-xl font-bold" style={{ color: '#38b6ff' }}>{usage.totalSessions}</span>
                        <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Sessions</span>
                      </div>
                      {/* Duration stat */}
                      <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                        border: '1px solid rgba(249, 210, 23, 0.3)'
                      }}>
                        <span className="text-xl font-bold" style={{ color: '#f9d217' }}>{usage.totalDuration}</span>
                        <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Minutes</span>
                      </div>
                      {/* Energy stat */}
                      <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                        border: '1px solid rgba(0, 11, 61, 0.3)'
                      }}>
                        <span className="text-lg font-bold" style={{ color: '#000b3d' }}>{usage.totalEnergyMAH ? parseFloat(usage.totalEnergyMAH).toFixed(0) : '0'}</span>
                        <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>mAh Used</span>
                      </div>
                    </div>

                    {/* Energy consumed summary */}
                    <div className="w-full mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: '#000b3d', opacity: 0.8 }}>Energy Consumed (This Month)</span>
                        <span className="text-sm font-bold" style={{ color: '#000b3d' }}>{usage.totalEnergyMAH ? parseFloat(usage.totalEnergyMAH).toFixed(2) : '0.00'} mAh</span>
                      </div>
                    </div>

                    <button
                      className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 w-full mt-auto"
                      style={{
                        background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                        boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                        focusRingColor: 'rgba(56, 182, 255, 0.5)'
                      }}
                      onClick={() => navigateTo('usage')}
                    >
                      <span className="relative z-10">View Usage Details</span>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                      }}></div>
                    </button>
                  </div>

                  {/* Device details card */}
                  <div className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                  }}>
                    <h4 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                      <span className="text-2xl">📱</span> Device Details
                    </h4>
                    {userDevices.length > 0 ? (
                      userDevices.map((device, index) => (
                        <div key={index} className="w-full flex-1 flex flex-col">
                          {/* Device name and model */}
                          <div className="text-center mb-4">
                            <div className="text-lg sm:text-xl font-semibold mb-1" style={{ color: '#000b3d' }}>{device.deviceName}</div>
                            <div className="text-sm sm:text-base mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>{device.deviceModel}</div>

                            {/* Device icon based on type */}
                            <div className="flex justify-center mb-4">
                              <span className="text-4xl sm:text-5xl">
                                {device.deviceType === 'phone' ? '📱' :
                                 device.deviceType === 'tablet' ? '📱' :
                                 device.deviceType === 'laptop' ? '💻' :
                                 device.deviceType === 'desktop' ? '🖥️' : '📱'}
                              </span>
                            </div>
                          </div>

                          {/* Battery level display */}
                          {device.batteryLevel !== null && (
                            <div className="mb-4">
                              <div className="flex items-center justify-center gap-2 p-3 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                border: '1px solid rgba(56, 182, 255, 0.3)'
                              }}>
                                <span className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>Battery:</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-lg font-bold ${
                                    device.batteryLevel <= 20 ? 'text-red-600' :
                                    device.batteryLevel <= 50 ? 'text-yellow-600' :
                                    'text-green-600'
                                  }`}>
                                    {device.batteryLevel}%
                                  </span>
                                  <div className="w-16 h-2 rounded-full overflow-hidden backdrop-blur-md" style={{
                                    background: 'rgba(0, 11, 61, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)'
                                  }}>
                                    <div
                                      className="h-full rounded-full transition-all duration-300"
                                      style={{
                                        width: `${device.batteryLevel}%`,
                                        background: device.batteryLevel <= 20
                                          ? 'linear-gradient(135deg, #ff6b6b 0%, #dc2626 100%)'
                                          : device.batteryLevel <= 50
                                          ? 'linear-gradient(135deg, #f9d217 0%, #f59e0b 100%)'
                                          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                      }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Charging status */}
                          <div className="mt-auto">
                            <div className="flex items-center justify-center gap-2 p-3 rounded-xl backdrop-blur-md" style={{
                              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                              border: '1px solid rgba(255, 255, 255, 0.3)'
                            }}>
                              <span className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>Status:</span>
                              <span className={`text-sm font-semibold ${
                                device.isCharging ? 'text-green-600' : ''
                              }`} style={!device.isCharging ? { color: '#000b3d', opacity: 0.7 } : {}}>
                                {device.isCharging ? '🔌 Charging' : '🔋 Not Charging'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center flex-1 flex flex-col items-center justify-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <div className="text-4xl mb-4">📱</div>
                        <div className="text-sm">Detecting device information...</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* No subscription: show plan selection cards */
                <div className="flex flex-col items-center w-full animate-fade-in-up">
                  <h3 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: '#000b3d' }}>Choose Your Plan</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {filterActivePlans(plans).slice(0, 3).map(plan => (
                      <div key={plan.plan_id} className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                      }}>
                        <div className="text-xl sm:text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>{plan.plan_name}</div>
                        <div className="mb-2" style={{ color: '#000b3d', opacity: 0.7 }}>{plan.description}</div>
                        <div className="mb-2" style={{ color: '#000b3d', opacity: 0.7 }}><strong>Price:</strong> {formatCurrency(plan.price)}</div>
                        <div className="mb-4" style={{ color: '#000b3d', opacity: 0.7 }}><strong>Daily Limit:</strong> {plan.daily_mah_limit} mAh</div>
                        <button
                          className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 w-full"
                          style={{
                            background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)',
                            boxShadow: '0 8px 24px rgba(249, 210, 23, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                            focusRingColor: 'rgba(249, 210, 23, 0.5)'
                          }}
                          onClick={() => navigateTo('subscription')}
                        >
                          <span className="relative z-10">Subscribe</span>
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(249, 210, 23, 0.3) 100%)'
                          }}></div>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =============================================================================
            SECTION: Charging Stations Grid
            Shows all nearby charging stations with availability info
        ============================================================================= */}
        <section id="stations" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-400 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            {/* Section title */}
            <div className="text-center mb-10">
              <h3 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Find a Charging Station</h3>
              <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>Locate and use our solar-powered charging stations across the city</p>
            </div>

            {/* Loading state */}
            {loadingStations ? (
              <div className="col-span-full text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                  borderColor: '#38b6ff',
                  borderTopColor: 'transparent'
                }}></div>
                <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading stations...</p>
              </div>
            ) : stations.length > 0 ? (
              /* Station cards grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {stations.map((station, index) => (
                  <div
                    key={station.station_id}
                    className="group relative backdrop-blur-xl p-6 rounded-2xl text-left transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 cursor-pointer overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                      animationDelay: `${index * 100}ms`
                    }}
                    onClick={() => handleStationClick(station)}
                  >
                    <div className="flex flex-col gap-2">
                      <h4 className="text-2xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h4>
                      {/* Station address */}
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                    </div>

                    {/* Subscription-only details */}
                    {subscription && (
                      <>
                        <div className="space-y-3 mt-6">
                          {/* Free ports count */}
                          <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                            border: '1px solid rgba(56, 182, 255, 0.3)'
                          }}>
                            <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">🔌</span> Free Ports
                            </span>
                            <span className="font-bold" style={{ color: '#38b6ff' }}>{station.num_free_ports}</span>
                          </div>
                          {/* Premium ports count */}
                          <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                            border: '1px solid rgba(249, 210, 23, 0.3)'
                          }}>
                            <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">⚡</span> Premium Ports
                            </span>
                            <span className="font-bold" style={{ color: '#f9d217' }}>{station.available_premium_ports} / {station.num_premium_ports}</span>
                          </div>
                        </div>

                        {/* Maintenance notice */}
                        {station.last_maintenance_message && (
                          <div className="mt-4 p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                            border: '1px solid rgba(249, 210, 23, 0.3)'
                          }}>
                            <p className="text-sm flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">🛠️</span> Last Maintenance: {station.last_maintenance_message}
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Non-subscriber hint */}
                    {!subscription && (
                      <div className="mt-4 text-center text-sm italic" style={{ color: '#000b3d', opacity: 0.6 }}>
                        Tap to view on map. Subscribe for full details and charging.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Empty state - no stations found */
              <div className="col-span-full text-center py-12">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <span className="text-4xl">🔌</span>
                </div>
                <h4 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>No Stations Available</h4>
                <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>No charging stations found at the moment. Please check back later!</p>
              </div>
            )}
          </div>
        </section>

        {/* =============================================================================
            FOOTER: Brand footer
        ============================================================================= */}
        <footer className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-600 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden text-center py-10 sm:py-12 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="flex items-center justify-center mb-4">
              <img
                src="/img/solarchargelogo.png"
                alt="SolarCharge Logo"
                className="h-10 sm:h-12 w-auto mr-3 drop-shadow-lg"
              />
              <h3 className="text-2xl sm:text-3xl font-bold" style={{ color: '#000b3d' }}>SolarCharge</h3>
            </div>
            <p className="text-base sm:text-lg mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>© {new Date().getFullYear()} SolarCharge. All rights reserved.</p>
            <p className="text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.6 }}>Innovating for a sustainable future.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default HomePage;

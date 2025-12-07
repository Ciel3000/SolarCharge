import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // Add React Router hooks
import { useAuth } from '../contexts/AuthContext';
import { openGoogleMaps } from '../utils/mapUtils';
import { filterActivePlans } from '../utils/planUtils';


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

  // Refresh usage data when navigating back to home page
  useEffect(() => {
    if (session?.access_token && location.pathname === '/home') {
      // Fetch fresh usage data when returning to home page
      const fetchUsageAnalytics = async () => {
        try {
          const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';
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
      // For users without subscription, open Google Maps with precise coordinates
      openGoogleMaps(station.location_description, station.latitude, station.longitude);
      
      // Show a helpful message about getting a subscription
      setDisplayMessage(`📍 Opening ${station.station_name} location in Google Maps. Get a subscription to access charging controls!`);
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

  const [usage, setUsage] = useState({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyMAH: 0 });
  const [userDevices, setUserDevices] = useState([]);

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
        console.log('HomePage: Received usage data:', data);
        setUsage(data);
      } catch (err) {
        console.error('HomePage: Error fetching usage analytics:', err.message);
        setUsage({ totalSessions: 0, totalDuration: 0, totalCost: 0, totalEnergyMAH: 0 });
      }
    }
    
    // Initial fetch
    fetchUsageAnalytics();
    
    // Set up interval to refresh usage data every 30 seconds
    const usageInterval = setInterval(fetchUsageAnalytics, 30000);
    
    // Cleanup interval on unmount or session change
    return () => clearInterval(usageInterval);
  }, [session]);

  // Function to detect device information
  const detectDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    const vendor = navigator.vendor;
    
    let deviceType = 'unknown';
    let deviceName = 'Unknown Device';
    let deviceModel = 'Unknown Model';
    
    // Enhanced mobile device detection
    if (/Android/i.test(userAgent)) {
      deviceType = 'phone';
      deviceName = 'Android Device';
      
      // Try multiple patterns for Android device detection
      let deviceInfo = '';
      
      // Pattern 1: Standard Android build pattern
      const androidMatch = userAgent.match(/Android\s+\d+\.?\d*;\s*(.+?)\s+build/i);
      if (androidMatch) {
        deviceInfo = androidMatch[1].trim();
      }
      
      // Pattern 2: Alternative pattern for some mobile browsers
      if (!deviceInfo) {
        const altMatch = userAgent.match(/Linux;\s*Android\s+\d+\.?\d*;\s*(.+?)\s+Build/i);
        if (altMatch) {
          deviceInfo = altMatch[1].trim();
        }
      }
      
      // Pattern 3: Chrome mobile pattern
      if (!deviceInfo) {
        const chromeMatch = userAgent.match(/Mobile.*Android\s+\d+\.?\d*;\s*(.+?)\s+AppleWebKit/i);
        if (chromeMatch) {
          deviceInfo = chromeMatch[1].trim();
        }
      }
      
      // Process device info if found
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
        // Fallback for Android without specific device info
        deviceModel = 'Android Mobile';
      }
      
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
      
      // Try to extract iOS version
      const iosMatch = userAgent.match(/OS\s+(\d+_\d+_\d+)/i);
      if (iosMatch) {
        deviceModel = `iOS ${iosMatch[1].replace(/_/g, '.')}`;
      } else {
        deviceModel = 'iOS Device';
      }
      
    } else if (/Windows/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Windows PC';
      
      // Try to detect Windows version
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
    } else if (/Mac/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Mac';
      
      // Try to detect macOS version
      if (/Mac OS X 10_15/i.test(userAgent) || /Mac OS X 11_/i.test(userAgent) || /Mac OS X 12_/i.test(userAgent) || /Mac OS X 13_/i.test(userAgent)) {
        deviceModel = 'macOS (Recent)';
      } else if (/Mac OS X 10_14/i.test(userAgent)) {
        deviceModel = 'macOS Mojave';
      } else if (/Mac OS X 10_13/i.test(userAgent)) {
        deviceModel = 'macOS High Sierra';
      } else {
        deviceModel = 'macOS';
      }
    } else if (/Linux/i.test(userAgent)) {
      deviceType = 'desktop';
      deviceName = 'Linux PC';
      
      // Try to detect specific Linux distribution
      if (/Ubuntu/i.test(userAgent)) {
        deviceModel = 'Ubuntu';
      } else if (/Fedora/i.test(userAgent)) {
        deviceModel = 'Fedora';
      } else if (/Debian/i.test(userAgent)) {
        deviceModel = 'Debian';
      } else {
        deviceModel = 'Linux';
      }
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

  // Function to get charging status and battery level (if available)
  const getChargingStatus = async () => {
    // Check if Battery API is available
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        
        // Add event listener for charging changes
        battery.addEventListener('chargingchange', () => {
          console.log('Charging status changed:', battery.charging);
        });
        
        // Add event listener for battery level changes
        battery.addEventListener('levelchange', () => {
          console.log('Battery level changed:', battery.level);
        });
        
        return {
          charging: battery.charging,
          batteryLevel: Math.round(battery.level * 100) // Convert to percentage
        };
      } catch (error) {
        console.log('Battery API error:', error.message);
        return { charging: false, batteryLevel: null };
      }
    }
    
    // Fallback: Assume not charging if we can't detect it
    console.log('Battery API not available, using fallback');
    return {
      charging: false, // Assume not charging if we can't detect it
      batteryLevel: null
    };
  };

  // Effect to detect and store device information
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
        
        // Save device information to database
        saveDeviceToDatabase(device);
      });
    }
  }, [subscription, session]);

  // Effect to update battery level periodically
  useEffect(() => {
    if (subscription && session && userDevices.length > 0) {
      const updateBatteryLevel = async () => {
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
      };

    updateBatteryLevel(); // Push immediate telemetry update
      // Update battery level every 30 seconds
      const batteryInterval = setInterval(updateBatteryLevel, 30000);
      
      return () => clearInterval(batteryInterval);
    }
  }, [subscription, session, userDevices.length]);

  // Function to save device information to database
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
        return; // Don't throw error, just continue
      }
      
      console.log('Device information saved successfully');
    } catch (error) {
      console.warn('Error saving device information (API may not be deployed yet):', error);
      // Don't throw error, just continue without saving to database
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0);
  };

  // openGoogleMaps function is now imported from utils/mapUtils.js

  // Only show loading during initial app load, not for tab switches or minor updates
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Animated Background Orbs with brand colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Sun-colored orb */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
        {/* Lightning-colored orb */}
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
        {/* Solar panel colored accent */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
        {/* Additional floating orbs */}
        <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)' }}></div>
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl animate-float-delay" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, transparent 70%)' }}></div>
      </div>

      {/* Message Display (from App.js or internal) */}
      {displayMessage && (
        <div className="fixed top-20 left-0 right-0 p-4 text-center z-50 rounded-lg mx-auto max-w-md shadow-md backdrop-blur-xl" style={{
          background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.2) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: '#000b3d'
        }}>
          {displayMessage}
        </div>
      )}

      {/* Main Content with top padding for fixed nav */}
      <div className="w-full pt-20 pb-8">
        {/* Hero + Features Section */}
        <section id="hero-features" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          {/* Glass card effect */}
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            {/* Shimmer effect overlay */}
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }}></div>
            
            <div className="relative z-10">
              {/* Welcome Header */}
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
            {subscription ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full animate-fade-in-up">
                {/* Left Panel - Current Plan */}
                <div className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                  <h4 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                    <span className="text-2xl">🌟</span> Your Current Plan
                  </h4>
                  <div className="mb-3 text-lg sm:text-xl font-semibold" style={{ color: '#000b3d' }}>{subscription.plan_name}</div>
                  <div className="mb-3 text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.7 }}>{subscription.description}</div>
                  <div className="mb-6 text-sm sm:text-base" style={{ color: '#000b3d', opacity: 0.7 }}><strong>Daily Limit:</strong> {subscription.daily_mah_limit} mAh</div>
                  
                  {/* Usage Analytics - Made more compact */}
                  <div className="grid grid-cols-3 gap-3 w-full mb-6">
                    <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                      border: '1px solid rgba(56, 182, 255, 0.3)'
                    }}>
                      <span className="text-xl font-bold" style={{ color: '#38b6ff' }}>{usage.totalSessions}</span>
                      <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Sessions</span>
                    </div>
                    <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                      border: '1px solid rgba(249, 210, 23, 0.3)'
                    }}>
                      <span className="text-xl font-bold" style={{ color: '#f9d217' }}>{usage.totalDuration}</span>
                      <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Minutes</span>
                    </div>
                    <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                      border: '1px solid rgba(0, 11, 61, 0.3)'
                    }}>
                      <span className="text-lg font-bold" style={{ color: '#000b3d' }}>{usage.totalEnergyMAH ? parseFloat(usage.totalEnergyMAH).toFixed(0) : '0'}</span>
                      <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>mAh Used</span>
                    </div>
                  </div>
                  
                  {/* Energy Consumed and Progress Bar */}
                  <div className="w-full mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium" style={{ color: '#000b3d', opacity: 0.8 }}>Energy Consumed (This Month)</span>
                      <span className="text-sm font-bold" style={{ color: '#000b3d' }}>{usage.totalEnergyMAH ? parseFloat(usage.totalEnergyMAH).toFixed(2) : '0.00'} mAh</span>
                    </div>
                    {(() => {
                      const daysSoFar = new Date().getDate();
                      const monthlyLimit = subscription.daily_mah_limit * daysSoFar;
                      const totalEnergyMAH = parseFloat(usage.totalEnergyMAH) || 0;
                      const percent = monthlyLimit > 0 ? Math.min(100, ((totalEnergyMAH / monthlyLimit) * 100)) : 0;
                      
                      console.log('HomePage Progress Bar Debug:', {
                        daysSoFar,
                        monthlyLimit,
                        totalEnergyMAH,
                        percent,
                        usage: usage.totalEnergyMAH
                      });
                      
                      return (
                        <div className="w-full rounded-full h-3 backdrop-blur-md" style={{
                          background: 'rgba(0, 11, 61, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                          <div
                            className="h-3 rounded-full transition-all duration-500"
                            style={{ 
                              width: `${percent}%`,
                              background: percent < 80 
                                ? 'linear-gradient(135deg, #f9d217 0%, #38b6ff 100%)' 
                                : percent < 100 
                                ? 'linear-gradient(135deg, #f9d217 0%, #ff6b6b 100%)' 
                                : 'linear-gradient(135deg, #ff6b6b 0%, #dc2626 100%)'
                            }}
                          ></div>
                        </div>
                      );
                    })()}
                    <div className="flex justify-end mt-1">
                      <span className="text-xs" style={{ color: '#000b3d', opacity: 0.6 }}>{(() => {
                        const daysSoFar = new Date().getDate();
                        const monthlyLimit = subscription.daily_mah_limit * daysSoFar;
                        const totalEnergyMAH = parseFloat(usage.totalEnergyMAH) || 0;
                        const percent = monthlyLimit > 0 ? Math.min(100, ((totalEnergyMAH / monthlyLimit) * 100)) : 0;
                        return `${Math.round(percent)}% of monthly limit (${monthlyLimit} mAh)`;
                      })()}</span>
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

                {/* Right Panel - Device Details */}
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
                        <div className="text-center mb-4">
                          <div className="text-lg sm:text-xl font-semibold mb-1" style={{ color: '#000b3d' }}>{device.deviceName}</div>
                          <div className="text-sm sm:text-base mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>{device.deviceModel}</div>
                          
                          {/* Device Type Icon */}
                          <div className="flex justify-center mb-4">
                            <span className="text-4xl sm:text-5xl">
                              {device.deviceType === 'phone' ? '📱' : 
                               device.deviceType === 'tablet' ? '📱' : 
                               device.deviceType === 'laptop' ? '💻' : 
                               device.deviceType === 'desktop' ? '🖥️' : '📱'}
                            </span>
                          </div>
                        </div>

                        {/* Battery Level */}
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

                        {/* Charging Status */}
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
              <div className="flex flex-col items-center w-full animate-fade-in-up">
                <h3 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: '#000b3d' }}>Choose Your Plan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {filterActivePlans(plans).map(plan => (
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

        {/* Available Stations Section */}
        <section id="stations" className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in delay-400 px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="text-center mb-10">
              <h3 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>Find a Charging Station</h3>
              <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>Locate and use our solar-powered charging stations across the city</p>
            </div>
            {loadingStations ? (
              <div className="col-span-full text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                  borderColor: '#38b6ff',
                  borderTopColor: 'transparent'
                }}></div>
                <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading stations...</p>
              </div>
            ) : stations.length > 0 ? (
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
                      <p className="text-base flex items-center" style={{ color: '#000b3d', opacity: 0.7 }}>
                        <svg className="w-5 h-5 mr-3" style={{ color: '#38b6ff' }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                        </svg>
                        {station.location_description}
                      </p>
                    </div>

                    {/* Conditional rendering for subscribed users */}
                    {subscription && (
                      <>
                        <div className="space-y-3 mt-6">
                          <div className="flex items-center justify-between p-3 rounded-lg backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                            border: '1px solid rgba(56, 182, 255, 0.3)'
                          }}>
                            <span className="flex items-center" style={{ color: '#000b3d', opacity: 0.8 }}>
                              <span className="mr-2">🔌</span> Free Ports
                            </span>
                            <span className="font-bold" style={{ color: '#38b6ff' }}>{station.num_free_ports}</span>
                          </div>
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

                    {!subscription && (
                      <div className="mt-4 text-center text-sm italic" style={{ color: '#000b3d', opacity: 0.6 }}>
                        Tap to view on map. Subscribe for full details and charging.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
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

        {/* Footer */}
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
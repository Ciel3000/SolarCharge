import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminSystemStatus({ navigateTo, handleSignOut }) {
  const [systemStatus, setSystemStatus] = useState({
    status: 'Loading...',
    lastUpdate: null
  });
  const [batteryLevels, setBatteryLevels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter state for logs
  const [logFilters, setLogFilters] = useState({
    range: '24h',
    type: 'all',
    source: 'all'
  });
  
  // Refs to store interval ID and visibility state
  const statusIntervalRef = useRef(null);
  const isPageVisibleRef = useRef(true);

  // Function to start interval
  const startInterval = useCallback(() => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    statusIntervalRef.current = setInterval(fetchSystemStatus, 30000);
  }, []);

  // Function to stop interval
  const stopInterval = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  }, []);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - stop interval to save resources
        console.log('AdminSystemStatus: Tab hidden, stopping interval');
        isPageVisibleRef.current = false;
        stopInterval();
      } else {
        // Page is visible again - restart interval and fetch fresh data
        console.log('AdminSystemStatus: Tab visible, restarting interval');
        isPageVisibleRef.current = true;
        
        // Immediately fetch fresh data
        fetchSystemStatus();
        
        // Restart interval
        startInterval();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial setup
    if (initialLoad || logs.length === 0) {
      fetchSystemStatus();
      fetchBatteryLevels();
      fetchSystemLogs();
    } else {
      setLoading(false);
    }
    setInitialLoad(false);
    startInterval();

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopInterval();
    };
  }, [logFilters.range, logFilters.type, logFilters.source, initialLoad, logs.length, startInterval, stopInterval]); // Use specific filter properties
  
  async function fetchSystemStatus() {
    try {
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch system status from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/system/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching system status: ${res.statusText}`);
      }
      
      const data = await res.json();
      setSystemStatus(data);
    } catch (error) {
      console.error("System status error:", error);
      setError(error.message);
    }
  }
  
  async function fetchBatteryLevels() {
    try {
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch battery levels from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/stations/battery`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching battery levels: ${res.statusText}`);
      }
      
      const data = await res.json();
      setBatteryLevels(data);
    } catch (error) {
      console.error("Battery levels error:", error);
      setError(error.message);
    }
  }
  
  async function fetchSystemLogs() {
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        range: logFilters.range,
        type: logFilters.type,
        source: logFilters.source
      }).toString();
      
      // Fetch logs from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/logs?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching logs: ${res.statusText}`);
      }
      
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error("Logs error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  
  const handleLogFilterChange = (e) => {
    const { name, value } = e.target;
    setLogFilters({
      ...logFilters,
      [name]: value
    });
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };
  
  // Get color for battery level
  const getBatteryColor = (level) => {
    if (level > 70) {
      return 'bg-green-500';
    } else if (level > 40) {
      return 'bg-yellow-500';
    } else {
      return 'bg-red-500';
    }
  };
  
  // Get color for log type
  const getLogTypeColor = (logType) => {
    switch (logType) {
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'info':
      default:
        return 'text-blue-600';
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-system" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold text-gray-800">System Status</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {/* System Status Card */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800">Overall System Status</h2>
            <div className="mt-4 flex items-center">
              <div
                className={`w-4 h-4 rounded-full mr-2 ${
                  systemStatus.status === 'Operational' ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              ></div>
              <p className="text-2xl font-bold">{systemStatus.status}</p>
            </div>
            <p className="text-gray-600 mt-2">
              Last update: {formatDate(systemStatus.lastUpdate)}
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800">Quick Actions</h2>
            <div className="mt-4 space-y-2">
              <button
                onClick={fetchSystemStatus}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
              >
                Refresh Status
              </button>
              <button
                onClick={() => navigateTo('admin-logs')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded w-full"
              >
                View All Logs
              </button>
            </div>
          </div>
        </div>
        
        {/* Battery Levels */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800">Station Battery Levels</h2>
          
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {batteryLevels.map((station, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <div className="p-4">
                  <h3 className="font-semibold">{station.station_name}</h3>
                  <div className="mt-2 h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBatteryColor(station.level)}`}
                      style={{ width: `${station.level}%` }}
                    ></div>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span>{station.level}%</span>
                    <span className={station.status === 'Critical' ? 'text-red-600' : station.status === 'Warning' ? 'text-yellow-600' : 'text-green-600'}>
                      {station.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* System Logs */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">System Logs</h2>
            
            <div className="flex space-x-2">
              <select
                name="range"
                value={logFilters.range}
                onChange={handleLogFilterChange}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              
              <select
                name="type"
                value={logFilters.type}
                onChange={handleLogFilterChange}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">All Types</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              
              <select
                name="source"
                value={logFilters.source}
                onChange={handleLogFilterChange}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">All Sources</option>
                <option value="backend">Backend</option>
                <option value="mqtt">MQTT</option>
                <option value="api">API</option>
                <option value="auth">Auth</option>
              </select>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-8">
              <p>Loading logs...</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="py-2 px-4 text-left">Time</th>
                    <th className="py-2 px-4 text-left">Type</th>
                    <th className="py-2 px-4 text-left">Source</th>
                    <th className="py-2 px-4 text-left">Message</th>
                    <th className="py-2 px-4 text-left">User</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.log_id} className="border-t">
                      <td className="py-2 px-4 text-sm">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="py-2 px-4">
                        <span className={`font-medium ${getLogTypeColor(log.log_type)}`}>
                          {log.log_type}
                        </span>
                      </td>
                      <td className="py-2 px-4">{log.source}</td>
                      <td className="py-2 px-4">{log.message}</td>
                      <td className="py-2 px-4">{log.user_email || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminSystemStatus; 
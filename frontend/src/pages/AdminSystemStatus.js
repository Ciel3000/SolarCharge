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
  
  // Get color for battery level - Updated to use brand colors
  const getBatteryColor = (level) => {
    if (level > 70) {
      return '#10b981';
    } else if (level > 40) {
      return '#f9d217';
    } else {
      return '#ef4444';
    }
  };
  
  // Get color for log type - Updated to use brand colors
  const getLogTypeColor = (logType) => {
    switch (logType) {
      case 'error':
        return '#ef4444';
      case 'warning':
        return '#f9d217';
      case 'info':
      default:
        return '#38b6ff';
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Lightweight Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ willChange: 'transform' }}>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ 
          background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.05) 50%, transparent 100%)',
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ 
          background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.05) 50%, transparent 100%)',
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}></div>
      </div>

      <Navigation currentPage="admin-system" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>System Status</h1>
          <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Monitor system health and performance</p>
        </div>
        
        {error && (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
          }}>
            <p className="font-semibold" style={{ color: '#dc2626' }}>Error: {error}</p>
          </div>
        )}
        
        {/* System Status Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: '#000b3d' }}>Overall System Status</h2>
            <div className="mt-4 flex items-center">
              <div
                className="w-4 h-4 rounded-full mr-2"
                style={{
                  background: systemStatus.status === 'Operational' ? '#10b981' : '#f9d217'
                }}
              ></div>
              <p className="text-2xl font-bold" style={{ color: '#000b3d' }}>{systemStatus.status}</p>
            </div>
            <p className="mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>
              Last update: {formatDate(systemStatus.lastUpdate)}
            </p>
          </div>
          
          <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: '#000b3d' }}>Quick Actions</h2>
            <div className="mt-4 space-y-2">
              <button
                onClick={fetchSystemStatus}
                className="font-bold py-2 px-4 rounded-xl text-white w-full transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                  boxShadow: '0 4px 12px rgba(56, 182, 255, 0.3)',
                  willChange: 'transform',
                  transform: 'translateZ(0)'
                }}
              >
                Refresh Status
              </button>
              <button
                onClick={() => navigateTo('admin-logs')}
                className="font-bold py-2 px-4 rounded-xl text-white w-full transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)',
                  willChange: 'transform',
                  transform: 'translateZ(0)'
                }}
              >
                View All Logs
              </button>
            </div>
          </div>
        </div>
        
        {/* Battery Levels */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: '#000b3d' }}>Station Battery Levels</h2>
          
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {batteryLevels.map((station, index) => (
              <div key={index} className="relative backdrop-blur-md rounded-xl overflow-hidden p-4" style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.3)'
              }}>
                <h3 className="font-bold mb-2" style={{ color: '#000b3d' }}>{station.station_name}</h3>
                <div className="mt-2 h-4 rounded-full overflow-hidden backdrop-blur-md" style={{
                  background: 'rgba(0, 11, 61, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{ 
                      width: `${station.level}%`,
                      background: station.level > 70 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : station.level > 40
                        ? 'linear-gradient(135deg, #f9d217 0%, #f59e0b 100%)'
                        : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    }}
                  ></div>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span style={{ color: '#000b3d' }}>{station.level}%</span>
                  <span style={{
                    color: station.status === 'Critical' ? '#ef4444' : station.status === 'Warning' ? '#f9d217' : '#10b981'
                  }}>
                    {station.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* System Logs */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>System Logs</h2>
            
            <div className="flex space-x-2">
              <select
                name="range"
                value={logFilters.range}
                onChange={handleLogFilterChange}
                className="rounded-xl px-2 py-1 text-sm transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
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
                className="rounded-xl px-2 py-1 text-sm transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
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
                className="rounded-xl px-2 py-1 text-sm transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
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
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent mx-auto mb-4" style={{
                borderColor: '#38b6ff',
                borderTopColor: 'transparent'
              }}></div>
              <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading logs...</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                    {['Time', 'Type', 'Source', 'Message', 'User'].map(h => (
                      <th key={h} className="py-2 px-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr 
                      key={log.log_id} 
                      className="transition-colors duration-150"
                      style={{ 
                        borderBottom: index < logs.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td className="py-2 px-4 text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="py-2 px-4">
                        <span className="font-medium" style={{
                          color: log.log_type === 'error' ? '#ef4444' : log.log_type === 'warning' ? '#f9d217' : '#38b6ff'
                        }}>
                          {log.log_type}
                        </span>
                      </td>
                      <td className="py-2 px-4" style={{ color: '#000b3d' }}>{log.source}</td>
                      <td className="py-2 px-4" style={{ color: '#000b3d' }}>{log.message}</td>
                      <td className="py-2 px-4" style={{ color: '#000b3d', opacity: 0.7 }}>{log.user_email || 'System'}</td>
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
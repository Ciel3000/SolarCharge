import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminLogs({ navigateTo, handleSignOut }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter and pagination state
  const [filters, setFilters] = useState({
    range: '24h',
    type: 'all',
    source: 'all',
    search: ''
  });
  
  // Filter options
  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' }
  ];
  
  const logTypeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' }
  ];
  
  const sourceOptions = [
    { value: 'all', label: 'All Sources' },
    { value: 'backend', label: 'Backend' },
    { value: 'mqtt', label: 'MQTT' },
    { value: 'api', label: 'API' },
    { value: 'auth', label: 'Authentication' }
  ];
  
  useEffect(() => {
    if (initialLoad || logs.length === 0) {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [filters.range, filters.type, filters.source, initialLoad, logs.length]); // Re-fetch when filters change
  
  async function fetchLogs() {
    try {
      setLoading(true);
      setInitialLoad(false);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        range: filters.range,
        type: filters.type,
        source: filters.source
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
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };
  
  const handleSearchChange = (e) => {
    setFilters({
      ...filters,
      search: e.target.value
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
  
  // Get color for log type - Updated to use brand colors
  const getLogTypeColor = (logType) => {
    switch (logType) {
      case 'error':
        return { color: '#ef4444', background: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.3)' };
      case 'warning':
        return { color: '#f9d217', background: 'rgba(249, 210, 23, 0.2)', border: 'rgba(249, 210, 23, 0.3)' };
      case 'info':
      default:
        return { color: '#38b6ff', background: 'rgba(56, 182, 255, 0.2)', border: 'rgba(56, 182, 255, 0.3)' };
    }
  };
  
  // Filter logs by search term
  const filteredLogs = logs.filter(log => {
    if (!filters.search) return true;
    
    const searchTerm = filters.search.toLowerCase();
    return (
      (log.message && log.message.toLowerCase().includes(searchTerm)) ||
      (log.user_email && log.user_email.toLowerCase().includes(searchTerm)) ||
      (log.source && log.source.toLowerCase().includes(searchTerm))
    );
  });
  
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

      <Navigation currentPage="admin-logs" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>System Logs</h1>
          <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>View and filter system activity logs</p>
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
        
        {/* Filter Controls */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 mb-6" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Time Range
              </label>
              <select
                name="range"
                value={filters.range}
                onChange={handleFilterChange}
                className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
              >
                {timeRangeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Log Type
              </label>
              <select
                name="type"
                value={filters.type}
                onChange={handleFilterChange}
                className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
              >
                {logTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Source
              </label>
              <select
                name="source"
                value={filters.source}
                onChange={handleFilterChange}
                className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
              >
                {sourceOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={handleSearchChange}
                placeholder="Filter by message, user, source..."
                className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
                onFocus={(e) => {
                  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              />
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={fetchLogs}
              className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                boxShadow: '0 4px 12px rgba(56, 182, 255, 0.3)',
                willChange: 'transform',
                transform: 'translateZ(0)'
              }}
            >
              Refresh Logs
            </button>
          </div>
        </div>
        
        {/* Logs Table */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          {loading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                borderColor: '#38b6ff',
                borderTopColor: 'transparent'
              }}></div>
              <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16">
              <p style={{ color: '#000b3d', opacity: 0.7 }}>No logs found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                    {['Time', 'Type', 'Source', 'Message', 'User'].map(h => (
                      <th key={h} className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, index) => {
                    const logColor = getLogTypeColor(log.log_type);
                    return (
                      <tr 
                        key={log.log_id}
                        className="transition-colors duration-150"
                        style={{ 
                          borderBottom: index < filteredLogs.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td className="py-3 px-4 text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium" style={{
                            color: logColor.color,
                            background: logColor.background,
                            border: `1px solid ${logColor.border}`
                          }}>
                            {log.log_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#000b3d' }}>{log.source}</td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#000b3d' }}>{log.message}</td>
                        <td className="py-3 px-4 text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>{log.user_email || 'System'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="px-4 py-3" style={{ background: 'rgba(255, 255, 255, 0.1)', borderTop: '1px solid rgba(255, 255, 255, 0.3)' }}>
            <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
              Showing {filteredLogs.length} of {logs.length} logs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLogs; 
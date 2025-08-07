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
  
  // Get color for log type
  const getLogTypeColor = (logType) => {
    switch (logType) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-50';
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
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-logs" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold text-gray-800">System Logs</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {/* Filter Controls */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Time Range
              </label>
              <select
                name="range"
                value={filters.range}
                onChange={handleFilterChange}
                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                {timeRangeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Log Type
              </label>
              <select
                name="type"
                value={filters.type}
                onChange={handleFilterChange}
                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                {logTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Source
              </label>
              <select
                name="source"
                value={filters.source}
                onChange={handleFilterChange}
                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                {sourceOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={handleSearchChange}
                placeholder="Filter by message, user, source..."
                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={fetchLogs}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Refresh Logs
            </button>
          </div>
        </div>
        
        {/* Logs Table */}
        <div className="mt-6 bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="text-center py-8">
              <p>Loading logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <p>No logs found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLogs.map((log) => (
                    <tr key={log.log_id}>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getLogTypeColor(log.log_type)}`}>
                          {log.log_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{log.source}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{log.message}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{log.user_email || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 sm:px-6">
            <div className="text-sm text-gray-700">
              Showing {filteredLogs.length} of {logs.length} logs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLogs; 
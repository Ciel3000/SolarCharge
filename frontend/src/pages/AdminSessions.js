import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function AdminSessions({ navigateTo, handleSignOut }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState({
    range: 'week',
    station: 'all',
    status: 'all'
  });
  
  useEffect(() => {
    fetchSessions();
  }, [filters]);
  
  async function fetchSessions() {
    try {
      setLoading(true);
      setError(null);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        range: filters.range,
        station: filters.station,
        status: filters.status
      }).toString();
      
      // Fetch sessions from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/sessions?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching sessions: ${res.statusText}`);
      }
      
      const data = await res.json();
      setSessions(data);
    } catch (error) {
      console.error("Sessions error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  
  async function fetchSessionDetails(sessionId) {
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch session details from backend
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/consumption`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching session details: ${res.statusText}`);
      }
      
      const data = await res.json();
      setSelectedSession(data);
      setShowDetails(true);
    } catch (error) {
      console.error("Session details error:", error);
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
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  // Format duration in minutes to hours and minutes
  const formatDuration = (minutes) => {
    if (!minutes) return 'N/A';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours === 0) {
      return `${mins} min`;
    } else if (mins === 0) {
      return `${hours} hr`;
    } else {
      return `${hours} hr ${mins} min`;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-sessions" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold text-gray-800">Charging Sessions</h1>
        
        {/* Filters */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Time Range
              </label>
              <select
                name="range"
                value={filters.range}
                onChange={handleFilterChange}
                className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Station
              </label>
              <select
                name="station"
                value={filters.station}
                onChange={handleFilterChange}
                className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="all">All Stations</option>
                {/* This would be populated with actual station data */}
                <option value="station1">Station 1</option>
                <option value="station2">Station 2</option>
              </select>
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Status
              </label>
              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {showDetails ? (
          <div className="mt-6">
            <button
              onClick={() => setShowDetails(false)}
              className="mb-4 flex items-center text-blue-600 hover:underline"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              Back to Sessions
            </button>
            
            {selectedSession && (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-semibold text-gray-800">
                        Session Details
                      </h2>
                      <p className="text-gray-600">Session ID: {selectedSession.session_id}</p>
                    </div>
                    
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-bold ${
                        selectedSession.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : selectedSession.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {selectedSession.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div>
                      <h3 className="font-semibold text-gray-700">User</h3>
                      <p className="mt-1">{selectedSession.user_name}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">Station</h3>
                      <p className="mt-1">{selectedSession.station_name} (Port {selectedSession.port_number})</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">Start Time</h3>
                      <p className="mt-1">{formatDate(selectedSession.start_time)}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">End Time</h3>
                      <p className="mt-1">{selectedSession.end_time ? formatDate(selectedSession.end_time) : 'Still Active'}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">Duration</h3>
                      <p className="mt-1">{formatDuration(selectedSession.duration_minutes)}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">Energy Consumed</h3>
                      <p className="mt-1">{selectedSession.energy_consumed_kwh} kWh</p>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-700">Cost</h3>
                      <p className="mt-1">${selectedSession.cost}</p>
                    </div>
                  </div>
                  
                  <div className="mt-8">
                    <h3 className="font-semibold text-gray-700">Consumption Chart</h3>
                    <div className="mt-2 h-64 bg-gray-100 rounded flex items-center justify-center">
                      <p className="text-gray-500">Consumption chart would be displayed here</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {loading ? (
              <div className="text-center py-8">
                <p>Loading sessions...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-lg shadow-md">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left">User</th>
                      <th className="py-3 px-4 text-left">Station</th>
                      <th className="py-3 px-4 text-left">Port</th>
                      <th className="py-3 px-4 text-left">Start Time</th>
                      <th className="py-3 px-4 text-left">End Time</th>
                      <th className="py-3 px-4 text-left">Duration</th>
                      <th className="py-3 px-4 text-left">Energy</th>
                      <th className="py-3 px-4 text-left">Cost</th>
                      <th className="py-3 px-4 text-left">Status</th>
                      <th className="py-3 px-4 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id} className="border-t">
                        <td className="py-3 px-4">{session.user_name}</td>
                        <td className="py-3 px-4">{session.station_name}</td>
                        <td className="py-3 px-4">{session.port}</td>
                        <td className="py-3 px-4">{formatDate(session.start_time)}</td>
                        <td className="py-3 px-4">{session.end_time ? formatDate(session.end_time) : '-'}</td>
                        <td className="py-3 px-4">{formatDuration(session.duration)}</td>
                        <td className="py-3 px-4">{session.energy} kWh</td>
                        <td className="py-3 px-4">${session.cost}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              session.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : session.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {session.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => fetchSessionDetails(session.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSessions; 
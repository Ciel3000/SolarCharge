import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminSessions({ navigateTo, handleSignOut }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
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
    if (initialLoad || sessions.length === 0) {
      fetchSessions();
    } else {
      setLoading(false);
    }
  }, [filters, initialLoad, sessions.length]);
  
  async function fetchSessions() {
    try {
      setLoading(true);
      setError(null);
      setInitialLoad(false);
      
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

      <Navigation currentPage="admin-sessions" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>Charging Sessions</h1>
          <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>View and manage all charging sessions</p>
        </div>
        
        {/* Filters */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 mb-6" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Time Range
              </label>
              <select
                name="range"
                value={filters.range}
                onChange={handleFilterChange}
                className="rounded-xl py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Station
              </label>
              <select
                name="station"
                value={filters.station}
                onChange={handleFilterChange}
                className="rounded-xl py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <option value="all">All Stations</option>
                <option value="station1">Station 1</option>
                <option value="station2">Station 2</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                Status
              </label>
              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="rounded-xl py-2 px-3 leading-tight transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#000b3d',
                  backdropFilter: 'blur(10px)'
                }}
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
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
          }}>
            <p className="font-semibold" style={{ color: '#dc2626' }}>Error: {error}</p>
          </div>
        )}
        
        {showDetails ? (
          <div>
            <button
              onClick={() => setShowDetails(false)}
              className="mb-4 flex items-center font-semibold transition-colors duration-200"
              style={{ color: '#38b6ff' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#000b3d'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#38b6ff'}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              Back to Sessions
            </button>
            
            {selectedSession && (
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold mb-1" style={{ color: '#000b3d' }}>
                        Session Details
                      </h2>
                      <p style={{ color: '#000b3d', opacity: 0.7 }}>Session ID: {selectedSession.session_id}</p>
                    </div>
                    
                    <span
                      className="px-3 py-1 rounded-full text-sm font-bold"
                      style={{
                        background: selectedSession.status === 'active'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : selectedSession.status === 'completed'
                          ? 'rgba(56, 182, 255, 0.2)'
                          : 'rgba(249, 210, 23, 0.2)',
                        color: selectedSession.status === 'active'
                          ? '#10b981'
                          : selectedSession.status === 'completed'
                          ? '#38b6ff'
                          : '#f9d217',
                        border: `1px solid ${selectedSession.status === 'active'
                          ? 'rgba(16, 185, 129, 0.3)'
                          : selectedSession.status === 'completed'
                          ? 'rgba(56, 182, 255, 0.3)'
                          : 'rgba(249, 210, 23, 0.3)'}`
                      }}
                    >
                      {selectedSession.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {[
                      { label: 'User', value: selectedSession.user_name },
                      { label: 'Station', value: `${selectedSession.station_name} (Port ${selectedSession.port_number})` },
                      { label: 'Start Time', value: formatDate(selectedSession.start_time) },
                      { label: 'End Time', value: selectedSession.end_time ? formatDate(selectedSession.end_time) : 'Still Active' },
                      { label: 'Duration', value: formatDuration(selectedSession.duration_minutes) },
                      { label: 'Energy Consumed', value: `${selectedSession.energy_consumed_kwh} kWh` },
                      { label: 'Cost', value: `$${selectedSession.cost}` }
                    ].map((item, idx) => (
                      <div key={idx} className="p-4 rounded-xl backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        <h3 className="font-semibold mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>{item.label}</h3>
                        <p style={{ color: '#000b3d' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-8">
                    <h3 className="font-semibold mb-2" style={{ color: '#000b3d' }}>Consumption Chart</h3>
                    <div className="mt-2 h-64 rounded-xl backdrop-blur-md flex items-center justify-center" style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      <p style={{ color: '#000b3d', opacity: 0.6 }}>Consumption chart would be displayed here</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-16 px-8 text-center" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                  borderColor: '#38b6ff',
                  borderTopColor: 'transparent'
                }}></div>
                <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading sessions...</p>
              </div>
            ) : (
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                        {['User', 'Station', 'Port', 'Start Time', 'End Time', 'Duration', 'Energy', 'Cost', 'Status', 'Actions'].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((session, index) => (
                        <tr 
                          key={session.id} 
                          className="transition-colors duration-150"
                          style={{ 
                            borderBottom: index < sessions.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                            background: 'transparent'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{session.user_name}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{session.station_name}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{session.port}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d', opacity: 0.7 }}>{formatDate(session.start_time)}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d', opacity: 0.7 }}>{session.end_time ? formatDate(session.end_time) : '-'}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{formatDuration(session.duration)}</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{session.energy} kWh</td>
                          <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>${session.cost}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className="px-2 py-1 rounded text-xs font-bold"
                              style={{
                                background: session.status === 'active'
                                  ? 'rgba(16, 185, 129, 0.2)'
                                  : session.status === 'completed'
                                  ? 'rgba(56, 182, 255, 0.2)'
                                  : 'rgba(249, 210, 23, 0.2)',
                                color: session.status === 'active'
                                  ? '#10b981'
                                  : session.status === 'completed'
                                  ? '#38b6ff'
                                  : '#f9d217',
                                border: `1px solid ${session.status === 'active'
                                  ? 'rgba(16, 185, 129, 0.3)'
                                  : session.status === 'completed'
                                  ? 'rgba(56, 182, 255, 0.3)'
                                  : 'rgba(249, 210, 23, 0.3)'}`
                              }}
                            >
                              {session.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              onClick={() => fetchSessionDetails(session.id)}
                              className="font-bold py-1 px-3 rounded-xl text-white text-sm transition-all duration-200 hover:scale-105"
                              style={{
                                background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                boxShadow: '0 4px 12px rgba(56, 182, 255, 0.3)',
                                willChange: 'transform',
                                transform: 'translateZ(0)'
                              }}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSessions; 
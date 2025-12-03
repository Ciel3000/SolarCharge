import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminDashboard({ navigateTo, handleSignOut }) {
  const [stats, setStats] = useState({
    users: { total: 0, active: 0 },
    stations: { total: 0, active: 0 },
    ports: { total: 0, available: 0, occupied: 0 },
    sessions: { today: 0, week: 0, month: 0 },
    revenue: { today: 0, week: 0, month: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  
  useEffect(() => {
    // Only fetch data if we haven't already initialized (prevents refetch on tab switch)
    if (initialLoad) {
      fetchDashboardStats();
    } else {
      setLoading(false); // We already have data, no need to load
    }
  }, [initialLoad]);

  async function fetchDashboardStats() {
    try {
      setLoading(true);
      setError(null);
      setInitialLoad(false);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch dashboard stats from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching dashboard stats: ${res.statusText}`);
      }
      
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* Lightweight Animated Background - Optimized for performance */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ willChange: 'transform' }}>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ 
          background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.05) 50%, transparent 100%)',
          willChange: 'transform',
          transform: 'translateZ(0)' // Force GPU acceleration
        }}></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ 
          background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.05) 50%, transparent 100%)',
          willChange: 'transform',
          transform: 'translateZ(0)' // Force GPU acceleration
        }}></div>
      </div>

      <Navigation currentPage="admin-dashboard" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>Admin Dashboard</h1>
          <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Overview of your system statistics</p>
        </div>
        
        {loading ? (
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-16 px-8 text-center" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
              borderColor: '#38b6ff',
              borderTopColor: 'transparent'
            }}></div>
            <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading dashboard data...</p>
          </div>
        ) : error ? (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-6 px-6" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
          }}>
            <p className="font-semibold" style={{ color: '#dc2626' }}>Error: {error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Users Stats Card */}
            <div className="group relative backdrop-blur-xl rounded-2xl p-6" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
              minHeight: '180px',
              transition: 'transform 0.2s ease-out',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md flex-shrink-0" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(56, 182, 255, 0.15) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)'
                }}>
                  <span className="text-xl">👥</span>
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Users</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)',
                  minHeight: '70px'
                }}>
                  <p className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Total</p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: '#38b6ff', minHeight: '32px', display: 'flex', alignItems: 'center' }}>{stats.users.total}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  minHeight: '70px'
                }}>
                  <p className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Active</p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: '#10b981', minHeight: '32px', display: 'flex', alignItems: 'center' }}>{stats.users.active}</p>
                </div>
              </div>
            </div>
            
            {/* Stations Stats Card */}
            <div className="group relative backdrop-blur-xl rounded-2xl p-6" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
              minHeight: '180px',
              transition: 'transform 0.2s ease-out',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.15) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)'
                }}>
                  <span className="text-xl">🔌</span>
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Stations</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)',
                  minHeight: '70px'
                }}>
                  <p className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Total</p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: '#38b6ff', minHeight: '32px', display: 'flex', alignItems: 'center' }}>{stats.stations.total}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  minHeight: '70px'
                }}>
                  <p className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Active</p>
                  <p className="text-2xl font-bold leading-tight" style={{ color: '#10b981', minHeight: '32px', display: 'flex', alignItems: 'center' }}>{stats.stations.active}</p>
                </div>
              </div>
            </div>
            
            {/* Ports Stats Card */}
            <div className="group relative backdrop-blur-xl rounded-2xl p-6" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
              minHeight: '180px',
              transition: 'transform 0.2s ease-out',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(249, 210, 23, 0.15) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)'
                }}>
                  <span className="text-xl">⚡</span>
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Charging Ports</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Total</p>
                  <p className="text-xl font-bold" style={{ color: '#38b6ff' }}>{stats.ports.total}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Available</p>
                  <p className="text-xl font-bold" style={{ color: '#10b981' }}>{stats.ports.available}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Occupied</p>
                  <p className="text-xl font-bold" style={{ color: '#f9d217' }}>{stats.ports.occupied}</p>
                </div>
              </div>
            </div>
            
            {/* Sessions Stats Card */}
            <div className="group relative backdrop-blur-xl rounded-2xl p-6" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
              minHeight: '180px',
              transition: 'transform 0.2s ease-out',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.3) 0%, rgba(56, 182, 255, 0.15) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)'
                }}>
                  <span className="text-xl">📊</span>
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Sessions</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Today</p>
                  <p className="text-xl font-bold" style={{ color: '#38b6ff' }}>{stats.sessions.today}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Week</p>
                  <p className="text-xl font-bold" style={{ color: '#f9d217' }}>{stats.sessions.week}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                  border: '1px solid rgba(0, 11, 61, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Month</p>
                  <p className="text-xl font-bold" style={{ color: '#000b3d' }}>{stats.sessions.month}</p>
                </div>
              </div>
            </div>
            
            {/* Revenue Stats Card */}
            <div className="group relative backdrop-blur-xl rounded-2xl p-6" style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
              minHeight: '180px',
              transition: 'transform 0.2s ease-out',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateZ(0)';
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.15) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <span className="text-xl">💰</span>
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Revenue</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                  border: '1px solid rgba(56, 182, 255, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Today</p>
                  <p className="text-lg font-bold" style={{ color: '#38b6ff' }}>${parseFloat(stats.revenue.today).toFixed(2)}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                  border: '1px solid rgba(249, 210, 23, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Week</p>
                  <p className="text-lg font-bold" style={{ color: '#f9d217' }}>${parseFloat(stats.revenue.week).toFixed(2)}</p>
                </div>
                <div className="p-3 rounded-xl backdrop-blur-md" style={{
                  background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                  border: '1px solid rgba(0, 11, 61, 0.3)'
                }}>
                  <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Month</p>
                  <p className="text-lg font-bold" style={{ color: '#000b3d' }}>${parseFloat(stats.revenue.month).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard; 
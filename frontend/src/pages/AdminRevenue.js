import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminRevenue({ navigateTo, handleSignOut }) {
  const [revenueData, setRevenueData] = useState({
    daily: [],
    weekly: [],
    monthly: [],
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'weekly', 'monthly'
  
  useEffect(() => {
    // Only fetch data if we haven't already initialized (prevents refetch on tab switch)
    if (initialLoad) {
      fetchRevenueData();
    } else {
      setLoading(false); // We already have data, no need to load
    }
  }, [initialLoad]);
  
  async function fetchRevenueData() {
    try {
      setLoading(true);
      setError(null);
      setInitialLoad(false);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch revenue data from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/revenue`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching revenue data: ${res.statusText}`);
      }
      
      const data = await res.json();
      setRevenueData(data);
    } catch (error) {
      console.error("Revenue error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    
    // Format based on the active tab
    if (activeTab === 'daily') {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric'
      }).format(date);
    } else if (activeTab === 'weekly') {
      return `Week of ${new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric'
      }).format(date)}`;
    } else if (activeTab === 'monthly') {
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
      }).format(date);
    }
  };
  
  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'daily':
        return revenueData.daily || [];
      case 'weekly':
        return revenueData.weekly || [];
      case 'monthly':
        return revenueData.monthly || [];
      default:
        return [];
    }
  };
  
  // Calculate total for the current view
  const calculateCurrentTotal = () => {
    const data = getCurrentData();
    return data.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
  };
  
  // Calculate average for the current view
  const calculateCurrentAverage = () => {
    const data = getCurrentData();
    if (data.length === 0) return 0;
    return calculateCurrentTotal() / data.length;
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

      <Navigation currentPage="admin-revenue" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>Revenue Reports</h1>
          <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Track and analyze revenue performance</p>
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
        
        {loading ? (
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-16 px-8 text-center" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
              borderColor: '#38b6ff',
              borderTopColor: 'transparent'
            }}></div>
            <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading revenue data...</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#000b3d' }}>Total Revenue</h2>
                <p className="text-3xl font-bold mt-2" style={{ color: '#10b981' }}>
                  ${parseFloat(revenueData.total || 0).toFixed(2)}
                </p>
              </div>
              
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#000b3d' }}>Current View Total</h2>
                <p className="text-3xl font-bold mt-2" style={{ color: '#38b6ff' }}>
                  ${calculateCurrentTotal().toFixed(2)}
                </p>
                <p className="text-sm mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>
                  {activeTab === 'daily' ? 'Last 7 days' : activeTab === 'weekly' ? 'Last 4 weeks' : 'Last 6 months'}
                </p>
              </div>
              
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#000b3d' }}>Current View Average</h2>
                <p className="text-3xl font-bold mt-2" style={{ color: '#9333ea' }}>
                  ${calculateCurrentAverage().toFixed(2)}
                </p>
                <p className="text-sm mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>
                  Per {activeTab === 'daily' ? 'day' : activeTab === 'weekly' ? 'week' : 'month'}
                </p>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
              boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
              <div className="border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                <nav className="-mb-px flex">
                  {['daily', 'weekly', 'monthly'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="py-4 px-6 font-semibold transition-all duration-200 capitalize"
                      style={{
                        borderBottom: activeTab === tab ? '2px solid #38b6ff' : '2px solid transparent',
                        color: activeTab === tab ? '#38b6ff' : 'rgba(0, 11, 61, 0.6)'
                      }}
                      onMouseEnter={(e) => {
                        if (activeTab !== tab) e.currentTarget.style.color = '#000b3d';
                      }}
                      onMouseLeave={(e) => {
                        if (activeTab !== tab) e.currentTarget.style.color = 'rgba(0, 11, 61, 0.6)';
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </div>
              
              {/* Revenue Chart Placeholder */}
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: '#000b3d' }}>
                  {activeTab === 'daily' ? 'Daily Revenue' : activeTab === 'weekly' ? 'Weekly Revenue' : 'Monthly Revenue'}
                </h2>
                
                <div className="mt-4 h-64 rounded-xl backdrop-blur-md flex items-center justify-center" style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <p style={{ color: '#000b3d', opacity: 0.6 }}>Revenue chart would be displayed here</p>
                </div>
                
                {/* Data Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                        {['Date', 'Revenue', 'Sessions'].map(h => (
                          <th key={h} className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {getCurrentData().map((item, index) => (
                        <tr 
                          key={index} 
                          className="transition-colors duration-150"
                          style={{ 
                            borderBottom: index < getCurrentData().length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <td className="py-3 px-4" style={{ color: '#000b3d' }}>{formatDate(item.date)}</td>
                          <td className="py-3 px-4" style={{ color: '#000b3d' }}>${parseFloat(item.amount || 0).toFixed(2)}</td>
                          <td className="py-3 px-4" style={{ color: '#000b3d' }}>{item.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminRevenue; 
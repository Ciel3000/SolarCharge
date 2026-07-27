import React, { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import { formatCurrency } from '../utils/currencyUtils';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function AdminRevenue({ navigateTo, handleSignOut }) {
  const [revenueData, setRevenueData] = useState({
    daily: [],
    weekly: [],
    monthly: [],
    total: 0
  });
  const [subscriptionAnalytics, setSubscriptionAnalytics] = useState({
    topPlans: [],
    activeSubscriptions: [],
    paymentBreakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('top-plans'); // 'top-plans', 'active', 'payment-types'

  useEffect(() => {
    // Only fetch data if we haven't already initialized (prevents refetch on tab switch)
    if (initialLoad) {
      fetchRevenueData();
      fetchSubscriptionAnalytics();
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
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error("Not authenticated");
      }

      // Fetch revenue data from backend
      const res = await fetch(`${API_BASE}/api/admin/revenue`, {
        headers: {
          'Authorization': `Bearer ${token}`,
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

  async function fetchSubscriptionAnalytics() {
    try {
      // Get authentication token
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error("Not authenticated");
      }

      // Fetch subscription analytics from backend
      const res = await fetch(`${API_BASE}/api/admin/revenue/subscription-analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        throw new Error(`Error fetching subscription analytics: ${res.statusText}`);
      }

      const data = await res.json();
      setSubscriptionAnalytics(data);
    } catch (error) {
      console.error("Subscription analytics error:", error);
      // Don't set main error, just log it
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
                  {formatCurrency(revenueData.total || 0)}
                </p>
              </div>
              
              <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
              }}>
                <h2 className="text-xl font-bold mb-2" style={{ color: '#000b3d' }}>Current View Total</h2>
                <p className="text-3xl font-bold mt-2" style={{ color: '#38b6ff' }}>
                  {formatCurrency(calculateCurrentTotal())}
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
                  {formatCurrency(calculateCurrentAverage())}
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
                          <td className="py-3 px-4" style={{ color: '#000b3d' }}>{formatCurrency(parseFloat(item.amount || 0))}</td>
                          <td className="py-3 px-4" style={{ color: '#000b3d' }}>{item.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                 </div>
               </div>
             </div>

             {/* Subscription Analytics Section */}
             <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden mb-8" style={{ 
               background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
               boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
             }}>
               <div className="p-6">
                 <h2 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>
                   Subscription Analytics
                 </h2>

                 {/* Analytics Tabs */}
                 <div className="flex flex-wrap gap-2 mb-6">
                   {[
                     { id: 'top-plans', label: 'Top Selling Plans', icon: '🏆' },
                     { id: 'active', label: 'Active Subscriptions', icon: '📊' },
                     { id: 'payment-types', label: 'Payment Methods', icon: '💳' }
                   ].map(tab => (
                     <button
                       key={tab.id}
                       onClick={() => setActiveAnalyticsTab(tab.id)}
                       className="px-4 py-2 rounded-full font-semibold transition-all duration-200 flex items-center gap-2"
                       style={{
                         background: activeAnalyticsTab === tab.id
                           ? 'linear-gradient(135deg, #38b6ff 0%, #2563eb 100%)'
                           : 'rgba(255, 255, 255, 0.3)',
                         color: activeAnalyticsTab === tab.id ? '#ffffff' : '#000b3d',
                         boxShadow: activeAnalyticsTab === tab.id
                           ? '0 4px 12px rgba(56, 182, 255, 0.4)'
                           : 'none'
                       }}
                     >
                       <span>{tab.icon}</span>
                       <span>{tab.label}</span>
                     </button>
                   ))}
                 </div>

                 {/* Top Selling Plans Chart */}
                 {activeAnalyticsTab === 'top-plans' && (
                   <div className="space-y-4">
                     {subscriptionAnalytics.topPlans.length === 0 ? (
                       <p className="text-center py-8" style={{ color: '#000b3d', opacity: 0.6 }}>
                         No subscription sales data available yet.
                       </p>
                     ) : (
                       subscriptionAnalytics.topPlans.map((plan, index) => {
                         const maxSales = Math.max(...subscriptionAnalytics.topPlans.map(p => p.totalSales));
                         const barWidth = maxSales > 0 ? (plan.totalSales / maxSales) * 100 : 0;
                         const maxRevenue = Math.max(...subscriptionAnalytics.topPlans.map(p => p.totalRevenue));
                         const revenueBarWidth = maxRevenue > 0 ? (plan.totalRevenue / maxRevenue) * 100 : 0;

                         return (
                           <div key={plan.planId} className="bg-white/30 rounded-xl p-4 backdrop-blur-sm">
                             <div className="flex justify-between items-center mb-2">
                               <div>
                                 <h3 className="font-bold text-lg" style={{ color: '#000b3d' }}>
                                   #{index + 1} {plan.planName}
                                 </h3>
                                 <p className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                                   {plan.durationType} • {formatCurrency(plan.price)}
                                 </p>
                               </div>
                               <div className="text-right">
                                 <p className="text-2xl font-bold" style={{ color: '#10b981' }}>
                                   {plan.totalSales} sales
                                 </p>
                                 <p className="text-sm font-semibold" style={{ color: '#38b6ff' }}>
                                   {formatCurrency(plan.totalRevenue)} revenue
                                 </p>
                               </div>
                             </div>
                             {/* Sales bar */}
                             <div className="h-3 bg-white/50 rounded-full overflow-hidden mb-2">
                               <div
                                 className="h-full rounded-full transition-all duration-500"
                                 style={{
                                   width: `${barWidth}%`,
                                   background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                                 }}
                               ></div>
                             </div>
                             {/* Revenue bar */}
                             <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                               <div
                                 className="h-full rounded-full"
                                 style={{
                                   width: `${revenueBarWidth}%`,
                                   background: 'linear-gradient(90deg, #38b6ff 0%, #60a5fa 100%)'
                                 }}
                               ></div>
                             </div>
                           </div>
                         );
                       })
                     )}
                   </div>
                 )}

                 {/* Active Subscriptions Chart */}
                 {activeAnalyticsTab === 'active' && (
                   <div className="space-y-4">
                     {subscriptionAnalytics.activeSubscriptions.length === 0 ? (
                       <p className="text-center py-8" style={{ color: '#000b3d', opacity: 0.6 }}>
                         No active subscriptions data available.
                       </p>
                     ) : (
                       subscriptionAnalytics.activeSubscriptions.map((sub, index) => {
                         const maxCount = Math.max(...subscriptionAnalytics.activeSubscriptions.map(s => s.activeCount));
                         const barWidth = maxCount > 0 ? (sub.activeCount / maxCount) * 100 : 0;

                         return (
                           <div key={sub.planId} className="bg-white/30 rounded-xl p-4 backdrop-blur-sm">
                             <div className="flex justify-between items-center mb-2">
                               <div>
                                 <h3 className="font-bold text-lg" style={{ color: '#000b3d' }}>
                                   #{index + 1} {sub.planName}
                                 </h3>
                               </div>
                               <div className="text-right">
                                 <p className="text-2xl font-bold" style={{ color: '#9333ea' }}>
                                   {sub.activeCount} active
                                 </p>
                               </div>
                             </div>
                             <div className="h-4 bg-white/50 rounded-full overflow-hidden">
                               <div
                                 className="h-full rounded-full"
                                 style={{
                                   width: `${barWidth}%`,
                                   background: 'linear-gradient(90deg, #9333ea 0%, #a855f7 100%)'
                                 }}
                               ></div>
                             </div>
                           </div>
                         );
                       })
                     )}
                   </div>
                 )}

                 {/* Payment Types Breakdown */}
                 {activeAnalyticsTab === 'payment-types' && (
                   <div className="space-y-4">
                     {subscriptionAnalytics.paymentBreakdown.length === 0 ? (
                       <p className="text-center py-8" style={{ color: '#000b3d', opacity: 0.6 }}>
                         No payment data available.
                       </p>
                     ) : (
                       subscriptionAnalytics.paymentBreakdown.map((payment, index) => {
                         const maxAmount = Math.max(...subscriptionAnalytics.paymentBreakdown.map(p => p.totalAmount));
                         const barWidth = maxAmount > 0 ? (payment.totalAmount / maxAmount) * 100 : 0;

                         return (
                           <div key={payment.paymentType} className="bg-white/30 rounded-xl p-4 backdrop-blur-sm">
                             <div className="flex justify-between items-center mb-2">
                               <div>
                                 <h3 className="font-bold text-lg capitalize" style={{ color: '#000b3d' }}>
                                   {payment.paymentType}
                                 </h3>
                               </div>
                               <div className="text-right">
                                 <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
                                   {formatCurrency(payment.totalAmount)}
                                 </p>
                                 <p className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                                   {payment.count} transactions
                                 </p>
                               </div>
                             </div>
                             <div className="h-4 bg-white/50 rounded-full overflow-hidden">
                               <div
                                 className="h-full rounded-full"
                                 style={{
                                   width: `${barWidth}%`,
                                   background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
                                 }}
                               ></div>
                             </div>
                           </div>
                         );
                       })
                     )}
                   </div>
                 )}
               </div>
             </div>
           </>
         )}
       </div>
     </div>
   );
 }

export default AdminRevenue; 
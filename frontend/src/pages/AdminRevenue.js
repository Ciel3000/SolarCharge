import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function AdminRevenue({ navigateTo, handleSignOut }) {
  const [revenueData, setRevenueData] = useState({
    daily: [],
    weekly: [],
    monthly: [],
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'weekly', 'monthly'
  
  useEffect(() => {
    fetchRevenueData();
  }, []);
  
  async function fetchRevenueData() {
    try {
      setLoading(true);
      setError(null);
      
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
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-revenue" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold text-gray-800">Revenue Reports</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {loading ? (
          <div className="text-center py-8">
            <p>Loading revenue data...</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800">Total Revenue</h2>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  ${parseFloat(revenueData.total || 0).toFixed(2)}
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800">Current View Total</h2>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  ${calculateCurrentTotal().toFixed(2)}
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  {activeTab === 'daily' ? 'Last 7 days' : activeTab === 'weekly' ? 'Last 4 weeks' : 'Last 6 months'}
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800">Current View Average</h2>
                <p className="text-3xl font-bold text-purple-600 mt-2">
                  ${calculateCurrentAverage().toFixed(2)}
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  Per {activeTab === 'daily' ? 'day' : activeTab === 'weekly' ? 'week' : 'month'}
                </p>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="mt-8">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex">
                  <button
                    onClick={() => setActiveTab('daily')}
                    className={`py-4 px-6 ${
                      activeTab === 'daily'
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setActiveTab('weekly')}
                    className={`py-4 px-6 ${
                      activeTab === 'weekly'
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setActiveTab('monthly')}
                    className={`py-4 px-6 ${
                      activeTab === 'monthly'
                        ? 'border-b-2 border-blue-500 text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Monthly
                  </button>
                </nav>
              </div>
              
              {/* Revenue Chart Placeholder */}
              <div className="mt-6 bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800">
                  {activeTab === 'daily' ? 'Daily Revenue' : activeTab === 'weekly' ? 'Weekly Revenue' : 'Monthly Revenue'}
                </h2>
                
                <div className="mt-4 h-64 bg-gray-100 rounded flex items-center justify-center">
                  <p className="text-gray-500">Revenue chart would be displayed here</p>
                </div>
                
                {/* Data Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Revenue</th>
                        <th className="py-3 px-4 text-left">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCurrentData().map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="py-3 px-4">{formatDate(item.date)}</td>
                          <td className="py-3 px-4">${parseFloat(item.amount || 0).toFixed(2)}</td>
                          <td className="py-3 px-4">{item.sessions}</td>
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
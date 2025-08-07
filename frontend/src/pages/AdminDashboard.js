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
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-dashboard" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-3xl font-semibold text-gray-800">Admin Dashboard</h1>
        
        {loading ? (
          <div className="text-center py-8">
            <p>Loading dashboard data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Users Stats Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800">Users</h2>
              <div className="mt-4 flex justify-between">
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="text-2xl font-bold">{stats.users.total}</p>
                </div>
                <div>
                  <p className="text-gray-600">Active</p>
                  <p className="text-2xl font-bold">{stats.users.active}</p>
                </div>
              </div>
            </div>
            
            {/* Stations Stats Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800">Stations</h2>
              <div className="mt-4 flex justify-between">
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="text-2xl font-bold">{stats.stations.total}</p>
                </div>
                <div>
                  <p className="text-gray-600">Active</p>
                  <p className="text-2xl font-bold">{stats.stations.active}</p>
                </div>
              </div>
            </div>
            
            {/* Ports Stats Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800">Charging Ports</h2>
              <div className="mt-4 flex justify-between">
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="text-2xl font-bold">{stats.ports.total}</p>
                </div>
                <div>
                  <p className="text-gray-600">Available</p>
                  <p className="text-2xl font-bold text-green-600">{stats.ports.available}</p>
                </div>
                <div>
                  <p className="text-gray-600">Occupied</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.ports.occupied}</p>
                </div>
              </div>
            </div>
            
            {/* Sessions Stats Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800">Charging Sessions</h2>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-600">Today</p>
                  <p className="text-2xl font-bold">{stats.sessions.today}</p>
                </div>
                <div>
                  <p className="text-gray-600">Week</p>
                  <p className="text-2xl font-bold">{stats.sessions.week}</p>
                </div>
                <div>
                  <p className="text-gray-600">Month</p>
                  <p className="text-2xl font-bold">{stats.sessions.month}</p>
                </div>
              </div>
            </div>
            
            {/* Revenue Stats Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800">Revenue</h2>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-600">Today</p>
                  <p className="text-2xl font-bold">${parseFloat(stats.revenue.today).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Week</p>
                  <p className="text-2xl font-bold">${parseFloat(stats.revenue.week).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Month</p>
                  <p className="text-2xl font-bold">${parseFloat(stats.revenue.month).toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            {/* Recent Sessions Section */}
            <div className="bg-white rounded-lg shadow-md p-6 col-span-full">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-800">Recent Sessions</h2>
                <button
                  onClick={() => navigateTo('admin-sessions')}
                  className="text-blue-600 hover:underline"
                >
                  View All
                </button>
              </div>
              
              <div className="mt-4">
                {/* This would be populated with real session data */}
                <p className="text-gray-600">Loading recent sessions...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard; 
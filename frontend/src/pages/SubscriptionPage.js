// frontend/src/pages/SubscriptionPage.js
// This component displays the user's current subscription details and allows them to manage their subscription.

import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient'; // Adjust path if needed

function SubscriptionPage({ session, navigateTo, handleSignOut }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    async function fetchSubscriptionData() {
      if (!session) return;
      setLoading(true);
      setError('');
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*,subscriptions_plans(*)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') {
        setError('Failed to load subscription data. Please try again.');
        setSubscription(null);
      } else {
        setSubscription(data);
      }
      setLoading(false);
    }
    fetchSubscriptionData();
  }, [session]);

  const fetchUsageData = async () => {
    try {
      // Fetch user's current usage for the billing period
      const { data: usageData, error: usageError } = await supabase
        .from('charging_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('start_time', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      if (usageError) {
        throw usageError;
      }

      // Calculate usage statistics
      const totalSessions = usageData.length;
      const totalDuration = usageData.reduce((sum, session) => {
        const endTime = session.end_time || new Date();
        const duration = new Date(endTime) - new Date(session.start_time);
        return sum + duration;
      }, 0);
      const totalCost = usageData.reduce((sum, session) => sum + (session.total_cost || 0), 0);

      setUsage({
        totalSessions,
        totalDuration: Math.round(totalDuration / (1000 * 60)), // Convert to minutes
        totalCost: totalCost.toFixed(2)
      });
    } catch (err) {
      console.error('Error fetching usage data:', err);
      // Don't set error for usage data as it's not critical
    }
  };

  const getPlanFeatures = (features) => {
    if (!features) return [];
    try {
      return typeof features === 'string' ? JSON.parse(features) : features;
    } catch {
      return [];
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'cancelled':
        return 'text-red-600 bg-red-100';
      case 'expired':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-100 to-blue-200 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading subscription details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-blue-200 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="bg-white rounded-xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-800">My Subscription</h1>
            <div className="flex gap-3">
              <button
                onClick={() => navigateTo('home')}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Back to Home
              </button>
              <button
                onClick={handleSignOut}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
          <p className="text-gray-600">Hello {session.user.email.split('@')[0]}!</p>
        </header>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Subscription Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Current Plan */}
          <div className="bg-white rounded-xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Current Plan</h2>
            
            {subscription ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-700">
                    {subscription.subscription_plans?.plan_name || 'No Plan'}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
                    {subscription.status || 'Unknown'}
                  </span>
                </div>
                
                <div className="text-gray-600">
                  <p className="mb-2">{subscription.subscription_plans?.description || 'No description available'}</p>
                  <p className="font-semibold text-lg text-green-600">
                    ${subscription.subscription_plans?.monthly_fee || 0}/month
                  </p>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Plan Features:</h3>
                  <ul className="space-y-1">
                    {getPlanFeatures(subscription.subscription_plans?.features).map((feature, index) => (
                      <li key={index} className="flex items-center text-gray-600">
                        <span className="text-green-500 mr-2">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t pt-4 space-y-2 text-sm text-gray-600">
                  <p><strong>Start Date:</strong> {formatDate(subscription.start_date)}</p>
                  <p><strong>Next Billing:</strong> {formatDate(subscription.next_billing_date)}</p>
                  {subscription.end_date && (
                    <p><strong>End Date:</strong> {formatDate(subscription.end_date)}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Active Subscription</h3>
                <p className="text-gray-600 mb-4">You don't have an active subscription plan.</p>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                  Choose a Plan
                </button>
              </div>
            )}
          </div>

          {/* Usage Statistics */}
          <div className="bg-white rounded-xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">This Month's Usage</h2>
            
            {usage ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Total Sessions</span>
                      <span className="text-2xl font-bold text-blue-600">{usage.totalSessions}</span>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Total Duration</span>
                      <span className="text-2xl font-bold text-green-600">{usage.totalDuration} min</span>
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Total Cost</span>
                      <span className="text-2xl font-bold text-purple-600">${usage.totalCost}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No Usage Data</h3>
                <p className="text-gray-600">Start charging to see your usage statistics.</p>
              </div>
            )}
          </div>
        </div>

        {/* Billing History */}
        <div className="bg-white rounded-xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Billing History</h2>
          
          {subscription ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-gray-700 font-semibold">Date</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold">Amount</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold">Status</th>
                    <th className="px-4 py-3 text-gray-700 font-semibold">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-3 text-gray-600">{formatDate(subscription.start_date)}</td>
                    <td className="px-4 py-3 text-gray-600">${subscription.subscription_plans?.monthly_fee || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                        {subscription.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Download
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600 text-center py-4">No billing history available.</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-2xl p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Manage Subscription</h2>
          <div className="flex flex-wrap gap-4">
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              Upgrade Plan
            </button>
            <button className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              Change Plan
            </button>
            <button className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              Cancel Subscription
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              Download Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionPage; 
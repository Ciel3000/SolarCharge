// frontend/src/pages/AdminPlans.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function AdminPlans({ navigateTo, handleSignOut }) {
  const { session, user, isAdmin, isLoading } = useAuth();
  
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit', 'view'
  const [formData, setFormData] = useState({
    plan_name: '',
    description: '',
    price: '',
    daily_mah_limit: '',
    max_session_duration_hours: '',
    fast_charging_access: false,
    priority_access: false,
    cooldown_percentage: '',
    cooldown_time_hour: '',
    duration_type: 'monthly',
    duration_value: 1,
    paypal_link: ''
  });

  // Fetch subscription plans from database
  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setInitialLoad(false);
      
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      console.error('Error fetching subscription plans:', err);
      setError(`Failed to load subscription plans: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoad || plans.length === 0) {
      fetchPlans();
    } else {
      setLoading(false);
    }
  }, [initialLoad, plans.length]); // Remove function dependency to prevent re-runs

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Clear form data
  const clearForm = () => {
    setFormData({
      plan_name: '',
      description: '',
      price: '',
      daily_mah_limit: '',
      max_session_duration_hours: '',
      fast_charging_access: false,
      priority_access: false,
      cooldown_percentage: '',
      cooldown_time_hour: '',
      duration_type: 'monthly',
      duration_value: 1,
      paypal_link: ''
    });
  };

  // Open modal for creating new plan
  const handleAddPlan = () => {
    clearForm();
    setModalMode('create');
    setSelectedPlan(null);
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  // Open modal for editing existing plan
  const handleEditPlan = (plan) => {
    setFormData({
      plan_name: plan.plan_name || '',
      description: plan.description || '',
      price: plan.price || '',
      daily_mah_limit: plan.daily_mah_limit || '',
      max_session_duration_hours: plan.max_session_duration_hours || '',
      fast_charging_access: plan.fast_charging_access || false,
      priority_access: plan.priority_access || false,
      cooldown_percentage: plan.cooldown_percentage || '',
      cooldown_time_hour: plan.cooldown_time_hour || '',
      duration_type: plan.duration_type || 'monthly',
      duration_value: plan.duration_value || 1,
      paypal_link: plan.paypal_link || ''
    });
    setSelectedPlan(plan);
    setModalMode('edit');
    setModalMode('edit');
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  // Open modal for viewing plan details
  const handleViewPlan = (plan) => {
    setSelectedPlan(plan);
    setModalMode('view');
    setShowModal(true);
    setError('');
    setSuccess('');
  };

  // Handle form submission (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Validate required fields
      if (!formData.plan_name.trim() || !formData.price || !formData.daily_mah_limit) {
        throw new Error('Plan name, price, and daily limit are required');
      }

      // Convert numeric fields
      const planData = {
        plan_name: formData.plan_name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        daily_mah_limit: parseFloat(formData.daily_mah_limit),
        max_session_duration_hours: formData.max_session_duration_hours ? parseFloat(formData.max_session_duration_hours) : null,
        fast_charging_access: formData.fast_charging_access,
        priority_access: formData.priority_access,
        cooldown_percentage: formData.cooldown_percentage ? parseFloat(formData.cooldown_percentage) : null,
        cooldown_time_hour: formData.cooldown_time_hour ? parseFloat(formData.cooldown_time_hour) : null,
        duration_type: formData.duration_type,
        duration_value: parseInt(formData.duration_value),
        paypal_link: formData.paypal_link.trim() || null
      };

      let result;
      if (modalMode === 'create') {
        result = await supabase
          .from('subscription_plans')
          .insert([planData])
          .select();
      } else {
        result = await supabase
          .from('subscription_plans')
          .update(planData)
          .eq('plan_id', selectedPlan.plan_id)
          .select();
      }

      if (result.error) throw result.error;

      setSuccess(`Plan ${modalMode === 'create' ? 'created' : 'updated'} successfully!`);
      setShowModal(false);
      await fetchPlans(); // Refresh the list
      clearForm();
    } catch (err) {
      console.error(`Error ${modalMode === 'create' ? 'creating' : 'updating'} plan:`, err);
      setError(`Failed to ${modalMode === 'create' ? 'create' : 'update'} plan: ${err.message}`);
    }
  };

  // Handle plan deletion
  const handleDeletePlan = async (plan) => {
    if (!window.confirm(`Are you sure you want to delete the plan "${plan.plan_name}"? This action cannot be undone and may affect existing subscriptions.`)) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      // First, check if there are any active subscriptions using this plan
      const { data: activeSubscriptions, error: checkError } = await supabase
        .from('user_subscription')
        .select('user_subscription_id, user_id, is_active')
        .eq('plan_id', plan.plan_id)
        .eq('is_active', true);

      if (checkError) throw checkError;

      if (activeSubscriptions && activeSubscriptions.length > 0) {
        const subscriptionCount = activeSubscriptions.length;
        const confirmDeactivate = window.confirm(
          `Cannot delete plan "${plan.plan_name}" because it has ${subscriptionCount} active subscription(s).\n\n` +
          `Would you like to deactivate this plan instead? This will:\n` +
          `• Keep existing subscriptions active\n` +
          `• Prevent new users from subscribing to this plan\n` +
          `• Allow you to delete the plan later when no active subscriptions remain`
        );

        if (confirmDeactivate) {
          // Deactivate the plan instead of deleting it
          const { error: deactivateError } = await supabase
            .from('subscription_plans')
            .update({ 
              plan_name: `${plan.plan_name} (DISCONTINUED)`,
              description: plan.description ? `${plan.description} - This plan has been discontinued.` : 'This plan has been discontinued.',
              updated_at: new Date().toISOString()
            })
            .eq('plan_id', plan.plan_id);

          if (deactivateError) throw deactivateError;

          setSuccess(`Plan "${plan.plan_name}" has been discontinued. It will no longer appear for new subscriptions.`);
          await fetchPlans(); // Refresh the list
        }
        return;
      }

      // If no active subscriptions, proceed with deletion
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('plan_id', plan.plan_id);

      if (error) throw error;

      setSuccess('Plan deleted successfully!');
      await fetchPlans(); // Refresh the list
    } catch (err) {
      console.error('Error deleting plan:', err);
      setError(`Failed to delete plan: ${err.message}`);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get duration display text
  const getDurationDisplayText = (durationType, durationValue) => {
    switch (durationType) {
      case 'daily':
        return durationValue === 1 ? '1 Day' : `${durationValue} Days`;
      case 'weekly':
        return durationValue === 1 ? '1 Week' : `${durationValue} Weeks`;
      case 'monthly':
        return durationValue === 1 ? '1 Month' : `${durationValue} Months`;
      case 'quarterly':
        return durationValue === 1 ? '3 Months' : `${durationValue * 3} Months`;
      case 'yearly':
        return durationValue === 1 ? '1 Year' : `${durationValue} Years`;
      default:
        return '1 Month';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
          <button
            onClick={() => navigateTo('home')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Subscription Plans Management</h1>
              <p className="text-gray-600 mt-2">Create, edit, and manage subscription plans</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleAddPlan}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                <span className="mr-2">+</span>Add New Plan
              </button>
              <button
                onClick={handleSignOut}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* Plans List */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Current Subscription Plans</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading plans...</p>
            </div>
          ) : plans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Limit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PayPal Link</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Features</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {plans.map((plan) => (
                    <tr key={plan.plan_id} className="hover:bg-gray-50">
                                             <td className="px-6 py-4 whitespace-nowrap">
                         <div>
                           <div className={`text-sm font-medium ${plan.plan_name.includes('(DISCONTINUED)') ? 'text-red-600 line-through' : 'text-gray-900'}`}>
                             {plan.plan_name}
                           </div>
                           <div className="text-sm text-gray-500">{plan.description}</div>
                           {plan.plan_name.includes('(DISCONTINUED)') && (
                             <div className="text-xs text-red-500 font-medium mt-1">DISCONTINUED</div>
                           )}
                         </div>
                       </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formatCurrency(plan.price)}</div>
                        <div className="text-sm text-gray-500">
                          per {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1).toLowerCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {plan.duration_type === 'daily' ? 'Day pass' : 
                           plan.duration_type === 'weekly' ? 'Week pass' : 
                           plan.duration_type === 'monthly' ? 'Month pass' : 
                           plan.duration_type === 'quarterly' ? 'Quarter pass' : 
                           plan.duration_type === 'yearly' ? 'Year pass' : 'Subscription'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{plan.daily_mah_limit} mAh</div>
                        {plan.max_session_duration_hours && (
                          <div className="text-sm text-gray-500">{plan.max_session_duration_hours}h max session</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plan.paypal_link ? (
                          <a
                            href={plan.paypal_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm underline"
                          >
                            View Link
                          </a>
                        ) : (
                          <span className="text-gray-400 text-sm">No link</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {plan.fast_charging_access && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Fast Charging
                            </span>
                          )}
                          {plan.priority_access && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Priority Access
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(plan.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewPlan(plan)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleEditPlan(plan)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Edit
                          </button>
                                                     <button
                             onClick={() => handleDeletePlan(plan)}
                             className={`${plan.plan_name.includes('(DISCONTINUED)') ? 'text-orange-600 hover:text-orange-900' : 'text-red-600 hover:text-red-900'}`}
                           >
                             {plan.plan_name.includes('(DISCONTINUED)') ? 'Force Delete' : 'Delete'}
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-gray-500 text-lg mb-4">No subscription plans found</div>
              <button
                onClick={handleAddPlan}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Create First Plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for Create/Edit/View */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {modalMode === 'create' ? 'Create New Plan' : 
                   modalMode === 'edit' ? 'Edit Plan' : 'Plan Details'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {modalMode === 'view' ? (
                // View Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Plan Name</label>
                      <p className="text-sm text-gray-900">{selectedPlan?.plan_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Price</label>
                      <p className="text-sm text-gray-900">
                        {formatCurrency(selectedPlan?.price)} per {getDurationDisplayText(selectedPlan?.duration_type || 'monthly', selectedPlan?.duration_value || 1).toLowerCase()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Duration</label>
                      <p className="text-sm text-gray-900">
                        {getDurationDisplayText(selectedPlan?.duration_type || 'monthly', selectedPlan?.duration_value || 1)}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Daily Limit</label>
                      <p className="text-sm text-gray-900">{selectedPlan?.daily_mah_limit || 'N/A'} mAh</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Max Session Duration</label>
                      <p className="text-sm text-gray-900">{selectedPlan?.max_session_duration_hours || 'Unlimited'} hours</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <p className="text-sm text-gray-900">{selectedPlan?.description || 'No description'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fast Charging Access</label>
                      <p className="text-sm text-gray-900">{selectedPlan?.fast_charging_access ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Priority Access</label>
                      <p className="text-sm text-gray-900">{selectedPlan?.priority_access ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setShowModal(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => handleEditPlan(selectedPlan)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      Edit Plan
                    </button>
                  </div>
                </div>
              ) : (
                // Create/Edit Mode
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="plan_name" className="block text-sm font-medium text-gray-700">
                        Plan Name *
                      </label>
                      <input
                        type="text"
                        id="plan_name"
                        name="plan_name"
                        value={formData.plan_name}
                        onChange={handleInputChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                        Price (PHP) *
                      </label>
                      <input
                        type="number"
                        id="price"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        step="0.01"
                        min="0"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows="3"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="duration_type" className="block text-sm font-medium text-gray-700">
                        Duration Type *
                      </label>
                      <select
                        id="duration_type"
                        name="duration_type"
                        value={formData.duration_type}
                        onChange={handleInputChange}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="duration_value" className="block text-sm font-medium text-gray-700">
                        Duration Value *
                      </label>
                      <input
                        type="number"
                        id="duration_value"
                        name="duration_value"
                        value={formData.duration_value}
                        onChange={handleInputChange}
                        min="1"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="paypal_link" className="block text-sm font-medium text-gray-700">
                      PayPal Payment Link
                    </label>
                    <input
                      type="url"
                      id="paypal_link"
                      name="paypal_link"
                      value={formData.paypal_link}
                      onChange={handleInputChange}
                      placeholder="https://www.paypal.com/paypalme/yourusername/amount"
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Direct PayPal payment link for this plan (optional)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="daily_mah_limit" className="block text-sm font-medium text-gray-700">
                        Daily Limit (mAh) *
                      </label>
                      <input
                        type="number"
                        id="daily_mah_limit"
                        name="daily_mah_limit"
                        value={formData.daily_mah_limit}
                        onChange={handleInputChange}
                        step="0.1"
                        min="0"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="max_session_duration_hours" className="block text-sm font-medium text-gray-700">
                        Max Session Duration (hours)
                      </label>
                      <input
                        type="number"
                        id="max_session_duration_hours"
                        name="max_session_duration_hours"
                        value={formData.max_session_duration_hours}
                        onChange={handleInputChange}
                        step="0.5"
                        min="0"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cooldown_percentage" className="block text-sm font-medium text-gray-700">
                        Cooldown Percentage
                      </label>
                      <input
                        type="number"
                        id="cooldown_percentage"
                        name="cooldown_percentage"
                        value={formData.cooldown_percentage}
                        onChange={handleInputChange}
                        step="0.1"
                        min="0"
                        max="100"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="cooldown_time_hour" className="block text-sm font-medium text-gray-700">
                        Cooldown Time (hours)
                      </label>
                      <input
                        type="number"
                        id="cooldown_time_hour"
                        name="cooldown_time_hour"
                        value={formData.cooldown_time_hour}
                        onChange={handleInputChange}
                        step="0.1"
                        min="0"
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fast_charging_access"
                        name="fast_charging_access"
                        checked={formData.fast_charging_access}
                        onChange={handleInputChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="fast_charging_access" className="ml-2 block text-sm text-gray-900">
                        Fast Charging Access
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="priority_access"
                        name="priority_access"
                        checked={formData.priority_access}
                        onChange={handleInputChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="priority_access" className="ml-2 block text-sm text-gray-900">
                        Priority Access
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      {modalMode === 'create' ? 'Create Plan' : 'Update Plan'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPlans; 
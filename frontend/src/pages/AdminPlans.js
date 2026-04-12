// frontend/src/pages/AdminPlans.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

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
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.05) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.05) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mx-auto mb-4" style={{
            borderColor: '#38b6ff',
            borderTopColor: 'transparent'
          }}></div>
          <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.05) 50%, transparent 100%)' }}></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.05) 50%, transparent 100%)' }}></div>
        </div>
        <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 text-center" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#ef4444' }}>Access Denied</h1>
          <p className="mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>You don't have permission to access this page.</p>
          <button
            onClick={() => navigateTo('home')}
            className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
              boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

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

      <Navigation currentPage="admin-plans" navigateTo={navigateTo} handleSignOut={handleSignOut} />

      <div className="w-full max-w-7xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
        animation: 'fade-in 0.6s ease-out forwards',
        willChange: 'opacity, transform'
      }}>
        {/* Header - Wrapped in its own glass card */}
        <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>Subscription Plans Management</h1>
              <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Create, edit, and manage subscription plans</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleAddPlan}
                className="font-bold py-2 px-6 rounded-xl text-white transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  willChange: 'transform',
                  transform: 'translateZ(0)'
                }}
              >
                <span className="mr-2">+</span>Add New Plan
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
          }}>
            <p className="font-semibold" style={{ color: '#dc2626' }}>{error}</p>
          </div>
        )}
        {success && (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)',
            borderColor: 'rgba(16, 185, 129, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(16, 185, 129, 0.15)'
          }}>
            <p className="font-semibold" style={{ color: '#059669' }}>{success}</p>
          </div>
        )}

        {/* Plans List */}
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
          boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
          <div className="px-6 py-4" style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
            <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>Current Subscription Plans</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                borderColor: '#38b6ff',
                borderTopColor: 'transparent'
              }}></div>
              <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading plans...</p>
            </div>
          ) : plans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                    {['Plan Name', 'Price', 'Duration', 'Daily Limit', 'PayPal Link', 'Features', 'Created', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan, index) => (
                    <tr 
                      key={plan.plan_id} 
                      className="transition-colors duration-150"
                      style={{ 
                        borderBottom: index < plans.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className={`text-sm font-medium ${plan.plan_name.includes('(DISCONTINUED)') ? 'line-through' : ''}`} style={{
                            color: plan.plan_name.includes('(DISCONTINUED)') ? '#ef4444' : '#000b3d'
                          }}>
                            {plan.plan_name}
                          </div>
                          <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>{plan.description}</div>
                          {plan.plan_name.includes('(DISCONTINUED)') && (
                            <div className="text-xs font-medium mt-1" style={{ color: '#ef4444' }}>DISCONTINUED</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: '#000b3d' }}>{formatCurrency(plan.price)}</div>
                        <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                          per {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1).toLowerCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: '#000b3d' }}>
                          {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1)}
                        </div>
                        <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                          {plan.duration_type === 'daily' ? 'Day pass' : 
                           plan.duration_type === 'weekly' ? 'Week pass' : 
                           plan.duration_type === 'monthly' ? 'Month pass' : 
                           plan.duration_type === 'quarterly' ? 'Quarter pass' : 
                           plan.duration_type === 'yearly' ? 'Year pass' : 'Subscription'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium" style={{ color: '#000b3d' }}>{plan.daily_mah_limit} mAh</div>
                        {plan.max_session_duration_hours && (
                          <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>{plan.max_session_duration_hours}h max session</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {plan.paypal_link ? (
                          <a
                            href={plan.paypal_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm underline transition-colors duration-200"
                            style={{ color: '#38b6ff' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#000b3d'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#38b6ff'}
                          >
                            View Link
                          </a>
                        ) : (
                          <span className="text-sm" style={{ color: '#000b3d', opacity: 0.4 }}>No link</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {plan.fast_charging_access && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium" style={{
                              background: 'rgba(56, 182, 255, 0.2)',
                              color: '#38b6ff',
                              border: '1px solid rgba(56, 182, 255, 0.3)'
                            }}>
                              Fast Charging
                            </span>
                          )}
                          {plan.priority_access && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium" style={{
                              background: 'rgba(147, 51, 234, 0.2)',
                              color: '#9333ea',
                              border: '1px solid rgba(147, 51, 234, 0.3)'
                            }}>
                              Priority Access
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>
                        {formatDate(plan.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewPlan(plan)}
                            className="font-semibold transition-colors duration-200"
                            style={{ color: '#38b6ff' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#000b3d'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#38b6ff'}
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleEditPlan(plan)}
                            className="font-semibold transition-colors duration-200"
                            style={{ color: '#9333ea' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#000b3d'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#9333ea'}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan)}
                            className="font-semibold transition-colors duration-200"
                            style={{ color: plan.plan_name.includes('(DISCONTINUED)') ? '#f9d217' : '#ef4444' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = plan.plan_name.includes('(DISCONTINUED)') ? '#000b3d' : '#dc2626'}
                            onMouseLeave={(e) => e.currentTarget.style.color = plan.plan_name.includes('(DISCONTINUED)') ? '#f9d217' : '#ef4444'}
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
              <div className="text-lg mb-4" style={{ color: '#000b3d', opacity: 0.6 }}>No subscription plans found</div>
              <button
                onClick={handleAddPlan}
                className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                  boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                }}
              >
                Create First Plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for Create/Edit/View */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 backdrop-blur-sm flex items-start justify-center pt-20 pb-20">
          <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 w-full max-w-2xl" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold" style={{ color: '#000b3d' }}>
                {modalMode === 'create' ? 'Create New Plan' : 
                 modalMode === 'edit' ? 'Edit Plan' : 'Plan Details'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="transition-colors duration-200"
                style={{ color: '#000b3d', opacity: 0.6 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
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
                    {[
                      { label: 'Plan Name', value: selectedPlan?.plan_name },
                      { label: 'Price', value: `${formatCurrency(selectedPlan?.price)} per ${getDurationDisplayText(selectedPlan?.duration_type || 'monthly', selectedPlan?.duration_value || 1).toLowerCase()}` },
                      { label: 'Duration', value: getDurationDisplayText(selectedPlan?.duration_type || 'monthly', selectedPlan?.duration_value || 1) },
                      { label: 'Daily Limit', value: `${selectedPlan?.daily_mah_limit || 'N/A'} mAh` },
                      { label: 'Max Session Duration', value: `${selectedPlan?.max_session_duration_hours || 'Unlimited'} hours` }
                    ].map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>{item.label}</label>
                        <p className="text-sm" style={{ color: '#000b3d' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-xl backdrop-blur-md" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)'
                  }}>
                    <label className="block text-sm font-bold mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>Description</label>
                    <p className="text-sm" style={{ color: '#000b3d' }}>{selectedPlan?.description || 'No description'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Fast Charging Access', value: selectedPlan?.fast_charging_access ? 'Yes' : 'No' },
                      { label: 'Priority Access', value: selectedPlan?.priority_access ? 'Yes' : 'No' }
                    ].map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl backdrop-blur-md" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>{item.label}</label>
                        <p className="text-sm" style={{ color: '#000b3d' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setShowModal(false)}
                      className="font-bold py-2 px-4 rounded-xl transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                        color: '#000b3d',
                        border: '1px solid rgba(0, 11, 61, 0.3)'
                      }}
                    >
                      Close
                    </button>
                    <button
                      onClick={() => handleEditPlan(selectedPlan)}
                      className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                        boxShadow: '0 4px 12px rgba(56, 182, 255, 0.3)',
                        willChange: 'transform',
                        transform: 'translateZ(0)'
                      }}
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
                      <label htmlFor="plan_name" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                        Plan Name *
                      </label>
                      <input
                        type="text"
                        id="plan_name"
                        name="plan_name"
                        value={formData.plan_name}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#000b3d',
                          backdropFilter: 'blur(10px)'
                        }}
                        onFocus={(e) => {
                          e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                          e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          e.target.style.boxShadow = 'none';
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="price" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
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
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#000b3d',
                          backdropFilter: 'blur(10px)'
                        }}
                        onFocus={(e) => {
                          e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                          e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          e.target.style.boxShadow = 'none';
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows="3"
                      className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
style={{
  background: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  color: '#000b3d',
  backdropFilter: 'blur(10px)'
}}
onFocus={(e) => {
  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
}}
onBlur={(e) => {
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
}}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="duration_type" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                        Duration Type *
                      </label>
                      <select
                        id="duration_type"
                        name="duration_type"
                        value={formData.duration_type}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#000b3d',
                          backdropFilter: 'blur(10px)'
                        }}
                        onFocus={(e) => {
                          e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                          e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          e.target.style.boxShadow = 'none';
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
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
                      <label htmlFor="duration_value" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                        Duration Value *
                      </label>
                      <input
                        type="number"
                        id="duration_value"
                        name="duration_value"
                        value={formData.duration_value}
                        onChange={handleInputChange}
                        min="1"
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#000b3d',
                          backdropFilter: 'blur(10px)'
                        }}
                        onFocus={(e) => {
                          e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                          e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          e.target.style.boxShadow = 'none';
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                        required
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="paypal_link" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                      PayPal Payment Link
                    </label>
                    <input
                      type="url"
                      id="paypal_link"
                      name="paypal_link"
                      value={formData.paypal_link}
                      onChange={handleInputChange}
                      placeholder="https://www.paypal.com/paypalme/yourusername/amount"
                      className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
style={{
  background: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  color: '#000b3d',
  backdropFilter: 'blur(10px)'
}}
onFocus={(e) => {
  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
}}
onBlur={(e) => {
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
}}
                    />
                    <p className="mt-1 text-sm" style={{ color: '#000b3d', opacity: 0.6 }}>
                      Direct PayPal payment link for this plan (optional)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="daily_mah_limit" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
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
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
                        style={{
                          background: 'rgba(255, 255, 255, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#000b3d',
                          backdropFilter: 'blur(10px)'
                        }}
                        onFocus={(e) => {
                          e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
                          e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                        }}
                        onBlur={(e) => {
                          e.target.style.boxShadow = 'none';
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="max_session_duration_hours" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
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
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
style={{
  background: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  color: '#000b3d',
  backdropFilter: 'blur(10px)'
}}
onFocus={(e) => {
  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
}}
onBlur={(e) => {
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
}}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cooldown_percentage" className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                        Cooldown Percentage (%)
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
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
style={{
  background: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  color: '#000b3d',
  backdropFilter: 'blur(10px)'
}}
onFocus={(e) => {
  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
}}
onBlur={(e) => {
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
}}
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
                        className="mt-1 block w-full rounded-xl px-3 py-2 transition-all duration-200"
style={{
  background: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  color: '#000b3d',
  backdropFilter: 'blur(10px)'
}}
onFocus={(e) => {
  e.target.style.boxShadow = '0 0 0 3px rgba(56, 182, 255, 0.3)';
  e.target.style.borderColor = 'rgba(56, 182, 255, 0.5)';
  e.target.style.background = 'rgba(255, 255, 255, 0.3)';
}}
onBlur={(e) => {
  e.target.style.boxShadow = 'none';
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
}}
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
                        className="h-4 w-4 rounded"
                        style={{ accentColor: '#38b6ff' }}
                      />
                      <label htmlFor="fast_charging_access" className="ml-2 block text-sm font-bold" style={{ color: '#000b3d' }}>
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
                        className="h-4 w-4 rounded"
                        style={{ accentColor: '#38b6ff' }}
                      />
                      <label htmlFor="priority_access" className="ml-2 block text-sm font-bold" style={{ color: '#000b3d' }}>
                        Priority Access
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="font-bold py-2 px-4 rounded-xl transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                        color: '#000b3d',
                        border: '1px solid rgba(0, 11, 61, 0.3)'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                        boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                        willChange: 'transform',
                        transform: 'translateZ(0)'
                      }}
                    >
                      {modalMode === 'create' ? 'Create Plan' : 'Update Plan'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
      )}
    </div>
  );
}

export default AdminPlans; 
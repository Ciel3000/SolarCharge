// frontend/src/pages/SubscriptionPage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

// PayPal Sandbox Configuration
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || 'sb'; // Using a default sandbox client ID
const PAYPAL_OPTIONS = {
    "client-id": PAYPAL_CLIENT_ID,
    currency: "PHP",
    intent: "subscription",
    vault: true
};

// A simple, reusable component for empty states to maintain consistency.
const EmptyState = ({ icon, title, message, children }) => (
    <div className="text-center py-12">
        <div className="text-6xl mb-4" role="img" aria-label="icon">{icon}</div>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        {children}
    </div>
);


function SubscriptionPage() {
    const { session } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState('');
    const [usage, setUsage] = useState(null);
    const [billing, setBilling] = useState([]);
    const [availablePlans, setAvailablePlans] = useState([]);
    const [paypalLoading, setPaypalLoading] = useState(false);
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);
    const [showPayPal, setShowPayPal] = useState(false);

    // Check for messages passed via navigation state
    const actionMessage = location.state?.message;

    useEffect(() => {
        if (actionMessage) {
            setFeedback(actionMessage);
        }
    }, [actionMessage]);

    // Memoized function for fetching subscription and billing data
    const fetchSubscriptionAndBillingData = useCallback(async () => {
        if (!session?.access_token) {
            setLoading(false);
            setFeedback('Authentication required to view subscription details.');
            return;
        }

        setLoading(true);
        setFeedback('');

        try {
            const res = await fetch(`${BACKEND_URL}/api/user/subscription`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to load subscription data (Status: ${res.status}).`);
            }

            const data = await res.json();
            setSubscription(data.subscription || null);
            setBilling(data.billing_history || []);
        } catch (err) {
            console.error('Failed to load subscription/billing data:', err);
            setFeedback(`Failed to load subscription details: ${err.message || 'An unknown error occurred'}.`);
            setSubscription(null);
            setBilling([]);
        } finally {
            setLoading(false);
        }
    }, [session]);

    // Memoized function for fetching usage data
    const fetchUsageData = useCallback(async () => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${BACKEND_URL}/api/user/usage`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to load usage data (Status: ${res.status}).`);
            }

            const data = await res.json();
            setUsage(data);
        } catch (err) {
            console.error('Failed to load usage data:', err);
            setUsage(null);
        }
    }, [session]);

    // Fetch available subscription plans
    const fetchAvailablePlans = useCallback(async () => {
        try {
            // Assuming you have a mechanism to fetch plans, e.g., from a Supabase client or a public API endpoint.
            // This is a placeholder for your actual implementation.
            const { supabase } = await import('../supabaseClient');
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            setAvailablePlans(data || []);
        } catch (err) {
            console.error('Failed to load subscription plans:', err);
            setAvailablePlans([]);
        }
    }, []);

    // Fetch all data concurrently on component mount/session change
    useEffect(() => {
        fetchSubscriptionAndBillingData();
        fetchUsageData();
        fetchAvailablePlans();
    }, [fetchSubscriptionAndBillingData, fetchUsageData, fetchAvailablePlans]);

    // Handle plan selection for payment
    const handleSelectPlan = (plan) => {
        setSelectedPlanForPayment(plan);
        setShowPayPal(true);
        setFeedback('');
    };
    
    // Handle subscription cancellation
    const handleCancelSubscription = async () => {
        // IMPORTANT: window.confirm is used as a placeholder.
        // For a better user experience, replace this with a custom modal component.
        if (!subscription || !window.confirm('Are you sure you want to cancel your subscription? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/subscription/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to cancel subscription');
            }

            await fetchSubscriptionAndBillingData();
            setFeedback('Subscription cancelled successfully.');
            
        } catch (err) {
            console.error('Error cancelling subscription:', err);
            setFeedback(`Failed to cancel subscription: ${err.message}`);
        }
    };

    // PayPal payment functions
    const createPayPalOrder = useCallback(async (data, actions) => {
        if (!selectedPlanForPayment) {
            throw new Error('No plan selected');
        }
        setPaypalLoading(true);
        return actions.order.create({
            purchase_units: [{
                description: `${selectedPlanForPayment.plan_name} Subscription`,
                amount: {
                    currency_code: 'PHP',
                    value: selectedPlanForPayment.price.toString(),
                },
            }],
            application_context: {
                shipping_preference: 'NO_SHIPPING',
            },
        });
    }, [selectedPlanForPayment]);

    const onPayPalApprove = useCallback(async (data, actions) => {
        setPaypalLoading(true);
        try {
            const details = await actions.order.capture();
            console.log('PayPal payment completed:', details);

            const response = await fetch(`${BACKEND_URL}/api/subscription/paypal-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    paypal_order_id: details.id,
                    plan_id: selectedPlanForPayment.plan_id,
                    amount: selectedPlanForPayment.price,
                    payment_details: details,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process subscription');
            }

            setShowPayPal(false);
            setSelectedPlanForPayment(null);
            
            await fetchSubscriptionAndBillingData();
            
            setFeedback(`Payment successful! Welcome to ${selectedPlanForPayment.plan_name}!`);
            
        } catch (err) {
            console.error('PayPal payment processing error:', err);
            setFeedback(`Payment processing failed: ${err.message}`);
        } finally {
            setPaypalLoading(false);
        }
    }, [selectedPlanForPayment, session, fetchSubscriptionAndBillingData]);

    const onPayPalError = useCallback((err) => {
        console.error('PayPal payment error:', err);
        setFeedback('Payment failed. Please try again or use a different payment method.');
        setPaypalLoading(false);
    }, []);

    const onPayPalCancel = useCallback(() => {
        setShowPayPal(false);
        setSelectedPlanForPayment(null);
        setPaypalLoading(false);
    }, []);

    // Helper functions for formatting
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    };

      const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
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
    
    const formatStatusText = (status) => {
        if (typeof status === 'boolean') {
            return status ? 'Active' : 'Inactive';
        }
        if (typeof status === 'string') {
            return status.charAt(0).toUpperCase() + status.slice(1);
        }
        return 'Unknown';
    };

    const getStatusColor = (status) => {
        let statusString = (typeof status === 'boolean' ? (status ? 'active' : 'inactive') : String(status || 'unknown')).toLowerCase();
        switch (statusString) {
            case 'active':
            case 'completed':
                return 'text-green-700 bg-green-100';
            case 'inactive':
            case 'cancelled':
                return 'text-red-700 bg-red-100';
            case 'expired':
                return 'text-orange-700 bg-orange-100';
            case 'pending':
                return 'text-yellow-700 bg-yellow-100';
            case 'failed':
                return 'text-red-700 bg-red-100';
            default:
                return 'text-gray-700 bg-gray-100';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-cyan-100 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading subscription details...</p>
                </div>
            </div>
        );
    }

    return (
        <PayPalScriptProvider options={PAYPAL_OPTIONS}>
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-cyan-100 text-gray-800 relative overflow-x-hidden">
                {/* Background decorative elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-green-400/20 to-blue-400/20 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-cyan-400/20 to-emerald-400/20 rounded-full blur-3xl"></div>
                </div>

                {/* Main Content Area with consistent padding and spacing */}
                <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 relative z-10 space-y-8">
                    
                    {/* Feedback Message */}
                    {feedback && (
                        <div className={`px-4 py-3 rounded-lg shadow-md text-center font-semibold text-lg ${
                            feedback.includes('successful') || feedback.includes('Welcome')
                                ? 'bg-green-100 border border-green-400 text-green-700'
                                : 'bg-red-100 border border-red-400 text-red-700'
                        }`}>
                            {feedback}
                        </div>
                    )}

                    {/* Top Section: Current Plan & Usage */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Current Plan Card */}
                        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Current Plan</h2>
                            {subscription ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xl font-semibold text-gray-700">{subscription.plan_name || 'No Plan'}</span>
                                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
                                            {formatStatusText(subscription.status)}
                                        </span>
                                    </div>
                                    <div className="text-gray-600">
                                        <p className="mb-2">{subscription.description || 'No description available'}</p>
                                        <p className="font-semibold text-2xl text-green-600">
                                            {formatCurrency(subscription.price)}
                                            <span className="text-base text-gray-500">
                                                /{subscription.duration_display ? subscription.duration_display.toLowerCase() : 'month'}
                                            </span>
                                        </p>
                                        {subscription.duration_display && (
                                            <p className="text-sm text-blue-600 font-medium">
                                                Duration: {subscription.duration_display}
                                            </p>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-200 pt-4">
                                        <h3 className="font-semibold text-gray-700 mb-2">Plan Features:</h3>
                                        <ul className="space-y-1">
                                            {(subscription.features || []).map((feature, index) => (
                                                <li key={index} className="flex items-center text-gray-600">
                                                    <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="border-t border-gray-200 pt-4 space-y-2 text-sm text-gray-600">
                                        <p><strong>Start Date:</strong> {formatDate(subscription.start_date)}</p>
                                        <p><strong>Next Billing:</strong> {formatDate(subscription.next_billing_date)}</p>
                                        {subscription.end_date && <p><strong>End Date:</strong> {formatDate(subscription.end_date)}</p>}
                                    </div>
                                </div>
                            ) : (
                                <EmptyState icon="📋" title="No Active Subscription" message="You don't have an active subscription plan. Choose one below to get started!">
                                    <button
                                        onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105"
                                    >
                                        Choose a Plan
                                    </button>
                                </EmptyState>
                            )}
                        </div>

                        {/* Usage Statistics Card */}
                        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">This Month's Usage</h2>
                            {usage ? (
                                <div className="space-y-4">
                                    {/* Simplified usage stats display */}
                                    <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between"><span className="text-gray-600">Total Sessions</span><span className="text-2xl font-bold text-blue-600">{usage.totalSessions}</span></div>
                                    <div className="bg-green-50 p-4 rounded-lg flex items-center justify-between"><span className="text-gray-600">Total Duration</span><span className="text-2xl font-bold text-green-600">{usage.totalDuration} min</span></div>
                                    <div className="bg-purple-50 p-4 rounded-lg flex items-center justify-between"><span className="text-gray-600">Total Energy (kWh)</span><span className="text-2xl font-bold text-purple-600">{usage.totalEnergyKWH} kWh</span></div>
                                    <div className="bg-orange-50 p-4 rounded-lg flex items-center justify-between"><span className="text-gray-600">Total Cost</span><span className="text-2xl font-bold text-orange-600">{formatCurrency(usage.totalCost)}</span></div>
                                </div>
                            ) : (
                                <EmptyState icon="📊" title="No Usage Data" message="Start a charging session to see your usage statistics here." />
                            )}
                        </div>
                    </div>

                    {/* Billing History Card */}
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Billing History</h2>
                        {billing.length > 0 ? (
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
                                        {billing.map((bill, idx) => (
                                            <tr className="border-b border-gray-100" key={idx}>
                                                <td className="px-4 py-3 text-gray-600">{formatDate(bill.date)}</td>
                                                <td className="px-4 py-3 text-gray-600">{formatCurrency(bill.amount)}</td>
                                                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(bill.status)}`}>{formatStatusText(bill.status)}</span></td>
                                                <td className="px-4 py-3"><button className="text-blue-600 hover:text-blue-800 text-sm font-medium">Download</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState icon="📜" title="No Billing History" message="Your payment history will appear here." />
                        )}
                    </div>

                    {/* Manage Subscription & Plans Section */}
                    <div id="plans-section" className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Manage Subscription</h2>
                        
                        {/* Action buttons for existing subscription */}
                        {subscription && (
                             <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b border-gray-200">
                                <button
                                    onClick={() => setShowPayPal(!showPayPal)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105"
                                >
                                    {showPayPal ? 'Hide Plan Options' : 'Change Plan'}
                                </button>
                                <button
                                    onClick={handleCancelSubscription}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105"
                                >
                                    Cancel Subscription
                                </button>
                            </div>
                        )}

                        {/* Available Plans - shown if no sub, or if user clicks "Change Plan" */}
                        {(!subscription || showPayPal) && (
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">
                                    {subscription ? 'Upgrade Your Plan' : 'Choose Your Plan'}
                                </h3>
                                {availablePlans.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {availablePlans.map((plan) => (
                                            <div key={plan.plan_id} className={`border-2 rounded-xl p-6 transition-all duration-300 hover:shadow-lg hover:scale-105 ${subscription?.plan_id === plan.plan_id ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-blue-400'}`}>
                                                <div className="text-center">
                                                    <h3 className="text-xl font-bold text-gray-800 mb-2">{plan.plan_name}</h3>
                                                    <p className="text-gray-600 mb-4 h-12">{plan.description}</p>
                                                    <div className="text-3xl font-bold text-blue-600 mb-2">
                                                        {formatCurrency(plan.price)}
                                                        <span className="text-sm text-gray-500">
                                                            /{getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1).toLowerCase()}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-blue-600 font-medium mb-2">
                                                        {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1)}
                                                    </div>
                                                    <div className="text-sm text-gray-600 mb-4">Daily Limit: {plan.daily_mah_limit} mAh</div>
                                                    
                                                    {subscription?.plan_id === plan.plan_id ? (
                                                        <div className="bg-green-200 text-green-800 py-3 px-4 rounded-lg font-semibold">Current Plan</div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSelectPlan(plan)}
                                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                                                        >
                                                            {subscription ? 'Upgrade' : 'Select'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-600 text-center py-4">No subscription plans are currently available. Please check back later.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* PayPal Payment Section */}
                    {showPayPal && selectedPlanForPayment && (
                        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Complete Your Payment</h2>
                            <div className="max-w-md mx-auto">
                                <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
                                    <h3 className="font-semibold text-blue-800 mb-2">Selected Plan: {selectedPlanForPayment.plan_name}</h3>
                                    <p className="text-blue-700">
                                        Price: {formatCurrency(selectedPlanForPayment.price)} per {getDurationDisplayText(selectedPlanForPayment.duration_type || 'monthly', selectedPlanForPayment.duration_value || 1).toLowerCase()}
                                    </p>
                                    <p className="text-blue-700">
                                        Duration: {getDurationDisplayText(selectedPlanForPayment.duration_type || 'monthly', selectedPlanForPayment.duration_value || 1)}
                                    </p>
                                </div>
                                
                                {paypalLoading && (
                                    <div className="text-center py-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                        <p className="text-gray-600">Processing payment...</p>
                                    </div>
                                )}
                                
                                <div className="paypal-buttons-container">
                                    <PayPalButtons
                                        style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
                                        createOrder={createPayPalOrder}
                                        onApprove={onPayPalApprove}
                                        onError={onPayPalError}
                                        onCancel={onPayPalCancel}
                                        disabled={paypalLoading}
                                    />
                                </div>
                                
                                <div className="mt-4 text-center">
                                    <button onClick={onPayPalCancel} className="text-gray-600 hover:text-gray-800 underline">Cancel</button>
                                </div>
                                
                                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <p className="text-yellow-800 text-sm text-center">🔒 <strong>Sandbox Mode:</strong> This is a test environment. Use PayPal sandbox credentials.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PayPalScriptProvider>
    );
}

export default SubscriptionPage;

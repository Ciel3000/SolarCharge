// frontend/src/pages/SubscriptionPage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useAuth } from '../contexts/AuthContext';
import { filterActivePlans } from '../utils/planUtils';

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
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-md" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
        }}>
            <span className="text-4xl" role="img" aria-label="icon">{icon}</span>
        </div>
        <h3 className="text-2xl font-bold mb-2" style={{ color: '#000b3d' }}>{title}</h3>
        <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>{message}</p>
        {children}
    </div>
);

function SubscriptionPage() {
    const { session, subscription } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState('');
    const [availablePlans, setAvailablePlans] = useState([]);
    const [paypalLoading, setPaypalLoading] = useState(false);
    const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);
    const [showPayPal, setShowPayPal] = useState(false);
    
    // New state for subscription history
    const [subscriptionHistory, setSubscriptionHistory] = useState([]);
    const [activeTab, setActiveTab] = useState('current'); // 'current' or 'history'

    // Check for messages passed via navigation state
    const actionMessage = location.state?.message;

    useEffect(() => {
        if (actionMessage) {
            setFeedback(actionMessage);
        }
    }, [actionMessage]);

    // Fetch available subscription plans
    const fetchAvailablePlans = useCallback(async () => {
        try {
            const { supabase } = await import('../supabaseClient');
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            
            // Filter out discontinued plans
            const activePlans = filterActivePlans(data || []);
            
            setAvailablePlans(activePlans);
        } catch (err) {
            console.error('Failed to load subscription plans:', err);
            setAvailablePlans([]);
        }
    }, []);

    // Fetch subscription history
    const fetchSubscriptionHistory = useCallback(async () => {
        if (!session?.access_token) return;
        
        try {
            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';
            const response = await fetch(`${BACKEND_URL}/api/user/subscription-history`, {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch subscription history');
            }

            const data = await response.json();
            setSubscriptionHistory(data.subscription_history || []);
        } catch (err) {
            console.error('Failed to load subscription history:', err);
            setSubscriptionHistory([]);
        }
    }, [session]);

    // Fetch all data concurrently on component mount/session change
    useEffect(() => {
        fetchAvailablePlans();
        fetchSubscriptionHistory();
        setLoading(false);
    }, [fetchAvailablePlans, fetchSubscriptionHistory]);

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
        try {
            const order = await actions.order.capture();
            console.log('PayPal order captured:', order);
            
            // Here you would typically send the order details to your backend
            // to create the subscription in your database
            
            setFeedback('Payment successful! Your subscription has been activated.');
            setShowPayPal(false);
            setSelectedPlanForPayment(null);
            
            // Refresh the page or update the subscription state
            window.location.reload();
            
        } catch (error) {
            console.error('PayPal capture error:', error);
            setFeedback('Payment failed. Please try again.');
        } finally {
            setPaypalLoading(false);
        }
    }, []);

    const onPayPalError = useCallback((err) => {
        console.error('PayPal error:', err);
        setFeedback('Payment error occurred. Please try again.');
        setPaypalLoading(false);
    }, []);

    // Helper function to format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
        }).format(amount || 0);
    };

    // Helper function to get duration display text
    const getDurationDisplayText = (durationType, durationValue) => {
        // Handle null/undefined values
        if (!durationType || !durationValue) {
            return '1 Month';
        }
        
        switch (durationType.toLowerCase()) {
            case 'daily':
                return durationValue === 1 ? '1 Day' : `${durationValue} Days`;
            case 'weekly':
                return durationValue === 1 ? '1 Week' : `${durationValue} Weeks`;
            case 'monthly':
                return durationValue === 1 ? '1 Month' : `${durationValue} Months`;
            case 'quarterly':
                return durationValue === 1 ? '1 Quarter' : `${durationValue} Quarters`;
            case 'yearly':
                return durationValue === 1 ? '1 Year' : `${durationValue} Years`;
            default:
                return '1 Month';
        }
    };

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
                    <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
                </div>
                <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mb-4" style={{
                            borderColor: '#38b6ff',
                            borderTopColor: 'transparent'
                        }}></div>
                        <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading subscription plans...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
            {/* Animated Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
                <div className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.2) 0%, transparent 70%)' }}></div>
                <div className="absolute bottom-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl animate-float-delay" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.2) 0%, transparent 70%)' }}></div>
            </div>

            {/* Main Content */}
            <div className="w-full pt-24 pb-8 max-w-6xl mx-auto relative z-10">
                {/* Header */}
                <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12 mb-8 animate-fade-in-down" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <div className="text-center">
                        <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>SUBSCRIPTION PLANS</h1>
                        <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>Choose the perfect plan for your charging needs</p>
                    </div>
                </div>

                {/* Feedback Message */}
                {feedback && (
                    <div className="mb-6 p-4 rounded-lg backdrop-blur-md mx-auto max-w-2xl text-center animate-fade-in" style={{
                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                        border: '1px solid rgba(56, 182, 255, 0.3)',
                        color: '#000b3d'
                    }}>
                        {feedback}
                    </div>
                )}

                {/* Current Subscription Status */}
                {subscription && (
                    <div className="mb-8 relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12 animate-fade-in" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                            <span className="text-2xl">🌟</span> Current Subscription
                        </h2>

                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>Plan</div>
                                <div className="text-lg font-bold" style={{ color: '#10b981' }}>
                                    {subscription.subscription_plans?.plan_name || subscription.plan_name || 'Unknown Plan'}
                                </div>
                            </div>
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                border: '1px solid rgba(56, 182, 255, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>Daily Limit</div>
                                <div className="text-lg font-bold" style={{ color: '#38b6ff' }}>
                                    {subscription.subscription_plans?.daily_mah_limit || subscription.daily_mah_limit || '0'} mAh
                                </div>
                            </div>
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                border: '1px solid rgba(139, 92, 246, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>Duration</div>
                                <div className="text-lg font-bold" style={{ color: '#8b5cf6' }}>
                                    {getDurationDisplayText(
                                        subscription.subscription_plans?.duration_type || subscription.duration_type, 
                                        subscription.subscription_plans?.duration_value || subscription.duration_value
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {/* Additional subscription details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(249, 115, 22, 0.1) 100%)',
                                border: '1px solid rgba(249, 115, 22, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>Today's Usage</div>
                                <div className="text-lg font-bold" style={{ color: '#f97316' }}>
                                    {subscription.current_daily_mah_consumed || 0} mAh
                                </div>
                            </div>
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.1) 100%)',
                                border: '1px solid rgba(99, 102, 241, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>Start Date</div>
                                <div className="text-lg font-bold" style={{ color: '#6366f1' }}>
                                    {new Date(subscription.start_date).toLocaleDateString()}
                                </div>
                            </div>
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}>
                                <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>End Date</div>
                                <div className="text-lg font-bold" style={{ color: '#ef4444' }}>
                                    {new Date(subscription.end_date).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={() => navigate('/usage')}
                                className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                    focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                }}
                            >
                                <span className="relative z-10">View Usage</span>
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                }}></div>
                            </button>
                            <button
                                onClick={handleCancelSubscription}
                                className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                    boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                    focusRingColor: 'rgba(239, 68, 68, 0.5)'
                                }}
                            >
                                <span className="relative z-10">Cancel Subscription</span>
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.3) 100%)'
                                }}></div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="mb-6 relative backdrop-blur-xl rounded-3xl shadow-xl border border-white/30 overflow-hidden animate-fade-in delay-200" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <div className="flex border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                        <button
                            onClick={() => setActiveTab('current')}
                            className={`flex-1 py-4 px-6 text-center font-semibold transition-all duration-300 ${
                                activeTab === 'current'
                                    ? 'border-b-2' 
                                    : ''
                            }`}
                            style={activeTab === 'current' ? {
                                color: '#38b6ff',
                                borderBottomColor: '#38b6ff',
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.1) 0%, rgba(56, 182, 255, 0.05) 100%)'
                            } : {
                                color: '#000b3d',
                                opacity: 0.7
                            }}
                        >
                            {subscription ? 'Current Plan' : 'Available Plans'}
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 py-4 px-6 text-center font-semibold transition-all duration-300 ${
                                activeTab === 'history'
                                    ? 'border-b-2'
                                    : ''
                            }`}
                            style={activeTab === 'history' ? {
                                color: '#38b6ff',
                                borderBottomColor: '#38b6ff',
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.1) 0%, rgba(56, 182, 255, 0.05) 100%)'
                            } : {
                                color: '#000b3d',
                                opacity: 0.7
                            }}
                        >
                            Subscription History
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'current' && (
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12 animate-fade-in delay-400" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center" style={{ color: '#000b3d' }}>
                            {subscription ? 'Upgrade Your Plan' : 'Choose Your Plan'}
                        </h2>
                    
                    {availablePlans.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {availablePlans.map((plan, index) => (
                                <div 
                                    key={plan.plan_id} 
                                    className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 transform transition-all duration-500 hover:scale-105 hover:-translate-y-2 overflow-hidden"
                                    style={{
                                        background: subscription?.plan_id === plan.plan_id
                                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0.15) 100%)'
                                            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                        border: subscription?.plan_id === plan.plan_id
                                            ? '1px solid rgba(16, 185, 129, 0.4)'
                                            : '1px solid rgba(255, 255, 255, 0.3)',
                                        boxShadow: subscription?.plan_id === plan.plan_id
                                            ? '0 8px 32px 0 rgba(16, 185, 129, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                                            : '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                                        animationDelay: `${index * 100}ms`
                                    }}
                                >
                                    <div className="text-center relative z-10">
                                        <h3 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: '#000b3d' }}>{plan.plan_name}</h3>
                                        <p className="mb-4 h-12" style={{ color: '#000b3d', opacity: 0.7 }}>{plan.description}</p>
                                        <div className="text-3xl sm:text-4xl font-bold mb-2" style={{ color: '#38b6ff' }}>
                                            {formatCurrency(plan.price)}
                                            <span className="text-sm" style={{ color: '#000b3d', opacity: 0.6 }}>
                                                /{getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1).toLowerCase()}
                                            </span>
                                        </div>
                                        <div className="text-sm font-medium mb-2" style={{ color: '#38b6ff' }}>
                                            {getDurationDisplayText(plan.duration_type || 'monthly', plan.duration_value || 1)}
                                        </div>
                                        <div className="text-sm mb-6" style={{ color: '#000b3d', opacity: 0.7 }}>Daily Limit: {plan.daily_mah_limit} mAh</div>
                                        
                                        {subscription?.plan_id === plan.plan_id ? (
                                            <div className="py-3 px-4 rounded-xl font-semibold backdrop-blur-md" style={{
                                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.2) 100%)',
                                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                                color: '#10b981'
                                            }}>Current Plan</div>
                                        ) : plan.paypal_link ? (
                                            <a
                                                href={plan.paypal_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 block"
                                                style={{
                                                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                                    focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                                }}
                                            >
                                                <span className="relative z-10">Subscribe via PayPal</span>
                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                                }}></div>
                                            </a>
                                        ) : (
                                            <button
                                                onClick={() => handleSelectPlan(plan)}
                                                className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 w-full"
                                                style={{
                                                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                                    focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                                }}
                                            >
                                                <span className="relative z-10">Subscribe</span>
                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                                }}></div>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon="📋" title="No Plans Available" message="Subscription plans are currently unavailable. Please try again later." />
                    )}
                    </div>
                )}

                {/* Subscription History Tab */}
                {activeTab === 'history' && (
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12 animate-fade-in delay-400" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center" style={{ color: '#000b3d' }}>Subscription History</h2>
                        
                        {/* Subscription Statistics */}
                        {subscriptionHistory.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="p-4 rounded-xl backdrop-blur-md text-center" style={{
                                    background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                    border: '1px solid rgba(56, 182, 255, 0.3)'
                                }}>
                                    <div className="text-2xl font-bold mb-2" style={{ color: '#38b6ff' }}>{subscriptionHistory.length}</div>
                                    <div className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>Total Subscriptions</div>
                                </div>
                                <div className="p-4 rounded-xl backdrop-blur-md text-center" style={{
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)'
                                }}>
                                    <div className="text-2xl font-bold mb-2" style={{ color: '#10b981' }}>
                                        {subscriptionHistory.filter(sub => sub.subscription_status === 'Active').length}
                                    </div>
                                    <div className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>Active</div>
                                </div>
                                <div className="p-4 rounded-xl backdrop-blur-md text-center" style={{
                                    background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.2) 0%, rgba(107, 114, 128, 0.1) 100%)',
                                    border: '1px solid rgba(107, 114, 128, 0.3)'
                                }}>
                                    <div className="text-2xl font-bold mb-2" style={{ color: '#6b7280' }}>
                                        {subscriptionHistory.filter(sub => sub.subscription_status !== 'Active').length}
                                    </div>
                                    <div className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>Discontinued/Expired</div>
                                </div>
                            </div>
                        )}
                        
                        {subscriptionHistory.length > 0 ? (
                            <div className="space-y-4">
                                {subscriptionHistory.map((sub) => (
                                    <div 
                                        key={sub.user_subscription_id} 
                                        className="relative backdrop-blur-xl rounded-3xl p-6 transform transition-all duration-500 hover:scale-[1.02] overflow-hidden"
                                        style={{
                                            background: sub.subscription_status === 'Active'
                                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0.15) 100%)'
                                                : sub.subscription_status === 'Discontinued'
                                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.35) 0%, rgba(239, 68, 68, 0.15) 100%)'
                                                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                            border: sub.subscription_status === 'Active'
                                                ? '1px solid rgba(16, 185, 129, 0.4)'
                                                : sub.subscription_status === 'Discontinued'
                                                ? '1px solid rgba(239, 68, 68, 0.4)'
                                                : '1px solid rgba(255, 255, 255, 0.3)',
                                            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                                        }}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <h3 className="text-xl font-bold" style={{ color: '#000b3d' }}>{sub.plan_name}</h3>
                                                    <span className="px-3 py-1 rounded-full text-sm font-semibold backdrop-blur-md" style={{
                                                        background: sub.subscription_status === 'Active'
                                                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.2) 100%)'
                                                            : sub.subscription_status === 'Discontinued'
                                                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(239, 68, 68, 0.2) 100%)'
                                                            : 'linear-gradient(135deg, rgba(107, 114, 128, 0.3) 0%, rgba(107, 114, 128, 0.2) 100%)',
                                                        border: sub.subscription_status === 'Active'
                                                            ? '1px solid rgba(16, 185, 129, 0.4)'
                                                            : sub.subscription_status === 'Discontinued'
                                                            ? '1px solid rgba(239, 68, 68, 0.4)'
                                                            : '1px solid rgba(107, 114, 128, 0.4)',
                                                        color: sub.subscription_status === 'Active'
                                                            ? '#10b981'
                                                            : sub.subscription_status === 'Discontinued'
                                                            ? '#ef4444'
                                                            : '#6b7280'
                                                    }}>
                                                        {sub.subscription_status}
                                                    </span>
                                                </div>
                                                <p className="mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>{sub.description}</p>
                                                
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div className="p-3 rounded-xl backdrop-blur-md" style={{
                                                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                                        border: '1px solid rgba(56, 182, 255, 0.3)'
                                                    }}>
                                                        <span className="block mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Price:</span>
                                                        <div className="font-semibold" style={{ color: '#38b6ff' }}>
                                                            {formatCurrency(sub.price)}/{sub.duration_display?.toLowerCase() || 'month'}
                                                        </div>
                                                    </div>
                                                    <div className="p-3 rounded-xl backdrop-blur-md" style={{
                                                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                                        border: '1px solid rgba(249, 210, 23, 0.3)'
                                                    }}>
                                                        <span className="block mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Daily Limit:</span>
                                                        <div className="font-semibold" style={{ color: '#f9d217' }}>{sub.daily_mah_limit} mAh</div>
                                                    </div>
                                                    <div className="p-3 rounded-xl backdrop-blur-md" style={{
                                                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                                        border: '1px solid rgba(139, 92, 246, 0.3)'
                                                    }}>
                                                        <span className="block mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Start Date:</span>
                                                        <div className="font-semibold" style={{ color: '#8b5cf6' }}>{new Date(sub.start_date).toLocaleDateString()}</div>
                                                    </div>
                                                    <div className="p-3 rounded-xl backdrop-blur-md" style={{
                                                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)'
                                                    }}>
                                                        <span className="block mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>End Date:</span>
                                                        <div className="font-semibold" style={{ color: '#ef4444' }}>{new Date(sub.end_date).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState 
                                icon="📋" 
                                title="No Subscription History" 
                                message="You haven't had any subscriptions yet. Choose a plan to get started!" 
                            />
                        )}
                    </div>
                )}

                {/* PayPal Integration */}
                {showPayPal && selectedPlanForPayment && (
                    <div className="mt-8 relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12 animate-fade-in" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h3 className="text-xl sm:text-2xl font-bold mb-6 text-center" style={{ color: '#000b3d' }}>
                            Complete Payment for {selectedPlanForPayment.plan_name}
                        </h3>
                        <div className="max-w-md mx-auto">
                            <PayPalScriptProvider options={PAYPAL_OPTIONS}>
                                <PayPalButtons
                                    createOrder={createPayPalOrder}
                                    onApprove={onPayPalApprove}
                                    onError={onPayPalError}
                                    style={{ layout: "vertical" }}
                                />
                            </PayPalScriptProvider>
                        </div>
                        <div className="text-center mt-6">
                            <button
                                onClick={() => {
                                    setShowPayPal(false);
                                    setSelectedPlanForPayment(null);
                                }}
                                className="text-sm font-medium transition-colors hover:opacity-80"
                                style={{ color: '#000b3d', opacity: 0.7 }}
                            >
                                Cancel Payment
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default SubscriptionPage;
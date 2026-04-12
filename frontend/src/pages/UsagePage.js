// frontend/src/pages/UsagePage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

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

function UsagePage() {
    const { session, subscription } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState('');
    const [usage, setUsage] = useState(null);
    const [billing, setBilling] = useState([]);
    
    // Quota extension modal state
    const [showQuotaModal, setShowQuotaModal] = useState(false);
    const [quotaPricing, setQuotaPricing] = useState(null);
    const [extensionAmount, setExtensionAmount] = useState(1000);
    const [extensionType, setExtensionType] = useState('direct_purchase');
    const [processingExtension, setProcessingExtension] = useState(false);

    // Check for messages passed via navigation state
    const actionMessage = location.state?.message;

    useEffect(() => {
        if (actionMessage) {
            setFeedback(actionMessage);
        }
    }, [actionMessage]);

    // Check if user has premium subscription
    useEffect(() => {
        if (session && !subscription) {
            // Redirect non-premium users to subscription page
            navigate('/subscription', { 
                state: { 
                    message: 'Premium subscription required to view usage details.' 
                } 
            });
        }
    }, [session, subscription, navigate]);

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
            console.log('UsagePage: Received usage data:', data);
            setUsage(data);
        } catch (err) {
            console.error('Failed to load usage data:', err);
            setUsage(null);
        }
    }, [session]);

    // Memoized function for fetching billing data
    const fetchBillingData = useCallback(async () => {
        if (!session?.access_token) return;

        try {
            const res = await fetch(`${BACKEND_URL}/api/user/subscription`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to load billing data (Status: ${res.status}).`);
            }

            const data = await res.json();
            setBilling(data.billing_history || []);
        } catch (err) {
            console.error('Failed to load billing data:', err);
            setBilling([]);
        }
    }, [session]);

    // Fetch quota pricing configuration
    const fetchQuotaPricing = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/quota/pricing`);
            if (!res.ok) {
                throw new Error(`Failed to fetch pricing (Status: ${res.status})`);
            }
            const data = await res.json();
            setQuotaPricing(data);
        } catch (err) {
            console.error('Failed to fetch quota pricing:', err);
        }
    }, []);

    // Check if quota is reached and show modal
    const checkQuotaStatus = useCallback(() => {
        const usageData = calculateSubscriptionUsage();
        if (usageData && usageData.percentageUsed >= 100) {
            setShowQuotaModal(true);
        }
    }, []);

    // Purchase quota extension
    const purchaseExtension = async () => {
        if (!session?.access_token) return;
        
        setProcessingExtension(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/quota/purchase-extension`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    extensionType,
                    amountMah: extensionAmount,
                    paymentMethod: 'cash' // Default payment method
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to purchase extension (Status: ${res.status})`);
            }

            const data = await res.json();
            
            if (extensionType === 'direct_purchase' && data.paypalLink) {
                // Open PayPal in new window for direct purchase
                window.open(data.paypalLink, '_blank');
                setFeedback('PayPal payment window opened. Please complete payment and contact admin for confirmation.');
            } else {
                setFeedback(data.message);
                setShowQuotaModal(false);
            }
            
            // Refresh usage data
            fetchUsageData();
        } catch (err) {
            console.error('Failed to purchase extension:', err);
            setFeedback(`Failed to purchase extension: ${err.message}`);
        } finally {
            setProcessingExtension(false);
        }
    };

    // Fetch all data concurrently on component mount/session change
    useEffect(() => {
        if (subscription) { // Only fetch if user has premium subscription
            fetchUsageData();
            fetchBillingData();
            fetchQuotaPricing();
        }
        setLoading(false);
    }, [fetchUsageData, fetchBillingData, fetchQuotaPricing, subscription]);

    // Check quota status when usage data changes
    useEffect(() => {
        if (usage && subscription) {
            checkQuotaStatus();
        }
    }, [usage, subscription, checkQuotaStatus]);

    // Helper function to format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
        }).format(amount || 0);
    };

    // Helper function to format dates
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // Helper function to get status color
    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'paid':
                return 'bg-green-100 text-green-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'failed':
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    // Helper function to format status text
    const formatStatusText = (status) => {
        return status?.charAt(0).toUpperCase() + status?.slice(1).toLowerCase() || 'Unknown';
    };

    // Calculate subscription usage and remaining
    const calculateSubscriptionUsage = () => {
        if (!subscription || !subscription.subscription_plans) return null;

        const dailyLimit = subscription.subscription_plans.daily_mah_limit || 0;
        const consumed = subscription.current_daily_mah_consumed || 0;
        const borrowedToday = subscription.borrowed_mah_today || 0;
        const borrowedPending = subscription.borrowed_mah_pending || 0;
        
        // For today: use original daily limit (penalty only applies tomorrow)
        const todayDailyLimit = dailyLimit;
        
        // Calculate how much of the daily limit is consumed
        const dailyConsumed = Math.min(consumed, todayDailyLimit);
        const dailyPercentage = todayDailyLimit > 0 ? (dailyConsumed / todayDailyLimit) * 100 : 0;
        
        // Calculate extended usage (consumption beyond daily limit)
        const extendedConsumed = Math.max(0, consumed - todayDailyLimit);
        const extendedPercentage = borrowedToday > 0 ? (extendedConsumed / borrowedToday) * 100 : 0;
        
        // Calculate remaining quota using the same logic as backend
        const dailyQuotaRemaining = Math.max(0, todayDailyLimit - consumed);
        const borrowedQuotaAvailable = consumed >= todayDailyLimit ? borrowedToday : 0;
        const remaining = dailyQuotaRemaining + borrowedQuotaAvailable;

        return {
            dailyLimit: todayDailyLimit, // Show today's daily limit
            originalDailyLimit: dailyLimit, // Keep original for reference
            consumed,
            borrowedToday,
            borrowedPending,
            remaining,
            dailyPercentage,
            extendedConsumed,
            extendedPercentage
        };
    };

    // Get usage status and suggestions
    const getUsageStatus = () => {
        const usageData = calculateSubscriptionUsage();
        if (!usageData) return null;

        const { dailyPercentage, remaining } = usageData;

        if (dailyPercentage >= 100) {
            return {
                status: 'critical',
                color: 'red',
                message: 'Daily limit reached!',
                suggestion: 'Purchase an extension or borrow for next day to continue charging.'
            };
        } else if (dailyPercentage >= 80) {
            return {
                status: 'warning',
                color: 'orange',
                message: 'Approaching daily limit',
                suggestion: 'You\'re using most of your daily allowance.'
            };
        } else if (dailyPercentage >= 50) {
            return {
                status: 'moderate',
                color: 'yellow',
                message: 'Moderate usage',
                suggestion: 'You\'re using about half of your daily quota.'
            };
        } else {
            return {
                status: 'good',
                color: 'green',
                message: 'Good usage level',
                suggestion: 'You have plenty of daily quota remaining.'
            };
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
                        <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading usage data...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show access denied for non-premium users
    if (!subscription) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
                    <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
                </div>
                <div className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30 max-w-md mx-auto text-center" style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold mb-4" style={{ color: '#000b3d' }}>Premium Access Required</h2>
                    <p className="mb-6" style={{ color: '#000b3d', opacity: 0.7 }}>You need a premium subscription to view detailed usage statistics.</p>
                    <button
                        onClick={() => navigate('/subscription')}
                        className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 w-full"
                        style={{
                            background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                            boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                            focusRingColor: 'rgba(56, 182, 255, 0.5)'
                        }}
                    >
                        <span className="relative z-10">View Subscription Plans</span>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                        }}></div>
                    </button>
                </div>
            </div>
        );
    }

    // Calculate extension costs
    const calculateExtensionCost = () => {
        if (!quotaPricing) return { direct: 0, borrow: 0 };
        
        const direct = quotaPricing.direct_purchase;
        const borrow = quotaPricing.borrow_next_day;
        
        if (extensionType === 'direct_purchase') {
            // Dynamic pricing based on admin configuration
            const amount = quotaPricing?.direct_purchase?.extension_amount_mah || 1000;
            const price = quotaPricing?.direct_purchase?.price_per_transaction || 10;
            return {
                cost: price,
                breakdown: `Fixed rate: ₱${price} for ${amount} mAh`
            };
        } else if (extensionType === 'borrow_next_day' && borrow) {
            const penalty = extensionAmount * (borrow.penalty_percentage / 100);
            const totalCost = borrow.base_fee + penalty;
            return {
                cost: totalCost,
                breakdown: `Base fee: ₱${borrow.base_fee} + Penalty: ₱${penalty.toFixed(2)}`
            };
        }
        
        return { cost: 0, breakdown: '' };
    };

    const extensionCost = calculateExtensionCost();

    const usageData = calculateSubscriptionUsage();
    const usageStatus = getUsageStatus();

    return (
        <div className="min-h-screen flex flex-col items-center p-4 text-gray-800 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
            {/* Animated Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}></div>
                <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse-slow" style={{ background: 'radial-gradient(circle, rgba(0, 11, 61, 0.15) 0%, rgba(0, 11, 61, 0.05) 50%, transparent 100%)' }}></div>
            </div>

            {/* Main Content */}
            <div className="w-full pt-24 pb-8">
                {/* Header Section */}
                <section className="w-full max-w-7xl mx-auto mb-8 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <div className="text-center">
                            <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: '#000b3d' }}>USAGE DASHBOARD</h1>
                            <p className="text-lg sm:text-xl" style={{ color: '#000b3d', opacity: 0.7 }}>TRACK YOUR CHARGING SESSIONS AND ENERGY CONSUMPTION</p>
                        </div>
                    </div>
                </section>

                {/* Usage Dashboard Section */}
                <section className="w-full max-w-7xl mx-auto mb-16 relative z-10 animate-fade-in delay-200 px-4 sm:px-6 lg:px-8">
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        {/* Feedback Message */}
                        {feedback && (
                            <div className="mb-6 p-4 rounded-lg backdrop-blur-md mx-auto max-w-2xl text-center" style={{
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                border: '1px solid rgba(56, 182, 255, 0.3)',
                                color: '#000b3d'
                            }}>
                                {feedback}
                            </div>
                        )}

                        {/* Main Content Grid - Two Panels */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Panel 1: Subscription Usage */}
                    <div className="relative backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden py-8 px-6 sm:px-8" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                        boxShadow: '0 4px 24px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)'
                    }}>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                            <span className="text-2xl">📊</span> SUBSCRIPTION USAGE
                        </h2>
                        
                        {usageData ? (
                            <div className="space-y-6">
                                {/* Current Plan and Remaining Quota - Side by Side */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                        border: '1px solid rgba(56, 182, 255, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>CURRENT PLAN</div>
                                        <div className="text-lg font-bold" style={{ color: '#38b6ff' }}>
                                            {subscription.subscription_plans?.plan_name ||  'Unknown Plan'}
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                        border: '1px solid rgba(249, 210, 23, 0.3)'
                                    }}>
                                        <div className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>REMAINING TODAY</div>
                                        <div className="text-lg font-bold" style={{ color: '#f9d217' }}>
                                            {usageData.remaining.toFixed(2)} mAh
                                        </div>
                                        {usageData.borrowedToday > 0 && (
                                            <div className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>
                                                (includes {usageData.borrowedToday.toFixed(2)} mAh borrowed)
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Daily Usage Progress */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>DAILY USAGE PROGRESS</span>
                                        <span className="text-sm font-bold" style={{ color: '#000b3d' }}>
                                            {Math.min(usageData.consumed, usageData.dailyLimit).toFixed(2)} / {usageData.dailyLimit} mAh
                                        </span>
                                    </div>
                                    
                                    {/* Main Progress Bar - Original Daily Limit */}
                                    <div className="w-full rounded-full h-3 backdrop-blur-md" style={{
                                        background: 'rgba(0, 11, 61, 0.1)',
                                        border: '1px solid rgba(255, 255, 255, 0.3)'
                                    }}>
                                        <div
                                            className="h-3 rounded-full transition-all duration-500"
                                            style={{ 
                                                width: `${Math.min(100, usageData.dailyPercentage)}%`,
                                                background: usageStatus?.color === 'red' 
                                                    ? 'linear-gradient(135deg, #ff6b6b 0%, #dc2626 100%)'
                                                    : usageStatus?.color === 'orange'
                                                    ? 'linear-gradient(135deg, #f9d217 0%, #f59e0b 100%)'
                                                    : usageStatus?.color === 'yellow'
                                                    ? 'linear-gradient(135deg, #f9d217 0%, #eab308 100%)'
                                                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                            }}
                                        ></div>
                                    </div>
                                    
                                    <div className="text-xs text-center" style={{ color: '#000b3d', opacity: 0.6 }}>
                                        {usageData.dailyPercentage.toFixed(1)}% USED
                                    </div>
                                </div>

                                {/* Extended Usage Progress - Only show if there are extensions */}
                                {usageData.borrowedToday > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm" style={{ color: '#000b3d', opacity: 0.8 }}>EXTENDED USAGE</span>
                                            <span className="text-sm font-bold" style={{ color: '#000b3d' }}>
                                                {usageData.extendedConsumed.toFixed(2)} / {usageData.borrowedToday.toFixed(2)} mAh
                                            </span>
                                        </div>
                                        
                                        {/* Extended Progress Bar */}
                                        <div className="w-full rounded-full h-3 backdrop-blur-md" style={{
                                            background: 'rgba(0, 11, 61, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.3)'
                                        }}>
                                            <div
                                                className="h-3 rounded-full transition-all duration-500"
                                                style={{ 
                                                    width: `${Math.min(100, usageData.extendedPercentage)}%`,
                                                    background: 'linear-gradient(135deg, #f9d217 0%, #f59e0b 100%)'
                                                }}
                                            ></div>
                                        </div>
                                        
                                        <div className="text-xs text-center" style={{ color: '#000b3d', opacity: 0.6 }}>
                                            {usageData.extendedConsumed > 0 
                                                ? `${usageData.extendedPercentage.toFixed(1)}% OF EXTENDED QUOTA USED`
                                                : `${usageData.borrowedToday.toFixed(2)} mAh EXTENSION AVAILABLE`
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* Next Day Remaining - Only show if there are borrowed penalties */}
                                {usageData.borrowedPending > 0 && (
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>NEXT DAY REMAINING</div>
                                        <div className="text-lg font-bold" style={{ color: '#dc2626' }}>
                                            {(usageData.originalDailyLimit - usageData.borrowedPending).toFixed(2)} mAh
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: '#dc2626', opacity: 0.8 }}>
                                            DAILY LIMIT WILL BE REDUCED BY {usageData.borrowedPending.toFixed(2)} mAh (BORROWED AMOUNT + PENALTY)
                                        </div>
                                    </div>
                                )}

                                {/* Usage Status Alert */}
                                {usageStatus && (
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: usageStatus.color === 'red' 
                                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)'
                                            : usageStatus.color === 'orange'
                                            ? 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)'
                                            : usageStatus.color === 'yellow'
                                            ? 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)'
                                            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                        border: usageStatus.color === 'red'
                                            ? '1px solid rgba(239, 68, 68, 0.3)'
                                            : usageStatus.color === 'orange'
                                            ? '1px solid rgba(249, 210, 23, 0.3)'
                                            : usageStatus.color === 'yellow'
                                            ? '1px solid rgba(249, 210, 23, 0.3)'
                                            : '1px solid rgba(16, 185, 129, 0.3)'
                                    }}>
                                        <div className="flex items-start gap-3">
                                            <div className="text-xl">
                                                {usageStatus.color === 'red' ? '⚠️' :
                                                 usageStatus.color === 'orange' ? '⚠️' :
                                                 usageStatus.color === 'yellow' ? '⚡' : '✅'}
                                            </div>
                                            <div>
                                                <div className="font-semibold uppercase" style={{ color: '#000b3d' }}>
                                                    {usageStatus.message}
                                                </div>
                                                <div className="text-sm mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>
                                                    {usageStatus.suggestion}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Quota Extension Section */}
                                {usageStatus && usageStatus.status === 'critical' && quotaPricing && (
                                    <div className="border-t pt-4" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                                        <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                            border: '1px solid rgba(249, 210, 23, 0.3)'
                                        }}>
                                            <div className="text-center mb-4">
                                                <div className="text-2xl mb-2">⚠️</div>
                                                <h3 className="text-lg font-bold mb-1 uppercase" style={{ color: '#000b3d' }}>DAILY QUOTA REACHED</h3>
                                                <p className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>CHOOSE AN EXTENSION OPTION TO CONTINUE CHARGING:</p>
                                            </div>

                                            {/* Extension Type Selection */}
                                            <div className="space-y-3 mb-4">
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => {
                                                            setExtensionType('direct_purchase');
                                                            setExtensionAmount(quotaPricing?.direct_purchase?.extension_amount_mah || 1000);
                                                        }}
                                                        className={`flex-1 py-2 px-3 rounded-xl border-2 transition-all duration-300 text-sm ${
                                                            extensionType === 'direct_purchase'
                                                                ? 'border-blue-500 backdrop-blur-md'
                                                                : 'border-white/30 backdrop-blur-md hover:border-white/50'
                                                        }`}
                                                        style={extensionType === 'direct_purchase' ? {
                                                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                                            color: '#000b3d'
                                                        } : {
                                                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                                                            color: '#000b3d'
                                                        }}
                                                    >
                                                        <div className="font-semibold">🔋 DIRECT PURCHASE</div>
                                                        <div className="text-xs opacity-75">
                                                            ₱{quotaPricing?.direct_purchase?.price_per_transaction || 10} FOR {quotaPricing?.direct_purchase?.extension_amount_mah || 1000}mAh
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={() => setExtensionType('borrow_next_day')}
                                                        className={`flex-1 py-2 px-3 rounded-xl border-2 transition-all duration-300 text-sm ${
                                                            extensionType === 'borrow_next_day'
                                                                ? 'border-orange-500 backdrop-blur-md'
                                                                : 'border-white/30 backdrop-blur-md hover:border-white/50'
                                                        }`}
                                                        style={extensionType === 'borrow_next_day' ? {
                                                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                                            color: '#000b3d'
                                                        } : {
                                                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                                                            color: '#000b3d'
                                                        }}
                                                    >
                                                        <div className="font-semibold">⏰ BORROW NEXT DAY</div>
                                                        <div className="text-xs opacity-75">BORROW WITH PENALTY</div>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Extension Details */}
                                            <div className="p-3 rounded-xl backdrop-blur-md mb-4" style={{
                                                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                border: '1px solid rgba(255, 255, 255, 0.3)'
                                            }}>
                                                <div className="space-y-3">
                                                    {/* Amount Input */}
                                                    <div>
                                                        <label className="block text-xs font-medium mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                            AMOUNT (mAh)
                                                        </label>
                                                        {extensionType === 'direct_purchase' ? (
                                                            <div className="px-2 py-1 text-sm rounded-xl backdrop-blur-md" style={{
                                                                background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.1) 0%, rgba(0, 11, 61, 0.05) 100%)',
                                                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                                                color: '#000b3d'
                                                            }}>
                                                                {quotaPricing?.direct_purchase?.extension_amount_mah || 1000} mAh (FIXED)
                                                            </div>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                min={quotaPricing[extensionType]?.min_purchase_mah || 100}
                                                                max={quotaPricing[extensionType]?.max_purchase_mah || 5000}
                                                                value={extensionAmount}
                                                                onChange={(e) => setExtensionAmount(parseInt(e.target.value) || 1000)}
                                                                className="w-full px-2 py-1 text-sm rounded-xl backdrop-blur-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                                style={{
                                                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                                                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                                                    color: '#000b3d'
                                                                }}
                                                            />
                                                        )}
                                                        {extensionType !== 'direct_purchase' && (
                                                            <div className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>
                                                                MIN: {quotaPricing[extensionType]?.min_purchase_mah || 100} mAh | 
                                                                MAX: {quotaPricing[extensionType]?.max_purchase_mah || 5000} mAh
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Cost Breakdown */}
                                                    <div className="p-2 rounded-xl backdrop-blur-md" style={{
                                                        background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.1) 0%, rgba(0, 11, 61, 0.05) 100%)',
                                                        border: '1px solid rgba(255, 255, 255, 0.3)'
                                                    }}>
                                                        <div className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>COST BREAKDOWN:</div>
                                                        <div className="text-xs font-medium" style={{ color: '#000b3d' }}>{extensionCost.breakdown}</div>
                                                        <div className="text-sm font-bold mt-1" style={{ color: '#38b6ff' }}>
                                                            TOTAL: {formatCurrency(extensionCost.cost)}
                                                        </div>
                                                    </div>

                                                    {/* Extension Type Info */}
                                                    {extensionType === 'borrow_next_day' && (
                                                        <div className="p-2 rounded-xl backdrop-blur-md" style={{
                                                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                                            border: '1px solid rgba(249, 210, 23, 0.3)'
                                                        }}>
                                                            <div className="text-xs" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                                <strong>NOTE:</strong> YOU'LL BE CHARGED {quotaPricing.borrow_next_day?.penalty_percentage}% PENALTY TOMORROW.
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => setShowQuotaModal(false)}
                                                    className="flex-1 py-2 px-3 rounded-xl text-sm font-bold transition-all duration-300 hover:scale-105"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.8) 0%, rgba(75, 85, 99, 0.8) 100%)',
                                                        color: 'white',
                                                        boxShadow: '0 4px 16px rgba(107, 114, 128, 0.3)'
                                                    }}
                                                >
                                                    CANCEL
                                                </button>
                                                <button
                                                    onClick={purchaseExtension}
                                                    disabled={processingExtension}
                                                    className="flex-1 py-2 px-3 rounded-xl text-sm font-bold transition-all duration-300 hover:scale-105 disabled:opacity-50"
                                                    style={{
                                                        background: processingExtension 
                                                            ? 'linear-gradient(135deg, rgba(56, 182, 255, 0.6) 0%, rgba(0, 11, 61, 0.6) 100%)'
                                                            : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                                        color: 'white',
                                                        boxShadow: '0 4px 16px rgba(56, 182, 255, 0.3)'
                                                    }}
                                                >
                                                    {processingExtension ? 'PROCESSING...' : 'PURCHASE EXTENSION'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        ) : (
                            <EmptyState icon="📊" title="No Usage Data" message="Unable to load subscription usage data." />
                        )}
                    </div>

                    {/* Panel 2: Overall Consumption */}
                    <div className="relative backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden py-8 px-6 sm:px-8" style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                        boxShadow: '0 4px 24px 0 rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)'
                    }}>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                            <span className="text-2xl">📈</span> OVERALL CONSUMPTION
                        </h2>
                        
                        {usage ? (
                            <div className="space-y-6">
                                {/* Monthly Statistics */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                        border: '1px solid rgba(56, 182, 255, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>TOTAL SESSIONS</div>
                                        <div className="text-2xl font-bold" style={{ color: '#38b6ff' }}>{usage.totalSessions}</div>
                                    </div>
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                        border: '1px solid rgba(249, 210, 23, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>TOTAL DURATION</div>
                                        <div className="text-2xl font-bold" style={{ color: '#f9d217' }}>{usage.totalDuration} min</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)',
                                        border: '1px solid rgba(139, 92, 246, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>TOTAL ENERGY</div>
                                        <div className="text-2xl font-bold" style={{ color: '#8b5cf6' }}>
                                            {usage.totalEnergyMAH ? parseFloat(usage.totalEnergyMAH).toFixed(2) : '0.00'} mAh
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(249, 115, 22, 0.1) 100%)',
                                        border: '1px solid rgba(249, 115, 22, 0.3)'
                                    }}>
                                        <div className="text-sm mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>TOTAL COST</div>
                                        <div className="text-2xl font-bold" style={{ color: '#f97316' }}>{formatCurrency(usage.totalCost)}</div>
                                    </div>
                                </div>

                                {/* Billing History */}
                                <div className="border-t pt-4" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                                    <h3 className="text-lg font-semibold mb-3" style={{ color: '#000b3d' }}>RECENT BILLING</h3>
                                    {billing.length > 0 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {billing.slice(0, 3).map((bill, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 rounded-xl backdrop-blur-md" style={{
                                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%)',
                                                    border: '1px solid rgba(255, 255, 255, 0.3)'
                                                }}>
                                                    <div>
                                                        <div className="text-sm font-medium" style={{ color: '#000b3d' }}>{formatDate(bill.date)}</div>
                                                        <div className="text-xs" style={{ color: '#000b3d', opacity: 0.7 }}>{formatStatusText(bill.status)}</div>
                                                    </div>
                                                    <div className="text-sm font-bold" style={{ color: '#000b3d' }}>{formatCurrency(bill.amount)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-4" style={{ color: '#000b3d', opacity: 0.7 }}>
                                            <div className="text-2xl mb-2">📜</div>
                                            <div className="text-sm">NO BILLING HISTORY YET</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <EmptyState icon="📈" title="No Consumption Data" message="Start a charging session to see your consumption statistics." />
                        )}
                    </div>
                </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap justify-center gap-4 mt-8">
                            <button
                                onClick={() => navigate('/subscription')}
                                className="group relative px-8 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                    focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                }}
                            >
                                <span className="relative z-10">MANAGE SUBSCRIPTION</span>
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                    background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                }}></div>
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default UsagePage;

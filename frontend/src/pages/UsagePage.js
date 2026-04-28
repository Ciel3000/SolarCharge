// frontend/src/pages/UsagePage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

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
    const { session, subscription, usageAggregate } = useAuth();
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

    // Billing history collapsible state
    const [billingOpen, setBillingOpen] = useState(false);

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
        if (!usageAggregate) return null;

        const { daily_limit, total_consumed, remaining } = usageAggregate;
        const dailyLimit = daily_limit || 0;
        const consumed = total_consumed || 0;
        
        const dailyPercentage = dailyLimit > 0 ? (consumed / dailyLimit) * 100 : 0;

        return {
            dailyLimit,
            consumed,
            remaining,
            dailyPercentage,
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

    // Helper function to format mAh with commas
    const formatMah = (mah) => {
        return mah.toLocaleString();
    };

    return (
        <div className="min-h-dvh flex flex-col justify-start text-gray-800" style={{ background: '#f1f3e0' }}>
            {/* MOBILE LAYOUT (< lg:) */}
            <div className="lg:hidden pt-16">
                {/* Page Header */}
                <div className="flex justify-between items-start px-4 pt-3 pb-3">
                    <div>
                        <h1 className="text-xl font-extrabold" style={{ color: '#1e293b' }}>Usage</h1>
                        <p className="text-xs" style={{ color: '#64748b', marginTop: 1 }}>Track your charging sessions</p>
                    </div>
                    {usageData && (
                        <div className="text-right p-2 rounded-xl" style={{
                            background: 'rgba(56, 182, 255, 0.1)',
                            border: '1px solid rgba(56, 182, 255, 0.25)'
                        }}>
                            <div className="text-lg font-extrabold" style={{ color: '#38b6ff', lineHeight: 1 }}>
                                {formatMah(usageData.remaining)} mAh
                            </div>
                            <div className="text-[9px]" style={{ color: '#64748b', marginTop: 2 }}>remaining today</div>
                        </div>
                    )}
                </div>

                {/* Feedback Message */}
                {feedback && (
                    <div className="mx-4 mb-3 p-3 rounded-lg text-center text-sm" style={{
                        background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                        border: '1px solid rgba(56, 182, 255, 0.3)',
                        color: '#000b3d'
                    }}>
                        {feedback}
                    </div>
                )}

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto pb-24" style={{ scrollbarWidth: 'none' }}>
                    {/* Quota Alert - Critical/Full States */}
                    {usageStatus && usageStatus.status !== 'good' && (
                        <div className="mx-4 mb-3 rounded-2xl p-3" style={{
                            background: usageStatus.status === 'critical' 
                                ? 'rgba(239, 68, 68, 0.06)' 
                                : 'rgba(249, 210, 23, 0.1)',
                            border: usageStatus.status === 'critical'
                                ? '1px solid rgba(239, 68, 68, 0.2)'
                                : '1px solid rgba(249, 210, 23, 0.25)'
                        }}>
                            <div className="flex items-center gap-2 mb-2">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2L2 19h20L12 2z" stroke={usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b'} strokeWidth="2" strokeLinejoin="round"/>
                                    <path d="M12 9v4M12 16h.01" stroke={usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b'} strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                <div>
                                    <div className="text-sm font-bold" style={{ color: usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b' }}>
                                        {usageStatus.status === 'critical' ? 'Daily quota reached' : 'Quota almost full'}
                                    </div>
                                    <div className="text-xs" style={{ color: usageStatus.status === 'critical' ? '#ef4444' : '#d97706', opacity: 0.8 }}>
                                        {usageStatus.status === 'critical' ? 'Extend to continue charging' : `${formatMah(usageData.remaining)} mAh remaining`}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setExtensionType('direct_purchase');
                                        setExtensionAmount(quotaPricing?.direct_purchase?.extension_amount_mah || 1000);
                                        setShowQuotaModal(true);
                                    }}
                                    className="flex-1 py-2 rounded-lg text-xs font-bold"
                                    style={{
                                        background: 'rgba(56, 182, 255, 0.12)',
                                        color: '#38b6ff',
                                        border: '1px solid rgba(56, 182, 255, 0.3)'
                                    }}
                                >
                                    Direct purchase
                                </button>
                                <button
                                    onClick={() => {
                                        setExtensionType('borrow_next_day');
                                        setShowQuotaModal(true);
                                    }}
                                    className="flex-1 py-2 rounded-lg text-xs font-bold"
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        color: '#10b981',
                                        border: '1px solid rgba(16, 185, 129, 0.25)'
                                    }}
                                >
                                    Borrow next day
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Daily Usage Card - Glass Card Style */}
                    <div className="mx-4 mb-3 rounded-xl p-3" style={{
                        background: 'rgba(255, 255, 255, 0.65)',
                        border: '1px solid rgba(255, 255, 255, 0.9)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div className="text-[9px] font-bold tracking-wider uppercase mb-2" style={{ color: '#94a3b8' }}>Current plan</div>
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-lg font-bold" style={{ color: '#1e293b' }}>{subscription.plan_name || 'Unknown Plan'}</div>
                                <div className="text-xs" style={{ color: '#64748b', marginTop: 2 }}>Resets daily at midnight</div>
                            </div>
                            <div className="inline-flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-bold" style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: '#059669',
                                border: '1px solid rgba(16, 185, 129, 0.2)'
                            }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }}></div>
                                Active
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="flex gap-2 mt-3">
                            <div className="flex-1 text-center p-2 rounded-xl" style={{
                                background: 'rgba(56, 182, 255, 0.06)',
                                border: '1px solid rgba(56, 182, 255, 0.12)'
                            }}>
                                <div className="text-lg font-extrabold" style={{ color: '#38b6ff', lineHeight: 1 }}>
                                    {formatMah(Math.min(usageData.consumed, usageData.dailyLimit))}
                                </div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>mAh used</div>
                            </div>
                            <div className="flex-1 text-center p-2 rounded-xl" style={{
                                background: 'rgba(16, 185, 129, 0.06)',
                                border: '1px solid rgba(16, 185, 129, 0.12)'
                            }}>
                                <div className="text-lg font-extrabold" style={{
                                    color: usageStatus?.color === 'red' ? '#ef4444' : usageStatus?.color === 'orange' ? '#f59e0b' : '#10b981',
                                    lineHeight: 1
                                }}>
                                    {formatMah(usageData.remaining)}
                                </div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>mAh left</div>
                            </div>
                            <div className="flex-1 text-center p-2 rounded-xl" style={{
                                background: 'rgba(0, 0, 0, 0.03)',
                                border: '1px solid rgba(0, 0, 0, 0.06)'
                            }}>
                                <div className="text-lg font-extrabold" style={{ color: '#1e293b', lineHeight: 1 }}>
                                    {usage?.totalSessions || 0}
                                </div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>sessions</div>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                            <div className="flex justify-between mb-1">
                                <span className="text-xs" style={{ color: '#64748b' }}>Daily usage</span>
                                <span className="text-xs font-bold" style={{ color: '#1e293b' }}>{Math.min(usageData.dailyPercentage, 100).toFixed(0)}% used</span>
                            </div>
                            <div className="h-2 rounded-lg overflow-hidden" style={{ background: 'rgba(0, 0, 0, 0.06)' }}>
                                <div className="h-full rounded-lg transition-all duration-400" style={{ 
                                    width: `${Math.min(100, usageData.dailyPercentage)}%`,
                                    background: usageStatus?.color === 'red' 
                                        ? '#ef4444' 
                                        : usageStatus?.color === 'orange' 
                                        ? '#f59e0b' 
                                        : '#38b6ff'
                                }}></div>
                            </div>
                        </div>
                    </div>

                    {/* Overall Consumption Header */}
                    <div className="px-4 mb-2">
                        <div className="text-sm font-bold" style={{ color: '#1e293b' }}>Overall consumption</div>
                    </div>

                    {/* Horizontal Scroll Stats */}
                    <div className="overflow-x-auto mb-3 px-4" style={{ scrollbarWidth: 'none' }}>
                        <div className="flex gap-2" style={{ width: 'max-content' }}>
                            {/* Total Sessions */}
                            <div className="w-24 p-3 rounded-2xl flex-shrink-0" style={{
                                background: 'rgba(255, 255, 255, 0.65)',
                                border: '1px solid rgba(255, 255, 255, 0.9)',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                            }}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: 'rgba(56, 182, 255, 0.1)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#38b6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="text-base font-extrabold" style={{ color: '#38b6ff', lineHeight: 1 }}>{usage?.totalSessions || 0}</div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>Total sessions</div>
                            </div>

                            {/* Total Duration */}
                            <div className="w-24 p-3 rounded-2xl flex-shrink-0" style={{
                                background: 'rgba(255, 255, 255, 0.65)',
                                border: '1px solid rgba(255, 255, 255, 0.9)',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                            }}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="#10b981" strokeWidth="2"/>
                                        <path d="M12 6v6l4 2" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
                                    </svg>
                                </div>
                                <div className="text-base font-extrabold" style={{ color: '#10b981', lineHeight: 1 }}>{usage?.totalDuration || 0}h</div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>Total duration</div>
                            </div>

                            {/* Total Energy */}
                            <div className="w-24 p-3 rounded-2xl flex-shrink-0" style={{
                                background: 'rgba(255, 255, 255, 0.65)',
                                border: '1px solid rgba(255, 255, 255, 0.9)',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                            }}>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: 'rgba(249, 210, 23, 0.15)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="text-base font-extrabold" style={{ color: '#b45309', lineHeight: 1 }}>
                                    {usage?.totalEnergyMAH ? (parseFloat(usage.totalEnergyMAH) / 1000).toFixed(0) : 0}
                                </div>
                                <div className="text-[9px]" style={{ color: '#94a3b8', marginTop: 3 }}>mAh total</div>
                            </div>

                        </div>
                    </div>

                    {/* Manage Subscription CTA */}
                    <button
                        onClick={() => navigate('/subscription')}
                        className="block w-[calc(100%-2rem)] mx-4 mb-3 py-3 rounded-xl text-center text-sm font-bold text-white"
                        style={{
                            background: '#38b6ff'
                        }}
                    >
                        Manage subscription
                    </button>

                    {/* Collapsible Billing History */}
                    <div 
                        className="flex justify-between items-center mx-4 mb-2 cursor-pointer"
                        onClick={() => setBillingOpen(!billingOpen)}
                    >
                        <div className="text-sm font-bold" style={{ color: '#1e293b' }}>Billing history</div>
                        <div className="text-xs" style={{ color: '#38b6ff' }}>{billingOpen ? 'Hide ‹' : 'Show ›'}</div>
                    </div>

                    {billingOpen && (
                        <div className="mx-4 mb-4 rounded-xl p-2" style={{
                            background: 'rgba(255, 255, 255, 0.65)',
                            border: '1px solid rgba(255, 255, 255, 0.9)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                        }}>
                            {billing.length > 0 ? (
                                billing.slice(0, 5).map((bill, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-2.5" style={{
                                        borderBottom: idx < billing.length - 1 ? '1px solid rgba(0, 0, 0, 0.05)' : 'none'
                                    }}>
                                        <div>
                                            <div className="text-sm font-semibold" style={{ color: '#1e293b' }}>
                                                {bill.description || subscription?.plan_name || 'Solar Pro'}
                                            </div>
                                            <div className="text-xs" style={{ color: '#94a3b8', marginTop: 1 }}>{formatDate(bill.date)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-bold" style={{ color: '#1e293b' }}>{formatCurrency(bill.amount)}</div>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                color: '#059669'
                                            }}>{formatStatusText(bill.status)}</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-xs" style={{ color: '#94a3b8' }}>
                                    No billing history yet
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ height: 24 }}></div>
                </div>
            </div>

            {/* DESKTOP LAYOUT (lg: and above) */}
            <div className="hidden lg:block w-full pt-20 pb-8">
                <section className="w-full max-w-6xl mx-auto mb-16 relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-12 sm:py-16 px-6 sm:px-8 lg:px-12" style={{ 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <div className="absolute inset-0 opacity-30" style={{
                            background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
                            animation: 'shimmer 3s ease-in-out infinite'
                        }}></div>
                        
                        <div className="relative z-10">
                            {/* Feedback Message */}
                            {feedback && (
                                <div className="mb-6 p-4 rounded-lg text-center text-sm" style={{
                                    background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                    border: '1px solid rgba(56, 182, 255, 0.3)',
                                    color: '#000b3d'
                                }}>
                                    {feedback}
                                </div>
                            )}

                            <div className="text-center mb-10 animate-fade-in-down">
                                <div className="flex items-center justify-center space-x-3 mb-4">
                                    <img 
                                        src="/img/solarchargelogo.png" 
                                        alt="SolarCharge Logo" 
                                        className="h-12 md:h-16 w-auto drop-shadow-lg animate-logo-float"
                                    />
                                    <span className="text-3xl md:text-4xl font-black tracking-tight" style={{
                                        background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text'
                                    }}>SolarCharge</span>
                                </div>
                                <div className="text-xl md:text-2xl font-semibold" style={{ color: '#000b3d' }}>
                                    Usage Dashboard
                                </div>
                                <p className="text-lg mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>
                                    Track your charging sessions and consumption
                                </p>
                            </div>

                            {/* Quota Alert - Desktop */}
                            {usageStatus && usageStatus.status !== 'good' && (
                                <div className="mb-6 rounded-2xl p-4" style={{
                                    background: usageStatus.status === 'critical' 
                                        ? 'rgba(239, 68, 68, 0.06)' 
                                        : 'rgba(249, 210, 23, 0.1)',
                                    border: usageStatus.status === 'critical'
                                        ? '1px solid rgba(239, 68, 68, 0.2)'
                                        : '1px solid rgba(249, 210, 23, 0.25)'
                                }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                <path d="M12 2L2 19h20L12 2z" stroke={usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b'} strokeWidth="2" strokeLinejoin="round"/>
                                                <path d="M12 9v4M12 16h.01" stroke={usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b'} strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                            <div>
                                                <div className="text-lg font-bold" style={{ color: usageStatus.status === 'critical' ? '#dc2626' : '#f59e0b' }}>
                                                    {usageStatus.status === 'critical' ? 'Daily quota reached' : 'Quota almost full'}
                                                </div>
                                                <div className="text-sm" style={{ color: usageStatus.status === 'critical' ? '#ef4444' : '#d97706', opacity: 0.8 }}>
                                                    {usageStatus.status === 'critical' ? 'Extend to continue charging' : `${formatMah(usageData.remaining)} mAh remaining`}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => {
                                                    setExtensionType('direct_purchase');
                                                    setExtensionAmount(quotaPricing?.direct_purchase?.extension_amount_mah || 1000);
                                                    setShowQuotaModal(true);
                                                }}
                                                className="px-4 py-2 rounded-xl text-sm font-bold"
                                                style={{
                                                    background: 'rgba(56, 182, 255, 0.12)',
                                                    color: '#38b6ff',
                                                    border: '1px solid rgba(56, 182, 255, 0.3)'
                                                }}
                                            >
                                                Direct purchase
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setExtensionType('borrow_next_day');
                                                    setShowQuotaModal(true);
                                                }}
                                                className="px-4 py-2 rounded-xl text-sm font-bold"
                                                style={{
                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                    color: '#10b981',
                                                    border: '1px solid rgba(16, 185, 129, 0.25)'
                                                }}
                                            >
                                                Borrow next day
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Desktop Usage Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                {/* Current Plan Card */}
                                <div className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    boxShadow: '0 8px 32px 0 rgba(56, 182, 255, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                                }}>
                                    <h4 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                                        <span className="text-2xl">📋</span> Current Plan
                                    </h4>
                                    <div className="text-lg font-bold mb-2" style={{ color: '#000b3d' }}>{subscription.plan_name || 'Unknown Plan'}</div>
                                    <div className="text-sm mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>Resets daily at midnight</div>
                                    
                                    <div className="grid grid-cols-3 gap-3 w-full mb-6">
                                        <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                            border: '1px solid rgba(56, 182, 255, 0.3)'
                                        }}>
                                            <span className="text-xl font-bold" style={{ color: '#38b6ff' }}>{formatMah(Math.min(usageData.consumed, usageData.dailyLimit))}</span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>mAh used</span>
                                        </div>
                                        <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)'
                                        }}>
                                            <span className="text-xl font-bold" style={{ color: '#10b981' }}>{formatMah(usageData.remaining)}</span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>mAh left</span>
                                        </div>
                                        <div className="flex flex-col items-center rounded-xl px-3 py-3 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                                            border: '1px solid rgba(0, 11, 61, 0.3)'
                                        }}>
                                            <span className="text-lg font-bold" style={{ color: '#000b3d' }}>{usage?.totalSessions || 0}</span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Sessions</span>
                                        </div>
                                    </div>
                                    
                                    <div className="w-full mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium" style={{ color: '#000b3d', opacity: 0.8 }}>Daily Usage</span>
                                            <span className="text-sm font-bold" style={{ color: '#000b3d' }}>{Math.min(usageData.dailyPercentage, 100).toFixed(0)}% used</span>
                                        </div>
                                        <div className="h-3 rounded-lg overflow-hidden backdrop-blur-md" style={{ background: 'rgba(0, 11, 61, 0.1)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                                            <div className="h-full rounded-lg transition-all duration-400" style={{ 
                                                width: `${Math.min(100, usageData.dailyPercentage)}%`,
                                                background: usageStatus?.color === 'red' 
                                                    ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                                    : usageStatus?.color === 'orange' 
                                                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                                    : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)'
                                            }}></div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => navigate('/subscription')}
                                        className="group relative px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 w-full mt-auto"
                                        style={{
                                            background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                            boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                            focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                        }}
                                    >
                                        <span className="relative z-10">Manage Subscription</span>
                                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                        }}></div>
                                    </button>
                                </div>

                                {/* Overall Statistics Card */}
                                <div className="group relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 flex flex-col transform transition-all duration-500 hover:scale-105 hover:-translate-y-2" style={{
                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                    boxShadow: '0 8px 32px 0 rgba(249, 210, 23, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                                }}>
                                    <h4 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                                        <span className="text-2xl">📊</span> Overall Statistics
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col items-center rounded-xl px-3 py-4 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                            border: '1px solid rgba(56, 182, 255, 0.3)'
                                        }}>
                                            <span className="text-2xl font-bold" style={{ color: '#38b6ff' }}>{usage?.totalSessions || 0}</span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Total Sessions</span>
                                        </div>
                                        <div className="flex flex-col items-center rounded-xl px-3 py-4 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)'
                                        }}>
                                            <span className="text-2xl font-bold" style={{ color: '#10b981' }}>{usage?.totalDuration || 0}h</span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>Total Duration</span>
                                        </div>
                                        <div className="flex flex-col items-center rounded-xl px-3 py-4 backdrop-blur-md" style={{
                                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                            border: '1px solid rgba(249, 210, 23, 0.3)'
                                        }}>
                                            <span className="text-xl font-bold" style={{ color: '#f9d217' }}>
                                                {usage?.totalEnergyMAH ? (parseFloat(usage.totalEnergyMAH) / 1000).toFixed(0) : 0}
                                            </span>
                                            <span className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.7 }}>mAh Total</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Billing History Section */}
                            <div className="mt-8">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-2xl font-bold" style={{ color: '#000b3d' }}>Billing History</h3>
                                    <button 
                                        onClick={() => setBillingOpen(!billingOpen)}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold"
                                        style={billingOpen ? { background: '#38b6ff', color: 'white' } : { background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.1)', color: '#000b3d' }}
                                    >
                                        {billingOpen ? 'Hide' : 'Show'}
                                    </button>
                                </div>

                                {billingOpen && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {billing.length > 0 ? (
                                            billing.slice(0, 6).map((bill, idx) => (
                                                <div key={idx} className="relative backdrop-blur-xl rounded-2xl p-4 transform transition-all duration-500 hover:scale-105 overflow-hidden" style={{
                                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                    border: '1px solid rgba(255, 255, 255, 0.3)',
                                                    boxShadow: '0 4px 16px rgba(0, 11, 61, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                                                }}>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="text-base font-semibold" style={{ color: '#000b3d' }}>
                                                            {bill.description || subscription?.plan_name || 'Solar Pro'}
                                                        </div>
                                                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: '#059669'
                                                        }}>{formatStatusText(bill.status)}</span>
                                                    </div>
                                                    <div className="text-sm" style={{ color: '#000b3d', opacity: 0.7 }}>{formatDate(bill.date)}</div>
                                                    <div className="text-lg font-bold mt-2" style={{ color: '#38b6ff' }}>{formatCurrency(bill.amount)}</div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="col-span-full text-center py-8" style={{ color: '#000b3d', opacity: 0.7 }}>
                                                No billing history yet
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default UsagePage;

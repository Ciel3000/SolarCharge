// frontend/src/pages/AdminQuotaPricing.js

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminQuotaPricing({ navigateTo, handleSignOut }) {
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [pricing, setPricing] = useState({
        direct_purchase: {
            price_per_mah: 0.01,
            base_fee: 0,
            penalty_percentage: 0,
            min_purchase_mah: 100,
            max_purchase_mah: 5000,
            is_active: true
        },
        borrow_next_day: {
            price_per_mah: 0,
            base_fee: 10.00,
            penalty_percentage: 20,
            min_purchase_mah: 100,
            max_purchase_mah: 2000,
            is_active: true
        }
    });

    // Fetch current pricing configuration
    const fetchPricing = useCallback(async () => {
        try {
            // Get authentication token
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
                throw new Error("Not authenticated");
            }
            
            console.log('Fetching pricing from:', `${BACKEND_URL}/api/admin/quota/pricing`);
            console.log('Session token:', session.access_token ? 'Present' : 'Missing');
            
            const res = await fetch(`${BACKEND_URL}/api/admin/quota/pricing`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            console.log('Response status:', res.status);

            if (!res.ok) {
                const errorText = await res.text();
                console.error('Error response:', errorText);
                throw new Error(`Failed to fetch pricing (Status: ${res.status}): ${errorText}`);
            }

            const data = await res.json();
            console.log('Received pricing data:', data);
            setPricing(data);
        } catch (err) {
            console.error('Failed to fetch pricing:', err);
            setFeedback(`Failed to load pricing configuration: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPricing();
    }, [fetchPricing]);

    // Update pricing configuration
    const updatePricing = async () => {
        setSaving(true);
        setFeedback('');

        try {
            // Get authentication token
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
                throw new Error("Not authenticated");
            }
            
            const res = await fetch(`${BACKEND_URL}/api/admin/quota/pricing`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    direct_purchase: pricing.direct_purchase,
                    borrow_next_day: pricing.borrow_next_day
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Failed to update pricing (Status: ${res.status})`);
            }

            setFeedback('Pricing updated successfully!');
        } catch (err) {
            console.error('Failed to update pricing:', err);
            setFeedback(`Failed to update pricing: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // Handle input changes
    const handleInputChange = (extensionType, field, value) => {
        setPricing(prev => ({
            ...prev,
            [extensionType]: {
                ...prev[extensionType],
                [field]: value
            }
        }));
    };

    // Calculate example costs
    const calculateExampleCosts = () => {
        const direct = pricing.direct_purchase;
        const borrow = pricing.borrow_next_day;
        
        const directCost = 1000 * direct.price_per_mah;
        const borrowBaseFee = borrow.base_fee;
        const borrowPenalty = 1000 * (borrow.penalty_percentage / 100); // Penalty on borrowed amount
        const borrowTotalCost = borrowBaseFee + borrowPenalty;
        
        return {
            direct: directCost,
            borrow: borrowTotalCost,
            borrowBreakdown: {
                baseFee: borrowBaseFee,
                penalty: borrowPenalty
            }
        };
    };

    const exampleCosts = calculateExampleCosts();

    // Helper function to format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP',
        }).format(amount || 0);
    };

    if (loading) {
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
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mx-auto mb-4" style={{
                        borderColor: '#38b6ff',
                        borderTopColor: 'transparent'
                    }}></div>
                    <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading pricing configuration...</p>
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

            <div className="w-full max-w-6xl mx-auto pt-24 pb-8 relative z-10 px-4 sm:px-6 lg:px-8" style={{ 
                animation: 'fade-in 0.6s ease-out forwards',
                willChange: 'opacity, transform'
            }}>
                {/* Header - Wrapped in its own glass card */}
                <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-8 mb-8 text-center" style={{ 
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <h1 className="text-4xl font-bold mb-2" style={{ color: '#000b3d' }}>Quota Extension Pricing</h1>
                    <p style={{ color: '#000b3d', opacity: 0.7 }}>Manage pricing for quota extensions and borrowing</p>
                </div>

                {/* Feedback Message */}
                {feedback && (
                    <div className={`relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6 text-center ${
                        feedback.includes('successfully') 
                            ? '' 
                            : ''
                    }`} style={{
                        background: feedback.includes('successfully')
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)'
                            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
                        borderColor: feedback.includes('successfully')
                            ? 'rgba(16, 185, 129, 0.3)'
                            : 'rgba(239, 68, 68, 0.3)',
                        boxShadow: feedback.includes('successfully')
                            ? '0 8px 32px 0 rgba(16, 185, 129, 0.15)'
                            : '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
                    }}>
                        <p className="font-semibold" style={{ color: feedback.includes('successfully') ? '#059669' : '#dc2626' }}>{feedback}</p>
                    </div>
                )}

                {/* Pricing Configuration */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Direct Purchase Pricing */}
                    <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                            <span style={{ color: '#38b6ff' }}>🔋</span> Direct Purchase Pricing
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Enable/Disable */}
                            <div className="flex items-center justify-between">
                                <label className="font-bold" style={{ color: '#000b3d' }}>Enable Direct Purchase</label>
                                <input
                                    type="checkbox"
                                    checked={pricing.direct_purchase.is_active}
                                    onChange={(e) => handleInputChange('direct_purchase', 'is_active', e.target.checked)}
                                    className="w-5 h-5 rounded"
                                    style={{ accentColor: '#38b6ff' }}
                                />
                            </div>

                            {/* Price Configuration */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Price per Transaction (₱)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={pricing.direct_purchase.price_per_transaction || 10}
                                    onChange={(e) => handleInputChange('direct_purchase', 'price_per_transaction', parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="10.00"
                                />
                                <p className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>
                                    Fixed price per direct purchase transaction
                                </p>
                            </div>

                            {/* Amount Configuration */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Extension Amount (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="100"
                                    value={pricing.direct_purchase.extension_amount_mah || 1000}
                                    onChange={(e) => handleInputChange('direct_purchase', 'extension_amount_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="1000"
                                />
                                <p className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>
                                    Amount of mAh users get per direct purchase transaction
                                </p>
                            </div>

                            {/* PayPal Link */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    PayPal Sandbox Link
                                </label>
                                <input
                                    type="url"
                                    value={pricing.direct_purchase.paypal_link || ''}
                                    onChange={(e) => handleInputChange('direct_purchase', 'paypal_link', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="https://www.sandbox.paypal.com/ncp/payment/..."
                                />
                                <p className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>
                                    PayPal sandbox link for direct purchase payments
                                </p>
                            </div>

                            {/* Example Display */}
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                                border: '1px solid rgba(56, 182, 255, 0.3)'
                            }}>
                                <div className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Current Configuration:</div>
                                <div className="text-lg font-bold" style={{ color: '#38b6ff' }}>
                                    {pricing.direct_purchase.extension_amount_mah || 1000} mAh = ₱{pricing.direct_purchase.price_per_transaction || 10}
                                </div>
                                <div className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>
                                    Per transaction
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Borrow Next Day Pricing */}
                    <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6" style={{ 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000b3d' }}>
                            <span style={{ color: '#f9d217' }}>⏰</span> Borrow Next Day Pricing
                        </h2>
                        <p className="text-sm mb-4" style={{ color: '#000b3d', opacity: 0.7 }}>
                            Users can borrow mAh today but will be charged a penalty tomorrow. 
                            Example: Borrow 100 mAh today → Charge 120 mAh tomorrow (100 + 20 penalty).
                        </p>
                        
                        <div className="space-y-4">
                            {/* Enable/Disable */}
                            <div className="flex items-center justify-between">
                                <label className="font-bold" style={{ color: '#000b3d' }}>Enable Borrow Option</label>
                                <input
                                    type="checkbox"
                                    checked={pricing.borrow_next_day.is_active}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'is_active', e.target.checked)}
                                    className="w-5 h-5 rounded"
                                    style={{ accentColor: '#38b6ff' }}
                                />
                            </div>

                            {/* Base Fee */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Base Fee
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: '#000b3d', opacity: 0.6 }}>₱</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={pricing.borrow_next_day.base_fee}
                                        onChange={(e) => handleInputChange('borrow_next_day', 'base_fee', parseFloat(e.target.value))}
                                        className="w-full pl-8 pr-3 py-2 rounded-xl transition-all duration-200"
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
                                        placeholder="10.00"
                                    />
                                </div>
                            </div>

                            {/* Penalty Percentage */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Penalty Percentage (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="100"
                                    value={pricing.borrow_next_day.penalty_percentage}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'penalty_percentage', parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="20"
                                />
                            </div>

                            {/* Min Borrow */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Minimum Borrow (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={pricing.borrow_next_day.min_purchase_mah}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'min_purchase_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="100"
                                />
                            </div>

                            {/* Max Borrow */}
                            <div>
                                <label className="block text-sm font-bold mb-2" style={{ color: '#000b3d' }}>
                                    Maximum Borrow (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={pricing.borrow_next_day.max_purchase_mah}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'max_purchase_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl transition-all duration-200"
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
                                    placeholder="2000"
                                />
                            </div>

                            {/* Example Cost */}
                            <div className="p-4 rounded-xl backdrop-blur-md" style={{
                                background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                                border: '1px solid rgba(249, 210, 23, 0.3)'
                            }}>
                                <div className="text-sm mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Example Cost (1000 mAh):</div>
                                <div className="text-lg font-bold" style={{ color: '#f9d217' }}>
                                    {formatCurrency(exampleCosts.borrow)}
                                </div>
                                <div className="text-xs space-y-1 mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>
                                    <div>• Base fee: {formatCurrency(exampleCosts.borrowBreakdown.baseFee)}</div>
                                    <div>• Penalty ({pricing.borrow_next_day.penalty_percentage}%): {formatCurrency(exampleCosts.borrowBreakdown.penalty)}</div>
                                    <div>• Tomorrow: 1000 mAh borrowed → 1200 mAh charged</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pricing Summary */}
                <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 mb-8" style={{ 
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                }}>
                    <h3 className="text-xl font-bold mb-4" style={{ color: '#000b3d' }}>💡 Pricing Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 rounded-xl backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                            border: '1px solid rgba(56, 182, 255, 0.3)'
                        }}>
                            <h4 className="font-bold mb-2" style={{ color: '#000b3d' }}>Direct Purchase:</h4>
                            <ul className="text-sm space-y-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                                <li>• {formatCurrency(pricing.direct_purchase.price_per_mah)} per mAh</li>
                                <li>• Min: {pricing.direct_purchase.min_purchase_mah} mAh</li>
                                <li>• Max: {pricing.direct_purchase.max_purchase_mah} mAh</li>
                                <li>• Example: 1000 mAh = {formatCurrency(exampleCosts.direct)}</li>
                            </ul>
                        </div>
                        <div className="p-4 rounded-xl backdrop-blur-md" style={{
                            background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                            border: '1px solid rgba(249, 210, 23, 0.3)'
                        }}>
                            <h4 className="font-bold mb-2" style={{ color: '#000b3d' }}>Borrow Next Day:</h4>
                            <ul className="text-sm space-y-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                                <li>• Base fee: {formatCurrency(pricing.borrow_next_day.base_fee)}</li>
                                <li>• Penalty: {pricing.borrow_next_day.penalty_percentage}%</li>
                                <li>• Min: {pricing.borrow_next_day.min_purchase_mah} mAh</li>
                                <li>• Max: {pricing.borrow_next_day.max_purchase_mah} mAh</li>
                                <li>• Total cost: {formatCurrency(exampleCosts.borrow)}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-4">
                    <button
                        onClick={updatePricing}
                        disabled={saving}
                        className="font-bold py-3 px-8 rounded-xl text-white transition-all duration-200 hover:scale-105 disabled:opacity-50"
                        style={{
                            background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                            boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                            willChange: 'transform',
                            transform: 'translateZ(0)'
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Pricing Configuration'}
                    </button>
                    <button
                        onClick={() => navigateTo('admin-dashboard')}
                        className="font-bold py-3 px-8 rounded-xl transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                            color: '#000b3d',
                            border: '1px solid rgba(0, 11, 61, 0.3)'
                        }}
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AdminQuotaPricing;

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
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading pricing configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">Quota Extension Pricing</h1>
                    <p className="text-gray-600">Manage pricing for quota extensions and borrowing</p>
                </div>

                {/* Feedback Message */}
                {feedback && (
                    <div className={`mb-6 p-4 rounded-lg text-center ${
                        feedback.includes('successfully') 
                            ? 'bg-green-100 border border-green-400 text-green-700' 
                            : 'bg-red-100 border border-red-400 text-red-700'
                    }`}>
                        {feedback}
                    </div>
                )}

                {/* Pricing Configuration */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Direct Purchase Pricing */}
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="text-blue-500">🔋</span> Direct Purchase Pricing
                        </h2>
                        
                        <div className="space-y-4">
                            {/* Enable/Disable */}
                            <div className="flex items-center justify-between">
                                <label className="text-gray-700 font-medium">Enable Direct Purchase</label>
                                <input
                                    type="checkbox"
                                    checked={pricing.direct_purchase.is_active}
                                    onChange={(e) => handleInputChange('direct_purchase', 'is_active', e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                            </div>

                            {/* Price Configuration */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Price per Transaction (₱)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={pricing.direct_purchase.price_per_transaction || 10}
                                    onChange={(e) => handleInputChange('direct_purchase', 'price_per_transaction', parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="10.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Fixed price per direct purchase transaction
                                </p>
                            </div>

                            {/* Amount Configuration */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Extension Amount (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="100"
                                    value={pricing.direct_purchase.extension_amount_mah || 1000}
                                    onChange={(e) => handleInputChange('direct_purchase', 'extension_amount_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="1000"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Amount of mAh users get per direct purchase transaction
                                </p>
                            </div>

                            {/* PayPal Link */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    PayPal Sandbox Link
                                </label>
                                <input
                                    type="url"
                                    value={pricing.direct_purchase.paypal_link || ''}
                                    onChange={(e) => handleInputChange('direct_purchase', 'paypal_link', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="https://www.sandbox.paypal.com/ncp/payment/..."
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    PayPal sandbox link for direct purchase payments
                                </p>
                            </div>

                            {/* PayPal Link */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    PayPal Sandbox Link
                                </label>
                                <input
                                    type="url"
                                    value={pricing.direct_purchase.paypal_link || ''}
                                    onChange={(e) => handleInputChange('direct_purchase', 'paypal_link', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="https://www.sandbox.paypal.com/ncp/payment/..."
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    PayPal sandbox link for direct purchase payments
                                </p>
                            </div>

                            {/* Example Display */}
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-600 mb-1">Current Configuration:</div>
                                <div className="text-lg font-bold text-blue-600">
                                    {pricing.direct_purchase.extension_amount_mah || 1000} mAh = ₱{pricing.direct_purchase.price_per_transaction || 10}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Per transaction
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Borrow Next Day Pricing */}
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="text-orange-500">⏰</span> Borrow Next Day Pricing
                        </h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Users can borrow mAh today but will be charged a penalty tomorrow. 
                            Example: Borrow 100 mAh today → Charge 120 mAh tomorrow (100 + 20 penalty).
                        </p>
                        
                        <div className="space-y-4">
                            {/* Enable/Disable */}
                            <div className="flex items-center justify-between">
                                <label className="text-gray-700 font-medium">Enable Borrow Option</label>
                                <input
                                    type="checkbox"
                                    checked={pricing.borrow_next_day.is_active}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'is_active', e.target.checked)}
                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                />
                            </div>

                            {/* Base Fee */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Base Fee
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₱</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={pricing.borrow_next_day.base_fee}
                                        onChange={(e) => handleInputChange('borrow_next_day', 'base_fee', parseFloat(e.target.value))}
                                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="10.00"
                                    />
                                </div>
                            </div>

                            {/* Penalty Percentage */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Penalty Percentage (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="100"
                                    value={pricing.borrow_next_day.penalty_percentage}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'penalty_percentage', parseFloat(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="20"
                                />
                            </div>

                            {/* Min Borrow */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Minimum Borrow (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={pricing.borrow_next_day.min_purchase_mah}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'min_purchase_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="100"
                                />
                            </div>

                            {/* Max Borrow */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Maximum Borrow (mAh)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={pricing.borrow_next_day.max_purchase_mah}
                                    onChange={(e) => handleInputChange('borrow_next_day', 'max_purchase_mah', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="2000"
                                />
                            </div>

                            {/* Example Cost */}
                            <div className="bg-orange-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-600 mb-1">Example Cost (1000 mAh):</div>
                                <div className="text-lg font-bold text-orange-600">
                                    {formatCurrency(exampleCosts.borrow)}
                                </div>
                                <div className="text-xs text-gray-500 space-y-1">
                                    <div>• Base fee: {formatCurrency(exampleCosts.borrowBreakdown.baseFee)}</div>
                                    <div>• Penalty ({pricing.borrow_next_day.penalty_percentage}%): {formatCurrency(exampleCosts.borrowBreakdown.penalty)}</div>
                                    <div>• Tomorrow: 1000 mAh borrowed → 1200 mAh charged</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pricing Summary */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20 mb-8">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">💡 Pricing Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-2">Direct Purchase:</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• {formatCurrency(pricing.direct_purchase.price_per_mah)} per mAh</li>
                                <li>• Min: {pricing.direct_purchase.min_purchase_mah} mAh</li>
                                <li>• Max: {pricing.direct_purchase.max_purchase_mah} mAh</li>
                                <li>• Example: 1000 mAh = {formatCurrency(exampleCosts.direct)}</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-2">Borrow Next Day:</h4>
                            <ul className="text-sm text-gray-600 space-y-1">
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
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-8 rounded-lg transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save Pricing Configuration'}
                    </button>
                    <button
                        onClick={() => navigateTo('admin-dashboard')}
                        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AdminQuotaPricing;

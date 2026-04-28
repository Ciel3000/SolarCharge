// =============================================================================
// UserProfilePage.js
// =============================================================================
// Description: User profile management page with mobile and desktop layouts.
//              Supports viewing/editing profile info, account settings, and logout.
//
// Features:
// - Mobile-first responsive design
// - Edit profile modal (mobile only)
// - Logout confirmation modal
// - Form validation and submission
// - Account settings navigation
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

// Backend API URL from environment variables
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// =============================================================================
// Main Component
// =============================================================================
function UserProfilePage({ navigateTo }) {
    // ---------------------------------------------------------------------------
    // Hooks - Authentication & Navigation
    // ---------------------------------------------------------------------------
    const { session, user, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // ---------------------------------------------------------------------------
    // State - Modal Visibility
    // ---------------------------------------------------------------------------
    // Controls logout confirmation modal visibility
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    
    // Controls edit profile modal visibility (mobile only)
    const [showEditProfile, setShowEditProfile] = useState(false);
    
    // Temporary state for edit profile modal form
    const [editData, setEditData] = useState({
        firstName: '',
        lastName: '',
        contactNumber: ''
    });
    
    // Loading state for edit profile modal save button
    const [savingProfile, setSavingProfile] = useState(false);

    // ---------------------------------------------------------------------------
    // State - Form Data
    // ---------------------------------------------------------------------------
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        contactNumber: '',
        email: user?.email || ''
    });

    // ---------------------------------------------------------------------------
    // State - UI State
    // ---------------------------------------------------------------------------
    const [loading, setLoading] = useState(true);      // Initial data fetch loading
    const [saving, setSaving] = useState(false);       // Form submission loading
    const [message, setMessage] = useState('');        // User feedback messages
    const [errors, setErrors] = useState({});         // Form validation errors

    // ---------------------------------------------------------------------------
    // Effect - Handle Navigation Messages
    // ---------------------------------------------------------------------------
    // Display messages passed via navigation state
    const locationMessage = location.state?.message;
    useEffect(() => {
        if (locationMessage) {
            setMessage(locationMessage);
        }
    }, [locationMessage]);

    // ---------------------------------------------------------------------------
    // Effect - Fetch User Profile Data
    // ---------------------------------------------------------------------------
    // Load user profile on component mount
    useEffect(() => {
        async function fetchUserProfile() {
            // Exit early if no session
            if (!session?.access_token) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                
                // Try to fetch from backend API first
                const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
                    headers: { 
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    },
                });

                if (!response.ok) {
                    // Fallback: Fetch directly from Supabase if backend fails
                    const { data, error } = await supabase
                        .from('users')
                        .select('fname, lname, contact_number, email')
                        .eq('user_id', user.id)
                        .single();

                    // Handle errors (ignore PGRST116 - no rows returned)
                    if (error && error.code !== 'PGRST116') {
                        throw error;
                    }

                    if (data) {
                        // Populate form with user data
                        setFormData({
                            firstName: data.fname || '',
                            lastName: data.lname || '',
                            contactNumber: data.contact_number || '',
                            email: data.email || user?.email || ''
                        });
                    } else {
                        // No existing record - use defaults with user email
                        setFormData(prev => ({
                            ...prev,
                            email: user?.email || ''
                        }));
                    }
                } else {
                    // Success from backend - parse JSON response
                    const userData = await response.json();
                    setFormData({
                        firstName: userData.fname || '',
                        lastName: userData.lname || '',
                        contactNumber: userData.contact_number || '',
                        email: userData.email || user?.email || ''
                    });
                }
            } catch (err) {
                console.error('Error fetching user profile:', err);
                setMessage('Error loading profile data. Please try again.');
                // Set defaults with user email
                setFormData(prev => ({
                    ...prev,
                    email: user?.email || ''
                }));
            } finally {
                setLoading(false);
            }
        }

        fetchUserProfile();
    }, [session, user]);

    // ---------------------------------------------------------------------------
    // Function - Form Validation
    // ---------------------------------------------------------------------------
    // Validates all form fields and sets error messages
    const validateForm = () => {
        const newErrors = {};

        // First name validation
        if (!formData.firstName.trim()) {
            newErrors.firstName = 'First name is required';
        }

        // Last name validation
        if (!formData.lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        }

        // Email validation
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        // Contact number validation (optional field)
        if (formData.contactNumber && !/^[+]?[\d\s\-()]{10,}$/.test(formData.contactNumber)) {
            newErrors.contactNumber = 'Please enter a valid contact number';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Input Change
    // ---------------------------------------------------------------------------
    // Updates form data state and clears field errors on input
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear error for this field when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Form Submit (Desktop Form)
    // ---------------------------------------------------------------------------
    // Submits profile changes to backend/Supabase
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate form before submission
        if (!validateForm()) {
            setMessage('Please correct the errors below.');
            return;
        }

        setSaving(true);
        setMessage('');

        try {
            // Try to update via backend API first
            const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fname: formData.firstName.trim(),
                    lname: formData.lastName.trim(),
                    contact_number: formData.contactNumber.trim() || null,
                    email: formData.email.trim()
                })
            });

            if (!response.ok) {
                // Fallback: Direct Supabase update if backend fails
                const { error } = await supabase
                    .from('users')
                    .upsert({
                        user_id: user.id,
                        fname: formData.firstName.trim(),
                        lname: formData.lastName.trim(),
                        contact_number: formData.contactNumber.trim() || null,
                        email: formData.email.trim(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id'
                    });

                if (error) {
                    throw error;
                }
            }

            // Handle email change notification
            if (formData.email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({
                    email: formData.email.trim()
                });

                if (emailError) {
                    console.warn('Profile updated but email change failed:', emailError);
                    setMessage('Profile updated! Note: Email change requires verification - check your inbox.');
                } else {
                    setMessage('Profile updated successfully! If you changed your email, please verify it.');
                }
            } else {
                setMessage('Profile updated successfully!');
            }

            // Clear errors on successful update
            setErrors({});

        } catch (err) {
            console.error('Error updating profile:', err);
            setMessage(`Failed to update profile: ${err.message || 'Please try again.'}`);
        } finally {
            setSaving(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Edit Profile Modal Open
    // ---------------------------------------------------------------------------
    // Populates edit modal with current form data
    const handleEditProfile = () => {
        setEditData({
            firstName: formData.firstName,
            lastName: formData.lastName,
            contactNumber: formData.contactNumber
        });
        setShowEditProfile(true);
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Edit Profile Modal Save
    // ---------------------------------------------------------------------------
    // Saves changes from edit modal to backend/Supabase
    const handleSaveProfile = async () => {
        // Validation - require first and last name
        if (!editData.firstName.trim() || !editData.lastName.trim()) {
            return;
        }

        setSavingProfile(true);
        
        try {
            // Try backend API first
            const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fname: editData.firstName.trim(),
                    lname: editData.lastName.trim(),
                    contact_number: editData.contactNumber.trim() || null,
                    email: formData.email.trim()
                })
            });

            if (!response.ok) {
                // Fallback to Supabase if backend fails
                const { error } = await supabase
                    .from('users')
                    .upsert({
                        user_id: user.id,
                        fname: editData.firstName.trim(),
                        lname: editData.lastName.trim(),
                        contact_number: editData.contactNumber.trim() || null,
                        email: formData.email.trim(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id'
                    });

                if (error) throw error;
            }

            // Update main form state with edited data
            setFormData(prev => ({ ...prev, ...editData }));
            setMessage('Profile updated successfully!');
            setShowEditProfile(false);
        } catch (err) {
            console.error('Error saving profile:', err);
            setMessage('Failed to save profile changes.');
        } finally {
            setSavingProfile(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Back Navigation
    // ---------------------------------------------------------------------------
    const handleBack = () => {
        const fromRoute = location.state?.from || '/home';
        navigate(fromRoute);
    };

    // ---------------------------------------------------------------------------
    // Function - Handle Logout
    // ---------------------------------------------------------------------------
    const handleLogout = async () => {
        setShowLogoutConfirm(false);
        try {
            await signOut();
            navigate('/');
        } catch (err) {
            console.error('Logout error:', err);
        }
    };

    // ---------------------------------------------------------------------------
    // Render - Loading State
    // ---------------------------------------------------------------------------
    if (loading) {
        return (
            <div 
                className="min-h-screen flex items-center justify-center relative overflow-hidden" 
                style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}
            >
                {/* Animated background decorations */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div 
                        className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl animate-float-slow" 
                        style={{ background: 'radial-gradient(circle, rgba(249, 210, 23, 0.25) 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)' }}
                    ></div>
                    <div 
                        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl animate-float-slow-delay" 
                        style={{ background: 'radial-gradient(circle, rgba(56, 182, 255, 0.25) 0%, rgba(56, 182, 255, 0.1) 50%, transparent 100%)' }}
                    ></div>
                </div>
                
                {/* Loading spinner card */}
                <div 
                    className="relative z-10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/30" 
                    style={{
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}
                >
                    <div className="flex flex-col items-center">
                        <div 
                            className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent mb-4" 
                            style={{
                                borderColor: '#38b6ff',
                                borderTopColor: 'transparent'
                            }}
                        ></div>
                        <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading profile...</p>
                    </div>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Render - Main Content
    // ---------------------------------------------------------------------------
    return (
        <div 
            className="min-h-dvh flex flex-col justify-start text-gray-800 relative" 
            style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}
        >
            {/* =================================================================== */}
            {/* MOBILE LAYOUT (< 1024px) */}
            {/* =================================================================== */}
            <div className="lg:hidden pt-16">
                {/* --------------------------------------------------------------- */}
                {/* Page Header */}
                {/* --------------------------------------------------------------- */}
                <div className="px-4 pt-3 pb-2 animate-fade-in-down">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-xl font-bold text-gray-800">Profile</h1>
                            <p className="text-xs text-gray-500 mt-0.5">Manage your account</p>
                        </div>
                        
                        {/* Notification bell button */}
                        {/* <button 
                            type="button" 
                            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                        >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth="2" 
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                />
                            </svg>
                        </button> */}
                    </div>
                </div>

                {/* --------------------------------------------------------------- */}
                {/* Success/Error Banner - Shows validation/success messages */}
                {/* --------------------------------------------------------------- */}
                {message && (
                    <div 
                        className="mx-4 mb-3 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl animate-fade-in-up"
                        style={message.includes('Error') || message.includes('Failed')
                            ? { background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }
                            : { background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }
                        }
                    >
                        <svg 
                            className="w-4 h-4 flex-shrink-0" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                            style={message.includes('Error') || message.includes('Failed') ? { color: '#dc2626' } : { color: '#10b981' }}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <p 
                            className="text-xs font-semibold" 
                            style={message.includes('Error') || message.includes('Failed') ? { color: '#dc2626' } : { color: '#059669' }}
                        >
                            {message}
                        </p>
                    </div>
                )}

                {/* --------------------------------------------------------------- */}
                {/* Avatar Card - Shows user profile picture and info */}
                {/* --------------------------------------------------------------- */}
                <div 
                    className="mx-4 mb-3 flex items-center gap-3.5 p-4 rounded-[22px] bg-white/65 border border-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] animate-fade-in" 
                    style={{ animationDelay: '0.1s' }}
                >
                    <div className="relative flex-shrink-0">
                        {/* Profile initials circle */}
                        <div 
                            className="w-14 h-14 rounded-full flex items-center justify-center" 
                            style={{ background: 'linear-gradient(135deg, #38b6ff, #000b3d)' }}
                        >
                            <span className="text-white text-xl font-black">
                                {formData.firstName?.charAt(0) || ''}{formData.lastName?.charAt(0) || ''}
                            </span>
                        </div>
                        {/* Online status indicator */}
                        <div 
                            className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2" 
                            style={{ background: '#10b981', borderColor: '#f1f3e0' }}
                        ></div>
                    </div>
                    
                    {/* User info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">{formData.firstName} {formData.lastName}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{formData.email}</p>
                        {/* Premium badge */}
                    </div>
                    
                    {/* Edit button - Opens edit profile modal */}
                    <button 
                        type="button" 
                        onClick={handleEditProfile} 
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95" 
                        style={{ background: 'rgba(56,182,255,0.1)', border: '1px solid rgba(56,182,255,0.2)' }}
                    >
                        <svg className="w-4 h-4" style={{ color: '#38b6ff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    </button>
                </div>

                {/* --------------------------------------------------------------- */}
                {/* Scrollable Content - Form and Settings */}
                {/* --------------------------------------------------------------- */}
                <form onSubmit={handleSubmit} className="px-4 pb-24">
                    {/* Personal Information Section */}
                    {/* <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">Personal information</p> */}
                    {/* <div className="mb-3 rounded-2xl overflow-hidden bg-white/65 border border-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"> */}
                        {/* First name field */}
                        {/* <div className="px-3.5 pt-3 pb-3 border-b border-black/5">
                            <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase mb-1.5">First name</p>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleInputChange}
                                className="w-full text-sm text-gray-800 bg-transparent outline-none font-medium placeholder-gray-300"
                                style={errors.firstName ? { border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px', padding: '8px' } : {}}
                                placeholder="First name"
                            />
                            {errors.firstName && <p className="text-[10px] mt-1" style={{ color: '#dc2626' }}>{errors.firstName}</p>}
                        </div> */}
                        
                        {/* Last name field */}
                        {/* <div className="px-3.5 pt-3 pb-3">
                            <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase mb-1.5">Last name</p>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleInputChange}
                                className="w-full text-sm text-gray-800 bg-transparent outline-none font-medium placeholder-gray-300"
                                style={errors.lastName ? { border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px', padding: '8px' } : {}}
                                placeholder="Last name"
                            />
                            {errors.lastName && <p className="text-[10px] mt-1" style={{ color: '#dc2626' }}>{errors.lastName}</p>}
                        </div> */}
                    {/* </div> */}

                    {/* Contact Information Section */}
                    {/* <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">Contact information</p>
                    <div className="mb-3 rounded-2xl overflow-hidden bg-white/65 border border-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"> */}
                        {/* Email field */}
                        {/* <div className="px-3.5 pt-3 pb-3 border-b border-black/5">
                            <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase mb-1.5">Email</p>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                className="w-full text-sm text-gray-800 bg-transparent outline-none font-medium placeholder-gray-300"
                                style={errors.email ? { border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px', padding: '8px' } : {}}
                                placeholder="Email address"
                            />
                            {errors.email && <p className="text-[10px] mt-1" style={{ color: '#dc2626' }}>{errors.email}</p>}
                            <p className="text-[10px] text-gray-400 mt-1">Email changes require verification</p>
                        </div> */}
                        
                        {/* Contact number field */}
                        {/* <div className="px-3.5 pt-3 pb-3">
                            <p className="text-[9px] font-bold tracking-wider text-gray-400 uppercase mb-1.5">Contact number</p>
                            <input
                                type="tel"
                                name="contactNumber"
                                value={formData.contactNumber}
                                onChange={handleInputChange}
                                className="w-full text-sm text-gray-800 bg-transparent outline-none font-medium placeholder-gray-300"
                                style={errors.contactNumber ? { border: '1px solid rgba(239,68,68,0.5)', borderRadius: '8px', padding: '8px' } : {}}
                                placeholder="Contact number"
                            />
                            {errors.contactNumber && <p className="text-[10px] mt-1" style={{ color: '#dc2626' }}>{errors.contactNumber}</p>}
                        </div>
                    </div> */}

                    {/* Action Buttons */}
                    {/* <button
                        type="submit"
                        disabled={saving}
                        className="w-full py-3.5 rounded-2xl text-white text-sm font-bold disabled:opacity-50 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                        style={{ background: saving ? 'rgba(56,182,255,0.6)' : '#38b6ff', boxShadow: saving ? 'none' : '0 4px 12px rgba(56,182,255,0.3)' }}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                        type="button"
                        onClick={handleBack}
                        className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 mt-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                        style={{ background: 'transparent', border: '1px solid rgba(0,0,0,0.1)' }}
                    >
                        Cancel
                    </button> */}

                    {/* Account Settings Section */}
                    <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mt-4 mb-1.5">Account settings</p>
                    <div className="mb-3 rounded-2xl overflow-hidden bg-white/65 border border-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                        {/* Change password button */}
                        <button 
                            type="button" 
                            onClick={() => navigate('/change-password')} 
                            className="flex items-center justify-between px-3.5 py-3 border-b border-black/5 cursor-pointer w-full text-left transition-all hover:bg-gray-50 active:scale-[0.99]"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(56,182,255,0.1)' }}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#38b6ff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Change password</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Update your login password</p>
                                </div>
                            </div>
                            <svg className="w-4 h-4 text-gray-300 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                        </button>
                        
                        {/* Subscription button */}
                        <button 
                            type="button" 
                            onClick={() => navigate('/subscription')} 
                            className="flex items-center justify-between px-3.5 py-3 border-b border-black/5 cursor-pointer w-full text-left transition-all hover:bg-gray-50 active:scale-[0.99]"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#7c3aed' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Subscription</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Premium · Active</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400">Manage</span>
                                <svg className="w-4 h-4 text-gray-300 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                                </svg>
                            </div>
                        </button>
                        
                        {/* Notifications toggle */}
                        {/* <div className="flex items-center justify-between px-3.5 py-3 transition-all hover:bg-gray-50">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#059669' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Notifications</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Session alerts, billing reminders</p>
                                </div>
                            </div>
                            <div className="w-9 h-5 rounded-full relative cursor-pointer transition-colors" style={{ background: '#10b981' }}>
                                <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: 'calc(100% - 18px)' }}></div>
                            </div>
                        </div> */}
                    </div>

                    {/* App Section */}
                    <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">App</p>
                    <div className="mb-3 rounded-2xl overflow-hidden bg-white/65 border border-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                        {/* App version info */}
                        <div className="flex items-center justify-between px-3.5 py-3 border-b border-black/5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(100,116,139,0.1)' }}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
                                    </svg>
                                </div>
                                <p className="text-sm font-semibold text-gray-800">App version</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-400">SolarCharge v1.0.0</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#059669' }}>Latest</span>
                            </div>
                        </div>
                        
                        {/* Privacy policy link */}
                        <div className="flex items-center justify-between px-3.5 py-3 cursor-pointer">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(100,116,139,0.1)' }}>
                                    <svg className="w-3.5 h-3.5" style={{ color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                </div>
                                <p className="text-sm font-semibold text-gray-800">Privacy policy</p>
                            </div>
                            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                            </svg>
                        </div>
                    </div>

                    {/* Account Section (Danger Zone) */}
                    <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">Account</p>
                    <div 
                        className="mb-3 rounded-2xl overflow-hidden" 
                        style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(239,68,68,0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                    >
                        {/* Logout button */}
                        <button 
                            type="button" 
                            onClick={() => setShowLogoutConfirm(true)} 
                            className="flex items-center gap-2.5 px-3.5 py-3 border-b border-black/5 cursor-pointer w-full text-left transition-all active:scale-[0.98]" 
                            style={{ background: 'transparent' }}
                        >
                            <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                <svg className="w-3.5 h-3.5" style={{ color: '#dc2626' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>Log out</p>
                                <p className="text-[10px]" style={{ color: 'rgba(220,38,38,0.6)' }}>Sign out of your account</p>
                            </div>
                        </button>
                        
                        {/* Delete account (disabled) */}
                        {/* <div className="flex items-center gap-2.5 px-3.5 py-3 opacity-50">
                            <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                                <svg className="w-3.5 h-3.5" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </div>
                            <div>
                                <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>Delete account</p>
                                <p className="text-[10px]" style={{ color: 'rgba(220,38,38,0.5)' }}>Permanently remove all data</p>
                            </div>
                        </div> */}
                    </div>

                    {/* Bottom spacing for navigation bar */}
                    <div className="h-6"></div>
                </form>

                {/* --------------------------------------------------------------- */}
                {/* Edit Profile Modal - Mobile Only */}
                {/* --------------------------------------------------------------- */}
                {showEditProfile && (
                    <div 
                        className="fixed inset-0 z-50 flex items-center justify-center" 
                        style={{ background: 'rgba(0,0,0,0.5)' }} 
                        onClick={() => setShowEditProfile(false)}
                    >
                        <div 
                            className="w-full max-w-md rounded-t-3xl p-6 animate-fade-in-up" 
                            style={{ background: '#f1f3e0', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }} 
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-gray-800">Edit Profile</h3>
                                <button 
                                    type="button" 
                                    onClick={() => setShowEditProfile(false)} 
                                    className="w-8 h-8 rounded-full flex items-center justify-center" 
                                    style={{ background: 'rgba(0,0,0,0.1)' }}
                                >
                                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                            
                            {/* Modal Form Fields */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">First Name</label>
                                    <input
                                        type="text"
                                        value={editData.firstName}
                                        onChange={(e) => setEditData(prev => ({ ...prev, firstName: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-800"
                                        style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)' }}
                                        placeholder="First name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Last Name</label>
                                    <input
                                        type="text"
                                        value={editData.lastName}
                                        onChange={(e) => setEditData(prev => ({ ...prev, lastName: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-800"
                                        style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)' }}
                                        placeholder="Last name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Contact Number</label>
                                    <input
                                        type="tel"
                                        value={editData.contactNumber}
                                        onChange={(e) => setEditData(prev => ({ ...prev, contactNumber: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl text-sm font-medium text-gray-800"
                                        style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.1)' }}
                                        placeholder="Contact number"
                                    />
                                </div>
                            </div>

                            {/* Modal Action Buttons */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowEditProfile(false)}
                                    className="flex-1 py-3 rounded-xl text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ background: 'rgba(0,0,0,0.1)', color: '#4b5563' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveProfile}
                                    disabled={savingProfile}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                    style={{ background: savingProfile ? 'rgba(56,182,255,0.6)' : '#38b6ff' }}
                                >
                                    {savingProfile ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* =================================================================== */}
            {/* DESKTOP LAYOUT (>= 1024px) */}
            {/* =================================================================== */}
            <div className="hidden lg:block w-full pt-20 pb-8">
                <section className="w-full max-w-3xl mx-auto relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
                    <div 
                        className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12" 
                        style={{ 
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                        }}
                    >
                        {/* Shimmer effect overlay */}
                        <div 
                            className="absolute inset-0 opacity-30" 
                            style={{
                                background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
                                animation: 'shimmer 3s ease-in-out infinite'
                            }}
                        ></div>
                        
                        {/* Main content wrapper */}
                        <div className="relative z-10">
                            {/* Header with logo */}
                            <div className="text-center mb-8 animate-fade-in-down">
                                <div className="flex items-center justify-center space-x-3 mb-4">
                                    <img 
                                        src="/img/solarchargelogo.png" 
                                        alt="SolarCharge Logo" 
                                        className="h-12 md:h-16 w-auto drop-shadow-lg animate-logo-float"
                                    />
                                    <span 
                                        className="text-3xl md:text-4xl font-black tracking-tight" 
                                        style={{
                                            background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text'
                                        }}
                                    >
                                        SolarCharge
                                    </span>
                                </div>
                                <div className="text-xl md:text-2xl font-semibold" style={{ color: '#000b3d' }}>
                                    Edit Your Profile
                                </div>
                                <p className="text-lg mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>
                                    Manage your personal information
                                </p>
                            </div>

                            {/* Messages - Desktop */}
                            {message && (
                                <div 
                                    className={`mb-6 p-4 rounded-lg text-center text-sm`}
                                    style={message.includes('Error') || message.includes('Failed')
                                        ? {
                                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            color: '#dc2626'
                                        }
                                        : {
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            color: '#10b981'
                                        }
                                }
                                >
                                    {message}
                                </div>
                            )}

                            {/* Profile Form - Desktop */}
                            <form onSubmit={handleSubmit}>
                                {/* Personal Information Section */}
                                <div className="mb-8">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                                        <span className="text-2xl">👤</span> Personal Information
                                    </h2>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* First Name */}
                                        <div>
                                            <label htmlFor="firstName" className="block text-sm font-medium mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                First Name *
                                            </label>
                                            <input
                                                type="text"
                                                id="firstName"
                                                name="firstName"
                                                value={formData.firstName}
                                                onChange={handleInputChange}
                                                className={`w-full p-3 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 transition-all duration-300 ${
                                                    errors.firstName ? 'border-2' : 'border'
                                                }`}
                                                style={errors.firstName
                                                    ? {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(239, 68, 68, 0.5)',
                                                        color: '#000b3d',
                                                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.1)'
                                                    }
                                                    : {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                                        color: '#000b3d'
                                                    }
                                                }
                                                placeholder="Enter your first name"
                                            />
                                            {errors.firstName && (
                                                <p className="mt-1 text-sm" style={{ color: '#dc2626' }}>{errors.firstName}</p>
                                            )}
                                        </div>

                                        {/* Last Name */}
                                        <div>
                                            <label htmlFor="lastName" className="block text-sm font-medium mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                Last Name *
                                            </label>
                                            <input
                                                type="text"
                                                id="lastName"
                                                name="lastName"
                                                value={formData.lastName}
                                                onChange={handleInputChange}
                                                className={`w-full p-3 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 transition-all duration-300 ${
                                                    errors.lastName ? 'border-2' : 'border'
                                                }`}
                                                style={errors.lastName
                                                    ? {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(239, 68, 68, 0.5)',
                                                        color: '#000b3d',
                                                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.1)'
                                                    }
                                                    : {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                                        color: '#000b3d'
                                                    }
                                                }
                                                placeholder="Enter your last name"
                                            />
                                            {errors.lastName && (
                                                <p className="mt-1 text-sm" style={{ color: '#dc2626' }}>{errors.lastName}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Information Section */}
                                <div className="mb-8">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2" style={{ color: '#000b3d' }}>
                                        <span className="text-2xl">📧</span> Contact Information
                                    </h2>
                                    
                                    <div className="space-y-6">
                                        {/* Email */}
                                        <div>
                                            <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                Email Address *
                                            </label>
                                            <input
                                                type="email"
                                                id="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                className={`w-full p-3 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 transition-all duration-300 ${
                                                    errors.email ? 'border-2' : 'border'
                                                }`}
                                                style={errors.email
                                                    ? {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(239, 68, 68, 0.5)',
                                                        color: '#000b3d',
                                                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.1)'
                                                    }
                                                    : {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                                        color: '#000b3d'
                                                    }
                                                }
                                                placeholder="Enter your email address"
                                            />
                                            {errors.email && (
                                                <p className="mt-1 text-sm" style={{ color: '#dc2626' }}>{errors.email}</p>
                                            )}
                                            <p className="mt-1 text-sm" style={{ color: '#000b3d', opacity: 0.6 }}>
                                                Changing your email will require verification
                                            </p>
                                        </div>

                                        {/* Contact Number */}
                                        <div>
                                            <label htmlFor="contactNumber" className="block text-sm font-medium mb-2" style={{ color: '#000b3d', opacity: 0.8 }}>
                                                Contact Number
                                            </label>
                                            <input
                                                type="tel"
                                                id="contactNumber"
                                                name="contactNumber"
                                                value={formData.contactNumber}
                                                onChange={handleInputChange}
                                                className={`w-full p-3 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 transition-all duration-300 ${
                                                    errors.contactNumber ? 'border-2' : 'border'
                                                }`}
                                                style={errors.contactNumber
                                                    ? {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(239, 68, 68, 0.5)',
                                                        color: '#000b3d',
                                                        boxShadow: '0 4px 16px rgba(239, 68, 68, 0.1)'
                                                    }
                                                    : {
                                                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
                                                        borderColor: 'rgba(255, 255, 255, 0.3)',
                                                        color: '#000b3d'
                                                    }
                                                }
                                                placeholder="Enter your contact number (optional)"
                                            />
                                            {errors.contactNumber && (
                                                <p className="mt-1 text-sm" style={{ color: '#dc2626' }}>{errors.contactNumber}</p>
                                            )}
                                            <p className="mt-1 text-sm" style={{ color: '#000b3d', opacity: 0.6 }}>
                                                Include country code if applicable (e.g., +1234567890)
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="group relative flex-1 px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50 disabled:opacity-50"
                                        style={{
                                            background: saving
                                                ? 'linear-gradient(135deg, rgba(56, 182, 255, 0.6) 0%, rgba(0, 11, 61, 0.6) 100%)'
                                                : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                            boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                            focusRingColor: 'rgba(56, 182, 255, 0.5)'
                                        }}
                                    >
                                        {saving ? (
                                            <span className="relative z-10 flex items-center justify-center">
                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Saving...
                                            </span>
                                        ) : (
                                            <>
                                                <span className="relative z-10">Save Changes</span>
                                                <div 
                                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                                                    }}
                                                ></div>
                                            </>
                                        )}
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={handleBack}
                                        className="group relative flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-opacity-50"
                                        style={{
                                            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                                            boxShadow: '0 8px 24px rgba(107, 114, 128, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                            focusRingColor: 'rgba(107, 114, 128, 0.5)'
                                        }}
                                    >
                                        <span className="relative z-10">Cancel</span>
                                        <div 
                                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.3) 0%, rgba(75, 85, 99, 0.3) 100%)'
                                            }}
                                        ></div>
                                    </button>
                                </div>

                                {/* Required fields notice */}
                                <p className="text-sm text-center mt-6" style={{ color: '#000b3d', opacity: 0.6 }}>
                                    * Required fields
                                </p>
                            </form>
                        </div>
                    </div>
                </section>
            </div>

            {/* =================================================================== */}
            {/* Logout Confirmation Modal */}
            {/* =================================================================== */}
            {showLogoutConfirm && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4" 
                    style={{ background: 'rgba(0,0,0,0.5)' }} 
                    onClick={() => setShowLogoutConfirm(false)}
                >
                    <div 
                        className="w-full max-w-sm rounded-2xl p-6 animate-scale-in" 
                        style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} 
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center mb-6">
                            <div 
                                className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" 
                                style={{ background: 'rgba(239,68,68,0.1)' }}
                            >
                                <svg className="w-7 h-7" style={{ color: '#dc2626' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-800">Log out?</h3>
                            <p className="text-sm text-gray-500 mt-2">Are you sure you want to log out of your account?</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowLogoutConfirm(false)}
                                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
                                style={{ background: 'rgba(0,0,0,0.05)', color: '#4b5563' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-transform hover:scale-105 active:scale-95"
                                style={{ background: '#dc2626' }}
                            >
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Export component for use in routes
export default UserProfilePage;
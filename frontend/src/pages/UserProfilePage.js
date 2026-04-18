// frontend/src/pages/UserProfilePage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function UserProfilePage({ navigateTo }) {
  const { session, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    contactNumber: '',
    email: user?.email || ''
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});

  // Check for navigation messages
  const locationMessage = location.state?.message;

  useEffect(() => {
    if (locationMessage) {
      setMessage(locationMessage);
    }
  }, [locationMessage]);

  // Fetch user profile data
  useEffect(() => {
    async function fetchUserProfile() {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Fetch user details from the backend
        const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
          headers: { 
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) {
          // If backend doesn't have this endpoint, fetch from Supabase directly
          const { data, error } = await supabase
            .from('users')
            .select('fname, lname, contact_number, email')
            .eq('user_id', user.id)
            .single();

          if (error && error.code !== 'PGRST116') {
            throw error;
          }

          if (data) {
            setFormData({
              firstName: data.fname || '',
              lastName: data.lname || '',
              contactNumber: data.contact_number || '',
              email: data.email || user?.email || ''
            });
          } else {
            // User record doesn't exist yet, use defaults
            setFormData(prev => ({
              ...prev,
              email: user?.email || ''
            }));
          }
        } else {
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
        // Use default values with user email
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

  // Form validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.contactNumber && !/^[+]?[\d\s\-()]{10,}$/.test(formData.contactNumber)) {
      newErrors.contactNumber = 'Please enter a valid contact number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form input changes
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

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setMessage('Please correct the errors below.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      // Try to update via backend first
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
        // Fallback to direct Supabase update
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

      // If email changed, update auth email too
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

  // Handle back navigation
  const handleBack = () => {
    const fromRoute = location.state?.from || '/home';
    navigate(fromRoute);
  };

  // Loading state
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
            <p className="text-lg font-semibold" style={{ color: '#000b3d' }}>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col justify-start text-gray-800 relative" style={{ background: 'linear-gradient(135deg, #f1f3e0 0%, #e8eae0 50%, #f1f3e0 100%)' }}>
      {/* MOBILE LAYOUT (< lg:) */}
      <div className="lg:hidden">
        {/* Page Header */}
        <div className="flex justify-between items-center px-4 pt-3 pb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Profile</h1>
            <p className="text-xs text-gray-500 mt-0.5">Manage your info</p>
          </div>
        </div>

        {/* Messages - Mobile */}
        {message && (
          <div className={`mx-4 mb-3 p-3 rounded-lg text-center text-sm`}
            style={message.includes('Error') || message.includes('Failed')
              ? {
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626'
                }
              : {
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981'
                }
          }>
            {message}
          </div>
        )}

        {/* Profile Form - Mobile */}
        <form onSubmit={handleSubmit} className="px-4 pb-24">
          {/* Personal Information Section - Mobile */}
          <div className="mb-4">
            <h2 className="text-base font-bold mb-3" style={{ color: '#000b3d' }}>Personal Information</h2>
            
            <div className="space-y-3">
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="block text-xs font-medium mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                  First Name *
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full p-3 rounded-xl text-sm"
                  style={errors.firstName
                    ? { border: '2px solid rgba(239, 68, 68, 0.5)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                    : { border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                  }
                  placeholder="First name"
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>{errors.firstName}</p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label htmlFor="lastName" className="block text-xs font-medium mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                  Last Name *
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full p-3 rounded-xl text-sm"
                  style={errors.lastName
                    ? { border: '2px solid rgba(239, 68, 68, 0.5)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                    : { border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                  }
                  placeholder="Last name"
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>{errors.lastName}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact Information Section - Mobile */}
          <div className="mb-4">
            <h2 className="text-base font-bold mb-3" style={{ color: '#000b3d' }}>Contact Information</h2>
            
            <div className="space-y-3">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-3 rounded-xl text-sm"
                  style={errors.email
                    ? { border: '2px solid rgba(239, 68, 68, 0.5)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                    : { border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                  }
                  placeholder="Email address"
                />
                {errors.email && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>{errors.email}</p>
                )}
              </div>

              {/* Contact Number */}
              <div>
                <label htmlFor="contactNumber" className="block text-xs font-medium mb-1" style={{ color: '#000b3d', opacity: 0.8 }}>
                  Contact Number
                </label>
                <input
                  type="tel"
                  id="contactNumber"
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleInputChange}
                  className="w-full p-3 rounded-xl text-sm"
                  style={errors.contactNumber
                    ? { border: '2px solid rgba(239, 68, 68, 0.5)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                    : { border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', color: '#000b3d' }
                  }
                  placeholder="Contact number (optional)"
                />
                {errors.contactNumber && (
                  <p className="mt-1 text-xs" style={{ color: '#dc2626' }}>{errors.contactNumber}</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons - Mobile */}
          <div className="flex flex-col gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{
                background: saving
                  ? 'rgba(56, 182, 255, 0.6)'
                  : 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)'
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            
            <button
              type="button"
              onClick={handleBack}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: 'rgba(107, 114, 128, 0.2)', color: '#4b5563' }}
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-center mt-4" style={{ color: '#000b3d', opacity: 0.6 }}>
            * Required fields
          </p>
        </form>
      </div>

      {/* DESKTOP LAYOUT (lg: and above) */}
      <div className="hidden lg:block w-full pt-20 pb-8">
        <section className="w-full max-w-3xl mx-auto relative z-10 animate-fade-in px-4 sm:px-6 lg:px-8">
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-8 px-6 sm:px-8 lg:px-12" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="absolute inset-0 opacity-30" style={{
              background: 'linear-gradient(135deg, transparent 0%, rgba(249, 210, 23, 0.1) 50%, transparent 100%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }}></div>
            
            <div className="relative z-10">
              <div className="text-center mb-8 animate-fade-in-down">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <img src="/img/solarchargelogo.png" alt="SolarCharge Logo" className="h-12 md:h-16 w-auto drop-shadow-lg animate-logo-float"/>
                  <span className="text-3xl md:text-4xl font-black tracking-tight" style={{
                    background: 'linear-gradient(135deg, #f9d217 0%, #38b6ff 50%, #000b3d 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>SolarCharge</span>
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
                <div className={`mb-6 p-4 rounded-lg text-center text-sm`}
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
                }>
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
                          errors.firstName 
                            ? 'border-2' 
                            : 'border'
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
                          errors.lastName 
                            ? 'border-2' 
                            : 'border'
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
                          errors.email 
                            ? 'border-2' 
                            : 'border'
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
                          errors.contactNumber 
                            ? 'border-2' 
                            : 'border'
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
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                          background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.3) 0%, rgba(56, 182, 255, 0.3) 100%)'
                        }}></div>
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
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                      background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.3) 0%, rgba(75, 85, 99, 0.3) 100%)'
                    }}></div>
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
    </div>
  );
}

export default UserProfilePage; 
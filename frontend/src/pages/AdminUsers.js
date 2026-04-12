// frontend/src/pages/AdminUsers.js

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation'; // Assuming this component exists

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

// A simple modal for confirmations to avoid using window.confirm
const ConfirmationModal = ({ message, onConfirm, onCancel, isOpen }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6 w-full max-w-sm" style={{ 
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
            }}>
                <p className="text-lg font-semibold mb-4" style={{ color: '#000b3d' }}>{message}</p>
                <div className="flex justify-end gap-4">
                    <button
                        onClick={onCancel}
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
                        onClick={onConfirm}
                        className="font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                        }}
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};


function AdminUsers({ navigateTo, handleSignOut }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [availablePlans, setAvailablePlans] = useState([]);

    // Confirmation modal state
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    
    // Form state for editing or adding a user, now includes subscription plan
    const [formData, setFormData] = useState({
        fname: '',
        lname: '',
        email: '',
        contact_number: '',
        is_admin: false,
        plan_id: '' // This will hold the plan_id from the 'subscription_plans' table
    });

    // Fetch all users from the backend.
    // The backend should join 'users' with 'user_subscription' and 'subscription_plans'
    // to provide the user's current subscription details.
    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setInitialLoad(false);
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");
            
            const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (!res.ok) throw new Error(`Error fetching users: ${res.statusText}`);
            
            const data = await res.json();
            setUsers(data);
        } catch (error) {
            console.error("Users error:", error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch all available subscription plans to populate the dropdown menu.
    const fetchAvailablePlans = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");

            const res = await fetch(`${BACKEND_URL}/api/subscription/plans`, {
                 headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if(!res.ok) throw new Error('Could not fetch subscription plans.');

            const data = await res.json();
            setAvailablePlans(data || []);

        } catch(err) {
            console.error("Failed to load subscription plans:", err);
            setError(err.message);
        }
    }, []);

    useEffect(() => {
        if (initialLoad || users.length === 0) {
            fetchUsers();
            fetchAvailablePlans();
        } else {
            setLoading(false);
        }
    }, [initialLoad, users.length]); // Remove function dependencies to prevent re-runs

    // When an admin selects a user to edit, populate the form with their data.
    // This includes their current subscription plan_id to pre-select the correct dropdown option.
    const handleSelectUser = (user) => {
        setSelectedUser(user);
        setFormData({
            fname: user.fname || '',
            lname: user.lname || '',
            email: user.email || '',
            contact_number: user.contact_number || '',
            is_admin: user.is_admin || false,
            plan_id: user.subscription?.plan_id || '' 
        });
        setIsEditing(true);
        setIsAdding(false);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Prepare the form for adding a new user.
    const handleAddUser = () => {
        setIsAdding(true);
        setIsEditing(false);
        setSelectedUser(null);
        setFormData({
            fname: '',
            lname: '',
            email: '',
            password: '', // Password is required for new user creation.
            contact_number: '',
            is_admin: false,
            plan_id: ''
        });
    };

    // Handle form submission for both creating and updating a user.
    // The backend will be responsible for the database logic based on the sent `plan_id`.
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Not authenticated");
            
            const url = selectedUser 
                ? `${BACKEND_URL}/api/admin/users/${selectedUser.user_id}`
                : `${BACKEND_URL}/api/admin/users`;
            
            const method = selectedUser ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Error ${isAdding ? 'adding' : 'updating'} user`);
            }
            
            await fetchUsers(); // Refresh the user list to show changes.
            
            // Reset the form state.
            setIsAdding(false);
            setIsEditing(false);
            setSelectedUser(null);
        } catch (error) {
            console.error("Submit error:", error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Initiates the delete confirmation process.
    const handleDeleteUser = (userId) => {
        const action = async () => {
            try {
                setLoading(true);
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("Not authenticated");
                
                const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                
                if (!res.ok) throw new Error(`Error deleting user: ${res.statusText}`);
                
                await fetchUsers();
                setSelectedUser(null);
            } catch (error) {
                console.error("Delete error:", error);
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };
        setConfirmAction(() => action);
        setIsConfirmOpen(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    const renderUserForm = () => (
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-8" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#000b3d' }}>
                {isAdding ? "Add New User" : "Edit User"}
            </h2>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* User Details */}
                    <div>
                        <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>First Name</label>
                        <input type="text" name="fname" value={formData.fname} onChange={handleInputChange} className="input-style" />
                    </div>
                    <div>
                        <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>Last Name</label>
                        <input type="text" name="lname" value={formData.lname} onChange={handleInputChange} className="input-style" />
                    </div>
                    <div>
                        <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-style" required disabled={!isAdding} />
                        {!isAdding && <p className="text-xs mt-1" style={{ color: '#000b3d', opacity: 0.6 }}>Email cannot be changed.</p>}
                    </div>
                    <div>
                        <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>Contact Number</label>
                        <input type="text" name="contact_number" value={formData.contact_number} onChange={handleInputChange} className="input-style" />
                    </div>
                    {isAdding && (
                        <div>
                            <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>Password</label>
                            <input type="password" name="password" value={formData.password} onChange={handleInputChange} className="input-style" required />
                        </div>
                    )}
                    
                    {/* Subscription Management Section */}
                    <div className="md:col-span-2 border-t pt-6 mt-4" style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}>
                         <h3 className="text-xl font-semibold mb-4" style={{ color: '#000b3d' }}>Subscription Management</h3>
                         <div>
                            <label htmlFor="plan_id" className="block font-bold mb-2" style={{ color: '#000b3d' }}>Subscription Plan</label>
                            <select id="plan_id" name="plan_id" value={formData.plan_id} onChange={handleInputChange} className="input-style">
                                <option value="">No Subscription</option>
                                {availablePlans.map(plan => (
                                    <option key={plan.plan_id} value={plan.plan_id}>
                                        {plan.plan_name} ({new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(plan.price)}/month)
                                    </option>
                                ))}
                            </select>
                         </div>
                    </div>

                    <div className="flex items-center md:col-span-2">
                        <input id="is_admin" type="checkbox" name="is_admin" checked={formData.is_admin} onChange={handleInputChange} className="h-4 w-4 rounded" style={{ accentColor: '#38b6ff' }} />
                        <label htmlFor="is_admin" className="ml-2 block text-sm font-bold" style={{ color: '#000b3d' }}>Administrator Role</label>
                    </div>
                </div>
                <div className="flex justify-end mt-8 gap-4">
                    <button 
                        type="button" 
                        onClick={() => { setIsEditing(false); setIsAdding(false); setSelectedUser(null); }} 
                        className="font-bold py-2 px-6 rounded-xl transition-all duration-200 hover:scale-105"
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
                        className="font-bold py-2 px-6 rounded-xl text-white transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                            boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                            willChange: 'transform',
                            transform: 'translateZ(0)'
                        }}
                        disabled={loading}
                    >
                        {loading ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
        </div>
    );

    const renderUsersTable = () => (
        <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
        }}>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.1)', borderBottom: '1px solid rgba(255, 255, 255, 0.3)' }}>
                            {['Name', 'Email', 'Role', 'Subscription', 'Last Login', 'Actions'].map(h => (
                                <th key={h} className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#000b3d', opacity: 0.7 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user, index) => (
                            <tr 
                                key={user.user_id} 
                                className="transition-colors duration-150"
                                style={{ 
                                    borderBottom: index < users.length - 1 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
                                    background: 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <td className="py-4 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{user.fname} {user.lname}</td>
                                <td className="py-4 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{user.email}</td>
                                <td className="py-4 px-4 whitespace-nowrap">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={{
                                        background: user.is_admin ? 'rgba(147, 51, 234, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                        color: user.is_admin ? '#9333ea' : '#10b981',
                                        border: `1px solid ${user.is_admin ? 'rgba(147, 51, 234, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                                    }}>
                                        {user.is_admin ? "Admin" : "User"}
                                    </span>
                                </td>
                                <td className="py-4 px-4 whitespace-nowrap" style={{ color: '#000b3d' }}>{user.subscription?.plan_name || 'None'}</td>
                                <td className="py-4 px-4 whitespace-nowrap" style={{ color: '#000b3d', opacity: 0.7 }}>{formatDate(user.last_login)}</td>
                                <td className="py-4 px-4 whitespace-nowrap text-sm font-medium">
                                    <button 
                                        onClick={() => handleSelectUser(user)} 
                                        className="mr-4 font-semibold transition-colors duration-200"
                                        style={{ color: '#38b6ff' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = '#000b3d'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = '#38b6ff'}
                                    >
                                        Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteUser(user.user_id)} 
                                        className="font-semibold transition-colors duration-200"
                                        style={{ color: '#ef4444' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = '#ef4444'}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

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

            <style>{`.input-style { appearance: none; border-radius: 0.75rem; width: 100%; padding: 0.75rem 1rem; border: 1px solid rgba(255, 255, 255, 0.3); color: #000b3d; line-height: 1.25; transition: all 0.2s ease-out; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); } .input-style:focus { outline: none; box-shadow: 0 0 0 3px rgba(56, 182, 255, 0.3); border-color: rgba(56, 182, 255, 0.5); background: rgba(255, 255, 255, 0.3); } .input-style:disabled { opacity: 0.6; cursor: not-allowed; } .input-style option { background: rgba(255, 255, 255, 0.95); color: #000b3d; }`}</style>
            <Navigation currentPage="admin-users" navigateTo={navigateTo} handleSignOut={handleSignOut} />
            
            <ConfirmationModal 
                isOpen={isConfirmOpen}
                message="Are you sure you want to delete this user? This action cannot be undone."
                onConfirm={() => {
                    if(confirmAction) confirmAction();
                    setIsConfirmOpen(false);
                }}
                onCancel={() => setIsConfirmOpen(false)}
            />

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
                            <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>User Management</h1>
                            <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Manage user accounts and subscriptions</p>
                        </div>
                        {!isEditing && !isAdding && (
                            <button 
                                onClick={handleAddUser} 
                                className="font-bold py-2 px-6 rounded-xl text-white transition-all duration-200 hover:scale-105"
                                style={{
                                    background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                                    boxShadow: '0 8px 24px rgba(56, 182, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                                    willChange: 'transform',
                                    transform: 'translateZ(0)'
                                }}
                            >
                                Add New User
                            </button>
                        )}
                    </div>
                </div>
                
                {error && (
                    <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
                    }}>
                        <p className="font-semibold" style={{ color: '#dc2626' }}>Error: {error}</p>
                    </div>
                )}
                
                {loading && !users.length ? (
                    <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-16 px-8 text-center" style={{ 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                        boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
                    }}>
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
                            borderColor: '#38b6ff',
                            borderTopColor: 'transparent'
                        }}></div>
                        <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading users...</p>
                    </div>
                ) : isEditing || isAdding ? (
                    renderUserForm()
                ) : (
                    renderUsersTable()
                )}
            </div>
        </div>
    );
}

export default AdminUsers;

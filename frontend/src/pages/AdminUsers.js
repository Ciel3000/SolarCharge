// frontend/src/pages/AdminUsers.js

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation'; // Assuming this component exists

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

// A simple modal for confirmations to avoid using window.confirm
const ConfirmationModal = ({ message, onConfirm, onCancel, isOpen }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                <p className="text-lg text-gray-800 mb-4">{message}</p>
                <div className="flex justify-end gap-4">
                    <button
                        onClick={onCancel}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
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
        <div className="mt-8 bg-white rounded-lg shadow-xl p-6 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {isAdding ? "Add New User" : "Edit User"}
            </h2>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* User Details */}
                    <div><label className="block text-gray-700 font-bold mb-2">First Name</label><input type="text" name="fname" value={formData.fname} onChange={handleInputChange} className="input-style" /></div>
                    <div><label className="block text-gray-700 font-bold mb-2">Last Name</label><input type="text" name="lname" value={formData.lname} onChange={handleInputChange} className="input-style" /></div>
                    <div><label className="block text-gray-700 font-bold mb-2">Email</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-style" required disabled={!isAdding} />{!isAdding && <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>}</div>
                    <div><label className="block text-gray-700 font-bold mb-2">Contact Number</label><input type="text" name="contact_number" value={formData.contact_number} onChange={handleInputChange} className="input-style" /></div>
                    {isAdding && <div><label className="block text-gray-700 font-bold mb-2">Password</label><input type="password" name="password" value={formData.password} onChange={handleInputChange} className="input-style" required /></div>}
                    
                    {/* Subscription Management Section */}
                    <div className="md:col-span-2 border-t pt-6 mt-4">
                         <h3 className="text-xl font-semibold text-gray-700 mb-4">Subscription Management</h3>
                         <div>
                            <label htmlFor="plan_id" className="block text-gray-700 font-bold mb-2">Subscription Plan</label>
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
                        <input id="is_admin" type="checkbox" name="is_admin" checked={formData.is_admin} onChange={handleInputChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                        <label htmlFor="is_admin" className="ml-2 block text-sm text-gray-900 font-bold">Administrator Role</label>
                    </div>
                </div>
                <div className="flex justify-end mt-8 gap-4">
                    <button type="button" onClick={() => { setIsEditing(false); setIsAdding(false); setSelectedUser(null); }} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors">Cancel</button>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</button>
                </div>
            </form>
        </div>
    );

    const renderUsersTable = () => (
        <div className="mt-8 overflow-x-auto bg-white rounded-lg shadow-xl">
            <table className="min-w-full">
                <thead className="bg-gray-50">
                    <tr>
                        {['Name', 'Email', 'Role', 'Subscription', 'Last Login', 'Actions'].map(h => <th key={h} className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {users.map((user) => (
                        <tr key={user.user_id} className="hover:bg-gray-50">
                            <td className="py-4 px-4 whitespace-nowrap">{user.fname} {user.lname}</td>
                            <td className="py-4 px-4 whitespace-nowrap">{user.email}</td>
                            <td className="py-4 px-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.is_admin ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"}`}>{user.is_admin ? "Admin" : "User"}</span></td>
                            <td className="py-4 px-4 whitespace-nowrap">{user.subscription?.plan_name || 'None'}</td>
                            <td className="py-4 px-4 whitespace-nowrap">{formatDate(user.last_login)}</td>
                            <td className="py-4 px-4 whitespace-nowrap text-sm font-medium">
                                <button onClick={() => handleSelectUser(user)} className="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                                <button onClick={() => handleDeleteUser(user.user_id)} className="text-red-600 hover:text-red-900">Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <style>{`.input-style { appearance: none; border-radius: 0.5rem; width: 100%; padding: 0.75rem 1rem; border: 1px solid #D1D5DB; color: #111827; line-height: 1.25; transition: box-shadow 0.15s ease-in-out; } .input-style:focus { outline: none; box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.5); border-color: #3B82F6; }`}</style>
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

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                    {!isEditing && !isAdding && <button onClick={handleAddUser} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Add New User</button>}
                </div>
                
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4"><p>Error: {error}</p></div>}
                
                {loading && !users.length ? (
                    <div className="text-center py-12"><p className="text-gray-500">Loading users...</p></div>
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

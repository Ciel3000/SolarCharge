import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function AdminUsers({ navigateTo, handleSignOut }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state for editing or adding a user
  const [formData, setFormData] = useState({
    fname: '',
    lname: '',
    email: '',
    contact_number: '',
    is_admin: false
  });
  
  useEffect(() => {
    fetchUsers();
  }, []);
  
  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Fetch users from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching users: ${res.statusText}`);
      }
      
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Users error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  
  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setFormData({
      fname: user.fname || '',
      lname: user.lname || '',
      email: user.email || '',
      contact_number: user.contact_number || '',
      is_admin: user.is_admin || false
    });
  };
  
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };
  
  const handleAddUser = () => {
    setIsAdding(true);
    setSelectedUser(null);
    setFormData({
      fname: '',
      lname: '',
      email: '',
      contact_number: '',
      is_admin: false
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Create or update user
      let url, method;
      
      if (selectedUser) {
        url = `${BACKEND_URL}/api/admin/users/${selectedUser.user_id}`;
        method = 'PUT';
      } else {
        url = `${BACKEND_URL}/api/admin/users`;
        method = 'POST';
      }
      
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        throw new Error(`Error ${isAdding ? 'adding' : 'updating'} user: ${res.statusText}`);
      }
      
      // Refresh users list
      await fetchUsers();
      
      // Reset form
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
  
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Delete user
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error deleting user: ${res.statusText}`);
      }
      
      // Refresh users list
      await fetchUsers();
      
      // Reset form
      setSelectedUser(null);
    } catch (error) {
      console.error("Delete error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-users" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-semibold text-gray-800">Manage Users</h1>
          
          <button
            onClick={handleAddUser}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Add New User
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {loading && !isEditing && !isAdding ? (
          <div className="text-center py-8">
            <p>Loading users...</p>
          </div>
        ) : isEditing || isAdding ? (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {isAdding ? "Add New User" : "Edit User"}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="fname"
                    value={formData.fname}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lname"
                    value={formData.lname}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                    disabled={!isAdding}
                  />
                  {!isAdding && (
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    name="contact_number"
                    value={formData.contact_number}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="is_admin"
                    checked={formData.is_admin}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <label className="text-gray-700 text-sm font-bold">
                    Admin User
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setIsAdding(false);
                    setSelectedUser(null);
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mr-2"
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  disabled={loading}
                >
                  {loading ? "Saving..." : isAdding ? "Add User" : "Update User"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow-md">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-3 px-4 text-left">Name</th>
                  <th className="py-3 px-4 text-left">Email</th>
                  <th className="py-3 px-4 text-left">Contact</th>
                  <th className="py-3 px-4 text-left">Role</th>
                  <th className="py-3 px-4 text-left">Last Login</th>
                  <th className="py-3 px-4 text-left">Created</th>
                  <th className="py-3 px-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id} className="border-t">
                    <td className="py-3 px-4">{user.fname} {user.lname}</td>
                    <td className="py-3 px-4">{user.email}</td>
                    <td className="py-3 px-4">{user.contact_number || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          user.is_admin ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {user.is_admin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="py-3 px-4">{formatDate(user.last_login)}</td>
                    <td className="py-3 px-4">{formatDate(user.created_at)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          handleSelectUser(user);
                          setIsEditing(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm mr-2"
                      >
                        Edit
                      </button>
                      
                      <button
                        onClick={() => handleDeleteUser(user.user_id)}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUsers; 
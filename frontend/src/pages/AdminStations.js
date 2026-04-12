import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Navigation from '../components/Navigation';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://solar-charger-backend.onrender.com';

function AdminStations({ navigateTo, handleSignOut }) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [batteryLevels, setBatteryLevels] = useState([]);
  
     // Form state for editing or adding a station
   const [formData, setFormData] = useState({
     station_name: '',
     location_description: '',
     latitude: '',
     longitude: '',
     solar_panel_wattage: '',
     battery_capacity_kwh: '',
     current_battery_level: '',
     price_per_kwh: '',
     device_mqtt_id: '',
     num_free_ports: 2,
     num_premium_ports: 2,
     is_active: true
   });
  
  //Fetch stations and battery levels
  useEffect(() => {
    if (initialLoad || stations.length === 0) {
      fetchStations();
      fetchBatteryLevels();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoad]);
  
  //Fetch stations
  async function fetchStations() {
    try {
      setInitialLoad(false);
      setLoading(true);
      setError(null);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        // Fetch stations from backend
        const res = await fetch(`${BACKEND_URL}/api/admin/stations`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          // Try to get error message from response
          let errorMessage = `Error fetching stations: ${res.status} ${res.statusText}`;
          try {
            const errorData = await res.json();
            if (errorData.error) {
              errorMessage = `Error fetching stations: ${errorData.error}`;
            }
          } catch (e) {
            // If response is not JSON, use status text
            const errorText = await res.text();
            if (errorText) {
              errorMessage = `Error fetching stations: ${errorText}`;
            }
          }
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        setStations(data);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout: The server took too long to respond. The backend server might be sleeping or overloaded.');
        }
        throw fetchError;
      }
    } catch (error) {
      console.error("Stations error:", error);
      // Provide more detailed error message
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setError(`Network error: Unable to connect to backend server at ${BACKEND_URL}. The server might be down or sleeping. Please try again in a moment.`);
      } else if (error.message.includes('timeout')) {
        setError(error.message);
      } else {
        setError(error.message || 'An unknown error occurred while fetching stations');
      }
    } finally {
      setLoading(false);
    }
  }
  
  //Fetch battery levels
  async function fetchBatteryLevels() {
    try {
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return;
      }
      
      // Fetch battery levels from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/stations/battery`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching battery levels: ${res.statusText}`);
      }
      
      const data = await res.json();
      setBatteryLevels(data);
    } catch (error) {
      console.error("Battery levels error:", error);
    }
  }
  
  //Select a station
  const handleSelectStation = (station) => {
    setSelectedStation(station);
    setFormData({
      station_name: station.station_name,
      location_description: station.location_description,
      latitude: station.latitude,
      longitude: station.longitude,
      solar_panel_wattage: station.solar_panel_wattage,
             battery_capacity_kwh: station.battery_capacity_mah ? (station.battery_capacity_mah / 1000).toFixed(2) : '', // Convert mAh to kWh
       current_battery_level: station.current_battery_level,
       price_per_kwh: station.price_per_mah ? (station.price_per_mah * 1000).toFixed(2) : 0.25, // Convert price per mAh to price per kWh
       device_mqtt_id: station.device_mqtt_id || '',
       num_free_ports: station.num_free_ports,
       num_premium_ports: station.num_premium_ports,
       is_active: station.is_active
    });
  };
  
  //Handle input change
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };
  
  //Add a station
  const handleAddStation = () => {
    setIsAdding(true);
    setSelectedStation(null);
         setFormData({
       station_name: '',
       location_description: '',
       latitude: '',
       longitude: '',
       solar_panel_wattage: '',
       battery_capacity_kwh: '',
       current_battery_level: 100,
       price_per_kwh: 0.25,
       device_mqtt_id: '',
       num_free_ports: 2,
       num_premium_ports: 2,
       is_active: true
     });
  };
  
  //Submit a station
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
                              // Validate required fields
         if (!formData.station_name || !formData.location_description || !formData.latitude || 
             !formData.longitude || !formData.solar_panel_wattage || !formData.battery_capacity_kwh || 
             !formData.current_battery_level || !formData.price_per_kwh || !formData.device_mqtt_id || !formData.num_free_ports || !formData.num_premium_ports) {
           throw new Error('All fields are required');
         }
       
       // Prepare data with proper validation
       const stationData = {
         station_name: formData.station_name.trim(),
         location_description: formData.location_description.trim(),
         latitude: parseFloat(formData.latitude) || 0,
         longitude: parseFloat(formData.longitude) || 0,
         solar_panel_wattage: parseInt(formData.solar_panel_wattage) || 0,
         battery_capacity_mah: (parseFloat(formData.battery_capacity_kwh) || 0) * 1000, // Convert kWh to mAh
         current_battery_level: parseFloat(formData.current_battery_level) || 0,
         price_per_mah: (parseFloat(formData.price_per_kwh) || 0.25) / 1000, // Convert price per kWh to price per mAh
         device_mqtt_id: formData.device_mqtt_id.trim(),
         num_free_ports: parseInt(formData.num_free_ports) || 0,
         num_premium_ports: parseInt(formData.num_premium_ports) || 0,
         is_active: formData.is_active
       };
       
       // Log the exact data being sent
       console.log('Form data:', formData);
       console.log('Processed station data:', stationData);
       
       // Validate numeric values
                if (isNaN(stationData.latitude) || isNaN(stationData.longitude) || 
             isNaN(stationData.solar_panel_wattage) || isNaN(stationData.battery_capacity_mah) || 
             isNaN(stationData.current_battery_level) || isNaN(stationData.price_per_mah) ||
             isNaN(stationData.num_free_ports) || isNaN(stationData.num_premium_ports)) {
           throw new Error('Invalid numeric values in form');
         }
       
       console.log('Sending station data:', stationData);
      
      // Create or update station
      let url = `${BACKEND_URL}/api/admin/stations`;
      let method = 'POST';
      
      if (selectedStation) {
        url = `${BACKEND_URL}/api/admin/stations/${selectedStation.station_id}`;
        method = 'PUT';
      }
      
      //Create or update station
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(stationData)
      });
      
             if (!res.ok) {
         const errorText = await res.text();
         console.error('Backend error response:', errorText);
         throw new Error(`Error ${isAdding ? 'adding' : 'updating'} station: ${res.status} - ${errorText}`);
       }
      
      // Refresh stations list
      await fetchStations();
      
      // Reset form
      setIsAdding(false);
      setIsEditing(false);
      setSelectedStation(null);
    } catch (error) {
      console.error("Submit error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  //Delete a station
  const handleDeleteStation = async (stationId) => {
    if (!window.confirm("Are you sure you want to delete this station? This action cannot be undone.")) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Get authentication token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }
      
      // Delete station
      const res = await fetch(`${BACKEND_URL}/api/admin/stations/${stationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error deleting station: ${res.statusText}`);
      }
      
      // Refresh stations list
      await fetchStations();
      
      // Reset form
      setSelectedStation(null);
    } catch (error) {
      console.error("Delete error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
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

      <Navigation currentPage="admin-stations" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
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
              <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ color: '#000b3d' }}>Manage Stations</h1>
              <p className="text-lg" style={{ color: '#000b3d', opacity: 0.7 }}>Create and manage charging stations</p>
            </div>
            <button
              onClick={handleAddStation}
              className="font-bold py-2 px-6 rounded-xl text-white transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                willChange: 'transform',
                transform: 'translateZ(0)'
              }}
            >
              Add New Station
            </button>
          </div>
        </div>
        
        {error && (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 overflow-hidden py-4 px-6 mb-6" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(239, 68, 68, 0.15)'
          }}>
            <div className="flex justify-between items-center">
              <p className="flex-1 font-semibold" style={{ color: '#dc2626' }}>Error: {error}</p>
              <button
                onClick={() => {
                  setInitialLoad(true);
                  fetchStations();
                }}
                className="ml-4 font-bold py-2 px-4 rounded-xl text-white transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                  willChange: 'transform',
                  transform: 'translateZ(0)'
                }}
                disabled={loading}
              >
                {loading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          </div>
        )}
        
        {loading && !isEditing && !isAdding ? (
          <div className="relative backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden py-16 px-8 text-center" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto mb-4" style={{
              borderColor: '#38b6ff',
              borderTopColor: 'transparent'
            }}></div>
            <p style={{ color: '#000b3d', opacity: 0.7 }}>Loading stations...</p>
          </div>
        ) : isEditing || isAdding ? (
          <div className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-8" style={{ 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
            boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)'
          }}>
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#000b3d' }}>
              {isAdding ? "Add New Station" : "Edit Station"}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Station Name
                  </label>
                  <input
                    type="text"
                    name="station_name"
                    value={formData.station_name}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Location Description
                  </label>
                  <input
                    type="text"
                    name="location_description"
                    value={formData.location_description}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Latitude
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    step="0.000001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Longitude
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    step="0.000001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Solar Panel Wattage
                  </label>
                  <input
                    type="number"
                    name="solar_panel_wattage"
                    value={formData.solar_panel_wattage}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Battery Capacity (kWh)
                  </label>
                  <input
                    type="number"
                    name="battery_capacity_kwh"
                    value={formData.battery_capacity_kwh}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    step="0.001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Current Battery Level (%)
                  </label>
                  <input
                    type="number"
                    name="current_battery_level"
                    value={formData.current_battery_level}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    min="0"
                    max="100"
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Price per kWh (₱)
                  </label>
                  <input
                    type="number"
                    name="price_per_kwh"
                    value={formData.price_per_kwh}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    step="0.01"
                    required
                  />
                </div>
                 
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Device MQTT ID
                  </label>
                  <input
                    type="text"
                    name="device_mqtt_id"
                    value={formData.device_mqtt_id}
                    onChange={handleInputChange}
                    placeholder="e.g., ESP32_CHARGER_STATION_001"
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Number of Free Ports
                  </label>
                  <input
                    type="number"
                    name="num_free_ports"
                    value={formData.num_free_ports}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    min="0"
                    required
                  />
                </div>
                 
                <div>
                  <label className="block font-bold mb-2" style={{ color: '#000b3d' }}>
                    Number of Premium Ports
                  </label>
                  <input
                    type="number"
                    name="num_premium_ports"
                    value={formData.num_premium_ports}
                    onChange={handleInputChange}
                    className="rounded-xl w-full py-2 px-3 leading-tight transition-all duration-200"
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
                    min="0"
                    required
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                    className="mr-2 rounded"
                    style={{ accentColor: '#38b6ff' }}
                  />
                  <label className="font-bold" style={{ color: '#000b3d' }}>
                    Station Active
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setIsAdding(false);
                    setSelectedStation(null);
                  }}
                  className="font-bold py-2 px-6 rounded-xl transition-all duration-200 hover:scale-105 mr-2"
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
                  {loading ? "Saving..." : isAdding ? "Add Station" : "Update Station"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stations.map((station) => (
                <div
                  key={station.station_id}
                  className="relative backdrop-blur-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden p-6"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 100%)',
                    boxShadow: '0 8px 32px 0 rgba(0, 11, 61, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.5)',
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
                    transform: 'translateZ(0)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02) translateZ(0)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1) translateZ(0)';
                  }}
                >
                  <div className="flex justify-between items-start">
                    <h2 className="text-xl font-bold" style={{ color: '#000b3d' }}>{station.station_name}</h2>
                    <span
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{
                        background: station.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(249, 210, 23, 0.2)',
                        color: station.is_active ? '#10b981' : '#f9d217',
                        border: `1px solid ${station.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(249, 210, 23, 0.3)'}`
                      }}
                    >
                      {station.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  
                  <p className="mt-2" style={{ color: '#000b3d', opacity: 0.7 }}>{station.location_description}</p>
                  <p className="text-sm mt-1" style={{ color: '#000b3d', opacity: 0.7 }}><strong>Device ID:</strong> {station.device_mqtt_id || 'Not set'}</p>
                   
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-xl backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(56, 182, 255, 0.2) 0%, rgba(56, 182, 255, 0.1) 100%)',
                      border: '1px solid rgba(56, 182, 255, 0.3)'
                    }}>
                      <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Free Ports</p>
                      <p className="font-bold" style={{ color: '#38b6ff' }}>{station.num_free_ports}</p>
                    </div>
                    <div className="p-2 rounded-xl backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(249, 210, 23, 0.2) 0%, rgba(249, 210, 23, 0.1) 100%)',
                      border: '1px solid rgba(249, 210, 23, 0.3)'
                    }}>
                      <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Premium Ports</p>
                      <p className="font-bold" style={{ color: '#f9d217' }}>{station.num_premium_ports}</p>
                    </div>
                    <div className="p-2 rounded-xl backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(0, 11, 61, 0.2) 0%, rgba(0, 11, 61, 0.1) 100%)',
                      border: '1px solid rgba(0, 11, 61, 0.3)'
                    }}>
                      <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Battery</p>
                      <p className="font-bold" style={{ color: '#000b3d' }}>{station.battery_capacity_mah ? (station.battery_capacity_mah / 1000).toFixed(2) : '0'} kWh</p>
                    </div>
                    <div className="p-2 rounded-xl backdrop-blur-md" style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)',
                      border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                      <p className="text-xs mb-1" style={{ color: '#000b3d', opacity: 0.7 }}>Level</p>
                      <p className="font-bold" style={{ color: '#10b981' }}>{station.current_battery_level}%</p>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => {
                        handleSelectStation(station);
                        setIsEditing(true);
                      }}
                      className="font-bold py-1 px-3 rounded-xl text-white text-sm transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, #38b6ff 0%, #000b3d 100%)',
                        boxShadow: '0 4px 12px rgba(56, 182, 255, 0.3)',
                        willChange: 'transform',
                        transform: 'translateZ(0)'
                      }}
                    >
                      Edit
                    </button>
                    
                    <button
                      onClick={() => handleDeleteStation(station.station_id)}
                      className="font-bold py-1 px-3 rounded-xl text-white text-sm transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                        willChange: 'transform',
                        transform: 'translateZ(0)'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminStations; 
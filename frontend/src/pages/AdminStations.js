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
  }, [initialLoad, stations.length]);
  
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
      
      // Fetch stations from backend
      const res = await fetch(`${BACKEND_URL}/api/admin/stations`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Error fetching stations: ${res.statusText}`);
      }
      
      const data = await res.json();
      setStations(data);
    } catch (error) {
      console.error("Stations error:", error);
      setError(error.message);
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
             !formData.current_battery_level || !formData.price_per_kwh || !formData.num_free_ports || !formData.num_premium_ports) {
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
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage="admin-stations" navigateTo={navigateTo} handleSignOut={handleSignOut} />
      
      <div className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-semibold text-gray-800">Manage Stations</h1>
          
          <button
            onClick={handleAddStation}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Add New Station
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-4">
            <p>Error: {error}</p>
          </div>
        )}
        
        {loading && !isEditing && !isAdding ? (
          <div className="text-center py-8">
            <p>Loading stations...</p>
          </div>
        ) : isEditing || isAdding ? (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {isAdding ? "Add New Station" : "Edit Station"}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Station Name
                  </label>
                  <input
                    type="text"
                    name="station_name"
                    value={formData.station_name}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Location Description
                  </label>
                  <input
                    type="text"
                    name="location_description"
                    value={formData.location_description}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Latitude
                  </label>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    step="0.000001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Longitude
                  </label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    step="0.000001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Solar Panel Wattage
                  </label>
                  <input
                    type="number"
                    name="solar_panel_wattage"
                    value={formData.solar_panel_wattage}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Battery Capacity (kWh)
                  </label>
                  <input
                    type="number"
                    name="battery_capacity_kwh"
                    value={formData.battery_capacity_kwh}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    step="0.001"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-gray-700 text-sm font-bold mb-2">
                    Current Battery Level (%)
                  </label>
                  <input
                    type="number"
                    name="current_battery_level"
                    value={formData.current_battery_level}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    min="0"
                    max="100"
                    required
                  />
                </div>
                
                <div>
                                     <label className="block text-gray-700 text-sm font-bold mb-2">
                     Price per kWh (₱)
                   </label>
                  <input
                    type="number"
                    name="price_per_kwh"
                    value={formData.price_per_kwh}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    step="0.01"
                    required
                  />
                </div>
                
                                 <div>
                   <label className="block text-gray-700 text-sm font-bold mb-2">
                     Number of Free Ports
                   </label>
                   <input
                     type="number"
                     name="num_free_ports"
                     value={formData.num_free_ports}
                     onChange={handleInputChange}
                     className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                     min="0"
                     required
                   />
                 </div>
                 
                 <div>
                   <label className="block text-gray-700 text-sm font-bold mb-2">
                     Number of Premium Ports
                   </label>
                  <input
                    type="number"
                    name="num_premium_ports"
                    value={formData.num_premium_ports}
                    onChange={handleInputChange}
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
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
                    className="mr-2"
                  />
                  <label className="text-gray-700 text-sm font-bold">
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
                  className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mr-2"
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  disabled={loading}
                >
                  {loading ? "Saving..." : isAdding ? "Add Station" : "Update Station"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stations.map((station) => (
                <div
                  key={station.station_id}
                  className="bg-white rounded-lg shadow-md p-6"
                >
                  <div className="flex justify-between items-start">
                    <h2 className="text-xl font-semibold text-gray-800">{station.station_name}</h2>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        station.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {station.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  
                  <p className="text-gray-600 mt-2">{station.location_description}</p>
                  
                                     <div className="mt-4 grid grid-cols-2 gap-2">
                     <div>
                       <p className="text-gray-600 text-sm">Free Ports</p>
                       <p className="font-bold">{station.num_free_ports}</p>
                     </div>
                     <div>
                       <p className="text-gray-600 text-sm">Premium Ports</p>
                       <p className="font-bold">{station.num_premium_ports}</p>
                     </div>
                    <div>
                      <p className="text-gray-600 text-sm">Battery</p>
                      <p className="font-bold">{station.battery_capacity_mah ? (station.battery_capacity_mah / 1000).toFixed(2) : '0'} kWh</p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-sm">Level</p>
                      <p className="font-bold">{station.current_battery_level}%</p>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-between">
                    <button
                      onClick={() => {
                        handleSelectStation(station);
                        setIsEditing(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
                    >
                      Edit
                    </button>
                    
                    <button
                      onClick={() => handleDeleteStation(station.station_id)}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
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
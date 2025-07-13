// src/pages/StationPage.js
import React, { useState, useEffect, useCallback } from 'react';

// Define your backend URL (make sure it's correct for your local setup or deployment)
const BACKEND_URL = 'http://localhost:3001';

// We need to map which ESP32 device ID corresponds to which UI port.
// For simplicity, let's assume ESP32_Charger_001 is mapped to Premium Port 1.
// If you have more ESP32s, you'd expand this mapping.
const DEVICE_ID_MAPPING = {
    1: 'ESP32_Charger_001', // Premium Port 1 controlled by ESP32_Charger_001
    // 2: 'ESP32_Charger_002', // If you had another ESP32 for Premium Port 2
};

function StationPage({ session, station, navigateTo }) {
    const [loadingPort, setLoadingPort] = useState(null);
    const [feedback, setFeedback] = useState('');
    // State to store the actual status of charger devices fetched from backend
    // It will be an object like: { 'ESP32_Charger_001': { status_message: 'online', charger_state: 'OFF', ... } }
    const [chargerDeviceStatus, setChargerDeviceStatus] = useState({});

    // Example: Assume premium ports are 1 and 2
    const premiumPorts = [
        { port: 1, label: 'Premium Port 1' },
        { port: 2, label: 'Premium Port 2' } // This port will not be controlled by ESP32_Charger_001
    ];

    // Function to fetch the current status of all charger devices
    const fetchChargerDeviceStatus = useCallback(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/devices/status`);
            const data = await response.json();
            const statusMap = {};
            data.forEach(device => {
                statusMap[device.device_id] = device;
            });
            setChargerDeviceStatus(statusMap);
        } catch (error) {
            console.error('Error fetching charger device statuses:', error);
            setFeedback('Error loading port statuses.');
        }
    }, []);

    // Fetch status on component mount and periodically
    useEffect(() => {
        fetchChargerDeviceStatus(); // Initial fetch
        const intervalId = setInterval(fetchChargerDeviceStatus, 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId); // Cleanup on unmount
    }, [fetchChargerDeviceStatus]);


    const handleControlCommand = async (port, action) => {
        const deviceId = DEVICE_ID_MAPPING[port];
        if (!deviceId) {
            setFeedback(`No ESP32 device mapped for Port ${port}.`);
            return;
        }

        setLoadingPort(port);
        setFeedback('');

        const command = action === 'activate' ? 'ON' : 'OFF'; // Map 'activate'/'deactivate' to 'ON'/'OFF'

        try {
            const res = await fetch(`${BACKEND_URL}/api/devices/${deviceId}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const data = await res.json();
            if (res.ok && data.status === 'Command sent') {
                setFeedback(`Command "${command}" sent to Port ${port} (${deviceId})!`);
                // Optimistically update UI, then rely on periodic fetch for true state
                // This will be overwritten by the fetchChargerDeviceStatus after 5s
                setChargerDeviceStatus(prev => ({
                    ...prev,
                    [deviceId]: { ...prev[deviceId], charger_state: command, status_message: command === 'ON' ? 'online' : 'online' } // Assuming 'online' always
                }));
            } else {
                setFeedback(data.error || `Failed to send command to Port ${port}.`);
            }
        } catch (err) {
            console.error('Network error sending command:', err);
            setFeedback('Network error or backend issue.');
        } finally {
            setLoadingPort(null);
        }
    };

    // Placeholder for actual station data, if not provided
    if (!station) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
                    <h2 className="text-2xl font-bold mb-4">No Station Selected</h2>
                    <button
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
                        onClick={() => navigateTo('home')}
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    // Determine the status for each port based on fetched chargerDeviceStatus
    const getPortDisplayStatus = (port) => {
        const deviceId = DEVICE_ID_MAPPING[port];
        if (!deviceId) {
            return { display: 'N/A', class: 'text-gray-500' }; // No ESP32 mapped
        }
        const status = chargerDeviceStatus[deviceId];
        if (!status) {
            return { display: 'Unknown', class: 'text-gray-500' }; // Data not loaded yet
        }

        if (status.status_message === 'offline') {
            return { display: 'Offline', class: 'text-red-600' };
        } else if (status.charger_state === 'ON') {
            return { display: 'In Use', class: 'text-red-600' };
        } else if (status.charger_state === 'OFF') {
            return { display: 'Available', class: 'text-green-600' };
        }
        return { display: 'Unknown State', class: 'text-gray-500' };
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 p-4">
            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-8 mt-8">
                <button
                    className="mb-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
                    onClick={() => navigateTo('home')}
                >
                    ← Back to Home
                </button>
                <h1 className="text-3xl font-bold text-blue-800 mb-4">{station.station_name}</h1>
                <p className="text-gray-700 mb-2"><strong>Location:</strong> {station.location_description}</p>
                <p className="text-gray-700 mb-2"><strong>Battery Level:</strong> {station.current_battery_level}%</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <span className="text-gray-600">Free Ports</span>
                        <div className="text-2xl font-bold text-blue-600">{station.available_free_ports} / {station.num_free_ports}</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <span className="text-gray-600">Premium Ports</span>
                        <div className="text-2xl font-bold text-purple-600">{station.available_premium_ports} / {station.num_premium_ports}</div>
                    </div>
                </div>
                {station.last_maintenance_message && (
                    <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <span className="text-gray-700 text-sm">🛠️ Last Maintenance: {station.last_maintenance_message}</span>
                    </div>
                )}
                {/* Premium Port Controls */}
                {session && (
                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Control Charger Ports</h2>
                        {feedback && <div className="mb-4 text-center text-green-700 font-semibold">{feedback}</div>}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {premiumPorts.map(({ port, label }) => {
                                const deviceId = DEVICE_ID_MAPPING[port];
                                const currentStatus = getPortDisplayStatus(port); // Get computed status

                                // Only render controls for ports that are actually mapped to an ESP32 device
                                if (!deviceId) {
                                    return (
                                        <div key={port} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                                            <div className="text-lg font-semibold mb-2">{label}</div>
                                            <div className={`mb-4 text-sm font-bold ${currentStatus.class}`}>
                                                {currentStatus.display} (No ESP32 mapping)
                                            </div>
                                            {/* You might display a disabled button or nothing */}
                                            <button className="bg-gray-300 text-gray-600 font-bold py-2 px-6 rounded-lg cursor-not-allowed" disabled>
                                                N/A
                                            </button>
                                        </div>
                                    );
                                }

                                const isPortAvailable = currentStatus.display === 'Available';
                                const isPortOffline = currentStatus.display === 'Offline' || currentStatus.display === 'Unknown';

                                return (
                                    <div key={port} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                                        <div className="text-lg font-semibold mb-2">{label}</div>
                                        <div className={`mb-4 text-sm font-bold ${currentStatus.class}`}>
                                            {currentStatus.display}
                                        </div>
                                        {isPortOffline ? (
                                            <button
                                                className="bg-gray-400 text-white font-bold py-2 px-6 rounded-lg cursor-not-allowed"
                                                disabled
                                            >
                                                Device Offline
                                            </button>
                                        ) : isPortAvailable ? (
                                            <button
                                                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                                                onClick={() => handleControlCommand(port, 'activate')}
                                                disabled={loadingPort === port}
                                            >
                                                {loadingPort === port ? 'Activating...' : 'Activate'}
                                            </button>
                                        ) : (
                                            <button
                                                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                                                onClick={() => handleControlCommand(port, 'deactivate')}
                                                disabled={loadingPort === port}
                                            >
                                                {loadingPort === port ? 'Deactivating...' : 'Deactivate'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default StationPage;
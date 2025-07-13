import React, { useState, useEffect, useCallback } from 'react';


const BACKEND_URL = 'https://solar-charger-backend.onrender.com';


const DEVICE_PORT_MAPPING = {
    // Frontend Port 1 on the UI is managed by ESP32_CHARGER_STATION_001, which is its internal Port 1
    1: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 1, label: 'Premium Port 1' },
    // Frontend Port 2 on the UI is managed by ESP32_CHARGER_STATION_001, which is its internal Port 2
    2: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 2, label: 'Premium Port 2' },
};

function StationPage({ session, station, navigateTo }) {
    const [loadingPort, setLoadingPort] = useState(null);
    const [feedback, setFeedback] = useState('');
    // State to store the actual status of charger devices/ports fetched from backend
    // It will be an object like: { 'ESP32_CHARGER_STATION_001_1': { status_message: 'online', charger_state: 'OFF', ... } }
    const [chargerPortStatus, setChargerPortStatus] = useState({}); // <--- CHANGED State name

    // The premiumPorts array will now be generated from the mapping
    const premiumPorts = Object.values(DEVICE_PORT_MAPPING); // <--- CHANGED

    const fetchChargerDeviceStatus = useCallback(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/api/devices/status`); // This API returns ALL current statuses
            const data = await response.json();
            const statusMap = {};
            data.forEach(deviceStatus => { // deviceStatus now has device_id and port_id
                // Use a composite key for easy lookup: device_id_port_number_in_device
                const mappedPort = Object.values(DEVICE_PORT_MAPPING).find(
                    map => map.stationDeviceId === deviceStatus.device_id &&
                           map.internalPortNumber === deviceStatus.port_number_in_device
                );
                if (mappedPort) {
                    statusMap[`${mappedPort.stationDeviceId}_${mappedPort.internalPortNumber}`] = deviceStatus;
                }
            });
            setChargerPortStatus(statusMap); // <--- CHANGED State name
        } catch (error) {
            console.error('Error fetching charger device statuses:', error);
            setFeedback('Error loading port statuses.');
        }
    }, []);

    useEffect(() => {
        fetchChargerDeviceStatus();
        const intervalId = setInterval(fetchChargerDeviceStatus, 5000);
        return () => clearInterval(intervalId);
    }, [fetchChargerDeviceStatus]);

    const handleControlCommand = async (frontendPortNumber, action) => { // <--- CHANGED argument name
        const mappedPort = DEVICE_PORT_MAPPING[frontendPortNumber]; // Get the mapping
        if (!mappedPort) {
            setFeedback(`No mapping found for Frontend Port ${frontendPortNumber}.`);
            return;
        }
        const { stationDeviceId, internalPortNumber } = mappedPort; // Extract IDs

        setLoadingPort(frontendPortNumber); // Use frontendPortNumber for loading state
        setFeedback('');

        const command = action === 'activate' ? 'ON' : 'OFF';

        try {
            // <--- CHANGED: API call includes both stationDeviceId and internalPortNumber
            const res = await fetch(`${BACKEND_URL}/api/devices/${stationDeviceId}/${internalPortNumber}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const result = await res.json();
            if (res.ok && result.status === 'Command sent') {
                setFeedback(`Command "${command}" sent to Port ${internalPortNumber} (${stationDeviceId})!`);
                // Optimistically update UI
                const key = `${stationDeviceId}_${internalPortNumber}`;
                setChargerPortStatus(prev => ({ // <--- CHANGED State name
                    ...prev,
                    [key]: { ...prev[key], charger_state: command, status_message: command === 'ON' ? 'online' : 'online' }
                }));
            } else {
                setFeedback(result.error || `Failed to send command to Port ${internalPortNumber}.`);
            }
        } catch (err) {
            console.error('Network error sending command:', err);
            setFeedback('Network error or backend issue.');
        } finally {
            setLoadingPort(null);
        }
    };

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

    // Determine the status for each port based on fetched chargerPortStatus
    const getPortDisplayStatus = (frontendPortNumber) => { // <--- CHANGED argument name
        const mappedPort = DEVICE_PORT_MAPPING[frontendPortNumber];
        if (!mappedPort) {
            return { display: 'N/A', class: 'text-gray-500' };
        }
        const key = `${mappedPort.stationDeviceId}_${mappedPort.internalPortNumber}`;
        const status = chargerPortStatus[key]; // <--- CHANGED State name lookup

        if (!status) {
            return { display: 'Unknown', class: 'text-gray-500' };
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
                            {premiumPorts.map((mappedPort) => { // Iterate over mapped ports directly
                                const frontendPortNumber = mappedPort.port; // This is the 1, 2 from our map
                                const currentStatus = getPortDisplayStatus(frontendPortNumber);

                                // Get actual status object for rendering
                                const statusObject = chargerPortStatus[`${mappedPort.stationDeviceId}_${mappedPort.internalPortNumber}`];

                                const isPortAvailable = currentStatus.display === 'Available';
                                const isPortOffline = currentStatus.display === 'Offline' || currentStatus.display === 'Unknown';

                                return (
                                    <div key={mappedPort.internalPortNumber} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                                        <div className="text-lg font-semibold mb-2">{mappedPort.label}</div>
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
                                                onClick={() => handleControlCommand(frontendPortNumber, 'activate')}
                                                disabled={loadingPort === frontendPortNumber}
                                            >
                                                {loadingPort === frontendPortNumber ? 'Activating...' : 'Activate'}
                                            </button>
                                        ) : (
                                            <button
                                                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                                                onClick={() => handleControlCommand(frontendPortNumber, 'deactivate')}
                                                disabled={loadingPort === frontendPortNumber}
                                            >
                                                {loadingPort === frontendPortNumber ? 'Deactivating...' : 'Deactivate'}
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

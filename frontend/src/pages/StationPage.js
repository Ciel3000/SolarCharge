import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = 'https://solar-charger-backend.onrender.com';

const DEVICE_PORT_MAPPING = {
  1: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 1, label: 'Premium Port 1' },
  2: { stationDeviceId: 'ESP32_CHARGER_STATION_001', internalPortNumber: 2, label: 'Premium Port 2' },
};

function StationPage({ station, navigateTo }) {
  const { user, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const stationData = station || location.state?.station;

  const [loadingPort, setLoadingPort] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [chargerPortStatus, setChargerPortStatus] = useState({});
  const [activeSessions, setActiveSessions] = useState({});

  const fromRoute = location.state?.from || '/home';
  const premiumPorts = Object.entries(DEVICE_PORT_MAPPING);

  const fetchChargerDeviceStatus = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices/status`);
      const data = await response.json();
      const statusMap = {};
      data.forEach(deviceStatus => {
        const key = `${deviceStatus.device_id}_${deviceStatus.port_number_in_device}`;
        statusMap[key] = deviceStatus;
      });
      setChargerPortStatus(statusMap);
    } catch (error) {
      console.error('Error fetching charger device statuses:', error);
      setFeedback('Error loading port statuses.');
    }
  }, []);

  const fetchActiveUserSessions = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch active sessions.');
      const allActiveSessions = await res.json();
      const userActiveSessions = allActiveSessions.filter(s => s.user_id === user.id);

      const newActiveSessions = {};
      userActiveSessions.forEach(s => {
        const mappedPort = Object.values(DEVICE_PORT_MAPPING).find(
          map => map.internalPortNumber === s.port_number_in_device
        );
        if (mappedPort) {
          newActiveSessions[`${mappedPort.stationDeviceId}_${s.port_number_in_device}`] = s.session_id;
        }
      });

      setActiveSessions(newActiveSessions);
    } catch (err) {
      console.error('Error fetching active user sessions:', err);
      setActiveSessions({});
    }
  }, [user?.id, session?.access_token]);

  useEffect(() => {
    fetchChargerDeviceStatus();
    fetchActiveUserSessions();
    const statusIntervalId = setInterval(fetchChargerDeviceStatus, 5000);
    const sessionIntervalId = setInterval(fetchActiveUserSessions, 10000);
    return () => {
      clearInterval(statusIntervalId);
      clearInterval(sessionIntervalId);
    };
  }, [fetchChargerDeviceStatus, fetchActiveUserSessions]);

  const handleControlCommand = async (frontendPortNumber, action) => {
    if (!user?.id) {
      setFeedback('User not logged in.');
      return;
    }

    const mappedPortDetails = DEVICE_PORT_MAPPING[frontendPortNumber];
    if (!mappedPortDetails) {
      setFeedback(`No mapping found for Frontend Port ${frontendPortNumber}.`);
      return;
    }

    const { stationDeviceId, internalPortNumber } = mappedPortDetails;
    const key = `${stationDeviceId}_${internalPortNumber}`;

    setLoadingPort(frontendPortNumber);
    setFeedback('');

    try {
      let res;
      if (action === 'activate') {
        res = await fetch(`${BACKEND_URL}/api/devices/${stationDeviceId}/${internalPortNumber}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            command: 'ON',
            user_id: user.id,
            station_id: stationData.station_id,
          }),
        });
        const result = await res.json();
        if (res.ok && result.sessionId) {
          setFeedback(`Charging started on ${mappedPortDetails.label}!`);
          setActiveSessions(prev => ({ ...prev, [key]: result.sessionId }));
          setChargerPortStatus(prev => ({
            ...prev,
            [key]: { ...prev[key], charger_state: 'ON', status_message: 'online' },
          }));
        } else {
          setFeedback(result.error || `Failed to start session on ${mappedPortDetails.label}.`);
        }
      } else if (action === 'deactivate') {
        res = await fetch(`${BACKEND_URL}/api/devices/${stationDeviceId}/${internalPortNumber}/control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            command: 'OFF',
            user_id: user.id,
          }),
        });
        const result = await res.json();
        if (res.ok) {
          setFeedback(`Charging ended on ${mappedPortDetails.label}!`);
          setActiveSessions(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
          });
          setChargerPortStatus(prev => ({
            ...prev,
            [key]: { ...prev[key], charger_state: 'OFF', status_message: 'online' },
          }));
        } else {
          setFeedback(result.error || `Failed to end session on ${mappedPortDetails.label}.`);
        }
      }
    } catch (err) {
      console.error('Network error controlling charger:', err);
      setFeedback('Network error or backend issue.');
    } finally {
      setLoadingPort(null);
    }
  };

  const getPortDisplayStatus = (frontendPortNumber) => {
    const mappedPortDetails = DEVICE_PORT_MAPPING[frontendPortNumber];
    if (!mappedPortDetails) {
      return { display: 'N/A', class: 'text-gray-500', buttonText: 'Invalid Port' };
    }

    const key = `${mappedPortDetails.stationDeviceId}_${mappedPortDetails.internalPortNumber}`;
    const status = chargerPortStatus[key];
    const isActiveSession = activeSessions[key];

    // Check if status exists and if it's explicitly offline
    if (status?.status_message === 'offline') {
      return { display: 'Offline', class: 'text-red-600', buttonText: 'Offline' };
    }

    // If no status data at all, consider it offline (device not responding)
    if (!status) {
      return { display: 'Offline', class: 'text-red-600', buttonText: 'Device Offline' };
    }

    // Check for active user session first
    if (isActiveSession) {
      return { display: 'Charging (Your Session)', class: 'text-green-600', buttonText: 'Stop Charging' };
    } else if (status.charger_state === 'ON') {
      return { display: 'In Use (Other User)', class: 'text-orange-600', buttonText: 'Occupied' };
    } else if (status.charger_state === 'OFF') {
      return { display: 'Available', class: 'text-green-600', buttonText: 'Start Charging' };
    }

    return { display: 'Unknown State', class: 'text-gray-500', buttonText: 'Unknown' };
  };

  if (!stationData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">No Station Selected</h2>
          <p className="text-gray-600 mb-4">
            {location.state?.error || 'Please select a station from the home page.'}
          </p>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg"
            onClick={() => navigate(fromRoute)}
          >
            ← Back to {fromRoute === '/home' ? 'Home' : 'Previous Page'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl p-8 mt-8">
        <button
          className="mb-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg"
          onClick={() => navigate(fromRoute)}
        >
          ← Back to Home
        </button>

        <h1 className="text-3xl font-bold text-blue-800 mb-4">{stationData.station_name}</h1>
        <p className="text-gray-700 mb-2"><strong>Location:</strong> {stationData.location_description}</p>
        <p className="text-gray-700 mb-2"><strong>Battery Level:</strong> {stationData.current_battery_level}%</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <span className="text-gray-600">Free Ports</span>
            <div className="text-2xl font-bold text-blue-600">
              {stationData.available_free_ports} / {stationData.num_free_ports}
            </div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <span className="text-gray-600">Premium Ports</span>
            <div className="text-2xl font-bold text-purple-600">
              {stationData.available_premium_ports} / {stationData.num_premium_ports}
            </div>
          </div>
        </div>

        {stationData.last_maintenance_message && (
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <span className="text-gray-700 text-sm">🛠️ Last Maintenance: {stationData.last_maintenance_message}</span>
          </div>
        )}

        {session && user?.id && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Control Charger Ports</h2>
            {feedback && (
              <div className="mb-4 text-center text-green-700 font-semibold">{feedback}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {premiumPorts.map(([frontendPortNumber, mappedPortDetails]) => {
                const { stationDeviceId, internalPortNumber, label } = mappedPortDetails;
                const currentStatus = getPortDisplayStatus(frontendPortNumber);
                const key = `${stationDeviceId}_${internalPortNumber}`;
                const isActiveSession = activeSessions[key];

                return (
                  <div key={frontendPortNumber} className="bg-gray-50 rounded-lg p-6 flex flex-col items-center shadow">
                    <div className="text-lg font-semibold mb-2">{label}</div>
                    <div className={`mb-4 text-sm font-bold ${currentStatus.class}`}>
                      {currentStatus.display}
                    </div>

                    {currentStatus.display === 'Offline' ||
                    currentStatus.display === 'Device Offline' ||
                    currentStatus.display === 'Unknown State' ||
                    currentStatus.display === 'In Use (Other User)' ? (
                      <button
                        className="bg-gray-400 text-white font-bold py-2 px-6 rounded-lg cursor-not-allowed"
                        disabled
                      >
                        {currentStatus.buttonText}
                      </button>
                    ) : isActiveSession ? (
                      <button
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                        onClick={() => handleControlCommand(frontendPortNumber, 'deactivate')}
                        disabled={loadingPort === frontendPortNumber}
                      >
                        {loadingPort === frontendPortNumber ? 'Deactivating...' : currentStatus.buttonText}
                      </button>
                    ) : (
                      <button
                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                        onClick={() => handleControlCommand(frontendPortNumber, 'activate')}
                        disabled={loadingPort === frontendPortNumber}
                      >
                        {loadingPort === frontendPortNumber ? 'Activating...' : currentStatus.buttonText}
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

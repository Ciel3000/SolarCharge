import React, { useState } from 'react';

function ESP32ControlPage({ navigateTo, session, handleSignOut }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [ledState, setLedState] = useState('unknown'); // To track LED state on UI

  const handleToggleLed = async () => {
    setMessage('');
    setLoading(true);
    try {
      // In a real application, you'd send the actual station and port ID
      const payload = {
        action: 'toggle_led',
        stationId: 'your-station-id-here', // Replace with a real station ID from your DB
        portId: 'your-port-id-here', // Replace with a real port ID from your DB
      };

      // Make sure your backend server is running and accessible at this URL
      const response = await fetch('http://localhost:3001/api/esp32/command', { // Adjust URL if backend is elsewhere
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`, // Include user's session token for backend auth
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send command to ESP32.');
      }

      const result = await response.json();
      setMessage(result.message || 'Command sent to ESP32 successfully!');
      // Update LED state based on response or assume toggle
      setLedState(prev => prev === 'on' ? 'off' : 'on'); // Simple toggle assumption for UI
      console.log('ESP32 Command response:', result);

    } catch (error) {
      setMessage(`Error sending command: ${error.message}`);
      console.error('ESP32 Command Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-4">
          ESP32 Control Panel
        </h1>
        <p className="text-lg text-gray-700 mb-6">
          Send commands to your SolarCharge ESP32 devices.
        </p>

        {message && (
          <p className="mb-4 p-2 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300">
            {message}
          </p>
        )}

        <div className="space-y-4">
          <p className="text-xl font-semibold text-gray-800">
            LED State: <span className={`font-bold ${ledState === 'on' ? 'text-green-600' : ledState === 'off' ? 'text-red-600' : 'text-gray-500'}`}>{ledState.toUpperCase()}</span>
          </p>
          <button
            onClick={handleToggleLed}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 hover:scale-105 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Toggle Test LED'}
          </button>
        </div>

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => navigateTo('landing')}
            className="text-blue-600 hover:underline font-semibold"
          >
            Back to Home
          </button>
          <button
            onClick={handleSignOut}
            className="text-red-600 hover:underline font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default ESP32ControlPage;
// Main JavaScript file for the Solar Charge Project

// Global configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:5000/api',
  UPDATE_INTERVAL: 5000, // 5 seconds
  DEBUG_MODE: false
};

// Utility functions
function log(message) {
  if (CONFIG.DEBUG_MODE) {
    console.log(`[Solar Charge] ${message}`);
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// API functions
async function fetchSolarData() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/solar`);
    const data = await response.json();
    return data;
  } catch (error) {
    log(`Error fetching solar data: ${error.message}`);
    return null;
  }
}

async function fetchChargingData() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/charging`);
    const data = await response.json();
    return data;
  } catch (error) {
    log(`Error fetching charging data: ${error.message}`);
    return null;
  }
}

// Initialize application
function init() {
  log('Initializing Solar Charge Project...');
  
  // Set up periodic data updates
  setInterval(async () => {
    const solarData = await fetchSolarData();
    const chargingData = await fetchChargingData();
    
    if (solarData) {
      updateSolarDisplay(solarData);
    }
    
    if (chargingData) {
      updateChargingDisplay(chargingData);
    }
  }, CONFIG.UPDATE_INTERVAL);
  
  log('Application initialized successfully');
}

// Update display functions
function updateSolarDisplay(data) {
  // Update solar panel data display
  const solarElement = document.getElementById('solar-data');
  if (solarElement && data.data) {
    const latest = data.data[0];
    solarElement.innerHTML = `
      <h3>Solar Panel Status</h3>
      <p>Voltage: ${latest.solarVoltage}V</p>
      <p>Current: ${latest.solarCurrent}A</p>
      <p>Battery: ${latest.batteryVoltage}V</p>
      <p>Status: ${latest.chargeStatus ? 'Charging' : 'Idle'}</p>
    `;
  }
}

function updateChargingDisplay(data) {
  // Update charging station data display
  const chargingElement = document.getElementById('charging-data');
  if (chargingElement && data.data) {
    const activeSessions = data.data.filter(session => session.status === 'charging');
    chargingElement.innerHTML = `
      <h3>Charging Stations</h3>
      <p>Active Sessions: ${activeSessions.length}</p>
      <p>Total Stations: ${data.data.length}</p>
    `;
  }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 
# Solar Charge Project

A full-stack solar charging station management system with a React frontend, Node.js/Express backend, and ESP32 firmware.

## Project Structure

- `frontend/` - React web application
- `backend-server/` - Node.js/Express API server with MQTT broker
- `firmware/` - ESP32 Arduino firmware for charging stations

## Prerequisites

- Node.js >= 16
- MySQL database
- Arduino IDE (for firmware)

## Getting Started

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend-server
npm install
cp env.example .env
# Configure .env with your database and MQTT settings
npm run dev
```

### Firmware

Open the `.ino` files in `firmware/esp32-solar-charge/` with the Arduino IDE and upload to your ESP32 devices.

## Tech Stack

- **Frontend:** React, Tailwind CSS, React Router, Leaflet, PayPal SDK
- **Backend:** Express, MySQL, MQTT (Aedes), JWT auth, PayPal SDK, node-cron
- **Firmware:** Arduino/ESP32

## Available Scripts

### Frontend
- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Launches the test runner

### Backend
- `npm run dev` - Runs the server with nodemon
- `npm start` - Runs the server in production

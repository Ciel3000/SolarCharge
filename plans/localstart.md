# Local Start Plan

## Application Overview
This is a full-stack Solar Charging application with:
- **Frontend**: React app (port 3000) - displays charging stations on a map
- **Backend**: Node.js/Express API server (port 3001) - handles API requests and MQTT communication with ESP32 devices
- **Database**: Supabase (PostgreSQL)

## Prerequisites
- Node.js installed

## Steps to Start Locally

### 1. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 2. Install Backend Dependencies
```bash
cd backend-server
npm install
```

### 3. Configure Backend Environment
Copy `env.example` to `.env` and configure:
```bash
cp backend-server/env.example backend-server/.env
```
Edit `.env` with your:
- PostgreSQL credentials (DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT)
- EMQX Cloud credentials (for MQTT)
- PORT=3001
- CORS_ORIGIN=http://localhost:3000

### 4. Start Backend Server
```bash
cd backend-server
npm run dev
```
Server runs on http://localhost:3001

### 5. Start Frontend
```bash
cd frontend
npm start
```
Frontend runs on http://localhost:3000

## Verification
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
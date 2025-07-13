# Solar Charge Project - Backend

This is the backend API for the Solar Charge Project, built with Node.js, Express, and MongoDB.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   Copy `.env.example` to `.env` and configure your environment variables.

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Start the production server:
   ```bash
   npm start
   ```

## Project Structure

- `src/controllers/` - Request handlers
- `src/models/` - Database models
- `src/routes/` - API route definitions
- `src/services/` - Business logic
- `src/utils/` - Utility functions
- `src/config/` - Configuration files

## API Endpoints

- `GET /api/solar` - Get solar panel data
- `POST /api/solar` - Create solar panel reading
- `GET /api/charging` - Get charging station data
- `POST /api/charging` - Create charging session

## Database

The application uses MongoDB as the database. Make sure MongoDB is running locally or update the connection string in your `.env` file. 
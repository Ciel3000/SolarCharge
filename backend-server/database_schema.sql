-- Database schema for SolarCharge backend
-- Run this in your PostgreSQL database

-- Table for storing consumption data from charger devices
CREATE TABLE IF NOT EXISTS consumption_data (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    consumption_watts DECIMAL(10,2) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing device status logs
CREATE TABLE IF NOT EXISTS device_status_logs (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL,
    status_message TEXT,
    charger_state VARCHAR(20),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for current device status (latest status for each device)
CREATE TABLE IF NOT EXISTS current_device_status (
    device_id VARCHAR(50) PRIMARY KEY,
    status_message TEXT,
    charger_state VARCHAR(20),
    last_update TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_consumption_data_device_id ON consumption_data(device_id);
CREATE INDEX IF NOT EXISTS idx_consumption_data_timestamp ON consumption_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_device_status_logs_device_id ON device_status_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_device_status_logs_timestamp ON device_status_logs(timestamp);

-- Create a trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_current_device_status_updated_at 
    BEFORE UPDATE ON current_device_status 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 
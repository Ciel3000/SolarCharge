-- MySQL Schema for Solar Charge Project
-- Converted from PostgreSQL schema
-- Run this in XAMPP MySQL (phpMyAdmin or command line)

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS solar_charge
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE solar_charge;

-- Users table (local auth)
CREATE TABLE users (
  user_id CHAR(36) NOT NULL,
  fname VARCHAR(100),
  lname VARCHAR(100),
  contact_number VARCHAR(20),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  email VARCHAR(255) UNIQUE NOT NULL,
  last_login DATETIME(3),
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  reset_token VARCHAR(255),
  reset_token_expires DATETIME,
  PRIMARY KEY (user_id),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Charging stations
CREATE TABLE charging_station (
  station_id CHAR(36) NOT NULL DEFAULT (UUID()),
  station_name VARCHAR(255) NOT NULL,
  location_description TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  solar_panel_wattage INT,
  battery_capacity_mah DECIMAL(15,2),
  num_free_ports INT DEFAULT 0,
  num_premium_ports INT DEFAULT 0,
  last_maintenance_id CHAR(36),
  is_active BOOLEAN DEFAULT TRUE,
  current_battery_level DECIMAL(15,2),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_maintenance_date DATETIME(3),
  price_per_mah DECIMAL(10,4) DEFAULT 0.25,
  device_mqtt_id VARCHAR(255),
  PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Charging ports
CREATE TABLE charging_port (
  port_id CHAR(36) NOT NULL DEFAULT (UUID()),
  station_id CHAR(36) NOT NULL,
  port_number INT NOT NULL,
  port_type VARCHAR(50) NOT NULL,
  is_occupied BOOLEAN DEFAULT FALSE,
  current_status VARCHAR(50) NOT NULL DEFAULT 'available',
  voltage DECIMAL(10,2),
  amperage DECIMAL(10,2),
  last_status_update DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  is_publicly_visible BOOLEAN DEFAULT TRUE,
  esp32_device_id VARCHAR(255) UNIQUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  device_mqtt_id VARCHAR(255),
  port_number_in_device INT,
  is_premium BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (port_id),
  INDEX idx_station_id (station_id),
  INDEX idx_esp32_device_id (esp32_device_id),
  CONSTRAINT chk_port_status CHECK (current_status IN ('available', 'charging_free', 'charging_premium', 'maintenance', 'offline', 'occupied', 'fault'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subscription plans
CREATE TABLE subscription_plans (
  plan_id CHAR(36) NOT NULL DEFAULT (UUID()),
  plan_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  daily_mah_limit DECIMAL(15,2) NOT NULL,
  max_session_duration_hours DECIMAL(10,2),
  fast_charging_access BOOLEAN DEFAULT FALSE,
  priority_access BOOLEAN DEFAULT FALSE,
  cooldown_percentage DECIMAL(10,2),
  cooldown_time_hour DECIMAL(10,2),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  duration_type VARCHAR(50) NOT NULL DEFAULT 'monthly',
  duration_value INT NOT NULL,
  paypal_link TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (plan_id),
  CONSTRAINT chk_duration_type CHECK (duration_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  CONSTRAINT chk_duration_value CHECK (duration_value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User subscriptions
CREATE TABLE user_subscription (
  user_subscription_id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  start_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_date DATETIME(3) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  current_daily_mah_consumed DECIMAL(15,2) DEFAULT 0.0,
  last_quota_reset DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  payment_references TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  borrowed_mah_today DECIMAL(15,2) DEFAULT 0.0,
  borrowed_mah_pending DECIMAL(15,2) DEFAULT 0.0,
  last_borrow_date DATE,
  PRIMARY KEY (user_subscription_id),
  INDEX idx_user_id (user_id),
  INDEX idx_plan_id (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Charging sessions
CREATE TABLE charging_session (
  session_id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  port_id CHAR(36) NOT NULL,
  station_id CHAR(36) NOT NULL,
  start_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME(3),
  energy_consumed_kwh DECIMAL(10,4) DEFAULT 0.0,
  is_premium BOOLEAN NOT NULL,
  session_status VARCHAR(50) NOT NULL DEFAULT 'active',
  initial_battery_level DECIMAL(10,2),
  final_battery_level DECIMAL(10,2),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  energy_consumed_mah REAL DEFAULT 0.0,
  last_status_update DATETIME(3),
  total_mah_consumed DECIMAL(15,2) DEFAULT 0.0,
  cost DECIMAL(10,2) DEFAULT 0.0,
  initial_total_mah DECIMAL(15,2) DEFAULT 0,
  PRIMARY KEY (session_id),
  INDEX idx_user_id (user_id),
  INDEX idx_port_id (port_id),
  INDEX idx_station_id (station_id),
  INDEX idx_start_time (start_time),
  CONSTRAINT chk_session_status CHECK (session_status IN ('active', 'completed', 'cancelled', 'fault'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consumption data
CREATE TABLE consumption_data (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id CHAR(36),
  device_id VARCHAR(255) NOT NULL,
  consumption_watts REAL,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  charger_state VARCHAR(255),
  port_number INT,
  INDEX idx_session_id (session_id),
  INDEX idx_device_id (device_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current device status
CREATE TABLE current_device_status (
  device_id VARCHAR(255) NOT NULL,
  status_message VARCHAR(255),
  charger_state VARCHAR(255),
  last_update DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  port_id CHAR(36) NOT NULL,
  PRIMARY KEY (device_id, port_id),
  INDEX idx_port_id (port_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Device status logs
CREATE TABLE device_status_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  status_message VARCHAR(255),
  charger_state VARCHAR(255),
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  port_id CHAR(36),
  INDEX idx_device_id (device_id),
  INDEX idx_port_id (port_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
CREATE TABLE notification (
  notification_id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  notification_context TEXT,
  notification_content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Station maintenance
CREATE TABLE station_maintenance (
  maintenance_id CHAR(36) NOT NULL DEFAULT (UUID()),
  station_id CHAR(36) NOT NULL,
  performed_by VARCHAR(255),
  maintenance_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  cost DECIMAL(10,2),
  next_scheduled_date DATE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (maintenance_id),
  INDEX idx_station_id (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System logs
CREATE TABLE system_logs (
  log_id CHAR(36) NOT NULL DEFAULT (UUID()),
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  log_type VARCHAR(50) NOT NULL,
  source VARCHAR(255),
  message TEXT NOT NULL,
  user_id CHAR(36),
  PRIMARY KEY (log_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_log_type (log_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User devices
CREATE TABLE user_devices (
  device_id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  device_type VARCHAR(255) NOT NULL,
  device_name VARCHAR(255),
  device_model VARCHAR(255),
  battery_capacity_mah DECIMAL(15,2),
  current_battery_level DECIMAL(10,2),
  is_charging BOOLEAN DEFAULT FALSE,
  last_updated DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PayPal orders
CREATE TABLE paypal_orders (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  order_id VARCHAR(255) NOT NULL UNIQUE,
  payment_type VARCHAR(255) NOT NULL,
  plan_id CHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'PHP',
  status VARCHAR(255) NOT NULL,
  paypal_capture_id VARCHAR(255),
  expires_at DATETIME(3),
  idempotency_key VARCHAR(255) UNIQUE,
  error_message TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id (user_id),
  INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payments
CREATE TABLE payments (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  paypal_order_id VARCHAR(255) NOT NULL,
  payment_capture_id VARCHAR(255),
  payment_type VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'PHP',
  status VARCHAR(255) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id (user_id),
  INDEX idx_paypal_order_id (paypal_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment logs
CREATE TABLE payment_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36),
  action VARCHAR(255) NOT NULL,
  payload JSON,
  response JSON,
  status VARCHAR(255),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhooks processed
CREATE TABLE webhooks_processed (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(255) NOT NULL,
  processed_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User usage
CREATE TABLE user_usage (
  user_id CHAR(36) NOT NULL,
  total_consumed_mah INT NOT NULL DEFAULT 0,
  last_reset_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Public station view (replaces PostgreSQL view)
CREATE OR REPLACE VIEW public_station_view AS
SELECT
  s.station_id,
  s.station_name,
  s.location_description,
  s.latitude,
  s.longitude,
  s.is_active,
  s.current_battery_level,
  s.price_per_mah,
  s.num_free_ports,
  s.num_premium_ports,
  s.device_mqtt_id,
  COUNT(p.port_id) as total_ports,
  SUM(CASE WHEN p.current_status = 'available' THEN 1 ELSE 0 END) as available_ports,
  SUM(CASE WHEN p.current_status = 'available' AND p.is_premium = true THEN 1 ELSE 0 END) as available_premium_ports
FROM charging_station s
LEFT JOIN charging_port p ON s.station_id = p.station_id
WHERE s.is_active = true
GROUP BY s.station_id, s.device_mqtt_id;

-- Insert default admin user (password: admin123)
-- Password hash for 'admin123' using bcrypt with 10 rounds
INSERT INTO users (user_id, email, password_hash, fname, lname, is_admin, email_verified)
VALUES (
  UUID(),
  'admin@solarcharge.local',
  '$2b$10$rQ7H8p9QZ8xY7wE6vT5uUeO1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4',
  'Admin',
  'User',
  TRUE,
  TRUE
) ON DUPLICATE KEY UPDATE email = email;

-- Insert default subscription plans
INSERT INTO subscription_plans (plan_id, plan_name, description, price, daily_mah_limit, max_session_duration_hours, fast_charging_access, priority_access, cooldown_percentage, cooldown_time_hour, duration_type, duration_value, is_active)
VALUES
  (UUID(), 'Free Trial', 'Try our service for free with limited usage', 0.00, 500, 1, FALSE, FALSE, 0, 0, 'daily', 1, TRUE),
  (UUID(), 'Basic Daily', 'Basic daily charging plan', 50.00, 2000, 2, FALSE, FALSE, 0, 0, 'daily', 1, TRUE),
  (UUID(), 'Basic Weekly', 'Basic weekly charging plan', 300.00, 14000, 2, FALSE, FALSE, 0, 0, 'weekly', 1, TRUE),
  (UUID(), 'Basic Monthly', 'Basic monthly charging plan', 1000.00, 60000, 2, FALSE, FALSE, 0, 0, 'monthly', 1, TRUE),
  (UUID(), 'Premium Daily', 'Premium daily charging with fast access', 100.00, 5000, 4, TRUE, TRUE, 0, 0, 'daily', 1, TRUE),
  (UUID(), 'Premium Weekly', 'Premium weekly charging with fast access', 700.00, 35000, 4, TRUE, TRUE, 0, 0, 'weekly', 1, TRUE),
  (UUID(), 'Premium Monthly', 'Premium monthly charging with fast access', 2500.00, 150000, 4, TRUE, TRUE, 0, 0, 'monthly', 1, TRUE)
ON DUPLICATE KEY UPDATE plan_name = VALUES(plan_name);

#ifndef CONFIG_H
#define CONFIG_H

// WiFi Configuration
#define WIFI_SSID "your_wifi_ssid"
#define WIFI_PASSWORD "your_wifi_password"

// MQTT Configuration - EMQX Cloud
#define MQTT_BROKER "zfd47f32.ala.asia-southeast1.emqxsl.com"  // Your EMQX Cloud broker
#define MQTT_PORT 8883
#define MQTT_USERNAME "your_mqtt_username"
#define MQTT_PASSWORD "your_mqtt_password"
#define MQTT_CLIENT_ID "ESP32_SolarCharge_001"

// MQTT Topics
#define MQTT_TOPIC_STATUS "station/001/status"
#define MQTT_TOPIC_CONTROL "station/001/control"
#define MQTT_TOPIC_SENSOR_DATA "station/001/sensor"

// Sensor Configuration
#define SOLAR_VOLTAGE_PIN 34
#define SOLAR_CURRENT_PIN 35
#define BATTERY_VOLTAGE_PIN 32
#define CHARGE_STATUS_PIN 33

// Relay Control Pins
#define RELAY_1_PIN 26
#define RELAY_2_PIN 27

// Voltage Divider Ratios (adjust based on your hardware)
#define SOLAR_VOLTAGE_RATIO 11.0  // 10k + 1k voltage divider
#define BATTERY_VOLTAGE_RATIO 11.0
#define CURRENT_SENSOR_RATIO 0.185  // ACS712 30A sensor

// Thresholds
#define MIN_SOLAR_VOLTAGE 12.0
#define MAX_SOLAR_VOLTAGE 50.0
#define MIN_BATTERY_VOLTAGE 10.0
#define MAX_BATTERY_VOLTAGE 14.4

// Timing Configuration
#define SENSOR_READ_INTERVAL 5000  // 5 seconds
#define MQTT_KEEPALIVE 60
#define WIFI_TIMEOUT 10000

// API Configuration (fallback)
#define API_BASE_URL "http://your-backend-url.com/api/sensor-data"

#endif // CONFIG_H 
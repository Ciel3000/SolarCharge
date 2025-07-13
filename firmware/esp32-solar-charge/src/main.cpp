#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include "config.h"

// Global objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
HTTPClient http;

// Pin definitions
const int SOLAR_VOLTAGE_PIN = SOLAR_VOLTAGE_PIN;
const int SOLAR_CURRENT_PIN = SOLAR_CURRENT_PIN;
const int BATTERY_VOLTAGE_PIN = BATTERY_VOLTAGE_PIN;
const int CHARGE_STATUS_PIN = CHARGE_STATUS_PIN;
const int RELAY_1_PIN = RELAY_1_PIN;
const int RELAY_2_PIN = RELAY_2_PIN;

// State variables
bool relay1State = false;
bool relay2State = false;
unsigned long lastSensorRead = 0;
unsigned long lastMqttPublish = 0;

// Function prototypes
void setupWiFi();
void setupMQTT();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void readSensors();
void publishSensorData();
void handleRelayControl(const String& message);
void sendDataToAPI(float solarVoltage, float solarCurrent, float batteryVoltage, int chargeStatus);

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 Solar Charge Controller Starting...");
  
  // Initialize pins
  pinMode(SOLAR_VOLTAGE_PIN, INPUT);
  pinMode(SOLAR_CURRENT_PIN, INPUT);
  pinMode(BATTERY_VOLTAGE_PIN, INPUT);
  pinMode(CHARGE_STATUS_PIN, INPUT);
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  
  // Initialize relay states
  digitalWrite(RELAY_1_PIN, LOW);
  digitalWrite(RELAY_2_PIN, LOW);
  
  // Setup WiFi
  setupWiFi();
  
  // Setup MQTT
  setupMQTT();
  
  Serial.println("Setup complete!");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Read and publish sensor data periodically
  if (millis() - lastSensorRead >= SENSOR_READ_INTERVAL) {
    readSensors();
    lastSensorRead = millis();
  }
  
  // Publish MQTT data every 10 seconds
  if (millis() - lastMqttPublish >= 10000) {
    publishSensorData();
    lastMqttPublish = millis();
  }
}

void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(MQTT_KEEPALIVE);
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("connected");
      
      // Subscribe to control topics
      mqttClient.subscribe(MQTT_TOPIC_CONTROL);
      Serial.println("Subscribed to control topic");
      
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message received on topic: ");
  Serial.println(topic);
  
  // Convert payload to string
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("Message: ");
  Serial.println(message);
  
  // Handle relay control commands
  if (String(topic) == MQTT_TOPIC_CONTROL) {
    handleRelayControl(message);
  }
}

void handleRelayControl(const String& message) {
  if (message == "relay1_on") {
    digitalWrite(RELAY_1_PIN, HIGH);
    relay1State = true;
    Serial.println("Relay 1 ON");
  } else if (message == "relay1_off") {
    digitalWrite(RELAY_1_PIN, LOW);
    relay1State = false;
    Serial.println("Relay 1 OFF");
  } else if (message == "relay2_on") {
    digitalWrite(RELAY_2_PIN, HIGH);
    relay2State = true;
    Serial.println("Relay 2 ON");
  } else if (message == "relay2_off") {
    digitalWrite(RELAY_2_PIN, LOW);
    relay2State = false;
    Serial.println("Relay 2 OFF");
  }
  
  // Publish status update
  publishStatus();
}

void readSensors() {
  // Read analog values
  int solarVoltageRaw = analogRead(SOLAR_VOLTAGE_PIN);
  int solarCurrentRaw = analogRead(SOLAR_CURRENT_PIN);
  int batteryVoltageRaw = analogRead(BATTERY_VOLTAGE_PIN);
  int chargeStatus = digitalRead(CHARGE_STATUS_PIN);
  
  // Convert to actual values
  float solarVoltage = (solarVoltageRaw * 3.3 / 4095.0) * SOLAR_VOLTAGE_RATIO;
  float solarCurrent = (solarCurrentRaw * 3.3 / 4095.0) / CURRENT_SENSOR_RATIO;
  float batteryVoltage = (batteryVoltageRaw * 3.3 / 4095.0) * BATTERY_VOLTAGE_RATIO;
  
  // Print sensor readings
  Serial.println("=== Sensor Readings ===");
  Serial.printf("Solar Voltage: %.2fV\n", solarVoltage);
  Serial.printf("Solar Current: %.2fA\n", solarCurrent);
  Serial.printf("Battery Voltage: %.2fV\n", batteryVoltage);
  Serial.printf("Charge Status: %d\n", chargeStatus);
  Serial.printf("Relay 1: %s\n", relay1State ? "ON" : "OFF");
  Serial.printf("Relay 2: %s\n", relay2State ? "ON" : "OFF");
  Serial.println("=====================");
  
  // Send data to API as fallback
  sendDataToAPI(solarVoltage, solarCurrent, batteryVoltage, chargeStatus);
}

void publishSensorData() {
  if (!mqttClient.connected()) return;
  
  // Read current sensor values
  int solarVoltageRaw = analogRead(SOLAR_VOLTAGE_PIN);
  int solarCurrentRaw = analogRead(SOLAR_CURRENT_PIN);
  int batteryVoltageRaw = analogRead(BATTERY_VOLTAGE_PIN);
  int chargeStatus = digitalRead(CHARGE_STATUS_PIN);
  
  float solarVoltage = (solarVoltageRaw * 3.3 / 4095.0) * SOLAR_VOLTAGE_RATIO;
  float solarCurrent = (solarCurrentRaw * 3.3 / 4095.0) / CURRENT_SENSOR_RATIO;
  float batteryVoltage = (batteryVoltageRaw * 3.3 / 4095.0) * BATTERY_VOLTAGE_RATIO;
  
  // Create JSON payload
  StaticJsonDocument<200> doc;
  doc["solarVoltage"] = solarVoltage;
  doc["solarCurrent"] = solarCurrent;
  doc["batteryVoltage"] = batteryVoltage;
  doc["chargeStatus"] = chargeStatus;
  doc["relay1State"] = relay1State;
  doc["relay2State"] = relay2State;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Publish to MQTT
  if (mqttClient.publish(MQTT_TOPIC_SENSOR_DATA, jsonString.c_str())) {
    Serial.println("Sensor data published to MQTT");
  } else {
    Serial.println("Failed to publish sensor data to MQTT");
  }
}

void publishStatus() {
  if (!mqttClient.connected()) return;
  
  StaticJsonDocument<100> doc;
  doc["relay1"] = relay1State;
  doc["relay2"] = relay2State;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  if (mqttClient.publish(MQTT_TOPIC_STATUS, jsonString.c_str())) {
    Serial.println("Status published to MQTT");
  } else {
    Serial.println("Failed to publish status to MQTT");
  }
}

void sendDataToAPI(float solarVoltage, float solarCurrent, float batteryVoltage, int chargeStatus) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  http.begin(API_BASE_URL);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<200> doc;
  doc["solarVoltage"] = solarVoltage;
  doc["solarCurrent"] = solarCurrent;
  doc["batteryVoltage"] = batteryVoltage;
  doc["chargeStatus"] = chargeStatus;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.println("Data sent to API successfully");
  } else {
    Serial.println("Error sending data to API");
  }
  
  http.end();
} 
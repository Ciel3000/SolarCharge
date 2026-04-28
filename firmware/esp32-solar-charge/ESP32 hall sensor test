/*
 * ESP32 ACS712 Hall Effect Sensor Test
 * Tests two ACS712 current sensors (30A version) on pins 34 and 35
 *
 * Features:
 * - 12-bit ADC resolution with 11dB attenuation
 * - Converts raw ADC to current in Amps (sensitivity: 0.066 V/A)
 * - Serial monitor output for both sensors
 * - Calibration function to zero sensors (set quiescent voltage)
 * - 1-second interval between readings
 */

// ACS712 Pin Definitions
const int ACS712_PIN_1 = 34;  // First sensor ADC pin
const int ACS712_PIN_2 = 33;  // Second sensor ADC pin

// ACS712 Parameters (30A version)
const float ACS712_SENSITIVITY = 0.066;  // 66 mV/A
const float ACS712_SUPPLY_VOLTAGE = 5.0;  // ACS712 supply voltage (V)
const float ACS712_QUIESCENT_VOLTAGE = ACS712_SUPPLY_VOLTAGE / 2.0;  // 2.5V at no current
const int ADC_RESOLUTION = 12;  // 12-bit ADC (0-4095)
const float ADC_MAX_VALUE = 4095.0;

// Calibration offsets (will be set during calibration)
float zeroOffset1 = 0.0;
float zeroOffset2 = 0.0;

// Calibration duration (milliseconds)
const unsigned long CALIBRATION_TIME = 3000;

// Reading interval (1 second)
const unsigned long READING_INTERVAL = 1000;

void setup() {
  // Initialize Serial communication
  Serial.begin(115200);
  delay(1000);  // Wait for Serial to initialize

  Serial.println("\n========================================");
  Serial.println("  ESP32 ACS712 Dual Sensor Test");
  Serial.println("========================================");
  Serial.println();

  // Configure ADC for both sensors
  configureADC();

  // Perform calibration
  calibrateSensors();

  Serial.println();
  Serial.println("Calibration complete. Starting readings...");
  Serial.println("========================================");
  Serial.println();
}

void loop() {
  // Read raw ADC values
  int rawValue1 = readSensorRaw(ACS712_PIN_1);
  int rawValue2 = readSensorRaw(ACS712_PIN_2);

  // Convert to current (Amps)
  float current1 = convertToCurrent(rawValue1, zeroOffset1);
  float current2 = convertToCurrent(rawValue2, zeroOffset2);

  // Display results
  Serial.println("Sensor 1 (Pin 34) | Sensor 2 (Pin 35)");
  Serial.println("-----------------|------------------");
  Serial.print("Raw ADC: ");
  Serial.print(rawValue1);
  Serial.print("       | Raw ADC: ");
  Serial.println(rawValue2);

  Serial.print("Current: ");
  Serial.print(current1, 3);
  Serial.print(" A      | Current: ");
  Serial.print(current2, 3);
  Serial.println(" A");
  Serial.println();

  // Wait for next reading
  delay(READING_INTERVAL);
}

/**
 * Configure ADC with 12-bit resolution and 11dB attenuation
 */
void configureADC() {
  // Set ADC resolution (12-bit = 0-4095)
  analogReadResolution(ADC_RESOLUTION);

  // Set attenuation to 11dB (allows full 0-3.3V range)
  analogSetAttenuation(ADC_11db);

  Serial.println("ADC Configuration:");
  Serial.println("  Resolution: 12-bit (0-4095)");
  Serial.println("  Attenuation: 11dB");
  Serial.println("  Voltage Range: 0-3.3V");
  Serial.println("  ACS712 Supply: 5.0V (quiescent ~2.5V)");
  Serial.println();
}

/**
 * Read raw ADC value from sensor pin
 */
int readSensorRaw(int pin) {
  return analogRead(pin);
}

/**
 * Convert raw ADC value to current in Amps
 *
 * Formula:
 *   Voltage = (rawADC / ADC_MAX_VALUE) * 3.3  (ESP32 ADC reference)
 *   Current = (Voltage - zeroOffsetVoltage) / ACS712_SENSITIVITY
 */
float convertToCurrent(int rawADC, float zeroOffset) {
  // Convert raw ADC to voltage (ESP32 ADC reference is 3.3V)
  float voltage = (rawADC / ADC_MAX_VALUE) * 3.3;

  // Calculate current using calibrated zero offset
  float current = (voltage - zeroOffset) / ACS712_SENSITIVITY;

  return current;
}

/**
 * Calibrate both sensors by averaging readings with no current
 * Ensure NO current flows through sensors during calibration
 */
void calibrateSensors() {
  Serial.println("Starting calibration...");
  Serial.println("Ensure NO current flows through sensors during calibration.");
  Serial.println("Calibrating for " + String(CALIBRATION_TIME / 1000) + " seconds...");
  Serial.println();

  delay(2000);  // Give user time to ensure no current

  // Variables to accumulate readings
  long sum1 = 0;
  long sum2 = 0;
  int samples = 0;

  unsigned long startTime = millis();
  while (millis() - startTime < CALIBRATION_TIME) {
    sum1 += readSensorRaw(ACS712_PIN_1);
    sum2 += readSensorRaw(ACS712_PIN_2);
    samples++;
    delay(10);  // Small delay between samples
  }

  // Calculate average raw ADC values
  float avgRaw1 = (float)sum1 / samples;
  float avgRaw2 = (float)sum2 / samples;

  // Convert to voltage for zero offset
  zeroOffset1 = (avgRaw1 / ADC_MAX_VALUE) * 3.3;
  zeroOffset2 = (avgRaw2 / ADC_MAX_VALUE) * 3.3;

  Serial.println("Calibration Results:");
  Serial.println("---------------------");
  Serial.print("Sensor 1 - Avg Raw ADC: ");
  Serial.print(avgRaw1, 1);
  Serial.print(" | Zero Offset Voltage: ");
  Serial.print(zeroOffset1, 3);
  Serial.println(" V");

  Serial.print("Sensor 2 - Avg Raw ADC: ");
  Serial.print(avgRaw2, 1);
  Serial.print(" | Zero Offset Voltage: ");
  Serial.print(zeroOffset2, 3);
  Serial.println(" V");
  Serial.println();

  // Verify offset is near expected quiescent voltage (2.5V for 5V supply)
  float expectedOffset = ACS712_QUIESCENT_VOLTAGE;
  if (abs(zeroOffset1 - expectedOffset) > 0.3 || abs(zeroOffset2 - expectedOffset) > 0.3) {
    Serial.println("WARNING: Zero offset deviates significantly from expected " + String(expectedOffset, 2) + "V.");
    Serial.println("         Expected ~2.5V for 5V supply. Check sensor power and connections.");
    Serial.println();
  }
}

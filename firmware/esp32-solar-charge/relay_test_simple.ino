/*
 * Simple ESP32 Relay Test
 * This code tests relay modules by toggling them on and off
 * Connect relay control pins to GPIO pins defined below
 * Relays are typically active LOW (LOW = ON, HIGH = OFF)
 */

// Relay pin definitions - change these to match your wiring
const int RELAY_PIN_1 = 2;   // GPIO2 - Built-in LED on many ESP32 boards
const int RELAY_PIN_2 = 4;   // GPIO4
const int RELAY_PIN_3 = 5;   // GPIO5
const int RELAY_PIN_4 = 12;  // GPIO12

// Timing settings (milliseconds)
const int RELAY_ON_TIME = 2000;   // How long relay stays ON
const int RELAY_OFF_TIME = 1000;  // How long relay stays OFF between cycles

// Test mode: 1 = test all relays sequentially, 2 = test single relay repeatedly
const int TEST_MODE = 1;
const int SINGLE_RELAY_PIN = RELAY_PIN_1;  // Which relay to test in mode 2

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000); // Wait for serial monitor to initialize
  Serial.println("\n=== ESP32 Relay Test Started ===");

  // Initialize relay pins as outputs
  pinMode(RELAY_PIN_1, OUTPUT);
  pinMode(RELAY_PIN_2, OUTPUT);
  pinMode(RELAY_PIN_3, OUTPUT);
  pinMode(RELAY_PIN_4, OUTPUT);

  // Set all relays to OFF state initially (HIGH for active-low relays)
  digitalWrite(RELAY_PIN_1, HIGH);
  digitalWrite(RELAY_PIN_2, HIGH);
  digitalWrite(RELAY_PIN_3, HIGH);
  digitalWrite(RELAY_PIN_4, HIGH);

  Serial.println("All relays initialized to OFF state");
  Serial.println("Relay 1 -> GPIO" + String(RELAY_PIN_1));
  Serial.println("Relay 2 -> GPIO" + String(RELAY_PIN_2));
  Serial.println("Relay 3 -> GPIO" + String(RELAY_PIN_3));
  Serial.println("Relay 4 -> GPIO" + String(RELAY_PIN_4));
  Serial.println("================================");
  delay(2000);
}

void loop() {
  if (TEST_MODE == 1) {
    testAllRelaysSequentially();
  } else if (TEST_MODE == 2) {
    testSingleRelayRepeatedly();
  }
}

// Test all relays one after another
void testAllRelaysSequentially() {
  static int currentRelay = 0;
  static unsigned long lastChange = 0;
  static bool relayState = false;

  unsigned long currentMillis = millis();

  // Check if it's time to toggle relay
  if (currentMillis - lastChange >= (relayState ? RELAY_ON_TIME : RELAY_OFF_TIME)) {
    lastChange = currentMillis;
    relayState = !relayState;

    // Turn off all relays first
    digitalWrite(RELAY_PIN_1, HIGH);
    digitalWrite(RELAY_PIN_2, HIGH);
    digitalWrite(RELAY_PIN_3, HIGH);
    digitalWrite(RELAY_PIN_4, HIGH);

    if (relayState) {
      // Turn on current relay
      switch (currentRelay) {
        case 0:
          digitalWrite(RELAY_PIN_1, LOW);
          Serial.println("[ON ] Relay 1 (GPIO" + String(RELAY_PIN_1) + ")");
          break;
        case 1:
          digitalWrite(RELAY_PIN_2, LOW);
          Serial.println("[ON ] Relay 2 (GPIO" + String(RELAY_PIN_2) + ")");
          break;
        case 2:
          digitalWrite(RELAY_PIN_3, LOW);
          Serial.println("[ON ] Relay 3 (GPIO" + String(RELAY_PIN_3) + ")");
          break;
        case 3:
          digitalWrite(RELAY_PIN_4, LOW);
          Serial.println("[ON ] Relay 4 (GPIO" + String(RELAY_PIN_4) + ")");
          break;
      }
      currentRelay = (currentRelay + 1) % 4;  // Move to next relay
    } else {
      Serial.println("[OFF] All relays off");
    }
  }
}

// Test a single relay repeatedly
void testSingleRelayRepeatedly() {
  static bool relayState = false;
  static unsigned long lastChange = 0;

  unsigned long currentMillis = millis();

  if (currentMillis - lastChange >= (relayState ? RELAY_ON_TIME : RELAY_OFF_TIME)) {
    lastChange = currentMillis;
    relayState = !relayState;

    digitalWrite(SINGLE_RELAY_PIN, relayState ? LOW : HIGH);

    if (relayState) {
      Serial.println("[ON ] Single relay (GPIO" + String(SINGLE_RELAY_PIN) + ")");
    } else {
      Serial.println("[OFF] Single relay (GPIO" + String(SINGLE_RELAY_PIN) + ")");
    }
  }
}

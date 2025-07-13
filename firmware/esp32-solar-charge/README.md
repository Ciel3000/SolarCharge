# ESP32 Solar Charge Controller Firmware

This firmware runs on an ESP32 microcontroller to monitor and control the solar charging system.

## Features

- Real-time solar panel voltage and current monitoring
- Battery voltage monitoring
- Charge status detection
- WiFi connectivity for data transmission
- REST API integration

## Hardware Requirements

- ESP32 development board
- Voltage dividers for solar and battery voltage measurement
- Current sensor (ACS712 or similar)
- Relay module for charge control
- Power supply for ESP32

## Pin Connections

- GPIO 34: Solar panel voltage (analog input)
- GPIO 35: Solar panel current (analog input)
- GPIO 32: Battery voltage (analog input)
- GPIO 33: Charge status (digital input)

## Setup Instructions

1. Install PlatformIO IDE or PlatformIO Core
2. Clone this repository
3. Update WiFi credentials in `src/config.h`
4. Update API endpoint in `src/config.h`
5. Build and upload to ESP32

## Configuration

Edit `src/config.h` to configure:
- WiFi credentials
- API endpoints
- Sensor calibration values
- Voltage thresholds

## Building and Uploading

```bash
# Build the project
pio run

# Upload to ESP32
pio run --target upload

# Monitor serial output
pio device monitor
``` 
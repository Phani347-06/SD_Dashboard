#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEBeacon.h>
#include <WiFi.h>
#include <HTTPClient.h>

// WiFi Configuration (Update these with your network details)
#define WIFI_SSID "IRON MAN"
#define WIFI_PASSWORD "12345678"

// Backend Server Configuration
#define SERVER_URL "http://your-domain.com/api/esp32/status"  // Update with your backend URL
#define HEARTBEAT_INTERVAL 30000  // Send status every 30 seconds

// Unique iBeacon UUID for Smart Lab Attendance System
#define IBEACON_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define MAJOR_ID 101  // Lab Room 1
#define MINOR_ID 1    // Station 1
#define MEASURED_POWER -59  // Power at 1 meter (~3m range for student detection)
#define BEACON_ID "beacon-lab-room-1-station-1"

// Global state tracking
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;
bool wifiConnected = false;

void setup() {
  Serial.begin(115200);
  Serial.println("\n\nStarting iBeacon Firmware for Smart Lab Attendance System...");
  
  bootTime = millis();

  // Initialize WiFi on Core 1 (non-blocking)
  initializeWiFi();
  
  // Initialize BLE Device
  BLEDevice::init("Lab Beacon Node");

  // Configure iBeacon with manufacturer data frame
  BLEBeacon oBeacon;
  oBeacon.setUUID(IBEACON_UUID);
  oBeacon.setMajorID(MAJOR_ID);
  oBeacon.setMinorID(MINOR_ID);
  oBeacon.setMeasuredPower(MEASURED_POWER);

  // Get advertising object and configure for Non-Connectable iBeacon
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(oBeacon.getAdvData());
  pAdvertising->setScanResponse(false);  // Non-connectable: no scan response needed
  
  // Optimize advertising interval for fast discovery (100ms = 160 * 0.625ms)
  pAdvertising->setMinInterval(160);
  pAdvertising->setMaxInterval(160);
  
  // Set TX Power for ~3 meter range (MEASURED_POWER -59dBm enforced)
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_DEFAULT);
  
  // Start advertising (Non-Connectable iBeacon)
  BLEDevice::startAdvertising();
  Serial.println("✓ iBeacon is active. Broadcasting Lab Room 1, Station 1...");
  Serial.println("✓ Beacon UUID: " + String(IBEACON_UUID));
  Serial.println("✓ Major ID: " + String(MAJOR_ID) + " | Minor ID: " + String(MINOR_ID));
  Serial.println("✓ Students can now scan for presence without pairing.");
}

void initializeWiFi() {
  Serial.println("\n→ Connecting to WiFi: " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✓ WiFi Connected!");
    Serial.println("  IP Address: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n✗ WiFi Connection Failed. Beacon will run in offline mode.");
    Serial.println("  Students can still detect the beacon via Bluetooth.");
  }
}

void sendBeaconHeartbeat() {
  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    // Attempt to reconnect
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("→ WiFi disconnected. Attempting reconnection...");
      WiFi.reconnect();
    }
    return;
  }
  
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  
  // Calculate uptime in seconds
  unsigned long uptime = (millis() - bootTime) / 1000;
  
  // Build JSON payload
  String jsonPayload = "{";
  jsonPayload += "\"beacon_id\":\"" + String(BEACON_ID) + "\",";
  jsonPayload += "\"major_id\":" + String(MAJOR_ID) + ",";
  jsonPayload += "\"minor_id\":" + String(MINOR_ID) + ",";
  jsonPayload += "\"uuid\":\"" + String(IBEACON_UUID) + "\",";
  jsonPayload += "\"status\":\"ACTIVE\",";
  jsonPayload += "\"uptime_seconds\":" + String(uptime) + ",";
  jsonPayload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  jsonPayload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\",";
  jsonPayload += "\"timestamp\":\"" + String(millis()) + "\"";
  jsonPayload += "}";
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    Serial.println("✓ Heartbeat sent. Response Code: " + String(httpResponseCode));
    Serial.println("  Response: " + http.getString());
  } else {
    Serial.println("✗ Heartbeat failed. Error: " + String(httpResponseCode));
  }
  
  http.end();
}

void loop() {
  // Check if it's time to send heartbeat (every 30 seconds)
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendBeaconHeartbeat();
  }
  
  // Small delay to prevent watchdog timer issues
  delay(1000);
}

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEBeacon.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// WiFi Configuration (Update these with your network details)
#define WIFI_SSID "Airtel_rama_5008"
#define WIFI_PASSWORD "air18995"

// Backend Server Configuration
// ⚠️ DEVELOPMENT: "http://192.168.1.15:3000/api/esp32/status"
// 🚀 PRODUCTION:  "https://YOUR-APP-NAME.vercel.app/api/esp32/status"
#define SERVER_URL "https://sd-dashboard-vnr.vercel.app/api/esp32/status"
#define HEARTBEAT_INTERVAL 30000  // Send status every 30 seconds

// Unique iBeacon UUID for Smart Lab Attendance System
#define IBEACON_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define MAJOR_ID 101  // Lab Room 1
#define MINOR_ID 1    // Station 1
#define MEASURED_POWER -59  // Power at 1 meter (~3m range for student detection)
#define BEACON_ID "beacon-lab-room-1-station-1"

// GATT Service UUID — MUST match the frontend filter exactly
// Using the same UUID as the iBeacon for simplicity
#define GATT_SERVICE_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"

// Global state tracking
unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;
bool wifiConnected = false;

void setup() {
  Serial.begin(115200);
  delay(2000);  // Wait for serial monitor to connect
  Serial.println("\n\nStarting iBeacon Firmware for Smart Lab Attendance System...");
  
  bootTime = millis();

  // Initialize WiFi on Core 1 (non-blocking)
  initializeWiFi();
  
  // Initialize BLE Device with a short name to fit in scan response
  BLEDevice::init("LabBeacon");
  
  // Create GATT Server & Service
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(GATT_SERVICE_UUID);
  
  // Add a readable characteristic so the service is valid
  pService->createCharacteristic(
    "beb5483e-36e1-4688-b7f5-ea07361b26a8",
    BLECharacteristic::PROPERTY_READ
  )->setValue("SD-Dashboard-Beacon");
  
  pService->start();

  // ═══════════════════════════════════════════════════════════════
  // CRITICAL FIX: Split advertisement into TWO packets
  //
  // Packet 1 (Advertisement): iBeacon manufacturer data (uses ~28 bytes)
  // Packet 2 (Scan Response):  GATT Service UUID + Device Name
  //
  // Android Chrome Web Bluetooth requires the Service UUID to be
  // present in either the advertisement or scan response packet.
  // The iBeacon frame alone consumes almost the entire 31-byte
  // advertisement limit, so the Service UUID MUST go in the
  // scan response for the phone to discover the device.
  // ═══════════════════════════════════════════════════════════════

  // --- Packet 1: iBeacon Advertisement Data ---
  BLEBeacon oBeacon;
  oBeacon.setManufacturerId(0x4C00); // Apple iBeacon manufacturer ID
  oBeacon.setProximityUUID(BLEUUID(IBEACON_UUID));
  oBeacon.setMajor(MAJOR_ID);
  oBeacon.setMinor(MINOR_ID);
  oBeacon.setSignalPower(MEASURED_POWER);

  BLEAdvertisementData oAdvertisementData = BLEAdvertisementData();
  oAdvertisementData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported
  oAdvertisementData.setManufacturerData(oBeacon.getData());

  // --- Packet 2: Scan Response Data (Service UUID + Name) ---
  BLEAdvertisementData oScanResponseData = BLEAdvertisementData();
  oScanResponseData.setCompleteServices(BLEUUID(GATT_SERVICE_UUID));
  oScanResponseData.setName("LabBeacon");

  // --- Apply both packets to the advertising object ---
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponseData(oScanResponseData);
  pAdvertising->setScanResponse(true); // MUST be true for scan response to work
  
  // Optimize advertising interval for fast discovery (100ms = 160 * 0.625ms)
  pAdvertising->setMinInterval(160);
  pAdvertising->setMaxInterval(160);
  
  // Set TX Power for ~3 meter range
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P3);
  
  // Start advertising
  BLEDevice::startAdvertising();
  
  Serial.println("═══════════════════════════════════════════");
  Serial.println("✓ BLE Advertising Active (Dual-Packet Mode)");
  Serial.println("  Packet 1 (ADV): iBeacon frame");
  Serial.println("  Packet 2 (RSP): GATT Service UUID + Name");
  Serial.println("  Service UUID: " + String(GATT_SERVICE_UUID));
  Serial.println("  Device Name:  LabBeacon");
  Serial.println("═══════════════════════════════════════════");
  Serial.println("→ Android Chrome can now discover via Web Bluetooth.");
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
  
  WiFiClientSecure client;
  client.setInsecure();  // Skip certificate verification (OK for heartbeat)
  
  HTTPClient http;
  http.begin(client, SERVER_URL);
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

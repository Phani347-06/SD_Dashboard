#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEBeacon.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_bt.h>
#include <esp_wifi.h>
#include <time.h>

// WiFi Configuration
#define WIFI_SSID "Airtel_rama_5008"
#define WIFI_PASSWORD "air18995"

// 🚀 V30: THE ULTIMATE PRODUCTION FIRMWARE
// Fixes: Web Bluetooth Visibility, Identifier Sync, and High-Volume Cloud Bridge
#define SERVER_URL "http://sd-dashboard.phanisrirouthu.workers.dev/"
#define HEARTBEAT_INTERVAL 60000 

// iBeacon Configuration (Matches Dashboard Filters)
#define IBEACON_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define MAJOR_ID 101
#define MINOR_ID 1
#define MEASURED_POWER -59
#define BEACON_ID "beacon-lab-room-1-station-1"

// GATT Service & Characteristic (MUST match frontend attendance/page.tsx)
#define GATT_SERVICE_UUID        "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define GATT_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Global state tracking
unsigned long lastHeartbeat = 0;
unsigned long lastLoopLog = 0;
unsigned long bootTime = 0;

// --- Status Helpers ---
String wifiStatusToString(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "IDLE";
    case WL_NO_SSID_AVAIL: return "SSID NOT FOUND";
    case WL_SCAN_COMPLETED: return "SCAN COMPLETED";
    case WL_CONNECTED: return "CONNECTED";
    case WL_CONNECT_FAILED: return "CONNECT FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN";
  }
}

// --- Connection Callbacks ---
class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        Serial.println("✅ Client connected via Web Bluetooth");
    }
    void onDisconnect(BLEServer* pServer) {
        Serial.println("🔄 Client disconnected. Resuming Discovery...");
        delay(500); 
        BLEDevice::startAdvertising();
    }
};

void initializeWiFi() {
  Serial.println("[WIFI] Initializing WiFi...");
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WIFI] Connection failed. Will retry later.");
  }
}

void initializeBle() {
  BLEDevice::init("LabBeacon");
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(GATT_SERVICE_UUID);
  
  // Add the characteristic your website is looking for
  pService->createCharacteristic(
             GATT_CHARACTERISTIC_UUID,
             BLECharacteristic::PROPERTY_READ |
             BLECharacteristic::PROPERTY_WRITE
           );
           
  pService->start();

  // --- PACKET 1: PRIMARY ADVERTISEMENT (Name + Flags) ---
  // Chrome/Android REQUIRE flags to see the device.
  BLEAdvertisementData oAdvertisementData = BLEAdvertisementData();
  oAdvertisementData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported
  oAdvertisementData.setName("LabBeacon"); 

  // --- PACKET 2: SCAN RESPONSE (Service UUID + iBeacon) ---
  // We move the UUID here to make room for the Flags in the first packet.
  BLEAdvertisementData oScanResponseData = BLEAdvertisementData();
  oScanResponseData.setCompleteServices(BLEUUID(GATT_SERVICE_UUID));
  
  BLEBeacon oBeacon;
  oBeacon.setManufacturerId(0x4C00); 
  oBeacon.setProximityUUID(BLEUUID(IBEACON_UUID));
  oBeacon.setMajor(MAJOR_ID);
  oBeacon.setMinor(MINOR_ID);
  oBeacon.setSignalPower(MEASURED_POWER);
  oScanResponseData.setManufacturerData(oBeacon.getData());

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponseData(oScanResponseData);
  pAdvertising->setScanResponse(true);
  
  // 🚀 CRITICAL: We MUST add the service UUID to the advertising object 
  // so the 'services' filter in page.tsx still finds it!
  pAdvertising->addServiceUUID(GATT_SERVICE_UUID);
  
  pAdvertising->setAdvertisementType(ADV_TYPE_IND); 
  pAdvertising->setMinInterval(160);
  pAdvertising->setMaxInterval(160);

  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P3);
  BLEDevice::startAdvertising();

  Serial.println("===========================================");
  Serial.println("[BLE] V32: RESTACKED PACKETS FOR CHROME");
  Serial.println("===========================================");
}

void sendBeaconHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HB] WiFi disconnected. Retrying...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    return;
  }

  // 🛡️ RESOURCE PROTECTION: Avoid Radio Contention
  BLEDevice::getAdvertising()->stop();
  delay(100); 

  HTTPClient http;
  http.setTimeout(10000);

  Serial.println("[HB] Pushing Telemetry to Cloudflare Bridge...");
  
  if (!http.begin(SERVER_URL)) {
    Serial.println("[HB] Connection Error.");
    BLEDevice::getAdvertising()->start();
    return;
  }

  http.addHeader("Content-Type", "application/json");

  unsigned long uptime = (millis() - bootTime) / 1000;
  
  // Construct JSON using definitions for consistency
  String payload = "{";
  payload += "\"beacon_id\":\"" + String(BEACON_ID) + "\",";
  payload += "\"major_id\":" + String(MAJOR_ID) + ",";
  payload += "\"minor_id\":" + String(MINOR_ID) + ",";
  payload += "\"uuid\":\"" + String(IBEACON_UUID) + "\",";
  payload += "\"status\":\"ACTIVE\",";
  payload += "\"uptime_seconds\":" + String(uptime) + ",";
  payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\"";
  payload += "}";

  int code = http.POST(payload);
  
  if (code > 0) {
    Serial.println("[HB] CLOUD SUCCESS! Code: " + String(code));
  } else {
    Serial.print("[HB] CLOUD FAILED: ");
    Serial.println(http.errorToString(code).c_str());
  }

  http.end();
  BLEDevice::getAdvertising()->start();
}

void setup() {
  Serial.begin(115200);
  delay(1000); 
  Serial.println("\n--- V30 ULTIMATE ---");
  bootTime = millis();

  initializeWiFi();
  initializeBle();

  Serial.println("[BOOT] System Ready. 60s Heartbeat Active.");
}

void loop() {
  if (millis() - lastLoopLog >= 15000) {
    lastLoopLog = millis();
    Serial.println("[LOOP] Heap: " + String(ESP.getFreeHeap()) + " | WiFi: OK");
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendBeaconHeartbeat();
  }
}

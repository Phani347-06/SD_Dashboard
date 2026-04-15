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

// 🚀 V26: FINAL STABLE STANDALONE (Via Beeceptor Bridge)
#define SERVER_URL "http://sd-beacon-bridge.free.beeceptor.com/api/esp32/status"
#define HEARTBEAT_INTERVAL 300000 
 Elisa
// iBeacon Configuration
#define IBEACON_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define MAJOR_ID 101
#define MINOR_ID 1
#define MEASURED_POWER -59
#define BEACON_ID "beacon-lab-room-1-station-1"

// GATT Service UUID (MUST match frontend filter)
#define GATT_SERVICE_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"

// Global state tracking
unsigned long lastHeartbeat = 0;
unsigned long lastLoopLog = 0;
unsigned long bootTime = 0;
bool wifiConnected = false;

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

String resetReasonToString(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "Power-on";
    case ESP_RST_EXT: return "External pin";
    case ESP_RST_SW: return "Software";
    case ESP_RST_PANIC: return "Panic/Exception";
    case ESP_RST_INT_WDT: return "Internal Watchdog";
    case ESP_RST_TASK_WDT: return "Task Watchdog";
    case ESP_RST_WDT: return "Other Watchdog";
    case ESP_RST_DEEPSLEEP: return "Deep Sleep Wakeup";
    case ESP_RST_BROWNOUT: return "Brownout";
    case ESP_RST_SDIO: return "SDIO Reset";
    default: return "Unknown";
  }
}

// --- Connection Callbacks ---
class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        Serial.println("✅ Client connected to LabBeacon");
    }
    void onDisconnect(BLEServer* pServer) {
        Serial.println("🔄 Client disconnected. Restarting advertising...");
        delay(500); 
        BLEDevice::startAdvertising();
    }
};

void initializeWiFi() {
  Serial.println("[WIFI] Resetting WiFi stack...");
  WiFi.disconnect(true);
  delay(100);
  
  WiFi.mode(WIFI_AP_STA); // Set to STA to allow scanning
  WiFi.setSleep(false);
  
  // 🔍 ENVIRONMENT SCAN: See what networks are actually visible
  Serial.println("[WIFI] Scanning for available networks...");
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("[WIFI] No networks found.");
  } else {
    Serial.println("[WIFI] Found " + String(n) + " networks:");
    for (int i = 0; i < n; ++i) {
      Serial.println("  " + String(i + 1) + ": " + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)");
    }
  }
  Serial.println("-------------------------------------------");

  Serial.println("[WIFI] Initializing WiFi stack...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[WIFI] Connected!");
    Serial.print("[WIFI] IP:  "); Serial.println(WiFi.localIP());
    Serial.print("[WIFI] GW:  "); Serial.println(WiFi.gatewayIP());
    Serial.print("[WIFI] SN:  "); Serial.println(WiFi.subnetMask());
    Serial.print("[WIFI] DNS: "); Serial.println(WiFi.dnsIP(0));
  } else {
    wifiConnected = false;
    Serial.println("\n[WIFI] Initial connection failed. Loop will retry later.");
  }
}

void initializeBle() {
  BLEDevice::init("LabBeacon");
  BLEServer* pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(GATT_SERVICE_UUID);
  pService->start();

  // --- PACKET 1: iBeacon Advertisement ---
  BLEBeacon oBeacon;
  oBeacon.setManufacturerId(0x4C00); // Apple
  oBeacon.setProximityUUID(BLEUUID(IBEACON_UUID));
  oBeacon.setMajor(MAJOR_ID);
  oBeacon.setMinor(MINOR_ID);
  oBeacon.setSignalPower(MEASURED_POWER);

  BLEAdvertisementData oAdvertisementData = BLEAdvertisementData();
  oAdvertisementData.setFlags(0x06); // General Discoverable
  oAdvertisementData.setManufacturerData(oBeacon.getData());

  // --- PACKET 2: Scan Response (Browser Visibility) ---
  BLEAdvertisementData oScanResponseData = BLEAdvertisementData();
  oScanResponseData.setCompleteServices(BLEUUID(GATT_SERVICE_UUID));
  oScanResponseData.setName("LabBeacon");

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponseData(oScanResponseData);
  pAdvertising->setScanResponse(true);
  
  // High visibility settings for Web Bluetooth
  pAdvertising->setAdvertisementType(ADV_TYPE_IND); 
  pAdvertising->setMinInterval(160); // 100ms
  pAdvertising->setMaxInterval(160);

  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P3);
  BLEDevice::startAdvertising();

  Serial.println("===========================================");
  Serial.println("[BLE] Dual-Packet Advertising Active");
  Serial.println("[BLE] ADV: iBeacon Frame");
  Serial.println("[BLE] SR:  Service UUID + Name (LabBeacon)");
  Serial.println("===========================================");
}

void sendBeaconHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HB] Skip: WiFi not connected.");
    return;
  }

  // 🛡️ RESOURCE PROTECTION
  Serial.println("[HB] Pausing BLE for Bridge transmission...");
  BLEDevice::getAdvertising()->stop();
  delay(100); 

  HTTPClient http;
  http.setTimeout(15000);
  http.setConnectTimeout(10000);

  Serial.println("[HB] Connecting to Bridge (Port 80)...");
  
  // Use unencrypted HTTP to bypass security blockers
  if (!http.begin(SERVER_URL)) {
    Serial.println("[HB] Init Error.");
    BLEDevice::getAdvertising()->start();
    return;
  }

  http.addHeader("User-Agent", "Mozilla/5.0 (ESP32-Station)");
  http.addHeader("Content-Type", "application/json");

  unsigned long uptime = (millis() - bootTime) / 1000;
  
  // 🧩 Full payload required by backend validation
  String payload = "{";
  payload += "\"beacon_id\":\"" + String(BEACON_ID) + "\",";
  payload += "\"major_id\":100,";
  payload += "\"minor_id\":1,";
  payload += "\"uuid\":\"FDA50693-A4E2-4FB1-AFCF-C6EB07647825\",";
  payload += "\"status\":\"ACTIVE\",";
  payload += "\"uptime_seconds\":" + String(uptime) + ",";
  payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"ip_address\":\"" + WiFi.localIP().toString() + "\"";
  payload += "}";

  int code = http.POST(payload);
  
  if (code > 0) {
    Serial.println("[HB] BRIDGE SUCCESS! Code: " + String(code));
    if (code == 200) {
      Serial.println("[RES] Dashboard Updated Successfully.");
    }
  } else {
    Serial.print("[HB] BRIDGE FAILED. Error: ");
    Serial.println(http.errorToString(code).c_str());
  }

  http.end();
  
  Serial.println("[HB] Resuming BLE.");
  BLEDevice::getAdvertising()->start();
}

void setup() {
  Serial.begin(115200);
  delay(1000); 
  Serial.println("\n\nStarting Unified iBeacon Firmware...");
  Serial.println("[BOOT] Reset reason text: " + String(resetReasonToString(esp_reset_reason())));

  bootTime = millis();

  // 1. Initialize WiFi 
  initializeWiFi();

  // 2. Clear NTP (IST Offset: UTC + 5:30 = 19800s)
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
  
  // 3. Initialize BLE (Self-Healing Advertising)
  initializeBle();

  Serial.println("[BOOT] Setup complete. Heartbeat interval: 30s");
}

void loop() {
  if (millis() - lastLoopLog >= 5000) {
    lastLoopLog = millis();
    wl_status_t status = WiFi.status();
    Serial.println("[LOOP] Alive. Heap: " + String(ESP.getFreeHeap()) + 
                   " | WiFi: " + wifiStatusToString(status));
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendBeaconHeartbeat();
  }

  delay(100);
}

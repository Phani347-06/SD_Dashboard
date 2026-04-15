#include <BLEBeacon.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>

// WiFi Configuration
#define WIFI_SSID "IRON MAN"
#define WIFI_PASSWORD "12345678"

// Backend Server Configuration
#define SERVER_URL "https://sd-dashboard-vnr.vercel.app/api/esp32/status"
#define HEARTBEAT_INTERVAL 30000

// BLE / iBeacon Configuration
#define IBEACON_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define MAJOR_ID 101
#define MINOR_ID 1
#define MEASURED_POWER -59
#define BEACON_ID "beacon-lab-room-1-station-1"
#define GATT_SERVICE_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"
#define GATT_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

unsigned long lastHeartbeat = 0;
unsigned long bootTime = 0;
unsigned long lastLoopLog = 0;
bool wifiConnected = false;

static const char* resetReasonToString(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_UNKNOWN: return "UNKNOWN";
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "UNMAPPED";
  }
}

void initializeWiFi() {
  Serial.println("\n[WIFI] Connecting to WiFi: " + String(WIFI_SSID));
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
    Serial.println("\n[WIFI] Connected");
    Serial.println("[WIFI] IP Address: " + WiFi.localIP().toString());
    Serial.println("[WIFI] RSSI: " + String(WiFi.RSSI()));
  } else {
    wifiConnected = false;
    Serial.println("\n[WIFI] Connection failed. Beacon will continue in BLE-only mode.");
  }
}

void initializeBle() {
  BLEDevice::init("LabBeacon");

  BLEServer* server = BLEDevice::createServer();
  BLEService* service = server->createService(GATT_SERVICE_UUID);
  service->createCharacteristic(
    GATT_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ
  )->setValue("SD-Dashboard-Beacon");
  service->start();

  BLEBeacon beacon;
  beacon.setManufacturerId(0x4C00);
  beacon.setProximityUUID(BLEUUID(IBEACON_UUID));
  beacon.setMajor(MAJOR_ID);
  beacon.setMinor(MINOR_ID);
  beacon.setSignalPower(MEASURED_POWER);

  BLEAdvertisementData advData;
  advData.setFlags(0x06);
  advData.setManufacturerData(beacon.getData());

  BLEAdvertisementData scanResponseData;
  scanResponseData.setCompleteServices(BLEUUID(GATT_SERVICE_UUID));
  scanResponseData.setName("LabBeacon");

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->setAdvertisementData(advData);
  advertising->setScanResponseData(scanResponseData);
  advertising->setScanResponse(true);
  advertising->setMinInterval(160);
  advertising->setMaxInterval(160);

  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P3);
  BLEDevice::startAdvertising();

  Serial.println("===========================================");
  Serial.println("[BLE] Advertising Active (Dual-Packet Mode)");
  Serial.println("[BLE] Packet 1: iBeacon frame");
  Serial.println("[BLE] Packet 2: GATT Service UUID + Name");
  Serial.println("[BLE] Service UUID: " + String(GATT_SERVICE_UUID));
  Serial.println("[BLE] Device Name: LabBeacon");
  Serial.println("===========================================");
}

void sendBeaconHeartbeat() {
  Serial.println("\n[HB] Trigger fired at ms=" + String(millis()));

  if (!wifiConnected || WiFi.status() != WL_CONNECTED) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[HB] WiFi disconnected. Attempting reconnection...");
      WiFi.reconnect();
    }
    Serial.println("[HB] Skipping heartbeat because WiFi is unavailable.");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, SERVER_URL)) {
    Serial.println("[HB] Failed to initialize HTTP client.");
    return;
  }

  http.addHeader("Content-Type", "application/json");

  unsigned long uptime = (millis() - bootTime) / 1000;

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

  Serial.println("[HB] Sending POST to: " + String(SERVER_URL));
  Serial.println("[HB] Payload: " + jsonPayload);

  const int responseCode = http.POST(jsonPayload);

  if (responseCode > 0) {
    Serial.println("[HB] Heartbeat sent. Response Code: " + String(responseCode));
    Serial.println("[HB] Response: " + http.getString());
  } else {
    Serial.println("[HB] Heartbeat failed. Error code: " + String(responseCode));
    Serial.println("[HB] HTTP error string: " + http.errorToString(responseCode));
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n\nStarting iBeacon Firmware for Smart Lab Attendance System...");
  Serial.println("[BOOT] Reset reason enum: " + String((int)esp_reset_reason()));
  Serial.println("[BOOT] Reset reason text: " + String(resetReasonToString(esp_reset_reason())));

  bootTime = millis();

  initializeWiFi();
  initializeBle();

  Serial.println("[BOOT] Setup complete. Waiting for loop heartbeat...");
}

void loop() {
  if (millis() - lastLoopLog >= 5000) {
    lastLoopLog = millis();
    Serial.println("[LOOP] Alive. millis=" + String(millis()) +
                   ", WiFi.status=" + String((int)WiFi.status()) +
                   ", wifiConnected=" + String(wifiConnected ? "true" : "false"));
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    sendBeaconHeartbeat();
  }

  delay(1000);
}

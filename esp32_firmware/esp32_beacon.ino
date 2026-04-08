#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// Unique secure UUID matching our Web Bluetooth API filter
#define SERVICE_UUID "b5c879b2-3be9-450f-90e7-ecad1d7d242c"

void setup() {
  Serial.begin(115200);
  Serial.println("Starting BLE work!");

  // Initialize BLE Device
  BLEDevice::init("Lab Beacon Node");

  // Create BLE Server
  BLEServer *pServer = BLEDevice::createServer();

  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
  
  BLEDevice::startAdvertising();
  Serial.println("Beacon is active. Awaiting Student App discovery...");
}

void loop() {
  // Beacons do not require loop execution unless pulsing dynamic data
  Serial.println("Beacon is actively broadcasting...");
  delay(2000);
}

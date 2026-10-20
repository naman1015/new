#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <WiFiUdp.h>

// ─── CONFIGURATION ────────────────────────────────────────────────
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration
// Use your local PC IP (e.g. 192.168.x.x) or Render URL
const char* serverUrl = "http://192.168.1.105:5000/api"; 
const char* deviceId = "DISPENSER_01";
const char* deviceSecret = "smm_device_secret_key_123";

// Pin Definitions
#define SERVO_PIN      21
#define IR_PIN         12

// Stepper Motor (28BYJ-48 via ULN2003) Pins
#define IN1            25
#define IN2            26
#define IN3            27
#define IN4            14

// ─── MOTOR CONSTANTS ──────────────────────────────────────────────
const int stepsPerRevolution = 2048; // 28BYJ-48 gear reduction ratio
const int stepsPerSlot = stepsPerRevolution / 5; // 5 compartments
int currentSlot = 1; // Start at compartment 1

// Servo config
Servo lidServo;
const int lidClosedAngle = 0;
const int lidOpenAngle = 90;

// UDP Broadcast Config for Wearable Band
WiFiUDP udp;
const char* broadcastIp = "255.255.255.255";
const int udpPort = 4210;

// Timer intervals
unsigned long lastHeartbeat = 0;
const unsigned long heartbeatInterval = 60000; // 60s
unsigned long lastDosePoll = 0;
const unsigned long dosePollInterval = 30000;   // 30s

// ─── STEPPER MOTOR STEP DRIVING ───────────────────────────────────
void stepMotor(int step) {
  // 4-step sequence
  switch (step) {
    case 0:
      digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);
      break;
    case 1:
      digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);
      break;
    case 2:
      digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
      break;
    case 3:
      digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH);
      break;
  }
}

void rotateToSlot(int targetSlot) {
  if (targetSlot < 1 || targetSlot > 5) return;
  
  // Calculate relative slots to rotate
  int slotsToMove = targetSlot - currentSlot;
  if (slotsToMove < 0) {
    slotsToMove += 5; // always rotate clockwise for simplicity
  }
  
  if (slotsToMove == 0) return;
  
  int totalSteps = slotsToMove * stepsPerSlot;
  Serial.printf("Rotating from slot %d to %d (%d steps)\n", currentSlot, targetSlot, totalSteps);
  
  for (int i = 0; i < totalSteps; i++) {
    stepMotor(i % 4);
    delay(2); // delay between steps
  }
  
  // Turn off stepper pins to prevent overheating
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  
  currentSlot = targetSlot;
}

// ─── ALERT SENSORS ────────────────────────────────────────────────
void triggerDoseDispense(const char* doseId, int targetSlot) {
  Serial.printf("🔔 Dispensing Dose: %s for slot %d\n", doseId, targetSlot);
  
  // 1. Rotate compartment to alignment position
  rotateToSlot(targetSlot);
  
  // 2. Broadcast UDP packet to trigger wearable haptic alert
  udp.beginPacket(broadcastIp, udpPort);
  udp.print("DOSE_ALERT");
  udp.endPacket();
  Serial.println("📡 Wristband alert broadcast sent.");
  
  // 3. Open Servo Lid
  Serial.println("🔓 Opening Lid...");
  lidServo.write(lidOpenAngle);
  delay(1000);
  
  // 4. Wait and monitor IR sensor for pickup verification
  bool pillTaken = false;
  unsigned long startTime = millis();
  const unsigned long pickupTimeout = 20000; // Wait up to 20 seconds
  
  Serial.println("⏳ Monitoring pill pickup via IR...");
  while (millis() - startTime < pickupTimeout) {
    int irVal = digitalRead(IR_PIN);
    // IR sensor pin is active LOW when obstacle is near (i.e. pill blocking sensor)
    // When the pill is taken, it becomes HIGH (clear)
    if (irVal == HIGH) {
      // Small debounce
      delay(200);
      if (digitalRead(IR_PIN) == HIGH) {
        pillTaken = true;
        break;
      }
    }
    delay(100);
  }
  
  // 5. Close Servo Lid
  Serial.println("🔒 Closing Lid...");
  lidServo.write(lidClosedAngle);
  delay(1000);
  
  // 6. Report outcome to Backend API
  WiFiClient client;
  HTTPClient http;
  
  String url = String(serverUrl) + (pillTaken ? "/doses/taken" : "/doses/missed");
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceSecret);
  
  String payload = "{\"doseId\":\"" + String(doseId) + "\",\"deviceId\":\"" + String(deviceId) + "\"}";
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    Serial.printf("API Response: %d\n", httpResponseCode);
  } else {
    Serial.printf("API Request failed: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

// ─── POLLING AND TELEMETRY ────────────────────────────────────────
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClient client;
  HTTPClient http;
  
  String url = String(serverUrl) + "/device/heartbeat";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceSecret);
  
  // Get system statistics
  int wifiRssi = WiFi.RSSI();
  unsigned long uptime = millis() / 1000;
  uint32_t freeHeap = ESP.getFreeHeap();
  
  DynamicJsonDocument doc(256);
  doc["deviceId"] = deviceId;
  doc["wifiStrength"] = wifiRssi;
  doc["firmwareVersion"] = "1.0.0-ino";
  doc["uptimeSeconds"] = uptime;
  doc["freeHeapBytes"] = freeHeap;
  
  String payload;
  serializeJson(doc, payload);
  
  int httpResponseCode = http.POST(payload);
  if (httpResponseCode > 0) {
    Serial.println("💚 Heartbeat sent successfully.");
  } else {
    Serial.printf("Heartbeat failed: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

void pollDoses() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClient client;
  HTTPClient http;
  
  String url = String(serverUrl) + "/doses/pending?deviceId=" + String(deviceId);
  http.begin(client, url);
  http.addHeader("Authorization", String("Bearer ") + deviceSecret);
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String payload = http.getString();
    
    DynamicJsonDocument doc(2048);
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      JsonArray doses = doc["doses"];
      for (JsonObject dose : doses) {
        const char* doseId = dose["_id"];
        int slotIndex = dose["slotIndex"];
        
        // Dispense the dose!
        triggerDoseDispense(doseId, slotIndex);
      }
    }
  } else {
    Serial.printf("Poll failed, HTTP code: %d\n", httpResponseCode);
  }
  http.end();
}

// ─── SETUP ────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  
  // Set Pin Modes
  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  
  // Initialize Servo
  lidServo.attach(SERVO_PIN);
  lidServo.write(lidClosedAngle);
  
  // Connect to WiFi
  Serial.printf("Connecting to %s ", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n📶 Connected to WiFi!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  // Initial checkins
  sendHeartbeat();
  pollDoses();
}

// ─── LOOP ─────────────────────────────────────────────────────────
void loop() {
  unsigned long currentMillis = millis();
  
  // Heartbeat loop
  if (currentMillis - lastHeartbeat >= heartbeatInterval) {
    lastHeartbeat = currentMillis;
    sendHeartbeat();
  }
  
  // Dose Polling loop
  if (currentMillis - lastDosePoll >= dosePollInterval) {
    lastDosePoll = currentMillis;
    pollDoses();
  }
}

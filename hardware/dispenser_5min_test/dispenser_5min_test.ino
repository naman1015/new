#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ─── WIFI & CLOUD BACKEND CONFIGURATION ───────────────────────────
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Replace with your live Render backend URL once deployed (e.g. "https://smart-medicine-manager-api.onrender.com/api")
const char* serverUrl = "https://YOUR-RENDER-APP.onrender.com/api";
const char* deviceId = "DISPENSER_01";
const char* deviceSecret = "smm_device_secret_key_123";

// ─── HARDWARE PIN DEFINITIONS (Update to match your wiring) ──────
#define RED_LED_PIN    4
#define GREEN_LED_PIN  2
#define BUZZER_PIN     15
#define IR_SENSOR_PIN  12   // FC-51 IR obstacle module (usually LOW when movement/hand detected)

// Set to LOW if your IR sensor outputs LOW when hand/movement is detected, or HIGH if active-high
#define IR_DETECTED_STATE LOW

// ─── 5-MINUTE COUNTER TIMINGS ─────────────────────────────────────
const unsigned long TOTAL_CYCLE_MS = 5UL * 60UL * 1000UL;          // 5:00 mins (300,000 ms)
const unsigned long ALERT_START_MS = (4UL * 60UL + 35UL) * 1000UL; // 4:35 mins (275,000 ms)

unsigned long cycleStartTime = 0;
bool alertActive = false;
bool doseTakenInCycle = false;
bool cycleReported = false;
unsigned long lastHeartbeat = 0;

// ─── HELPER: POST JSON TO RENDER BACKEND (HTTP or HTTPS) ──────────
int postToBackend(const char* endpoint, const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  HTTPClient http;
  String fullUrl = String(serverUrl) + endpoint;

  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (fullUrl.startsWith("https://")) {
    secureClient.setInsecure(); // Skip CA cert check for Render HTTPS
    http.begin(secureClient, fullUrl);
  } else {
    http.begin(plainClient, fullUrl);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceSecret);

  int code = http.POST(jsonPayload);
  Serial.printf("[API] POST %s -> HTTP %d\n", endpoint, code);
  http.end();
  return code;
}

void sendHeartbeat() {
  String payload = "{\"deviceId\":\"" + String(deviceId) +
                   "\",\"wifiStrength\":" + String(WiFi.RSSI()) +
                   ",\"firmwareVersion\":\"5min-test-1.0\"" +
                   ",\"uptimeSeconds\":" + String(millis() / 1000) +
                   ",\"freeHeapBytes\":" + String(ESP.getFreeHeap()) + "}";
  postToBackend("/device/heartbeat", payload);
}

void startNewFiveMinCycle() {
  cycleStartTime = millis();
  alertActive = false;
  doseTakenInCycle = false;
  cycleReported = false;

  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("\n⏱️ Starting 5-minute counter (Alert at 4:35)...");

  // Notify backend so the mobile app immediately shows a live countdown to 4:35 (275s)
  String payload = "{\"deviceId\":\"" + String(deviceId) + "\",\"alertInSeconds\":275,\"slotIndex\":1}";
  postToBackend("/doses/trigger", payload);
}

void setup() {
  Serial.begin(115200);

  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(IR_SENSOR_PIN, INPUT_PULLUP);

  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.printf("Connecting to WiFi: %s", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n📶 WiFi Connected! IP: " + WiFi.localIP().toString());

  sendHeartbeat();
  startNewFiveMinCycle();
}

void loop() {
  unsigned long now = millis();
  unsigned long elapsed = now - cycleStartTime;

  // Send device heartbeat every 60 seconds so Profile page shows "🟢 Connected / Online"
  if (now - lastHeartbeat >= 60000UL) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  // 1. At 4:35 (275,000 ms): Turn ON Red LED & Buzzer (if not already taken)
  if (!doseTakenInCycle && !alertActive && elapsed >= ALERT_START_MS && elapsed < TOTAL_CYCLE_MS) {
    alertActive = true;
    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println("🚨 4:35 reached! Red LED & Buzzer ON — Waiting for IR sensor movement...");
  }

  // 2. While alert is active (between 4:35 and 5:00): Monitor IR sensor for movement
  if (alertActive && !doseTakenInCycle) {
    if (digitalRead(IR_SENSOR_PIN) == IR_DETECTED_STATE) {
      delay(80); // Small debounce
      if (digitalRead(IR_SENSOR_PIN) == IR_DETECTED_STATE) {
        doseTakenInCycle = true;
        alertActive = false;
        cycleReported = true;

        // Turn OFF Buzzer & Red LED, Turn ON Green LED
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        digitalWrite(GREEN_LED_PIN, HIGH);
        Serial.println("✅ IR Movement Detected! Buzzer OFF, Green LED ON.");

        // Immediately update the mobile app in real time
        String payload = "{\"deviceId\":\"" + String(deviceId) + "\",\"slotIndex\":1}";
        postToBackend("/doses/taken", payload);
      }
    }
  }

  // 3. At 5:00 (300,000 ms): If no IR movement was detected, mark as missed & restart or finish
  if (elapsed >= TOTAL_CYCLE_MS) {
    if (!doseTakenInCycle && !cycleReported) {
      cycleReported = true;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(RED_LED_PIN, LOW);
      Serial.println("⚠️ 5:00 reached without IR movement — Marking dose as MISSED.");

      String payload = "{\"deviceId\":\"" + String(deviceId) + "\",\"slotIndex\":1}";
      postToBackend("/doses/missed", payload);
    }

    // Wait 5 seconds, then start the next 5-minute test cycle
    delay(5000);
    startNewFiveMinCycle();
  }

  delay(20);
}

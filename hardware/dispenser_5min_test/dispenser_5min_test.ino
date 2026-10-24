#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

// ─── WIFI & CLOUD BACKEND CONFIGURATION ───────────────────────────
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Replace with your live Render backend URL once deployed (e.g. "https://smart-medicine-manager-api.onrender.com/api")
const char* serverUrl = "https://new-d966.onrender.com/api";
const char* deviceId = "DISPENSER_01";
const char* deviceSecret = "REPLACE_WITH_YOUR_DEVICE_SECRET";

// Google Trust Services (GTS Root R4) Root CA certificate for verifying https://*.onrender.com
const char* ROOT_CA_CERT =
"-----BEGIN CERTIFICATE-----\n"
"MIICCTCCAY6gAwIBAgINAgPlwGjvYxqccpBQUjAKBggqhkjOPQQDAzBHMQswCQYD\n"
"VQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEUMBIG\n"
"A1UEAxMLR1RTIFJvb3QgUjQwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAwMDAw\n"
"WjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2Vz\n"
"IExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjQwdjAQBgcqhkjOPQIBBgUrgQQAIgNi\n"
"AATzdHOnaItgrkO4NcWBMHtLSZ37wWHO5t5GvWvVYRg1rkDdc/eJkTBa6zzuhXyi\n"
"QHY7qca4R9gq55KRanPpsXI5nymfopjTX15YhmUPoYRlBtHci8nHc8iMai/lxKvR\n"
"HYqjQjBAMA4GA1UdDwEB/wQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQW\n"
"BBSATNbrdP9JNqPV2Py1PsVq8JQdjDAKBggqhkjOPQQDAwNpADBmAjEA6ED/g94D\n"
"9J+uHXqnLrmvT/aDHQ4thQEd0dlq7A/Cr8deVl5c1RxYIigL9zC2L7F8AjEA8GE8\n"
"p/SgguMh1YQdc4acLa/KNJvxn7kjNuK8YAOdgLOaVsjh4rsUecrNIdSUtUlD\n"
"-----END CERTIFICATE-----\n";

// ─── HARDWARE PIN DEFINITIONS (Update to match your wiring) ──────
#define RED_LED_PIN    4
#define GREEN_LED_PIN  2
#define BUZZER_PIN     15
#define IR_SENSOR_PIN  12   // FC-51 IR obstacle module (LOW when movement/hand detected)

// Set to LOW if your IR sensor outputs LOW when hand/movement is detected, or HIGH if active-high
#define IR_DETECTED_STATE LOW

// ─── NTP TIME SYNC (IST = UTC + 5:30 = 19800 seconds) ─────────────
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 19800;
const int   daylightOffset_sec = 0;

// ─── STATE VARIABLES ──────────────────────────────────────────────
String activeDoseId = "";
String activeMedName = "";
bool alertActive = false;
unsigned long alertStartedAt = 0;
const unsigned long ALERT_TIMEOUT_MS = 25000UL; // 25s window (e.g. 4:35 -> 5:00) before marking missed

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_MS = 4000UL;  // Poll every 4 seconds for real-time sync

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000UL; // Heartbeat every 30 seconds

// ─── PRINT CURRENT SYNCED IST CLOCK TIME ──────────────────────────
String getCurrentSyncedTimeStr() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "Syncing...";
  }
  char buf[16];
  strftime(buf, sizeof(buf), "%H:%M:%S", &timeinfo);
  return String(buf);
}

// ─── HELPER: POST JSON TO RENDER BACKEND (HTTP or HTTPS) ──────────
int postToBackend(const char* endpoint, const String& jsonPayload, String* responseOut = nullptr) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  HTTPClient http;
  String fullUrl = String(serverUrl) + endpoint;

  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (fullUrl.startsWith("https://")) {
    secureClient.setCACert(ROOT_CA_CERT);
    http.begin(secureClient, fullUrl);
  } else {
    http.begin(plainClient, fullUrl);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceSecret);

  int code = http.POST(jsonPayload);
  if (code > 0 && responseOut != nullptr) {
    *responseOut = http.getString();
  }
  http.end();
  return code;
}

// ─── SEND HEARTBEAT & SYNC DEVICE CLOCK ───────────────────────────
void sendHeartbeat() {
  String payload = "{\"deviceId\":\"" + String(deviceId) +
                   "\",\"wifiStrength\":" + String(WiFi.RSSI()) +
                   ",\"firmwareVersion\":\"realtime-sync-2.0\"" +
                   ",\"uptimeSeconds\":" + String(millis() / 1000) +
                   ",\"freeHeapBytes\":" + String(ESP.getFreeHeap()) + "}";
  String resp;
  int code = postToBackend("/device/heartbeat", payload, &resp);
  if (code == 200) {
    Serial.printf("💚 [Heartbeat] Online | Device IST Clock: %s\n", getCurrentSyncedTimeStr().c_str());
  }
}

// ─── POLL UPCOMING REMINDERS SET IN THE MOBILE APP ────────────────
void pollRemindersFromApp() {
  if (WiFi.status() != WL_CONNECTED || alertActive) return;

  HTTPClient http;
  String fullUrl = String(serverUrl) + "/doses/pending?deviceId=" + String(deviceId);

  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (fullUrl.startsWith("https://")) {
    secureClient.setCACert(ROOT_CA_CERT);
    http.begin(secureClient, fullUrl);
  } else {
    http.begin(plainClient, fullUrl);
  }

  http.addHeader("Authorization", String("Bearer ") + deviceSecret);
  int code = http.GET();

  if (code == 200) {
    String body = http.getString();
    DynamicJsonDocument doc(2048);
    if (!deserializeJson(doc, body)) {
      const char* serverIST = doc["serverTimeIST"] | "";
      JsonObject nextDose = doc["nextDose"];

      if (!nextDose.isNull()) {
        String doseId = nextDose["_id"].as<String>();
        String medName = nextDose["medication"]["name"] | "Medicine";
        long secondsRemaining = nextDose["secondsRemaining"] | 9999;

        Serial.printf("🕒 [Time: %s] Next Reminder: %s in %lds\n",
                      serverIST, medName.c_str(), secondsRemaining);

        // When reminder time is reached (or within alert window): Turn ON Red LED & Buzzer!
        if (secondsRemaining <= 0) {
          activeDoseId = doseId;
          activeMedName = medName;
          alertActive = true;
          alertStartedAt = millis();

          digitalWrite(GREEN_LED_PIN, LOW);
          digitalWrite(RED_LED_PIN, HIGH);
          digitalWrite(BUZZER_PIN, HIGH);
          Serial.printf("🚨 REMINDER DUE (%s)! Red LED & Buzzer ON — Waiting for IR movement...\n",
                        activeMedName.c_str());
        }
      }
    }
  }
  http.end();
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

  // 1. Connect to WiFi
  Serial.printf("Connecting to WiFi: %s", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n📶 WiFi Connected! IP: " + WiFi.localIP().toString());

  // 2. Sync ESP32 internal clock to real-world IST time immediately
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.println("⏱️ Synced ESP32 Time (IST): " + getCurrentSyncedTimeStr());

  // 3. Register online status & check reminders set in the app
  sendHeartbeat();
  pollRemindersFromApp();
}

void loop() {
  unsigned long now = millis();

  // Keep ESP32 online status & time synced with the app
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }

  // Poll the app every 4 seconds for any new/updated reminder times
  if (!alertActive && (now - lastPollTime >= POLL_INTERVAL_MS)) {
    lastPollTime = now;
    pollRemindersFromApp();
  }

  // When Red LED & Buzzer are ON, watch the IR sensor continuously for movement
  if (alertActive) {
    if (digitalRead(IR_SENSOR_PIN) == IR_DETECTED_STATE) {
      delay(60); // Debounce
      if (digitalRead(IR_SENSOR_PIN) == IR_DETECTED_STATE) {
        alertActive = false;

        // Turn OFF Buzzer & Red LED, Turn ON Green LED
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        digitalWrite(GREEN_LED_PIN, HIGH);
        Serial.println("✅ IR Movement Detected! Buzzer OFF, Green LED ON.");

        // Immediately mark dose as TAKEN in the mobile app
        String payload = "{\"doseId\":\"" + activeDoseId + "\",\"deviceId\":\"" + String(deviceId) + "\"}";
        postToBackend("/doses/taken", payload);

        // Keep Green LED glowing for 5 seconds, then reset for next reminder
        delay(5000);
        digitalWrite(GREEN_LED_PIN, LOW);
        activeDoseId = "";
      }
    } else if (now - alertStartedAt >= ALERT_TIMEOUT_MS) {
      // If no movement detected within 25 seconds (e.g. 4:35 -> 5:00), mark as MISSED
      alertActive = false;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(RED_LED_PIN, LOW);
      Serial.println("⚠️ No IR movement detected within window — Marking dose as MISSED.");

      String payload = "{\"doseId\":\"" + activeDoseId + "\",\"deviceId\":\"" + String(deviceId) + "\"}";
      postToBackend("/doses/missed", payload);
      activeDoseId = "";
    }
  }

  delay(20);
}

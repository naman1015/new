#include <Wire.h>
#include <DS3231.h>
#include <LiquidCrystal_I2C.h>
#include <Stepper.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

// ---------- WIFI & APP BACKEND CONFIG ----------
// Configure these credentials before flashing to match your WiFi and backend .env
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://new-d966.onrender.com/api";
const char* DEVICE_ID     = "DISPENSER_01";
const char* DEVICE_SECRET = "REPLACE_WITH_YOUR_DEVICE_SECRET";

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

// ---------- ESP32 PIN ASSIGNMENTS ----------
const int GREEN_LED_PIN = 13;
const int RED_LED_PIN   = 18;
const int BUTTON_PIN    = 34;
const int IR_PIN        = 35;
const int BUZZER_PIN    = 14;

const int MOTOR_IN1 = 25;
const int MOTOR_IN2 = 26;
const int MOTOR_IN3 = 27;
const int MOTOR_IN4 = 32;

// ---------- OPTIONS ----------
const bool ENABLE_MOTOR  = true;
const bool ENABLE_BUZZER = true;

const unsigned long REMOVAL_TIMEOUT_MS = 60000UL; // Auto-stop after 60s if missed

const int STEPS_PER_REV = 2048;
const int STEPS_PER_COMPARTMENT = STEPS_PER_REV / 6;

// ---------- DEVICES ----------
DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Direct 8-phase half-step table for 28BYJ-48 + ULN2003 (high torque, reliable on ESP32)
const int HALF_STEP_SEQ[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

void stopMotorCoils() {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
  digitalWrite(MOTOR_IN3, LOW);
  digitalWrite(MOTOR_IN4, LOW);
}

// In half-step mode, 1 full revolution of 28BYJ-48 = 4096 half-steps (2048 full steps)
void stepMotorBy(int fullSteps) {
  if (fullSteps == 0) return;
  int halfSteps = abs(fullSteps) * 2;
  int dir = (fullSteps > 0) ? 1 : -1;
  static int phase = 0;

  for (int i = 0; i < halfSteps; i++) {
    phase = (phase + dir + 8) % 8;
    digitalWrite(MOTOR_IN1, HALF_STEP_SEQ[phase][0]);
    digitalWrite(MOTOR_IN2, HALF_STEP_SEQ[phase][1]);
    digitalWrite(MOTOR_IN3, HALF_STEP_SEQ[phase][2]);
    digitalWrite(MOTOR_IN4, HALF_STEP_SEQ[phase][3]);
    delay(2); // 2ms per half-step (~4ms per full step) -> maximum torque for 28BYJ-48
    if (i % 64 == 0) yield(); // Keep ESP32 watchdog happy
  }
  stopMotorCoils();
}

// ---------- MEDICINE SCHEDULES (Supports multiple daily reminder times per compartment) ----------
const int MAX_TIMES_PER_SLOT = 8;
int slotTimeCount[6] = {1, 1, 1, 1, 1, 1};
int MEDICINE_HOURS[6][MAX_TIMES_PER_SLOT] = {
  {8, -1, -1, -1, -1, -1, -1, -1},
  {9, -1, -1, -1, -1, -1, -1, -1},
  {13, -1, -1, -1, -1, -1, -1, -1},
  {14, -1, -1, -1, -1, -1, -1, -1},
  {20, -1, -1, -1, -1, -1, -1, -1},
  {21, -1, -1, -1, -1, -1, -1, -1}
};
int MEDICINE_MINUTES[6][MAX_TIMES_PER_SLOT] = {
  {0, -1, -1, -1, -1, -1, -1, -1},
  {0, -1, -1, -1, -1, -1, -1, -1},
  {0, -1, -1, -1, -1, -1, -1, -1},
  {0, -1, -1, -1, -1, -1, -1, -1},
  {0, -1, -1, -1, -1, -1, -1, -1},
  {0, -1, -1, -1, -1, -1, -1, -1}
};

// ---------- STATE ----------
int lastTriggerDate[6][MAX_TIMES_PER_SLOT] = {{0}};
int activeCompartment = -1;
String activeDoseId = "";
int currentMotorPosition = 0;

bool previousButtonState = HIGH;
bool irEventReported = false;

unsigned long waitingStartTime = 0;
unsigned long lastBeepTime = 0;
unsigned long lastAppSyncTime = 0;
bool waitingForRemoval = false;
bool buzzerState = false;

// Set this after testing your IR sensor.
// Many obstacle sensors output LOW when an object is detected.
const int IR_REMOVAL_STATE = HIGH;

// Forward declaration
void selectCompartment(int slot, const String& doseId = "");

// ---------- HELPERS ----------
int makeDateKey(int year, int month, int day) {
  return year * 10000 + month * 100 + day;
}

void printTwoDigits(int value) {
  if (value < 10) lcd.print('0');
  lcd.print(value);
}

void showClock(int hourNow, int minuteNow, int secondNow) {
  lcd.setCursor(0, 0);
  lcd.print("Time ");
  printTwoDigits(hourNow);
  lcd.print(':');
  printTwoDigits(minuteNow);
  lcd.print(':');
  printTwoDigits(secondNow);
  lcd.print(" ");
  lcd.setCursor(0, 1);
  lcd.print("Medicine Ready ");
}

// ---------- WIFI + DS3231 TIME SYNC & APP REPORTING ----------
void syncRTCWithNetworkTime() {
  if (WiFi.status() != WL_CONNECTED) return;

  // IST = UTC + 5:30 (19800 seconds)
  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 4000)) {
    rtc.setClockMode(false); // 24-hour mode
    rtc.setYear(timeinfo.tm_year - 100);
    rtc.setMonth(timeinfo.tm_mon + 1);
    rtc.setDate(timeinfo.tm_mday);
    rtc.setHour(timeinfo.tm_hour);
    rtc.setMinute(timeinfo.tm_min);
    rtc.setSecond(timeinfo.tm_sec);
    Serial.println("RTC automatically synced to current IST time!");
  }
}

void reportDoseToApp(int slotIndex, const String& doseId, bool taken) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SERVER_URL) + (taken ? "/doses/taken" : "/doses/missed");
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (url.startsWith("https://")) {
    secureClient.setCACert(ROOT_CA_CERT);
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);

  DynamicJsonDocument payloadDoc(256);
  payloadDoc["deviceId"] = DEVICE_ID;
  payloadDoc["slotIndex"] = slotIndex;
  if (doseId.length() > 0) {
    payloadDoc["doseId"] = doseId;
  }
  String payload;
  serializeJson(payloadDoc, payload);

  int code = http.POST(payload);
  Serial.printf("App notified (%s, slot=%d, doseId=%s) -> HTTP %d\n",
                taken ? "TAKEN" : "MISSED", slotIndex, doseId.c_str(), code);
  http.end();
}

void syncScheduleFromApp() {
  if (activeCompartment != -1) return;
  if (WiFi.status() != WL_CONNECTED) {
    if (strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
      WiFi.reconnect();
    }
    return;
  }

  HTTPClient http;
  String url = String(SERVER_URL) + "/doses/pending?deviceId=" + String(DEVICE_ID);
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (url.startsWith("https://")) {
    secureClient.setCACert(ROOT_CA_CERT);
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }

  http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);
  int code = http.GET();

  if (code == 200) {
    DynamicJsonDocument doc(4096);
    if (!deserializeJson(doc, http.getString())) {
      // 1. Update all daily reminder times per compartment from the mobile app
      if (doc.containsKey("slotSchedule")) {
        JsonArray slots = doc["slotSchedule"].as<JsonArray>();
        int newCounts[6] = {0, 0, 0, 0, 0, 0};
        int newHours[6][MAX_TIMES_PER_SLOT];
        int newMinutes[6][MAX_TIMES_PER_SLOT];
        for (int i = 0; i < 6; i++) {
          for (int t = 0; t < MAX_TIMES_PER_SLOT; t++) {
            newHours[i][t] = -1;
            newMinutes[i][t] = -1;
          }
        }

        for (JsonObject s : slots) {
          int idx = (s["slotIndex"] | 1) - 1;
          int h = s["hour"] | -1;
          int m = s["minute"] | -1;
          if (idx >= 0 && idx < 6 && h >= 0 && m >= 0 && newCounts[idx] < MAX_TIMES_PER_SLOT) {
            int pos = newCounts[idx]++;
            newHours[idx][pos] = h;
            newMinutes[idx][pos] = m;
          }
        }

        // Apply updated schedule per compartment while preserving trigger history for unchanged times
        for (int idx = 0; idx < 6; idx++) {
          if (newCounts[idx] == 0) continue;
          int updatedTriggers[MAX_TIMES_PER_SLOT] = {0};

          for (int t = 0; t < newCounts[idx]; t++) {
            int nh = newHours[idx][t];
            int nm = newMinutes[idx][t];
            int prevTrigger = 0;
            for (int oldIdx = 0; oldIdx < slotTimeCount[idx]; oldIdx++) {
              if (MEDICINE_HOURS[idx][oldIdx] == nh && MEDICINE_MINUTES[idx][oldIdx] == nm) {
                prevTrigger = lastTriggerDate[idx][oldIdx];
                break;
              }
            }
            updatedTriggers[t] = prevTrigger;
            if (t >= slotTimeCount[idx] || MEDICINE_HOURS[idx][t] != nh || MEDICINE_MINUTES[idx][t] != nm) {
              Serial.printf("Synced Compartment %d reminder #%d -> %02d:%02d\n", idx + 1, t + 1, nh, nm);
            }
          }

          slotTimeCount[idx] = newCounts[idx];
          for (int t = 0; t < MAX_TIMES_PER_SLOT; t++) {
            MEDICINE_HOURS[idx][t] = newHours[idx][t];
            MEDICINE_MINUTES[idx][t] = newMinutes[idx][t];
            lastTriggerDate[idx][t] = (t < newCounts[idx]) ? updatedTriggers[t] : 0;
          }
        }
      }

      // 2. If a scheduled dose from the app is due right now, trigger it with its exact doseId
      JsonObject nextDose = doc["nextDose"];
      if (!nextDose.isNull() && (nextDose["shouldAlertNow"] == true)) {
        int slotIdx = (nextDose["slotIndex"] | 1) - 1;
        String doseId = String(nextDose["_id"] | "");
        if (slotIdx >= 0 && slotIdx < 6) {
          selectCompartment(slotIdx, doseId);
        }
      }
    }
  }
  http.end();
}

// ---------- BUZZER ----------
void stopBuzzer() {
  digitalWrite(BUZZER_PIN, LOW);
  buzzerState = false;
}

void updateBuzzer() {
  if (!ENABLE_BUZZER || !waitingForRemoval) {
    stopBuzzer();
    return;
  }

  // Beep pattern: 250 ms ON, 250 ms OFF.
  unsigned long now = millis();
  if (now - lastBeepTime >= 250) {
    lastBeepTime = now;
    buzzerState = !buzzerState;
    digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
  }
}

// ---------- OPEN SELECTED COMPARTMENT & TRIGGER DUE ALERT (RED LED + BUZZER) ----------
void openCompartment() {
  int slot = activeCompartment;

  // Keep Green LED off while medicine is due
  digitalWrite(GREEN_LED_PIN, LOW);

  // Move stepper motor to open the selected compartment
  if (ENABLE_MOTOR) {
    int targetPosition = (slot + 1) * STEPS_PER_COMPARTMENT;
    int movement = targetPosition - currentMotorPosition;
    // Always rotate at least 1 compartment step if already at target during repeated tests
    if (movement == 0) {
      movement = STEPS_PER_COMPARTMENT;
    } else if (movement < 0) {
      movement += STEPS_PER_REV; // Always rotate forward clockwise
    }
    Serial.printf("Rotating motor by %d steps for Compartment %d...\n", movement, slot + 1);
    stepMotorBy(movement);
    currentMotorPosition = targetPosition % STEPS_PER_REV;
  }

  // Start the medicine-taking period immediately with RED LED and Buzzer
  waitingForRemoval = true;
  waitingStartTime = millis();

  digitalWrite(RED_LED_PIN, HIGH);
  lastBeepTime = millis();
  buzzerState = true;
  digitalWrite(BUZZER_PIN, ENABLE_BUZZER ? HIGH : LOW);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("MEDICINE DUE");
  lcd.setCursor(0, 1);
  lcd.print("Compartment ");
  lcd.print(slot + 1);

  Serial.print("EVENT: compartment_ready, compartment=");
  Serial.println(slot + 1);
}

void selectCompartment(int slot, const String& doseId) {
  activeCompartment = slot;
  activeDoseId = doseId;
  irEventReported = false;

  // Do NOT turn on Green LED before medicine is due; open compartment and alert with Red LED + Buzzer
  openCompartment();
}

// ---------- FINISH REMINDER ----------
void finishReminder(const char *reason) {
  if (activeCompartment < 0) return;

  int finishedSlot = activeCompartment + 1;
  String finishedDoseId = activeDoseId;
  bool wasTaken = (strcmp(reason, "timeout") != 0);

  Serial.print("EVENT: reminder_finished, compartment=");
  Serial.print(finishedSlot);
  Serial.print(", doseId=");
  Serial.print(finishedDoseId);
  Serial.print(", reason=");
  Serial.println(reason);

  // Turn off Red LED and Buzzer immediately
  digitalWrite(RED_LED_PIN, LOW);
  stopBuzzer();

  // If taken (IR sensor or button), light up Green LED to confirm intake
  if (wasTaken) {
    digitalWrite(GREEN_LED_PIN, HIGH);
  } else {
    digitalWrite(GREEN_LED_PIN, LOW);
  }

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(wasTaken ? "Dose Taken!" : "Dose Missed!");
  lcd.setCursor(0, 1);
  lcd.print("Ready");

  // Sync result with Mobile App in real time using exact doseId & slotIndex
  reportDoseToApp(finishedSlot, finishedDoseId, wasTaken);

  activeCompartment = -1;
  activeDoseId = "";
  waitingForRemoval = false;
  irEventReported = false;

  delay(1500);
  digitalWrite(GREEN_LED_PIN, LOW);
  lcd.clear();
}

// ---------- SCHEDULE ----------
void checkSchedule(
  int hourNow, int minuteNow,
  int yearNow, int monthNow, int dayNow
) {
  int today = makeDateKey(yearNow, monthNow, dayNow);

  for (int i = 0; i < 6; i++) {
    if (activeCompartment != -1) return;

    for (int t = 0; t < slotTimeCount[i]; t++) {
      if (MEDICINE_HOURS[i][t] < 0 || MEDICINE_MINUTES[i][t] < 0) continue;

      if (hourNow == MEDICINE_HOURS[i][t] &&
          minuteNow == MEDICINE_MINUTES[i][t] &&
          lastTriggerDate[i][t] != today) {

        lastTriggerDate[i][t] = today;
        selectCompartment(i, "");
        return;
      }
    }
  }
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);

  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT);
  pinMode(IR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Explicitly configure all 4 stepper motor driver pins as OUTPUT
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(MOTOR_IN3, OUTPUT);
  pinMode(MOTOR_IN4, OUTPUT);
  stopMotorCoils();

  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // GPIO21 = SDA; GPIO22 = SCL.
  Wire.begin(21, 22);

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Medicine");
  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  // Quick motor self-test on boot (rotates 1/12th turn forward & back so you see it work immediately)
  if (ENABLE_MOTOR) {
    Serial.println("Testing Stepper Motor on pins 25, 26, 27, 32...");
    stepMotorBy(170);
    delay(200);
    stepMotorBy(-170);
  }

  // Connect to WiFi (up to 15s timeout so device still works offline)
  if (strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting WiFi");
    lcd.setCursor(0, 1);
    lcd.print(WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long wifiStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) {
      delay(250);
      Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWiFi Connected!");
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi Connected!");
      lcd.setCursor(0, 1);
      lcd.print("Syncing App...");
      syncRTCWithNetworkTime();
      syncScheduleFromApp();
    } else {
      Serial.println("\nWiFi Failed - Check SSID/Password");
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("WiFi Failed!");
      lcd.setCursor(0, 1);
      lcd.print("Check SSID/Pass");
      delay(2000);
    }
  } else {
    Serial.println("WARNING: WIFI_SSID is still set to YOUR_WIFI_SSID!");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Set WIFI_SSID in");
    lcd.setCursor(0, 1);
    lcd.print("dispenser.ino!");
    delay(2500);
  }

  delay(1000);

  lcd.clear();
  lcd.print("System Ready");

  Serial.println("Smart Medicine Manager ready");
  Serial.println("Serial Monitor: 115200 baud");

  delay(1000);
  lcd.clear();
}

// ---------- MAIN LOOP ----------
void loop() {
  bool h12 = false;
  bool PM_time = false;
  bool Century = false;

  int secondNow = rtc.getSecond();
  int minuteNow = rtc.getMinute();
  int hourNow = rtc.getHour(h12, PM_time);

  if (h12) {
    hourNow %= 12;
    if (PM_time) hourNow += 12;
  }

  int dayNow = rtc.getDate();
  int monthNow = rtc.getMonth(Century);
  int yearNow = rtc.getYear();
  yearNow += Century ? 2100 : 2000;

  if (activeCompartment == -1) {
    showClock(hourNow, minuteNow, secondNow);
    checkSchedule(hourNow, minuteNow,
                  yearNow, monthNow, dayNow);

    // Every 5 seconds while idle, check mobile app for updated reminder times
    if (millis() - lastAppSyncTime >= 5000UL) {
      lastAppSyncTime = millis();
      syncScheduleFromApp();
    }
  }

  // Auto-timeout if pill is not removed within REMOVAL_TIMEOUT_MS
  if (waitingForRemoval &&
      millis() - waitingStartTime >= REMOVAL_TIMEOUT_MS) {
    finishReminder("timeout");
  }

  // IR removal detection. Confirm sensor polarity experimentally.
  int irState = digitalRead(IR_PIN);

  if (waitingForRemoval &&
      !irEventReported &&
      irState == IR_REMOVAL_STATE) {

    // Require the detected state to remain stable for 100 ms.
    delay(100);

    if (digitalRead(IR_PIN) == IR_REMOVAL_STATE) {
      irEventReported = true;
      Serial.print("EVENT: possible_removal, compartment=");
      Serial.println(activeCompartment + 1);
      finishReminder("IR sensor");
    }
  }

  // Button can acknowledge/stop the reminder as a manual override.
  // GPIO34 needs an external 10k pull-up to 3.3V.
  bool buttonState = digitalRead(BUTTON_PIN);

  if (previousButtonState == HIGH &&
      buttonState == LOW) {
    delay(30);

    if (digitalRead(BUTTON_PIN) == LOW &&
        activeCompartment != -1) {
      finishReminder("button override");
    }
  }

  previousButtonState = buttonState;

  updateBuzzer();

  delay(20);
}

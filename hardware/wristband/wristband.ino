#include <ESP8266WiFi.h>
#include <WiFiUdp.h>

// ─── CONFIGURATION ────────────────────────────────────────────────
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// UDP Port to listen on (must match the dispenser's port)
const unsigned int localUdpPort = 4210;
char packetBuffer[255]; 

WiFiUDP Udp;

// Pin Definitions
#define VIB_MOTOR_PIN  5  // D1 on ESP8266 NodeMCU/Mini
#define LED_PIN        2  // Built-in LED on ESP8266 (active LOW)

// ─── VIBRATION PATTERNS ───────────────────────────────────────────
void triggerAlert() {
  Serial.println("📳 Alert triggered! Vibrating...");
  
  // Alert pattern: 3 quick pulses of 1.5s vibration + 0.5s pause
  for (int i = 0; i < 3; i++) {
    digitalWrite(VIB_MOTOR_PIN, HIGH);
    digitalWrite(LED_PIN, LOW); // LED ON (active low)
    delay(1500);
    
    digitalWrite(VIB_MOTOR_PIN, LOW);
    digitalWrite(LED_PIN, HIGH); // LED OFF
    delay(500);
  }
}

// ─── SETUP ────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  
  // Initialize Pins
  pinMode(VIB_MOTOR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  
  digitalWrite(VIB_MOTOR_PIN, LOW);
  digitalWrite(LED_PIN, HIGH); // LED off
  
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
  
  // Start UDP Listening
  Udp.begin(localUdpPort);
  Serial.printf("Listening for alerts on UDP port %d...\n", localUdpPort);
  
  // Test vibration motor once on boot
  digitalWrite(VIB_MOTOR_PIN, HIGH);
  delay(300);
  digitalWrite(VIB_MOTOR_PIN, LOW);
}

// ─── LOOP ─────────────────────────────────────────────────────────
void loop() {
  int packetSize = Udp.parsePacket();
  if (packetSize) {
    Serial.printf("Received packet of size %d from %s:%d\n", 
                  packetSize, 
                  Udp.remoteIP().toString().c_str(), 
                  Udp.remotePort());
                  
    // Read the packet into packetBufffer
    int len = Udp.read(packetBuffer, 255);
    if (len > 0) {
      packetBuffer[len] = 0;
    }
    
    Serial.printf("Packet contents: %s\n", packetBuffer);
    
    // Check if it's our alert trigger
    if (strcmp(packetBuffer, "DOSE_ALERT") == 0) {
      triggerAlert();
    }
  }
  delay(10);
}

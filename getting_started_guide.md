# 🚀 Getting Started & Integration Guide

Welcome to your **Smart Medicine Manager (DoseTrack)**! This guide contains instructions on how to test, configure, and integrate your backend, frontend, hardware, and Telegram bot.

---

## 💻 1. Testing Backend & PWA Dashboard Locally

### 🟢 Starting the Backend
1. Open a terminal and run:
   ```bash
   cd ~/smart-medicine-manager/backend
   npm run dev
   ```
2. Verify that it outputs:
   ```
   ✅ Connected to MongoDB Atlas.
   🚀 Server running on port 5000
   ```

### 🔵 Starting the Frontend (React PWA)
1. Open a second terminal and run:
   ```bash
   cd ~/smart-medicine-manager/frontend
   npm run dev
   ```
2. Open your browser and go to: [http://localhost:5173](http://localhost:5173)
3. Register a new account. Notice the role selector dropdown (Patient / Caretaker / Doctor). Select **Patient** to see your personal dashboard, or select **Caretaker** to add patients.
4. Go to the **Meds** tab and click **+ Add** to schedule your first medication (select a slot 1-5, dose times, stock count, and LED indicator color).

---

## 🤖 2. Flashing the Hardware Firmware

We have created the code files inside your workspace.

### 🔌 Main Dispenser (ESP32)
1. Open the [dispenser.ino](file:///home/namandeep-singh/smart-medicine-manager/hardware/dispenser/dispenser.ino) file in **Arduino IDE**.
2. Install the following libraries from **Tools → Manage Libraries**:
   - `ArduinoJson` (by Benoit Blanchon)
   - `ESP32Servo` (by Kevin Harrington)
3. Change the WiFi configuration lines in the code:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
4. If running backend locally, set `serverUrl` to your computer's local IP address (e.g. `http://192.168.1.50:5000/api`).
5. Select your ESP32 board port, compile, and upload!

### 📳 Wristband Wearable (ESP8266 / D1 Mini)
1. Open the [wristband.ino](file:///home/namandeep-singh/smart-medicine-manager/hardware/wristband/wristband.ino) file in **Arduino IDE**.
2. Configure the same WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Connect the D1 Mini to your computer, compile, and flash.
4. On boot, the vibration motor will run for `300ms` once to verify it is functioning.

---

## 📳 3. Electrical Connections & Wiring Diagrams

### 📐 Stepper Motor & Driver (28BYJ-48 + ULN2003)
* Connect the Stepper motor ribbon cable directly to the **ULN2003 Driver Board**.
* **Driver Input Pins to ESP32:**
  - `IN1` → `GPIO 25`
  - `IN2` → `GPIO 26`
  - `IN3` → `GPIO 27`
  - `IN4` → `GPIO 14`
* **Driver Power:**
  - `+` (VCC) → Connect to external **5V power supply** (ESP32 5V pin can jitter).
  - `-` (GND) → Connect to **Common Ground (GND)**.

### 📐 Servo Motor (SG90)
- **Brown Wire** → Ground (GND)
- **Red Wire** → 5V Power
- **Orange Wire (Signal)** → `GPIO 21`

### 📐 IR Sensor (Pill Detection)
- **VCC** → `3.3V` or `5V`
- **GND** → Ground (GND)
- **OUT** → `GPIO 12`

### 📐 Wristband Wearable (Vibration Driver)
Because a haptic vibration motor draws more current than a GPIO pin can safely output (~75-100mA), we use a simple NPN transistor switch circuit:

```
                  +3.3V
                    │
                    ▼ (+)
             ┌──────────────┐
             │  Vibration   │
             │    Motor     │
             └──────────────┘
                    │ (-)
                    ├───┐
                   │    │ (Flyback Diode, e.g. 1N4007,
                 \ │    │  optional but recommended)
              C ──\┴────┘
   ESP8266  Base  ││ BC547 / 2N2222
  GPIO 5 ──[1kΩ]──││ Transistor
                B └──┬──
                     │ E
                     ▼
                    GND
```
- **GPIO 5 (D1)** connects to a `1kΩ` base resistor, which goes to the **Base** of a BC547/2N2222 transistor.
- The **Collector** connects to the negative lead of the vibration motor.
- The **Emitter** connects to Ground (GND).
- The positive lead of the vibration motor connects to `3.3V`.

---

## 🔔 4. Setting up the Telegram Bot

To enable instant haptic alerts on caretaker/patient phones:

1. Open Telegram on your phone and search for **@BotFather**.
2. Send `/newbot` and follow the instructions to choose a name and username for your bot.
3. BotFather will provide an **HTTP API Token**. Copy it.
4. Open the [.env](file:///home/namandeep-singh/smart-medicine-manager/backend/.env) file in the backend folder.
5. Paste your token:
   ```env
   TELEGRAM_BOT_TOKEN=your_token_from_botfather
   ```
6. Restart your backend server. The console should log: `✅ Telegram bot initialized successfully.`
7. On your phone, start a chat with your newly created bot and send `/start`. The bot will respond with your unique **Chat ID**.
8. Go to the profile page on your web dashboard, paste this Chat ID, and click **Save**. You are now linked to receive real-time notifications!

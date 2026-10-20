# 💊 DoseTrack — Smart Medicine Dispenser & Wearable Alert System

DoseTrack is an IoT-based healthcare assistant designed to improve medication adherence. It physical dispenses scheduled medication, verifies intake using an infrared sensor, broadcasts haptic vibration alerts to a wearable wristband (ideal for senior citizens or those with hearing impairments), and synchronizes all adherence data with a mobile-responsive web dashboard.

---

## 🚀 Key Features (Why this project stands out)

1. **🔒 Verified Intake (IR Sensor)** — The dispenser doesn't just open a door; it uses an IR beam at the exit to confirm that the pill was physically picked up.
2. **📳 Haptic Wristband Alert** — Dispenser broadcasts a local UDP signal to a wearable wristband (ESP8266 + vibration motor) which vibrates when a dose is due.
3. **🔔 Telegram Bot Notifications** — Caretakers receive instant alerts on their phone via a free Telegram Bot if a dose is taken (`✅`) or missed (`⚠️`).
4. **🎨 RGB LED Slot Indication** — Each of the 5 slots has a designated color that glows via a WS2812B LED strip to visually guide the patient.
5. **📱 Mobile-First React PWA** — The dashboard works on desktop and mobile, and can be installed on home screens like a native app.

---

## 📁 Repository Structure

```
smart-medicine-manager/
├── backend/                  # Node.js + Express API server
│   ├── src/
│   │   ├── index.js          # Entry point & Cron schedulers
│   │   ├── models/           # Mongoose schemas (User, Medication, Dose, Device)
│   │   ├── middleware/       # Auth tokens (JWT & Device Secrets)
│   │   ├── routes/           # REST endpoints
│   │   └── services/         # Telegram Bot sender
│   └── .env                  # Port, MongoDB URI, Telegram Token
│
├── frontend/                 # React + Vite Web App (PWA)
│   ├── src/
│   │   ├── App.jsx           # Client router
│   │   ├── index.css         # Global CSS Design Tokens & Styling
│   │   ├── components/       # UI (BottomNav, DoseCard, CountdownTimer)
│   │   └── pages/            # View pages (Home, Meds, Doses, History, Profile)
│   └── .env                  # Backend URL (VITE_API_URL)
│
└── hardware/                 # Arduino IDE C++ Firmware
    ├── dispenser/
    │   └── dispenser.ino     # Main dispenser code (ESP32)
    └── wristband/
        └── wristband.ino     # Wristband alert code (ESP8266/D1 Mini)
```

---

## ⚡ How to Run the Software

### 1. MongoDB Atlas Setup
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas) and create a free account.
2. Build a new Database Cluster (Free Tier).
3. Under **Database Access**, create a user (e.g. `namandeep1015_db_user`) with **Read and write to any database** roles.
4. Under **Network Access**, add IP `0.0.0.0/0` (Allow access from anywhere).
5. Go to Database → click **Connect** → **Drivers** and copy your connection string.

### 2. Run the Backend Server
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Verify the `.env` file matches your MongoDB connection string and credentials.
3. Start the server:
   ```bash
   npm start
   ```
   *Expected output:* `✅ Connected to MongoDB Atlas. Server running on port 5000.`

### 3. Run the React Web App
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev -- --host
   ```
3. Open the URL shown in the console:
   - Local: `http://localhost:5173/` (for your PC browser)
   - Network: `http://192.168.0.237:5173/` (open this on your mobile phone)

---

## 🔌 Hardware Setup & Schematics

### 1. Main Dispenser (ESP32 Pinout)
| Component Pin | ESP32 GPIO Pin |
|---|---|
| **ULN2003 (Stepper) IN1** | `GPIO 25` |
| **ULN2003 (Stepper) IN2** | `GPIO 26` |
| **ULN2003 (Stepper) IN3** | `GPIO 27` |
| **ULN2003 (Stepper) IN4** | `GPIO 14` |
| **SG90 Servo (Signal)** | `GPIO 21` |
| **IR Sensor (OUT)** | `GPIO 12` |

> ⚠️ **Power Note:** Stepper and Servo motors draw high spike currents. Do NOT power them directly from the ESP32 pins. Use an external 5V 2A power adapter and share a **Common Ground (GND)** between the adapter and ESP32.

### 2. Wearable Band (D1 Mini ESP8266 Pinout)
Because haptic vibration motors draw ~80mA, use a transistor driver to protect the microcontroller:

- **GPIO 5 (D1)** → `1kΩ resistor` → **Base** of BC547 transistor.
- **Collector** → Motor negative terminal `-`.
- **Emitter** → Ground (GND).
- **Motor positive terminal `+`** → `3.3V` pin.

---

## 📟 Dispenser to Dashboard Linking

1. In your ESP32 code, set a device identifier:
   ```cpp
   const char* deviceId = "DISPENSER_01";
   ```
2. Once the ESP32 connects to WiFi, it sends a heartbeat to the server, registering `DISPENSER_01`.
3. Log in to the app on your mobile phone, go to the **Profile** page, type `DISPENSER_01` under **Dispenser Device**, and click **Link**.
4. The dashboard will now show live telemetry (online status, WiFi signal dBm, uptime, last check-in).

---

## 🔔 Setting up Telegram Alerts

1. Open Telegram and message **@BotFather**.
2. Send `/newbot` and name your bot. Copy the **API HTTP Token**.
3. Paste the token into your backend `.env` file:
   ```env
   TELEGRAM_BOT_TOKEN=your_token_here
   ```
4. Restart the backend server.
5. Message your bot on Telegram and send `/start`. It will reply with your unique **Chat ID**.
6. Paste your Chat ID in the **Profile** tab on the web app to activate alerts.

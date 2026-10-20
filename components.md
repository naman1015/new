# 📦 Smart Medicine Manager (DoseTrack) — Components List

This is the complete shopping list of components required to build both the main medicine dispenser unit and the senior citizen wearable wristband.

---

## 🖥️ 1. Main Dispenser Unit (The Box)

| Component | Purpose | Recommended Model | Approx Price (INR) |
|---|---|---|---|
| **Microcontroller** | Main controller. Connects to WiFi, polls database, controls motors. | **ESP32 DevKit v1** (or ESP32-WROOM-32) | ₹350 - ₹500 |
| **Rotator Motor** | Rotates the carousel/compartments to line up the scheduled slot. | **28BYJ-48 Stepper Motor** | ₹120 - ₹150 |
| **Motor Driver** | Amplifies signals from ESP32 to drive the stepper motor. | **ULN2003 Driver Board** (usually bundled with motor) | (Bundled) |
| **Lid Opener** | Automatically opens and closes the dispensing lid. | **SG90 Servo Motor (9g)** | ₹80 - ₹120 |
| **Pill Sensor** | Infrared beam to verify if patient actually picked up the pill. | **IR Sensor Module** (FC-51 obstacle sensor) | ₹40 - ₹60 |
| **LED Indicators** | Glows the slot's designated color to guide the patient. | **WS2812B Addressable RGB LED strip** (5 LEDs) | ₹100 - ₹150 |
| **Power Supply** | High-current power adapter for smooth motor rotation. | **5V 2A Power Adapter** (standard mobile charger + micro USB) | ₹0 (existing) |

---

## 📳 2. Wearable Wristband (Alert Device)

| Component | Purpose | Recommended Model | Approx Price (INR) |
|---|---|---|---|
| **Microcontroller** | Small, budget WiFi module for the wearable wristband. | **ESP8266 D1 Mini** (or NodeMCU ESP8266) | ₹180 - ₹250 |
| **Haptic Motor** | Vibrates when haptic alert signal is received. | **3V Coin Vibration Motor** | ₹30 - ₹50 |
| **Switch Transistor** | Allows the D1 Mini pin to safely power the vibration motor. | **BC547** (or 2N2222) NPN Transistor | ₹5 |
| **Resistor** | Placed between GPIO pin and transistor Base pin. | **1kΩ Resistor** | ₹1 |
| **Battery** | Rechargeable power source for the wristband. | **3.7V LiPo Battery** (300mAh - 500mAh) | ₹150 - ₹200 |
| **Charger Module** | Charges the LiPo battery safely via micro USB. | **TP4056 Battery Charger** (with protection circuit) | ₹30 - ₹50 |

---

## 🛠️ 3. Prototyping Essentials

* **Jumper Wires:** Ribbon of Male-to-Male, Female-to-Female, and Male-to-Female wires (₹100).
* **Half-Size Breadboard:** For testing connections before soldering (₹80).

---

> 💡 **Tip:** You can purchase these components on online electronics stores such as [Robu.in](https://robu.in), [QuartzComponents.com](https://quartzcomponents.com), or local electronics hobby stores.

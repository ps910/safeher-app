<div align="center">
  <img src="https://raw.githubusercontent.com/expo/expo/main/docs/public/static/images/expo-logo.png" width="80" height="80" alt="Expo Logo">

  # 🛡️ SafeHer: Women's Safety App

  <p><strong>A modern, empowering, and reliable personal safety application built with React Native.</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#installation">Installation</a> •
    <a href="#how-to-use">How to Use</a> •
    <a href="#contributing">Contributing</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue?style=for-the-badge&logo=react" alt="Platform">
    <img src="https://img.shields.io/badge/React%20Native-0.73-61DAFB?style=for-the-badge&logo=react" alt="React Native">
    <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" alt="Status">
  </p>
</div>

---

## 🌟 Overview

**SafeHer** is a comprehensive mobile application designed to empower women and girls by providing critical safety tools right at their fingertips. Whether you're commuting, working late, or traveling to new places, SafeHer ensures that help is always just a tap—or a shake—away.

With features like real-time location tracking, discreet emergency alerts, AI sound detection, and simulated fake calls, SafeHer is your digital guardian angel.

---

## 🚀 Key Features

### 🆘 Emergency SOS & Disruption
- **One-Tap SOS:** Instantly triggers an emergency workflow with a customizable countdown.
- **Shake-to-SOS:** Discreetly activate an emergency alert by aggressively shaking your device 3 times.
- **Loud Sound / Scream Detection:** Automatically prompts for SOS when the microphone detects a sudden loud noise.
- **Inactivity Check-ins:** Set a timer; if you fail to check in, an SOS is automatically dispatched.
- **Siren & Audio Evidence:** Trigger a loud alarm to deter threats and silently capture high-quality audio recordings for evidence.

### 📍 Location Tracking & Journeys
- **Live Location Sharing:** Share your real-time GPS coordinates via SMS, WhatsApp, or natively to trusted contacts.
- **Journey Tracker:** Start a journey with an expected arrival time. If you're overdue, the app alerts you and can auto-trigger SOS.
- **Guardian Mode:** Keep your live location persistently tracked in high-risk zones.

### 👥 Trusted Network
- **Emergency Contacts:** Pre-load up to 5 critical contacts to instantly notify during emergencies.
- **Dual Delivery:** Attempts push notifications first, gracefully falling back to offline SMS if internet is unavailable.

### 🤫 Stealth & De-escalation
- **Stealth Calculator Mode:** Disguise the app as a standard calculator. Entering a secret PIN instantly triggers an SOS.
- **Fake Call Simulation:** Generate a realistic, fully-interactive incoming phone call (Mom, Police, Boss) with customizable delays to escape uncomfortable situations.

### 📚 Education & Prevention
- **Safety Tips:** Over 30 actionable safety strategies categorized across Travel, Online, Self-Defense, Workplace, and Home.
- **Global Emergency Helplines:** Quick access to localized emergency numbers (Police, Ambulance, Women's Helplines).

---

## 🛠️ Tech Stack & Architecture

SafeHer is built on a modern mobile stack ensuring performance, reliability, and cross-platform compatibility.

- **Framework:** [React Native](https://reactnative.dev/) (v0.73)
- **Toolchain:** [Expo](https://expo.dev/) (Camera, Location, AV, Haptics, Sensors)
- **Navigation:** [React Navigation v6](https://reactnavigation.org/)
- **State Management:** React Context API + `useReducer`
- **Storage:** `@react-native-async-storage/async-storage` for local persistence
- **Styling:** Custom unified Design System (`theme.ts`) with Light/Dark mode support

---

## 📁 Project Structure

```text
girl-safety-app/
├── App.js                     # Root Application Hub
├── index.js                   # Entry Point
├── package.json               # Dependencies & Scripts
├── app.json                   # Expo Configuration
└── src/
    ├── config/                # Environment & API Configs
    ├── constants/             # Design System (theme.ts, globals)
    ├── context/               # Global State (EmergencyContext)
    ├── navigation/            # Stack & Tab Navigators
    ├── screens/               # UI Views (HomeScreen, FakeCall, etc.)
    ├── services/              # Notification & Background Services
    ├── types/                 # TypeScript Definitions
    └── utils/                 # Geolocation, SMS, Call Helpers
```

---

## 💻 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Expo Go app on your physical device (or Android Studio / Xcode for emulators)

### Quick Start

1. **Clone the repository (or navigate to the folder)**
   ```bash
   cd "girl safety app"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Development Server**
   ```bash
   npm start
   ```

4. **Run on Device**
   - Scan the QR code presented in your terminal using the **Expo Go** app on your physical iOS or Android device.
   - Alternatively, press `a` to run on an Android Emulator or `i` to run on an iOS Simulator.

---

## 📱 How It Works (User Guide)

1. **Onboarding:** Set up your profile, grant critical permissions (Location, Microphone, Contacts), and add at least 1 Emergency Contact.
2. **Configure Settings:** Navigate to Settings to enable features like *Shake-to-SOS*, *Scream Detection*, or *Stealth Mode*.
3. **Daily Use:** Use the main dashboard to start a Journey, trigger a Fake Call, or quickly dial Emergency Services.
4. **In an Emergency:** 
   - Tap the large SOS button.
   - Shake your phone 3 times.
   - Enter your secret PIN in the Stealth Calculator.
   *The app will vibrate, capture your location, start audio recording, and dispatch alerts to your contacts.*

---

## 🔐 Privacy & Permissions

SafeHer requires specific device permissions to function correctly. **We do not sell or store your data on external trackers.** All your private data (contacts, location history, audio evidence) remains strictly localized on your device unless explicitly shared.

| Permission | Purpose |
|------------|---------|
| **Location** | Pinpointing your coordinates to send to trusted contacts. |
| **Microphone** | Audio evidence recording and loud sound detection. |
| **SMS/Call** | Sending offline alerts and calling emergency services. |
| **Sensors** | Detecting aggressive shaking for discreet SOS triggers. |

---

## 🤝 Contributing

We welcome contributions to make SafeHer even better! 
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## ⚠️ Disclaimer & Legal

**SafeHer is a supplementary safety tool.** It is not a replacement for professional emergency services or common sense. In a life-threatening situation, always attempt to contact local law enforcement directly (e.g., dial 911 / 112 / 100) as your primary action. The developers assume no liability for the failure of the app to send messages due to network unavailability or device limitations.

---

<div align="center">
  <p>Built with ❤️ to make the world a safer place for everyone.</p>
</div>

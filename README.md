# 👩‍🦰 Girl Safety App

A **React Native** mobile application for **Android & iOS** designed to help women and girls stay safe with emergency features, location sharing, fake calls, and safety education.

---

## 🌟 Features

### 🆘 SOS Emergency Button
- **One-tap SOS** with customizable countdown timer (3s, 5s, 10s, 15s)
- Sends **SMS alerts with GPS location** to all emergency contacts
- **Vibration alerts** and option to auto-call police
- Cancel countdown if pressed accidentally

### 👥 Emergency Contacts
- Add up to **5 trusted emergency contacts**
- Quick call or message any contact
- Contacts receive SOS alerts with your live location link

### 📍 Location Sharing
- View your **current GPS coordinates**
- **Share location** via WhatsApp, SMS, or any app
- **Live tracking mode** - auto-shares location every 30 seconds
- One-tap send location to all emergency contacts

### 📞 Fake Call
- Simulate a **realistic incoming phone call**
- Choose from **preset callers** (Mom, Dad, Friend, Boss) or add custom
- Set **call delay** (now, 5s, 10s, 15s, 30s, 1 min)
- Full incoming call UI with answer/decline buttons
- Active call screen with timer and controls

### 📖 Safety Tips
- **6 categories**: Travel, Online, Self-Defense, Workplace, Emergency, Home
- **30+ actionable safety tips**
- Easy-to-read card-based layout

### 🚨 Emergency Helplines (India)
- Police: **100**
- Women Helpline: **1091**
- Ambulance: **108**
- National Emergency: **112**
- Child Helpline: **1098**

### ⚙️ Settings
- Toggle shake-to-SOS, auto-location, siren sound
- Customize SOS countdown timer
- Edit emergency SOS message
- Auto-call police option

---

## 🛠️ Tech Stack

- **React Native** 0.73 (Cross-platform: Android + iOS)
- **React Navigation** 6 (Tab + Stack navigation)
- **AsyncStorage** (Local data persistence)
- **React Native Geolocation** (GPS location)
- **React Native Shake** (Shake detection for SOS)

---

## 📁 Project Structure

```
girl-safety-app/
├── App.js                          # Root component
├── index.js                        # App entry point
├── package.json                    # Dependencies
├── app.json                        # App configuration
├── babel.config.js                 # Babel config
└── src/
    ├── constants/
    │   └── theme.js                # Colors, fonts, sizes
    ├── context/
    │   └── EmergencyContext.js      # Global state management
    ├── navigation/
    │   └── AppNavigator.js         # Navigation setup
    ├── screens/
    │   ├── HomeScreen.js           # Dashboard + SOS button
    │   ├── ContactsScreen.js       # Emergency contacts management
    │   ├── LocationScreen.js       # Location sharing
    │   ├── FakeCallScreen.js       # Fake call feature
    │   ├── SafetyTipsScreen.js     # Safety tips & education
    │   └── SettingsScreen.js       # App settings
    └── utils/
        └── helpers.js              # Utility functions
```

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** 18+ installed
- **React Native CLI** setup complete
- **Android Studio** (for Android) or **Xcode** (for iOS/Mac)
- **JDK 17** for Android builds

### Step 1: Install Dependencies
```bash
cd "girl safety app"
npm install
```

### Step 2: Run on Android
```bash
# Start Metro bundler
npm start

# In another terminal, run on Android
npm run android
```

### Step 3: Run on iOS (Mac only)
```bash
cd ios
pod install
cd ..
npm run ios
```

---

## 📱 How to Use

1. **Add Emergency Contacts** - Go to Contacts tab and add trusted people
2. **Press SOS Button** - In an emergency, press the big red SOS button on the home screen
3. **Share Location** - Use the Location tab to share your GPS with anyone
4. **Fake Call** - Use the Fake Call feature to escape uncomfortable situations
5. **Read Safety Tips** - Educate yourself with 30+ safety tips across 6 categories

---

## 🔐 Permissions Required

| Permission | Purpose |
|-----------|---------|
| Location | Share GPS coordinates in emergencies |
| SMS | Send SOS alerts to emergency contacts |
| Phone | Make emergency calls |
| Vibration | SOS and fake call vibration alerts |

---

## 🎨 Color Theme
- **Primary**: Pink (#E91E63) - Empowering & recognizable
- **Danger/SOS**: Red (#FF1744) - Emergency actions
- **Safe**: Green (#00E676) - Safe status
- **Background**: Lavender Blush (#FFF0F5) - Calming

---

## 📞 Emergency Numbers (India)

| Service | Number |
|---------|--------|
| Police | 100 |
| Women Helpline | 1091 |
| Ambulance | 108 |
| Fire | 101 |
| National Emergency | 112 |
| Child Helpline | 1098 |
| Women Commission | 7827-170-170 |

---

## 🤝 Contributing

Feel free to contribute to make this app better and help more women stay safe!

---

## ⚠️ Disclaimer

This app is a safety tool and should be used alongside other safety measures. In a real emergency, always contact local law enforcement directly by calling the emergency number.

---

**Made with ❤️ for women's safety**

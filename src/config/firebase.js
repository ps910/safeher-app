// ─────────────────────────────────────────────────────────────────────────────
//  🔥 FIREBASE CONFIG
//  Replace every value below with your own from:
//  Firebase Console → Project Settings → Your apps → SDK setup → Web app
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            "AIzaSyBAVga_tZD7cs2NmB0SKbrAjjdYid_osOU",
  authDomain:        "safeher-app-242a1.firebaseapp.com",
  databaseURL:       "https://safeher-app-242a1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "safeher-app-242a1",
  storageBucket:     "safeher-app-242a1.firebasestorage.app",
  messagingSenderId: "684405408737",
  appId:             "1:684405408737:web:236fc2dadc5151c9cac8a0",
  measurementId:     "G-XVCHZK88WL",
};

// Prevent duplicate app initialization (safe across hot reloads)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// initializeAuth can only be called once — fall back to getAuth on repeat calls
/** @type {import('firebase/auth').Auth} */
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export default app;

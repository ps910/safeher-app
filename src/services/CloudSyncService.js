/**
 * CloudSyncService — Firebase Realtime Database sync for SafeHer
 *
 * ═══════════════════════════════════════════════════════════════════
 *  WHERE IS USER DATA STORED?
 * ═══════════════════════════════════════════════════════════════════
 *
 *  1. LOCAL (on device):
 *     - AsyncStorage — key-value pairs under @safeher_db_* keys
 *     - Stored in SQLite on Android, file-backed on iOS
 *     - Works offline, survives app restart
 *     - User can clear by uninstalling app or Panic Wipe
 *
 *  2. CLOUD (Firebase Realtime Database):
 *     - All SOS events, locations, evidence metadata, contacts
 *     - Syncs automatically when device is online
 *     - App owner can access via Firebase Console:
 *       https://console.firebase.google.com → Select project → Realtime Database
 *     - Data organized by device ID under /users/{deviceId}/
 *     - Admin dashboard reads from /admin/ collection
 *
 * ═══════════════════════════════════════════════════════════════════
 *  HOW THE APP OWNER ACCESSES DATA:
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Method 1: Firebase Console (easiest)
 *    - Go to https://console.firebase.google.com
 *    - Select your project → Realtime Database
 *    - Browse: /users/{deviceId}/sos_events, /locations, /evidence, etc.
 *    - Use "Export JSON" to download all data
 *
 *  Method 2: Firebase Admin SDK (for custom admin panel)
 *    - Use firebase-admin on your Node.js server
 *    - Query /admin/active_sos for live SOS events
 *    - Query /admin/statistics for aggregate stats
 *
 *  Method 3: REST API (no SDK needed)
 *    - GET https://{project}.firebaseio.com/admin.json?auth={token}
 *    - Returns all admin data as JSON
 *
 *  Method 4: In-App Export
 *    - DatabaseUtils.exportAll() exports all local data as JSON
 *    - Can be emailed/shared from the Evidence Vault screen
 *
 * ═══════════════════════════════════════════════════════════════════
 *  SETUP INSTRUCTIONS:
 * ═══════════════════════════════════════════════════════════════════
 *
 *  1. Go to https://console.firebase.google.com
 *  2. Create a new project (e.g., "SafeHer-App")
 *  3. Click "Build" → "Realtime Database" → "Create Database"
 *  4. Choose region, start in TEST mode (for dev) or locked mode (for prod)
 *  5. Go to Project Settings → General → "Your apps" → Add Web App
 *  6. Copy the firebaseConfig object
 *  7. Paste it in FIREBASE_CONFIG below
 *  8. Done! Data will sync automatically.
 *
 *  For production, set these Realtime Database rules:
 *  {
 *    "rules": {
 *      "users": {
 *        "$deviceId": {
 *          ".read": "auth != null",
 *          ".write": "auth != null"
 *        }
 *      },
 *      "admin": {
 *        ".read": "auth != null && auth.token.admin === true",
 *        ".write": "auth != null"
 *      }
 *    }
 *  }
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase, ref, set, push, update, get, onValue,
  serverTimestamp, query, orderByChild, limitToLast,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ═══════════════════════════════════════════════════════════════════
//  🔧 PASTE YOUR FIREBASE CONFIG HERE
// ═══════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBAVga_tZD7cs2NmB0SKbrAjjdYid_osOU',
  authDomain: 'safeher-app-242a1.firebaseapp.com',
  databaseURL: 'https://safeher-app-242a1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'safeher-app-242a1',
  storageBucket: 'safeher-app-242a1.firebasestorage.app',
  messagingSenderId: '684405408737',
  appId: '1:684405408737:web:236fc2dadc5151c9cac8a0',
  measurementId: 'G-XVCHZK88WL',
};

// ─── Configuration ───────────────────────────────────────────────
const SYNC_INTERVAL_MS = 60000;           // Sync every 60 seconds
const MAX_BATCH_SIZE = 50;                // Max records per sync batch
const CLOUD_SYNC_KEY = '@safeher_cloud_sync_enabled';
const LAST_SYNC_KEY = '@safeher_last_sync';

class CloudSyncServiceClass {
  constructor() {
    this.app = null;
    this.db = null;
    this.deviceId = null;
    this.isInitialized = false;
    this.isSyncing = false;
    this.syncInterval = null;
    this.isEnabled = false;
    this.lastSyncTime = null;
    this.syncStats = { total: 0, success: 0, failed: 0, lastError: null };
    this.listeners = new Set();
  }

  // ─── Initialize Firebase ─────────────────────────────────────
  async init(deviceId) {
    this.deviceId = deviceId;

    // Check if cloud sync is enabled by user
    try {
      const enabled = await AsyncStorage.getItem(CLOUD_SYNC_KEY);
      this.isEnabled = enabled === 'true';
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      if (lastSync) this.lastSyncTime = new Date(lastSync);
    } catch (e) {}

    // Only initialize Firebase if config is filled in
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
      console.log('[CloudSync] Firebase not configured — running in local-only mode');
      console.log('[CloudSync] To enable cloud sync, add your Firebase config in CloudSyncService.js');
      return false;
    }

    try {
      // Initialize Firebase (avoid re-init)
      if (getApps().length === 0) {
        this.app = initializeApp(FIREBASE_CONFIG);
      } else {
        this.app = getApps()[0];
      }
      this.db = getDatabase(this.app);
      this.isInitialized = true;

      console.log('[CloudSync] ✅ Firebase initialized');

      // Start periodic sync if enabled
      if (this.isEnabled) {
        this.startPeriodicSync();
      }

      return true;
    } catch (e) {
      console.error('[CloudSync] Firebase init error:', e);
      return false;
    }
  }

  // ─── Enable / Disable Cloud Sync ──────────────────────────────
  async enableSync() {
    this.isEnabled = true;
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, 'true');
    this.startPeriodicSync();
    // Do an immediate sync
    await this.syncAll();
    this._notify({ type: 'sync_enabled' });
  }

  async disableSync() {
    this.isEnabled = false;
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, 'false');
    this.stopPeriodicSync();
    this._notify({ type: 'sync_disabled' });
  }

  // ─── Periodic Sync ────────────────────────────────────────────
  startPeriodicSync() {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => {
      if (this.isEnabled && this.isInitialized) {
        this.syncAll().catch(e => console.log('[CloudSync] Periodic sync error:', e));
      }
    }, SYNC_INTERVAL_MS);
    console.log(`[CloudSync] Periodic sync started (every ${SYNC_INTERVAL_MS / 1000}s)`);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ─── Event Listeners ──────────────────────────────────────────
  addListener(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _notify(event) {
    this.listeners.forEach(cb => { try { cb(event); } catch (e) {} });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CORE SYNC METHODS — Push local data to Firebase
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sync a single record to Firebase
   * Path: /users/{deviceId}/{collection}/{recordId}
   */
  async syncRecord(collection, recordId, data) {
    if (!this.isInitialized || !this.isEnabled) return false;

    try {
      const path = `users/${this.deviceId}/${collection}/${recordId}`;
      const dbRef = ref(this.db, path);
      await set(dbRef, {
        ...data,
        _deviceId: this.deviceId,
        _syncedAt: new Date().toISOString(),
        _platform: Platform.OS,
      });
      this.syncStats.success++;
      return true;
    } catch (e) {
      this.syncStats.failed++;
      this.syncStats.lastError = e.message;
      return false;
    }
  }

  /**
   * Sync a batch of records
   */
  async syncBatch(collection, records) {
    if (!this.isInitialized || !this.isEnabled || !records?.length) return 0;

    let synced = 0;
    const batch = records.slice(0, MAX_BATCH_SIZE);

    try {
      const updates = {};
      for (const record of batch) {
        const key = record.id || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        updates[`users/${this.deviceId}/${collection}/${key}`] = {
          ...record,
          _syncedAt: new Date().toISOString(),
          _platform: Platform.OS,
        };
      }
      await update(ref(this.db), updates);
      synced = batch.length;
      this.syncStats.success += synced;
    } catch (e) {
      console.error(`[CloudSync] Batch sync error for ${collection}:`, e);
      this.syncStats.failed += batch.length;
      this.syncStats.lastError = e.message;
    }

    return synced;
  }

  // ═══════════════════════════════════════════════════════════════
  //  HIGH-PRIORITY: SOS Event Sync (immediate)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Push SOS event IMMEDIATELY to cloud — this is critical safety data
   * Also writes to /admin/active_sos for owner visibility
   */
  async syncSOSEvent(sosEvent) {
    if (!this.isInitialized) return false;

    try {
      const eventData = {
        ...sosEvent,
        _deviceId: this.deviceId,
        _platform: Platform.OS,
        _syncedAt: new Date().toISOString(),
        _priority: 'CRITICAL',
      };

      // Write to user's SOS events
      const userRef = ref(this.db, `users/${this.deviceId}/sos_events/${sosEvent.id}`);
      await set(userRef, eventData);

      // ALSO write to /admin/active_sos for owner dashboard
      const adminRef = ref(this.db, `admin/active_sos/${sosEvent.id}`);
      await set(adminRef, {
        ...eventData,
        status: 'ACTIVE',
        needsResponse: true,
      });

      // Increment global SOS counter
      const statsRef = ref(this.db, 'admin/statistics/total_sos_events');
      const snap = await get(statsRef);
      const current = snap.exists() ? snap.val() : 0;
      await set(statsRef, current + 1);

      console.log('[CloudSync] 🚨 SOS event synced to cloud immediately');
      this._notify({ type: 'sos_synced', sosId: sosEvent.id });
      return true;
    } catch (e) {
      console.error('[CloudSync] SOS sync error:', e);
      return false;
    }
  }

  /**
   * Update live SOS location in cloud
   */
  async syncSOSLocation(alertId, location) {
    if (!this.isInitialized) return false;

    try {
      const locData = {
        latitude: location?.coords?.latitude,
        longitude: location?.coords?.longitude,
        accuracy: location?.coords?.accuracy,
        speed: location?.coords?.speed,
        heading: location?.coords?.heading,
        timestamp: new Date().toISOString(),
      };

      // Update user's alert location
      await update(ref(this.db, `users/${this.deviceId}/sos_events/${alertId}`), {
        lastLocation: locData,
        lastLocationUpdate: new Date().toISOString(),
      });

      // Update admin view
      await update(ref(this.db, `admin/active_sos/${alertId}`), {
        lastLocation: locData,
        lastLocationUpdate: new Date().toISOString(),
      });

      // Push to location trail
      const trailRef = ref(this.db, `users/${this.deviceId}/sos_events/${alertId}/locationTrail`);
      await push(trailRef, locData);

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Resolve SOS in cloud
   */
  async resolveSOSEvent(alertId) {
    if (!this.isInitialized) return false;

    try {
      await update(ref(this.db, `admin/active_sos/${alertId}`), {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
        needsResponse: false,
      });
      await update(ref(this.db, `users/${this.deviceId}/sos_events/${alertId}`), {
        status: 'RESOLVED',
        resolvedAt: new Date().toISOString(),
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  FULL DATA SYNC (periodic background)
  // ═══════════════════════════════════════════════════════════════

  async syncAll() {
    if (!this.isInitialized || !this.isEnabled || this.isSyncing) return;

    this.isSyncing = true;
    this.syncStats.total++;

    try {
      // Read all local data
      const DB_PREFIX = '@safeher_db_';
      const collections = [
        { key: `${DB_PREFIX}evidence`, name: 'evidence' },
        { key: `${DB_PREFIX}alerts`, name: 'alerts' },
        { key: `${DB_PREFIX}locations`, name: 'locations' },
        { key: `${DB_PREFIX}sos_history`, name: 'sos_history' },
        { key: `${DB_PREFIX}contacts`, name: 'contacts' },
      ];

      for (const col of collections) {
        try {
          const raw = await AsyncStorage.getItem(col.key);
          if (!raw) continue;
          const records = JSON.parse(raw);
          if (!Array.isArray(records) || records.length === 0) continue;

          // Only sync records newer than last sync
          const newRecords = this.lastSyncTime
            ? records.filter(r => new Date(r.createdAt || r.timestamp) > this.lastSyncTime)
            : records;

          if (newRecords.length > 0) {
            await this.syncBatch(col.name, newRecords);
          }
        } catch (e) {
          console.log(`[CloudSync] Skip ${col.name}:`, e.message);
        }
      }

      // Sync user profile
      try {
        const profile = await AsyncStorage.getItem('@gs_user_profile');
        if (profile) {
          await this.syncRecord('profile', 'current', JSON.parse(profile));
        }
      } catch (e) {}

      // Update admin statistics
      await this._syncAdminStats();

      // Update last sync time
      this.lastSyncTime = new Date();
      await AsyncStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime.toISOString());

      console.log(`[CloudSync] ✅ Full sync complete (${this.syncStats.success} records)`);
      this._notify({ type: 'sync_complete', stats: { ...this.syncStats } });
    } catch (e) {
      console.error('[CloudSync] Full sync error:', e);
    }

    this.isSyncing = false;
  }

  /**
   * Push aggregate statistics to /admin/statistics
   */
  async _syncAdminStats() {
    if (!this.isInitialized) return;

    try {
      const DB_PREFIX = '@safeher_db_';
      const [evidence, alerts, locations, sosHistory] = await Promise.all([
        AsyncStorage.getItem(`${DB_PREFIX}evidence`),
        AsyncStorage.getItem(`${DB_PREFIX}alerts`),
        AsyncStorage.getItem(`${DB_PREFIX}locations`),
        AsyncStorage.getItem(`${DB_PREFIX}sos_history`),
      ]);

      const stats = {
        deviceId: this.deviceId,
        platform: Platform.OS,
        lastSeen: new Date().toISOString(),
        evidenceCount: evidence ? JSON.parse(evidence).length : 0,
        alertsCount: alerts ? JSON.parse(alerts).length : 0,
        locationsCount: locations ? JSON.parse(locations).length : 0,
        sosEventsCount: sosHistory ? JSON.parse(sosHistory).length : 0,
      };

      await set(ref(this.db, `admin/devices/${this.deviceId}`), stats);
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN: Owner can query these from Firebase Console
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get all active SOS events across ALL devices (for admin dashboard)
   */
  async getActiveSOSForAdmin() {
    if (!this.isInitialized) return [];

    try {
      const snapshot = await get(ref(this.db, 'admin/active_sos'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      return Object.values(data).filter(e => e.status === 'ACTIVE');
    } catch (e) {
      return [];
    }
  }

  /**
   * Get all registered devices (for admin dashboard)
   */
  async getRegisteredDevices() {
    if (!this.isInitialized) return [];

    try {
      const snapshot = await get(ref(this.db, 'admin/devices'));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val());
    } catch (e) {
      return [];
    }
  }

  /**
   * Get global statistics (for admin dashboard)
   */
  async getGlobalStats() {
    if (!this.isInitialized) return null;

    try {
      const snapshot = await get(ref(this.db, 'admin/statistics'));
      return snapshot.exists() ? snapshot.val() : null;
    } catch (e) {
      return null;
    }
  }

  // ─── Get Sync Status ──────────────────────────────────────────
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isEnabled: this.isEnabled,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      stats: { ...this.syncStats },
      hasFirebaseConfig: !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.databaseURL,
    };
  }

  // ─── Cleanup ───────────────────────────────────────────────────
  cleanup() {
    this.stopPeriodicSync();
    this.listeners.clear();
  }
}

const CloudSyncService = new CloudSyncServiceClass();
export default CloudSyncService;

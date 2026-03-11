/**
 * CloudSyncService — TypeScript — Firebase RTDB sync for SafeHer
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getDatabase, ref, set, push, update, get, onValue,
  serverTimestamp, query, orderByChild, limitToLast,
  Database as FirebaseDB, DatabaseReference,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ── Types ────────────────────────────────────────────────────────
interface SyncStats {
  total: number;
  success: number;
  failed: number;
  lastError: string | null;
}

interface SyncEvent {
  type: string;
  sosId?: string;
  stats?: SyncStats;
}

type SyncListener = (event: SyncEvent) => void;

interface CloudSyncStatus {
  isInitialized: boolean;
  isEnabled: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  stats: SyncStats;
  hasFirebaseConfig: boolean;
}

interface SOSEventData {
  id: string;
  [key: string]: any;
}

interface LocationData {
  coords?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
  };
}

interface AdminDevice {
  deviceId: string;
  platform: string;
  lastSeen: string;
  evidenceCount: number;
  alertsCount: number;
  locationsCount: number;
  sosEventsCount: number;
}

interface AdminSOSEvent {
  status: string;
  [key: string]: any;
}

// ── Firebase Config ──────────────────────────────────────────────
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

const SYNC_INTERVAL_MS = 60000;
const MAX_BATCH_SIZE = 50;
const CLOUD_SYNC_KEY = '@safeher_cloud_sync_enabled';
const LAST_SYNC_KEY = '@safeher_last_sync';

class CloudSyncServiceClass {
  private app: FirebaseApp | null = null;
  private db: FirebaseDB | null = null;
  private deviceId: string | null = null;
  private isInitialized = false;
  private isSyncing = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isEnabled = false;
  private lastSyncTime: Date | null = null;
  private syncStats: SyncStats = { total: 0, success: 0, failed: 0, lastError: null };
  private listeners = new Set<SyncListener>();

  async init(deviceId: string): Promise<boolean> {
    this.deviceId = deviceId;

    try {
      const enabled = await AsyncStorage.getItem(CLOUD_SYNC_KEY);
      this.isEnabled = enabled === 'true';
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
      if (lastSync) this.lastSyncTime = new Date(lastSync);
    } catch {}

    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
      console.log('[CloudSync] Firebase not configured — running in local-only mode');
      return false;
    }

    try {
      if (getApps().length === 0) {
        this.app = initializeApp(FIREBASE_CONFIG);
      } else {
        this.app = getApps()[0];
      }
      this.db = getDatabase(this.app);
      this.isInitialized = true;
      console.log('[CloudSync] ✅ Firebase initialized');

      if (this.isEnabled) {
        this.startPeriodicSync();
      }
      return true;
    } catch (e) {
      console.error('[CloudSync] Firebase init error:', e);
      return false;
    }
  }

  async enableSync(): Promise<void> {
    this.isEnabled = true;
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, 'true');
    this.startPeriodicSync();
    await this.syncAll();
    this._notify({ type: 'sync_enabled' });
  }

  async disableSync(): Promise<void> {
    this.isEnabled = false;
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, 'false');
    this.stopPeriodicSync();
    this._notify({ type: 'sync_disabled' });
  }

  startPeriodicSync(): void {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => {
      if (this.isEnabled && this.isInitialized) {
        this.syncAll().catch(e => console.log('[CloudSync] Periodic sync error:', e));
      }
    }, SYNC_INTERVAL_MS);
    console.log(`[CloudSync] Periodic sync started (every ${SYNC_INTERVAL_MS / 1000}s)`);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  addListener(cb: SyncListener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private _notify(event: SyncEvent): void {
    this.listeners.forEach(cb => { try { cb(event); } catch {} });
  }

  // ── Core Sync Methods ──────────────────────────────────────────
  async syncRecord(collection: string, recordId: string, data: Record<string, any>): Promise<boolean> {
    if (!this.isInitialized || !this.isEnabled || !this.db) return false;
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
    } catch (e: any) {
      this.syncStats.failed++;
      this.syncStats.lastError = e.message;
      return false;
    }
  }

  async syncBatch(collection: string, records: Record<string, any>[]): Promise<number> {
    if (!this.isInitialized || !this.isEnabled || !records?.length || !this.db) return 0;

    let synced = 0;
    const batch = records.slice(0, MAX_BATCH_SIZE);

    try {
      const updates: Record<string, any> = {};
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
    } catch (e: any) {
      console.error(`[CloudSync] Batch sync error for ${collection}:`, e);
      this.syncStats.failed += batch.length;
      this.syncStats.lastError = e.message;
    }

    return synced;
  }

  // ── SOS Event Sync (immediate) ────────────────────────────────
  async syncSOSEvent(sosEvent: SOSEventData): Promise<boolean> {
    if (!this.isInitialized || !this.db) return false;

    try {
      const eventData = {
        ...sosEvent,
        _deviceId: this.deviceId,
        _platform: Platform.OS,
        _syncedAt: new Date().toISOString(),
        _priority: 'CRITICAL',
      };

      const userRef = ref(this.db, `users/${this.deviceId}/sos_events/${sosEvent.id}`);
      await set(userRef, eventData);

      const adminRef = ref(this.db, `admin/active_sos/${sosEvent.id}`);
      await set(adminRef, {
        ...eventData,
        status: 'ACTIVE',
        needsResponse: true,
      });

      const statsRef = ref(this.db, 'admin/statistics/total_sos_events');
      const snap = await get(statsRef);
      const current = snap.exists() ? (snap.val() as number) : 0;
      await set(statsRef, current + 1);

      console.log('[CloudSync] 🚨 SOS event synced to cloud immediately');
      this._notify({ type: 'sos_synced', sosId: sosEvent.id });
      return true;
    } catch (e) {
      console.error('[CloudSync] SOS sync error:', e);
      return false;
    }
  }

  async syncSOSLocation(alertId: string, location: LocationData): Promise<boolean> {
    if (!this.isInitialized || !this.db) return false;

    try {
      const locData = {
        latitude: location?.coords?.latitude,
        longitude: location?.coords?.longitude,
        accuracy: location?.coords?.accuracy,
        speed: location?.coords?.speed,
        heading: location?.coords?.heading,
        timestamp: new Date().toISOString(),
      };

      await update(ref(this.db, `users/${this.deviceId}/sos_events/${alertId}`), {
        lastLocation: locData,
        lastLocationUpdate: new Date().toISOString(),
      });

      await update(ref(this.db, `admin/active_sos/${alertId}`), {
        lastLocation: locData,
        lastLocationUpdate: new Date().toISOString(),
      });

      const trailRef = ref(this.db, `users/${this.deviceId}/sos_events/${alertId}/locationTrail`);
      await push(trailRef, locData);

      return true;
    } catch {
      return false;
    }
  }

  async resolveSOSEvent(alertId: string): Promise<boolean> {
    if (!this.isInitialized || !this.db) return false;

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
    } catch {
      return false;
    }
  }

  // ── Full Data Sync ─────────────────────────────────────────────
  async syncAll(): Promise<void> {
    if (!this.isInitialized || !this.isEnabled || this.isSyncing) return;

    this.isSyncing = true;
    this.syncStats.total++;

    try {
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
          const records = JSON.parse(raw) as Record<string, any>[];
          if (!Array.isArray(records) || records.length === 0) continue;

          const newRecords = this.lastSyncTime
            ? records.filter(r => new Date(r.createdAt || r.timestamp) > this.lastSyncTime!)
            : records;

          if (newRecords.length > 0) {
            await this.syncBatch(col.name, newRecords);
          }
        } catch (e: any) {
          console.log(`[CloudSync] Skip ${col.name}:`, e.message);
        }
      }

      try {
        const profile = await AsyncStorage.getItem('@gs_user_profile');
        if (profile) {
          await this.syncRecord('profile', 'current', JSON.parse(profile));
        }
      } catch {}

      await this._syncAdminStats();

      this.lastSyncTime = new Date();
      await AsyncStorage.setItem(LAST_SYNC_KEY, this.lastSyncTime.toISOString());

      console.log(`[CloudSync] ✅ Full sync complete (${this.syncStats.success} records)`);
      this._notify({ type: 'sync_complete', stats: { ...this.syncStats } });
    } catch (e) {
      console.error('[CloudSync] Full sync error:', e);
    }

    this.isSyncing = false;
  }

  private async _syncAdminStats(): Promise<void> {
    if (!this.isInitialized || !this.db) return;

    try {
      const DB_PREFIX = '@safeher_db_';
      const [evidence, alerts, locations, sosHistory] = await Promise.all([
        AsyncStorage.getItem(`${DB_PREFIX}evidence`),
        AsyncStorage.getItem(`${DB_PREFIX}alerts`),
        AsyncStorage.getItem(`${DB_PREFIX}locations`),
        AsyncStorage.getItem(`${DB_PREFIX}sos_history`),
      ]);

      const stats: AdminDevice = {
        deviceId: this.deviceId!,
        platform: Platform.OS,
        lastSeen: new Date().toISOString(),
        evidenceCount: evidence ? JSON.parse(evidence).length : 0,
        alertsCount: alerts ? JSON.parse(alerts).length : 0,
        locationsCount: locations ? JSON.parse(locations).length : 0,
        sosEventsCount: sosHistory ? JSON.parse(sosHistory).length : 0,
      };

      await set(ref(this.db, `admin/devices/${this.deviceId}`), stats);
    } catch {}
  }

  // ── Admin Queries ──────────────────────────────────────────────
  async getActiveSOSForAdmin(): Promise<AdminSOSEvent[]> {
    if (!this.isInitialized || !this.db) return [];
    try {
      const snapshot = await get(ref(this.db, 'admin/active_sos'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val() as Record<string, AdminSOSEvent>;
      return Object.values(data).filter(e => e.status === 'ACTIVE');
    } catch {
      return [];
    }
  }

  async getRegisteredDevices(): Promise<AdminDevice[]> {
    if (!this.isInitialized || !this.db) return [];
    try {
      const snapshot = await get(ref(this.db, 'admin/devices'));
      if (!snapshot.exists()) return [];
      return Object.values(snapshot.val() as Record<string, AdminDevice>);
    } catch {
      return [];
    }
  }

  async getGlobalStats(): Promise<Record<string, any> | null> {
    if (!this.isInitialized || !this.db) return null;
    try {
      const snapshot = await get(ref(this.db, 'admin/statistics'));
      return snapshot.exists() ? snapshot.val() : null;
    } catch {
      return null;
    }
  }

  getStatus(): CloudSyncStatus {
    return {
      isInitialized: this.isInitialized,
      isEnabled: this.isEnabled,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      stats: { ...this.syncStats },
      hasFirebaseConfig: !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.databaseURL,
    };
  }

  cleanup(): void {
    this.stopPeriodicSync();
    this.listeners.clear();
  }
}

const CloudSyncService = new CloudSyncServiceClass();
export default CloudSyncService;

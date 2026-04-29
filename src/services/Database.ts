/**
 * Database Service v2.0 — TypeScript — High-Performance Cached Storage + Cloud Sync
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import CloudSyncService from './CloudSyncService';

// ── Types ────────────────────────────────────────────────────────
interface TableConfig {
  USER: string;
  EVIDENCE: string;
  ALERTS: string;
  LOCATIONS: string;
  NEARBY_USERS: string;
  OFFLINE_QUEUE: string;
  SOS_HISTORY: string;
  CONTACTS: string;
  SETTINGS: string;
  SESSIONS: string;
  EVIDENCE_FILES: string;
  SHARED_EVIDENCE: string;
}

interface RetentionConfig {
  EVIDENCE: number;
  EVIDENCE_FILES: number;
  ALERTS: number;
  LOCATIONS: number;
  NEARBY_USERS: number;
  SOS_HISTORY: number;
  SHARED_EVIDENCE: number;
  ALERTS_TTL_HR: number;
  LOCATIONS_TTL_DAYS: number;
  NEARBY_ACTIVE_MIN: number;
  ALERTS_ACTIVE_MIN: number;
}

interface DBRecord {
  id: string;
  createdAt?: string;
  [key: string]: any;
}

interface EvidenceRecord extends DBRecord {
  sha256Hash: string;
  verified: boolean;
  synced: boolean;
}

interface EvidenceFileRecord extends DBRecord {
  uri: string;
  sha256Hash: string;
  synced: boolean;
  shared: boolean;
  size?: number;
  evidenceId?: string;
}

interface AlertRecord extends DBRecord {
  type?: string;
  deviceId?: string;
  acknowledged: boolean;
  respondedTo: boolean;
  resolved?: boolean;
  resolvedAt?: string;
  latitude?: number;
  longitude?: number;
  prevLatitude?: number;
  prevLongitude?: number;
  lastLocationUpdate?: string;
  locationHistory?: LocationHistoryEntry[];
  isMoving?: boolean;
  speed?: number | null;
  accuracy?: number | null;
  heading?: number | null;
  locationUpdateCount?: number;
  response?: string;
}

interface LocationHistoryEntry {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number | null;
  speed?: number | null;
}

interface LocationRecord extends DBRecord {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  context: string;
  synced: boolean;
  sharedViaNearby: boolean;
}

interface NearbyUserRecord extends DBRecord {
  deviceId: string;
  lastSeen: string;
  isActive: boolean;
  latitude?: number;
  longitude?: number;
}

interface OfflineQueueRecord extends DBRecord {
  retries: number;
  maxRetries: number;
  status: 'pending' | 'completed' | 'failed';
}

interface SOSHistoryRecord extends DBRecord {
  sha256Hash: string;
}

interface SharedEvidenceRecord extends DBRecord {
  sharedAt: string;
  uploadedByNearby: boolean;
}

interface SessionRecord {
  id: string;
  startedAt: string;
  lastActive: string;
  isActive: boolean;
  endedAt?: string;
}

interface UserRecord {
  id?: string;
  deviceId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface StorageStats {
  evidence: number;
  files: number;
  alerts: number;
  locations: number;
  offlineQueue: number;
  pendingQueue: number;
  sosEvents: number;
  nearbyUsers: number;
  sharedEvidence: number;
  unsyncedEvidence: number;
  unsyncedLocations: number;
  pendingSharedEvidence: number;
  cachedTables: number;
  dirtyTables: number;
  cloudSync: any;
  storageLocation: string;
  cloudLocation: string;
}

interface StorageSize {
  bytes: number;
  kb: string;
  mb: string;
}

interface LocationInput {
  coords?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
  timestamp?: number;
}

// ── Configuration ────────────────────────────────────────────────
const DB_PREFIX = '@safeher_db_';
const TABLES: TableConfig = {
  USER: `${DB_PREFIX}user`,
  EVIDENCE: `${DB_PREFIX}evidence`,
  ALERTS: `${DB_PREFIX}alerts`,
  LOCATIONS: `${DB_PREFIX}locations`,
  NEARBY_USERS: `${DB_PREFIX}nearby_users`,
  OFFLINE_QUEUE: `${DB_PREFIX}offline_queue`,
  SOS_HISTORY: `${DB_PREFIX}sos_history`,
  CONTACTS: `${DB_PREFIX}contacts`,
  SETTINGS: `${DB_PREFIX}settings`,
  SESSIONS: `${DB_PREFIX}sessions`,
  EVIDENCE_FILES: `${DB_PREFIX}evidence_files`,
  SHARED_EVIDENCE: `${DB_PREFIX}shared_evidence`,
};

const RETENTION: RetentionConfig = {
  EVIDENCE: 500,
  EVIDENCE_FILES: 200,
  ALERTS: 200,
  LOCATIONS: 1000,
  NEARBY_USERS: 100,
  SOS_HISTORY: 100,
  SHARED_EVIDENCE: 100,
  ALERTS_TTL_HR: 24,
  LOCATIONS_TTL_DAYS: 7,
  NEARBY_ACTIVE_MIN: 15,
  ALERTS_ACTIVE_MIN: 30,
};

const MAX_RETRIES = 3;
const DEBOUNCE_MS = 300;

// ── In-Memory Cache ──────────────────────────────────────────────
const _cache: Record<string, any> = {};
const _cacheLoaded: Record<string, boolean> = {};
const _dirtyTables = new Set<string>();
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

async function cacheGet<T>(tableName: string, isArray: true): Promise<T[]>;
async function cacheGet<T>(tableName: string, isArray: false): Promise<T | null>;
async function cacheGet<T>(tableName: string, isArray = true): Promise<T[] | T | null> {
  if (_cacheLoaded[tableName]) {
    return _cache[tableName] ?? (isArray ? [] : null);
  }
  try {
    const raw = await AsyncStorage.getItem(tableName);
    _cache[tableName] = raw ? JSON.parse(raw) : (isArray ? [] : null);
  } catch (e) {
    console.error(`[DB] Cache miss read error [${tableName}]:`, e);
    _cache[tableName] = isArray ? [] : null;
  }
  _cacheLoaded[tableName] = true;
  return _cache[tableName];
}

function cacheSet(tableName: string, data: any): void {
  _cache[tableName] = data;
  _cacheLoaded[tableName] = true;
  _dirtyTables.add(tableName);
  scheduleFlush();
}

async function forceFlush(tableName: string): Promise<void> {
  if (!_cacheLoaded[tableName]) return;
  const data = _cache[tableName];
  await retryWrite(tableName, data);
  _dirtyTables.delete(tableName);
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    await flushAll();
  }, DEBOUNCE_MS);
}

async function flushAll(): Promise<void> {
  const dirtyKeys = [..._dirtyTables];
  if (dirtyKeys.length === 0) return;

  const pairs: [string, string][] = dirtyKeys.map(key => [key, JSON.stringify(_cache[key])]);
  try {
    await AsyncStorage.multiSet(pairs);
    dirtyKeys.forEach(k => _dirtyTables.delete(k));
  } catch {
    for (const [key, value] of pairs) {
      try {
        await AsyncStorage.setItem(key, value);
        _dirtyTables.delete(key);
      } catch (e2) {
        console.error(`[DB] Flush error for ${key}:`, e2);
      }
    }
  }
}

// ── Retry Logic ──────────────────────────────────────────────────
async function retryWrite(tableName: string, data: any, retries = MAX_RETRIES): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await AsyncStorage.setItem(tableName, JSON.stringify(data));
      return true;
    } catch (e) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      } else {
        console.error(`[DB] Write failed after ${retries + 1} attempts [${tableName}]:`, e);
        return false;
      }
    }
  }
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────
function generateId(): string {
  // 128 bits of CSPRNG entropy → near-zero collision risk.
  // Falls back to Date.now()+Math.random() only if expo-crypto is unavailable.
  try {
    const bytes = (Crypto as any).getRandomBytes
      ? (Crypto as any).getRandomBytes(16)
      : null;
    if (bytes && bytes.length === 16) {
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return `${Date.now().toString(36)}-${hex}`;
    }
  } catch {}
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

async function safeHash(data: any): Promise<string> {
  try {
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      typeof data === 'string' ? data : JSON.stringify(data)
    );
  } catch {
    let hash = 0;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'fb-' + Math.abs(hash).toString(16).padStart(16, '0');
  }
}

function compress<T extends Record<string, any>>(obj: T): Partial<T> {
  if (!obj || typeof obj !== 'object') return obj;
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') {
      clean[k] = v;
    }
  }
  return clean as Partial<T>;
}

function validate(data: any, requiredFields: string[] = []): boolean {
  if (!data || typeof data !== 'object') return false;
  return requiredFields.every(f => data[f] !== undefined && data[f] !== null);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── In-Memory Indexes ────────────────────────────────────────────
const _indexes: Record<string, Record<string, Record<string, number[]>>> = {};

function buildIndex(tableName: string, records: DBRecord[], fields: string[] = ['id']): void {
  if (!_indexes[tableName]) _indexes[tableName] = {};
  for (const field of fields) {
    _indexes[tableName][field] = {};
    for (let i = 0; i < records.length; i++) {
      const key = records[i]?.[field];
      if (key) {
        if (!_indexes[tableName][field][key]) {
          _indexes[tableName][field][key] = [];
        }
        _indexes[tableName][field][key].push(i);
      }
    }
  }
}

function lookupIndex(tableName: string, field: string, value: string): number[] {
  return _indexes[tableName]?.[field]?.[value] || [];
}

// ── USER TABLE ───────────────────────────────────────────────────
//
// Security: deviceId is the Firebase auth.uid whenever a user is signed in.
// This ties RTDB writes to authenticated identities and lets the database
// rules enforce `auth.uid === $uid`. We fall back to a CSPRNG-generated id
// only for the brief window before sign-in completes (read-only flows).
async function getAuthUid(): Promise<string | null> {
  try {
    const { getAuth } = await import('firebase/auth');
    return getAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

export const UserDB = {
  async get(): Promise<UserRecord | null> {
    return await cacheGet<UserRecord>(TABLES.USER, false);
  },

  async save(userData: Partial<UserRecord>): Promise<UserRecord> {
    const existing = await this.get();
    const updated = compress({
      ...existing,
      ...userData,
      updatedAt: new Date().toISOString(),
    }) as UserRecord;
    if (!updated.id) updated.id = generateId();
    if (!updated.createdAt) updated.createdAt = new Date().toISOString();

    cacheSet(TABLES.USER, updated);
    await forceFlush(TABLES.USER);
    CloudSyncService.syncRecord('profile', 'current', updated).catch(() => {});
    return updated;
  },

  async getDeviceId(): Promise<string> {
    const uid = await getAuthUid();
    if (uid) {
      const user = await this.get();
      if (!user || user.deviceId !== uid) {
        await this.save({ deviceId: uid });
      }
      return uid;
    }
    // Pre-auth fallback only — never written to the cloud under this id.
    let user = await this.get();
    if (!user || !user.deviceId) {
      const deviceId = `local-${generateId()}-${Platform.OS}`;
      user = await this.save({ deviceId });
    }
    return user!.deviceId!;
  },

  async clear(): Promise<void> {
    _cache[TABLES.USER] = null;
    _cacheLoaded[TABLES.USER] = true;
    await AsyncStorage.removeItem(TABLES.USER);
  },
};

// ── EVIDENCE TABLE ───────────────────────────────────────────────
export const EvidenceDB = {
  async getAll(): Promise<EvidenceRecord[]> {
    return await cacheGet<EvidenceRecord>(TABLES.EVIDENCE, true);
  },

  async add(evidence: Partial<EvidenceRecord>): Promise<EvidenceRecord> {
    const logs = await this.getAll();
    const hash = await safeHash({ ...evidence, timestamp: new Date().toISOString() });
    const entry = compress({
      id: generateId(),
      ...evidence,
      sha256Hash: hash,
      createdAt: new Date().toISOString(),
      verified: true,
      synced: false,
    }) as EvidenceRecord;
    const updated = [entry, ...logs].slice(0, RETENTION.EVIDENCE);
    cacheSet(TABLES.EVIDENCE, updated);
    buildIndex(TABLES.EVIDENCE, updated, ['id']);
    await forceFlush(TABLES.EVIDENCE);
    CloudSyncService.syncRecord('evidence', entry.id, entry).catch(() => {});
    return entry;
  },

  async addFile(fileInfo: Partial<EvidenceFileRecord>): Promise<EvidenceFileRecord> {
    const files = await cacheGet<EvidenceFileRecord>(TABLES.EVIDENCE_FILES, true);
    const hash = await safeHash(`${fileInfo.uri}-${fileInfo.size}-${Date.now()}`);
    const entry = compress({
      id: generateId(),
      ...fileInfo,
      sha256Hash: hash,
      createdAt: new Date().toISOString(),
      synced: false,
      shared: false,
    }) as EvidenceFileRecord;
    const updated = [entry, ...files].slice(0, RETENTION.EVIDENCE_FILES);
    cacheSet(TABLES.EVIDENCE_FILES, updated);
    await forceFlush(TABLES.EVIDENCE_FILES);
    CloudSyncService.syncRecord('evidence_files', entry.id, entry).catch(() => {});
    return entry;
  },

  async getFiles(): Promise<EvidenceFileRecord[]> {
    return await cacheGet<EvidenceFileRecord>(TABLES.EVIDENCE_FILES, true);
  },

  async markSynced(id: string): Promise<void> {
    const logs = await this.getAll();
    const updated = logs.map(l => l.id === id ? { ...l, synced: true } : l);
    cacheSet(TABLES.EVIDENCE, updated);
  },

  async markFileShared(id: string): Promise<void> {
    const files = await cacheGet<EvidenceFileRecord>(TABLES.EVIDENCE_FILES, true);
    const updated = files.map(f => f.id === id ? { ...f, shared: true } : f);
    cacheSet(TABLES.EVIDENCE_FILES, updated);
  },

  async getUnsyncedCount(): Promise<number> {
    const logs = await this.getAll();
    return logs.filter(l => !l.synced).length;
  },

  async remove(id: string): Promise<void> {
    const logs = await this.getAll();
    const updated = logs.filter(l => l.id !== id);
    cacheSet(TABLES.EVIDENCE, updated);
    buildIndex(TABLES.EVIDENCE, updated, ['id']);
    await forceFlush(TABLES.EVIDENCE);
    const files = await this.getFiles();
    const updatedFiles = files.filter(f => f.id !== id && f.evidenceId !== id);
    cacheSet(TABLES.EVIDENCE_FILES, updatedFiles);
    await forceFlush(TABLES.EVIDENCE_FILES);
  },

  async removeFile(id: string): Promise<void> {
    const files = await this.getFiles();
    const updated = files.filter(f => f.id !== id);
    cacheSet(TABLES.EVIDENCE_FILES, updated);
    await forceFlush(TABLES.EVIDENCE_FILES);
  },

  async clear(): Promise<void> {
    cacheSet(TABLES.EVIDENCE, []);
    cacheSet(TABLES.EVIDENCE_FILES, []);
    await flushAll();
  },
};

// ── ALERTS TABLE ─────────────────────────────────────────────────
export const AlertsDB = {
  async getAll(): Promise<AlertRecord[]> {
    return await cacheGet<AlertRecord>(TABLES.ALERTS, true);
  },

  async getActive(): Promise<AlertRecord[]> {
    const alerts = await this.getAll();
    const cutoff = Date.now() - (RETENTION.ALERTS_ACTIVE_MIN * 60 * 1000);
    return alerts.filter(a => new Date(a.createdAt!).getTime() > cutoff);
  },

  async add(alert: Partial<AlertRecord>): Promise<AlertRecord> {
    const alerts = await this.getAll();
    const entry = compress({
      id: generateId(),
      ...alert,
      createdAt: new Date().toISOString(),
      acknowledged: false,
      respondedTo: false,
    }) as AlertRecord;
    const updated = [entry, ...alerts].slice(0, RETENTION.ALERTS);
    cacheSet(TABLES.ALERTS, updated);
    buildIndex(TABLES.ALERTS, updated, ['id', 'deviceId']);
    await forceFlush(TABLES.ALERTS);
    if (alert.type === 'SOS_DANGER') {
      CloudSyncService.syncSOSEvent(entry).catch(() => {});
    }
    return entry;
  },

  async acknowledge(id: string): Promise<void> {
    const alerts = await this.getAll();
    const updated = alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a);
    cacheSet(TABLES.ALERTS, updated);
  },

  async respond(id: string, response: string): Promise<void> {
    const alerts = await this.getAll();
    const updated = alerts.map(a =>
      a.id === id ? { ...a, respondedTo: true, response } : a
    );
    cacheSet(TABLES.ALERTS, updated);
  },

  async clearOld(): Promise<void> {
    const alerts = await this.getAll();
    const cutoff = Date.now() - (RETENTION.ALERTS_TTL_HR * 60 * 60 * 1000);
    const filtered = alerts.filter(a => new Date(a.createdAt!).getTime() > cutoff);
    if (filtered.length < alerts.length) {
      cacheSet(TABLES.ALERTS, filtered);
      buildIndex(TABLES.ALERTS, filtered, ['id', 'deviceId']);
    }
  },

  async updateLocation(
    id: string,
    latitude: number,
    longitude: number,
    extras: { accuracy?: number; speed?: number; heading?: number; isMoving?: boolean } = {}
  ): Promise<void> {
    const alerts = await this.getAll();
    const updated = alerts.map(a => {
      if (a.id !== id) return a;
      const historyEntry = compress({
        latitude, longitude,
        timestamp: new Date().toISOString(),
        accuracy: extras.accuracy,
        speed: extras.speed,
      }) as LocationHistoryEntry;
      const locationHistory = [...(a.locationHistory || []), historyEntry].slice(-60);
      return {
        ...a,
        latitude, longitude,
        prevLatitude: a.latitude,
        prevLongitude: a.longitude,
        lastLocationUpdate: new Date().toISOString(),
        locationHistory,
        isMoving: extras.isMoving ?? false,
        speed: extras.speed ?? null,
        accuracy: extras.accuracy ?? null,
        heading: extras.heading ?? null,
        locationUpdateCount: (a.locationUpdateCount || 0) + 1,
      };
    });
    cacheSet(TABLES.ALERTS, updated);
    await forceFlush(TABLES.ALERTS);
    CloudSyncService.syncSOSLocation(id, {
      coords: { latitude, longitude, accuracy: extras.accuracy, speed: extras.speed, heading: extras.heading },
    }).catch(() => {});
  },

  async getActiveSOSAlerts(): Promise<AlertRecord[]> {
    const active = await this.getActive();
    return active.filter(a => a.type === 'SOS_DANGER' && !a.resolved);
  },

  async resolveAlert(id: string): Promise<void> {
    const alerts = await this.getAll();
    const updated = alerts.map(a =>
      a.id === id
        ? { ...a, resolved: true, resolvedAt: new Date().toISOString() }
        : a
    );
    cacheSet(TABLES.ALERTS, updated);
    await forceFlush(TABLES.ALERTS);
    CloudSyncService.resolveSOSEvent(id).catch(() => {});
  },

  async getByDeviceId(deviceId: string): Promise<AlertRecord[]> {
    const alerts = await this.getAll();
    const indices = lookupIndex(TABLES.ALERTS, 'deviceId', deviceId);
    if (indices.length > 0) {
      return indices.map(i => alerts[i]).filter(Boolean);
    }
    return alerts.filter(a => a.deviceId === deviceId);
  },
};

// ── LOCATIONS TABLE ──────────────────────────────────────────────
export const LocationsDB = {
  async getAll(): Promise<LocationRecord[]> {
    return await cacheGet<LocationRecord>(TABLES.LOCATIONS, true);
  },

  async add(location: LocationInput, context = 'tracking'): Promise<LocationRecord | null> {
    const locations = await this.getAll();

    const lat = location?.coords?.latitude;
    const lon = location?.coords?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      console.warn('[DB] Invalid coordinates rejected:', lat, lon);
      return null;
    }

    const entry = compress({
      id: generateId(),
      latitude: lat,
      longitude: lon,
      accuracy: location?.coords?.accuracy || null,
      altitude: location?.coords?.altitude || null,
      speed: location?.coords?.speed || null,
      heading: location?.coords?.heading || null,
      timestamp: location?.timestamp || Date.now(),
      context,
      createdAt: new Date().toISOString(),
      synced: false,
      sharedViaNearby: false,
    }) as LocationRecord;

    if (locations.length > 0) {
      const latest = locations[0];
      const timeDiff = Math.abs(entry.timestamp - (latest.timestamp || 0));
      if (timeDiff < 2000 &&
          Math.abs((entry.latitude || 0) - (latest.latitude || 0)) < 0.00001 &&
          Math.abs((entry.longitude || 0) - (latest.longitude || 0)) < 0.00001) {
        return latest;
      }
    }

    const updated = [entry, ...locations].slice(0, RETENTION.LOCATIONS);
    cacheSet(TABLES.LOCATIONS, updated);

    if (context === 'sos') {
      await forceFlush(TABLES.LOCATIONS);
    }

    return entry;
  },

  async getUnsynced(): Promise<LocationRecord[]> {
    const locations = await this.getAll();
    return locations.filter(l => !l.synced);
  },

  async markSynced(ids: string | string[]): Promise<void> {
    const locations = await this.getAll();
    const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
    const updated = locations.map(l => idSet.has(l.id) ? { ...l, synced: true } : l);
    cacheSet(TABLES.LOCATIONS, updated);
  },

  async getRecent(count = 10): Promise<LocationRecord[]> {
    const locations = await this.getAll();
    return locations.slice(0, count);
  },

  async clearOld(keepDays = RETENTION.LOCATIONS_TTL_DAYS): Promise<void> {
    const locations = await this.getAll();
    const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
    const filtered = locations.filter(l => new Date(l.createdAt!).getTime() > cutoff);
    if (filtered.length < locations.length) {
      cacheSet(TABLES.LOCATIONS, filtered);
    }
  },

  async getByDateRange(startDate: string | Date, endDate: string | Date): Promise<LocationRecord[]> {
    const locations = await this.getAll();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return locations.filter(l => {
      const t = new Date(l.createdAt!).getTime();
      return t >= start && t <= end;
    });
  },

  async getByContext(context: string): Promise<LocationRecord[]> {
    const locations = await this.getAll();
    return locations.filter(l => l.context === context);
  },
};

// ── NEARBY USERS TABLE ───────────────────────────────────────────
export const NearbyUsersDB = {
  async getAll(): Promise<NearbyUserRecord[]> {
    return await cacheGet<NearbyUserRecord>(TABLES.NEARBY_USERS, true);
  },

  async register(userInfo: Partial<NearbyUserRecord>): Promise<NearbyUserRecord | null> {
    if (!validate(userInfo, ['deviceId'])) {
      console.warn('[DB] NearbyUsers.register: missing deviceId');
      return null;
    }
    const users = await this.getAll();
    const filtered = users.filter(u => u.deviceId !== userInfo.deviceId);
    const entry = compress({
      id: generateId(),
      ...userInfo,
      lastSeen: new Date().toISOString(),
      isActive: true,
    }) as NearbyUserRecord;
    const updated = [entry, ...filtered].slice(0, RETENTION.NEARBY_USERS);
    cacheSet(TABLES.NEARBY_USERS, updated);
    buildIndex(TABLES.NEARBY_USERS, updated, ['id', 'deviceId']);
    return entry;
  },

  async getActive(): Promise<NearbyUserRecord[]> {
    const users = await this.getAll();
    const cutoff = Date.now() - (RETENTION.NEARBY_ACTIVE_MIN * 60 * 1000);
    return users.filter(u => new Date(u.lastSeen).getTime() > cutoff);
  },

  async getNearby(lat: number, lon: number, radiusKm = 2): Promise<NearbyUserRecord[]> {
    const users = await this.getActive();
    return users.filter(u => {
      if (!u.latitude || !u.longitude) return false;
      return haversineDistance(lat, lon, u.latitude, u.longitude) <= radiusKm;
    });
  },
};

// ── OFFLINE QUEUE ────────────────────────────────────────────────
export const OfflineQueueDB = {
  async getAll(): Promise<OfflineQueueRecord[]> {
    return await cacheGet<OfflineQueueRecord>(TABLES.OFFLINE_QUEUE, true);
  },

  async add(action: Partial<OfflineQueueRecord>): Promise<OfflineQueueRecord> {
    const queue = await this.getAll();
    const entry = compress({
      id: generateId(),
      ...action,
      createdAt: new Date().toISOString(),
      retries: 0,
      maxRetries: 5,
      status: 'pending' as const,
    }) as OfflineQueueRecord;
    cacheSet(TABLES.OFFLINE_QUEUE, [...queue, entry]);
    return entry;
  },

  async getPending(): Promise<OfflineQueueRecord[]> {
    const queue = await this.getAll();
    return queue.filter(q => q.status === 'pending' && q.retries < q.maxRetries);
  },

  async markCompleted(id: string): Promise<void> {
    const queue = await this.getAll();
    const updated = queue.map(q =>
      q.id === id ? { ...q, status: 'completed' as const } : q
    );
    cacheSet(TABLES.OFFLINE_QUEUE, updated);
  },

  async markFailed(id: string): Promise<void> {
    const queue = await this.getAll();
    const updated = queue.map(q =>
      q.id === id
        ? { ...q, retries: q.retries + 1, status: (q.retries + 1 >= q.maxRetries ? 'failed' : 'pending') as OfflineQueueRecord['status'] }
        : q
    );
    cacheSet(TABLES.OFFLINE_QUEUE, updated);
  },

  async clearCompleted(): Promise<void> {
    const queue = await this.getAll();
    const filtered = queue.filter(q => q.status !== 'completed');
    if (filtered.length < queue.length) {
      cacheSet(TABLES.OFFLINE_QUEUE, filtered);
    }
  },
};

// ── SOS HISTORY ──────────────────────────────────────────────────
export const SOSHistoryDB = {
  async getAll(): Promise<SOSHistoryRecord[]> {
    return await cacheGet<SOSHistoryRecord>(TABLES.SOS_HISTORY, true);
  },

  async add(event: Partial<SOSHistoryRecord>): Promise<SOSHistoryRecord> {
    const history = await this.getAll();
    const hash = await safeHash(event);
    const entry = compress({
      id: generateId(),
      ...event,
      sha256Hash: hash,
      createdAt: new Date().toISOString(),
    }) as SOSHistoryRecord;
    const updated = [entry, ...history].slice(0, RETENTION.SOS_HISTORY);
    cacheSet(TABLES.SOS_HISTORY, updated);
    await forceFlush(TABLES.SOS_HISTORY);
    CloudSyncService.syncSOSEvent(entry).catch(() => {});
    return entry;
  },
};

// ── SHARED EVIDENCE ──────────────────────────────────────────────
export const SharedEvidenceDB = {
  async getAll(): Promise<SharedEvidenceRecord[]> {
    return await cacheGet<SharedEvidenceRecord>(TABLES.SHARED_EVIDENCE, true);
  },

  async add(evidence: Partial<SharedEvidenceRecord>): Promise<SharedEvidenceRecord> {
    const shared = await this.getAll();
    const entry = compress({
      id: generateId(),
      ...evidence,
      sharedAt: new Date().toISOString(),
      uploadedByNearby: false,
    }) as SharedEvidenceRecord;
    const updated = [entry, ...shared].slice(0, RETENTION.SHARED_EVIDENCE);
    cacheSet(TABLES.SHARED_EVIDENCE, updated);
    await forceFlush(TABLES.SHARED_EVIDENCE);
    CloudSyncService.syncRecord('shared_evidence', entry.id, entry).catch(() => {});
    return entry;
  },

  async markUploaded(id: string): Promise<void> {
    const shared = await this.getAll();
    const updated = shared.map(s => s.id === id ? { ...s, uploadedByNearby: true } : s);
    cacheSet(TABLES.SHARED_EVIDENCE, updated);
  },

  async getPending(): Promise<SharedEvidenceRecord[]> {
    const shared = await this.getAll();
    return shared.filter(s => !s.uploadedByNearby);
  },
};

// ── SESSIONS TABLE ───────────────────────────────────────────────
export const SessionsDB = {
  async getCurrent(): Promise<SessionRecord | null> {
    return await cacheGet<SessionRecord>(TABLES.SESSIONS, false);
  },

  async start(): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: generateId(),
      startedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true,
    };
    cacheSet(TABLES.SESSIONS, session);
    await forceFlush(TABLES.SESSIONS);
    return session;
  },

  async updateActivity(): Promise<void> {
    const session = await this.getCurrent();
    if (session) {
      session.lastActive = new Date().toISOString();
      cacheSet(TABLES.SESSIONS, session);
    }
  },

  async end(): Promise<void> {
    const session = await this.getCurrent();
    if (session) {
      session.isActive = false;
      session.endedAt = new Date().toISOString();
      cacheSet(TABLES.SESSIONS, session);
      await forceFlush(TABLES.SESSIONS);
    }
  },
};

// ── DATABASE UTILITIES ───────────────────────────────────────────
export const DatabaseUtils = {
  async getStats(): Promise<StorageStats> {
    const [evidence, files, alerts, locations, queue, sos, nearby, shared] = await Promise.all([
      EvidenceDB.getAll(),
      EvidenceDB.getFiles(),
      AlertsDB.getAll(),
      LocationsDB.getAll(),
      OfflineQueueDB.getAll(),
      SOSHistoryDB.getAll(),
      NearbyUsersDB.getAll(),
      SharedEvidenceDB.getAll(),
    ]);

    return {
      evidence: evidence.length,
      files: files.length,
      alerts: alerts.length,
      locations: locations.length,
      offlineQueue: queue.length,
      pendingQueue: queue.filter(q => q.status === 'pending').length,
      sosEvents: sos.length,
      nearbyUsers: nearby.length,
      sharedEvidence: shared.length,
      unsyncedEvidence: evidence.filter(e => !e.synced).length,
      unsyncedLocations: locations.filter(l => !l.synced).length,
      pendingSharedEvidence: shared.filter(s => !s.uploadedByNearby).length,
      cachedTables: Object.keys(_cacheLoaded).filter(k => _cacheLoaded[k]).length,
      dirtyTables: _dirtyTables.size,
      cloudSync: CloudSyncService.getStatus(),
      storageLocation: Platform.OS === 'android'
        ? 'SQLite (RCTAsyncLocalStorage) — /data/data/{package}/databases/'
        : 'NSUserDefaults — App sandbox',
      cloudLocation: CloudSyncService.getStatus().hasFirebaseConfig
        ? 'Firebase Realtime Database — accessible via Firebase Console'
        : 'Not configured — data is LOCAL ONLY',
    };
  },

  async clearAll(): Promise<void> {
    const keys = Object.values(TABLES);
    await AsyncStorage.multiRemove(keys);
    for (const key of keys) {
      _cache[key] = null;
      _cacheLoaded[key] = false;
    }
    _dirtyTables.clear();
    Object.keys(_indexes).forEach(k => delete _indexes[k]);
  },

  async exportAll(): Promise<Record<string, any>> {
    const data: Record<string, any> = {};
    for (const [name, key] of Object.entries(TABLES)) {
      if (_cacheLoaded[key]) {
        data[name] = _cache[key];
      } else {
        const val = await AsyncStorage.getItem(key);
        data[name] = val ? JSON.parse(val) : null;
      }
    }
    data._exportedAt = new Date().toISOString();
    data._platform = Platform.OS;
    data._dbVersion = '2.0';
    return data;
  },

  async runCleanup(): Promise<void> {
    await Promise.all([
      AlertsDB.clearOld(),
      LocationsDB.clearOld(),
      OfflineQueueDB.clearCompleted(),
    ]);
    await flushAll();
    console.log('[DB] ✅ Cleanup complete');
  },

  async flushAll(): Promise<void> {
    await flushAll();
  },

  async warmCache(): Promise<void> {
    const keys = Object.values(TABLES);
    try {
      const pairs = await AsyncStorage.multiGet(keys);
      for (const [key, value] of pairs) {
        _cache[key] = value ? JSON.parse(value) : null;
        _cacheLoaded[key] = true;
      }
      console.log(`[DB] ✅ Cache warmed: ${keys.length} tables loaded`);
    } catch (e) {
      console.error('[DB] Cache warm error:', e);
    }
  },

  async getStorageSize(): Promise<StorageSize> {
    let total = 0;
    for (const key of Object.values(TABLES)) {
      try {
        const val = await AsyncStorage.getItem(key);
        if (val) total += val.length * 2;
      } catch {}
    }
    return {
      bytes: total,
      kb: (total / 1024).toFixed(2),
      mb: (total / (1024 * 1024)).toFixed(2),
    };
  },

  async syncToCloud(): Promise<void> {
    return CloudSyncService.syncAll();
  },

  getCloudSyncStatus() {
    return CloudSyncService.getStatus();
  },

  haversineDistance,
};

// ── DEFAULT EXPORT ───────────────────────────────────────────────
export default {
  UserDB,
  EvidenceDB,
  AlertsDB,
  LocationsDB,
  NearbyUsersDB,
  OfflineQueueDB,
  SOSHistoryDB,
  SharedEvidenceDB,
  SessionsDB,
  DatabaseUtils,
};

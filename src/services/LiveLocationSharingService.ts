/**
 * LiveLocationSharingService — TypeScript — Shareable web URL for real-time tracking
 */
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────
interface SessionData {
  id: string;
  userName: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  lastUpdate: number;
  stoppedAt?: number;
  location: LocationUpdate | null;
  breadcrumbs: LocationUpdate[];
  stats: SessionStats;
}

interface SessionStats {
  totalDistance: number;
  avgSpeed: number;
  maxSpeed: number;
  updateCount: number;
}

interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  timestamp: number;
}

interface LocationInput {
  coords?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
    altitude?: number | null;
  };
  timestamp?: number;
}

interface StartOptions {
  userName?: string;
  ttlMinutes?: number;
  purpose?: string;
}

interface StartResult {
  success: boolean;
  sessionId?: string;
  shareUrl?: string;
  shareMessage?: string;
  expiresAt?: number;
  error?: string;
}

interface StopResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

interface FirebaseDBHelpers {
  getDatabase: any;
  ref: any;
  set: any;
  get: any;
  update: any;
  remove: any;
  onValue: any;
  app: any;
}

// ── State ────────────────────────────────────────────────────────
let _db: FirebaseDBHelpers | null = null;
let _activeSessionId: string | null = null;
let _isSharing = false;

const SESSIONS_STORAGE_KEY = '@gs_live_sessions';

const getDB = async (): Promise<FirebaseDBHelpers | null> => {
  if (_db) return _db;
  try {
    const { getDatabase, ref, set, get, update, remove, onValue } =
      await import('firebase/database');
    const { getApp } = await import('firebase/app');
    const app = getApp();
    _db = { getDatabase, ref, set, get, update, remove, onValue, app };
    return _db;
  } catch (e) {
    console.error('[LiveShare] Firebase import error:', e);
    return null;
  }
};

const LiveLocationSharingService = {
  async startSession(options: StartOptions = {}): Promise<StartResult> {
    const {
      userName = 'SafeHer User',
      ttlMinutes = 60,
      purpose = 'general',
    } = options;

    try {
      const bytes = await Crypto.getRandomBytesAsync(12);
      const sessionId = Array.from(bytes)
        .map(b => b.toString(36))
        .join('')
        .substring(0, 16)
        .toUpperCase();

      const now = Date.now();
      const expiresAt = now + (ttlMinutes * 60 * 1000);

      const sessionData: SessionData = {
        id: sessionId,
        userName,
        purpose,
        createdAt: now,
        expiresAt,
        isActive: true,
        lastUpdate: now,
        location: null,
        breadcrumbs: [],
        stats: { totalDistance: 0, avgSpeed: 0, maxSpeed: 0, updateCount: 0 },
      };

      const db = await getDB();
      if (db) {
        const { getDatabase, ref, set } = db;
        const database = getDatabase(db.app);
        const sessionRef = ref(database, `live_tracking/${sessionId}`);
        await set(sessionRef, sessionData);
      }

      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      const sessions: SessionData[] = stored ? JSON.parse(stored) : [];
      sessions.push(sessionData);
      await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));

      _activeSessionId = sessionId;
      _isSharing = true;

      const shareUrl = `https://safeher.app/track/${sessionId}`;

      return {
        success: true,
        sessionId,
        shareUrl,
        shareMessage: `📍 Track my live location:\n${shareUrl}\n\nShared via SafeHer Safety App\nSession expires in ${ttlMinutes} minutes.`,
        expiresAt,
      };
    } catch (e: any) {
      console.error('[LiveShare] Start session error:', e);
      return { success: false, error: e.message };
    }
  },

  async updateLocation(location: LocationInput): Promise<void> {
    if (!_isSharing || !_activeSessionId || !location?.coords) return;

    try {
      const locationUpdate: LocationUpdate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed,
        heading: location.coords.heading,
        altitude: location.coords.altitude,
        timestamp: location.timestamp || Date.now(),
      };

      const db = await getDB();
      if (db) {
        const { getDatabase, ref, update: fbUpdate, get } = db;
        const database = getDatabase(db.app);

        const locRef = ref(database, `live_tracking/${_activeSessionId}/location`);
        await fbUpdate(locRef, locationUpdate);

        const crumbsRef = ref(database, `live_tracking/${_activeSessionId}/breadcrumbs`);
        const crumbsSnap = await get(crumbsRef);
        let crumbs: LocationUpdate[] = crumbsSnap.exists() ? crumbsSnap.val() : [];
        if (!Array.isArray(crumbs)) crumbs = Object.values(crumbs);

        crumbs.push(locationUpdate);
        if (crumbs.length > 200) crumbs = crumbs.slice(-200);

        const sessionRef = ref(database, `live_tracking/${_activeSessionId}`);
        await fbUpdate(sessionRef, {
          breadcrumbs: crumbs,
          lastUpdate: Date.now(),
          'stats/updateCount': crumbs.length,
        });
      }
    } catch (e) {
      console.error('[LiveShare] Update error:', e);
    }
  },

  async stopSession(): Promise<StopResult> {
    if (!_activeSessionId) return { success: true };

    try {
      const db = await getDB();
      if (db) {
        const { getDatabase, ref, update: fbUpdate } = db;
        const database = getDatabase(db.app);
        const sessionRef = ref(database, `live_tracking/${_activeSessionId}`);
        await fbUpdate(sessionRef, { isActive: false, stoppedAt: Date.now() });
      }

      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const sessions: SessionData[] = JSON.parse(stored);
        const updated = sessions.map(s =>
          s.id === _activeSessionId ? { ...s, isActive: false, stoppedAt: Date.now() } : s
        );
        await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
      }

      const stoppedId = _activeSessionId;
      _activeSessionId = null;
      _isSharing = false;
      return { success: true, sessionId: stoppedId };
    } catch (e: any) {
      console.error('[LiveShare] Stop error:', e);
      return { success: false, error: e.message };
    }
  },

  // Alias for backward compatibility
  async endSession(): Promise<StopResult> {
    return this.stopSession();
  },

  getShareUrl(): string | null {
    if (!_activeSessionId) return null;
    return `https://safeher.app/track/${_activeSessionId}`;
  },

  getShareMessage(): string | null {
    const url = this.getShareUrl();
    if (!url) return null;
    return `📍 Track my live location in real-time:\n${url}\n\nShared via SafeHer Safety App`;
  },

  isSharing(): boolean {
    return _isSharing && _activeSessionId !== null;
  },

  getSessionId(): string | null {
    return _activeSessionId;
  },

  async getSessions(): Promise<SessionData[]> {
    try {
      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  async clearSessions(): Promise<void> {
    await AsyncStorage.removeItem(SESSIONS_STORAGE_KEY);
  },
};

export default LiveLocationSharingService;

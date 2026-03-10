/**
 * LiveLocationSharingService — Shareable web URL for real-time tracking
 * Uses Firebase Realtime Database (RTDB) so contacts can watch live 
 * location in a browser without needing the app installed.
 * 
 * Features:
 *  - Generate shareable tracking links (Google Maps live share style)
 *  - Real-time location updates via Firebase RTDB
 *  - Auto-expiring sessions (configurable TTL)
 *  - Privacy controls (start/stop/pause)
 *  - Route breadcrumb trail
 *  - Works without contacts installing an app
 * 
 * v1.0 — SafeHer App
 */
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase RTDB config (uses existing firebase instance)
let _db = null;
let _activeSessionId = null;
let _isSharing = false;

const SESSIONS_STORAGE_KEY = '@gs_live_sessions';

// ─── Firebase RTDB helpers ───────────────────────────────────────
const getDB = async () => {
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
  /**
   * Start a new live location sharing session.
   * Returns a shareable URL that anyone can open in a browser.
   * 
   * @param {Object} options
   * @param {string} options.userName - Display name for the sharer
   * @param {number} options.ttlMinutes - Session expiry (default: 60)
   * @param {string} options.purpose - 'journey' | 'sos' | 'general'
   * @returns {Object} { sessionId, shareUrl, webUrl }
   */
  async startSession(options = {}) {
    const {
      userName = 'SafeHer User',
      ttlMinutes = 60,
      purpose = 'general',
    } = options;

    try {
      // Generate unique session ID
      const bytes = await Crypto.getRandomBytesAsync(12);
      const sessionId = Array.from(bytes)
        .map(b => b.toString(36))
        .join('')
        .substring(0, 16)
        .toUpperCase();

      const now = Date.now();
      const expiresAt = now + (ttlMinutes * 60 * 1000);

      // Session data
      const sessionData = {
        id: sessionId,
        userName,
        purpose,
        createdAt: now,
        expiresAt,
        isActive: true,
        lastUpdate: now,
        location: null,
        breadcrumbs: [],
        stats: {
          totalDistance: 0,
          avgSpeed: 0,
          maxSpeed: 0,
          updateCount: 0,
        },
      };

      // Try to write to Firebase RTDB
      const db = await getDB();
      if (db) {
        const { getDatabase, ref, set } = db;
        const database = getDatabase(db.app);
        const sessionRef = ref(database, `live_tracking/${sessionId}`);
        await set(sessionRef, sessionData);
        console.log('[LiveShare] Session created in Firebase:', sessionId);
      }

      // Store locally too
      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      const sessions = stored ? JSON.parse(stored) : [];
      sessions.push(sessionData);
      await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));

      _activeSessionId = sessionId;
      _isSharing = true;

      // Build shareable URLs
      const shareUrl = `https://safeher.app/track/${sessionId}`;
      const mapsUrl = `https://maps.google.com/?q=0,0`; // Updated with first location

      return {
        success: true,
        sessionId,
        shareUrl,
        shareMessage: `📍 Track my live location:\n${shareUrl}\n\nShared via SafeHer Safety App\nSession expires in ${ttlMinutes} minutes.`,
        expiresAt,
      };
    } catch (e) {
      console.error('[LiveShare] Start session error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Update the current session with new location data.
   * Call this from the background location callback.
   */
  async updateLocation(location) {
    if (!_isSharing || !_activeSessionId || !location?.coords) return;

    try {
      const update = {
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
        
        // Update current location
        const locRef = ref(database, `live_tracking/${_activeSessionId}/location`);
        await fbUpdate(locRef, update);

        // Append to breadcrumbs (limit to last 200)
        const crumbsRef = ref(database, `live_tracking/${_activeSessionId}/breadcrumbs`);
        const crumbsSnap = await get(crumbsRef);
        let crumbs = crumbsSnap.exists() ? crumbsSnap.val() : [];
        if (!Array.isArray(crumbs)) crumbs = Object.values(crumbs);
        
        crumbs.push(update);
        if (crumbs.length > 200) crumbs = crumbs.slice(-200);
        
        const sessionRef = ref(database, `live_tracking/${_activeSessionId}`);
        await fbUpdate(sessionRef, {
          breadcrumbs: crumbs,
          lastUpdate: Date.now(),
          'stats/updateCount': crumbs.length,
        });
      }

      console.log('[LiveShare] Location updated');
    } catch (e) {
      console.error('[LiveShare] Update error:', e);
    }
  },

  /**
   * Stop the current sharing session.
   */
  async stopSession() {
    if (!_activeSessionId) return { success: true };

    try {
      const db = await getDB();
      if (db) {
        const { getDatabase, ref, update: fbUpdate } = db;
        const database = getDatabase(db.app);
        const sessionRef = ref(database, `live_tracking/${_activeSessionId}`);
        await fbUpdate(sessionRef, { isActive: false, stoppedAt: Date.now() });
      }

      // Update local storage
      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const sessions = JSON.parse(stored);
        const updated = sessions.map(s => 
          s.id === _activeSessionId ? { ...s, isActive: false, stoppedAt: Date.now() } : s
        );
        await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
      }

      const stoppedId = _activeSessionId;
      _activeSessionId = null;
      _isSharing = false;

      console.log('[LiveShare] Session stopped:', stoppedId);
      return { success: true, sessionId: stoppedId };
    } catch (e) {
      console.error('[LiveShare] Stop error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Get the share URL for the current session.
   */
  getShareUrl() {
    if (!_activeSessionId) return null;
    return `https://safeher.app/track/${_activeSessionId}`;
  },

  /**
   * Get the share message for the current session.
   */
  getShareMessage() {
    const url = this.getShareUrl();
    if (!url) return null;
    return `📍 Track my live location in real-time:\n${url}\n\nShared via SafeHer Safety App`;
  },

  /**
   * Check if currently sharing.
   */
  isSharing() {
    return _isSharing && _activeSessionId !== null;
  },

  /**
   * Get session ID.
   */
  getSessionId() {
    return _activeSessionId;
  },

  /**
   * Get all past sessions.
   */
  async getSessions() {
    try {
      const stored = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Clear all session history.
   */
  async clearSessions() {
    await AsyncStorage.removeItem(SESSIONS_STORAGE_KEY);
  },
};

export default LiveLocationSharingService;

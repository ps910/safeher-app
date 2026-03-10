/**
 * BackgroundLocationService — Persistent location tracking
 * Works when app is in background or killed (critical for safety app).
 * Uses expo-location + expo-task-manager for background task.
 * 
 * Features:
 *  - Background GPS tracking even when app is minimized/killed
 *  - Configurable intervals and accuracy
 *  - Auto-restart on device reboot (Android)
 *  - Battery-efficient with adaptive intervals
 *  - Integrates with SOS and journey tracking
 * 
 * v1.0 — SafeHer App
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'SAFEHER_BACKGROUND_LOCATION';
const STORAGE_KEY = '@gs_background_locations';
const MAX_STORED_LOCATIONS = 500;

// ─── State ───────────────────────────────────────────────────────
let _locationCallback = null;
let _isTracking = false;
let _sosActive = false;

// ─── Define the background task ──────────────────────────────────
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BG Location] Task error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const latest = locations[locations.length - 1];
      console.log('[BG Location] Update:', {
        lat: latest.coords.latitude.toFixed(6),
        lng: latest.coords.longitude.toFixed(6),
        accuracy: Math.round(latest.coords.accuracy),
        timestamp: new Date(latest.timestamp).toISOString(),
      });

      // Store location for offline access
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        let history = stored ? JSON.parse(stored) : [];
        
        locations.forEach(loc => {
          history.push({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            speed: loc.coords.speed,
            heading: loc.coords.heading,
            altitude: loc.coords.altitude,
            timestamp: loc.timestamp,
          });
        });

        // Keep only last N locations
        if (history.length > MAX_STORED_LOCATIONS) {
          history = history.slice(-MAX_STORED_LOCATIONS);
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      } catch (e) {
        console.error('[BG Location] Storage error:', e);
      }

      // Notify in-app callback if registered
      if (_locationCallback) {
        try {
          _locationCallback(locations);
        } catch (e) {
          console.error('[BG Location] Callback error:', e);
        }
      }
    }
  }
});

// ─── Public API ──────────────────────────────────────────────────
const BackgroundLocationService = {
  /**
   * Request all necessary location permissions (foreground + background).
   * Shows explanation dialogs to user.
   */
  async requestPermissions() {
    try {
      // Step 1: Foreground permission
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.log('[BG Location] Foreground permission denied');
        return { foreground: false, background: false };
      }

      // Step 2: Background permission
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.log('[BG Location] Background permission denied');
        return { foreground: true, background: false };
      }

      return { foreground: true, background: true };
    } catch (e) {
      console.error('[BG Location] Permission error:', e);
      return { foreground: false, background: false };
    }
  },

  /**
   * Start background location tracking.
   * @param {Object} options
   * @param {boolean} options.sosMode - Higher accuracy + frequency for SOS
   * @param {Function} options.onLocation - Callback for location updates
   */
  async startTracking(options = {}) {
    const { sosMode = false, onLocation = null } = options;

    try {
      // Check permissions
      const perms = await this.requestPermissions();
      if (!perms.foreground) {
        return { success: false, error: 'foreground_permission_denied' };
      }

      // Stop existing tracking first
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      _locationCallback = onLocation;
      _sosActive = sosMode;

      // Configure based on mode
      const config = sosMode
        ? {
            // SOS Mode: Maximum accuracy, frequent updates
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,       // Every 5 seconds
            distanceInterval: 3,      // Or 3 meters
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: '🚨 SOS ACTIVE — SafeHer',
              notificationBody: 'Emergency mode: sharing your live location',
              notificationColor: '#FF1744',
            },
          }
        : {
            // Normal Mode: Battery-efficient tracking
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,      // Every 30 seconds
            distanceInterval: 20,     // Or 20 meters
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: '🛡️ SafeHer Protection Active',
              notificationBody: 'Location tracking is running for your safety',
              notificationColor: '#E91E63',
            },
          };

      // Defer notifications and activity type on iOS
      if (Platform.OS === 'ios') {
        config.activityType = Location.ActivityType.OtherNavigation;
        config.pausesUpdatesAutomatically = false;
        config.deferredUpdatesInterval = sosMode ? 5000 : 30000;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, config);
      _isTracking = true;

      console.log(`[BG Location] Started (mode: ${sosMode ? 'SOS' : 'normal'})`);
      return { success: true, mode: sosMode ? 'sos' : 'normal', backgroundPermission: perms.background };
    } catch (e) {
      console.error('[BG Location] Start error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Switch to SOS mode (higher accuracy + faster updates).
   */
  async activateSOSMode(onLocation) {
    return this.startTracking({ sosMode: true, onLocation });
  },

  /**
   * Switch back to normal tracking mode.
   */
  async deactivateSOSMode(onLocation) {
    return this.startTracking({ sosMode: false, onLocation });
  },

  /**
   * Stop all background location tracking.
   */
  async stopTracking() {
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
      _isTracking = false;
      _locationCallback = null;
      _sosActive = false;
      console.log('[BG Location] Stopped');
      return { success: true };
    } catch (e) {
      console.error('[BG Location] Stop error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Check if background tracking is currently active.
   */
  async isTracking() {
    try {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      return false;
    }
  },

  /**
   * Get stored location history (from background task).
   */
  async getLocationHistory() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('[BG Location] History read error:', e);
      return [];
    }
  },

  /**
   * Clear stored location history.
   */
  async clearHistory() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get the last known location quickly.
   */
  async getLastKnownLocation() {
    try {
      return await Location.getLastKnownPositionAsync();
    } catch {
      return null;
    }
  },

  /**
   * Register a callback for location updates (in-app).
   */
  setLocationCallback(callback) {
    _locationCallback = callback;
  },

  /**
   * Check if currently in SOS mode.
   */
  isSOSMode() {
    return _sosActive;
  },
};

export default BackgroundLocationService;

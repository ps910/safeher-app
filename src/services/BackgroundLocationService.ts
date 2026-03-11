/**
 * BackgroundLocationService — Persistent location tracking
 * Works when app is in background or killed (critical for safety app).
 * Uses expo-location + expo-task-manager for background task.
 *
 * TypeScript conversion — prevents null coordinate crashes in SOS mode
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'SAFEHER_BACKGROUND_LOCATION';
const STORAGE_KEY = '@gs_background_locations';
const MAX_STORED_LOCATIONS = 500;

// ── Types ────────────────────────────────────────────────────────
interface StoredLocationEntry {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: number;
}

interface TrackingOptions {
  sosMode?: boolean;
  onLocation?: ((locations: Location.LocationObject[]) => void) | null;
}

interface TrackingResult {
  success: boolean;
  error?: string;
  mode?: 'sos' | 'normal';
  backgroundPermission?: boolean;
}

interface PermissionResult {
  foreground: boolean;
  background: boolean;
}

// ─── State ───────────────────────────────────────────────────────
let _locationCallback: ((locations: Location.LocationObject[]) => void) | null = null;
let _isTracking = false;
let _sosActive = false;

// ─── Define the background task ──────────────────────────────────
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
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
        accuracy: Math.round(latest.coords.accuracy ?? 0),
        timestamp: new Date(latest.timestamp).toISOString(),
      });

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        let history: StoredLocationEntry[] = stored ? JSON.parse(stored) : [];

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

        if (history.length > MAX_STORED_LOCATIONS) {
          history = history.slice(-MAX_STORED_LOCATIONS);
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      } catch (e) {
        console.error('[BG Location] Storage error:', e);
      }

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
  async requestPermissions(): Promise<PermissionResult> {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        console.log('[BG Location] Foreground permission denied');
        return { foreground: false, background: false };
      }

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

  async startTracking(options: TrackingOptions = {}): Promise<TrackingResult> {
    const { sosMode = false, onLocation = null } = options;

    try {
      const perms = await this.requestPermissions();
      if (!perms.foreground) {
        return { success: false, error: 'foreground_permission_denied' };
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }

      _locationCallback = onLocation;
      _sosActive = sosMode;

      const config: Location.LocationTaskOptions = sosMode
        ? {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 3,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: '🚨 SOS ACTIVE — SafeHer',
              notificationBody: 'Emergency mode: sharing your live location',
              notificationColor: '#FF1744',
            },
          }
        : {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 20,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: '🛡️ SafeHer Protection Active',
              notificationBody: 'Location tracking is running for your safety',
              notificationColor: '#E91E63',
            },
          };

      if (Platform.OS === 'ios') {
        (config as any).activityType = Location.ActivityType.OtherNavigation;
        config.pausesUpdatesAutomatically = false;
        (config as any).deferredUpdatesInterval = sosMode ? 5000 : 30000;
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, config);
      _isTracking = true;

      console.log(`[BG Location] Started (mode: ${sosMode ? 'SOS' : 'normal'})`);
      return { success: true, mode: sosMode ? 'sos' : 'normal', backgroundPermission: perms.background };
    } catch (e: any) {
      console.error('[BG Location] Start error:', e);
      return { success: false, error: e.message };
    }
  },

  async activateSOSMode(onLocation?: (locations: Location.LocationObject[]) => void): Promise<TrackingResult> {
    return this.startTracking({ sosMode: true, onLocation: onLocation ?? null });
  },

  async deactivateSOSMode(onLocation?: (locations: Location.LocationObject[]) => void): Promise<TrackingResult> {
    return this.startTracking({ sosMode: false, onLocation: onLocation ?? null });
  },

  async stopTracking(): Promise<{ success: boolean; error?: string }> {
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
    } catch (e: any) {
      console.error('[BG Location] Stop error:', e);
      return { success: false, error: e.message };
    }
  },

  async isTracking(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      return false;
    }
  },

  async getLocationHistory(): Promise<StoredLocationEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('[BG Location] History read error:', e);
      return [];
    }
  },

  async clearHistory(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },

  async getLastKnownLocation(): Promise<Location.LocationObject | null> {
    try {
      return await Location.getLastKnownPositionAsync();
    } catch {
      return null;
    }
  },

  setLocationCallback(callback: ((locations: Location.LocationObject[]) => void) | null): void {
    _locationCallback = callback;
  },

  isSOSMode(): boolean {
    return _sosActive;
  },
};

export default BackgroundLocationService;

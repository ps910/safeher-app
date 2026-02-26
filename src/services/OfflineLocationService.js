/**
 * OfflineLocationService — Stores location data offline, syncs when online
 * Also handles broadcasting location to nearby app users for help relay
 * 
 * Features:
 * - Caches GPS coordinates locally when offline
 * - Queues SOS location shares for delivery when connectivity returns
 * - Tracks nearby SafeHer users who can relay evidence/location via their internet
 * - Background location tracking with battery-aware intervals
 */
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationsDB, OfflineQueueDB, NearbyUsersDB, AlertsDB, SharedEvidenceDB, UserDB } from './Database';
import CloudSyncService from './CloudSyncService';
import { Platform } from 'react-native';

const OFFLINE_LOC_KEY = '@safeher_offline_locations';
const NEARBY_BROADCAST_KEY = '@safeher_nearby_broadcast';

// ─── Safe connectivity checker (no native dependency) ────────────
const checkConnectivity = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 400;
  } catch (e) {
    return false;
  }
};

class OfflineLocationServiceClass {
  constructor() {
    this.isTracking = false;
    this.trackingInterval = null;
    this.syncInterval = null;
    this.locationSubscription = null;
    this.isOnline = true;
    this.deviceId = null;
    this.listeners = new Set();
    this.connectivityInterval = null;
  }

  // ─── Initialize ────────────────────────────────────────────────
  async init() {
    try {
      this.deviceId = await UserDB.getDeviceId();
      // Check initial connectivity
      this.isOnline = await checkConnectivity();

      // Poll connectivity every 30 seconds
      this.connectivityInterval = setInterval(async () => {
        try {
          const wasOffline = !this.isOnline;
          this.isOnline = await checkConnectivity();
          if (wasOffline && this.isOnline) {
            this.syncOfflineData();
          }
        } catch (e) {}
      }, 30000);
    } catch (e) {
      console.log('OfflineLocationService init error:', e);
    }
  }

  // ─── Subscribe to location updates ─────────────────────────────
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(data) {
    this.listeners.forEach(cb => {
      try { cb(data); } catch (e) {}
    });
  }

  // ─── Start Tracking ────────────────────────────────────────────
  async startTracking(intervalMs = 10000) {
    if (this.isTracking) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    this.isTracking = true;

    // Get immediate location
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await this.saveLocation(loc, 'tracking');
    } catch (e) {
      console.log('Initial location error:', e);
    }

    // Start interval-based tracking
    this.trackingInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await this.saveLocation(loc, 'tracking');
        this.notifyListeners({ type: 'location_update', location: loc });
      } catch (e) {
        console.log('Tracking location error:', e);
      }
    }, intervalMs);

    // Start sync interval (every 30s, try to sync if online)
    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.syncOfflineData();
      }
    }, 30000);

    return true;
  }

  // ─── Stop Tracking ─────────────────────────────────────────────
  stopTracking() {
    this.isTracking = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
  }

  // ─── Save Location (works offline) ────────────────────────────
  async saveLocation(location, context = 'tracking') {
    try {
      const entry = await LocationsDB.add(location, context);

      // If we're offline, also queue for SMS/sharing when back online
      if (!this.isOnline) {
        await OfflineQueueDB.add({
          type: 'share_location',
          data: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: Date.now(),
            context,
          },
        });
      }

      // Register ourselves as an active nearby user
      await this.registerAsNearbyUser(location);

      return entry;
    } catch (e) {
      console.log('Save location error:', e);
      return null;
    }
  }

  // ─── SOS Location Share (offline-capable) ──────────────────────
  async shareSOSLocation(location, contacts, message) {
    // Always save locally first
    await LocationsDB.add(location, 'sos');

    // Create a danger alert for nearby users
    const alert = await AlertsDB.add({
      type: 'SOS_DANGER',
      severity: 'critical',
      latitude: location?.coords?.latitude,
      longitude: location?.coords?.longitude,
      accuracy: location?.coords?.accuracy || null,
      speed: location?.coords?.speed || null,
      heading: location?.coords?.heading || null,
      message: message || 'Someone nearby is in danger and needs help!',
      deviceId: this.deviceId,
      contactsNotified: contacts?.length || 0,
      isMoving: false,
      locationUpdateCount: 0,
      locationHistory: [{
        latitude: location?.coords?.latitude,
        longitude: location?.coords?.longitude,
        timestamp: new Date().toISOString(),
        accuracy: location?.coords?.accuracy,
      }],
    });

    if (this.isOnline) {
      // Online — share immediately
      return { status: 'sent', method: 'online', alertId: alert.id };
    } else {
      // Offline — queue for later + try SMS
      await OfflineQueueDB.add({
        type: 'sos_location_share',
        priority: 'critical',
        data: {
          latitude: location?.coords?.latitude,
          longitude: location?.coords?.longitude,
          contacts: contacts?.map(c => ({ name: c.name, phone: c.phone })),
          message,
          timestamp: Date.now(),
        },
      });

      // Also queue for nearby user relay
      await OfflineQueueDB.add({
        type: 'nearby_relay_request',
        priority: 'critical',
        data: {
          latitude: location?.coords?.latitude,
          longitude: location?.coords?.longitude,
          needsInternetRelay: true,
          message: 'Victim is offline. Please call for help!',
          timestamp: Date.now(),
        },
      });

      return { status: 'queued', method: 'offline', alertId: alert.id };
    }
  }

  // ─── Live SOS Location Broadcast (5s refresh) ─────────────────
  async startLiveSOSBroadcast(alertId) {
    this.activeSOSAlertId = alertId;
    this.prevSOSLat = null;
    this.prevSOSLon = null;

    // Immediately get first location
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      this.prevSOSLat = loc.coords.latitude;
      this.prevSOSLon = loc.coords.longitude;
    } catch (e) {}

    // Update alert location every 5 seconds
    this.sosBroadcastInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        const { latitude, longitude, accuracy, speed, heading } = loc.coords;

        // Detect movement: >5 meters from previous position
        let isMoving = false;
        if (this.prevSOSLat != null && this.prevSOSLon != null) {
          const dist = this._haversineM(this.prevSOSLat, this.prevSOSLon, latitude, longitude);
          isMoving = dist > 5;
        }
        this.prevSOSLat = latitude;
        this.prevSOSLon = longitude;

        await AlertsDB.updateLocation(this.activeSOSAlertId, latitude, longitude, {
          accuracy, speed, heading, isMoving,
        });

        this.notifyListeners({
          type: 'sos_location_update',
          alertId: this.activeSOSAlertId,
          location: loc,
          isMoving,
        });
      } catch (e) {
        console.log('[SOS Broadcast] Location update error:', e);
      }
    }, 5000);

    console.log('[SOS Broadcast] Started live broadcast for alert:', alertId);
  }

  stopLiveSOSBroadcast() {
    if (this.sosBroadcastInterval) {
      clearInterval(this.sosBroadcastInterval);
      this.sosBroadcastInterval = null;
    }
    // Resolve the alert
    if (this.activeSOSAlertId) {
      AlertsDB.resolveAlert(this.activeSOSAlertId).catch(() => {});
    }
    this.activeSOSAlertId = null;
    this.prevSOSLat = null;
    this.prevSOSLon = null;
    console.log('[SOS Broadcast] Stopped');
  }

  // Internal haversine for meters
  _haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Register as Nearby User ──────────────────────────────────
  async registerAsNearbyUser(location) {
    if (!location?.coords) return;
    try {
      await NearbyUsersDB.register({
        deviceId: this.deviceId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        hasInternet: this.isOnline,
        platform: Platform.OS,
      });
    } catch (e) {
      console.log('Register nearby error:', e);
    }
  }

  // ─── Get Nearby Users Who Can Help ────────────────────────────
  async getNearbyHelpers(lat, lon, radiusKm = 2) {
    try {
      const nearby = await NearbyUsersDB.getNearby(lat, lon, radiusKm);
      // Filter to those with internet (can relay evidence)
      return nearby.filter(u => u.hasInternet);
    } catch (e) {
      return [];
    }
  }

  // ─── Request Evidence Relay from Nearby User ──────────────────
  async requestEvidenceRelay(evidenceData, location) {
    const request = await SharedEvidenceDB.add({
      type: 'relay_request',
      evidenceType: evidenceData.type,
      evidenceUri: evidenceData.uri,
      evidenceSize: evidenceData.size,
      latitude: location?.coords?.latitude,
      longitude: location?.coords?.longitude,
      requesterDeviceId: this.deviceId,
      status: 'pending',
    });

    // If offline, queue it
    if (!this.isOnline) {
      await OfflineQueueDB.add({
        type: 'evidence_relay',
        priority: 'high',
        data: {
          evidenceId: request.id,
          ...evidenceData,
        },
      });
    }

    return request;
  }

  // ─── Sync Offline Data ────────────────────────────────────────
  async syncOfflineData() {
    if (!this.isOnline) return;

    try {
      // ── 1. Trigger CloudSync for all data ──
      CloudSyncService.syncAll().catch(e => console.log('[Sync] Cloud sync error:', e));

      const pendingActions = await OfflineQueueDB.getPending();

      for (const action of pendingActions) {
        try {
          switch (action.type) {
            case 'share_location':
              // Sync unsynced locations to cloud then mark local as synced
              const unsynced = await LocationsDB.getUnsynced();
              if (unsynced.length > 0) {
                await CloudSyncService.syncBatch('locations', unsynced);
                await LocationsDB.markSynced(unsynced.map(l => l.id));
              }
              await OfflineQueueDB.markCompleted(action.id);
              break;

            case 'sos_location_share':
              // Push SOS data to cloud immediately
              if (action.data) {
                await CloudSyncService.syncSOSEvent({
                  id: action.id,
                  ...action.data,
                  type: 'SOS_DANGER',
                });
              }
              await OfflineQueueDB.markCompleted(action.id);
              this.notifyListeners({
                type: 'sos_synced',
                data: action.data,
              });
              break;

            case 'evidence_relay':
              // Sync evidence to cloud
              if (action.data) {
                await CloudSyncService.syncRecord('evidence_relay', action.id, action.data);
              }
              await OfflineQueueDB.markCompleted(action.id);
              break;

            case 'nearby_relay_request':
              await CloudSyncService.syncRecord('relay_requests', action.id, action.data || {});
              await OfflineQueueDB.markCompleted(action.id);
              break;

            default:
              await OfflineQueueDB.markCompleted(action.id);
          }
        } catch (e) {
          await OfflineQueueDB.markFailed(action.id);
        }
      }

      // Clean up completed items
      await OfflineQueueDB.clearCompleted();
      this.notifyListeners({ type: 'sync_complete' });
    } catch (e) {
      console.log('Sync error:', e);
    }
  }

  // ─── Get Offline Queue Status ─────────────────────────────────
  async getQueueStatus() {
    const pending = await OfflineQueueDB.getPending();
    const total = await OfflineQueueDB.getAll();
    return {
      pending: pending.length,
      total: total.length,
      isOnline: this.isOnline,
      isTracking: this.isTracking,
    };
  }

  // ─── Get Last Known Location ──────────────────────────────────
  async getLastKnown() {
    const recent = await LocationsDB.getRecent(1);
    return recent.length > 0 ? recent[0] : null;
  }
}

const OfflineLocationService = new OfflineLocationServiceClass();
export default OfflineLocationService;

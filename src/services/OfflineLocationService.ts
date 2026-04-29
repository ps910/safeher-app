/**
 * OfflineLocationService — Stores location data offline, syncs when online
 * Also handles broadcasting location to nearby app users for help relay
 *
 * TypeScript conversion — catches null/undefined bugs in SOS-critical paths
 */
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationsDB, OfflineQueueDB, NearbyUsersDB, AlertsDB, SharedEvidenceDB, UserDB } from './Database';
import CloudSyncService from './CloudSyncService';
import { Platform } from 'react-native';

import type { EmergencyContact, LocationData } from '../types';
import Logger from '../utils/logger';

// ── Types ────────────────────────────────────────────────────────
interface SOSShareResult {
  status: 'sent' | 'queued';
  method: 'online' | 'offline';
  alertId: string;
}

interface QueueStatus {
  pending: number;
  total: number;
  isOnline: boolean;
  isTracking: boolean;
}

interface EvidenceData {
  type: string;
  uri: string;
  size?: number;
}

type ListenerCallback = (data: Record<string, any>) => void;

const OFFLINE_LOC_KEY = '@safeher_offline_locations';
const NEARBY_BROADCAST_KEY = '@safeher_nearby_broadcast';

// ─── Safe connectivity checker (no native dependency) ────────────
const checkConnectivity = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
};

class OfflineLocationServiceClass {
  isTracking: boolean = false;
  isOnline: boolean = true;
  deviceId: string | null = null;

  private trackingInterval: ReturnType<typeof setInterval> | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private connectivityInterval: ReturnType<typeof setInterval> | null = null;
  private sosBroadcastInterval: ReturnType<typeof setInterval> | null = null;
  private locationSubscription: Location.LocationSubscription | null = null;
  private listeners: Set<ListenerCallback> = new Set();
  private activeSOSAlertId: string | null = null;
  private prevSOSLat: number | null = null;
  private prevSOSLon: number | null = null;

  // ─── Initialize ────────────────────────────────────────────────
  async init(): Promise<void> {
    try {
      this.deviceId = await UserDB.getDeviceId();
      this.isOnline = await checkConnectivity();

      this.connectivityInterval = setInterval(async () => {
        try {
          const wasOffline = !this.isOnline;
          this.isOnline = await checkConnectivity();
          if (wasOffline && this.isOnline) {
            this.syncOfflineData();
          }
        } catch {}
      }, 30000);
    } catch (e) {
      Logger.log('OfflineLocationService init error:', e);
    }
  }

  // ─── Subscribe to location updates ─────────────────────────────
  addListener(callback: ListenerCallback): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  private notifyListeners(data: Record<string, any>): void {
    this.listeners.forEach(cb => {
      try { cb(data); } catch {}
    });
  }

  // ─── Start Tracking ────────────────────────────────────────────
  async startTracking(intervalMs: number = 10000): Promise<boolean | undefined> {
    if (this.isTracking) return undefined;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    this.isTracking = true;

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await this.saveLocation(loc, 'tracking');
    } catch (e) {
      Logger.log('Initial location error:', e);
    }

    this.trackingInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await this.saveLocation(loc, 'tracking');
        this.notifyListeners({ type: 'location_update', location: loc });
      } catch (e) {
        Logger.log('Tracking location error:', e);
      }
    }, intervalMs);

    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.syncOfflineData();
      }
    }, 30000);

    return true;
  }

  // ─── Stop Tracking ─────────────────────────────────────────────
  stopTracking(): void {
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
  async saveLocation(location: Location.LocationObject, context: string = 'tracking'): Promise<any> {
    try {
      const entry = await LocationsDB.add(location, context);

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

      await this.registerAsNearbyUser(location);
      return entry;
    } catch (e) {
      Logger.log('Save location error:', e);
      return null;
    }
  }

  // ─── SOS Location Share (offline-capable) ──────────────────────
  async shareSOSLocation(
    location: Location.LocationObject,
    contacts: EmergencyContact[],
    message?: string
  ): Promise<SOSShareResult> {
    await LocationsDB.add(location, 'sos');

    const alert = await AlertsDB.add({
      type: 'SOS_DANGER',
      severity: 'critical',
      latitude: location?.coords?.latitude,
      longitude: location?.coords?.longitude,
      accuracy: (location?.coords?.accuracy ?? null) as number | undefined,
      speed: (location?.coords?.speed ?? null) as number | undefined,
      heading: (location?.coords?.heading ?? null) as number | undefined,
      message: message || 'Someone nearby is in danger and needs help!',
      deviceId: this.deviceId as string | undefined,
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
      return { status: 'sent', method: 'online', alertId: alert.id };
    } else {
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
  async startLiveSOSBroadcast(alertId: string): Promise<void> {
    this.activeSOSAlertId = alertId;
    this.prevSOSLat = null;
    this.prevSOSLon = null;

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      this.prevSOSLat = loc.coords.latitude;
      this.prevSOSLon = loc.coords.longitude;
    } catch {}

    this.sosBroadcastInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        const { latitude, longitude, accuracy, speed, heading } = loc.coords;

        let isMoving = false;
        if (this.prevSOSLat != null && this.prevSOSLon != null) {
          const dist = this._haversineM(this.prevSOSLat, this.prevSOSLon, latitude, longitude);
          isMoving = dist > 5;
        }
        this.prevSOSLat = latitude;
        this.prevSOSLon = longitude;

        await AlertsDB.updateLocation(this.activeSOSAlertId!, latitude, longitude, {
          accuracy: accuracy as number | undefined, speed: speed as number | undefined, heading: heading as number | undefined, isMoving,
        });

        this.notifyListeners({
          type: 'sos_location_update',
          alertId: this.activeSOSAlertId,
          location: loc,
          isMoving,
        });
      } catch (e) {
        Logger.log('[SOS Broadcast] Location update error:', e);
      }
    }, 5000);

    Logger.log('[SOS Broadcast] Started live broadcast for alert:', alertId);
  }

  stopLiveSOSBroadcast(): void {
    if (this.sosBroadcastInterval) {
      clearInterval(this.sosBroadcastInterval);
      this.sosBroadcastInterval = null;
    }
    if (this.activeSOSAlertId) {
      AlertsDB.resolveAlert(this.activeSOSAlertId).catch(() => {});
    }
    this.activeSOSAlertId = null;
    this.prevSOSLat = null;
    this.prevSOSLon = null;
    Logger.log('[SOS Broadcast] Stopped');
  }

  // Internal haversine for meters
  private _haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ─── Register as Nearby User ──────────────────────────────────
  private async registerAsNearbyUser(location: Location.LocationObject): Promise<void> {
    if (!location?.coords) return;
    try {
      await NearbyUsersDB.register({
        deviceId: this.deviceId as string | undefined,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        hasInternet: this.isOnline,
        platform: Platform.OS,
      });
    } catch (e) {
      Logger.log('Register nearby error:', e);
    }
  }

  // ─── Get Nearby Users Who Can Help ────────────────────────────
  async getNearbyHelpers(lat: number, lon: number, radiusKm: number = 2): Promise<any[]> {
    try {
      const nearby = await NearbyUsersDB.getNearby(lat, lon, radiusKm);
      return nearby.filter((u: any) => u.hasInternet);
    } catch {
      return [];
    }
  }

  // ─── Request Evidence Relay from Nearby User ──────────────────
  async requestEvidenceRelay(evidenceData: EvidenceData, location: Location.LocationObject): Promise<any> {
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
  async syncOfflineData(): Promise<void> {
    if (!this.isOnline) return;

    try {
      CloudSyncService.syncAll().catch((e: Error) => Logger.log('[Sync] Cloud sync error:', e));

      const pendingActions = await OfflineQueueDB.getPending();

      for (const action of pendingActions) {
        try {
          switch (action.type) {
            case 'share_location': {
              const unsynced = await LocationsDB.getUnsynced();
              if (unsynced.length > 0) {
                await CloudSyncService.syncBatch('locations', unsynced);
                await LocationsDB.markSynced(unsynced.map((l: any) => l.id));
              }
              await OfflineQueueDB.markCompleted(action.id);
              break;
            }

            case 'sos_location_share':
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
        } catch {
          await OfflineQueueDB.markFailed(action.id);
        }
      }

      await OfflineQueueDB.clearCompleted();
      this.notifyListeners({ type: 'sync_complete' });
    } catch (e) {
      Logger.log('Sync error:', e);
    }
  }

  // ─── Get Offline Queue Status ─────────────────────────────────
  async getQueueStatus(): Promise<QueueStatus> {
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
  async getLastKnown(): Promise<any> {
    const recent = await LocationsDB.getRecent(1);
    return recent.length > 0 ? recent[0] : null;
  }
}

const OfflineLocationService = new OfflineLocationServiceClass();
export default OfflineLocationService;

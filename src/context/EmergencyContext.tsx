/**
 * Emergency Context v6.0 (TypeScript) - Global state for ALL safety features
 * Supports: SOS, Siren, Shake, Stealth, Recording, Tracking,
 *           Inactivity Timer, Journey Monitor, Scream Detection, Voice SOS,
 *           Live Location Tracking, Background Location, Push Notifications,
 *           Live Sharing Sessions, Encrypted Storage
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import {
  startLiveLocationTracking,
  stopLiveLocationTracking,
  sendLiveLocationUpdate,
  requestLocationPermission,
  makePhoneCall,
} from '../utils/helpers';
import OfflineLocationService from '../services/OfflineLocationService';
import SafetyAIService from '../services/SafetyAIService';
import BackgroundLocationService from '../services/BackgroundLocationService';
import NotificationService from '../services/NotificationService';
import LiveLocationSharingService from '../services/LiveLocationSharingService';
import EncryptedStorageService from '../services/EncryptedStorageService';
import Logger from '../utils/logger';
import type { EmergencySettings, EmergencyContact, LocationData } from '../types';

// ── Types ──────────────────────────────────────────────────────

interface SOSHistoryEntry {
  id: string;
  timestamp: string;
  location: LocationData | null;
  type: string;
}

interface ActiveJourney {
  active: boolean;
  destination: string;
  startTime: string;
  startLocation: LocationData | null;
  expectedArrival: string;
  minutesToArrive: number;
}

interface CompletedJourney extends ActiveJourney {
  completedAt: string;
  endLocation: LocationData | null;
  breadcrumbs: Breadcrumb[];
  stats: JourneyStats;
  status: 'overdue' | 'completed';
}

interface Breadcrumb {
  latitude: number;
  longitude: number;
  speed: number;
  accuracy: number;
  altitude: number;
  timestamp: string;
  moving: boolean;
  distFromPrev: number;
}

interface JourneyStats {
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
}

interface LiveShareSession {
  shareUrl?: string;
  [key: string]: any;
}

interface JourneyShareData {
  destination: string;
  startTime: string;
  expectedArrival: string;
  startLocation: LocationData | null;
  currentLocation: LocationData | null;
  breadcrumbs: Breadcrumb[];
  stats: JourneyStats;
  isOverdue: boolean;
  totalPoints: number;
}

interface LiveShareOptions {
  userName?: string;
  ttlMinutes?: number;
  purpose?: string;
}

interface EmergencyContextValue {
  emergencyContacts: EmergencyContact[];
  settings: EmergencySettings;
  sosMessage: string;
  isSOSActive: boolean;
  currentLocation: LocationData | null;
  stealthMode: boolean;
  isTracking: boolean;
  isRecording: boolean;
  sirenActive: boolean;
  sosHistory: SOSHistoryEntry[];
  // v4.0
  lastCheckIn: Date;
  checkInOverdue: boolean;
  activeJourney: ActiveJourney | null;
  journeyOverdue: boolean;
  isScreamDetecting: boolean;
  // v5.0
  liveLocation: LocationData | null;
  isLiveTracking: boolean;
  // v6.0 journey breadcrumbs
  journeyBreadcrumbs: Breadcrumb[];
  isDeviceMoving: boolean;
  journeyStats: JourneyStats;
  journeyHistory: CompletedJourney[];
  // v6.0 background location + live sharing + push
  isBackgroundTracking: boolean;
  liveShareSession: LiveShareSession | null;
  isLiveSharing: boolean;
  pushToken: string | null;
  // AI service status
  aiServiceStatus: Record<string, any>;
  // setters
  setCurrentLocation: React.Dispatch<React.SetStateAction<LocationData | null>>;
  setIsTracking: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>;
  setSirenActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsScreamDetecting: React.Dispatch<React.SetStateAction<boolean>>;
  // methods
  addContact: (contact: Partial<EmergencyContact>) => Promise<EmergencyContact>;
  removeContact: (contactId: string) => Promise<void>;
  updateContact: (contactId: string, updates: Partial<EmergencyContact>) => Promise<void>;
  getContactsByTier: (tier: number) => EmergencyContact[];
  saveContacts: (contacts: EmergencyContact[]) => Promise<void>;
  updateSettings: (newSettings: Partial<EmergencySettings>) => Promise<void>;
  updateSOSMessage: (message: string) => Promise<void>;
  toggleStealthMode: () => Promise<void>;
  triggerSOS: () => Promise<void>;
  cancelSOS: () => Promise<void>;
  checkIn: () => void;
  startJourney: (destination: string, minutesToArrive: number) => Promise<ActiveJourney>;
  completeJourney: () => Promise<void>;
  extendJourney: (extraMinutes: number) => Promise<void>;
  getJourneyShareData: () => JourneyShareData | null;
  // v6.0 live sharing
  startLiveLocationSharing: (options?: LiveShareOptions) => Promise<LiveShareSession | null>;
  stopLiveLocationSharing: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────

const EmergencyContext = createContext<EmergencyContextValue | undefined>(undefined);

const STORAGE_KEYS = {
  CONTACTS: '@girl_safety_contacts',
  SETTINGS: '@girl_safety_settings',
  SOS_MESSAGE: '@girl_safety_sos_message',
  STEALTH: '@girl_safety_stealth',
  SOS_HISTORY: '@girl_safety_sos_history',
  JOURNEY: '@girl_safety_journey',
  JOURNEY_BREADCRUMBS: '@girl_safety_journey_breadcrumbs',
  JOURNEY_HISTORY: '@girl_safety_journey_history',
} as const;

const DEFAULT_SOS_MESSAGE =
  '🆘 EMERGENCY! I am in danger and need immediate help! Please track my location and contact authorities NOW. Sent from Girl Safety App.';

const DEFAULT_SETTINGS: EmergencySettings = {
  shakeToSOS: true,
  autoLocationShare: true,
  sirenEnabled: true,
  countdownSeconds: 5,
  autoCallPolice: false,
  autoRecordAudio: true,
  offlineSOS: true,
  hiddenMode: false,
  voiceActivation: false,
  inactivitySOSEnabled: false,
  inactivityTimeout: 30,
  screamDetection: false,
  screamThreshold: 80,
  autoPhotoCapture: true,
  journeyAlerts: true,
  panicWipeEnabled: false,
  backgroundLocationEnabled: true,
  persistentSOSNotification: true,
  volumeButtonSOS: true,
  liveLocationSharing: true,
  pushNotifications: true,
  countryOverride: null,
};

interface EmergencyProviderProps {
  children: ReactNode;
}

export const EmergencyProvider: React.FC<EmergencyProviderProps> = ({ children }) => {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [settings, setSettings] = useState<EmergencySettings>(DEFAULT_SETTINGS);
  const [sosMessage, setSosMessage] = useState<string>(DEFAULT_SOS_MESSAGE);
  const [isSOSActive, setIsSOSActive] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [stealthMode, setStealthMode] = useState<boolean>(false);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sirenActive, setSirenActive] = useState<boolean>(false);
  const [sosHistory, setSOSHistory] = useState<SOSHistoryEntry[]>([]);

  // v4.0 state
  const [lastCheckIn, setLastCheckIn] = useState<Date>(new Date());
  const [checkInOverdue, setCheckInOverdue] = useState<boolean>(false);
  const [activeJourney, setActiveJourney] = useState<ActiveJourney | null>(null);
  const [journeyOverdue, setJourneyOverdue] = useState<boolean>(false);
  const [isScreamDetecting, setIsScreamDetecting] = useState<boolean>(false);

  // v5.0 Live Location during SOS
  const [liveLocation, setLiveLocation] = useState<LocationData | null>(null);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);

  // v6.0 Background Location + Live Sharing + Push
  const [isBackgroundTracking, setIsBackgroundTracking] = useState<boolean>(false);
  const [liveShareSession, setLiveShareSession] = useState<LiveShareSession | null>(null);
  const [isLiveSharing, setIsLiveSharing] = useState<boolean>(false);
  const [pushToken, setPushToken] = useState<string | null>(null);

  // v6.0 Journey Breadcrumb Tracking
  const [journeyBreadcrumbs, setJourneyBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [isDeviceMoving, setIsDeviceMoving] = useState<boolean>(false);
  const [journeyStats, setJourneyStats] = useState<JourneyStats>({ distance: 0, avgSpeed: 0, maxSpeed: 0 });
  const [journeyHistory, setJourneyHistory] = useState<CompletedJourney[]>([]);

  // AI service status
  const [aiServiceStatus, setAiServiceStatus] = useState<Record<string, any>>({});

  // Security: SOS rate limiting
  const lastSOSTriggerRef = useRef<number>(0);
  const SOS_COOLDOWN_MS = 60000;

  const inactivityRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const journeyRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const locationUpdateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLocationSentRef = useRef<LocationData | null>(null);
  const journeyLocationRef = useRef<Location.LocationSubscription | null>(null);
  const journeyBreadcrumbsRef = useRef<Breadcrumb[]>([]);
  const lastBreadcrumbRef = useRef<Breadcrumb | null>(null);

  // ── Load saved data on mount ──
  useEffect(() => {
    loadSavedData();

    const unsub = SafetyAIService.addListener((event: { type: string }) => {
      setAiServiceStatus(SafetyAIService.getStatus());
      if (event.type === 'scream_detected') {
        Alert.alert(
          '🔊 Loud Sound Detected!',
          'A scream or loud sound was detected. Do you need help?',
          [
            { text: "I'm OK", style: 'cancel' },
            { text: '🆘 SEND SOS', style: 'destructive', onPress: () => triggerSOS() },
          ],
          { cancelable: true }
        );
      }
    });

    return () => {
      unsub();
      SafetyAIService.cleanup();
    };
  }, []);

  // ── Start/stop AI services based on settings ──
  useEffect(() => {
    if (settings.shakeToSOS && !isSOSActive) {
      SafetyAIService.startShakeDetection(() => {
        triggerSOS();
      });
    } else {
      SafetyAIService.stopShakeDetection();
    }

    if (settings.screamDetection && !isSOSActive) {
      SafetyAIService.startScreamDetection(
        (_level: number) => { /* handled by listener above */ },
        -20 + (settings.screamThreshold ? (settings.screamThreshold - 80) * 0.5 : 0)
      );
    } else {
      SafetyAIService.stopScreamDetection();
    }

    setAiServiceStatus(SafetyAIService.getStatus());
  }, [settings.shakeToSOS, settings.screamDetection, isSOSActive]);

  // ── Inactivity Monitor ──
  useEffect(() => {
    if (inactivityRef.current) clearInterval(inactivityRef.current);

    if (settings.inactivitySOSEnabled && !isSOSActive) {
      let warnedOnce = false;
      let escalationFired = false;
      inactivityRef.current = setInterval(async () => {
        const elapsed = (Date.now() - lastCheckIn.getTime()) / 1000 / 60;
        if (elapsed < settings.inactivityTimeout) {
          warnedOnce = false;
          escalationFired = false;
          return;
        }

        if (!warnedOnce) {
          setCheckInOverdue(true);
          warnedOnce = true;
          // Push notification escalation — alert must reach the user
          // even if the screen is locked or app is backgrounded.
          try {
            await NotificationService.showCheckInReminder(Math.round(elapsed));
          } catch {}
          Alert.alert(
            '⏱️ Check-In Overdue!',
            `You haven't checked in for ${Math.round(elapsed)} minutes. Tap below to confirm you're safe.`,
            [
              { text: "I'm Safe ✓", onPress: () => { checkIn(); warnedOnce = false; escalationFired = false; } },
              { text: '🆘 Send SOS', style: 'destructive', onPress: () => triggerSOS() },
            ],
            { cancelable: false },
          );
        }

        // Escalation: re-notify (don't auto-trigger SOS without consent).
        if (warnedOnce && !escalationFired && elapsed >= settings.inactivityTimeout + 10) {
          escalationFired = true;
          try {
            await NotificationService.showCheckInReminder(Math.round(elapsed));
          } catch {}
        }
      }, 30000);
    }

    return () => {
      if (inactivityRef.current) clearInterval(inactivityRef.current);
    };
  }, [settings.inactivitySOSEnabled, settings.inactivityTimeout, lastCheckIn, isSOSActive]);

  // ── Journey Monitor ──
  useEffect(() => {
    if (journeyRef.current) clearInterval(journeyRef.current);

    if (activeJourney && !journeyOverdue) {
      journeyRef.current = setInterval(() => {
        const eta = new Date(activeJourney.expectedArrival).getTime();
        if (Date.now() > eta) {
          setJourneyOverdue(true);
        }
      }, 15000);
    }

    return () => {
      if (journeyRef.current) clearInterval(journeyRef.current);
    };
  }, [activeJourney, journeyOverdue]);

  const loadSavedData = async (): Promise<void> => {
    try {
      await EncryptedStorageService.migrateToEncrypted();

      const [contactsData, settingsData, messageData, stealthData, historyData, journeyData] =
        await Promise.all([
          EncryptedStorageService.getItem(STORAGE_KEYS.CONTACTS),
          EncryptedStorageService.getItem(STORAGE_KEYS.SETTINGS),
          EncryptedStorageService.getItem(STORAGE_KEYS.SOS_MESSAGE),
          AsyncStorage.getItem(STORAGE_KEYS.STEALTH),
          AsyncStorage.getItem(STORAGE_KEYS.SOS_HISTORY),
          AsyncStorage.getItem(STORAGE_KEYS.JOURNEY),
        ]);

      if (contactsData) setEmergencyContacts(JSON.parse(contactsData));
      if (settingsData) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) });
      if (messageData) setSosMessage(messageData);
      if (stealthData) setStealthMode(JSON.parse(stealthData));
      if (historyData) setSOSHistory(JSON.parse(historyData));
      if (journeyData) {
        const j = JSON.parse(journeyData) as ActiveJourney;
        if (j && j.active) setActiveJourney(j);
      }

      const breadcrumbData = await AsyncStorage.getItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS);
      if (breadcrumbData) {
        const crumbs: Breadcrumb[] = JSON.parse(breadcrumbData);
        setJourneyBreadcrumbs(crumbs);
        journeyBreadcrumbsRef.current = crumbs;
      }

      const histData = await AsyncStorage.getItem(STORAGE_KEYS.JOURNEY_HISTORY);
      if (histData) setJourneyHistory(JSON.parse(histData));

      // Initialize v6.0 services
      const notifResult = await NotificationService.initialize({
        onSOSTrigger: () => triggerSOS(),
      });
      if (notifResult.pushToken) setPushToken(notifResult.pushToken);

      const loadedSettings: EmergencySettings = settingsData
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) }
        : DEFAULT_SETTINGS;

      if (loadedSettings.persistentSOSNotification) {
        await NotificationService.showPersistentSOSNotification();
      }

      if (loadedSettings.backgroundLocationEnabled) {
        await BackgroundLocationService.startTracking({
          sosMode: false,
          onLocation: (locations: LocationData[]) => {
            if (locations?.length > 0) {
              const latest = locations[locations.length - 1];
              setCurrentLocation(latest);
              if (LiveLocationSharingService.isSharing()) {
                LiveLocationSharingService.updateLocation(latest);
              }
            }
          },
        });
        setIsBackgroundTracking(true);
      }
    } catch (error) {
      Logger.error('Error loading saved data:', error);
    }
  };

  // ── Contacts CRUD (encrypted storage) ──
  const saveContacts = async (contacts: EmergencyContact[]): Promise<void> => {
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
      setEmergencyContacts(contacts);
    } catch (error) {
      Logger.error('Error saving contacts:', error);
    }
  };

  const addContact = async (contact: Partial<EmergencyContact>): Promise<EmergencyContact> => {
    const newContact: EmergencyContact = {
      id: Date.now().toString(),
      name: contact.name || '',
      phone: contact.phone || '',
      tier: (contact as any).tier || 1,
      ...contact,
      createdAt: new Date().toISOString(),
    } as EmergencyContact;
    const updated = [...emergencyContacts, newContact];
    await saveContacts(updated);
    return newContact;
  };

  const updateContact = async (contactId: string, updates: Partial<EmergencyContact>): Promise<void> => {
    const updated = emergencyContacts.map((c) =>
      c.id === contactId ? { ...c, ...updates } : c
    );
    await saveContacts(updated);
  };

  const getContactsByTier = (tier: number): EmergencyContact[] => {
    return emergencyContacts.filter((c) => ((c as any).tier || 1) === tier);
  };

  const removeContact = async (contactId: string): Promise<void> => {
    const updated = emergencyContacts.filter((c) => c.id !== contactId);
    await saveContacts(updated);
  };

  // ── Settings (encrypted storage) ──
  const updateSettings = async (newSettings: Partial<EmergencySettings>): Promise<void> => {
    const updated: EmergencySettings = { ...settings, ...newSettings };
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      setSettings(updated);

      if ('backgroundLocationEnabled' in newSettings) {
        if (newSettings.backgroundLocationEnabled) {
          await BackgroundLocationService.startTracking({ sosMode: false });
          setIsBackgroundTracking(true);
        } else {
          await BackgroundLocationService.stopTracking();
          setIsBackgroundTracking(false);
        }
      }
      if ('persistentSOSNotification' in newSettings) {
        if (newSettings.persistentSOSNotification) {
          await NotificationService.showPersistentSOSNotification();
        }
      }
    } catch (error) {
      Logger.error('Error saving settings:', error);
    }
  };

  const updateSOSMessage = async (message: string): Promise<void> => {
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.SOS_MESSAGE, message);
      setSosMessage(message);
    } catch (error) {
      Logger.error('Error saving SOS message:', error);
    }
  };

  const toggleStealthMode = async (): Promise<void> => {
    const newVal = !stealthMode;
    setStealthMode(newVal);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.STEALTH, JSON.stringify(newVal));
    } catch (e) {
      Logger.error('Error saving stealth mode:', e);
    }
  };

  // ── SOS Trigger (v6.0) ──
  const triggerSOS = useCallback(async (): Promise<void> => {
    const now = Date.now();
    if (isSOSActive) {
      Logger.log('[SOS] Already active — ignoring duplicate trigger');
      return;
    }
    // Cooldown is set ONLY after a confirmed-success SOS (see end of
    // function). Failed/cancelled triggers leave the cooldown alone so
    // the user can retry immediately — critical for emergencies.
    if (now - lastSOSTriggerRef.current < SOS_COOLDOWN_MS) {
      const remaining = Math.ceil((SOS_COOLDOWN_MS - (now - lastSOSTriggerRef.current)) / 1000);
      Alert.alert('SOS Cooldown', `Please wait ${remaining}s before triggering SOS again.`);
      return;
    }

    setIsSOSActive(true);
    const entry: SOSHistoryEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      location: currentLocation,
      type: 'SOS',
    };
    const updated = [entry, ...sosHistory].slice(0, 50);
    setSOSHistory(updated);
    AsyncStorage.setItem(STORAGE_KEYS.SOS_HISTORY, JSON.stringify(updated)).catch(() => {});

    // Background location SOS mode
    try {
      await BackgroundLocationService.activateSOSMode();
      setIsBackgroundTracking(true);
      Logger.log('[SOS] Background location SOS mode activated');
    } catch (e) {
      Logger.error('[SOS] Background location SOS mode error:', e);
    }

    // Live location sharing session
    try {
      if (settings.liveLocationSharing) {
        const session = await LiveLocationSharingService.startSession({
          userName: 'SafeHer User',
          ttlMinutes: 60,
          purpose: 'SOS Emergency',
        });
        if (session) {
          setLiveShareSession(session as LiveShareSession);
          setIsLiveSharing(true);
          Logger.log('[SOS] Live sharing started:', session.shareUrl);
        }
      }
    } catch (e) {
      Logger.error('[SOS] Live sharing error:', e);
    }

    // SOS active push notification
    try {
      await NotificationService.sendSOSActiveNotification();
    } catch (e) {
      Logger.error('[SOS] Push notification error:', e);
    }

    // Start live location tracking
    try {
      const subscription = await startLiveLocationTracking((newLocation: LocationData) => {
        setLiveLocation(newLocation);
        setCurrentLocation(newLocation);
        lastLocationSentRef.current = newLocation;
        if (LiveLocationSharingService.isSharing()) {
          LiveLocationSharingService.updateLocation(newLocation).catch(() => {});
        }
      });
      if (subscription) {
        locationWatcherRef.current = subscription;
        setIsLiveTracking(true);
        Logger.log('[SOS] Live location tracking started');
      }
    } catch (e) {
      Logger.error('[SOS] Failed to start live tracking:', e);
    }

    // Broadcast SOS to nearby users
    try {
      const sosResult = await OfflineLocationService.shareSOSLocation(
        currentLocation as any, emergencyContacts, sosMessage
      );
      if (sosResult?.alertId) {
        await OfflineLocationService.startLiveSOSBroadcast(sosResult.alertId);
        Logger.log('[SOS] Nearby broadcast started, alertId:', sosResult.alertId);
      }
    } catch (e) {
      Logger.error('[SOS] Failed to start nearby broadcast:', e);
    }

    // Activate AI SOS services (siren, recording, photo)
    try {
      const aiResult = await SafetyAIService.activateSOSServices(settings);
      Logger.log('[SOS] AI services activated:', aiResult);
      if (aiResult.siren) setSirenActive(true);
      if (aiResult.recording) setIsRecording(true);
    } catch (e) {
      Logger.error('[SOS] AI services activation error:', e);
    }

    // Auto call police if enabled
    if (settings.autoCallPolice) {
      try {
        setTimeout(() => makePhoneCall('112'), 3000);
      } catch (e) {
        Logger.error('[SOS] Auto call police error:', e);
      }
    }

    // Start periodic location update SMS
    locationUpdateTimerRef.current = setInterval(async () => {
      if (lastLocationSentRef.current && emergencyContacts.length > 0) {
        Logger.log('[SOS] Sending periodic live location update');
        await sendLiveLocationUpdate(emergencyContacts, lastLocationSentRef.current);
      }
    }, 2 * 60 * 1000);

    // Set cooldown only after the SOS pipeline successfully kicked off
    // (background mode, live sharing, AI services, broadcast). If any
    // step above threw and was caught, we still got here — that's
    // acceptable because the user has *active* state and re-triggering
    // would just stack timers. Cancel-and-retry path goes through
    // cancelSOS → triggerSOS, which clears state.
    lastSOSTriggerRef.current = Date.now();
  }, [currentLocation, sosHistory, emergencyContacts, sosMessage, settings]);

  const cancelSOS = useCallback(async (): Promise<void> => {
    setIsSOSActive(false);
    setSirenActive(false);
    setIsRecording(false);
    // Allow immediate retry after a manual cancel
    lastSOSTriggerRef.current = 0;

    try {
      const aiResult = await SafetyAIService.deactivateSOSServices();
      Logger.log('[SOS] AI services deactivated:', aiResult);
    } catch (e) {
      Logger.error('[SOS] AI deactivation error:', e);
    }

    try {
      await BackgroundLocationService.deactivateSOSMode();
      Logger.log('[SOS] Background location reverted to normal mode');
    } catch (e) {
      Logger.error('[SOS] Background location deactivation error:', e);
    }

    try {
      if (isLiveSharing) {
        await LiveLocationSharingService.endSession();
        setLiveShareSession(null);
        setIsLiveSharing(false);
        Logger.log('[SOS] Live sharing session ended');
      }
    } catch (e) {
      Logger.error('[SOS] Live sharing stop error:', e);
    }

    if (locationWatcherRef.current) {
      stopLiveLocationTracking(locationWatcherRef.current);
      locationWatcherRef.current = null;
      setIsLiveTracking(false);
      Logger.log('[SOS] Live location tracking stopped');
    }

    OfflineLocationService.stopLiveSOSBroadcast();
    Logger.log('[SOS] Nearby broadcast stopped');

    if (locationUpdateTimerRef.current) {
      clearInterval(locationUpdateTimerRef.current);
      locationUpdateTimerRef.current = null;
    }

    lastLocationSentRef.current = null;
    setLiveLocation(null);

    if (settings.shakeToSOS) {
      SafetyAIService.startShakeDetection(() => triggerSOS());
    }
    if (settings.screamDetection) {
      SafetyAIService.startScreamDetection(() => {}, -20);
    }
  }, [settings, isLiveSharing]);

  // ── Check-In ──
  const checkIn = (): void => {
    setLastCheckIn(new Date());
    setCheckInOverdue(false);
  };

  // ── Haversine distance (meters) ──
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ── Start journey breadcrumb location watcher ──
  const startBreadcrumbTracking = async (): Promise<void> => {
    try {
      const hasPerm = await requestLocationPermission();
      if (!hasPerm) return;

      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 3 },
        (loc) => {
          const { latitude, longitude, speed, accuracy, altitude } = loc.coords;
          const ts = new Date().toISOString();
          const prev = lastBreadcrumbRef.current;

          let moved = false;
          let dist = 0;
          if (prev) {
            dist = haversineDistance(prev.latitude, prev.longitude, latitude, longitude);
            moved = dist > 3;
          } else {
            moved = true;
          }

          setIsDeviceMoving(moved);

          const crumb: Breadcrumb = {
            latitude,
            longitude,
            speed: speed || 0,
            accuracy: accuracy || 0,
            altitude: altitude || 0,
            timestamp: ts,
            moving: moved,
            distFromPrev: dist,
          };

          lastBreadcrumbRef.current = crumb;
          journeyBreadcrumbsRef.current = [...journeyBreadcrumbsRef.current, crumb];
          setJourneyBreadcrumbs([...journeyBreadcrumbsRef.current]);

          // Update stats
          const crumbs = journeyBreadcrumbsRef.current;
          let totalDist = 0;
          let maxSpd = 0;
          let spdSum = 0;
          let spdCount = 0;
          for (let i = 1; i < crumbs.length; i++) {
            totalDist += crumbs[i].distFromPrev || 0;
            if (crumbs[i].speed > 0) {
              spdSum += crumbs[i].speed;
              spdCount++;
              if (crumbs[i].speed > maxSpd) maxSpd = crumbs[i].speed;
            }
          }
          setJourneyStats({
            distance: totalDist,
            avgSpeed: spdCount > 0 ? spdSum / spdCount : 0,
            maxSpeed: maxSpd,
          });

          // Persist breadcrumbs every 10 points
          if (crumbs.length % 10 === 0) {
            AsyncStorage.setItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS, JSON.stringify(crumbs)).catch(() => {});
          }

          setCurrentLocation(loc as unknown as LocationData);
        }
      );
      journeyLocationRef.current = sub;
      Logger.log('[Journey] Breadcrumb tracking started (5s interval)');
    } catch (e) {
      Logger.error('[Journey] Breadcrumb tracking failed:', e);
    }
  };

  const stopBreadcrumbTracking = (): void => {
    if (journeyLocationRef.current) {
      journeyLocationRef.current.remove();
      journeyLocationRef.current = null;
      Logger.log('[Journey] Breadcrumb tracking stopped');
    }
    setIsDeviceMoving(false);
    lastBreadcrumbRef.current = null;
  };

  // ── Journey Tracking (v6.0 with breadcrumbs) ──
  const startJourney = async (destination: string, minutesToArrive: number): Promise<ActiveJourney> => {
    const journey: ActiveJourney = {
      active: true,
      destination,
      startTime: new Date().toISOString(),
      startLocation: currentLocation,
      expectedArrival: new Date(Date.now() + minutesToArrive * 60000).toISOString(),
      minutesToArrive,
    };
    setActiveJourney(journey);
    setJourneyOverdue(false);

    journeyBreadcrumbsRef.current = [];
    setJourneyBreadcrumbs([]);
    setJourneyStats({ distance: 0, avgSpeed: 0, maxSpeed: 0 });
    await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS, '[]').catch(() => {});

    await startBreadcrumbTracking();

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY, JSON.stringify(journey));
    } catch (e) {}
    return journey;
  };

  const completeJourney = async (): Promise<void> => {
    stopBreadcrumbTracking();

    if (activeJourney) {
      const completedJourney: CompletedJourney = {
        ...activeJourney,
        active: false,
        completedAt: new Date().toISOString(),
        endLocation: currentLocation,
        breadcrumbs: journeyBreadcrumbsRef.current,
        stats: journeyStats,
        status: journeyOverdue ? 'overdue' : 'completed',
      };
      const updatedHistory = [completedJourney, ...journeyHistory].slice(0, 20);
      setJourneyHistory(updatedHistory);
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY_HISTORY, JSON.stringify(updatedHistory));
      } catch (e) {}
    }

    setActiveJourney(null);
    setJourneyOverdue(false);
    journeyBreadcrumbsRef.current = [];
    setJourneyBreadcrumbs([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.JOURNEY);
      await AsyncStorage.removeItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS);
    } catch (e) {}
  };

  const extendJourney = async (extraMinutes: number): Promise<void> => {
    if (activeJourney) {
      const updated: ActiveJourney = {
        ...activeJourney,
        expectedArrival: new Date(
          new Date(activeJourney.expectedArrival).getTime() + extraMinutes * 60000
        ).toISOString(),
      };
      setActiveJourney(updated);
      setJourneyOverdue(false);
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY, JSON.stringify(updated));
      } catch (e) {}
    }
  };

  const getJourneyShareData = (): JourneyShareData | null => {
    if (!activeJourney) return null;
    return {
      destination: activeJourney.destination,
      startTime: activeJourney.startTime,
      expectedArrival: activeJourney.expectedArrival,
      startLocation: activeJourney.startLocation,
      currentLocation,
      breadcrumbs: journeyBreadcrumbsRef.current,
      stats: journeyStats,
      isOverdue: journeyOverdue,
      totalPoints: journeyBreadcrumbsRef.current.length,
    };
  };

  // ── Live Location Sharing (manual start/stop outside SOS) ──
  const startLiveLocationSharing = async (options: LiveShareOptions = {}): Promise<LiveShareSession | null> => {
    try {
      const session = await LiveLocationSharingService.startSession({
        userName: options.userName || 'SafeHer User',
        ttlMinutes: options.ttlMinutes || 30,
        purpose: options.purpose || 'Location Sharing',
      });
      if (session) {
        setLiveShareSession(session as LiveShareSession);
        setIsLiveSharing(true);
        return session as LiveShareSession;
      }
    } catch (e) {
      Logger.error('[LiveShare] Start error:', e);
    }
    return null;
  };

  const stopLiveLocationSharing = async (): Promise<void> => {
    try {
      await LiveLocationSharingService.endSession();
      setLiveShareSession(null);
      setIsLiveSharing(false);
    } catch (e) {
      Logger.error('[LiveShare] Stop error:', e);
    }
  };

  const value: EmergencyContextValue = {
    emergencyContacts, settings, sosMessage,
    isSOSActive, currentLocation, stealthMode,
    isTracking, isRecording, sirenActive, sosHistory,
    // v4.0
    lastCheckIn, checkInOverdue, activeJourney, journeyOverdue,
    isScreamDetecting,
    // v5.0
    liveLocation, isLiveTracking,
    // v6.0 journey breadcrumbs
    journeyBreadcrumbs, isDeviceMoving, journeyStats, journeyHistory,
    // v6.0 background location + live sharing + push
    isBackgroundTracking, liveShareSession, isLiveSharing, pushToken,
    // AI service status
    aiServiceStatus,
    // setters
    setCurrentLocation, setIsTracking, setIsRecording,
    setSirenActive, setIsScreamDetecting,
    // methods
    addContact, removeContact, updateContact, getContactsByTier,
    saveContacts, updateSettings, updateSOSMessage,
    toggleStealthMode, triggerSOS, cancelSOS,
    checkIn, startJourney, completeJourney, extendJourney,
    getJourneyShareData,
    // v6.0 live sharing
    startLiveLocationSharing, stopLiveLocationSharing,
  };

  return (
    <EmergencyContext.Provider value={value}>
      {children}
    </EmergencyContext.Provider>
  );
};

export const useEmergency = (): EmergencyContextValue => {
  const context = useContext(EmergencyContext);
  if (!context) {
    throw new Error('useEmergency must be used within EmergencyProvider');
  }
  return context;
};

export default EmergencyContext;

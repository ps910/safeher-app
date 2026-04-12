/**
 * Emergency Context v6.0 - Global state for ALL safety features
 * Supports: SOS, Siren, Shake, Stealth, Recording, Tracking,
 *           Inactivity Timer, Journey Monitor, Scream Detection, Voice SOS,
 *           Live Location Tracking, Background Location, Push Notifications,
 *           Live Sharing Sessions, Encrypted Storage
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert } from 'react-native';
import {
  startLiveLocationTracking,
  stopLiveLocationTracking,
  sendSOSToContacts,
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
import { EvidenceDB } from '../services/Database';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const EmergencyContext = createContext();

const STORAGE_KEYS = {
  CONTACTS: '@girl_safety_contacts',
  SETTINGS: '@girl_safety_settings',
  SOS_MESSAGE: '@girl_safety_sos_message',
  STEALTH: '@girl_safety_stealth',
  SOS_HISTORY: '@girl_safety_sos_history',
  JOURNEY: '@girl_safety_journey',
  JOURNEY_BREADCRUMBS: '@girl_safety_journey_breadcrumbs',
  JOURNEY_HISTORY: '@girl_safety_journey_history',
};

const DEFAULT_SOS_MESSAGE =
  '🆘 EMERGENCY! I am in danger and need immediate help! Please track my location and contact authorities NOW. Sent from Girl Safety App.';

const DEFAULT_SETTINGS = {
  shakeToSOS: true,
  autoLocationShare: true,
  sirenEnabled: true,
  countdownSeconds: 5,
  autoCallPolice: false,
  autoRecordAudio: true,
  offlineSOS: true,
  hiddenMode: false,
  voiceActivation: false,
  // New v4.0 settings
  inactivitySOSEnabled: false,
  inactivityTimeout: 30, // minutes
  screamDetection: false,
  screamThreshold: 80, // dB-ish amplitude level
  autoPhotoCapture: true,
  journeyAlerts: true,
  panicWipeEnabled: false,
  // v6.0 settings
  backgroundLocationEnabled: true,
  persistentSOSNotification: true,
  volumeButtonSOS: true,
  liveLocationSharing: true,
  pushNotifications: true,
  countryOverride: null,    // null = auto-detect
};

export const EmergencyProvider = ({ children }) => {
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [sosMessage, setSosMessage] = useState(DEFAULT_SOS_MESSAGE);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [stealthMode, setStealthMode] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sirenActive, setSirenActive] = useState(false);
  const [sosHistory, setSOSHistory] = useState([]);

  // ── New v4.0 state ──
  const [lastCheckIn, setLastCheckIn] = useState(new Date());
  const [checkInOverdue, setCheckInOverdue] = useState(false);
  const [activeJourney, setActiveJourney] = useState(null);
  const [journeyOverdue, setJourneyOverdue] = useState(false);
  const [isScreamDetecting, setIsScreamDetecting] = useState(false);

  // ── v5.0 Live Location during SOS ──
  const [liveLocation, setLiveLocation] = useState(null);
  const [isLiveTracking, setIsLiveTracking] = useState(false);

  // ── v6.0 Background Location + Live Sharing + Push ──
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [liveShareSession, setLiveShareSession] = useState(null);
  const [isLiveSharing, setIsLiveSharing] = useState(false);
  const [pushToken, setPushToken] = useState(null);

  // ── v6.0 Journey Breadcrumb Tracking ──
  const [journeyBreadcrumbs, setJourneyBreadcrumbs] = useState([]);
  const [isDeviceMoving, setIsDeviceMoving] = useState(false);
  const [journeyStats, setJourneyStats] = useState({ distance: 0, avgSpeed: 0, maxSpeed: 0 });
  const [journeyHistory, setJourneyHistory] = useState([]);

  // AI service status
  const [aiServiceStatus, setAiServiceStatus] = useState({});

  // Security: SOS rate limiting (Vuln #10/#14)
  const lastSOSTriggerRef = useRef(0);
  const SOS_COOLDOWN_MS = 60000; // 60-second cooldown between SOS triggers

  const inactivityRef = useRef(null);
  const journeyRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const locationUpdateTimerRef = useRef(null);
  const lastLocationSentRef = useRef(null);
  const journeyLocationRef = useRef(null);
  const journeyBreadcrumbsRef = useRef([]);
  const lastBreadcrumbRef = useRef(null);
  const motionCheckRef = useRef(null);

  // ── Load saved data on mount ──
  useEffect(() => {
    loadSavedData();

    // Listen to AI service events
    const unsub = SafetyAIService.addListener((event) => {
      setAiServiceStatus(SafetyAIService.getStatus());
      if (event.type === 'scream_detected') {
        // Prompt user before triggering SOS on scream
        Alert.alert(
          '🔊 Loud Sound Detected!',
          'A scream or loud sound was detected. Do you need help?',
          [
            { text: 'I\'m OK', style: 'cancel' },
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
    // Shake detection
    if (settings.shakeToSOS && !isSOSActive) {
      SafetyAIService.startShakeDetection(() => {
        triggerSOS();
      });
    } else {
      SafetyAIService.stopShakeDetection();
    }

    // Scream detection
    if (settings.screamDetection && !isSOSActive) {
      SafetyAIService.startScreamDetection(
        (level) => { /* handled by listener above */ },
        -20 + (settings.screamThreshold ? (settings.screamThreshold - 80) * 0.5 : 0)
      );
    } else {
      SafetyAIService.stopScreamDetection();
    }

    setAiServiceStatus(SafetyAIService.getStatus());
  }, [settings.shakeToSOS, settings.screamDetection, isSOSActive]);

  // ── Inactivity Monitor (now actually triggers SOS after 2 consecutive overdue checks) ──
  useEffect(() => {
    if (inactivityRef.current) clearInterval(inactivityRef.current);

    if (settings.inactivitySOSEnabled && !isSOSActive) {
      let warnedOnce = false;
      inactivityRef.current = setInterval(() => {
        const elapsed = (Date.now() - lastCheckIn.getTime()) / 1000 / 60;
        if (elapsed >= settings.inactivityTimeout) {
          if (!warnedOnce) {
            // First overdue: warn the user
            setCheckInOverdue(true);
            warnedOnce = true;
            Alert.alert(
              '⏱️ Check-In Overdue!',
              `You haven't checked in for ${settings.inactivityTimeout} minutes. Are you safe?`,
              [
                { text: 'I\'m Safe ✓', onPress: () => { checkIn(); warnedOnce = false; } },
                { text: '🆘 Send SOS', style: 'destructive', onPress: () => triggerSOS() },
              ],
              { cancelable: false }
            );
          }
          // If still overdue 5 min after warning, auto-trigger SOS
          if (warnedOnce && elapsed >= settings.inactivityTimeout + 5) {
            console.log('[Inactivity] Auto-triggering SOS after extended inactivity');
            triggerSOS();
            warnedOnce = false;
          }
        } else {
          warnedOnce = false;
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

  const loadSavedData = async () => {
    try {
      // Run encrypted storage migration (one-time, transparent)
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
        const j = JSON.parse(journeyData);
        if (j && j.active) setActiveJourney(j);
      }

      // Load journey breadcrumbs if active journey
      const breadcrumbData = await AsyncStorage.getItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS);
      if (breadcrumbData) {
        const crumbs = JSON.parse(breadcrumbData);
        setJourneyBreadcrumbs(crumbs);
        journeyBreadcrumbsRef.current = crumbs;
      }

      // Load journey history
      const histData = await AsyncStorage.getItem(STORAGE_KEYS.JOURNEY_HISTORY);
      if (histData) setJourneyHistory(JSON.parse(histData));

      // ── Initialize v6.0 services ──
      // 1. Push Notifications
      const notifResult = await NotificationService.initialize({
        onSOSTrigger: () => triggerSOS(),
      });
      if (notifResult.pushToken) setPushToken(notifResult.pushToken);

      // 2. Persistent SOS notification (quick-tap in tray)
      const loadedSettings = settingsData ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) } : DEFAULT_SETTINGS;
      if (loadedSettings.persistentSOSNotification) {
        await NotificationService.showPersistentSOSNotification();
      }

      // 3. Background location tracking
      if (loadedSettings.backgroundLocationEnabled) {
        await BackgroundLocationService.startTracking({
          sosMode: false,
          onLocation: (locations) => {
            if (locations?.length > 0) {
              const latest = locations[locations.length - 1];
              setCurrentLocation(latest);
              // If live sharing is active, push updates
              if (LiveLocationSharingService.isSharing()) {
                LiveLocationSharingService.updateLocation(latest);
              }
            }
          },
        });
        setIsBackgroundTracking(true);
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  };

  // ── Contacts CRUD (encrypted storage) ──
  const saveContacts = async (contacts) => {
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
      setEmergencyContacts(contacts);
    } catch (error) {
      console.error('Error saving contacts:', error);
    }
  };

  const addContact = async (contact) => {
    const newContact = {
      id: Date.now().toString(),
      tier: contact.tier || 1,
      ...contact,
      createdAt: new Date().toISOString(),
    };
    const updated = [...emergencyContacts, newContact];
    await saveContacts(updated);
    return newContact;
  };

  const updateContact = async (contactId, updates) => {
    const updated = emergencyContacts.map((c) =>
      c.id === contactId ? { ...c, ...updates } : c
    );
    await saveContacts(updated);
  };

  const getContactsByTier = (tier) => {
    return emergencyContacts.filter((c) => (c.tier || 1) === tier);
  };

  const removeContact = async (contactId) => {
    const updated = emergencyContacts.filter((c) => c.id !== contactId);
    await saveContacts(updated);
  };

  // ── Settings (encrypted storage) ──
  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      setSettings(updated);

      // React to setting changes for v6.0 services
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
      console.error('Error saving settings:', error);
    }
  };

  const updateSOSMessage = async (message) => {
    try {
      await EncryptedStorageService.setItem(STORAGE_KEYS.SOS_MESSAGE, message);
      setSosMessage(message);
    } catch (error) {
      console.error('Error saving SOS message:', error);
    }
  };

  const toggleStealthMode = async () => {
    const newVal = !stealthMode;
    setStealthMode(newVal);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.STEALTH, JSON.stringify(newVal));
    } catch (e) {
      console.error('Error saving stealth mode:', e);
    }
  };

  // ── SOS Trigger (v6.0 — background location SOS + live sharing + push + nearby) ──
  const triggerSOS = useCallback(async () => {
    // Security: Rate limiting — prevent accidental/rapid SOS triggers (Vuln #10/#14)
    const now = Date.now();
    if (isSOSActive) {
      console.log('[SOS] Already active — ignoring duplicate trigger');
      return;
    }
    if (now - lastSOSTriggerRef.current < SOS_COOLDOWN_MS) {
      const remaining = Math.ceil((SOS_COOLDOWN_MS - (now - lastSOSTriggerRef.current)) / 1000);
      Alert.alert('SOS Cooldown', `Please wait ${remaining}s before triggering SOS again.`);
      return;
    }
    lastSOSTriggerRef.current = now;

    setIsSOSActive(true);
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      location: currentLocation,
      type: 'SOS',
    };
    const updated = [entry, ...sosHistory].slice(0, 50);
    setSOSHistory(updated);
    AsyncStorage.setItem(STORAGE_KEYS.SOS_HISTORY, JSON.stringify(updated)).catch(() => {});

    // v6.0: Activate background location SOS mode (high-frequency GPS)
    try {
      await BackgroundLocationService.activateSOSMode();
      setIsBackgroundTracking(true);
      console.log('[SOS] Background location SOS mode activated');
    } catch (e) {
      console.error('[SOS] Background location SOS mode error:', e);
    }

    // v6.0: Start live location sharing session (shareable URL for contacts)
    try {
      if (settings.liveLocationSharing) {
        const session = await LiveLocationSharingService.startSession({
          userName: 'SafeHer User',
          ttlMinutes: 60,
          purpose: 'SOS Emergency',
        });
        if (session) {
          setLiveShareSession(session);
          setIsLiveSharing(true);
          console.log('[SOS] Live sharing started:', session.shareUrl);
        }
      }
    } catch (e) {
      console.error('[SOS] Live sharing error:', e);
    }

    // v6.0: Send SOS active push notification
    try {
      await NotificationService.sendSOSActiveNotification();
    } catch (e) {
      console.error('[SOS] Push notification error:', e);
    }

    // Start live location tracking
    try {
      const subscription = await startLiveLocationTracking((newLocation) => {
        setLiveLocation(newLocation);
        setCurrentLocation(newLocation);
        lastLocationSentRef.current = newLocation;
        // Push to live sharing session
        if (LiveLocationSharingService.isSharing()) {
          LiveLocationSharingService.updateLocation(newLocation).catch(() => {});
        }
      });
      if (subscription) {
        locationWatcherRef.current = subscription;
        setIsLiveTracking(true);
        console.log('[SOS] Live location tracking started');
      }
    } catch (e) {
      console.error('[SOS] Failed to start live tracking:', e);
    }

    // Broadcast SOS to nearby users and start 5-second live location updates
    try {
      const sosResult = await OfflineLocationService.shareSOSLocation(
        currentLocation, emergencyContacts, sosMessage
      );
      if (sosResult?.alertId) {
        await OfflineLocationService.startLiveSOSBroadcast(sosResult.alertId);
        console.log('[SOS] Nearby broadcast started, alertId:', sosResult.alertId);
      }
    } catch (e) {
      console.error('[SOS] Failed to start nearby broadcast:', e);
    }

    // Activate AI SOS services (siren, recording, photo)
    try {
      const aiResult = await SafetyAIService.activateSOSServices(settings);
      console.log('[SOS] AI services activated:', aiResult);
      if (aiResult.siren) setSirenActive(true);
      if (aiResult.recording) setIsRecording(true);

      // Save captured SOS photo to Evidence Vault
      if (aiResult.photo) {
        try {
          const capturedPhotos = SafetyAIService.capturedPhotos || [];
          for (const photoUri of capturedPhotos) {
            const fileInfo = await FileSystem.getInfoAsync(photoUri);
            if (fileInfo.exists) {
              const hash = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                `${photoUri}-${fileInfo.size}-${Date.now()}`
              );
              await EvidenceDB.add({
                type: 'photo',
                uri: photoUri,
                size: fileInfo.size,
                description: `SOS auto-captured photo at ${new Date().toLocaleString()}`,
                fileHash: hash,
              });
              await EvidenceDB.addFile({
                type: 'photo',
                uri: photoUri,
                size: fileInfo.size,
                mimeType: 'image/jpeg',
              });
              console.log('[SOS] Photo evidence saved to vault:', photoUri);
            }
          }
        } catch (photoErr) {
          console.error('[SOS] Error saving photo evidence:', photoErr);
        }
      }
    } catch (e) {
      console.error('[SOS] AI services activation error:', e);
    }

    // Auto call police if enabled
    if (settings.autoCallPolice) {
      try {
        setTimeout(() => makePhoneCall('112'), 3000);
      } catch (e) {
        console.error('[SOS] Auto call police error:', e);
      }
    }

    // Start periodic location update SMS (every 2 minutes)
    locationUpdateTimerRef.current = setInterval(async () => {
      if (lastLocationSentRef.current && emergencyContacts.length > 0) {
        console.log('[SOS] Sending periodic live location update');
        await sendLiveLocationUpdate(emergencyContacts, lastLocationSentRef.current);
      }
    }, 2 * 60 * 1000);
  }, [currentLocation, sosHistory, emergencyContacts, sosMessage, settings]);

  const cancelSOS = useCallback(async () => {
    setIsSOSActive(false);
    setSirenActive(false);
    setIsRecording(false);

    // Deactivate AI SOS services (siren, recording, photos)
    try {
      const aiResult = await SafetyAIService.deactivateSOSServices();
      console.log('[SOS] AI services deactivated:', aiResult);

      // Save recorded SOS audio evidence to Evidence Vault
      if (aiResult.evidenceUri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(aiResult.evidenceUri);
          if (fileInfo.exists) {
            const hash = await Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              `${aiResult.evidenceUri}-${fileInfo.size}-${Date.now()}`
            );
            await EvidenceDB.add({
              type: 'audio',
              uri: aiResult.evidenceUri,
              size: fileInfo.size,
              description: `SOS audio recording at ${new Date().toLocaleString()}`,
              fileHash: hash,
            });
            await EvidenceDB.addFile({
              type: 'audio',
              uri: aiResult.evidenceUri,
              size: fileInfo.size,
              mimeType: 'audio/m4a',
            });
            console.log('[SOS] Audio evidence saved to vault:', aiResult.evidenceUri);
          }
        } catch (audioErr) {
          console.error('[SOS] Error saving audio evidence:', audioErr);
        }
      }

      // Save any remaining captured photos that weren't saved during trigger
      if (aiResult.photosCaptured > 0) {
        console.log(`[SOS] ${aiResult.photosCaptured} photos were captured during SOS`);
      }
    } catch (e) {
      console.error('[SOS] AI deactivation error:', e);
    }

    // v6.0: Deactivate background location SOS mode (revert to normal tracking)
    try {
      await BackgroundLocationService.deactivateSOSMode();
      console.log('[SOS] Background location reverted to normal mode');
    } catch (e) {
      console.error('[SOS] Background location deactivation error:', e);
    }

    // v6.0: Stop live location sharing session
    try {
      if (isLiveSharing) {
        await LiveLocationSharingService.endSession();
        setLiveShareSession(null);
        setIsLiveSharing(false);
        console.log('[SOS] Live sharing session ended');
      }
    } catch (e) {
      console.error('[SOS] Live sharing stop error:', e);
    }

    // Stop live location tracking
    if (locationWatcherRef.current) {
      stopLiveLocationTracking(locationWatcherRef.current);
      locationWatcherRef.current = null;
      setIsLiveTracking(false);
      console.log('[SOS] Live location tracking stopped');
    }

    // Stop SOS broadcast to nearby users
    OfflineLocationService.stopLiveSOSBroadcast();
    console.log('[SOS] Nearby broadcast stopped');

    // Clear periodic location update timer
    if (locationUpdateTimerRef.current) {
      clearInterval(locationUpdateTimerRef.current);
      locationUpdateTimerRef.current = null;
    }

    lastLocationSentRef.current = null;
    setLiveLocation(null);

    // Re-start shake/scream detection if settings enabled
    if (settings.shakeToSOS) {
      SafetyAIService.startShakeDetection(() => triggerSOS());
    }
    if (settings.screamDetection) {
      SafetyAIService.startScreamDetection(() => {}, -20);
    }
  }, [settings, isLiveSharing]);

  // ── Check-In (Inactivity Timer) ──
  const checkIn = () => {
    setLastCheckIn(new Date());
    setCheckInOverdue(false);
  };

  // ── Haversine distance (meters) ──
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ── Start journey breadcrumb location watcher (every 5s) ──
  const startBreadcrumbTracking = async () => {
    try {
      const hasPerm = await requestLocationPermission();
      if (!hasPerm) return;

      // Location watcher — every 5 seconds
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 3 },
        (loc) => {
          const { latitude, longitude, speed, accuracy, altitude } = loc.coords;
          const ts = new Date().toISOString();
          const prev = lastBreadcrumbRef.current;

          // Detect motion: moved > 3m from last point
          let moved = false;
          let dist = 0;
          if (prev) {
            dist = haversineDistance(prev.latitude, prev.longitude, latitude, longitude);
            moved = dist > 3;
          } else {
            moved = true; // First point
          }

          setIsDeviceMoving(moved);

          const crumb = {
            latitude, longitude, speed: speed || 0, accuracy: accuracy || 0,
            altitude: altitude || 0, timestamp: ts, moving: moved, distFromPrev: dist,
          };

          lastBreadcrumbRef.current = crumb;

          // Always record point (even stationary — helps show stops)
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

          // Also update global currentLocation
          setCurrentLocation(loc);
        }
      );
      journeyLocationRef.current = sub;
      console.log('[Journey] Breadcrumb tracking started (5s interval)');
    } catch (e) {
      console.error('[Journey] Breadcrumb tracking failed:', e);
    }
  };

  const stopBreadcrumbTracking = () => {
    if (journeyLocationRef.current) {
      journeyLocationRef.current.remove();
      journeyLocationRef.current = null;
      console.log('[Journey] Breadcrumb tracking stopped');
    }
    setIsDeviceMoving(false);
    lastBreadcrumbRef.current = null;
  };

  // ── Journey Tracking (v6.0 — with breadcrumbs) ──
  const startJourney = async (destination, minutesToArrive) => {
    const journey = {
      active: true,
      destination,
      startTime: new Date().toISOString(),
      startLocation: currentLocation,
      expectedArrival: new Date(Date.now() + minutesToArrive * 60000).toISOString(),
      minutesToArrive,
    };
    setActiveJourney(journey);
    setJourneyOverdue(false);

    // Reset breadcrumbs
    journeyBreadcrumbsRef.current = [];
    setJourneyBreadcrumbs([]);
    setJourneyStats({ distance: 0, avgSpeed: 0, maxSpeed: 0 });
    await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY_BREADCRUMBS, '[]').catch(() => {});

    // Start breadcrumb tracking
    await startBreadcrumbTracking();

    try {
      await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY, JSON.stringify(journey));
    } catch (e) {}
    return journey;
  };

  const completeJourney = async () => {
    // Stop breadcrumb tracking
    stopBreadcrumbTracking();

    // Save to journey history
    if (activeJourney) {
      const completedJourney = {
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

  const extendJourney = async (extraMinutes) => {
    if (activeJourney) {
      const updated = {
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

  // Build shareable journey data object
  const getJourneyShareData = () => {
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
  const startLiveLocationSharing = async (options = {}) => {
    try {
      const session = await LiveLocationSharingService.startSession({
        userName: options.userName || 'SafeHer User',
        ttlMinutes: options.ttlMinutes || 30,
        purpose: options.purpose || 'Location Sharing',
      });
      if (session) {
        setLiveShareSession(session);
        setIsLiveSharing(true);
        return session;
      }
    } catch (e) {
      console.error('[LiveShare] Start error:', e);
    }
    return null;
  };

  const stopLiveLocationSharing = async () => {
    try {
      await LiveLocationSharingService.endSession();
      setLiveShareSession(null);
      setIsLiveSharing(false);
    } catch (e) {
      console.error('[LiveShare] Stop error:', e);
    }
  };

  const value = {
    emergencyContacts, settings, sosMessage,
    isSOSActive, currentLocation, stealthMode,
    isTracking, isRecording, sirenActive, sosHistory,
    // v4.0
    lastCheckIn, checkInOverdue, activeJourney, journeyOverdue,
    isScreamDetecting,
    // v5.0
    liveLocation, isLiveTracking,
    // v6.0 — journey breadcrumbs
    journeyBreadcrumbs, isDeviceMoving, journeyStats, journeyHistory,
    // v6.0 — background location + live sharing + push
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

export const useEmergency = () => {
  const context = useContext(EmergencyContext);
  if (!context) {
    throw new Error('useEmergency must be used within EmergencyProvider');
  }
  return context;
};

export default EmergencyContext;

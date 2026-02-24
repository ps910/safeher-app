/**
 * Emergency Context v4.0 - Global state for ALL safety features
 * Supports: SOS, Siren, Shake, Stealth, Recording, Tracking,
 *           Inactivity Timer, Journey Monitor, Scream Detection, Voice SOS
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EmergencyContext = createContext();

const STORAGE_KEYS = {
  CONTACTS: '@girl_safety_contacts',
  SETTINGS: '@girl_safety_settings',
  SOS_MESSAGE: '@girl_safety_sos_message',
  STEALTH: '@girl_safety_stealth',
  SOS_HISTORY: '@girl_safety_sos_history',
  JOURNEY: '@girl_safety_journey',
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

  const inactivityRef = useRef(null);
  const journeyRef = useRef(null);

  // ── Load saved data on mount ──
  useEffect(() => {
    loadSavedData();
  }, []);

  // ── Inactivity Monitor ──
  useEffect(() => {
    if (inactivityRef.current) clearInterval(inactivityRef.current);

    if (settings.inactivitySOSEnabled && !isSOSActive) {
      inactivityRef.current = setInterval(() => {
        const elapsed = (Date.now() - lastCheckIn.getTime()) / 1000 / 60;
        if (elapsed >= settings.inactivityTimeout) {
          setCheckInOverdue(true);
        }
      }, 30000); // check every 30s
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
      const [contactsData, settingsData, messageData, stealthData, historyData, journeyData] =
        await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.CONTACTS),
          AsyncStorage.getItem(STORAGE_KEYS.SETTINGS),
          AsyncStorage.getItem(STORAGE_KEYS.SOS_MESSAGE),
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
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  };

  // ── Contacts CRUD ──
  const saveContacts = async (contacts) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
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

  // ── Settings ──
  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      setSettings(updated);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const updateSOSMessage = async (message) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SOS_MESSAGE, message);
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

  // ── SOS Trigger ──
  const triggerSOS = () => {
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
  };

  const cancelSOS = () => {
    setIsSOSActive(false);
    setSirenActive(false);
  };

  // ── Check-In (Inactivity Timer) ──
  const checkIn = () => {
    setLastCheckIn(new Date());
    setCheckInOverdue(false);
  };

  // ── Journey Tracking ──
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
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.JOURNEY, JSON.stringify(journey));
    } catch (e) {}
    return journey;
  };

  const completeJourney = async () => {
    setActiveJourney(null);
    setJourneyOverdue(false);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.JOURNEY);
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

  const value = {
    emergencyContacts, settings, sosMessage,
    isSOSActive, currentLocation, stealthMode,
    isTracking, isRecording, sirenActive, sosHistory,
    // new v4.0
    lastCheckIn, checkInOverdue, activeJourney, journeyOverdue,
    isScreamDetecting,
    // setters
    setCurrentLocation, setIsTracking, setIsRecording,
    setSirenActive, setIsScreamDetecting,
    // methods
    addContact, removeContact, updateContact, getContactsByTier,
    saveContacts, updateSettings, updateSOSMessage,
    toggleStealthMode, triggerSOS, cancelSOS,
    checkIn, startJourney, completeJourney, extendJourney,
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

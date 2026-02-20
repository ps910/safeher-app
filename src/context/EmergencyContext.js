/**
 * Emergency Context - Global state for emergency contacts & settings
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EmergencyContext = createContext();

const STORAGE_KEYS = {
  CONTACTS: '@girl_safety_contacts',
  SETTINGS: '@girl_safety_settings',
  SOS_MESSAGE: '@girl_safety_sos_message',
};

const DEFAULT_SOS_MESSAGE =
  '🆘 EMERGENCY! I need help! Please track my location and contact authorities. Sent from Girl Safety App.';

const DEFAULT_SETTINGS = {
  shakeToSOS: true,
  autoLocationShare: true,
  sirenEnabled: true,
  countdownSeconds: 5,
  autoCallPolice: false,
};

export const EmergencyProvider = ({ children }) => {
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [sosMessage, setSosMessage] = useState(DEFAULT_SOS_MESSAGE);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  // Load saved data on mount
  useEffect(() => {
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    try {
      const [contactsData, settingsData, messageData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CONTACTS),
        AsyncStorage.getItem(STORAGE_KEYS.SETTINGS),
        AsyncStorage.getItem(STORAGE_KEYS.SOS_MESSAGE),
      ]);

      if (contactsData) setEmergencyContacts(JSON.parse(contactsData));
      if (settingsData) setSettings(JSON.parse(settingsData));
      if (messageData) setSosMessage(messageData);
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  };

  // Save emergency contacts
  const saveContacts = async (contacts) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
      setEmergencyContacts(contacts);
    } catch (error) {
      console.error('Error saving contacts:', error);
    }
  };

  // Add a new emergency contact
  const addContact = async (contact) => {
    const newContact = {
      id: Date.now().toString(),
      ...contact,
      createdAt: new Date().toISOString(),
    };
    const updated = [...emergencyContacts, newContact];
    await saveContacts(updated);
    return newContact;
  };

  // Remove an emergency contact
  const removeContact = async (contactId) => {
    const updated = emergencyContacts.filter((c) => c.id !== contactId);
    await saveContacts(updated);
  };

  // Update settings
  const updateSettings = async (newSettings) => {
    const updated = { ...settings, ...newSettings };
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      setSettings(updated);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  // Update SOS message
  const updateSOSMessage = async (message) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SOS_MESSAGE, message);
      setSosMessage(message);
    } catch (error) {
      console.error('Error saving SOS message:', error);
    }
  };

  // Trigger SOS
  const triggerSOS = () => {
    setIsSOSActive(true);
  };

  // Cancel SOS
  const cancelSOS = () => {
    setIsSOSActive(false);
  };

  const value = {
    emergencyContacts,
    settings,
    sosMessage,
    isSOSActive,
    currentLocation,
    setCurrentLocation,
    addContact,
    removeContact,
    saveContacts,
    updateSettings,
    updateSOSMessage,
    triggerSOS,
    cancelSOS,
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

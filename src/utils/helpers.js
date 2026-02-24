/**
 * Utility Helpers - Emergency calls, SMS, location, siren, recording
 */
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Alert, Platform, Vibration } from 'react-native';

// ─── Emergency Numbers (India) ───────────────────────────────────
export const EMERGENCY_NUMBERS = {
  police: '100',
  ambulance: '108',
  fire: '101',
  womenHelpline: '1091',
  childHelpline: '1098',
  nationalEmergency: '112',
  womenCommission: '7827170170',
  cybercrime: '1930',
};

// ─── Phone / SMS ─────────────────────────────────────────────────
export const makePhoneCall = async (phoneNumber) => {
  try {
    const url = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Phone calls are not supported on this device');
    }
  } catch (error) {
    console.error('Error making phone call:', error);
    Alert.alert('Error', 'Failed to make phone call');
  }
};

export const sendSMS = async (phoneNumber, message) => {
  try {
    const url = Platform.select({
      ios: `sms:${phoneNumber}&body=${encodeURIComponent(message)}`,
      android: `sms:${phoneNumber}?body=${encodeURIComponent(message)}`,
    });
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'SMS is not supported on this device');
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    Alert.alert('Error', 'Failed to send SMS');
  }
};

// Send SOS message + location to ALL emergency contacts
export const sendSOSToContacts = async (contacts, message, location) => {
  if (!contacts || contacts.length === 0) {
    Alert.alert('No Contacts', 'Please add emergency contacts first.');
    return;
  }

  let locationText = '';
  if (location) {
    locationText = `\n📍 My Location:\nhttps://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`;
  }

  const fullMessage = `${message}${locationText}\n\n⏰ Time: ${new Date().toLocaleString()}`;

  for (const contact of contacts) {
    try {
      await sendSMS(contact.phone, fullMessage);
      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to send SOS to ${contact.name}:`, error);
    }
  }
};

// ─── Location ────────────────────────────────────────────────────
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Location permission is required for emergency features. Please enable it in Settings.'
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
};

export const getCurrentPosition = async () => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return location;
  } catch (error) {
    console.error('Error getting current position:', error);
    return null;
  }
};

export const openMap = (latitude, longitude) => {
  const url = Platform.select({
    ios: `maps:${latitude},${longitude}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
  });
  Linking.openURL(url);
};

export const shareLocation = async (location) => {
  if (!location) {
    Alert.alert('Error', 'Location not available');
    return;
  }
  const { latitude, longitude } = location.coords;
  const message = `📍 My current location:\nhttps://maps.google.com/?q=${latitude},${longitude}\n\nShared from Girl Safety App`;
  try {
    await Sharing.isAvailableAsync();
    // Use system share sheet fallback
    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    await Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
  } catch (error) {
    console.error('Error sharing location:', error);
  }
};

// ─── Vibration Patterns ──────────────────────────────────────────
export const vibrateEmergency = () => {
  // Long-short-long-short (SOS-like)
  Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500], false);
};

export const vibrateShort = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

// ─── Utility ─────────────────────────────────────────────────────
export const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

export const getRandomDelay = (min = 1000, max = 3000) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

export const getTimeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// ─── Panic Wipe — clear all sensitive data ────────────────────────
export const panicWipe = async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const safetyKeys = keys.filter(k => k.startsWith('@gs_') || k.startsWith('@girl_safety_'));
    if (safetyKeys.length > 0) {
      await AsyncStorage.multiRemove(safetyKeys);
    }
    return true;
  } catch (e) {
    console.error('Panic wipe error:', e);
    return false;
  }
};

// ─── Offline SMS SOS (direct SMS intent) ──────────────────────────
export const sendOfflineSMS = async (contacts, message, location) => {
  let fullMsg = message;
  if (location) {
    fullMsg += `\n📍 https://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`;
  }
  fullMsg += `\n⏰ ${new Date().toLocaleString()}`;

  // On Android, directly open SMS app with pre-filled data
  const numbers = contacts.map(c => c.phone).join(',');
  const url = Platform.select({
    ios: `sms:${numbers}&body=${encodeURIComponent(fullMsg)}`,
    android: `sms:${numbers}?body=${encodeURIComponent(fullMsg)}`,
  });

  try {
    await Linking.openURL(url);
  } catch (e) {
    console.error('Offline SMS error:', e);
  }
};

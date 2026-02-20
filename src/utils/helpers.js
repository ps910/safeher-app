/**
 * Utility helpers for the Girl Safety App (Expo-compatible)
 */
import { Linking, Platform, Alert } from 'react-native';
import * as Location from 'expo-location';

/**
 * Make a phone call
 */
export const makePhoneCall = (phoneNumber) => {
  const url = Platform.OS === 'android'
    ? `tel:${phoneNumber}`
    : `telprompt:${phoneNumber}`;
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Phone call not supported on this device');
      }
    })
    .catch((err) => console.error('Phone call error:', err));
};

/**
 * Send SMS to a number with a message
 */
export const sendSMS = (phoneNumber, message) => {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${phoneNumber}${separator}body=${encodeURIComponent(message)}`;
  Linking.openURL(url).catch((err) => console.error('SMS error:', err));
};

/**
 * Send SMS to multiple contacts
 */
export const sendSOSToContacts = (contacts, message, location) => {
  const locationText = location
    ? `\n📍 My Location: https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : '';
  const fullMessage = `${message}${locationText}`;

  contacts.forEach((contact) => {
    sendSMS(contact.phone, fullMessage);
  });
};

/**
 * Open Google Maps with location
 */
export const openMap = (latitude, longitude) => {
  const url = Platform.OS === 'ios'
    ? `maps:0,0?q=${latitude},${longitude}`
    : `geo:0,0?q=${latitude},${longitude}`;
  Linking.openURL(url).catch((err) => console.error('Map error:', err));
};

/**
 * Share location via any app
 */
export const shareLocation = (latitude, longitude) => {
  const url = `https://maps.google.com/?q=${latitude},${longitude}`;
  return url;
};

/**
 * Request location permission using Expo Location
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('Location permission error:', err);
    return false;
  }
};

/**
 * Get current position using Expo Location
 */
export const getCurrentPosition = async () => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
};



/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phone) => {
  const cleaned = ('' + phone).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

/**
 * Get emergency numbers by country
 */
export const EMERGENCY_NUMBERS = {
  police: '100',
  ambulance: '108',
  fire: '101',
  womenHelpline: '1091',
  childHelpline: '1098',
  nationalEmergency: '112',
  womenCommission: '7827-170-170',
};

/**
 * Generate a random delay for fake call
 */
export const getRandomDelay = (min = 5, max = 30) => {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
};

/**
 * Get time ago string
 */
export const getTimeAgo = (date) => {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

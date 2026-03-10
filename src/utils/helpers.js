/**
 * Utility Helpers - Emergency calls, SMS, location, siren, recording
 * v6.0 — Global emergency numbers + volume SOS trigger + accessibility
 */
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as SMS from 'expo-sms';
import { Alert, Platform, Vibration } from 'react-native';
import {
  getEmergencyNumbers,
  getDisplayHelplines,
  detectCountryCode,
  getEmergencyDataForCountry,
  getSupportedCountries,
  COUNTRY_EMERGENCY_DATA,
  INTERNATIONAL_FALLBACK,
} from '../constants/globalEmergencyNumbers';

// ─── Emergency Numbers (auto-detect country) ─────────────────────
// Legacy alias — now dynamically resolved via detectCountryCode()
let _cachedCountry = null;
let _cachedNumbers = null;

export const getLocalEmergencyNumbers = (countryOverride = null) => {
  const code = countryOverride || _cachedCountry;
  if (!countryOverride && _cachedNumbers) return _cachedNumbers;
  const nums = getEmergencyNumbers(code);
  if (!countryOverride) { _cachedNumbers = nums; _cachedCountry = detectCountryCode(); }
  return nums;
};

export const getLocalDisplayHelplines = (countryOverride = null) => {
  return getDisplayHelplines(countryOverride);
};

// Backwards-compatible export (defaults to detected country)
export const EMERGENCY_NUMBERS = getEmergencyNumbers();

// ─── Network Connectivity Check ──────────────────────────────────
export const checkNetworkStatus = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
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

// Send SMS using expo-sms (auto-composes with all recipients at once)
export const sendSMS = async (phoneNumber, message) => {
  try {
    const isAvailable = await SMS.isAvailableAsync();
    if (isAvailable) {
      const numbers = Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber];
      await SMS.sendSMSAsync(numbers, message);
      return true;
    } else {
      // Fallback to Linking if expo-sms not available
      const num = Array.isArray(phoneNumber) ? phoneNumber.join(',') : phoneNumber;
      const url = Platform.select({
        ios: `sms:${num}&body=${encodeURIComponent(message)}`,
        android: `sms:${num}?body=${encodeURIComponent(message)}`,
      });
      await Linking.openURL(url);
      return true;
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
};

// ─── Build SOS Message ───────────────────────────────────────────
const buildSOSMessage = (message, location, isUpdate = false) => {
  const prefix = isUpdate ? '📍 LIVE LOCATION UPDATE' : '🚨 SOS EMERGENCY ALERT';
  let locationText = '';
  if (location?.coords) {
    const { latitude, longitude } = location.coords;
    locationText = `\n\n📍 ${isUpdate ? 'Updated' : 'My'} Location:\nhttps://maps.google.com/?q=${latitude},${longitude}`;
    if (location.coords.accuracy) {
      locationText += `\n📐 Accuracy: ±${Math.round(location.coords.accuracy)}m`;
    }
    if (location.coords.speed != null && location.coords.speed > 0) {
      locationText += `\n🚗 Speed: ${Math.round(location.coords.speed * 3.6)} km/h`;
    }
  }

  return `${prefix}\n\n${message}${locationText}\n\n⏰ ${new Date().toLocaleString()}\n\n— Sent via SafeHer App`;
};

// ─── AUTO SEND SOS TO ALL CONTACTS ───────────────────────────────
// Sends SOS message to ALL emergency contacts at once via SMS
// Automatically detects network and uses the best method available
export const sendSOSToContacts = async (contacts, message, location) => {
  if (!contacts || contacts.length === 0) {
    Alert.alert('No Contacts', 'Please add emergency contacts first.');
    return { success: false, method: 'none', error: 'no_contacts' };
  }

  const fullMessage = buildSOSMessage(message, location);
  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);

  if (phoneNumbers.length === 0) {
    Alert.alert('No Phone Numbers', 'Your emergency contacts have no phone numbers.');
    return { success: false, method: 'none', error: 'no_numbers' };
  }

  // Check network status
  const isOnline = await checkNetworkStatus();
  console.log(`[SOS] Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  console.log(`[SOS] Sending to ${phoneNumbers.length} contacts`);

  const failedContacts = [];

  // Method 1: Try expo-sms (works both online & offline — sends via native SMS)
  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      console.log('[SOS] Using expo-sms to send to all contacts at once');
      const { result } = await SMS.sendSMSAsync(phoneNumbers, fullMessage);
      console.log(`[SOS] SMS result: ${result}`);

      // Security (Vuln #21): Track SMS delivery status
      const success = result === 'sent' || result === 'unknown';
      if (result === 'cancelled') {
        Alert.alert(
          '⚠️ SOS Not Sent',
          'SMS was cancelled. Your emergency contacts were NOT alerted. Please try again or call emergency services directly.',
          [{ text: 'OK', style: 'destructive' }]
        );
      }
      return {
        success,
        method: 'sms',
        result,
        isOnline,
        contactCount: phoneNumbers.length,
        failedContacts: result === 'cancelled' ? phoneNumbers : [],
      };
    }
  } catch (e) {
    console.error('[SOS] expo-sms failed:', e);
  }

  // Method 2: Fallback — open SMS intent via Linking (all contacts in one SMS)
  try {
    console.log('[SOS] Falling back to SMS intent via Linking');
    const numbers = phoneNumbers.join(',');
    const url = Platform.select({
      ios: `sms:${numbers}&body=${encodeURIComponent(fullMessage)}`,
      android: `sms:${numbers}?body=${encodeURIComponent(fullMessage)}`,
    });
    await Linking.openURL(url);
    return {
      success: true,
      method: 'sms_intent',
      isOnline,
      contactCount: phoneNumbers.length,
      failedContacts: [],
    };
  } catch (e) {
    console.error('[SOS] SMS intent failed:', e);
  }

  // Method 3: Last resort — open SMS for each contact individually
  console.log('[SOS] Sending SMS to each contact individually');
  let sentCount = 0;
  for (const number of phoneNumbers) {
    try {
      const url = Platform.select({
        ios: `sms:${number}&body=${encodeURIComponent(fullMessage)}`,
        android: `sms:${number}?body=${encodeURIComponent(fullMessage)}`,
      });
      await Linking.openURL(url);
      sentCount++;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`[SOS] Failed for ${number}:`, e);
      failedContacts.push(number);
    }
  }

  // Security (Vuln #21): Alert user about failed SMS deliveries
  if (failedContacts.length > 0) {
    const failedNames = contacts
      .filter(c => failedContacts.includes(c.phone))
      .map(c => c.name)
      .join(', ');
    Alert.alert(
      '⚠️ Some Alerts Failed',
      `Could not send SOS to: ${failedNames || failedContacts.join(', ')}.\n\nPlease call them directly or dial emergency services.`,
      [{ text: 'OK' }]
    );
  }

  return {
    success: sentCount > 0,
    method: 'individual_sms',
    sentCount,
    totalContacts: phoneNumbers.length,
    isOnline,
    failedContacts,
  };
};

// ─── SEND LIVE LOCATION UPDATE ───────────────────────────────────
// Sends a follow-up SMS with updated live location to all contacts
export const sendLiveLocationUpdate = async (contacts, location) => {
  if (!contacts?.length || !location?.coords) return;

  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);
  if (phoneNumbers.length === 0) return;

  const updateMessage = buildSOSMessage(
    'I am still in an emergency. Here is my updated live location.',
    location,
    true
  );

  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      await SMS.sendSMSAsync(phoneNumbers, updateMessage);
    } else {
      const numbers = phoneNumbers.join(',');
      const url = Platform.select({
        ios: `sms:${numbers}&body=${encodeURIComponent(updateMessage)}`,
        android: `sms:${numbers}?body=${encodeURIComponent(updateMessage)}`,
      });
      await Linking.openURL(url);
    }
    console.log('[SOS] Live location update sent');
  } catch (e) {
    console.error('[SOS] Live location update failed:', e);
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

export const requestBackgroundLocationPermission = async () => {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    return bgStatus === 'granted';
  } catch (error) {
    console.error('Error requesting background location permission:', error);
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

// Start watching location continuously (returns subscription to remove later)
export const startLiveLocationTracking = async (onLocationUpdate) => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000, // Update every 5 seconds
        distanceInterval: 5, // Or when moved 5 meters
      },
      (newLocation) => {
        if (onLocationUpdate) {
          onLocationUpdate(newLocation);
        }
      }
    );

    console.log('[Location] Live tracking started');
    return subscription;
  } catch (error) {
    console.error('Error starting live location tracking:', error);
    return null;
  }
};

// Stop live location tracking
export const stopLiveLocationTracking = (subscription) => {
  if (subscription) {
    subscription.remove();
    console.log('[Location] Live tracking stopped');
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
  const message = `📍 My current location:\nhttps://maps.google.com/?q=${latitude},${longitude}\n\nShared from SafeHer App`;
  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      await SMS.sendSMSAsync([], message);
    } else {
      await Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
    }
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

// ─── Offline SMS SOS (direct SMS intent — works without internet) ─
export const sendOfflineSMS = async (contacts, message, location) => {
  if (!contacts?.length) return;

  const fullMsg = buildSOSMessage(message, location);
  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);

  if (phoneNumbers.length === 0) return;

  // Try expo-sms first (one tap to send to all)
  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      await SMS.sendSMSAsync(phoneNumbers, fullMsg);
      return;
    }
  } catch (e) {
    console.error('[Offline SMS] expo-sms failed:', e);
  }

  // Fallback: open SMS intent with all numbers
  const numbers = phoneNumbers.join(',');
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

// ─── WhatsApp Messaging ──────────────────────────────────────────
// Send a message to a phone number via WhatsApp
export const sendWhatsAppMessage = async (phoneNumber, message) => {
  try {
    // Clean the phone number (remove spaces, dashes)
    let cleaned = phoneNumber.replace(/[^0-9+]/g, '');
    // Add country code if missing (default India +91)
    if (!cleaned.startsWith('+')) {
      if (cleaned.length === 10) cleaned = '91' + cleaned;
    } else {
      cleaned = cleaned.replace('+', '');
    }

    const whatsappUrl = `whatsapp://send?phone=${cleaned}&text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      return { success: true, method: 'whatsapp' };
    }

    // Try web WhatsApp as fallback
    const webUrl = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
    await Linking.openURL(webUrl);
    return { success: true, method: 'whatsapp_web' };
  } catch (e) {
    console.error('[WhatsApp] Send failed:', e);
    return { success: false, error: e.message };
  }
};

// Send a message to multiple contacts via WhatsApp (sequentially)
export const sendWhatsAppToContacts = async (contacts, message) => {
  if (!contacts?.length) return { success: false, error: 'no_contacts' };

  let sentCount = 0;
  for (const contact of contacts) {
    if (!contact.phone) continue;
    try {
      const result = await sendWhatsAppMessage(contact.phone, message);
      if (result.success) sentCount++;
      // Small delay between opens
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[WhatsApp] Failed for ${contact.name}:`, e);
    }
  }

  return { success: sentCount > 0, sentCount, totalContacts: contacts.length };
};

// ─── Journey SOS Sharing (WhatsApp + SMS) ────────────────────────
// Shares complete journey data (breadcrumbs, stats, route) with contacts
export const buildJourneySOSMessage = (journeyData, userMessage, location) => {
  if (!journeyData) return buildSOSMessage(userMessage || 'SOS EMERGENCY!', location);

  const { destination, startTime, breadcrumbs, stats, isOverdue } = journeyData;
  const startStr = new Date(startTime).toLocaleString();
  const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
  const distKm = ((stats?.distance || 0) / 1000).toFixed(2);
  const avgSpeedKmh = ((stats?.avgSpeed || 0) * 3.6).toFixed(1);
  const totalPoints = breadcrumbs?.length || 0;

  let msg = `🚨 SOS EMERGENCY DURING JOURNEY!\n\n`;
  msg += `📍 Destination: ${destination}\n`;
  msg += `🕐 Started: ${startStr}\n`;
  msg += `⏱️ Duration: ${duration} min\n`;
  msg += `📏 Distance covered: ${distKm} km\n`;
  msg += `🏃 Avg speed: ${avgSpeedKmh} km/h\n`;
  msg += `📌 GPS points recorded: ${totalPoints}\n`;
  if (isOverdue) msg += `⚠️ JOURNEY IS OVERDUE!\n`;
  msg += `\n`;

  if (location?.coords) {
    const { latitude, longitude } = location.coords;
    msg += `📍 CURRENT LOCATION:\nhttps://maps.google.com/?q=${latitude},${longitude}\n`;
    if (location.coords.accuracy) msg += `📐 Accuracy: ±${Math.round(location.coords.accuracy)}m\n`;
    if (location.coords.speed > 0) msg += `🚗 Current speed: ${Math.round(location.coords.speed * 3.6)} km/h\n`;
    msg += `\n`;
  }

  // Add route trail (last 10 breadcrumbs as Google Maps links)
  if (breadcrumbs && breadcrumbs.length > 0) {
    msg += `🗺️ ROUTE TRAIL (last ${Math.min(10, breadcrumbs.length)} points):\n`;
    const lastCrumbs = breadcrumbs.slice(-10);
    lastCrumbs.forEach((c, i) => {
      const t = new Date(c.timestamp).toLocaleTimeString();
      msg += `  ${i + 1}. ${t} — https://maps.google.com/?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
      if (c.speed > 0) msg += ` (${Math.round(c.speed * 3.6)} km/h)`;
      msg += `\n`;
    });
    msg += `\n`;

    // Google Maps directions link (start to current)
    const first = breadcrumbs[0];
    const last = breadcrumbs[breadcrumbs.length - 1];
    msg += `🗺️ Full Route:\nhttps://maps.google.com/maps/dir/${first.latitude},${first.longitude}/${last.latitude},${last.longitude}\n\n`;
  }

  msg += `⏰ ${new Date().toLocaleString()}\n`;
  msg += `— Sent via SafeHer App (EMERGENCY)`;

  return msg;
};

// Share journey SOS via both WhatsApp and SMS
export const shareJourneySOSToContacts = async (contacts, journeyData, userMessage, location) => {
  if (!contacts?.length) {
    Alert.alert('No Contacts', 'Please add emergency contacts first.');
    return { success: false };
  }

  const message = buildJourneySOSMessage(journeyData, userMessage, location);
  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);

  const results = { whatsapp: false, sms: false };

  // 1. Send via WhatsApp (Tier 1 contacts)
  const tier1 = contacts.filter(c => (c.tier || 1) === 1);
  if (tier1.length > 0) {
    try {
      const waResult = await sendWhatsAppToContacts(tier1, message);
      results.whatsapp = waResult.success;
    } catch (e) {
      console.error('[Journey SOS] WhatsApp failed:', e);
    }
  }

  // 2. Send via SMS to ALL contacts
  try {
    const smsResult = await sendSOSToContacts(contacts, message, location);
    results.sms = smsResult.success;
  } catch (e) {
    console.error('[Journey SOS] SMS failed:', e);
  }

  return {
    success: results.whatsapp || results.sms,
    ...results,
  };
};

// ─── Volume Button SOS Trigger ───────────────────────────────────
// Detects rapid volume button presses as an SOS trigger.
// Must be wired up from the component that calls useEffect with volume listener.
let _volumePressTimestamps = [];
const VOLUME_SOS_THRESHOLD = 5;      // 5 presses
const VOLUME_SOS_WINDOW_MS = 3000;   // within 3 seconds

export const handleVolumePress = (onSOSTrigger) => {
  const now = Date.now();
  _volumePressTimestamps.push(now);

  // Keep only presses within the time window
  _volumePressTimestamps = _volumePressTimestamps.filter(
    t => now - t < VOLUME_SOS_WINDOW_MS
  );

  if (_volumePressTimestamps.length >= VOLUME_SOS_THRESHOLD) {
    _volumePressTimestamps = [];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (onSOSTrigger) onSOSTrigger();
    return true;
  }
  return false;
};

export const resetVolumePress = () => {
  _volumePressTimestamps = [];
};

// ─── Re-export global emergency helpers ──────────────────────────
export {
  detectCountryCode,
  getEmergencyDataForCountry,
  getSupportedCountries,
  COUNTRY_EMERGENCY_DATA,
  INTERNATIONAL_FALLBACK,
};

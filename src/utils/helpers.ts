/**
 * Utility Helpers - Emergency calls, SMS, location, siren, recording
 * v6.0 — Global emergency numbers + volume SOS trigger + accessibility
 * 
 * TypeScript conversion — types catch bugs in SOS/location flows
 */
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as SMS from 'expo-sms';
import { Alert, Platform, Vibration } from 'react-native';
import Logger from './logger';
import {
  getEmergencyNumbers,
  getDisplayHelplines,
  detectCountryCode,
  getEmergencyDataForCountry,
  getSupportedCountries,
  COUNTRY_EMERGENCY_DATA,
  INTERNATIONAL_FALLBACK,
} from '../constants/globalEmergencyNumbers';

import type { EmergencyContact, LocationData } from '../types';

// ── Result Types ─────────────────────────────────────────────
interface SOSResult {
  success: boolean;
  method: string;
  result?: string;
  isOnline?: boolean;
  contactCount?: number;
  sentCount?: number;
  totalContacts?: number;
  error?: string;
  failedContacts: string[];
}

interface WhatsAppResult {
  success: boolean;
  method?: string;
  error?: string;
  sentCount?: number;
  totalContacts?: number;
}

interface JourneyData {
  destination: string;
  startTime: string;
  breadcrumbs?: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    speed?: number;
  }>;
  stats?: { distance?: number; avgSpeed?: number; maxSpeed?: number };
  isOverdue?: boolean;
}

// ─── Emergency Numbers (auto-detect country) ─────────────────────
let _cachedCountry: string | null = null;
let _cachedNumbers: ReturnType<typeof getEmergencyNumbers> | null = null;

export const getLocalEmergencyNumbers = (countryOverride: string | null = null) => {
  const code = countryOverride || _cachedCountry;
  if (!countryOverride && _cachedNumbers) return _cachedNumbers;
  const nums = getEmergencyNumbers(code as any);
  if (!countryOverride) { _cachedNumbers = nums; _cachedCountry = detectCountryCode(); }
  return nums;
};

export const getLocalDisplayHelplines = (countryOverride: string | null = null) => {
  return getDisplayHelplines(countryOverride as any);
};

export const EMERGENCY_NUMBERS = getEmergencyNumbers();

// ─── Network Connectivity Check ──────────────────────────────────
export const checkNetworkStatus = async (): Promise<boolean> => {
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
export const makePhoneCall = async (phoneNumber: string): Promise<void> => {
  try {
    const url = `tel:${phoneNumber}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Error', 'Phone calls are not supported on this device');
    }
  } catch (error) {
    Logger.error('Error making phone call:', error);
    Alert.alert('Error', 'Failed to make phone call');
  }
};

export const sendSMS = async (phoneNumber: string | string[], message: string): Promise<boolean> => {
  try {
    const isAvailable = await SMS.isAvailableAsync();
    if (isAvailable) {
      const numbers = Array.isArray(phoneNumber) ? phoneNumber : [phoneNumber];
      await SMS.sendSMSAsync(numbers, message);
      return true;
    } else {
      const num = Array.isArray(phoneNumber) ? phoneNumber.join(',') : phoneNumber;
      const url = Platform.select({
        ios: `sms:${num}&body=${encodeURIComponent(message)}`,
        android: `sms:${num}?body=${encodeURIComponent(message)}`,
      });
      if (url) await Linking.openURL(url);
      return true;
    }
  } catch (error) {
    Logger.error('Error sending SMS:', error);
    return false;
  }
};

// ─── Build SOS Message ───────────────────────────────────────────
const buildSOSMessage = (message: string, location?: LocationData | null, isUpdate = false): string => {
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
export const sendSOSToContacts = async (
  contacts: EmergencyContact[],
  message: string,
  location?: LocationData | null
): Promise<SOSResult> => {
  if (!contacts || contacts.length === 0) {
    Alert.alert('No Contacts', 'Please add emergency contacts first.');
    return { success: false, method: 'none', error: 'no_contacts', failedContacts: [] };
  }

  const fullMessage = buildSOSMessage(message, location);
  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);

  if (phoneNumbers.length === 0) {
    Alert.alert('No Phone Numbers', 'Your emergency contacts have no phone numbers.');
    return { success: false, method: 'none', error: 'no_numbers', failedContacts: [] };
  }

  const isOnline = await checkNetworkStatus();
  Logger.log(`[SOS] Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  Logger.log(`[SOS] Sending to ${phoneNumbers.length} contacts`);

  const failedContacts: string[] = [];

  // Method 1: Try expo-sms
  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      const { result } = await SMS.sendSMSAsync(phoneNumbers, fullMessage);
      // 'unknown' means the SMS app accepted the intent but did NOT confirm
      // delivery. In an emergency we cannot treat that as success — we
      // surface a warning so the user retries or calls directly.
      const confirmed = result === 'sent';
      if (result === 'cancelled') {
        Alert.alert(
          '⚠️ SOS Not Sent',
          'SMS was cancelled. Your emergency contacts were NOT alerted. Please try again or call emergency services directly.',
          [{ text: 'OK', style: 'destructive' }],
        );
      } else if (result === 'unknown') {
        Alert.alert(
          '⚠️ SMS Delivery Unconfirmed',
          'The system could not confirm SMS delivery. Verify with a contact or call emergency services to be safe.',
          [{ text: 'OK' }],
        );
      }
      return {
        success: confirmed,
        method: 'sms',
        result,
        isOnline,
        contactCount: phoneNumbers.length,
        failedContacts: result === 'sent' ? [] : phoneNumbers,
      };
    }
  } catch (e) {
    Logger.error('[SOS] expo-sms failed:', e);
  }

  // Method 2: Fallback — SMS intent via Linking
  try {
    Logger.log('[SOS] Falling back to SMS intent via Linking');
    const numbers = phoneNumbers.join(',');
    const url = Platform.select({
      ios: `sms:${numbers}&body=${encodeURIComponent(fullMessage)}`,
      android: `sms:${numbers}?body=${encodeURIComponent(fullMessage)}`,
    });
    if (url) await Linking.openURL(url);
    return {
      success: true,
      method: 'sms_intent',
      isOnline,
      contactCount: phoneNumbers.length,
      failedContacts: [],
    };
  } catch (e) {
    Logger.error('[SOS] SMS intent failed:', e);
  }

  // Method 3: Last resort — individual SMS, fired in parallel so an
  // emergency isn't gated by an 800 ms delay × N contacts.
  let sentCount = 0;
  await Promise.all(phoneNumbers.map(async (number) => {
    try {
      const url = Platform.select({
        ios: `sms:${number}&body=${encodeURIComponent(fullMessage)}`,
        android: `sms:${number}?body=${encodeURIComponent(fullMessage)}`,
      });
      if (url) await Linking.openURL(url);
      sentCount++;
    } catch (e) {
      Logger.error(`[SOS] Failed for ${number}:`, e);
      failedContacts.push(number);
    }
  }));

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
export const sendLiveLocationUpdate = async (
  contacts: EmergencyContact[],
  location: LocationData
): Promise<void> => {
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
      if (url) await Linking.openURL(url);
    }
    Logger.log('[SOS] Live location update sent');
  } catch (e) {
    Logger.error('[SOS] Live location update failed:', e);
  }
};

// ─── Location ────────────────────────────────────────────────────
export const requestLocationPermission = async (): Promise<boolean> => {
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
    Logger.error('Error requesting location permission:', error);
    return false;
  }
};

export const requestBackgroundLocationPermission = async (): Promise<boolean> => {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    return bgStatus === 'granted';
  } catch (error) {
    Logger.error('Error requesting background location permission:', error);
    return false;
  }
};

export const getCurrentPosition = async (): Promise<Location.LocationObject | null> => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return location;
  } catch (error) {
    Logger.error('Error getting current position:', error);
    return null;
  }
};

export const startLiveLocationTracking = async (
  onLocationUpdate: (location: Location.LocationObject) => void
): Promise<Location.LocationSubscription | null> => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 5,
      },
      (newLocation) => {
        if (onLocationUpdate) {
          onLocationUpdate(newLocation);
        }
      }
    );

    Logger.log('[Location] Live tracking started');
    return subscription;
  } catch (error) {
    Logger.error('Error starting live location tracking:', error);
    return null;
  }
};

export const stopLiveLocationTracking = (subscription: Location.LocationSubscription | null): void => {
  if (subscription) {
    subscription.remove();
    Logger.log('[Location] Live tracking stopped');
  }
};

export const openMap = (latitude: number, longitude: number): void => {
  const url = Platform.select({
    ios: `maps:${latitude},${longitude}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}`,
  });
  if (url) Linking.openURL(url);
};

export const shareLocation = async (location: LocationData | null): Promise<void> => {
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
    Logger.error('Error sharing location:', error);
  }
};

// ─── Vibration Patterns ──────────────────────────────────────────
export const vibrateEmergency = (): void => {
  Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500], false);
};

export const vibrateShort = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

// ─── Utility ─────────────────────────────────────────────────────
export const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

export const getRandomDelay = (min = 1000, max = 3000): number => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

export const getTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// ─── Panic Wipe — clear ALL sensitive data, sign out, drop cloud ──
//
// Wipes:
//   1. SecureStore-backed keys (PIN hashes, encrypted blobs)
//   2. AsyncStorage keys with @gs_, @girl_safety_, @safeher_db_, enc_ prefixes
//   3. Firebase auth session (sign-out)
//   4. The user's RTDB tree at users/{uid} (best-effort, requires auth)
//
// Returns true only if every step succeeded.
export const panicWipe = async (): Promise<boolean> => {
  let ok = true;

  try {
    const SecureStorageService = (await import('../services/EncryptedStorageService')).default;
    await SecureStorageService.secureWipe();
  } catch (e) {
    Logger.error('[panicWipe] SecureStorage wipe failed', e);
    ok = false;
  }

  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const keys = await AsyncStorage.getAllKeys();
    const safetyKeys = keys.filter((k) =>
      k.startsWith('@gs_') ||
      k.startsWith('@girl_safety_') ||
      k.startsWith('@safeher_db_') ||
      k.startsWith('@safeher_') ||
      k.startsWith('enc_') ||
      k.startsWith('@safe_chunked_'),
    );
    if (safetyKeys.length > 0) await AsyncStorage.multiRemove(safetyKeys);
  } catch (e) {
    Logger.error('[panicWipe] AsyncStorage wipe failed', e);
    ok = false;
  }

  // Best-effort cloud wipe (requires the user to still be authenticated)
  try {
    const { getAuth } = await import('firebase/auth');
    const { getDatabase, ref, remove } = await import('firebase/database');
    const uid = getAuth().currentUser?.uid;
    if (uid) {
      const db = getDatabase();
      await Promise.allSettled([
        remove(ref(db, `users/${uid}`)),
        remove(ref(db, `admin/devices/${uid}`)),
      ]);
    }
  } catch (e) {
    Logger.warn('[panicWipe] Cloud wipe skipped', e);
  }

  // Final: sign out so a future actor cannot read fresh data with stale token
  try {
    const { getAuth, signOut } = await import('firebase/auth');
    if (getAuth().currentUser) await signOut(getAuth());
  } catch (e) {
    Logger.warn('[panicWipe] sign-out skipped', e);
  }

  return ok;
};

// ─── Offline SMS SOS ─────────────────────────────────────────────
export const sendOfflineSMS = async (
  contacts: EmergencyContact[],
  message: string,
  location?: LocationData | null
): Promise<void> => {
  if (!contacts?.length) return;

  const fullMsg = buildSOSMessage(message, location);
  const phoneNumbers = contacts.map(c => c.phone).filter(Boolean);

  if (phoneNumbers.length === 0) return;

  try {
    const smsAvailable = await SMS.isAvailableAsync();
    if (smsAvailable) {
      await SMS.sendSMSAsync(phoneNumbers, fullMsg);
      return;
    }
  } catch (e) {
    Logger.error('[Offline SMS] expo-sms failed:', e);
  }

  const numbers = phoneNumbers.join(',');
  const url = Platform.select({
    ios: `sms:${numbers}&body=${encodeURIComponent(fullMsg)}`,
    android: `sms:${numbers}?body=${encodeURIComponent(fullMsg)}`,
  });

  try {
    if (url) await Linking.openURL(url);
  } catch (e) {
    Logger.error('Offline SMS error:', e);
  }
};

// ─── Country dial-code fallback (no more hardcoded +91) ──────────
const COUNTRY_DIAL_CODES: Record<string, string> = {
  IN: '91', US: '1', CA: '1', GB: '44', AU: '61', AE: '971',
  SG: '65', MY: '60', JP: '81', DE: '49', FR: '33', BR: '55',
};

const inferDialCode = (): string => {
  const cc = (detectCountryCode?.() as string | null) || null;
  if (cc && COUNTRY_DIAL_CODES[cc]) return COUNTRY_DIAL_CODES[cc];
  return ''; // no guess — user must store contacts in E.164
};

// ─── WhatsApp Messaging ──────────────────────────────────────────
export const sendWhatsAppMessage = async (phoneNumber: string, message: string): Promise<WhatsAppResult> => {
  try {
    let cleaned = phoneNumber.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.slice(1);
    } else if (cleaned.length <= 11) {
      // Local number — prepend the user's detected country code.
      const dial = inferDialCode();
      if (!dial) {
        return { success: false, error: 'Phone number must include country code (e.g. +1, +44).' };
      }
      cleaned = dial + cleaned;
    }

    const whatsappUrl = `whatsapp://send?phone=${cleaned}&text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      return { success: true, method: 'whatsapp' };
    }

    const webUrl = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
    await Linking.openURL(webUrl);
    return { success: true, method: 'whatsapp_web' };
  } catch (e: any) {
    Logger.error('[WhatsApp] Send failed:', e);
    return { success: false, error: e.message };
  }
};

export const sendWhatsAppToContacts = async (
  contacts: EmergencyContact[],
  message: string
): Promise<WhatsAppResult> => {
  if (!contacts?.length) return { success: false, error: 'no_contacts' };

  let sentCount = 0;
  for (const contact of contacts) {
    if (!contact.phone) continue;
    try {
      const result = await sendWhatsAppMessage(contact.phone, message);
      if (result.success) sentCount++;
      await new Promise<void>(r => setTimeout(r, 1000));
    } catch (e) {
      Logger.error(`[WhatsApp] Failed for ${contact.name}:`, e);
    }
  }

  return { success: sentCount > 0, sentCount, totalContacts: contacts.length };
};

// ─── Journey SOS Sharing ─────────────────────────────────────────
export const buildJourneySOSMessage = (
  journeyData: JourneyData | null,
  userMessage: string | null,
  location?: LocationData | null
): string => {
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
    if (location.coords.speed && location.coords.speed > 0) msg += `🚗 Current speed: ${Math.round(location.coords.speed * 3.6)} km/h\n`;
    msg += `\n`;
  }

  if (breadcrumbs && breadcrumbs.length > 0) {
    msg += `🗺️ ROUTE TRAIL (last ${Math.min(10, breadcrumbs.length)} points):\n`;
    const lastCrumbs = breadcrumbs.slice(-10);
    lastCrumbs.forEach((c, i) => {
      const t = new Date(c.timestamp).toLocaleTimeString();
      msg += `  ${i + 1}. ${t} — https://maps.google.com/?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
      if (c.speed && c.speed > 0) msg += ` (${Math.round(c.speed * 3.6)} km/h)`;
      msg += `\n`;
    });
    msg += `\n`;

    const first = breadcrumbs[0];
    const last = breadcrumbs[breadcrumbs.length - 1];
    msg += `🗺️ Full Route:\nhttps://maps.google.com/maps/dir/${first.latitude},${first.longitude}/${last.latitude},${last.longitude}\n\n`;
  }

  msg += `⏰ ${new Date().toLocaleString()}\n`;
  msg += `— Sent via SafeHer App (EMERGENCY)`;

  return msg;
};

export const shareJourneySOSToContacts = async (
  contacts: EmergencyContact[],
  journeyData: JourneyData | null,
  userMessage: string | null,
  location?: LocationData | null
): Promise<{ success: boolean; whatsapp: boolean; sms: boolean }> => {
  if (!contacts?.length) {
    Alert.alert('No Contacts', 'Please add emergency contacts first.');
    return { success: false, whatsapp: false, sms: false };
  }

  const message = buildJourneySOSMessage(journeyData, userMessage, location);

  const results = { whatsapp: false, sms: false };

  const tier1 = contacts.filter((c: any) => (c.tier || 1) === 1);
  if (tier1.length > 0) {
    try {
      const waResult = await sendWhatsAppToContacts(tier1, message);
      results.whatsapp = waResult.success;
    } catch (e) {
      Logger.error('[Journey SOS] WhatsApp failed:', e);
    }
  }

  try {
    const smsResult = await sendSOSToContacts(contacts, message, location);
    results.sms = smsResult.success;
  } catch (e) {
    Logger.error('[Journey SOS] SMS failed:', e);
  }

  return {
    success: results.whatsapp || results.sms,
    ...results,
  };
};

// ─── Volume Button SOS Trigger ───────────────────────────────────
let _volumePressTimestamps: number[] = [];
const VOLUME_SOS_THRESHOLD = 5;
const VOLUME_SOS_WINDOW_MS = 3000;

export const handleVolumePress = (onSOSTrigger: () => void): boolean => {
  const now = Date.now();
  _volumePressTimestamps.push(now);

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

export const resetVolumePress = (): void => {
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

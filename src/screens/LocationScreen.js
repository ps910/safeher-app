/**
 * LocationScreen v3.0 — Real-Time Location & Sharing
 *
 * Features:
 *  - High-accuracy GPS (±10-20m using BestForNavigation + averaging)
 *  - Share location via WhatsApp (one-tap)
 *  - Share via SMS to all emergency contacts
 *  - Open in Google Maps / Apple Maps
 *  - Copy shareable link
 *  - Live tracking with continuous position watch
 *  - Reverse geocode address display
 *  - Modern card-based UI
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, Animated, Dimensions,
  Vibration,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useEmergency } from '../context/EmergencyContext';
import { COLORS, SHADOWS } from '../constants/theme';
import {
  sendSOSToContacts, shareLocation, openMap,
  sendWhatsAppMessage, sendWhatsAppToContacts, sendSMS,
} from '../utils/helpers';

const { width: SCREEN_W } = Dimensions.get('window');

export default function LocationScreen() {
  const navigation = useNavigation();
  const {
    currentLocation, setCurrentLocation, emergencyContacts,
    sosMessage, isTracking, setIsTracking,
  } = useEmergency();

  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const locationSub = useRef(null);
  const trackingIntervalRef = useRef(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const accuracyAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    getHighAccuracyLocation();
    return () => {
      if (locationSub.current) locationSub.current.remove();
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    };
  }, []);

  // Pulse animation for live tracking
  useEffect(() => {
    if (isTracking) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isTracking]);

  // ── High-Accuracy Location (±10-20m) ──
  // Takes 3 readings and picks the best one
  const getHighAccuracyLocation = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required. Please enable it in Settings.');
        setLoading(false);
        return;
      }

      // Take multiple readings to get best accuracy
      const readings = [];
      for (let i = 0; i < 3; i++) {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
            maximumAge: 5000,
          });
          readings.push(loc);
          // If we already got <=15m accuracy, no need for more
          if (loc.coords.accuracy && loc.coords.accuracy <= 15) break;
          // Small delay between readings
          if (i < 2) await new Promise(r => setTimeout(r, 800));
        } catch (e) {
          console.log(`[Location] Reading ${i + 1} failed:`, e);
        }
      }

      if (readings.length === 0) {
        // Fallback to basic reading
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        readings.push(loc);
      }

      // Pick the most accurate reading
      readings.sort((a, b) => (a.coords.accuracy || 999) - (b.coords.accuracy || 999));
      const bestLoc = readings[0];

      setCurrentLocation(bestLoc);
      setLastUpdate(new Date());
      setAccuracy(bestLoc.coords.accuracy);
      setAltitude(bestLoc.coords.altitude);
      setSpeed(bestLoc.coords.speed);
      setHeading(bestLoc.coords.heading);
      setRefreshCount(prev => prev + 1);

      // Animate accuracy indicator
      Animated.spring(accuracyAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();

      // Reverse geocode
      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: bestLoc.coords.latitude,
          longitude: bestLoc.coords.longitude,
        });
        if (addr) {
          const parts = [
            addr.name,
            addr.street,
            addr.district || addr.subregion,
            addr.city,
            addr.region,
            addr.postalCode,
          ].filter(Boolean);
          // Deduplicate adjacent parts
          const unique = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
          setAddress(unique.join(', '));
        }
      } catch (e) {
        console.log('Geocode error:', e);
      }
    } catch (e) {
      console.error('Location error:', e);
      Alert.alert('Error', 'Failed to get location. Please ensure GPS is enabled.');
    }
    setLoading(false);
  };

  // ── Live Tracking ──
  const startLiveTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
      return;
    }

    setIsTracking(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 5,
      },
      (loc) => {
        setCurrentLocation(loc);
        setLastUpdate(new Date());
        setAccuracy(loc.coords.accuracy);
        setAltitude(loc.coords.altitude);
        setSpeed(loc.coords.speed);
        setHeading(loc.coords.heading);
      }
    );

    Alert.alert('Live Tracking Started', 'Your location is being tracked continuously with high accuracy.');
  };

  const stopLiveTracking = () => {
    setIsTracking(false);
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Tracking Stopped', 'Live location tracking has been turned off.');
  };

  // ── Sharing Functions ──
  const buildLocationMessage = () => {
    if (!currentLocation?.coords) return null;
    const { latitude, longitude } = currentLocation.coords;
    const acc = currentLocation.coords.accuracy;

    let msg = `My current location:\n`;
    msg += `https://maps.google.com/?q=${latitude},${longitude}\n\n`;
    if (address) msg += `Address: ${address}\n`;
    msg += `Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n`;
    if (acc) msg += `Accuracy: +/-${Math.round(acc)}m\n`;
    msg += `Time: ${new Date().toLocaleString()}\n\n`;
    msg += `-- Shared via SafeHer App`;
    return msg;
  };

  const handleShareWhatsApp = async () => {
    const msg = buildLocationMessage();
    if (!msg) {
      Alert.alert('Error', 'Location not available yet.');
      return;
    }

    const tier1 = emergencyContacts.filter(c => (c.tier || 1) === 1);
    if (tier1.length > 0) {
      await sendWhatsAppToContacts(tier1, msg);
    } else if (emergencyContacts.length > 0) {
      await sendWhatsAppMessage(emergencyContacts[0].phone, msg);
    } else {
      // Open WhatsApp with message but no specific contact
      try {
        const { Linking } = require('react-native');
        await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
      } catch (e) {
        Alert.alert('WhatsApp Not Found', 'Please install WhatsApp to use this feature.');
      }
    }
  };

  const handleShareSMS = () => {
    if (!currentLocation?.coords) {
      Alert.alert('Error', 'Location not available yet.');
      return;
    }
    if (emergencyContacts.length === 0) {
      Alert.alert('No Contacts', 'Please add emergency contacts first.');
      return;
    }
    const msg = buildLocationMessage();
    const phones = emergencyContacts.map(c => c.phone).filter(Boolean);
    sendSMS(phones, msg);
  };

  const handleOpenMap = () => {
    if (!currentLocation?.coords) return;
    openMap(currentLocation.coords.latitude, currentLocation.coords.longitude);
  };

  const handleCopyLink = async () => {
    if (!currentLocation?.coords) return;
    const { latitude, longitude } = currentLocation.coords;
    const link = `https://maps.google.com/?q=${latitude},${longitude}`;
    await Clipboard.setStringAsync(link);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Security: Auto-clear clipboard after 30s to prevent location data leakage (Vuln #12)
    setTimeout(async () => {
      try { await Clipboard.setStringAsync(''); } catch (e) { /* ignore */ }
    }, 30000);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendToContacts = () => {
    if (!currentLocation?.coords) {
      Alert.alert('Error', 'Location not available yet.');
      return;
    }
    if (emergencyContacts.length === 0) {
      Alert.alert('No Contacts', 'Please add emergency contacts first.');
      return;
    }
    const msg = buildLocationMessage();
    sendSOSToContacts(emergencyContacts, msg, null);
  };

  const getAccuracyColor = () => {
    if (!accuracy) return COLORS.textLight;
    if (accuracy <= 20) return '#00C853';
    if (accuracy <= 50) return '#FF6D00';
    return '#FF1744';
  };

  const getAccuracyLabel = () => {
    if (!accuracy) return 'Unknown';
    if (accuracy <= 10) return 'Excellent';
    if (accuracy <= 20) return 'Very Good';
    if (accuracy <= 50) return 'Good';
    if (accuracy <= 100) return 'Fair';
    return 'Poor';
  };

  const getCompassDirection = (deg) => {
    if (deg === null || deg === undefined || deg < 0) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return dirs[idx];
  };

  const lat = currentLocation?.coords?.latitude;
  const lon = currentLocation?.coords?.longitude;

  // ── RENDER ──
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>My Location</Text>
          <Text style={styles.headerSub}>High-Accuracy GPS</Text>
        </View>
        {isTracking && (
          <View style={styles.liveTag}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.refreshHeaderBtn}
          onPress={getHighAccuracyLocation}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="refresh" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim }}
      >
        {/* Location Card */}
        <View style={styles.locationCard}>
          <View style={styles.locCardHeader}>
            <View style={styles.locIconWrap}>
              <Ionicons name="navigate-circle" size={32} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.locCardTitle}>Current Position</Text>
              {lastUpdate && (
                <Text style={styles.locCardUpdate}>
                  Updated {lastUpdate.toLocaleTimeString()}
                </Text>
              )}
            </View>
            {/* Accuracy Badge */}
            {accuracy != null && (
              <Animated.View style={[styles.accBadge, {
                backgroundColor: getAccuracyColor() + '15',
                borderColor: getAccuracyColor() + '40',
                transform: [{ scale: accuracyAnim }],
              }]}>
                <Text style={[styles.accBadgeLabel, { color: getAccuracyColor() }]}>
                  {getAccuracyLabel()}
                </Text>
                <Text style={[styles.accBadgeValue, { color: getAccuracyColor() }]}>
                  ±{Math.round(accuracy)}m
                </Text>
              </Animated.View>
            )}
          </View>

          {lat ? (
            <>
              {/* Coordinates */}
              <View style={styles.coordsBox}>
                <View style={styles.coordItem}>
                  <Text style={styles.coordLabel}>Latitude</Text>
                  <Text style={styles.coordValue}>{lat.toFixed(6)}°</Text>
                </View>
                <View style={styles.coordDivider} />
                <View style={styles.coordItem}>
                  <Text style={styles.coordLabel}>Longitude</Text>
                  <Text style={styles.coordValue}>{lon.toFixed(6)}°</Text>
                </View>
              </View>

              {/* Address */}
              {address && (
                <View style={styles.addressBox}>
                  <Ionicons name="location" size={16} color={COLORS.primary} />
                  <Text style={styles.addressText}>{address}</Text>
                </View>
              )}

              {/* Extra Details Grid */}
              <View style={styles.detailsGrid}>
                {altitude != null && altitude !== 0 && (
                  <View style={styles.detailChip}>
                    <Ionicons name="trending-up" size={14} color="#1565C0" />
                    <Text style={styles.detailChipText}>{Math.round(altitude)}m alt</Text>
                  </View>
                )}
                {speed != null && speed > 0 && (
                  <View style={styles.detailChip}>
                    <Ionicons name="speedometer" size={14} color="#00C853" />
                    <Text style={styles.detailChipText}>{Math.round(speed * 3.6)} km/h</Text>
                  </View>
                )}
                {heading != null && heading >= 0 && (
                  <View style={styles.detailChip}>
                    <Ionicons name="compass" size={14} color="#FF6D00" />
                    <Text style={styles.detailChipText}>{Math.round(heading)}° {getCompassDirection(heading)}</Text>
                  </View>
                )}
                <View style={styles.detailChip}>
                  <Ionicons name="sync" size={14} color="#AA00FF" />
                  <Text style={styles.detailChipText}>{refreshCount}x refreshed</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noLocBox}>
              {loading ? (
                <>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.noLocText}>Getting high-accuracy location...</Text>
                  <Text style={styles.noLocSub}>Taking multiple readings for best accuracy</Text>
                </>
              ) : (
                <>
                  <Ionicons name="location-outline" size={48} color={COLORS.textLight} />
                  <Text style={styles.noLocText}>Location not available</Text>
                  <Text style={styles.noLocSub}>Tap refresh to get your position</Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── Share Section ── */}
        <Text style={styles.sectionTitle}>Share Location</Text>

        {/* WhatsApp Share — Primary */}
        <TouchableOpacity
          style={[styles.whatsappCard, !lat && { opacity: 0.5 }]}
          onPress={handleShareWhatsApp}
          disabled={!lat}
          activeOpacity={0.85}
        >
          <View style={styles.waIconWrap}>
            <MaterialCommunityIcons name="whatsapp" size={28} color="#FFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.waTitle}>Share via WhatsApp</Text>
            <Text style={styles.waSub}>
              {emergencyContacts.length > 0
                ? `Send to ${emergencyContacts.filter(c => (c.tier || 1) === 1).length || emergencyContacts.length} contact(s)`
                : 'Send to any WhatsApp contact'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* Action Grid */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={[styles.actionCard, !lat && { opacity: 0.5 }]}
            onPress={handleShareSMS}
            disabled={!lat}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="chatbubble" size={22} color="#1565C0" />
            </View>
            <Text style={styles.actionLabel}>SMS to Contacts</Text>
            <Text style={styles.actionSub}>{emergencyContacts.length} saved</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, !lat && { opacity: 0.5 }]}
            onPress={handleOpenMap}
            disabled={!lat}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="map" size={22} color="#2E7D32" />
            </View>
            <Text style={styles.actionLabel}>Open in Maps</Text>
            <Text style={styles.actionSub}>Google Maps</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, !lat && { opacity: 0.5 }]}
            onPress={() => lat && shareLocation(currentLocation)}
            disabled={!lat}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="share-social" size={22} color="#E65100" />
            </View>
            <Text style={styles.actionLabel}>Share Link</Text>
            <Text style={styles.actionSub}>Any app</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, !lat && { opacity: 0.5 }]}
            onPress={handleCopyLink}
            disabled={!lat}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconWrap, {
              backgroundColor: copied ? '#E8F5E9' : '#F3E5F5',
            }]}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy'}
                size={22}
                color={copied ? '#00C853' : '#7B1FA2'}
              />
            </View>
            <Text style={styles.actionLabel}>{copied ? 'Copied!' : 'Copy Link'}</Text>
            <Text style={styles.actionSub}>Clipboard</Text>
          </TouchableOpacity>
        </View>

        {/* ── Live Tracking ── */}
        <View style={styles.trackingCard}>
          <View style={styles.trackingHeader}>
            <View style={[styles.trackingIconWrap, {
              backgroundColor: isTracking ? '#FF174415' : '#00C85315',
            }]}>
              <Ionicons
                name={isTracking ? 'radio' : 'locate'}
                size={22}
                color={isTracking ? '#FF1744' : '#00C853'}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.trackingTitle}>
                {isTracking ? 'Live Tracking Active' : 'Live Tracking'}
              </Text>
              <Text style={styles.trackingDesc}>
                {isTracking
                  ? 'GPS updating every 5 seconds with high accuracy'
                  : 'Continuously monitor your position in real time'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.trackingBtn, isTracking && styles.trackingBtnStop]}
            onPress={isTracking ? stopLiveTracking : startLiveTracking}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isTracking ? 'stop-circle' : 'radio'}
              size={20}
              color="#FFF"
            />
            <Text style={styles.trackingBtnText}>
              {isTracking ? 'Stop Tracking' : 'Start Live Tracking'}
            </Text>
          </TouchableOpacity>

          {isTracking && (
            <View style={styles.trackingLive}>
              <View style={styles.trackingLiveDot} />
              <Text style={styles.trackingLiveText}>
                BestForNavigation mode | Updates every 5s | ±{accuracy ? Math.round(accuracy) : '--'}m
              </Text>
            </View>
          )}
        </View>

        {/* Accuracy Info */}
        <View style={styles.accuracyInfo}>
          <View style={styles.accInfoHeader}>
            <Ionicons name="information-circle" size={18} color="#1565C0" />
            <Text style={styles.accInfoTitle}>GPS Accuracy Guide</Text>
          </View>
          <View style={styles.accInfoGrid}>
            <View style={styles.accInfoItem}>
              <View style={[styles.accInfoDot, { backgroundColor: '#00C853' }]} />
              <Text style={styles.accInfoText}>±10m — Excellent (outdoors, clear sky)</Text>
            </View>
            <View style={styles.accInfoItem}>
              <View style={[styles.accInfoDot, { backgroundColor: '#00C853' }]} />
              <Text style={styles.accInfoText}>±20m — Very Good (urban areas)</Text>
            </View>
            <View style={styles.accInfoItem}>
              <View style={[styles.accInfoDot, { backgroundColor: '#FF6D00' }]} />
              <Text style={styles.accInfoText}>±50m — Good (near buildings)</Text>
            </View>
            <View style={styles.accInfoItem}>
              <View style={[styles.accInfoDot, { backgroundColor: '#FF1744' }]} />
              <Text style={styles.accInfoText}>±100m+ — Poor (indoors, tunnel)</Text>
            </View>
          </View>
          <Text style={styles.accInfoTip}>
            Go outdoors with clear sky view for the best accuracy. SafeHer takes multiple GPS readings and selects the most accurate one.
          </Text>
        </View>

        {/* Safety Tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipIconWrap}>
            <Ionicons name="shield-checkmark" size={18} color="#4E342E" />
          </View>
          <Text style={styles.tipText}>
            Share your live location with trusted contacts when traveling alone, especially at night. Your safety matters.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 18,
    backgroundColor: COLORS.primaryDark,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  liveTag: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF1744',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 6 },
  liveText: { fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  refreshHeaderBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: 16, paddingTop: 14 },

  // Location Card
  locationCard: {
    backgroundColor: '#FFF', borderRadius: 22, padding: 20,
    ...SHADOWS.medium, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  locCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  locIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center', alignItems: 'center',
  },
  locCardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  locCardUpdate: { fontSize: 11, color: '#00C853', marginTop: 3, fontWeight: '600' },
  accBadge: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1.5, alignItems: 'center',
  },
  accBadgeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  accBadgeValue: { fontSize: 13, fontWeight: '900', marginTop: 1 },

  // Coordinates
  coordsBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16,
    marginBottom: 12,
  },
  coordItem: { flex: 1, alignItems: 'center' },
  coordLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textLight, letterSpacing: 0.5 },
  coordValue: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  coordDivider: { width: 1, height: 36, backgroundColor: COLORS.border, marginHorizontal: 12 },

  // Address
  addressBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.primary + '08', borderRadius: 12,
    padding: 12, marginBottom: 12, gap: 8,
  },
  addressText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },

  // Details Grid
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F5F5F5', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  detailChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },

  // No Location
  noLocBox: { alignItems: 'center', paddingVertical: 30 },
  noLocText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary, marginTop: 14 },
  noLocSub: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },

  // Section Title
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },

  // WhatsApp Card
  whatsappCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#25D366', borderRadius: 18, padding: 16,
    marginBottom: 14, ...SHADOWS.medium,
  },
  waIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  waTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  waSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  // Action Grid
  actionGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20,
  },
  actionCard: {
    width: (SCREEN_W - 42) / 2,
    backgroundColor: '#FFF', borderRadius: 18, padding: 18,
    alignItems: 'center', ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  actionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  actionSub: { fontSize: 11, color: COLORS.textLight, marginTop: 3 },

  // Tracking Card
  trackingCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 18,
    ...SHADOWS.small, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  trackingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  trackingIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  trackingTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  trackingDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 3, lineHeight: 17 },
  trackingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 14, gap: 8,
    ...SHADOWS.small,
  },
  trackingBtnStop: { backgroundColor: '#FF1744' },
  trackingBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  trackingLive: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  trackingLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF1744' },
  trackingLiveText: { fontSize: 11, color: COLORS.textLight, flex: 1 },

  // Accuracy Info
  accuracyInfo: {
    backgroundColor: '#E3F2FD', borderRadius: 18, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#90CAF9',
  },
  accInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  accInfoTitle: { fontSize: 14, fontWeight: '800', color: '#1565C0' },
  accInfoGrid: { marginBottom: 10, gap: 6 },
  accInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accInfoDot: { width: 8, height: 8, borderRadius: 4 },
  accInfoText: { fontSize: 12, color: '#1976D2' },
  accInfoTip: { fontSize: 11, color: '#1976D2', fontStyle: 'italic', lineHeight: 16 },

  // Tip Card
  tipCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 16, padding: 14, gap: 10,
    borderWidth: 1, borderColor: '#FFE082',
  },
  tipIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center',
  },
  tipText: { flex: 1, fontSize: 12, color: '#5D4037', lineHeight: 18 },
});

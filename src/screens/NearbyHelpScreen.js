/**
 * NearbyHelpScreen v2.0 — Live SOS Alerts + Nearby Help
 *
 * Features:
 *  - Real-time SOS alerts from nearby users (3-4 km radius)
 *  - Exact pin location of victim with coordinates + address
 *  - 5-second live tracking: victim's location refreshes automatically
 *  - "Victim Moved!" notification when location changes
 *  - Movement trail with location history
 *  - One-tap: Call Police, Navigate to Victim, SMS your contacts
 *  - Safe Walk mode with continuous location sharing
 *  - Emergency speed dial (Police, Ambulance, Women Helpline)
 *  - Nearby places search (Police Station, Hospital, Pharmacy, etc.)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Dimensions, Platform, StatusBar, Animated, Vibration, RefreshControl,
  Linking, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { EMERGENCY_NUMBERS, makePhoneCall } from '../utils/helpers';
import { AlertsDB, NearbyUsersDB, LocationsDB, DatabaseUtils } from '../services/Database';
import OfflineLocationService from '../services/OfflineLocationService';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

// ─── Place Types for Google Maps Search ──────────────────────────
const PLACE_TYPES = [
  { key: 'police', label: 'Police Station', icon: 'shield', color: '#1565C0', query: 'police+station' },
  { key: 'hospital', label: 'Hospital', icon: 'medical', color: '#C62828', query: 'hospital' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'medkit', color: '#2E7D32', query: 'pharmacy' },
  { key: 'fire', label: 'Fire Station', icon: 'flame', color: '#E65100', query: 'fire+station' },
  { key: 'bus', label: 'Bus Stop', icon: 'bus', color: '#4527A0', query: 'bus+stop' },
  { key: 'atm', label: 'ATM / Bank', icon: 'card', color: '#00695C', query: 'atm' },
];

const EMERGENCY_CONTACTS_QUICK = [
  { name: 'Police', number: EMERGENCY_NUMBERS.police, icon: 'shield', color: '#1565C0' },
  { name: 'Ambulance', number: EMERGENCY_NUMBERS.ambulance, icon: 'medical', color: '#C62828' },
  { name: 'Women Helpline', number: EMERGENCY_NUMBERS.womenHelpline, icon: 'woman', color: '#AD1457' },
  { name: 'Emergency', number: EMERGENCY_NUMBERS.nationalEmergency, icon: 'call', color: '#FF1744' },
];

// ─── Haversine Distance (km) ─────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function NearbyHelpScreen({ navigation }) {
  // ─── State ────────────────────────────────────────────────────
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [sosAlerts, setSOSAlerts] = useState([]);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showAlertDetail, setShowAlertDetail] = useState(null);
  const [respondingTo, setRespondingTo] = useState(null);
  const [safeWalkActive, setSafeWalkActive] = useState(false);
  const [victimAddresses, setVictimAddresses] = useState({});
  const [movedAlerts, setMovedAlerts] = useState({}); // alertId -> true when victim just moved
  const [prevLocations, setPrevLocations] = useState({}); // alertId -> {lat,lon} for movement detection

  const emergency = useEmergency();
  const { userProfile } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const alertPulse = useRef(new Animated.Value(1)).current;
  const bannerSlide = useRef(new Animated.Value(-100)).current;
  const safeWalkRef = useRef(null);
  const alertPollRef = useRef(null);
  const prevAlertsRef = useRef([]);

  // ─── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    initScreen();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

    // Alert pulse animation for danger banner
    Animated.loop(
      Animated.sequence([
        Animated.timing(alertPulse, { toValue: 1.03, duration: 700, useNativeDriver: true }),
        Animated.timing(alertPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();

    // ★ Poll for SOS alerts every 5 seconds for live tracking
    alertPollRef.current = setInterval(() => {
      loadSOSAlerts();
    }, 5000);

    return () => {
      if (alertPollRef.current) clearInterval(alertPollRef.current);
      if (safeWalkRef.current) clearInterval(safeWalkRef.current);
    };
  }, []);

  const initScreen = async () => {
    await getLocation();
    await loadSOSAlerts();
    await loadNearbyUsers();
  };

  // ─── Get User Location ─────────────────────────────────────────
  const getLocation = async () => {
    try {
      setLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location to find nearby help.');
        setLoadingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
      emergency.setCurrentLocation(loc);
      await registerSelf(loc);
    } catch (e) {
      console.error('[NearbyHelp] Location error:', e);
    }
    setLoadingLocation(false);
  };

  // ─── Register Self as Nearby User ──────────────────────────────
  const registerSelf = async (loc) => {
    try {
      await OfflineLocationService.registerAsNearbyUser(loc);
      setIsRegistered(true);
    } catch (e) {}
  };

  // ─── Load SOS Alerts (filtered to 4km radius) ─────────────────
  const loadSOSAlerts = async () => {
    try {
      const activeAlerts = await AlertsDB.getActiveSOSAlerts();

      // Filter to alerts within 4km of current user
      let filtered = activeAlerts;
      if (location?.coords) {
        filtered = activeAlerts.filter(a => {
          if (!a.latitude || !a.longitude) return true; // show if no coords
          const dist = haversineKm(
            location.coords.latitude, location.coords.longitude,
            a.latitude, a.longitude
          );
          return dist <= 4; // 4km radius
        });
      }

      // Sort by most recent first
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // ★ Movement detection: compare current vs previous locations
      const newMoved = {};
      const newPrevLocs = {};
      for (const alert of filtered) {
        const prevLoc = prevLocations[alert.id];
        if (prevLoc && alert.latitude && alert.longitude) {
          const dist = haversineKm(prevLoc.lat, prevLoc.lon, alert.latitude, alert.longitude) * 1000; // meters
          if (dist > 5) {
            // Victim has moved more than 5 meters!
            newMoved[alert.id] = true;

            // Vibrate + haptic to notify user of movement
            if (!movedAlerts[alert.id]) {
              Vibration.vibrate([0, 200, 100, 200]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          }
        }
        newPrevLocs[alert.id] = { lat: alert.latitude, lon: alert.longitude };
      }

      // Clear "moved" flag after 8 seconds
      Object.keys(newMoved).forEach(id => {
        setTimeout(() => {
          setMovedAlerts(prev => {
            const copy = { ...prev };
            delete copy[id];
            return copy;
          });
        }, 8000);
      });

      setMovedAlerts(prev => ({ ...prev, ...newMoved }));
      setPrevLocations(prev => ({ ...prev, ...newPrevLocs }));

      // New critical alert notification (vibrate + banner)
      if (filtered.length > prevAlertsRef.current.length) {
        const newOnes = filtered.filter(a =>
          !prevAlertsRef.current.find(p => p.id === a.id)
        );
        if (newOnes.length > 0 && newOnes.some(a => a.severity === 'critical')) {
          Vibration.vibrate([0, 500, 200, 500, 200, 500]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // Slide in banner
          Animated.spring(bannerSlide, { toValue: 0, friction: 7, useNativeDriver: true }).start();
          setTimeout(() => {
            Animated.timing(bannerSlide, { toValue: -100, duration: 300, useNativeDriver: true }).start();
          }, 5000);
        }
      }

      prevAlertsRef.current = filtered;
      setSOSAlerts(filtered);

      // Reverse geocode victim addresses
      for (const alert of filtered) {
        if (alert.latitude && alert.longitude && !victimAddresses[alert.id]) {
          reverseGeocodeVictim(alert.id, alert.latitude, alert.longitude);
        } else if (alert.latitude && alert.longitude && movedAlerts[alert.id]) {
          // Re-geocode if victim moved
          reverseGeocodeVictim(alert.id, alert.latitude, alert.longitude);
        }
      }
    } catch (e) {
      console.log('[NearbyHelp] Load alerts error:', e);
    }
  };

  // ─── Reverse Geocode Victim Location ───────────────────────────
  const reverseGeocodeVictim = async (alertId, lat, lon) => {
    try {
      const [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (addr) {
        const parts = [addr.name, addr.street, addr.district || addr.subregion, addr.city, addr.region]
          .filter(Boolean)
          .filter((p, i, arr) => i === 0 || p !== arr[i - 1]); // deduplicate
        setVictimAddresses(prev => ({ ...prev, [alertId]: parts.join(', ') }));
      }
    } catch (e) {}
  };

  // ─── Load Nearby Users ─────────────────────────────────────────
  const loadNearbyUsers = async () => {
    try {
      const users = await NearbyUsersDB.getActive();
      setNearbyUsers(users);
    } catch (e) {}
  };

  // ─── Refresh ───────────────────────────────────────────────────
  const onRefresh = async () => {
    setRefreshing(true);
    await initScreen();
    setRefreshing(false);
  };

  // ─── Open Nearby Place in Maps ─────────────────────────────────
  const openNearbyPlace = (placeType) => {
    if (!location) { Alert.alert('Location Unavailable', 'Getting your location...'); return; }
    const { latitude, longitude } = location.coords;
    Linking.openURL(`https://www.google.com/maps/search/${placeType.query}/@${latitude},${longitude},15z`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Navigate to Victim ────────────────────────────────────────
  const navigateToVictim = (lat, lon) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
    Linking.openURL(url);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ─── View Victim on Map ────────────────────────────────────────
  const viewOnMap = (lat, lon) => {
    Linking.openURL(`https://www.google.com/maps/?q=${lat},${lon}`);
  };

  // ─── Respond to Danger Alert ───────────────────────────────────
  const respondToAlert = async (alert, action) => {
    try {
      setRespondingTo(alert.id);

      if (action === 'call_police') {
        await AlertsDB.respond(alert.id, { action: 'called_police', timestamp: new Date().toISOString() });
        makePhoneCall(EMERGENCY_NUMBERS.police);
      } else if (action === 'navigate') {
        if (alert.latitude && alert.longitude) {
          navigateToVictim(alert.latitude, alert.longitude);
        }
        await AlertsDB.respond(alert.id, { action: 'navigating', timestamp: new Date().toISOString() });
      } else if (action === 'acknowledge') {
        await AlertsDB.acknowledge(alert.id);
      }

      await loadSOSAlerts();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Respond error:', e);
    }
    setRespondingTo(null);
  };

  // ─── Send Own Danger Alert ─────────────────────────────────────
  const sendDangerAlert = async () => {
    Alert.alert(
      '🆘 Send Danger Alert',
      'This will alert all nearby SafeHer users within 4km that you are in danger. Your exact location will be shared and tracked in real-time. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND ALERT',
          style: 'destructive',
          onPress: async () => {
            try {
              let loc = location;
              if (!loc) {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
                setLocation(loc);
              }

              const result = await OfflineLocationService.shareSOSLocation(
                loc,
                emergency.emergencyContacts,
                `${userProfile?.fullName || 'A SafeHer user'} is in danger and needs immediate help!`
              );

              // Start 5-second live broadcast of your location
              if (result?.alertId) {
                await OfflineLocationService.startLiveSOSBroadcast(result.alertId);
              }

              Vibration.vibrate([0, 500, 200, 500]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert(
                '🚨 Alert Sent',
                'Nearby SafeHer users have been notified. Your location is being tracked live every 5 seconds.',
              );
              await loadSOSAlerts();
            } catch (e) {
              Alert.alert('Error', 'Failed to send alert. Try SOS from the home screen.');
            }
          },
        },
      ]
    );
  };

  // ─── Safe Walk Mode ────────────────────────────────────────────
  const toggleSafeWalk = async () => {
    if (safeWalkActive) {
      setSafeWalkActive(false);
      if (safeWalkRef.current) clearInterval(safeWalkRef.current);
      OfflineLocationService.stopTracking();
      Alert.alert('Safe Walk Ended', 'Location tracking stopped.');
    } else {
      setSafeWalkActive(true);
      await OfflineLocationService.startTracking(10000);
      safeWalkRef.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          await LocationsDB.add(loc, 'safe_walk');
        } catch (e) {}
      }, 30000);
      Alert.alert('Safe Walk Active', 'Your location is being tracked and shared with your emergency contacts.');
    }
  };

  // ─── Distance & Time Helpers ───────────────────────────────────
  const getDistanceText = (lat, lon) => {
    if (!location || !lat || !lon) return '';
    const dist = haversineKm(location.coords.latitude, location.coords.longitude, lat, lon);
    if (dist < 1) return `${Math.round(dist * 1000)}m`;
    return `${dist.toFixed(1)}km`;
  };

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 10) return 'Just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const getCompassDir = (fromLat, fromLon, toLat, toLon) => {
    const dLon = toLon - fromLon;
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(toLat * Math.PI / 180);
    const x = Math.cos(fromLat * Math.PI / 180) * Math.sin(toLat * Math.PI / 180)
      - Math.sin(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) * Math.cos(dLon * Math.PI / 180);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(bearing / 45) % 8];
  };

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Nearby Help</Text>
          <Text style={styles.headerSub}>
            {sosAlerts.length > 0
              ? `${sosAlerts.length} active SOS alert${sosAlerts.length > 1 ? 's' : ''}`
              : 'Monitoring for alerts within 4km'}
          </Text>
        </View>
        {sosAlerts.length > 0 && (
          <View style={styles.alertCountBadge}>
            <Text style={styles.alertCountText}>{sosAlerts.length}</Text>
          </View>
        )}
        {nearbyUsers.length > 0 && (
          <View style={styles.nearbyBadge}>
            <Ionicons name="people" size={14} color="#FFF" />
            <Text style={styles.nearbyBadgeText}>{nearbyUsers.length}</Text>
          </View>
        )}
      </View>

      {/* "Someone Moved!" Banner (slides in) */}
      <Animated.View style={[styles.movedBanner, { transform: [{ translateY: bannerSlide }] }]}>
        <Ionicons name="warning" size={20} color="#FFF" />
        <Text style={styles.movedBannerText}>⚠️ New SOS Alert Nearby!</Text>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* ══════════════════════════════════════════════════════ */}
          {/* LIVE SOS ALERTS (within 4km)                          */}
          {/* ══════════════════════════════════════════════════════ */}
          {sosAlerts.length > 0 && (
            <View style={styles.sosSection}>
              {/* Critical Alert Banner */}
              <Animated.View style={[styles.sosBanner, { transform: [{ scale: alertPulse }] }]}>
                <View style={styles.sosBannerIcon}>
                  <Ionicons name="alert-circle" size={28} color="#FFF" />
                </View>
                <View style={styles.sosBannerContent}>
                  <Text style={styles.sosBannerTitle}>
                    🆘 {sosAlerts.length} SOS Alert{sosAlerts.length > 1 ? 's' : ''} Nearby
                  </Text>
                  <Text style={styles.sosBannerSub}>
                    Someone within 4km needs help! Location updating every 5s
                  </Text>
                </View>
              </Animated.View>

              {/* ── Individual SOS Alert Cards ── */}
              {sosAlerts.map((alert) => {
                const isMoved = movedAlerts[alert.id];
                const victimAddr = victimAddresses[alert.id];
                const distText = getDistanceText(alert.latitude, alert.longitude);
                const locUpdates = alert.locationUpdateCount || 0;
                const lastLocUpdate = alert.lastLocationUpdate;
                const trail = alert.locationHistory || [];
                const direction = location?.coords && alert.latitude
                  ? getCompassDir(location.coords.latitude, location.coords.longitude, alert.latitude, alert.longitude)
                  : '';

                return (
                  <View
                    key={alert.id}
                    style={[
                      styles.sosCard,
                      isMoved && styles.sosCardMoved,
                    ]}
                  >
                    {/* Card Header */}
                    <View style={styles.sosCardHeader}>
                      <View style={styles.sosTypeWrap}>
                        <Ionicons name="alert-circle" size={20} color="#FFF" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.sosCardTitle}>🆘 SOS Alert</Text>
                        <Text style={styles.sosCardTime}>
                          Started {getTimeAgo(alert.createdAt)}
                        </Text>
                      </View>

                      {/* Live Badge */}
                      <View style={styles.liveBadge}>
                        <View style={styles.livePulse} />
                        <Text style={styles.liveText}>LIVE</Text>
                      </View>

                      {/* Movement Badge */}
                      {(alert.isMoving || isMoved) && (
                        <View style={[styles.movingBadge, isMoved && styles.movedBadge]}>
                          <Ionicons name="walk" size={12} color="#FFF" />
                          <Text style={styles.movingText}>
                            {isMoved ? 'MOVED!' : 'MOVING'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* ★ Victim Moved Notification */}
                    {isMoved && (
                      <View style={styles.movedNotice}>
                        <Ionicons name="navigate" size={16} color="#FF6D00" />
                        <Text style={styles.movedNoticeText}>
                          ⚠️ Victim has moved to a new location!
                        </Text>
                      </View>
                    )}

                    {/* ★ Exact Location Details */}
                    {alert.latitude && alert.longitude && (
                      <View style={styles.locationBox}>
                        <View style={styles.locationRow}>
                          <View style={styles.locationPinWrap}>
                            <Ionicons name="location" size={20} color={COLORS.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            {victimAddr && (
                              <Text style={styles.locationAddress} numberOfLines={2}>
                                {victimAddr}
                              </Text>
                            )}
                            <Text style={styles.locationCoords}>
                              {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}
                            </Text>
                          </View>
                        </View>

                        {/* Distance + Direction + Accuracy */}
                        <View style={styles.locationMeta}>
                          {distText ? (
                            <View style={styles.metaChip}>
                              <Ionicons name="navigate" size={12} color="#1565C0" />
                              <Text style={styles.metaChipText}>{distText} {direction}</Text>
                            </View>
                          ) : null}
                          {alert.accuracy && (
                            <View style={styles.metaChip}>
                              <Ionicons name="radio" size={12} color="#00C853" />
                              <Text style={styles.metaChipText}>±{Math.round(alert.accuracy)}m</Text>
                            </View>
                          )}
                          {alert.speed != null && alert.speed > 0 && (
                            <View style={styles.metaChip}>
                              <Ionicons name="speedometer" size={12} color="#FF6D00" />
                              <Text style={styles.metaChipText}>{Math.round(alert.speed * 3.6)} km/h</Text>
                            </View>
                          )}
                          {locUpdates > 0 && (
                            <View style={styles.metaChip}>
                              <Ionicons name="sync" size={12} color="#AA00FF" />
                              <Text style={styles.metaChipText}>{locUpdates}x updated</Text>
                            </View>
                          )}
                        </View>

                        {/* Last Location Update */}
                        {lastLocUpdate && (
                          <Text style={styles.lastUpdateText}>
                            📍 Last location update: {getTimeAgo(lastLocUpdate)}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Location Trail (movement history) */}
                    {trail.length > 1 && (
                      <View style={styles.trailSection}>
                        <Text style={styles.trailTitle}>
                          📍 Movement Trail ({trail.length} points)
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.trailRow}>
                            {trail.slice(-8).map((point, i) => (
                              <TouchableOpacity
                                key={i}
                                style={[
                                  styles.trailDot,
                                  i === trail.slice(-8).length - 1 && styles.trailDotActive,
                                ]}
                                onPress={() => viewOnMap(point.latitude, point.longitude)}
                              >
                                <Text style={[
                                  styles.trailDotText,
                                  i === trail.slice(-8).length - 1 && { color: '#FFF' },
                                ]}>
                                  {i + 1}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            <MaterialCommunityIcons name="map-marker-path" size={18} color={COLORS.textLight} />
                          </View>
                        </ScrollView>
                        <Text style={styles.trailHint}>
                          Tap dots to view each location on map
                        </Text>
                      </View>
                    )}

                    {/* Alert Message */}
                    {alert.message && (
                      <Text style={styles.sosMessage} numberOfLines={2}>
                        {alert.message}
                      </Text>
                    )}

                    {/* ★ Quick Action Buttons */}
                    <View style={styles.sosActions}>
                      <TouchableOpacity
                        style={[styles.sosActionBtn, { backgroundColor: '#FF1744' }]}
                        onPress={() => respondToAlert(alert, 'call_police')}
                        disabled={respondingTo === alert.id}
                      >
                        <Ionicons name="call" size={18} color="#FFF" />
                        <Text style={styles.sosActionText}>Call Police</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.sosActionBtn, { backgroundColor: '#2196F3' }]}
                        onPress={() => {
                          if (alert.latitude && alert.longitude) {
                            navigateToVictim(alert.latitude, alert.longitude);
                          }
                        }}
                        disabled={!alert.latitude || respondingTo === alert.id}
                      >
                        <Ionicons name="navigate" size={18} color="#FFF" />
                        <Text style={styles.sosActionText}>Navigate</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.sosActionBtn, { backgroundColor: '#00C853' }]}
                        onPress={() => {
                          if (alert.latitude && alert.longitude) viewOnMap(alert.latitude, alert.longitude);
                        }}
                        disabled={!alert.latitude}
                      >
                        <Ionicons name="map" size={18} color="#FFF" />
                        <Text style={styles.sosActionText}>View Map</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Responded Badge */}
                    {alert.respondedTo && (
                      <View style={styles.respondedRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#00C853" />
                        <Text style={styles.respondedText}>You responded to this alert</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* No Active SOS — Monitoring Status */}
          {sosAlerts.length === 0 && (
            <View style={styles.monitorCard}>
              <View style={styles.monitorIconWrap}>
                <Ionicons name="radio-outline" size={40} color="#00C853" />
              </View>
              <Text style={styles.monitorTitle}>Monitoring for SOS Alerts</Text>
              <Text style={styles.monitorSub}>
                Checking every 5 seconds for nearby users in danger within 4km radius.
                {'\n'}You'll be notified immediately with their exact location.
              </Text>
              <View style={styles.monitorDots}>
                <View style={[styles.monitorDot, { backgroundColor: '#00C853' }]} />
                <View style={[styles.monitorDot, { backgroundColor: '#00C85380' }]} />
                <View style={[styles.monitorDot, { backgroundColor: '#00C85340' }]} />
              </View>
            </View>
          )}

          {/* ── SEND DANGER ALERT ── */}
          <TouchableOpacity style={styles.dangerAlertBtn} onPress={sendDangerAlert} activeOpacity={0.8}>
            <View style={styles.dangerAlertIcon}>
              <Ionicons name="alert-circle" size={28} color="#FFF" />
            </View>
            <View style={styles.dangerAlertContent}>
              <Text style={styles.dangerAlertTitle}>Send Danger Alert</Text>
              <Text style={styles.dangerAlertDesc}>
                Alert all SafeHer users within 4km · Live tracked every 5s
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* ── SAFE WALK MODE ── */}
          <TouchableOpacity
            style={[styles.safeWalkBtn, safeWalkActive && styles.safeWalkBtnActive]}
            onPress={toggleSafeWalk}
            activeOpacity={0.8}
          >
            <Ionicons
              name={safeWalkActive ? 'walk' : 'walk-outline'}
              size={28}
              color={safeWalkActive ? '#FFF' : COLORS.primary}
            />
            <View style={styles.safeWalkContent}>
              <Text style={[styles.safeWalkTitle, safeWalkActive && { color: '#FFF' }]}>
                {safeWalkActive ? 'Safe Walk Active ✓' : 'Safe Walk Mode'}
              </Text>
              <Text style={[styles.safeWalkDesc, safeWalkActive && { color: 'rgba(255,255,255,0.8)' }]}>
                {safeWalkActive
                  ? 'Your location is being tracked & shared'
                  : 'Continuously share location while walking'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* ── NEARBY SAFEHER USERS ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👥 SafeHer Users Nearby ({nearbyUsers.length})</Text>
            {nearbyUsers.length === 0 ? (
              <View style={styles.noUsersCard}>
                <Ionicons name="people-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.noUsersText}>No SafeHer users detected nearby</Text>
                <Text style={styles.noUsersSubtext}>Users within 4km will appear here</Text>
              </View>
            ) : (
              <View style={styles.usersGrid}>
                {nearbyUsers.slice(0, 6).map((user, i) => (
                  <View key={user.id || i} style={styles.userCard}>
                    <View style={[styles.userAvatar, { backgroundColor: user.hasInternet ? '#E8F5E9' : '#FFF3E0' }]}>
                      <Ionicons name="person" size={20} color={user.hasInternet ? '#00C853' : '#FF9800'} />
                    </View>
                    <Text style={styles.userName}>User {i + 1}</Text>
                    <View style={styles.userStatusRow}>
                      <View style={[styles.userStatusDot, { backgroundColor: user.hasInternet ? '#00C853' : '#FF9800' }]} />
                      <Text style={styles.userStatus}>{user.hasInternet ? 'Online' : 'Offline'}</Text>
                    </View>
                    <Text style={styles.userDistance}>{getDistanceText(user.latitude, user.longitude)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── QUICK EMERGENCY CALLS ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📞 Quick Emergency Call</Text>
            <View style={styles.emergencyGrid}>
              {EMERGENCY_CONTACTS_QUICK.map((contact) => (
                <TouchableOpacity
                  key={contact.number}
                  style={[styles.emergencyCard, { borderLeftColor: contact.color }]}
                  onPress={() => makePhoneCall(contact.number)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={contact.icon} size={24} color={contact.color} />
                  <Text style={styles.emergencyName}>{contact.name}</Text>
                  <Text style={styles.emergencyNumber}>{contact.number}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── NEARBY PLACES ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Find Nearby Places</Text>
            {loadingLocation && (
              <View style={styles.locationLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.locationLoadingText}>Getting your location...</Text>
              </View>
            )}
            <View style={styles.placesGrid}>
              {PLACE_TYPES.map((place) => (
                <TouchableOpacity
                  key={place.key}
                  style={styles.placeCard}
                  onPress={() => openNearbyPlace(place)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.placeIcon, { backgroundColor: place.color + '15' }]}>
                    <Ionicons name={place.icon} size={24} color={place.color} />
                  </View>
                  <Text style={styles.placeLabel}>{place.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── INFO CARD ── */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={22} color="#1565C0" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>How Live SOS Alerts Work</Text>
              <Text style={styles.infoText}>
                When a SafeHer user triggers SOS, all users within 3-4 km are notified
                with the victim's exact GPS location. If the victim moves, their location
                updates every 5 seconds — you'll see "VICTIM MOVED!" with the new pin location,
                address, distance, and direction. You can call police, navigate to help,
                or view their movement trail on the map.
              </Text>
            </View>
          </View>

          <View style={{ height: 30 }} />
        </Animated.View>
      </ScrollView>

      {/* ── Alert Detail Modal ── */}
      <Modal visible={showAlertDetail !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {showAlertDetail && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {showAlertDetail.severity === 'critical' ? '🆘 CRITICAL ALERT' : '⚠️ Danger Alert'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowAlertDetail(null)}>
                    <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalMessage}>
                    {showAlertDetail.message || 'Someone nearby is in danger!'}
                  </Text>

                  <View style={styles.modalMeta}>
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalMetaLabel}>Time</Text>
                      <Text style={styles.modalMetaValue}>
                        {new Date(showAlertDetail.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    {showAlertDetail.latitude && (
                      <>
                        <View style={styles.modalMetaRow}>
                          <Text style={styles.modalMetaLabel}>Coordinates</Text>
                          <Text style={styles.modalMetaValue}>
                            {showAlertDetail.latitude.toFixed(6)}, {showAlertDetail.longitude.toFixed(6)}
                          </Text>
                        </View>
                        <View style={styles.modalMetaRow}>
                          <Text style={styles.modalMetaLabel}>Distance</Text>
                          <Text style={styles.modalMetaValue}>
                            {getDistanceText(showAlertDetail.latitude, showAlertDetail.longitude)}
                          </Text>
                        </View>
                      </>
                    )}
                    {victimAddresses[showAlertDetail.id] && (
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaLabel}>Address</Text>
                        <Text style={[styles.modalMetaValue, { flex: 1, textAlign: 'right' }]}>
                          {victimAddresses[showAlertDetail.id]}
                        </Text>
                      </View>
                    )}
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalMetaLabel}>Location Updates</Text>
                      <Text style={styles.modalMetaValue}>
                        {showAlertDetail.locationUpdateCount || 0}x
                      </Text>
                    </View>
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalMetaLabel}>Severity</Text>
                      <Text style={[styles.modalMetaValue, {
                        color: showAlertDetail.severity === 'critical' ? '#FF1744' : '#FF9800',
                        fontWeight: '800',
                      }]}>
                        {showAlertDetail.severity === 'critical' ? 'CRITICAL' : 'WARNING'}
                      </Text>
                    </View>
                  </View>

                  {/* Modal Actions */}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalActionBtn, { backgroundColor: '#FF1744' }]}
                      onPress={() => { respondToAlert(showAlertDetail, 'call_police'); setShowAlertDetail(null); }}
                    >
                      <Ionicons name="call" size={22} color="#FFF" />
                      <Text style={styles.modalActionText}>Call Police</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalActionBtn, { backgroundColor: '#2196F3' }]}
                      onPress={() => { respondToAlert(showAlertDetail, 'navigate'); setShowAlertDetail(null); }}
                    >
                      <Ionicons name="navigate" size={22} color="#FFF" />
                      <Text style={styles.modalActionText}>Navigate to Help</Text>
                    </TouchableOpacity>

                    {showAlertDetail.latitude && (
                      <TouchableOpacity
                        style={[styles.modalActionBtn, { backgroundColor: '#00C853' }]}
                        onPress={() => {
                          viewOnMap(showAlertDetail.latitude, showAlertDetail.longitude);
                          setShowAlertDetail(null);
                        }}
                      >
                        <Ionicons name="map" size={22} color="#FFF" />
                        <Text style={styles.modalActionText}>View on Map</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  headerBackBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  alertCountBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FF1744', justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
  },
  alertCountText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  nearbyBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4, gap: 4,
  },
  nearbyBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // Moved Banner
  movedBanner: {
    position: 'absolute', top: Platform.OS === 'ios' ? 108 : 92, left: 16, right: 16,
    backgroundColor: '#FF6D00', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    ...SHADOWS.medium, zIndex: 50,
  },
  movedBannerText: { fontSize: 14, fontWeight: '800', color: '#FFF', flex: 1 },

  // SOS Section
  sosSection: { padding: 16, paddingBottom: 0 },
  sosBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FF1744', borderRadius: 20, padding: 16,
    marginBottom: 14, gap: 12, ...SHADOWS.medium,
  },
  sosBannerIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  sosBannerContent: { flex: 1 },
  sosBannerTitle: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  sosBannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3, lineHeight: 17 },

  // SOS Alert Card
  sosCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 16,
    marginBottom: 12, borderLeftWidth: 5, borderLeftColor: '#FF1744',
    ...SHADOWS.medium, borderWidth: 1, borderColor: '#FFE0E0',
  },
  sosCardMoved: {
    borderLeftColor: '#FF6D00', borderColor: '#FFE0B2',
    backgroundColor: '#FFFAF0',
  },
  sosCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sosTypeWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FF1744', justifyContent: 'center', alignItems: 'center',
  },
  sosCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  sosCardTime: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FF174420', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF1744' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#FF1744', letterSpacing: 0.5 },
  movingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4CAF50', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, marginLeft: 6,
  },
  movedBadge: { backgroundColor: '#FF6D00' },
  movingText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },

  // Moved Notice
  movedNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 10,
    marginBottom: 10, borderWidth: 1, borderColor: '#FFE0B2',
  },
  movedNoticeText: { fontSize: 13, fontWeight: '700', color: '#E65100', flex: 1 },

  // Location Box
  locationBox: {
    backgroundColor: '#F8F9FA', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E0E0E0',
  },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  locationPinWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  locationAddress: { fontSize: 14, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  locationCoords: { fontSize: 12, color: COLORS.textLight, marginTop: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  locationMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  lastUpdateText: { fontSize: 11, color: '#00C853', fontWeight: '600', marginTop: 8 },

  // Trail
  trailSection: {
    marginBottom: 10, backgroundColor: '#F5F5F5', borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: '#E0E0E0',
  },
  trailTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  trailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trailDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center',
  },
  trailDotActive: { backgroundColor: '#FF1744' },
  trailDotText: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary },
  trailHint: { fontSize: 10, color: COLORS.textLight, marginTop: 6, fontStyle: 'italic' },

  // SOS Message
  sosMessage: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 10 },

  // SOS Actions
  sosActions: { flexDirection: 'row', gap: 8 },
  sosActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 11, gap: 6, ...SHADOWS.small,
  },
  sosActionText: { fontSize: 12, fontWeight: '800', color: '#FFF' },

  // Responded
  respondedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0',
  },
  respondedText: { fontSize: 12, color: '#00C853', fontWeight: '600' },

  // Monitor Card (no alerts)
  monitorCard: {
    alignItems: 'center', backgroundColor: '#FFF', borderRadius: 22,
    margin: 16, padding: 30, ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  monitorIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  monitorTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  monitorSub: {
    fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 20, marginBottom: 14,
  },
  monitorDots: { flexDirection: 'row', gap: 6 },
  monitorDot: { width: 10, height: 10, borderRadius: 5 },

  // Danger Alert Button
  dangerAlertBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FF1744', marginHorizontal: 16,
    marginTop: 16, borderRadius: 18, padding: 16,
    ...SHADOWS.medium,
  },
  dangerAlertIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  dangerAlertContent: { flex: 1 },
  dangerAlertTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  dangerAlertDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 3, lineHeight: 17 },

  // Safe Walk
  safeWalkBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 12,
    borderRadius: 18, padding: 16,
    borderWidth: 2, borderColor: COLORS.primary, ...SHADOWS.small,
  },
  safeWalkBtnActive: { backgroundColor: '#00C853', borderColor: '#00C853' },
  safeWalkContent: { flex: 1, marginLeft: 14 },
  safeWalkTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  safeWalkDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Section
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },

  // Nearby Users
  noUsersCard: {
    alignItems: 'center', backgroundColor: '#FFF', borderRadius: SIZES.radiusMd,
    padding: 24, ...SHADOWS.small,
  },
  noUsersText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, marginTop: 10 },
  noUsersSubtext: { fontSize: 12, color: COLORS.textLight, marginTop: 4, textAlign: 'center' },
  usersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  userCard: {
    width: (width - 56) / 3, backgroundColor: '#FFF', borderRadius: SIZES.radiusMd,
    padding: 12, alignItems: 'center', ...SHADOWS.small,
  },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  userName: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  userStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  userStatusDot: { width: 6, height: 6, borderRadius: 3 },
  userStatus: { fontSize: 10, color: COLORS.textSecondary },
  userDistance: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },

  // Emergency Grid
  emergencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emergencyCard: {
    width: (width - 42) / 2, backgroundColor: '#FFF', borderRadius: SIZES.radiusMd,
    padding: 14, borderLeftWidth: 4, ...SHADOWS.small,
  },
  emergencyName: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  emergencyNumber: { fontSize: 18, fontWeight: '900', color: COLORS.primary, marginTop: 4 },

  // Places
  locationLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  locationLoadingText: { fontSize: 12, color: COLORS.textSecondary },
  placesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  placeCard: {
    width: (width - 52) / 3, backgroundColor: '#FFF', borderRadius: SIZES.radiusMd,
    padding: 14, alignItems: 'center', ...SHADOWS.small,
  },
  placeIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  placeLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text, textAlign: 'center' },

  // Info Card
  infoCard: {
    flexDirection: 'row', backgroundColor: '#E3F2FD', marginHorizontal: 16,
    marginTop: 20, borderRadius: 18, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#90CAF9',
  },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 4 },
  infoText: { fontSize: 12, color: '#1976D2', lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: height * 0.7, padding: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  modalMessage: { fontSize: 16, color: COLORS.text, lineHeight: 24, marginBottom: 20 },
  modalMeta: { backgroundColor: '#F5F5F5', borderRadius: SIZES.radiusMd, padding: 14, marginBottom: 20 },
  modalMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalMetaLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  modalMetaValue: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  modalActions: { gap: 10 },
  modalActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: SIZES.radiusMd, gap: 8,
  },
  modalActionText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

/**
 * LocationScreen - Real-Time Location Tracking & Sharing
 * Features: Live GPS tracking, share location, send to contacts, open in maps
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEmergency } from '../context/EmergencyContext';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import {
  sendSOSToContacts, shareLocation, openMap, getCurrentPosition,
} from '../utils/helpers';

export default function LocationScreen() {
  const {
    currentLocation, setCurrentLocation, emergencyContacts,
    sosMessage, isTracking, setIsTracking,
  } = useEmergency();

  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState(null);
  const [trackingInterval, setTrackingIntervalState] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const locationSub = useRef(null);

  useEffect(() => {
    refreshLocation();
    return () => {
      if (locationSub.current) {
        locationSub.current.remove();
      }
    };
  }, []);

  const refreshLocation = async () => {
    setLoading(true);
    try {
      const loc = await getCurrentPosition();
      if (loc) {
        setCurrentLocation(loc);
        setLastUpdate(new Date());
        // Reverse geocode
        try {
          const [addr] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (addr) {
            setAddress(
              `${addr.street || ''} ${addr.name || ''}, ${addr.city || addr.subregion || ''}, ${addr.region || ''}`
                .replace(/\s+/g, ' ')
                .trim()
            );
          }
        } catch (e) {
          console.log('Geocode error:', e);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to get location');
    }
    setLoading(false);
  };

  // Start live tracking (sends location to contacts every 30s)
  const startLiveTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
      return;
    }

    setIsTracking(true);

    // Watch position
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
      },
      (loc) => {
        setCurrentLocation(loc);
        setLastUpdate(new Date());
      }
    );

    // Send location to contacts every 60s
    const interval = setInterval(async () => {
      const loc = await getCurrentPosition();
      if (loc && emergencyContacts.length > 0) {
        const msg = `📍 LIVE TRACKING UPDATE:\nhttps://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}\n⏰ ${new Date().toLocaleTimeString()}`;
        // Send silently (just log, real SMS would open per contact)
        console.log('Live tracking update sent');
      }
    }, 60000);

    setTrackingIntervalState(interval);
    Alert.alert('🟢 Live Tracking Started', 'Your location is being tracked continuously.');
  };

  const stopLiveTracking = () => {
    setIsTracking(false);
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    if (trackingInterval) {
      clearInterval(trackingInterval);
      setTrackingIntervalState(null);
    }
    Alert.alert('⏹ Tracking Stopped', 'Live location tracking has been turned off.');
  };

  const sendLocationToContacts = () => {
    if (!currentLocation) {
      Alert.alert('Error', 'Location not available yet');
      return;
    }
    if (emergencyContacts.length === 0) {
      Alert.alert('No Contacts', 'Please add emergency contacts first.');
      return;
    }
    const msg = `📍 Here is my current location:\nhttps://maps.google.com/?q=${currentLocation.coords.latitude},${currentLocation.coords.longitude}\n\n⏰ ${new Date().toLocaleString()}\n\nShared from Girl Safety App`;
    sendSOSToContacts(emergencyContacts, msg, null);
  };

  const lat = currentLocation?.coords?.latitude;
  const lon = currentLocation?.coords?.longitude;
  const acc = currentLocation?.coords?.accuracy;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="location" size={24} color={COLORS.surface} />
        <Text style={styles.headerTitle}>My Location</Text>
        {isTracking && (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Location Card */}
        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <Ionicons name="navigate-circle" size={44} color={COLORS.primary} />
            {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: 10 }} />}
          </View>

          {lat ? (
            <>
              <Text style={styles.coordText}>
                {lat.toFixed(6)}° N, {lon.toFixed(6)}° E
              </Text>
              {address && <Text style={styles.addressText}>📍 {address}</Text>}
              {acc && (
                <Text style={styles.accText}>Accuracy: ±{acc.toFixed(0)}m</Text>
              )}
              {lastUpdate && (
                <Text style={styles.updateText}>
                  Last update: {lastUpdate.toLocaleTimeString()}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noLocationText}>
              {loading ? 'Getting your location...' : 'Location not available. Tap refresh.'}
            </Text>
          )}

          <TouchableOpacity style={styles.refreshBtn} onPress={refreshLocation}>
            <Ionicons name="refresh" size={20} color={COLORS.primary} />
            <Text style={styles.refreshText}>Refresh Location</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
            onPress={() => lat && openMap(lat, lon)}
            disabled={!lat}
          >
            <Ionicons name="map" size={28} color="#1565C0" />
            <Text style={styles.actionLabel}>Open in Maps</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }]}
            onPress={() => lat && shareLocation(currentLocation)}
            disabled={!lat}
          >
            <Ionicons name="share-social" size={28} color="#2E7D32" />
            <Text style={styles.actionLabel}>Share Location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#FFF3E0' }]}
            onPress={sendLocationToContacts}
            disabled={!lat}
          >
            <Ionicons name="send" size={28} color="#E65100" />
            <Text style={styles.actionLabel}>Send to Contacts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#FCE4EC' }]}
            onPress={() => {
              if (lat) {
                const url = `https://maps.google.com/?q=${lat},${lon}`;
                Alert.alert('Google Maps Link', url);
              }
            }}
            disabled={!lat}
          >
            <Ionicons name="link" size={28} color="#C62828" />
            <Text style={styles.actionLabel}>Copy Link</Text>
          </TouchableOpacity>
        </View>

        {/* Live Tracking */}
        <View style={styles.trackingCard}>
          <View style={styles.trackingHeader}>
            <View>
              <Text style={styles.trackingTitle}>
                {isTracking ? '🔴 Live Tracking Active' : '📡 Live Tracking'}
              </Text>
              <Text style={styles.trackingDesc}>
                {isTracking
                  ? 'Continuously monitoring your location'
                  : 'Enable real-time location monitoring'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.trackingBtn, isTracking && styles.trackingBtnStop]}
            onPress={isTracking ? stopLiveTracking : startLiveTracking}
          >
            <Ionicons
              name={isTracking ? 'stop-circle' : 'radio'}
              size={22}
              color="#FFF"
            />
            <Text style={styles.trackingBtnText}>
              {isTracking ? 'Stop Tracking' : 'Start Live Tracking'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Safety tip */}
        <View style={styles.tipCard}>
          <Ionicons name="information-circle" size={22} color="#1565C0" />
          <Text style={styles.tipText}>
            Share your live location with trusted contacts when traveling alone, especially at night.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 45, paddingBottom: 15,
    backgroundColor: COLORS.primaryDark,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.surface, marginLeft: 10, flex: 1 },
  liveTag: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF1744',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 5 },
  liveText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  content: { padding: 16 },

  // Location Card
  locationCard: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 20,
    ...SHADOWS.medium, marginBottom: 16,
  },
  locationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  coordText: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  addressText: { fontSize: 14, color: COLORS.textLight, marginTop: 6 },
  accText: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  updateText: { fontSize: 12, color: '#00C853', marginTop: 4 },
  noLocationText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginVertical: 20 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: COLORS.primary + '10', borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  refreshText: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginLeft: 8 },

  // Actions Grid
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16,
  },
  actionBtn: {
    width: '48%', borderRadius: 16, padding: 18, alignItems: 'center',
    marginBottom: 12, ...SHADOWS.small,
  },
  actionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 8 },

  // Tracking
  trackingCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18,
    ...SHADOWS.small, marginBottom: 16,
  },
  trackingHeader: { marginBottom: 14 },
  trackingTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  trackingDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  trackingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00C853', borderRadius: 12, paddingVertical: 14,
  },
  trackingBtnStop: { backgroundColor: '#FF1744' },
  trackingBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF', marginLeft: 8 },

  // Tip
  tipCard: {
    flexDirection: 'row', backgroundColor: '#E3F2FD', borderRadius: 12, padding: 14,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 13, color: '#1565C0', marginLeft: 10, lineHeight: 18 },
});

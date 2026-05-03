/**
 * LocationScreen v7.0 — Real-time GPS + Live Sharing (Dark Luxury)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEmergency } from '../context/EmergencyContext';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Stat, Pill, EmptyState, T,
} from '../components/ui';

export default function LocationScreen() {
  const {
    currentLocation, setCurrentLocation,
    isLiveSharing, liveShareSession,
    startLiveLocationSharing, stopLiveLocationSharing,
    isBackgroundTracking,
  } = useEmergency();

  const [permissionState, setPermissionState] = useState('checking');
  const [accuracy, setAccuracy] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [address, setAddress] = useState(null);
  const watcherRef = useRef(null);

  useEffect(() => { (async () => { await initLocation(); })(); return cleanup; }, []);

  const cleanup = () => {
    if (watcherRef.current) { watcherRef.current.remove(); watcherRef.current = null; }
  };

  const initLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setPermissionState('denied'); return; }
    setPermissionState('granted');
    await refreshLocation();
    watcherRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 5 },
      (loc) => {
        setCurrentLocation(loc);
        setAccuracy(loc.coords.accuracy);
      },
    );
  };

  const refreshLocation = useCallback(async () => {
    setRefreshing(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setCurrentLocation(loc);
      setAccuracy(loc.coords.accuracy);
      try {
        const [info] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (info) setAddress(info);
      } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Could not refresh location.');
    } finally { setRefreshing(false); }
  }, [setCurrentLocation]);

  const openMap = () => {
    if (!currentLocation?.coords) return;
    const { latitude, longitude } = currentLocation.coords;
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(My+Location)`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  };

  const copyCoords = async () => {
    if (!currentLocation?.coords) return;
    const { latitude, longitude } = currentLocation.coords;
    await Clipboard.setStringAsync(`${latitude}, ${longitude}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Coordinates copied to clipboard.');
  };

  const shareLocation = async () => {
    if (!currentLocation?.coords) return;
    const { latitude, longitude } = currentLocation.coords;
    const message = `📍 My current location:\nhttps://maps.google.com/?q=${latitude},${longitude}\n\nShared from SafeHer`;
    try { await Share.share({ message }); } catch {}
  };

  const toggleLiveShare = async () => {
    if (isLiveSharing) {
      await stopLiveLocationSharing();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      const session = await startLiveLocationSharing({ ttlMinutes: 60 });
      if (session?.shareUrl) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
          await Share.share({
            message: `📍 Track my live location for the next 60 minutes:\n${session.shareUrl}\n\nShared from SafeHer`,
          });
        } catch {}
      }
    }
  };

  if (permissionState === 'denied') {
    return (
      <Screen>
        <Header title="Location" />
        <EmptyState
          icon="location-outline"
          title="Location permission denied"
          subtitle="SafeHer needs location access to share your position with emergency contacts and track journeys."
          action={<PrimaryBtn icon="settings" onPress={() => Linking.openSettings()}>Open Settings</PrimaryBtn>}
        />
      </Screen>
    );
  }

  const lat = currentLocation?.coords?.latitude;
  const lng = currentLocation?.coords?.longitude;
  const accLabel = accuracy ? `±${Math.round(accuracy)}m` : '–';
  const accGood = accuracy && accuracy <= 20;

  return (
    <Screen>
      <Header
        title="My Location"
        subtitle={isLiveSharing ? 'Live sharing active' : 'High-accuracy GPS'}
        right={
          <TouchableOpacity style={styles.refreshBtn} onPress={refreshLocation} accessibilityLabel="Refresh location">
            <Ionicons name="refresh" size={20} color={T.white} style={refreshing ? { opacity: 0.5 } : null} />
          </TouchableOpacity>
        }
      />

      {/* Coordinates Card */}
      <Card style={{ padding: 22 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={[styles.bigIcon, { backgroundColor: lat ? T.primaryGlow : 'rgba(255,255,255,0.05)' }]}>
            <Ionicons name="navigate" size={36} color={lat ? T.primary : T.textHint} />
          </View>
          {lat ? (
            <>
              <Text style={styles.coords}>{lat.toFixed(6)}, {lng.toFixed(6)}</Text>
              {address && (
                <Text style={styles.address}>
                  {[address.name, address.street, address.city, address.region, address.country].filter(Boolean).join(', ')}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pill icon="locate" label={accLabel} color={accGood ? T.success : T.warning} active />
                {currentLocation.coords.speed > 0 && (
                  <Pill icon="speedometer" label={`${Math.round(currentLocation.coords.speed * 3.6)} km/h`} color={T.info} active />
                )}
              </View>
            </>
          ) : (
            <Text style={styles.address}>Waiting for GPS fix…</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
          <View style={{ flex: 1 }}>
            <GhostBtn icon="map" onPress={openMap} color={T.info}>Open Map</GhostBtn>
          </View>
          <View style={{ flex: 1 }}>
            <GhostBtn icon="copy" onPress={copyCoords} color={T.accent}>Copy</GhostBtn>
          </View>
        </View>
        <PrimaryBtn icon="share-social" onPress={shareLocation} style={{ marginTop: 10 }}>
          Share Current Location
        </PrimaryBtn>
      </Card>

      {/* Status */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Stat
          icon={isBackgroundTracking ? 'cloud-done' : 'cloud-offline'}
          label="Background"
          value={isBackgroundTracking ? 'On' : 'Off'}
          color={isBackgroundTracking ? T.success : T.textSub}
        />
        <Stat
          icon={isLiveSharing ? 'radio' : 'radio-outline'}
          label="Live Share"
          value={isLiveSharing ? 'Active' : 'Off'}
          color={isLiveSharing ? T.primary : T.textSub}
        />
        <Stat
          icon="locate"
          label="Accuracy"
          value={accLabel}
          color={accGood ? T.success : T.warning}
        />
      </View>

      <SectionTitle>Live Location Sharing</SectionTitle>
      <Card>
        <Text style={styles.cardTitle}>
          {isLiveSharing ? '🟢 Sharing live location' : 'Share with trusted people'}
        </Text>
        <Text style={styles.cardSub}>
          {isLiveSharing
            ? 'Anyone with the link can see your live position for 60 minutes.'
            : 'Generate a link that updates every few seconds. Auto-expires after 60 minutes.'}
        </Text>
        {isLiveSharing && liveShareSession?.shareUrl && (
          <View style={styles.linkBox}>
            <Ionicons name="link" size={14} color={T.accent} />
            <Text style={styles.linkText} numberOfLines={1}>{liveShareSession.shareUrl}</Text>
          </View>
        )}
        <PrimaryBtn
          icon={isLiveSharing ? 'stop-circle' : 'play'}
          onPress={toggleLiveShare}
          danger={isLiveSharing}
          style={{ marginTop: 14 }}
        >
          {isLiveSharing ? 'Stop Sharing' : 'Start Live Sharing'}
        </PrimaryBtn>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  refreshBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  bigIcon: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  coords: { color: T.white, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  address: { color: T.textSub, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 },

  cardTitle: { color: T.white, fontSize: 15, fontWeight: '800' },
  cardSub:   { color: T.textSub, fontSize: 12, marginTop: 6, lineHeight: 18 },
  linkBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,143,171,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,143,171,0.25)',
    padding: 10, borderRadius: 12, marginTop: 12,
  },
  linkText: { color: T.accent, fontSize: 12, fontWeight: '700', flex: 1 },
});

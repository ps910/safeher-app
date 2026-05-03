/**
 * NearbyHelpScreen v7.0 — Find help nearby (Dark Luxury)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert, RefreshControl, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn,
  EmptyState, Stat, Pill, T,
} from '../components/ui';

const PLACE_TYPES = [
  { id: 'police',   label: 'Police Station', icon: 'shield', color: '#1976D2', query: 'police+station' },
  { id: 'hospital', label: 'Hospital',       icon: 'medical', color: T.danger, query: 'hospital' },
  { id: 'pharmacy', label: 'Pharmacy',       icon: 'medkit', color: '#43A047', query: 'pharmacy' },
  { id: 'fuel',     label: 'Petrol Station', icon: 'flash', color: T.warning, query: 'petrol+station' },
  { id: 'cafe',     label: 'Café (24x7)',    icon: 'cafe', color: '#8D6E63',  query: 'cafe+24+hours' },
  { id: 'hotel',    label: 'Hotel',          icon: 'bed', color: T.info, query: 'hotel' },
];

export default function NearbyHelpScreen() {
  const navigation = useNavigation();
  const [location, setLocation] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const fetchLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setPermDenied(true); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc);
    } catch (e) {
      Alert.alert('Error', 'Could not get location.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const openMaps = (type) => {
    if (!location) { Alert.alert('Wait', 'Location not yet available.'); return; }
    const { latitude, longitude } = location.coords;
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${type.query}&ll=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${type.query}`,
    });
    if (url) Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Maps.'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (permDenied) {
    return (
      <Screen>
        <Header title="Nearby Help" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="location-outline"
          title="Location needed"
          subtitle="Allow location access so we can find police, hospitals, and safe places near you."
          action={<PrimaryBtn icon="settings" onPress={() => Linking.openSettings()}>Open Settings</PrimaryBtn>}
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLocation(); }} tintColor={T.primary} />}
      >
        <Header
          title="Nearby Help"
          subtitle={location ? '📍 Location ready' : 'Locating you…'}
          onBack={() => navigation.goBack()}
        />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Ionicons name="information-circle" size={20} color={T.info} style={{ marginTop: 2 }} />
            <Text style={styles.note}>
              Tap any category to open Google Maps / Apple Maps with nearby results centered on your current location.
            </Text>
          </View>
        </Card>

        <SectionTitle>Find Help Nearby</SectionTitle>

        <View style={styles.grid}>
          {PLACE_TYPES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.tile}
              onPress={() => openMaps(p)}
              activeOpacity={0.85}
              disabled={!location}
            >
              <View style={[styles.tileIcon, { backgroundColor: `${p.color}22` }]}>
                <Ionicons name={p.icon} size={26} color={p.color} />
              </View>
              <Text style={styles.tileLabel}>{p.label}</Text>
              <Text style={styles.tileSub}>Open in Maps →</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionTitle>Quick Calls</SectionTitle>
        <Card padded={false}>
          <CallRow icon="call" color={T.danger} label="Police"            number="100" />
          <CallRow icon="medical" color={T.warning} label="Ambulance"      number="108" />
          <CallRow icon="woman" color={T.info} label="Women Helpline"      number="1091" />
          <CallRow icon="alert" color="#7C4DFF" label="Disaster Mgmt"      number="108" last />
        </Card>
      </ScrollView>
    </View>
  );
}

function CallRow({ icon, color, label, number, last }) {
  return (
    <TouchableOpacity
      style={[styles.callRow, !last && { borderBottomWidth: 1, borderBottomColor: T.border }]}
      onPress={() => Linking.openURL(`tel:${number}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.callIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.callLabel}>{label}</Text>
        <Text style={styles.callNumber}>{number}</Text>
      </View>
      <View style={[styles.callBtn, { backgroundColor: color }]}>
        <Ionicons name="call" size={14} color={T.white} />
        <Text style={styles.callBtnText}>CALL</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  note: { color: T.textSub, fontSize: 12, lineHeight: 18, flex: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  tile: {
    width: '47%',
    backgroundColor: T.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: T.border,
    alignItems: 'flex-start',
  },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tileLabel: { color: T.white, fontSize: 14, fontWeight: '900' },
  tileSub:   { color: T.accent, fontSize: 11, marginTop: 4, fontWeight: '700' },

  callRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  callIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callLabel: { color: T.white, fontSize: 14, fontWeight: '800' },
  callNumber: { color: T.textSub, fontSize: 12, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  callBtnText: { color: T.white, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
});

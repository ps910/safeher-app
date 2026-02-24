/**
 * NearbyHelpScreen - Find nearby police stations, hospitals, pharmacies, safe zones
 * Uses Google Maps links to show directions
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  Linking, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentPosition, EMERGENCY_NUMBERS, makePhoneCall } from '../utils/helpers';

const PLACE_CATEGORIES = [
  {
    id: 'police',
    label: 'Police Station',
    icon: 'shield-checkmark',
    color: '#1565C0',
    query: 'police+station',
    emoji: '🚔',
  },
  {
    id: 'hospital',
    label: 'Hospital',
    icon: 'medical',
    color: '#C62828',
    query: 'hospital',
    emoji: '🏥',
  },
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    icon: 'medkit',
    color: '#2E7D32',
    query: 'pharmacy',
    emoji: '💊',
  },
  {
    id: 'fire',
    label: 'Fire Station',
    icon: 'flame',
    color: '#E65100',
    query: 'fire+station',
    emoji: '🚒',
  },
  {
    id: 'bus',
    label: 'Bus Stand',
    icon: 'bus',
    color: '#6A1B9A',
    query: 'bus+station',
    emoji: '🚌',
  },
  {
    id: 'railway',
    label: 'Railway Station',
    icon: 'train',
    color: '#00695C',
    query: 'railway+station',
    emoji: '🚉',
  },
];

export default function NearbyHelpScreen() {
  const navigation = useNavigation();
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loc = await getCurrentPosition();
      if (loc) {
        setLocation(loc);
      }
      setLoading(false);
    })();
  }, []);

  const openNearbySearch = (category) => {
    if (!location) {
      Alert.alert('Location Unavailable', 'Please enable location to find nearby places.');
      return;
    }
    const { latitude, longitude } = location.coords;
    // Open Google Maps search for nearby places
    const url = `https://www.google.com/maps/search/${category.query}/@${latitude},${longitude},14z`;
    Linking.openURL(url).catch(() => {
      // Fallback to geo intent
      const geoUrl = `geo:${latitude},${longitude}?q=${category.query}`;
      Linking.openURL(geoUrl).catch(() => {
        Alert.alert('Error', 'Could not open maps application.');
      });
    });
  };

  const getDirections = (category) => {
    if (!location) {
      Alert.alert('Location Unavailable', 'Please enable location first.');
      return;
    }
    const { latitude, longitude } = location.coords;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${category.query}+near+me&travelmode=driving`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Help</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Location status */}
        <View style={styles.statusCard}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingText}>Getting your location...</Text>
            </View>
          ) : location ? (
            <View style={styles.statusRow}>
              <Ionicons name="location" size={22} color="#00C853" />
              <Text style={styles.statusText}>
                Location found • {location.coords.latitude.toFixed(4)}°, {location.coords.longitude.toFixed(4)}°
              </Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Ionicons name="warning" size={22} color="#FF6D00" />
              <Text style={styles.statusText}>Location unavailable. Enable GPS for best results.</Text>
            </View>
          )}
        </View>

        {/* Emergency speed dial */}
        <Text style={styles.sectionTitle}>🚨 Quick Emergency Call</Text>
        <View style={styles.emergencyRow}>
          <TouchableOpacity
            style={[styles.emergencyBtn, { backgroundColor: '#FF1744' }]}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.nationalEmergency)}
          >
            <Ionicons name="call" size={24} color="#FFF" />
            <Text style={styles.emergencyBtnText}>112{'\n'}Emergency</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emergencyBtn, { backgroundColor: '#1565C0' }]}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.police)}
          >
            <Ionicons name="shield" size={24} color="#FFF" />
            <Text style={styles.emergencyBtnText}>100{'\n'}Police</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emergencyBtn, { backgroundColor: '#C62828' }]}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.ambulance)}
          >
            <Ionicons name="medical" size={24} color="#FFF" />
            <Text style={styles.emergencyBtnText}>108{'\n'}Ambulance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emergencyBtn, { backgroundColor: '#AA00FF' }]}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.womenHelpline)}
          >
            <Ionicons name="woman" size={24} color="#FFF" />
            <Text style={styles.emergencyBtnText}>1091{'\n'}Women</Text>
          </TouchableOpacity>
        </View>

        {/* Nearby places */}
        <Text style={styles.sectionTitle}>📍 Find Nearby Safe Places</Text>
        <Text style={styles.sectionDesc}>
          Tap to find and get directions to the nearest help
        </Text>

        {PLACE_CATEGORIES.map((cat) => (
          <View key={cat.id} style={styles.placeCard}>
            <View style={[styles.placeIcon, { backgroundColor: cat.color + '15' }]}>
              <Text style={styles.placeEmoji}>{cat.emoji}</Text>
            </View>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{cat.label}</Text>
              <Text style={styles.placeDesc}>Find nearest {cat.label.toLowerCase()}</Text>
            </View>
            <View style={styles.placeActions}>
              <TouchableOpacity
                style={[styles.placeBtn, { backgroundColor: cat.color + '15' }]}
                onPress={() => openNearbySearch(cat)}
              >
                <Ionicons name="search" size={18} color={cat.color} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.placeBtn, { backgroundColor: cat.color, marginLeft: 8 }]}
                onPress={() => getDirections(cat)}
              >
                <Ionicons name="navigate" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Safety walk */}
        <View style={styles.safeWalkCard}>
          <View style={styles.safeWalkHeader}>
            <Ionicons name="walk" size={30} color="#1565C0" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.safeWalkTitle}>🚶‍♀️ Safe Walk Mode</Text>
              <Text style={styles.safeWalkDesc}>
                Share your live location with trusted contacts while walking alone
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.safeWalkBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Location' })}
          >
            <Ionicons name="location" size={20} color="#FFF" />
            <Text style={styles.safeWalkBtnText}>Start Live Tracking</Text>
          </TouchableOpacity>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>🛡️ Safety Tips While Traveling</Text>
          {[
            'Always share your live location with family when going out',
            'Keep your phone charged above 30% when outside',
            'Avoid isolated areas, especially at night',
            'Stay on well-lit, busy streets',
            'Trust your instincts — if something feels wrong, leave',
            'Keep emergency numbers on speed dial',
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingBottom: 18,
    backgroundColor: COLORS.primaryDark,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.surface, letterSpacing: 0.3 },
  content: { padding: 16 },

  // Status
  statusCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    marginBottom: 16, ...SHADOWS.small,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: { fontSize: 13, color: COLORS.text, marginLeft: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { fontSize: 13, color: COLORS.textLight, marginLeft: 10 },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  sectionDesc: { fontSize: 13, color: COLORS.textLight, marginBottom: 14 },

  // Emergency buttons
  emergencyRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20,
  },
  emergencyBtn: {
    flex: 1, marginHorizontal: 4, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', ...SHADOWS.small,
  },
  emergencyBtnText: {
    fontSize: 10, fontWeight: '700', color: '#FFF', marginTop: 6, textAlign: 'center',
  },

  // Place cards
  placeCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 14, padding: 14, marginBottom: 10, ...SHADOWS.small,
  },
  placeIcon: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
  },
  placeEmoji: { fontSize: 24 },
  placeInfo: { flex: 1, marginLeft: 12 },
  placeName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  placeDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  placeActions: { flexDirection: 'row' },
  placeBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },

  // Safe walk
  safeWalkCard: {
    backgroundColor: '#E3F2FD', borderRadius: 16, padding: 18, marginTop: 10, marginBottom: 16,
    borderWidth: 1, borderColor: '#90CAF9',
  },
  safeWalkHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  safeWalkTitle: { fontSize: 16, fontWeight: '700', color: '#0D47A1' },
  safeWalkDesc: { fontSize: 12, color: '#1565C0', marginTop: 2 },
  safeWalkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 13,
  },
  safeWalkBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF', marginLeft: 8 },

  // Tips
  tipsCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18, ...SHADOWS.small,
  },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  tipRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  tipBullet: { fontSize: 16, color: COLORS.primary, marginRight: 8, lineHeight: 20 },
  tipText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
});

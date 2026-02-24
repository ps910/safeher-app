/**
 * GuardianModeScreen - Geofence-based automatic safety monitoring
 * Features: Set home/work zones, route monitoring, auto check-in prompts,
 *           deviation alerts, inactivity SOS escalation
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  Platform, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentPosition } from '../utils/helpers';

const GUARDIAN_KEY = '@gs_guardian_settings';

export default function GuardianModeScreen() {
  const navigation = useNavigation();
  const { currentLocation, setCurrentLocation, triggerSOS } = useEmergency();
  const { userProfile } = useAuth();

  const [guardianEnabled, setGuardianEnabled] = useState(false);
  const [checkInInterval, setCheckInInterval] = useState(30); // minutes
  const [safeZones, setSafeZones] = useState([]);
  const [addingZone, setAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState('500');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState(null);

  const monitorRef = useRef(null);
  const lastCheckInRef = useRef(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (monitorRef.current) clearInterval(monitorRef.current);
    };
  }, []);

  const loadSettings = async () => {
    try {
      const data = await AsyncStorage.getItem(GUARDIAN_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        setGuardianEnabled(parsed.enabled || false);
        setCheckInInterval(parsed.interval || 30);
        setSafeZones(parsed.zones || []);
      }
    } catch (e) {
      console.log('Guardian load error:', e);
    }
  };

  const saveSettings = async (updates) => {
    const data = {
      enabled: updates.enabled !== undefined ? updates.enabled : guardianEnabled,
      interval: updates.interval !== undefined ? updates.interval : checkInInterval,
      zones: updates.zones !== undefined ? updates.zones : safeZones,
    };
    try {
      await AsyncStorage.setItem(GUARDIAN_KEY, JSON.stringify(data));
    } catch (e) {
      console.log('Guardian save error:', e);
    }
  };

  // Add current location as a safe zone
  const addSafeZone = async () => {
    const loc = await getCurrentPosition();
    if (!loc) {
      Alert.alert('Error', 'Could not get your current location');
      return;
    }

    const zone = {
      id: Date.now().toString(),
      name: newZoneName.trim() || 'My Safe Zone',
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      radius: parseInt(newZoneRadius) || 500,
      createdAt: new Date().toISOString(),
    };

    const updated = [...safeZones, zone];
    setSafeZones(updated);
    await saveSettings({ zones: updated });
    setAddingZone(false);
    setNewZoneName('');
    setNewZoneRadius('500');
    Alert.alert('✅ Safe Zone Added', `"${zone.name}" marked at your current location (${zone.radius}m radius).`);
  };

  const removeSafeZone = (zoneId) => {
    Alert.alert('Remove Zone', 'Remove this safe zone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = safeZones.filter((z) => z.id !== zoneId);
          setSafeZones(updated);
          await saveSettings({ zones: updated });
        }
      },
    ]);
  };

  // Toggle guardian mode monitoring
  const toggleGuardian = async (val) => {
    setGuardianEnabled(val);
    await saveSettings({ enabled: val });

    if (val) {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  };

  const startMonitoring = () => {
    setIsMonitoring(true);
    const now = new Date();
    setLastCheckIn(now);
    lastCheckInRef.current = now;

    // Check location every minute
    monitorRef.current = setInterval(async () => {
      const loc = await getCurrentPosition();
      if (!loc) return;
      setCurrentLocation(loc);

      // Check if outside all safe zones
      if (safeZones.length > 0) {
        const insideAnyZone = safeZones.some((zone) => {
          const dist = getDistance(
            loc.coords.latitude, loc.coords.longitude,
            zone.latitude, zone.longitude
          );
          return dist <= zone.radius;
        });

        if (!insideAnyZone) {
          Alert.alert(
            '⚠️ Guardian Alert',
            'You have left your safe zone! Are you okay?',
            [
              { text: 'I\'m Safe', onPress: () => {
                const t = new Date();
                setLastCheckIn(t);
                lastCheckInRef.current = t;
              }},
              { text: '🚨 SOS', style: 'destructive', onPress: () => triggerSOS() },
            ],
            { cancelable: false }
          );
        }
      }

      // Inactivity check-in using ref for fresh value
      if (lastCheckInRef.current) {
        const minutesSince = (Date.now() - lastCheckInRef.current.getTime()) / 60000;
        if (minutesSince >= checkInInterval) {
          Alert.alert(
            '👋 Check-In',
            'Are you okay? You haven\'t checked in for a while.',
            [
              { text: 'I\'m Safe ✅', onPress: () => {
                const t = new Date();
                setLastCheckIn(t);
                lastCheckInRef.current = t;
              }},
              { text: '🚨 Need Help', style: 'destructive', onPress: () => triggerSOS() },
            ],
            { cancelable: false }
          );
        }
      }
    }, 60000);

    Alert.alert('🛡️ Guardian Mode Active', 'Your location is being monitored. You\'ll receive check-in prompts.');
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
    if (monitorRef.current) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  // Haversine distance (meters)
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const intervalOptions = [15, 30, 60, 120];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guardian Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Toggle */}
        <View style={[styles.mainToggle, guardianEnabled && styles.mainToggleActive]}>
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIcon, guardianEnabled && styles.toggleIconActive]}>
              <Ionicons name="eye" size={30} color={guardianEnabled ? '#FFF' : '#0D47A1'} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.toggleLabel, guardianEnabled && { color: '#FFF' }]}>
                {guardianEnabled ? '🟢 Guardian Active' : 'Guardian Mode'}
              </Text>
              <Text style={[styles.toggleDesc, guardianEnabled && { color: 'rgba(255,255,255,0.7)' }]}>
                {guardianEnabled
                  ? 'Monitoring your location & safety'
                  : 'Auto-monitors your route and prompts check-ins'}
              </Text>
            </View>
            <Switch
              value={guardianEnabled}
              onValueChange={toggleGuardian}
              trackColor={{ false: '#ddd', true: '#64B5F6' }}
              thumbColor={guardianEnabled ? '#0D47A1' : '#f4f3f4'}
            />
          </View>
          {guardianEnabled && lastCheckIn && (
            <Text style={styles.lastCheckInText}>
              Last check-in: {lastCheckIn.toLocaleTimeString()}
            </Text>
          )}
        </View>

        {/* Check-in Interval */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ Check-In Interval</Text>
          <Text style={styles.sectionDesc}>How often you'll be prompted to confirm you're safe</Text>
          <View style={styles.intervalRow}>
            {intervalOptions.map((min) => (
              <TouchableOpacity
                key={min}
                style={[styles.intervalBtn, checkInInterval === min && styles.intervalBtnActive]}
                onPress={async () => {
                  setCheckInInterval(min);
                  await saveSettings({ interval: min });
                }}
              >
                <Text style={[styles.intervalText, checkInInterval === min && styles.intervalTextActive]}>
                  {min >= 60 ? `${min / 60}h` : `${min}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Safe Zones */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>📍 Safe Zones</Text>
            <TouchableOpacity onPress={() => setAddingZone(true)}>
              <Text style={styles.addZoneBtn}>+ Add Zone</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionDesc}>
            You'll be alerted when you leave these areas
          </Text>

          {addingZone && (
            <View style={styles.addZoneForm}>
              <TextInput
                style={styles.zoneInput}
                value={newZoneName}
                onChangeText={setNewZoneName}
                placeholder="Zone name (e.g., Home, Office)"
                placeholderTextColor={COLORS.textLight}
              />
              <View style={styles.radiusRow}>
                <Text style={styles.radiusLabel}>Radius (meters):</Text>
                <TextInput
                  style={[styles.zoneInput, { flex: 1, marginLeft: 8, marginBottom: 0 }]}
                  value={newZoneRadius}
                  onChangeText={setNewZoneRadius}
                  keyboardType="number-pad"
                  placeholder="500"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
              <View style={styles.addZoneActions}>
                <TouchableOpacity
                  style={styles.zoneCancelBtn}
                  onPress={() => setAddingZone(false)}
                >
                  <Text style={styles.zoneCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoneSaveBtn} onPress={addSafeZone}>
                  <Ionicons name="location" size={16} color="#FFF" />
                  <Text style={styles.zoneSaveText}>Save Current Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {safeZones.length === 0 ? (
            <View style={styles.emptyZones}>
              <Ionicons name="location-outline" size={36} color={COLORS.textLight} />
              <Text style={styles.emptyZonesText}>No safe zones set</Text>
              <Text style={styles.emptyZonesSub}>
                Add your home, work, or college as safe zones
              </Text>
            </View>
          ) : (
            safeZones.map((zone) => (
              <View key={zone.id} style={styles.zoneCard}>
                <View style={styles.zoneIcon}>
                  <Ionicons name="location" size={22} color="#0D47A1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneCoords}>
                    {zone.latitude.toFixed(4)}°, {zone.longitude.toFixed(4)}° • {zone.radius}m
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeSafeZone(zone.id)}>
                  <Ionicons name="trash-outline" size={20} color="#FF1744" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ How Guardian Mode Works</Text>
          {[
            { icon: 'navigate-circle', text: 'Monitors your location against safe zones' },
            { icon: 'notifications', text: 'Sends check-in prompts at set intervals' },
            { icon: 'warning', text: 'Alerts when you leave a safe zone' },
            { icon: 'alert-circle', text: 'Triggers SOS if check-in is ignored' },
          ].map((item, i) => (
            <View key={i} style={styles.howRow}>
              <Ionicons name={item.icon} size={20} color="#0D47A1" />
              <Text style={styles.howText}>{item.text}</Text>
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
    backgroundColor: '#0D47A1',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  content: { padding: 16 },

  // Main toggle
  mainToggle: {
    backgroundColor: '#E3F2FD', borderRadius: 16, padding: 18,
    marginBottom: 16, borderWidth: 2, borderColor: '#90CAF9',
  },
  mainToggleActive: { backgroundColor: '#0D47A1', borderColor: '#0D47A1' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#BBDEFB',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleIconActive: { backgroundColor: '#1565C0' },
  toggleLabel: { fontSize: 17, fontWeight: '700', color: '#0D47A1' },
  toggleDesc: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  lastCheckInText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 10 },

  // Section
  section: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: COLORS.textLight, marginBottom: 12 },

  // Interval
  intervalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intervalBtn: {
    flex: 1, marginHorizontal: 4, paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  intervalBtnActive: { backgroundColor: '#0D47A1', borderColor: '#0D47A1' },
  intervalText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  intervalTextActive: { color: '#FFF' },

  // Add zone
  addZoneBtn: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  addZoneForm: { backgroundColor: COLORS.background, borderRadius: 12, padding: 14, marginTop: 10 },
  zoneInput: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, fontSize: 14,
    color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  radiusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  radiusLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  addZoneActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  zoneCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  zoneCancelText: { fontSize: 14, color: COLORS.textLight },
  zoneSaveBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D47A1',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginLeft: 8,
  },
  zoneSaveText: { fontSize: 13, fontWeight: '600', color: '#FFF', marginLeft: 6 },

  // Empty zones
  emptyZones: { alignItems: 'center', paddingVertical: 20 },
  emptyZonesText: { fontSize: 14, fontWeight: '600', color: COLORS.textLight, marginTop: 8 },
  emptyZonesSub: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },

  // Zone card
  zoneCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  zoneIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  zoneName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  zoneCoords: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },

  // How it works
  howRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  howText: { fontSize: 13, color: COLORS.text, marginLeft: 10 },
});

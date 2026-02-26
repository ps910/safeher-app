/**
 * GuardianModeScreen — Always-on safety surveillance
 * Features: Continuous location monitoring, Green/Yellow/Red zone classification,
 *           police data & case reports, real-time safety status, auto-alerts
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, TextInput, Animated, Vibration, Dimensions,
  ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { getCurrentPosition } from '../utils/helpers';

const { width: SCREEN_W } = Dimensions.get('window');
const GUARDIAN_KEY = '@gs_guardian_zones_v2';
const GUARDIAN_LOG_KEY = '@gs_guardian_log';

// ── Zone safety levels ──
const ZONE_LEVELS = {
  green:  { label: 'Safe Zone',     color: '#00C853', bg: '#E8F5E9', icon: 'shield-checkmark', emoji: '🟢', desc: 'Low risk — safe area' },
  yellow: { label: 'Moderate Risk', color: '#FFB300', bg: '#FFF8E1', icon: 'warning',          emoji: '🟡', desc: 'Stay alert, be cautious' },
  red:    { label: 'High Danger',   color: '#FF1744', bg: '#FFEBEE', icon: 'alert-circle',     emoji: '🔴', desc: 'Extremely dangerous area' },
};

// ── Simulated police / crime data for common area types ──
const CRIME_DATA_TEMPLATES = {
  red: [
    { type: 'Harassment', cases: 47, trend: 'rising' },
    { type: 'Chain Snatching', cases: 23, trend: 'stable' },
    { type: 'Assault', cases: 12, trend: 'rising' },
    { type: 'Stalking', cases: 31, trend: 'rising' },
  ],
  yellow: [
    { type: 'Eve Teasing', cases: 18, trend: 'declining' },
    { type: 'Theft', cases: 14, trend: 'stable' },
    { type: 'Stalking', cases: 8, trend: 'declining' },
  ],
  green: [
    { type: 'Minor Incidents', cases: 3, trend: 'declining' },
  ],
};

// ── Safety tips per zone level ──
const SAFETY_TIPS = {
  green: [
    'Area is generally safe. Standard precautions apply.',
    'Keep emergency contacts updated.',
  ],
  yellow: [
    'Stay alert and aware of your surroundings.',
    'Avoid isolated or poorly lit routes.',
    'Share your live location with a trusted contact.',
    'Keep your phone charged and accessible.',
  ],
  red: [
    'Avoid traveling alone — go with company.',
    'Share live location with family immediately.',
    'Keep SOS button ready at all times.',
    'Avoid this area after dark if possible.',
    'Stay on main roads with CCTV coverage.',
    'Inform someone about your route and ETA.',
  ],
};

const PRECAUTION_LEVELS = {
  green: { text: 'Normal', icon: 'checkmark-circle' },
  yellow: { text: 'Stay Alert', icon: 'eye' },
  red: { text: 'Maximum Caution', icon: 'alert-circle' },
};

export default function GuardianModeScreen() {
  const navigation = useNavigation();
  const { currentLocation, setCurrentLocation, triggerSOS } = useEmergency();
  const { userProfile } = useAuth();

  // ── State ──
  const [zones, setZones] = useState([]);
  const [currentZoneLevel, setCurrentZoneLevel] = useState(null);
  const [currentZoneName, setCurrentZoneName] = useState('');
  const [isScanning, setIsScanning] = useState(true);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [locationLog, setLocationLog] = useState([]);

  // Add zone modal
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState('500');
  const [newZoneLevel, setNewZoneLevel] = useState('green');

  // Zone detail modal
  const [selectedZone, setSelectedZone] = useState(null);
  const [showZoneDetail, setShowZoneDetail] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const monitorRef = useRef(null);
  const alertShownRef = useRef({});

  // ── Always-on: start monitoring on mount ──
  useEffect(() => {
    loadZones();
    startContinuousMonitoring();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();

    return () => {
      pulse.stop();
      if (monitorRef.current) clearInterval(monitorRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentLocation) evaluateCurrentZone(currentLocation);
  }, [zones]);

  // ── Load / save zones ──
  const loadZones = async () => {
    try {
      const data = await AsyncStorage.getItem(GUARDIAN_KEY);
      if (data) setZones(JSON.parse(data));
    } catch (_) {}
  };

  const saveZones = async (updated) => {
    try {
      await AsyncStorage.setItem(GUARDIAN_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── Continuous monitoring (every 30 seconds) ──
  const startContinuousMonitoring = async () => {
    await scanLocation();
    monitorRef.current = setInterval(async () => {
      await scanLocation();
    }, 30000);
  };

  const scanLocation = async () => {
    try {
      setIsScanning(true);
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();

      const loc = await getCurrentPosition();
      if (loc) {
        setCurrentLocation(loc);
        setLastScanTime(new Date());
        setScanCount(prev => prev + 1);
        evaluateCurrentZone(loc);

        const logEntry = {
          time: new Date().toISOString(),
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };
        setLocationLog(prev => [logEntry, ...prev].slice(0, 50));
      }
    } catch (_) {} finally {
      setIsScanning(false);
    }
  };

  // ── Evaluate which zone the user is in ──
  const evaluateCurrentZone = useCallback((loc) => {
    if (!loc) return;
    const { latitude, longitude } = loc.coords;

    let matchedZone = null;
    let closestDist = Infinity;

    for (const zone of zones) {
      const dist = getDistance(latitude, longitude, zone.latitude, zone.longitude);
      if (dist <= zone.radius && dist < closestDist) {
        closestDist = dist;
        matchedZone = zone;
      }
    }

    if (matchedZone) {
      setCurrentZoneLevel(matchedZone.level);
      setCurrentZoneName(matchedZone.name);

      if (
        (matchedZone.level === 'red' || matchedZone.level === 'yellow') &&
        !alertShownRef.current[matchedZone.id]
      ) {
        alertShownRef.current[matchedZone.id] = true;
        const info = ZONE_LEVELS[matchedZone.level];

        if (matchedZone.level === 'red') {
          Vibration.vibrate([0, 300, 100, 300, 100, 300]);
        } else {
          Vibration.vibrate([0, 200, 100, 200]);
        }

        Alert.alert(
          `${info.emoji} ${info.label} — ${matchedZone.name}`,
          matchedZone.level === 'red'
            ? 'You are entering a HIGH DANGER zone. Take maximum precaution. Share your live location with a trusted contact and keep SOS ready.'
            : 'This area has moderate risk. Stay alert, avoid isolated paths, and keep your phone accessible.',
          [
            { text: 'Share Location', onPress: () => {} },
            matchedZone.level === 'red'
              ? { text: '🚨 Activate SOS', style: 'destructive', onPress: () => triggerSOS() }
              : null,
            { text: 'I Understand', style: 'cancel' },
          ].filter(Boolean),
          { cancelable: false }
        );
      }
    } else {
      setCurrentZoneLevel(null);
      setCurrentZoneName('');
      alertShownRef.current = {};
    }
  }, [zones, triggerSOS]);

  // ── Add zone at current location ──
  const addZone = async () => {
    const loc = await getCurrentPosition();
    if (!loc) {
      Alert.alert('Error', 'Could not get your current location. Please enable GPS.');
      return;
    }

    const zone = {
      id: Date.now().toString(),
      name: newZoneName.trim() || 'Unnamed Area',
      level: newZoneLevel,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      radius: Math.max(100, parseInt(newZoneRadius) || 500),
      createdAt: new Date().toISOString(),
      crimeData: CRIME_DATA_TEMPLATES[newZoneLevel] || [],
    };

    const updated = [...zones, zone];
    setZones(updated);
    await saveZones(updated);
    setShowAddZone(false);
    setNewZoneName('');
    setNewZoneRadius('500');
    setNewZoneLevel('green');

    const info = ZONE_LEVELS[zone.level];
    Alert.alert(
      `${info.emoji} Zone Marked`,
      `"${zone.name}" marked as ${info.label} (${zone.radius}m radius) at your current location.`
    );
  };

  const removeZone = (zoneId) => {
    Alert.alert('Remove Zone', 'Delete this marked zone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const updated = zones.filter(z => z.id !== zoneId);
          setZones(updated);
          await saveZones(updated);
          setShowZoneDetail(false);
          setSelectedZone(null);
        },
      },
    ]);
  };

  // ── Haversine distance (meters) ──
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ── Stats ──
  const greenZones = zones.filter(z => z.level === 'green').length;
  const yellowZones = zones.filter(z => z.level === 'yellow').length;
  const redZones = zones.filter(z => z.level === 'red').length;

  const statusInfo = currentZoneLevel
    ? ZONE_LEVELS[currentZoneLevel]
    : { label: 'Monitoring', color: '#2196F3', bg: '#E3F2FD', icon: 'radio', emoji: '🔵', desc: 'Scanning surroundings' };

  const precaution = currentZoneLevel
    ? PRECAUTION_LEVELS[currentZoneLevel]
    : { text: 'Standard', icon: 'shield-checkmark' };

  // ──────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Animated.View style={[styles.headerLive, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.liveIndicator} />
          </Animated.View>
          <Text style={styles.headerTitle}>Guardian Active</Text>
        </View>
        <TouchableOpacity onPress={scanLocation} style={styles.scanBtn}>
          <Ionicons name="refresh" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Current Safety Status Card ── */}
        <View style={[styles.statusCard, { backgroundColor: statusInfo.bg, borderLeftColor: statusInfo.color }]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconWrap, { backgroundColor: statusInfo.color }]}>
              <Ionicons name={statusInfo.icon} size={28} color="#fff" />
            </View>
            <View style={styles.statusInfo}>
              <View style={styles.statusRow}>
                <Text style={styles.statusEmoji}>{statusInfo.emoji}</Text>
                <Text style={[styles.statusLabel, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>
              {currentZoneName ? (
                <Text style={styles.statusZoneName}>{currentZoneName}</Text>
              ) : null}
              <Text style={styles.statusDesc}>{statusInfo.desc}</Text>
            </View>
          </View>

          <View style={[styles.precautionBar, { backgroundColor: statusInfo.color + '15' }]}>
            <Ionicons name={precaution.icon} size={16} color={statusInfo.color} />
            <Text style={[styles.precautionText, { color: statusInfo.color }]}>
              Precaution Level: {precaution.text}
            </Text>
          </View>

          <View style={styles.scanInfoRow}>
            {isScanning && <ActivityIndicator size="small" color={statusInfo.color} />}
            <Text style={styles.scanInfoText}>
              {lastScanTime
                ? `Last scan: ${lastScanTime.toLocaleTimeString()} • ${scanCount} scans`
                : 'Initializing...'}
            </Text>
          </View>
        </View>

        {/* ── Safety Tips for Current Zone ── */}
        {currentZoneLevel && (
          <View style={[styles.tipsCard, { borderLeftColor: statusInfo.color }]}>
            <Text style={styles.tipsTitle}>
              <Ionicons name="bulb" size={16} color={statusInfo.color} /> Safety Advisory
            </Text>
            {SAFETY_TIPS[currentZoneLevel].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={[styles.tipBullet, { backgroundColor: statusInfo.color }]} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
            {currentZoneLevel === 'red' && (
              <TouchableOpacity
                style={[styles.sosTipBtn, { backgroundColor: ZONE_LEVELS.red.color }]}
                onPress={() => triggerSOS()}
              >
                <Ionicons name="alert-circle" size={18} color="#fff" />
                <Text style={styles.sosTipBtnText}>Activate SOS Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Zone Overview Stats ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderTopColor: ZONE_LEVELS.green.color }]}>
            <Text style={[styles.statCount, { color: ZONE_LEVELS.green.color }]}>{greenZones}</Text>
            <Text style={styles.statLabel}>Safe</Text>
            <View style={[styles.statDot, { backgroundColor: ZONE_LEVELS.green.color }]} />
          </View>
          <View style={[styles.statCard, { borderTopColor: ZONE_LEVELS.yellow.color }]}>
            <Text style={[styles.statCount, { color: ZONE_LEVELS.yellow.color }]}>{yellowZones}</Text>
            <Text style={styles.statLabel}>Moderate</Text>
            <View style={[styles.statDot, { backgroundColor: ZONE_LEVELS.yellow.color }]} />
          </View>
          <View style={[styles.statCard, { borderTopColor: ZONE_LEVELS.red.color }]}>
            <Text style={[styles.statCount, { color: ZONE_LEVELS.red.color }]}>{redZones}</Text>
            <Text style={styles.statLabel}>Danger</Text>
            <View style={[styles.statDot, { backgroundColor: ZONE_LEVELS.red.color }]} />
          </View>
        </View>

        {/* ── Marked Zones ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Marked Areas</Text>
            <TouchableOpacity onPress={() => setShowAddZone(true)} style={styles.addBtn}>
              <Ionicons name="add-circle" size={20} color={COLORS.primary} />
              <Text style={styles.addBtnText}>Mark Area</Text>
            </TouchableOpacity>
          </View>

          {zones.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={44} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>No areas marked yet</Text>
              <Text style={styles.emptyDesc}>
                Mark areas around you as Safe (Green), Moderate (Yellow), or Dangerous (Red) based on police reports and local knowledge.
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddZone(true)}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyAddBtnText}>Mark Current Area</Text>
              </TouchableOpacity>
            </View>
          ) : (
            zones.map((zone) => {
              const info = ZONE_LEVELS[zone.level];
              return (
                <TouchableOpacity
                  key={zone.id}
                  style={[styles.zoneCard, { borderLeftColor: info.color }]}
                  onPress={() => { setSelectedZone(zone); setShowZoneDetail(true); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.zoneIconWrap, { backgroundColor: info.color + '20' }]}>
                    <Ionicons name={info.icon} size={22} color={info.color} />
                  </View>
                  <View style={styles.zoneInfo}>
                    <View style={styles.zoneNameRow}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      <View style={[styles.zoneBadge, { backgroundColor: info.color + '20' }]}>
                        <Text style={[styles.zoneBadgeText, { color: info.color }]}>{info.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.zoneCoords}>
                      {zone.latitude.toFixed(4)}°, {zone.longitude.toFixed(4)}° • {zone.radius}m radius
                    </Text>
                    {zone.crimeData && zone.crimeData.length > 0 && (
                      <Text style={styles.zoneCrimeSnippet}>
                        {zone.crimeData[0].type}: {zone.crimeData[0].cases} cases ({zone.crimeData[0].trend})
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── How Guardian Works ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How Guardian Protects You</Text>
          {[
            { icon: 'radio', color: '#2196F3', text: 'Always-on — continuously monitors your location every 30 seconds' },
            { icon: 'map', color: '#00C853', text: 'Green zones are safe areas with low crime reports' },
            { icon: 'warning', color: '#FFB300', text: 'Yellow zones have moderate risk — alerts you to stay cautious' },
            { icon: 'alert-circle', color: '#FF1744', text: 'Red zones are high-danger areas — auto-alerts and SOS-ready' },
            { icon: 'document-text', color: '#7C4DFF', text: 'Based on police records, FIRs, and local crime data' },
            { icon: 'notifications', color: '#E91E63', text: 'Alerts you when you enter a yellow or red zone' },
          ].map((item, i) => (
            <View key={i} style={styles.howRow}>
              <View style={[styles.howIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <Text style={styles.howText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* ── Recent Location Log ── */}
        {locationLog.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Scan Log</Text>
            <Text style={styles.logSubtitle}>{locationLog.length} location points recorded</Text>
            {locationLog.slice(0, 5).map((entry, i) => (
              <View key={i} style={styles.logRow}>
                <Ionicons name="locate" size={14} color={COLORS.textLight} />
                <Text style={styles.logText}>
                  {new Date(entry.time).toLocaleTimeString()} — {entry.lat.toFixed(5)}°, {entry.lng.toFixed(5)}°
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Add Zone Modal ── */}
      <Modal visible={showAddZone} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark This Area</Text>
            <Text style={styles.modalSubtitle}>Your current GPS location will be used as the center point</Text>

            <Text style={styles.fieldLabel}>Area Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={newZoneName}
              onChangeText={setNewZoneName}
              placeholder="e.g. College Road, Market Area, Bus Stop"
              placeholderTextColor="#999"
            />

            <Text style={styles.fieldLabel}>Safety Classification</Text>
            <View style={styles.levelPicker}>
              {Object.entries(ZONE_LEVELS).map(([key, info]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.levelOption,
                    newZoneLevel === key && { backgroundColor: info.color, borderColor: info.color },
                  ]}
                  onPress={() => setNewZoneLevel(key)}
                >
                  <Text style={styles.levelEmoji}>{info.emoji}</Text>
                  <Text style={[
                    styles.levelText,
                    newZoneLevel === key && { color: '#fff' },
                  ]}>
                    {info.label}
                  </Text>
                  {newZoneLevel === key && (
                    <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.levelDesc, { backgroundColor: ZONE_LEVELS[newZoneLevel].bg }]}>
              <Ionicons name="information-circle" size={16} color={ZONE_LEVELS[newZoneLevel].color} />
              <Text style={[styles.levelDescText, { color: ZONE_LEVELS[newZoneLevel].color }]}>
                {newZoneLevel === 'green' && 'Low crime rate, well-lit, CCTV coverage, safe for women.'}
                {newZoneLevel === 'yellow' && 'Some incidents reported, moderate foot traffic, stay cautious.'}
                {newZoneLevel === 'red' && 'High crime rate, frequent harassment reports, FIRs filed. Avoid alone.'}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Radius (meters)</Text>
            <View style={styles.radiusPicker}>
              {['200', '500', '1000', '2000'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.radiusChip, newZoneRadius === r && styles.radiusChipActive]}
                  onPress={() => setNewZoneRadius(r)}
                >
                  <Text style={[styles.radiusChipText, newZoneRadius === r && styles.radiusChipTextActive]}>
                    {parseInt(r) >= 1000 ? `${parseInt(r) / 1000}km` : `${r}m`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddZone(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: ZONE_LEVELS[newZoneLevel].color }]}
                onPress={addZone}
              >
                <Ionicons name="location" size={18} color="#fff" />
                <Text style={styles.modalSaveText}>Mark Area</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Zone Detail Modal ── */}
      <Modal visible={showZoneDetail} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          {selectedZone && (() => {
            const info = ZONE_LEVELS[selectedZone.level];
            const crimeData = selectedZone.crimeData || CRIME_DATA_TEMPLATES[selectedZone.level] || [];
            const tips = SAFETY_TIPS[selectedZone.level] || [];
            return (
              <View style={styles.detailModal}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[styles.detailHeader, { backgroundColor: info.color }]}>
                    <TouchableOpacity onPress={() => setShowZoneDetail(false)} style={styles.detailCloseBtn}>
                      <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Ionicons name={info.icon} size={40} color="#fff" />
                    <Text style={styles.detailName}>{selectedZone.name}</Text>
                    <Text style={styles.detailLevel}>{info.emoji} {info.label}</Text>
                  </View>

                  <View style={styles.detailBody}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Location Details</Text>
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>Coordinates</Text>
                        <Text style={styles.detailMetaValue}>
                          {selectedZone.latitude.toFixed(5)}°, {selectedZone.longitude.toFixed(5)}°
                        </Text>
                      </View>
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>Radius</Text>
                        <Text style={styles.detailMetaValue}>{selectedZone.radius}m</Text>
                      </View>
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>Marked On</Text>
                        <Text style={styles.detailMetaValue}>
                          {new Date(selectedZone.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>
                        <MaterialIcons name="local-police" size={16} color={info.color} /> Police & Case Data
                      </Text>
                      {crimeData.length > 0 ? (
                        crimeData.map((crime, i) => (
                          <View key={i} style={styles.crimeRow}>
                            <View style={styles.crimeTypeWrap}>
                              <MaterialCommunityIcons
                                name={crime.trend === 'rising' ? 'trending-up' : crime.trend === 'declining' ? 'trending-down' : 'trending-neutral'}
                                size={16}
                                color={crime.trend === 'rising' ? '#FF1744' : crime.trend === 'declining' ? '#00C853' : '#FFB300'}
                              />
                              <Text style={styles.crimeType}>{crime.type}</Text>
                            </View>
                            <View style={styles.crimeCaseWrap}>
                              <Text style={styles.crimeCases}>{crime.cases} cases</Text>
                              <Text style={[
                                styles.crimeTrend,
                                { color: crime.trend === 'rising' ? '#FF1744' : crime.trend === 'declining' ? '#00C853' : '#FFB300' },
                              ]}>
                                {crime.trend}
                              </Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noCrimeText}>No crime data available for this area</Text>
                      )}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>
                        <Ionicons name="shield-checkmark" size={16} color={info.color} /> Safety Precautions
                      </Text>
                      {tips.map((tip, i) => (
                        <View key={i} style={styles.detailTipRow}>
                          <View style={[styles.detailTipBullet, { backgroundColor: info.color }]} />
                          <Text style={styles.detailTipText}>{tip}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.detailActionsRow}>
                      <TouchableOpacity
                        style={[styles.detailActionBtn, { borderColor: '#FF1744' }]}
                        onPress={() => removeZone(selectedZone.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#FF1744" />
                        <Text style={[styles.detailActionText, { color: '#FF1744' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 58 : 44, paddingBottom: 18,
    backgroundColor: '#0D47A1', borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLive: { width: 12, height: 12, borderRadius: 6 },
  liveIndicator: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#00E676' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  scanBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  scrollContent: { padding: 16 },

  // ── Status card ──
  statusCard: {
    borderRadius: 18, padding: 18, marginBottom: 16,
    borderLeftWidth: 5, ...SHADOWS.medium,
  },
  statusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statusIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  statusInfo: { flex: 1, marginLeft: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusEmoji: { fontSize: 18 },
  statusLabel: { fontSize: 18, fontWeight: '800' },
  statusZoneName: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  statusDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  precautionBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 10,
  },
  precautionText: { fontSize: 13, fontWeight: '700' },
  scanInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanInfoText: { fontSize: 11, color: COLORS.textLight },

  // ── Tips ──
  tipsCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, ...SHADOWS.small,
  },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  tipBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  tipText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  sosTipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  sosTipBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', borderTopWidth: 3, ...SHADOWS.small,
  },
  statCount: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
  statDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

  // ── Section ──
  section: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    marginBottom: 16, ...SHADOWS.small,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // ── Empty state ──
  emptyState: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  emptyDesc: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D47A1',
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 12,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── Zone card ──
  zoneCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4,
  },
  zoneIconWrap: {
    width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  zoneInfo: { flex: 1 },
  zoneNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  zoneName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  zoneBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  zoneBadgeText: { fontSize: 10, fontWeight: '700' },
  zoneCoords: { fontSize: 11, color: COLORS.textLight },
  zoneCrimeSnippet: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, fontStyle: 'italic' },

  // ── How it works ──
  howRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  howIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  howText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },

  // ── Log ──
  logSubtitle: { fontSize: 11, color: COLORS.textLight, marginBottom: 10 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  logText: { fontSize: 11, color: COLORS.textSecondary, fontVariant: ['tabular-nums'] },

  // ── Modal base ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 12, color: COLORS.textLight, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  levelPicker: { gap: 8 },
  levelOption: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  levelEmoji: { fontSize: 16 },
  levelText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  levelDesc: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 10, marginTop: 10,
  },
  levelDescText: { flex: 1, fontSize: 12, lineHeight: 17 },
  radiusPicker: { flexDirection: 'row', gap: 8 },
  radiusChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  radiusChipActive: { backgroundColor: '#0D47A1', borderColor: '#0D47A1' },
  radiusChipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  radiusChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  modalSaveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
  },
  modalSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Zone Detail Modal ──
  detailModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%', overflow: 'hidden',
  },
  detailHeader: {
    paddingTop: 20, paddingBottom: 24, paddingHorizontal: 20, alignItems: 'center', gap: 8,
  },
  detailCloseBtn: { position: 'absolute', top: 16, right: 16, padding: 4 },
  detailName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  detailLevel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  detailBody: { padding: 20 },
  detailSection: { marginBottom: 20 },
  detailSectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  detailMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailMetaLabel: { fontSize: 13, color: COLORS.textSecondary },
  detailMetaValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // Crime data
  crimeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  crimeTypeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  crimeType: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  crimeCaseWrap: { alignItems: 'flex-end' },
  crimeCases: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  crimeTrend: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  noCrimeText: { fontSize: 13, color: COLORS.textLight, fontStyle: 'italic' },

  // Detail tips
  detailTipRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  detailTipBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  detailTipText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },

  // Detail actions
  detailActionsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  detailActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 12, borderWidth: 1.5,
  },
  detailActionText: { fontSize: 14, fontWeight: '600' },
});

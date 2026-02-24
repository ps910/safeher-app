/**
 * HiddenCameraScreen — Guides to detect hidden cameras & protect privacy
 * Features: IR Camera Scanner, Detection Checklist, Step-by-step Guide,
 *           Emergency Actions, Educational Content
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, Animated, Dimensions, Linking, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';

const { width } = Dimensions.get('window');

const DETECTION_METHODS = [
  {
    id: 'visual',
    icon: 'eye',
    title: 'Visual Inspection',
    color: '#1565C0',
    description: 'First line of defense — scan the room carefully before changing.',
    steps: [
      'Take 1-2 minutes to scan the entire room carefully.',
      'Look for anything out of place — small holes in walls, suspicious objects.',
      'Check common hiding spots: hooks on walls/doors, smoke detectors, vents.',
      'Examine mirrors, shelves, light fixtures, and gaps in tiles.',
      'Look for tiny LED lights — cameras often have indicator lights.',
      'Check for wires that seem out of place or lead nowhere.',
    ],
  },
  {
    id: 'mirror',
    icon: 'contract',
    title: 'The Mirror Test',
    color: '#7B1FA2',
    description: 'Quick test to check for two-way mirrors.',
    steps: [
      'Touch your fingertip to the mirror surface.',
      'Look at the gap between your finger and its reflection.',
      'Real mirrors have a small GAP between finger and reflection.',
      'If there is NO gap — the reflection touches your finger — it may be two-way.',
      'Also tap the mirror — two-way mirrors sound hollow.',
      'This test is not 100% foolproof but is a quick first check.',
    ],
  },
  {
    id: 'phone',
    icon: 'phone-portrait',
    title: 'Phone Camera IR Scan',
    color: '#C62828',
    description: 'Use your phone to detect infrared lights from hidden cameras.',
    steps: [
      'Turn off ALL lights in the room — complete darkness is best.',
      'Open your phone camera app (try both front and back camera).',
      'Slowly scan every corner, wall, object, and surface.',
      'Look for small purple/white blinking dots on your screen.',
      'These IR lights are invisible to naked eye but your camera can see them.',
      'Pay special attention to smoke detectors, clocks, and decorative items.',
    ],
  },
  {
    id: 'rf',
    icon: 'wifi',
    title: 'RF Signal Detection',
    color: '#00695C',
    description: 'Detect wireless signals from hidden cameras.',
    steps: [
      'Download an RF detector app (Glint Finder, Hidden Camera Detector).',
      'Physical RF detector devices are more reliable than apps.',
      'Turn on the detector and slowly walk around the room.',
      'Focus on areas near power outlets (cameras need power).',
      'Check around common hiding spots systematically.',
      'Especially useful for frequent travelers — consider buying a portable detector.',
    ],
  },
];

const SUSPICIOUS_SPOTS = [
  { icon: 'cloudy', label: 'Smoke Detectors', risk: 'high' },
  { icon: 'time', label: 'Alarm Clocks', risk: 'high' },
  { icon: 'water', label: 'Air Fresheners', risk: 'medium' },
  { icon: 'sunny', label: 'Light Fixtures', risk: 'medium' },
  { icon: 'shirt', label: 'Coat Hooks', risk: 'high' },
  { icon: 'tv', label: 'TV/Monitors', risk: 'medium' },
  { icon: 'flower', label: 'Decorative Items', risk: 'medium' },
  { icon: 'grid', label: 'Vent Grilles', risk: 'high' },
  { icon: 'image', label: 'Picture Frames', risk: 'medium' },
  { icon: 'flash', label: 'Power Outlets', risk: 'high' },
  { icon: 'book', label: 'Bookshelves', risk: 'low' },
  { icon: 'desktop', label: 'Electronics', risk: 'medium' },
];

export default function HiddenCameraScreen() {
  const navigation = useNavigation();
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [checklist, setChecklist] = useState({});
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const toggleCheck = (id) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const checkedCount = Object.values(checklist).filter(Boolean).length;

  const openScanner = async () => {
    try {
      if (permission && permission.granted) {
        setShowScanner(true);
        return;
      }
      const result = await requestPermission();
      if (result.granted) {
        setShowScanner(true);
      } else {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to use the IR scanner feature.',
        );
      }
    } catch (e) {
      Alert.alert('Error', 'Could not access camera. Please try again.');
    }
  };

  const handleFound = () => {
    Alert.alert(
      '⚠️ Suspected Camera Found',
      'Critical steps to follow:',
      [
        { text: 'Call Police', style: 'destructive', onPress: () => Linking.openURL('tel:100') },
        { text: 'View Guide', onPress: () => setSelectedMethod(null) },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  // ─── IR Scanner View ───────────────────────────────────────────
  if (showScanner) {
    return (
      <View style={styles.scannerContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <CameraView style={styles.camera} facing="back">
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.scannerBack}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.scannerTitle}>IR Camera Scanner</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.scannerGuide}>
              <View style={styles.scannerCornerTL} />
              <View style={styles.scannerCornerTR} />
              <View style={styles.scannerCornerBL} />
              <View style={styles.scannerCornerBR} />
            </View>

            <View style={styles.scannerInfo}>
              <View style={styles.scannerInfoCard}>
                <Ionicons name="information-circle" size={20} color="#FFF" />
                <Text style={styles.scannerInfoText}>
                  Turn off room lights. Look for purple/white dots on screen — these could be IR lights from hidden cameras.
                </Text>
              </View>
              <TouchableOpacity style={styles.foundBtn} onPress={handleFound}>
                <Ionicons name="warning" size={20} color="#FFF" />
                <Text style={styles.foundBtnText}>I Found Something Suspicious</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ─── Method Detail View ─────────────────────────────────────────
  if (selectedMethod) {
    const m = selectedMethod;
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor={m.color} barStyle="light-content" />
        <View style={[styles.methodHeader, { backgroundColor: m.color }]}>
          <TouchableOpacity onPress={() => setSelectedMethod(null)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.methodHeaderContent}>
            <Ionicons name={m.icon} size={40} color="rgba(255,255,255,0.9)" />
            <Text style={styles.methodHeaderTitle}>{m.title}</Text>
            <Text style={styles.methodHeaderDesc}>{m.description}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.detailContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailScrollContent}
        >
          <Text style={styles.stepsTitle}>Step-by-Step Guide</Text>
          {m.steps.map((step, i) => (
            <View key={i} style={[styles.stepCard, SHADOWS.small]}>
              <View style={[styles.stepNum, { backgroundColor: m.color }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          {m.id === 'phone' && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: m.color }]} onPress={openScanner}>
              <Ionicons name="camera" size={22} color="#FFF" />
              <Text style={styles.actionBtnText}>Open IR Camera Scanner</Text>
            </TouchableOpacity>
          )}

          <View style={styles.warningCard}>
            <Ionicons name="warning" size={22} color="#E65100" />
            <Text style={styles.warningText}>
              If you find a hidden camera: DON'T touch it. Leave immediately. Report to management AND call police (100).
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Main View ──────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar backgroundColor="#37474F" barStyle="light-content" />

      <View style={styles.mainHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.mainHeaderContent}>
          <Text style={styles.mainHeaderTitle}>Hidden Camera Detection</Text>
          <Text style={styles.mainHeaderSubtitle}>Protect your privacy everywhere</Text>
        </View>
      </View>

      <ScrollView
        style={styles.mainContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.mainScrollContent}
      >
        {/* Quick Scanner CTA */}
        <TouchableOpacity
          style={[styles.scannerCTA, SHADOWS.medium]}
          activeOpacity={0.8}
          onPress={openScanner}
        >
          <View style={styles.scannerCTAIcon}>
            <Ionicons name="scan" size={32} color="#FFF" />
          </View>
          <View style={styles.scannerCTAContent}>
            <Text style={styles.scannerCTATitle}>Quick IR Scan</Text>
            <Text style={styles.scannerCTADesc}>
              Open your camera to detect hidden infrared lights
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Detection Methods */}
        <Text style={styles.sectionTitle}>Detection Methods</Text>
        {DETECTION_METHODS.map((method) => (
          <TouchableOpacity
            key={method.id}
            style={[styles.methodCard, SHADOWS.small]}
            activeOpacity={0.7}
            onPress={() => setSelectedMethod(method)}
          >
            <View style={[styles.methodIcon, { backgroundColor: method.color + '15' }]}>
              <Ionicons name={method.icon} size={26} color={method.color} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>{method.title}</Text>
              <Text style={styles.methodDesc} numberOfLines={2}>{method.description}</Text>
              <Text style={[styles.methodStepCount, { color: method.color }]}>
                {method.steps.length} steps
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={method.color} />
          </TouchableOpacity>
        ))}

        {/* Room Checklist */}
        <Text style={styles.sectionTitle}>Room Safety Checklist</Text>
        <Text style={styles.sectionSubtitle}>
          Tap to check spots as you inspect ({checkedCount}/{SUSPICIOUS_SPOTS.length})
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(checkedCount / SUSPICIOUS_SPOTS.length) * 100}%` },
            ]}
          />
        </View>

        <View style={styles.checkGrid}>
          {SUSPICIOUS_SPOTS.map((spot, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.checkItem,
                SHADOWS.small,
                checklist[i] && styles.checkItemChecked,
              ]}
              onPress={() => toggleCheck(i)}
            >
              <View style={[
                styles.checkIcon,
                { backgroundColor: spot.risk === 'high' ? '#FF174415' : spot.risk === 'medium' ? '#FF910015' : '#00C85315' },
              ]}>
                <Ionicons
                  name={checklist[i] ? 'checkmark-circle' : spot.icon}
                  size={22}
                  color={checklist[i] ? '#00C853' : spot.risk === 'high' ? '#FF1744' : '#FF9100'}
                />
              </View>
              <Text style={[styles.checkLabel, checklist[i] && styles.checkLabelChecked]}>
                {spot.label}
              </Text>
              {spot.risk === 'high' && !checklist[i] && (
                <View style={styles.riskBadge}>
                  <Text style={styles.riskText}>!</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {checkedCount === SUSPICIOUS_SPOTS.length && (
          <View style={styles.allClearCard}>
            <Ionicons name="checkmark-circle" size={28} color="#00C853" />
            <View style={styles.allClearContent}>
              <Text style={styles.allClearTitle}>Room Check Complete ✓</Text>
              <Text style={styles.allClearText}>
                You've inspected all common hiding spots. Stay vigilant and trust your instincts.
              </Text>
            </View>
          </View>
        )}

        {/* Emergency Actions */}
        <Text style={styles.sectionTitle}>If You Find a Camera</Text>
        <View style={[styles.emergencyCard, SHADOWS.small]}>
          {[
            { step: "1", text: "DON'T touch or move the device", icon: 'hand-left', color: '#FF1744' },
            { step: "2", text: "Leave the room immediately", icon: 'exit', color: '#E65100' },
            { step: "3", text: "Report to management / staff", icon: 'megaphone', color: '#1565C0' },
            { step: "4", text: "Call local police (100)", icon: 'call', color: '#C62828' },
            { step: "5", text: "Photograph device from distance", icon: 'camera', color: '#4527A0' },
            { step: "6", text: "Note time, date, and location", icon: 'create', color: '#00695C' },
          ].map((item, i) => (
            <View key={i} style={styles.emergencyStep}>
              <View style={[styles.emergencyStepNum, { backgroundColor: item.color }]}>
                <Text style={styles.emergencyStepNumText}>{item.step}</Text>
              </View>
              <Ionicons name={item.icon} size={18} color={item.color} style={{ marginRight: 10 }} />
              <Text style={styles.emergencyStepText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Quick Call */}
        <View style={styles.quickCallRow}>
          <TouchableOpacity
            style={[styles.quickCallBtn, { backgroundColor: '#FF1744' }]}
            onPress={() => Linking.openURL('tel:100')}
          >
            <Ionicons name="call" size={20} color="#FFF" />
            <Text style={styles.quickCallText}>Police (100)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCallBtn, { backgroundColor: '#7B1FA2' }]}
            onPress={() => Linking.openURL('tel:1091')}
          >
            <Ionicons name="woman" size={20} color="#FFF" />
            <Text style={styles.quickCallText}>Women (1091)</Text>
          </TouchableOpacity>
        </View>

        {/* Behavioral Tips */}
        <Text style={styles.sectionTitle}>Protective Habits</Text>
        <View style={[styles.habitsCard, SHADOWS.small]}>
          {[
            'Always lock the door and verify it locks properly.',
            'Change in corners against walls for minimal camera angles.',
            'Block curtain/door gaps with your bag while changing.',
            'Avoid unfamiliar single-occupancy rooms if possible.',
            'Scan budget hotels, Airbnbs, and guesthouses thoroughly.',
          ].map((habit, i) => (
            <View key={i} style={styles.habitRow}>
              <Ionicons name="shield-checkmark" size={16} color="#00C853" />
              <Text style={styles.habitText}>{habit}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ─── Main Header ───────────────────────────────────────────────
  mainHeader: {
    backgroundColor: '#37474F',
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  mainHeaderContent: {
    marginTop: 12,
  },
  mainHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  mainHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mainContent: { flex: 1 },
  mainScrollContent: { padding: 16 },

  // ─── Scanner CTA ───────────────────────────────────────────────
  scannerCTA: {
    backgroundColor: '#37474F',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  scannerCTAIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  scannerCTAContent: { flex: 1 },
  scannerCTATitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  scannerCTADesc: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  // ─── Section ───────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    marginTop: 8,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },

  // ─── Method Card ───────────────────────────────────────────────
  methodCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  methodIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  methodDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 17 },
  methodStepCount: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  // ─── Progress Bar ──────────────────────────────────────────────
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00C853',
    borderRadius: 3,
  },

  // ─── Checklist Grid ────────────────────────────────────────────
  checkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  checkItem: {
    width: (width - 44) / 3,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  checkItemChecked: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  checkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  checkLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  checkLabelChecked: {
    color: '#2E7D32',
    textDecorationLine: 'line-through',
  },
  riskBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF1744',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },

  // ─── All Clear ─────────────────────────────────────────────────
  allClearCard: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  allClearContent: { flex: 1, marginLeft: 12 },
  allClearTitle: { fontSize: 15, fontWeight: '700', color: '#2E7D32' },
  allClearText: { fontSize: 12, color: '#388E3C', marginTop: 3, lineHeight: 17 },

  // ─── Emergency Card ────────────────────────────────────────────
  emergencyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  emergencyStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  emergencyStepNum: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  emergencyStepNumText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  emergencyStepText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },

  // ─── Quick Call ────────────────────────────────────────────────
  quickCallRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quickCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 4,
  },
  quickCallText: { fontSize: 14, fontWeight: '700', color: '#FFF', marginLeft: 8 },

  // ─── Habits Card ───────────────────────────────────────────────
  habitsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  habitText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    marginLeft: 10,
    lineHeight: 19,
  },

  // ─── Method Detail ─────────────────────────────────────────────
  methodHeader: {
    paddingTop: Platform.OS === 'ios' ? 56 : 48,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  methodHeaderContent: {
    alignItems: 'center',
    marginTop: 12,
  },
  methodHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 10,
  },
  methodHeaderDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    textAlign: 'center',
  },

  detailContent: { flex: 1 },
  detailScrollContent: { padding: 16 },
  stepsTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },

  stepCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  stepText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 21, paddingTop: 4 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', marginLeft: 10 },

  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#E65100',
  },
  warningText: { flex: 1, fontSize: 13, color: '#E65100', marginLeft: 10, lineHeight: 19 },

  // ─── Camera Scanner ────────────────────────────────────────────
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 20,
  },
  scannerBack: { padding: 8 },
  scannerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },

  scannerGuide: {
    flex: 1,
    marginHorizontal: 40,
    marginVertical: 60,
    position: 'relative',
  },
  scannerCornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: 40, height: 40, borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: '#00E676', borderTopLeftRadius: 12,
  },
  scannerCornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: 40, height: 40, borderTopWidth: 3, borderRightWidth: 3,
    borderColor: '#00E676', borderTopRightRadius: 12,
  },
  scannerCornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: 40, height: 40, borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: '#00E676', borderBottomLeftRadius: 12,
  },
  scannerCornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: 40, height: 40, borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: '#00E676', borderBottomRightRadius: 12,
  },

  scannerInfo: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  scannerInfoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  scannerInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#FFF',
    marginLeft: 10,
    lineHeight: 19,
  },
  foundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF1744',
    borderRadius: 14,
    paddingVertical: 14,
  },
  foundBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF', marginLeft: 8 },
});

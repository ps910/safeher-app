/**
 * HomeScreen v7.0 — Premium Safety Dashboard
 *
 * Design goals:
 *   • All background services (shake / scream / siren / recording) live
 *     in EmergencyContext — this screen is *only* presentation.
 *   • Dark-luxury aesthetic, consistent with AuthScreen v7.
 *   • Single-tap SOS with confirm countdown (5s) + long-press = instant.
 *   • Live status surface so the user trusts what's running.
 *   • Stealth calculator preserved as duress UI.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Alert, Animated, Dimensions, StatusBar, Platform, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import {
  makePhoneCall,
  getLocalEmergencyNumbers,
  vibrateEmergency,
} from '../utils/helpers';

// ──────────────────────────────────────────────────────────────
//  DESIGN TOKENS — Dark Luxury (matches AuthScreen v7)
// ──────────────────────────────────────────────────────────────
const C = {
  bg:           '#07070B',
  bgGradient:   '#0E0E18',
  surface:      'rgba(255,255,255,0.03)',
  card:         'rgba(30,30,42,0.65)',
  border:       'rgba(255,255,255,0.06)',
  borderActive: 'rgba(255,42,112,0.4)',
  primary:      '#FF2A70',
  primaryDark:  '#D81B60',
  accent:       '#FF8FAB',
  white:        '#FFFFFF',
  text:         '#F0F0F8',
  textSub:      '#8B8C9E',
  textHint:     '#5C5D72',
  danger:       '#FF1744',
  warning:      '#FFB300',
  success:      '#00E676',
  info:         '#7C4DFF',
};

const { width: W } = Dimensions.get('window');
const SOS_COUNTDOWN_DEFAULT = 5;

// ──────────────────────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const EMERGENCY_NUMBERS = useMemo(() => getLocalEmergencyNumbers(), []);

  const {
    emergencyContacts, settings, isSOSActive,
    triggerSOS, cancelSOS,
    currentLocation, setCurrentLocation,
    sirenActive, isRecording,
    stealthMode, checkIn,
    isLiveTracking, isBackgroundTracking,
    checkInOverdue, lastCheckIn,
    activeJourney, journeyOverdue,
    isScreamDetecting,
  } = useEmergency();

  // ─── Local UI state ────────────────────────────────────────
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);

  // ─── Animations ────────────────────────────────────────────
  const sosPulse = useRef(new Animated.Value(1)).current;
  const sosRing  = useRef(new Animated.Value(0)).current;
  const sosGlow  = useRef(new Animated.Value(0.4)).current;
  const fadeIn   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.06, duration: 1400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(sosPulse, { toValue: 1,    duration: 1400, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosRing, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(sosRing, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosGlow, { toValue: 0.9, duration: 1500, useNativeDriver: true }),
        Animated.timing(sosGlow, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  // ─── Initial location fetch ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCurrentLocation(loc);
      } catch {}
    })();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ─── Overdue check-in alert (presentation only — context handles logic) ──
  useEffect(() => {
    if (checkInOverdue && settings.inactivitySOSEnabled && !isSOSActive) {
      Alert.alert(
        'Check-In Required',
        "You haven't checked in recently. Are you safe?",
        [
          { text: "I'm Safe ✓", onPress: checkIn },
          { text: '🆘 Send SOS', style: 'destructive', onPress: () => executeFullSOS() },
        ],
        { cancelable: false },
      );
    }
  }, [checkInOverdue]);

  useEffect(() => {
    if (journeyOverdue && activeJourney && !isSOSActive) {
      Alert.alert(
        'Journey Overdue',
        `You haven't arrived at "${activeJourney.destination}" on time.`,
        [
          { text: 'I Arrived',   onPress: () => navigation.navigate('JourneyTracker') },
          { text: '🆘 Send SOS', style: 'destructive', onPress: () => executeFullSOS() },
        ],
      );
    }
  }, [journeyOverdue]);

  // ─── SOS countdown (5s pre-trigger window so accidental taps cancel) ──
  const startSOSCountdown = useCallback(() => {
    if (isSOSActive || countdown !== null) return;
    if (emergencyContacts.length === 0) {
      Alert.alert(
        'No Emergency Contacts',
        'Add at least one trusted contact before triggering SOS.',
        [
          { text: 'Add Contact', onPress: () => navigation.navigate('Contacts') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    const secs = settings.countdownSeconds || SOS_COUNTDOWN_DEFAULT;
    setCountdown(secs);
    vibrateEmergency();

    let remaining = secs;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
        executeFullSOS();
      } else {
        setCountdown(remaining);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }, 1000);
  }, [isSOSActive, countdown, settings, emergencyContacts.length]);

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const executeFullSOS = useCallback(() => {
    Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true);
    triggerSOS();
  }, [triggerSOS]);

  const stopSOS = useCallback(() => {
    Vibration.cancel();
    cancelSOS();
  }, [cancelSOS]);

  // ─── Stealth Calculator (duress UI) ─────────────────────────
  if (stealthMode) return <StealthCalculator onTriggerSOS={executeFullSOS} />;

  // ─── Quick actions ───────────────────────────────────────────
  const quickActions = useMemo(() => [
    { icon: 'call',           label: 'Police',      sub: EMERGENCY_NUMBERS.police,       color: C.danger,  onPress: () => makePhoneCall(EMERGENCY_NUMBERS.police) },
    { icon: 'medical',        label: 'Ambulance',   sub: EMERGENCY_NUMBERS.ambulance,    color: '#FF6D00', onPress: () => makePhoneCall(EMERGENCY_NUMBERS.ambulance) },
    { icon: 'woman',          label: 'Women Help',  sub: EMERGENCY_NUMBERS.womenHelpline, color: C.info,    onPress: () => makePhoneCall(EMERGENCY_NUMBERS.womenHelpline) },
    { icon: 'call-outline',   label: 'Fake Call',   sub: 'Decoy',                        color: C.success, onPress: () => navigation.navigate('FakeCall') },
  ], [EMERGENCY_NUMBERS, navigation]);

  const tools = useMemo(() => [
    { icon: 'navigate',         label: 'Journey',       color: '#1565C0', screen: 'JourneyTracker' },
    { icon: 'document-text',    label: 'Report',        color: '#4E342E', screen: 'IncidentReport' },
    { icon: 'eye-off',          label: 'Hidden Cam',    color: '#37474F', screen: 'HiddenCamera' },
    { icon: 'lock-closed',      label: 'Vault',         color: '#455A64', screen: 'EvidenceVault' },
    { icon: 'locate',           label: 'Guardian',      color: '#00838F', screen: 'GuardianMode' },
    { icon: 'shield-half',      label: 'Self Defense',  color: '#2962FF', screen: 'SelfDefense' },
    { icon: 'navigate-outline', label: 'Nearby Help',   color: '#00C853', screen: 'NearbyHelp' },
    { icon: 'person-circle',    label: 'Profile',       color: '#6200EA', screen: 'Profile' },
  ], []);

  const timeSinceCheckIn = Math.floor((Date.now() - lastCheckIn.getTime()) / 60_000);

  const ringScale   = sosRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = sosRing.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.2, 0] });
  const glowScale   = sosGlow.interpolate({ inputRange: [0.4, 0.9], outputRange: [1, 1.15] });

  return (
    <View style={[styles.root, isSOSActive && styles.rootDanger]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <Animated.ScrollView
        style={{ opacity: fadeIn }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── HEADER ─── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Stay safe,</Text>
            <Text style={styles.appName}>SafeHer</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Open Settings"
          >
            <Ionicons name="settings-outline" size={20} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* ─── ACTIVE JOURNEY BANNER ─── */}
        {activeJourney && (
          <TouchableOpacity
            style={[styles.banner, journeyOverdue && styles.bannerDanger]}
            onPress={() => navigation.navigate('JourneyTracker')}
            activeOpacity={0.85}
          >
            <View style={[styles.bannerIcon, { backgroundColor: journeyOverdue ? '#FF174422' : '#1565C022' }]}>
              <Ionicons name="navigate" size={18} color={journeyOverdue ? C.danger : '#1565C0'} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.bannerTitle, journeyOverdue && { color: C.danger }]}>
                {journeyOverdue ? 'Journey Overdue!' : 'Journey Active'}
              </Text>
              <Text style={styles.bannerSub} numberOfLines={1}>
                → {activeJourney.destination} • ETA {new Date(activeJourney.expectedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textHint} />
          </TouchableOpacity>
        )}

        {/* ─── PROTECTION STATUS ─── */}
        <View style={[styles.statusCard, isSOSActive && styles.statusCardDanger]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: isSOSActive ? '#FF174422' : '#00E67622' }]}>
              <Ionicons
                name={isSOSActive ? 'warning' : 'shield-checkmark'}
                size={22}
                color={isSOSActive ? C.danger : C.success}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[styles.statusTitle, isSOSActive && { color: C.danger }]}>
                {isSOSActive ? 'EMERGENCY ACTIVE' : 'Protection On'}
              </Text>
              <Text style={styles.statusSub}>
                {isSOSActive
                  ? `Live tracking ${isLiveTracking ? '✓' : '·'}  Recording ${isRecording ? '✓' : '·'}  Siren ${sirenActive ? '✓' : '·'}`
                  : `${emergencyContacts.length} contact${emergencyContacts.length !== 1 ? 's' : ''} • All systems ready`}
              </Text>
            </View>
          </View>

          {/* Feature pills */}
          <View style={styles.pills}>
            {settings.shakeToSOS               && <Pill icon="phone-portrait-outline" label="Shake" />}
            {settings.sirenEnabled              && <Pill icon="volume-high-outline"     label="Siren" active={sirenActive} />}
            {settings.autoRecordAudio           && <Pill icon="mic-outline"              label="Record" active={isRecording} />}
            {settings.screamDetection           && <Pill icon="ear-outline"              label="AI Sound" active={isScreamDetecting} activeColor={C.success} />}
            {settings.inactivitySOSEnabled      && <Pill icon="timer-outline"            label="Check-in" />}
            {settings.backgroundLocationEnabled && <Pill icon="locate-outline"           label="BG Loc" active={isBackgroundTracking} activeColor={C.success} />}
          </View>
        </View>

        {/* ─── CHECK-IN BUTTON ─── */}
        {settings.inactivitySOSEnabled && !isSOSActive && (
          <TouchableOpacity
            style={[styles.checkIn, checkInOverdue && styles.checkInOverdue]}
            onPress={() => {
              checkIn();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            activeOpacity={0.85}
            accessibilityLabel="Tap to check in safe"
          >
            <View style={[styles.checkInIcon, { backgroundColor: checkInOverdue ? '#FF174422' : '#00E67622' }]}>
              <Ionicons name="checkmark-circle" size={22} color={checkInOverdue ? C.danger : C.success} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.checkInTitle, checkInOverdue && { color: C.danger }]}>
                {checkInOverdue ? 'Check-In Overdue!' : 'Tap to Check In'}
              </Text>
              <Text style={styles.checkInSub}>
                {timeSinceCheckIn < 1 ? 'Just now' : `${timeSinceCheckIn}m ago`} • Timer: {settings.inactivityTimeout}min
              </Text>
            </View>
            <View style={[styles.checkInBtn, checkInOverdue && { backgroundColor: C.danger }]}>
              <Ionicons name="checkmark" size={14} color={C.white} />
              <Text style={styles.checkInBtnText}>SAFE</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ─── SOS BUTTON ─── */}
        <View style={styles.sosWrap}>
          {countdown !== null ? (
            <View style={styles.countdownWrap} accessibilityLabel={`SOS in ${countdown} seconds`}>
              <Text style={styles.countdownLabel}>SOS ACTIVATING IN</Text>
              <View style={styles.countdownCircle}>
                <Text style={styles.countdownNum}>{countdown}</Text>
              </View>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={cancelCountdown}
                activeOpacity={0.85}
                accessibilityLabel="Cancel SOS countdown"
              >
                <Ionicons name="close" size={16} color={C.white} />
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          ) : isSOSActive ? (
            <TouchableOpacity
              style={styles.stopSOS}
              onPress={stopSOS}
              activeOpacity={0.85}
              accessibilityLabel="Stop emergency"
            >
              <Ionicons name="stop-circle" size={48} color={C.white} />
              <Text style={styles.stopSOSText}>STOP SOS</Text>
              <Text style={styles.stopSOSSub}>Tap to cancel emergency</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.sosButtonGroup}>
              <Animated.View style={[styles.sosRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
              <Animated.View style={[styles.sosGlow, { opacity: sosGlow, transform: [{ scale: glowScale }] }]} />
              <Animated.View style={{ transform: [{ scale: sosPulse }] }}>
                <TouchableOpacity
                  style={styles.sosButton}
                  onPress={startSOSCountdown}
                  onLongPress={executeFullSOS}
                  delayLongPress={500}
                  activeOpacity={0.85}
                  accessibilityLabel="SOS Emergency. Tap to start countdown, hold to trigger immediately."
                  accessibilityRole="button"
                >
                  <Ionicons name="alert-circle" size={56} color={C.white} />
                  <Text style={styles.sosText}>SOS</Text>
                  <Text style={styles.sosSub}>Tap • Hold for instant</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </View>

        {/* ─── EMERGENCY HELPLINES ─── */}
        <Text style={styles.sectionTitle}>Emergency Helplines</Text>
        <View style={styles.quickRow}>
          {quickActions.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); q.onPress(); }}
              activeOpacity={0.85}
              accessibilityLabel={`Call ${q.label}, ${q.sub}`}
            >
              <View style={[styles.quickIcon, { backgroundColor: `${q.color}22` }]}>
                <Ionicons name={q.icon} size={22} color={q.color} />
              </View>
              <Text style={styles.quickLabel}>{q.label}</Text>
              <Text style={styles.quickSub}>{q.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── SAFETY TOOLS ─── */}
        <Text style={styles.sectionTitle}>Safety Tools</Text>
        <View style={styles.toolGrid}>
          {tools.map((t) => (
            <TouchableOpacity
              key={t.screen}
              style={styles.toolBtn}
              onPress={() => navigation.navigate(t.screen)}
              activeOpacity={0.85}
              accessibilityLabel={t.label}
            >
              <View style={[styles.toolIcon, { backgroundColor: `${t.color}22` }]}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
              <Text style={styles.toolLabel}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 24 }} />
      </Animated.ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
//  PILL
// ──────────────────────────────────────────────────────────────
function Pill({ icon, label, active, activeColor }) {
  const color = active ? (activeColor || C.primary) : C.textSub;
  const bg    = active ? `${color}1A` : 'rgba(255,255,255,0.04)';
  return (
    <View style={[styles.pill, { borderColor: active ? color : C.border, backgroundColor: bg }]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
//  STEALTH CALCULATOR — duress UI
// ──────────────────────────────────────────────────────────────
function StealthCalculator({ onTriggerSOS }) {
  const SECRET = '112';
  const [display, setDisplay] = useState('0');
  const [secret,  setSecret]  = useState('');

  const safeEval = (expr) => {
    try {
      const sanitized = expr.replace(/[÷]/g, '/').replace(/[×]/g, '*');
      if (!/^[0-9+\-*/().% ]+$/.test(sanitized)) return 'Error';
      const result = new Function(`return (${sanitized})`)();
      if (!isFinite(result)) return 'Error';
      return String(result);
    } catch { return 'Error'; }
  };

  const press = (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (val === 'C') { setDisplay('0'); setSecret(''); return; }
    if (val === '=') {
      if (secret === SECRET) { setDisplay('HELP'); onTriggerSOS(); return; }
      setDisplay(safeEval(display)); setSecret(''); return;
    }
    setDisplay(display === '0' || display === 'Error' || display === 'HELP' ? val : display + val);
    if (/[0-9]/.test(val)) setSecret(secret + val); else setSecret('');
  };

  const rows = [['7','8','9','÷'],['4','5','6','×'],['1','2','3','-'],['C','0','=','+']];

  return (
    <View style={styles.calc}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.calcDisplay}>
        <Text style={styles.calcText} numberOfLines={1}>{display}</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.calcRow}>
          {row.map((b) => (
            <TouchableOpacity
              key={b}
              style={[
                styles.calcBtn,
                /[÷×\-+]/.test(b) && styles.calcOp,
                b === '=' && styles.calcEq,
                b === 'C' && styles.calcClr,
              ]}
              onPress={() => press(b)}
              activeOpacity={0.7}
            >
              <Text style={[styles.calcBtnText, /[÷×\-+]/.test(b) && { color: C.primary }]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
//  STYLES
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  rootDanger: { backgroundColor: '#1A0008' },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 80 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  greeting: { fontSize: 13, color: C.textSub, fontWeight: '500', letterSpacing: 0.3 },
  appName:  { fontSize: 30, color: C.white, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 14,
  },
  bannerDanger: { borderColor: 'rgba(255,23,68,0.4)', backgroundColor: 'rgba(255,23,68,0.08)' },
  bannerIcon:   { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bannerTitle:  { fontSize: 13, fontWeight: '800', color: C.text },
  bannerSub:    { fontSize: 11, color: C.textSub, marginTop: 2 },

  statusCard: {
    backgroundColor: C.card, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12,
  },
  statusCardDanger: { borderColor: 'rgba(255,23,68,0.5)' },
  statusRow:        { flexDirection: 'row', alignItems: 'center' },
  statusIcon:       { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle:      { fontSize: 15, fontWeight: '800', color: C.success, letterSpacing: 0.3 },
  statusSub:        { fontSize: 12, color: C.textSub, marginTop: 3 },

  pills:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1, gap: 4,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  checkIn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: C.border, marginBottom: 14,
  },
  checkInOverdue: { borderColor: 'rgba(255,23,68,0.5)' },
  checkInIcon:    { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  checkInTitle:   { fontSize: 13, fontWeight: '800', color: C.text },
  checkInSub:     { fontSize: 11, color: C.textSub, marginTop: 2 },
  checkInBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.success, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  checkInBtnText: { fontSize: 11, fontWeight: '900', color: C.white, letterSpacing: 0.5 },

  // SOS
  sosWrap:        { alignItems: 'center', marginVertical: 22, height: 240 },
  sosButtonGroup: { alignItems: 'center', justifyContent: 'center' },
  sosRing: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 3, borderColor: C.primary,
  },
  sosGlow: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: C.primary,
    shadowColor: C.primary, shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  sosButton: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 18,
    shadowColor: C.primary, shadowOpacity: 0.7, shadowRadius: 30, shadowOffset: { width: 0, height: 8 },
  },
  sosText: { fontSize: 36, fontWeight: '900', color: C.white, letterSpacing: 4, marginTop: 4 },
  sosSub:  { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 4 },

  countdownWrap:   { alignItems: 'center', justifyContent: 'center' },
  countdownLabel:  { fontSize: 12, color: C.textSub, fontWeight: '800', letterSpacing: 2, marginBottom: 16 },
  countdownCircle: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center',
    elevation: 18, shadowColor: C.danger, shadowOpacity: 0.7, shadowRadius: 30,
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.15)',
  },
  countdownNum: { fontSize: 100, fontWeight: '900', color: C.white },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 14,
    borderWidth: 2, borderColor: C.border, marginTop: 22,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '900', color: C.white, letterSpacing: 1.5 },

  stopSOS: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#444', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: C.danger,
  },
  stopSOSText: { fontSize: 22, fontWeight: '900', color: C.white, marginTop: 4, letterSpacing: 1.5 },
  stopSOSSub:  { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 4 },

  // Sections
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: C.textSub, letterSpacing: 1.5,
    marginTop: 8, marginBottom: 12, textTransform: 'uppercase',
  },

  // Quick row
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 22 },
  quickBtn: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  quickIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  quickLabel: { fontSize: 11, fontWeight: '800', color: C.text, textAlign: 'center' },
  quickSub:   { fontSize: 9,  color: C.textHint, marginTop: 2 },

  // Tool grid
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolBtn: {
    width: (W - 60) / 4, alignItems: 'center',
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6,
    borderWidth: 1, borderColor: C.border,
  },
  toolIcon:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  toolLabel: { fontSize: 10, fontWeight: '700', color: C.text, textAlign: 'center' },

  // Calculator
  calc: {
    flex: 1, backgroundColor: '#000',
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingHorizontal: 12,
  },
  calcDisplay: {
    backgroundColor: '#0A0A0A', borderRadius: 14,
    padding: 22, marginBottom: 14, alignItems: 'flex-end',
    minHeight: 100, justifyContent: 'center',
  },
  calcText:    { color: C.white, fontSize: 56, fontWeight: '300' },
  calcRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  calcBtn: {
    flex: 1, aspectRatio: 1.1, backgroundColor: '#1C1C1E',
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  calcOp:      { backgroundColor: '#2C2C2E' },
  calcEq:      { backgroundColor: C.primary },
  calcClr:     { backgroundColor: '#A6A6A6' },
  calcBtnText: { color: C.white, fontSize: 28, fontWeight: '500' },
});

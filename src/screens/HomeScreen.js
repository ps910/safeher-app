/**
 * HomeScreen v6.0 — MODERN SAFETY DASHBOARD
 * Features: SOS, Shake-to-SOS, Volume-to-SOS, Siren, Audio Evidence,
 *           Scream Detection, Stealth Calculator, Check-In Timer,
 *           Journey Status, Quick Actions, Global Emergency Helplines
 *
 * v6.0: Global emergency numbers, volume SOS trigger, accessibility,
 *       dark mode support, persistent SOS notification
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Vibration, Alert, Animated, Dimensions, StatusBar, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import { COLORS, SIZES, SHADOWS, useTheme } from '../constants/theme';
import {
  makePhoneCall, sendSMS, sendSOSToContacts,
  getCurrentPosition, vibrateEmergency,
  checkNetworkStatus, sendOfflineSMS,
  getLocalEmergencyNumbers, getLocalDisplayHelplines,
  handleVolumePress,
} from '../utils/helpers';
import NotificationService from '../services/NotificationService';

const { width: SCREEN_W } = Dimensions.get('window');
const SOS_COUNTDOWN_DEFAULT = 5;
const BUILD_VERSION = 'v6.0.0 • Build 2026-03-10';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const EMERGENCY_NUMBERS = getLocalEmergencyNumbers();
  const {
    emergencyContacts, settings, sosMessage,
    isSOSActive, triggerSOS, cancelSOS,
    currentLocation, setCurrentLocation,
    sirenActive, setSirenActive,
    isRecording, setIsRecording,
    stealthMode, checkIn,
    liveLocation, isLiveTracking,
    checkInOverdue, lastCheckIn,
    activeJourney, journeyOverdue,
    isScreamDetecting, setIsScreamDetecting,
  } = useEmergency();

  // ─── State ──────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(null);
  const [protectionStatus, setProtectionStatus] = useState('ACTIVE');
  const [recording, setRecording] = useState(null);
  const [soundObj, setSoundObj] = useState(null);
  const [screamMonitor, setScreamMonitor] = useState(null);

  // Stealth calculator state
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcSecret, setCalcSecret] = useState('');

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sosGlow = useRef(new Animated.Value(0)).current;
  const sosRingAnim = useRef(new Animated.Value(0)).current;
  const shakeRef = useRef({ count: 0, lastTime: 0 });
  const countdownRef = useRef(null);
  const screamIntervalRef = useRef(null);

  // ─── Location on mount ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setCurrentLocation(loc);
        }
      } catch (e) {
        console.log('Location error:', e);
      }
    })();
    return () => {
      if (screamMonitor) {
        try { screamMonitor.stopAndUnloadAsync(); } catch (e) {}
      }
      if (screamIntervalRef.current) clearInterval(screamIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ─── Shake Detection ───────────────────────────────────────────
  useEffect(() => {
    if (!settings.shakeToSOS) return;

    Accelerometer.setUpdateInterval(150);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const totalForce = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (totalForce > 2.5) {
        const timeDiff = now - shakeRef.current.lastTime;
        if (timeDiff < 1000) {
          shakeRef.current.count += 1;
        } else {
          shakeRef.current.count = 1;
        }
        shakeRef.current.lastTime = now;

        if (shakeRef.current.count >= 3) {
          shakeRef.current.count = 0;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          startSOSCountdown();
        }
      }
    });

    return () => sub.remove();
  }, [settings.shakeToSOS]);

  // ─── Scream / Loud Sound Detection ─────────────────────────────
  useEffect(() => {
    if (settings.screamDetection && !isScreamDetecting && !isSOSActive) {
      startScreamDetection();
    }
    return () => stopScreamDetection();
  }, [settings.screamDetection, isSOSActive]);

  const startScreamDetection = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setScreamMonitor(rec);
      setIsScreamDetecting(true);

      // Monitor amplitude via recording status polling
      const checkAmplitude = setInterval(async () => {
        try {
          const status = await rec.getStatusAsync();
          if (status.metering && status.metering > -20) {
            clearInterval(checkAmplitude);
            screamIntervalRef.current = null;
            stopScreamDetection();
            Alert.alert(
              'Loud Sound Detected',
              'A loud sound was detected nearby. Activate SOS?',
              [
                { text: 'No, I\'m Safe', style: 'cancel' },
                { text: 'ACTIVATE SOS', style: 'destructive', onPress: () => startSOSCountdown() },
              ],
              { cancelable: true }
            );
          }
        } catch (e) {}
      }, 2000);

      screamIntervalRef.current = checkAmplitude;
    } catch (e) {
      console.log('Scream detection error:', e);
    }
  };

  const stopScreamDetection = () => {
    if (screamIntervalRef.current) {
      clearInterval(screamIntervalRef.current);
      screamIntervalRef.current = null;
    }
    if (screamMonitor) {
      try { screamMonitor.stopAndUnloadAsync().catch(() => {}); } catch (e) {}
      setScreamMonitor(null);
    }
    setIsScreamDetecting(false);
  };

  // ─── SOS Pulse Animation ───────────────────────────────────────
  useEffect(() => {
    if (isSOSActive) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(sosGlow, { toValue: 1, duration: 500, useNativeDriver: false }),
          Animated.timing(sosGlow, { toValue: 0, duration: 500, useNativeDriver: false }),
        ])
      );
      glow.start();
      return () => glow.stop();
    } else {
      sosGlow.setValue(0);
    }
  }, [isSOSActive]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.07, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // SOS ring expand animation
  useEffect(() => {
    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(sosRingAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(sosRingAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    ring.start();
    return () => ring.stop();
  }, []);

  // ─── Check-in Overdue Alert ─────────────────────────────────────
  useEffect(() => {
    if (checkInOverdue && settings.inactivitySOSEnabled) {
      Alert.alert(
        'Check-In Required!',
        'You haven\'t checked in recently. Are you safe?',
        [
          { text: 'I\'m Safe', onPress: () => checkIn() },
          { text: 'Send SOS', style: 'destructive', onPress: () => executeFullSOS() },
        ],
        { cancelable: false }
      );
    }
  }, [checkInOverdue]);

  // ─── Journey Overdue Alert ──────────────────────────────────────
  useEffect(() => {
    if (journeyOverdue && activeJourney) {
      Alert.alert(
        'Journey Overdue!',
        `You haven\'t arrived at "${activeJourney.destination}" on time. Are you safe?`,
        [
          { text: 'I Arrived', onPress: () => navigation.navigate('JourneyTracker') },
          { text: 'Extend 15min', onPress: () => {} },
          { text: 'Send SOS', style: 'destructive', onPress: () => executeFullSOS() },
        ],
        { cancelable: true }
      );
    }
  }, [journeyOverdue]);

  // ─── SOS Countdown ─────────────────────────────────────────────
  const startSOSCountdown = useCallback(() => {
    if (isSOSActive || countdown !== null) return;
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
  }, [isSOSActive, countdown, settings]);

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  };

  // ─── FULL SOS EXECUTION ────────────────────────────────────────
  const executeFullSOS = async () => {
    await triggerSOS();
    Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true);

    let loc = currentLocation;
    try {
      const fresh = await getCurrentPosition();
      if (fresh) { loc = fresh; setCurrentLocation(fresh); }
    } catch (e) {}

    if (settings.sirenEnabled) startSiren();
    if (settings.autoRecordAudio) startEvidenceRecording();

    // Send push notification for SOS
    NotificationService.sendSOSActiveNotification(loc);

    if (emergencyContacts.length > 0) {
      const isOnline = await checkNetworkStatus();

      // Try FCM push notifications first (most reliable)
      if (isOnline) {
        try {
          await NotificationService.sendSOSPushToContacts(emergencyContacts, sosMessage, loc);
        } catch (e) {
          console.log('[SOS] Push notification failed, falling back to SMS:', e);
        }
      }

      // Also send SMS (dual delivery for reliability)
      if (!isOnline && settings.offlineSOS) {
        await sendOfflineSMS(emergencyContacts, sosMessage, loc);
      } else {
        const result = await sendSOSToContacts(emergencyContacts, sosMessage, loc);
        console.log('[SOS] Message send result:', result);
      }
    } else {
      Alert.alert('No Contacts', 'Add emergency contacts to auto-send SOS messages.');
    }

    if (settings.autoCallPolice) {
      setTimeout(() => makePhoneCall(EMERGENCY_NUMBERS.nationalEmergency), 3000);
    }

    setProtectionStatus('SOS ACTIVE — Live Location ON');
  };

  // ─── STOP SOS ──────────────────────────────────────────────────
  const stopSOS = () => {
    cancelSOS();
    Vibration.cancel();
    stopSiren();
    stopEvidenceRecording();
    stopScreamDetection();
    setProtectionStatus('ACTIVE');
  };

  // ─── SIREN ─────────────────────────────────────────────────────
  const startSiren = async () => {
    try {
      setSirenActive(true);
      Vibration.vibrate([0, 800, 200, 800, 200, 800, 200, 800], true);
    } catch (e) {
      console.log('Siren error:', e);
    }
  };

  const stopSiren = async () => {
    setSirenActive(false);
    Vibration.cancel();
    if (soundObj) {
      try { await soundObj.stopAsync(); await soundObj.unloadAsync(); } catch (e) {}
      setSoundObj(null);
    }
  };

  // ─── AUDIO EVIDENCE RECORDING ──────────────────────────────────
  const startEvidenceRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (e) {
      console.log('Recording error:', e);
    }
  };

  const stopEvidenceRecording = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        console.log('Evidence recording saved at:', uri);
        setRecording(null);
        setIsRecording(false);
        if (uri) {
          Alert.alert('Evidence Saved', 'Audio evidence has been recorded and saved locally.');
        }
      } catch (e) {
        console.log('Stop recording error:', e);
      }
    }
  };

  // ─── STEALTH CALCULATOR ────────────────────────────────────────
  const SECRET_CODE = '112';

  const safeCalcEval = (expr) => {
    try {
      // Only allow digits, operators, parentheses, and decimals
      const sanitized = expr.replace(/[÷]/g, '/').replace(/[×]/g, '*');
      if (!/^[0-9+\-*/().% ]+$/.test(sanitized)) return 'Error';
      // Use Function constructor instead of eval for slightly safer evaluation
      const result = new Function(`return (${sanitized})`)();
      if (!isFinite(result)) return 'Error';
      return String(result);
    } catch {
      return 'Error';
    }
  };

  const handleCalcPress = (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (val === 'C') { setCalcDisplay('0'); setCalcSecret(''); return; }
    if (val === '=') {
      if (calcSecret === SECRET_CODE) {
        setCalcDisplay('HELP');
        executeFullSOS();
        return;
      }
      setCalcDisplay(safeCalcEval(calcDisplay));
      setCalcSecret('');
      return;
    }
    if (calcDisplay === '0' || calcDisplay === 'Error' || calcDisplay === 'HELP') {
      setCalcDisplay(val);
    } else {
      setCalcDisplay(calcDisplay + val);
    }
    if (/[0-9]/.test(val)) { setCalcSecret(calcSecret + val); } else { setCalcSecret(''); }
  };

  // ─── STEALTH CALCULATOR UI ─────────────────────────────────────
  if (stealthMode) {
    const calcButtons = [['7','8','9','÷'],['4','5','6','×'],['1','2','3','-'],['C','0','=','+']];
    return (
      <View style={styles.calcContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.calcDisplayBox}>
          <Text style={styles.calcDisplayText} numberOfLines={1}>{calcDisplay}</Text>
        </View>
        <Text style={styles.calcHint}>Type {SECRET_CODE} then = for SOS</Text>
        {calcButtons.map((row, ri) => (
          <View key={ri} style={styles.calcRow}>
            {row.map((btn) => (
              <TouchableOpacity
                key={btn}
                style={[
                  styles.calcBtn,
                  /[÷×\-+]/.test(btn) && styles.calcOpBtn,
                  btn === '=' && styles.calcEqBtn,
                  btn === 'C' && styles.calcClrBtn,
                ]}
                onPress={() => handleCalcPress(btn)}
              >
                <Text style={[styles.calcBtnText, /[÷×\-+]/.test(btn) && styles.calcOpText]}>
                  {btn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  }

  // ─── QUICK ACTIONS ─────────────────────────────────────────────
  const quickActions = [
    { icon: 'call', label: 'Police\n100', color: '#FF1744', onPress: () => makePhoneCall(EMERGENCY_NUMBERS.police) },
    { icon: 'medical', label: 'Ambulance\n108', color: '#FF6D00', onPress: () => makePhoneCall(EMERGENCY_NUMBERS.ambulance) },
    { icon: 'woman', label: 'Women\nHelpline', color: '#AA00FF', onPress: () => makePhoneCall(EMERGENCY_NUMBERS.womenHelpline) },
    { icon: 'call-outline', label: 'Fake\nCall', color: '#00BFA5', onPress: () => navigation.navigate('FakeCall') },
    { icon: 'navigate', label: 'Journey\nTracker', color: '#1565C0', onPress: () => navigation.navigate('JourneyTracker') },
    { icon: 'document-text', label: 'Incident\nReport', color: '#4E342E', onPress: () => navigation.navigate('IncidentReport') },
    { icon: 'eye-off', label: 'Hidden\nCamera', color: '#37474F', onPress: () => navigation.navigate('HiddenCamera') },
    { icon: 'lock-closed', label: 'Evidence\nVault', color: '#455A64', onPress: () => navigation.navigate('EvidenceVault') },
    { icon: 'locate', label: 'Guardian\nMode', color: '#00838F', onPress: () => navigation.navigate('GuardianMode') },
    { icon: 'shield-half', label: 'Self\nDefense', color: '#2962FF', onPress: () => navigation.navigate('SelfDefense') },
    { icon: 'navigate-outline', label: 'Nearby\nHelp', color: '#00C853', onPress: () => navigation.navigate('NearbyHelp') },
    { icon: 'person-circle', label: 'Safety\nProfile', color: '#6200EA', onPress: () => navigation.navigate('Profile') },
  ];

  // ─── MAIN RENDER ───────────────────────────────────────────────
  const sosBackground = isSOSActive
    ? sosGlow.interpolate({ inputRange: [0, 1], outputRange: ['#1a0000', '#4a0000'] })
    : COLORS.background;

  const timeSinceCheckIn = Math.floor((Date.now() - lastCheckIn.getTime()) / 1000 / 60);

  // SOS ring animation interpolations
  const ringScale = sosRingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = sosRingAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 0.15, 0] });

  return (
    <Animated.View style={[styles.container, { backgroundColor: sosBackground }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>SafeHer</Text>
              <Text style={styles.appSubtitle}>Your Protection Shield</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
              <View style={styles.settingsIcon}>
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Journey Active Banner ──────────────────── */}
        {activeJourney && (
          <TouchableOpacity
            style={[styles.journeyBanner, journeyOverdue && styles.journeyBannerOverdue]}
            onPress={() => navigation.navigate('JourneyTracker')}
            activeOpacity={0.8}
          >
            <View style={[styles.journeyIconWrap, journeyOverdue && { backgroundColor: '#FF174420' }]}>
              <Ionicons name="navigate" size={18} color={journeyOverdue ? '#FF1744' : '#1565C0'} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.journeyText, journeyOverdue && { color: '#FF1744' }]}>
                {journeyOverdue ? 'Journey Overdue!' : 'Journey Active'}
              </Text>
              <Text style={styles.journeySubtext}>
                To: {activeJourney.destination} • ETA: {new Date(activeJourney.expectedArrival).toLocaleTimeString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        )}

        {/* ── Protection Status Card ─────────────────── */}
        <View style={[styles.statusCard, isSOSActive && styles.statusCardDanger]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIconWrap, isSOSActive && { backgroundColor: '#FF174420' }]}>
              <Ionicons
                name={isSOSActive ? 'warning' : 'shield-checkmark'}
                size={22}
                color={isSOSActive ? '#FF1744' : '#00C853'}
              />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={[styles.statusTitle, isSOSActive && { color: '#FF1744' }]}>
                {protectionStatus}
              </Text>
              <Text style={styles.statusSub}>
                {isSOSActive
                  ? `Emergency mode active${isLiveTracking ? ' • Live tracking' : ''}`
                  : `${emergencyContacts.length} contacts • All systems ready`}
              </Text>
            </View>
          </View>
          <View style={styles.featurePills}>
            {settings.shakeToSOS && <View style={styles.pill}><Ionicons name="phone-portrait-outline" size={10} color={COLORS.primary} /><Text style={styles.pillText}>Shake</Text></View>}
            {settings.sirenEnabled && <View style={styles.pill}><Ionicons name="volume-high-outline" size={10} color={COLORS.primary} /><Text style={styles.pillText}>Siren</Text></View>}
            {settings.autoRecordAudio && <View style={styles.pill}><Ionicons name="mic-outline" size={10} color={COLORS.primary} /><Text style={styles.pillText}>Record</Text></View>}
            {settings.screamDetection && <View style={[styles.pill, isScreamDetecting && styles.pillActive]}><Ionicons name="ear-outline" size={10} color={isScreamDetecting ? '#00C853' : COLORS.primary} /><Text style={[styles.pillText, isScreamDetecting && { color: '#00C853' }]}>AI Sound</Text></View>}
            {settings.inactivitySOSEnabled && <View style={styles.pill}><Ionicons name="timer-outline" size={10} color={COLORS.primary} /><Text style={styles.pillText}>Check-In</Text></View>}
            {isRecording && <View style={styles.pillRec}><View style={styles.recDot} /><Text style={styles.pillRecText}>REC</Text></View>}
          </View>
        </View>

        {/* ── Check-In Button ── */}
        {settings.inactivitySOSEnabled && !isSOSActive && (
          <TouchableOpacity
            style={[styles.checkInCard, checkInOverdue && styles.checkInOverdue]}
            onPress={() => {
              checkIn();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Checked In', 'Your safety has been confirmed.');
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.checkInIconWrap, checkInOverdue && { backgroundColor: '#FF174420' }]}>
              <Ionicons name="checkmark-circle" size={22} color={checkInOverdue ? '#FF1744' : '#00C853'} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.checkInText, checkInOverdue && { color: '#FF1744' }]}>
                {checkInOverdue ? 'CHECK-IN OVERDUE!' : 'Tap to Check In'}
              </Text>
              <Text style={styles.checkInSub}>
                Last: {timeSinceCheckIn < 1 ? 'Just now' : `${timeSinceCheckIn}m ago`}
                {' • Timer: '}{settings.inactivityTimeout}min
              </Text>
            </View>
            <View style={[styles.checkInBtn, checkInOverdue && { backgroundColor: '#FF1744' }]}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.checkInBtnText}>SAFE</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── SOS BUTTON ─────────────────────────────── */}
        {countdown !== null ? (
          <View style={styles.countdownContainer} accessibilityLabel={`SOS activating in ${countdown} seconds`}>
            <Text style={styles.countdownLabel}>SOS ACTIVATING IN</Text>
            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNumber}>{countdown}</Text>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelCountdown} activeOpacity={0.8}
              accessibilityLabel="Cancel SOS countdown" accessibilityRole="button">
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        ) : isSOSActive ? (
          <TouchableOpacity style={styles.stopSOSBtn} onPress={stopSOS} activeOpacity={0.8}
            accessibilityLabel="Stop SOS emergency. Tap to cancel" accessibilityRole="button">
            <Ionicons name="stop-circle" size={44} color="#FFF" />
            <Text style={styles.stopSOSText}>STOP SOS</Text>
            <Text style={styles.stopSOSSub}>Tap to cancel emergency</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.sosWrapper}>
            {/* Expanding ring */}
            <Animated.View style={[styles.sosRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={styles.sosButton}
                onPress={startSOSCountdown}
                onLongPress={executeFullSOS}
                activeOpacity={0.7}
                accessibilityLabel="SOS Emergency Button. Tap to start countdown, long press for immediate SOS"
                accessibilityRole="button"
                accessibilityHint="Activates emergency alert and notifies your contacts"
              >
                <Ionicons name="alert-circle" size={44} color="#FFF" />
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosSubText}>Tap or Long-press</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* ── Power Features ─────────────────────────── */}
        <View style={styles.powerRow}>
          <TouchableOpacity
            style={[styles.powerBtn, sirenActive && styles.powerBtnActive]}
            onPress={sirenActive ? stopSiren : startSiren}
            activeOpacity={0.85}
          >
            <View style={[styles.powerIconWrap, { backgroundColor: sirenActive ? 'rgba(255,255,255,0.2)' : '#FF174415' }]}>
              <Ionicons name="volume-high" size={22} color={sirenActive ? '#FFF' : '#FF1744'} />
            </View>
            <Text style={[styles.powerLabel, sirenActive && { color: '#FFF' }]}>
              {sirenActive ? 'STOP' : 'SIREN'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.powerBtn, isRecording && styles.powerBtnRec]}
            onPress={isRecording ? stopEvidenceRecording : startEvidenceRecording}
            activeOpacity={0.85}
          >
            <View style={[styles.powerIconWrap, { backgroundColor: isRecording ? 'rgba(255,255,255,0.2)' : '#FF6D0015' }]}>
              <Ionicons name="mic" size={22} color={isRecording ? '#FFF' : '#FF6D00'} />
            </View>
            <Text style={[styles.powerLabel, isRecording && { color: '#FFF' }]}>
              {isRecording ? 'STOP REC' : 'RECORD'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.powerBtn}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.nationalEmergency)}
            activeOpacity={0.85}
          >
            <View style={[styles.powerIconWrap, { backgroundColor: '#2962FF15' }]}>
              <Ionicons name="call" size={22} color="#2962FF" />
            </View>
            <Text style={styles.powerLabel}>CALL 112</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Actions Grid ─────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action, idx) => (
            <TouchableOpacity key={idx} style={styles.quickCard} onPress={action.onPress} activeOpacity={0.8}
              accessibilityLabel={action.label.replace('\n', ' ')} accessibilityRole="button">
              <View style={[styles.quickIcon, { backgroundColor: action.color + '12' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Emergency Helplines (country-aware) ────── */}
        <Text style={styles.sectionTitle}>Emergency Helplines</Text>
        <View style={styles.helplineCard}>
          {getLocalDisplayHelplines().map((line, i) => (
            <TouchableOpacity
              key={i}
              style={styles.helplineRow}
              onPress={() => makePhoneCall(line.number)}
              activeOpacity={0.7}
              accessibilityLabel={`Call ${line.label} at ${line.number}`}
              accessibilityRole="button"
            >
              <View style={[styles.helplineIconWrap, { backgroundColor: line.color + '12' }]}>
                <Ionicons name={line.icon} size={17} color={line.color} />
              </View>
              <Text style={styles.helplineName}>{line.label}</Text>
              <Text style={styles.helplineNum}>{line.number}</Text>
              <View style={styles.helplineCallBtn}>
                <Ionicons name="call" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.buildVersion}>{BUILD_VERSION}</Text>
        <View style={{ height: 30 }} />
      </ScrollView>
    </Animated.View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },

  // ── Header ──
  header: {
    backgroundColor: COLORS.primaryDark,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 28, fontWeight: '900', color: '#FFF', letterSpacing: 0.8,
  },
  appSubtitle: {
    fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '500',
  },
  settingsBtn: { padding: 4 },
  settingsIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  buildVersion: {
    fontSize: 10, color: COLORS.textLight, textAlign: 'center', marginTop: 20,
    letterSpacing: 0.4,
  },

  // ── Journey Banner ──
  journeyBanner: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E3F2FD', ...SHADOWS.small,
  },
  journeyBannerOverdue: { borderColor: '#FFCDD2', backgroundColor: '#FFF5F5' },
  journeyIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center',
  },
  journeyText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  journeySubtext: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  // ── Status Card ──
  statusCard: {
    marginHorizontal: 16, marginTop: 14, padding: 18, borderRadius: 20,
    backgroundColor: '#fff', ...SHADOWS.medium, borderWidth: 1, borderColor: COLORS.border,
  },
  statusCardDanger: { borderColor: '#FF1744', borderWidth: 2, backgroundColor: '#FFF5F5' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  statusTitle: { fontSize: 16, fontWeight: '800', color: '#00C853', letterSpacing: 0.3 },
  statusSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  featurePills: { flexDirection: 'row', marginTop: 14, flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary + '08', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.primary + '15',
  },
  pillActive: { backgroundColor: '#00C85310', borderColor: '#00C85330' },
  pillText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },
  pillRec: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FF1744', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  pillRecText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Check-In ──
  checkInCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#C8E6C9', ...SHADOWS.small,
  },
  checkInOverdue: { borderColor: '#FFCDD2', backgroundColor: '#FFF5F5' },
  checkInIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center',
  },
  checkInText: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  checkInSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  checkInBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00C853', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
  },
  checkInBtnText: { fontSize: 11, fontWeight: '800', color: '#FFF' },

  // ── SOS ──
  sosWrapper: {
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 28, height: 200,
  },
  sosRing: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    borderWidth: 3, borderColor: '#FF1744',
  },
  sosButton: {
    width: 156, height: 156, borderRadius: 78,
    backgroundColor: '#FF1744', alignItems: 'center', justifyContent: 'center',
    elevation: 20, shadowColor: '#FF1744', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20,
    borderWidth: 5, borderColor: 'rgba(255,23,68,0.25)',
  },
  sosText: { fontSize: 34, fontWeight: '900', color: '#FFF', marginTop: 2, letterSpacing: 3 },
  sosSubText: { fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  countdownContainer: { alignItems: 'center', marginVertical: 28 },
  countdownLabel: { fontSize: 14, fontWeight: '800', color: '#FF6D00', letterSpacing: 1 },
  countdownCircle: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 4, borderColor: '#FF1744', justifyContent: 'center', alignItems: 'center',
    marginVertical: 16,
  },
  countdownNumber: { fontSize: 56, fontWeight: '900', color: '#FF1744' },
  cancelBtn: {
    backgroundColor: '#fff', borderRadius: 30, paddingHorizontal: 36, paddingVertical: 13,
    borderWidth: 2, borderColor: '#FF1744', ...SHADOWS.small,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '800', color: '#FF1744', letterSpacing: 0.5 },

  stopSOSBtn: {
    width: 168, height: 168, borderRadius: 84,
    backgroundColor: '#B71C1C', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginVertical: 28,
    elevation: 16, shadowColor: '#FF1744', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 14,
  },
  stopSOSText: { fontSize: 20, fontWeight: '900', color: '#FFF', marginTop: 6 },
  stopSOSSub: { fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  // ── Power Features ──
  powerRow: {
    flexDirection: 'row', marginHorizontal: 16, gap: 10,
  },
  powerBtn: {
    flex: 1, backgroundColor: '#fff',
    borderRadius: 18, paddingVertical: 16, alignItems: 'center',
    ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  powerBtnActive: { backgroundColor: '#FF1744', borderColor: '#FF1744' },
  powerBtnRec: { backgroundColor: '#FF6D00', borderColor: '#FF6D00' },
  powerIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  powerLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.text, textAlign: 'center',
    letterSpacing: 0.3,
  },

  // ── Quick Actions ──
  sectionTitle: {
    fontSize: 18, fontWeight: '800', color: COLORS.text,
    marginHorizontal: 20, marginTop: 28, marginBottom: 14, letterSpacing: 0.2,
  },
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 12,
    gap: 10, justifyContent: 'space-between',
  },
  quickCard: {
    width: (SCREEN_W - 54) / 3, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6,
    backgroundColor: '#fff', borderRadius: 18, ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickIcon: {
    width: 50, height: 50, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 11, fontWeight: '600', color: COLORS.text,
    marginTop: 10, textAlign: 'center', lineHeight: 15,
  },

  // ── Helplines ──
  helplineCard: {
    marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 18,
    ...SHADOWS.small, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  helplineRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  helplineIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  helplineName: {
    flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text, marginLeft: 12,
  },
  helplineNum: {
    fontSize: 15, fontWeight: '800', color: COLORS.primary, marginRight: 10,
    letterSpacing: 0.5,
  },
  helplineCallBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center',
  },

  // ── Calculator (Stealth) ──
  calcContainer: { flex: 1, backgroundColor: '#1C1C1E', justifyContent: 'flex-end', padding: 16 },
  calcDisplayBox: {
    backgroundColor: '#2C2C2E', borderRadius: 16, padding: 20, marginBottom: 8,
    minHeight: 90, justifyContent: 'flex-end',
  },
  calcDisplayText: { fontSize: 48, fontWeight: '300', color: '#FFF', textAlign: 'right' },
  calcHint: { fontSize: 10, color: '#444', textAlign: 'center', marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  calcBtn: {
    width: (SCREEN_W - 60) / 4, height: 70, borderRadius: 35,
    backgroundColor: '#3A3A3C', alignItems: 'center', justifyContent: 'center',
  },
  calcOpBtn: { backgroundColor: '#FF9F0A' },
  calcEqBtn: { backgroundColor: '#FF9F0A' },
  calcClrBtn: { backgroundColor: '#636366' },
  calcBtnText: { fontSize: 26, fontWeight: '500', color: '#FFF' },
  calcOpText: { color: '#FFF' },
});

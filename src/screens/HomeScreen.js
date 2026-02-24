/**
 * HomeScreen v4.0 - NEXT-GEN SAFETY DASHBOARD
 * Features: SOS, Shake-to-SOS, Siren, Audio Evidence, Scream Detection,
 *           Stealth Calculator, Auto Photo Capture, Check-In Timer,
 *           Journey Status, Quick Actions, Emergency Speed Dial
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
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import {
  makePhoneCall, sendSMS, sendSOSToContacts,
  getCurrentPosition, EMERGENCY_NUMBERS, vibrateEmergency,
} from '../utils/helpers';

const { width } = Dimensions.get('window');
const SOS_COUNTDOWN_DEFAULT = 5;

export default function HomeScreen() {
  const navigation = useNavigation();
  const {
    emergencyContacts, settings, sosMessage,
    isSOSActive, triggerSOS, cancelSOS,
    currentLocation, setCurrentLocation,
    sirenActive, setSirenActive,
    isRecording, setIsRecording,
    stealthMode, checkIn,
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
  const shakeRef = useRef({ count: 0, lastTime: 0 });
  const countdownRef = useRef(null);

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
            // Loud sound detected (metering is in dB, -160 to 0)
            clearInterval(checkAmplitude);
            stopScreamDetection();
            Alert.alert(
              '🚨 Loud Sound Detected',
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

      // Store interval for cleanup
      rec._amplitudeInterval = checkAmplitude;
    } catch (e) {
      console.log('Scream detection error:', e);
    }
  };

  const stopScreamDetection = () => {
    if (screamMonitor) {
      try {
        if (screamMonitor._amplitudeInterval) clearInterval(screamMonitor._amplitudeInterval);
        screamMonitor.stopAndUnloadAsync().catch(() => {});
      } catch (e) {}
      setScreamMonitor(null);
    }
    setIsScreamDetecting(false);
  };

  // ─── SOS Pulse Animation ───────────────────────────────────────
  useEffect(() => {
    if (isSOSActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(sosGlow, { toValue: 1, duration: 500, useNativeDriver: false }),
          Animated.timing(sosGlow, { toValue: 0, duration: 500, useNativeDriver: false }),
        ])
      ).start();
    } else {
      sosGlow.setValue(0);
    }
  }, [isSOSActive]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Check-in Overdue Alert ─────────────────────────────────────
  useEffect(() => {
    if (checkInOverdue && settings.inactivitySOSEnabled) {
      Alert.alert(
        '⏰ Check-In Required!',
        'You haven\'t checked in recently. Are you safe?',
        [
          { text: 'I\'m Safe ✅', onPress: () => checkIn() },
          { text: 'Send SOS 🆘', style: 'destructive', onPress: () => executeFullSOS() },
        ],
        { cancelable: false }
      );
    }
  }, [checkInOverdue]);

  // ─── Journey Overdue Alert ──────────────────────────────────────
  useEffect(() => {
    if (journeyOverdue && activeJourney) {
      Alert.alert(
        '⚠️ Journey Overdue!',
        `You haven\'t arrived at "${activeJourney.destination}" on time. Are you safe?`,
        [
          { text: 'I Arrived ✅', onPress: () => navigation.navigate('JourneyTracker') },
          { text: 'Extend 15min', onPress: () => {} },
          { text: 'Send SOS 🆘', style: 'destructive', onPress: () => executeFullSOS() },
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
    triggerSOS();
    Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true);

    // 1. Get fresh location
    let loc = currentLocation;
    try {
      const fresh = await getCurrentPosition();
      if (fresh) { loc = fresh; setCurrentLocation(fresh); }
    } catch (e) {}

    // 2. Start siren
    if (settings.sirenEnabled) startSiren();

    // 3. Start audio evidence recording
    if (settings.autoRecordAudio) startEvidenceRecording();

    // 4. Send SOS to all contacts
    if (emergencyContacts.length > 0) {
      sendSOSToContacts(emergencyContacts, sosMessage, loc);
    }

    // 5. Auto call police if enabled
    if (settings.autoCallPolice) {
      setTimeout(() => makePhoneCall(EMERGENCY_NUMBERS.nationalEmergency), 3000);
    }

    setProtectionStatus('SOS ACTIVE');
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
          Alert.alert('🎙️ Evidence Saved', 'Audio evidence has been recorded and saved locally.');
        }
      } catch (e) {
        console.log('Stop recording error:', e);
      }
    }
  };

  // ─── STEALTH CALCULATOR ────────────────────────────────────────
  const SECRET_CODE = '112';
  const handleCalcPress = (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (val === 'C') { setCalcDisplay('0'); setCalcSecret(''); return; }
    if (val === '=') {
      if (calcSecret === SECRET_CODE) {
        setCalcDisplay('HELP');
        executeFullSOS();
        return;
      }
      try { setCalcDisplay(String(eval(calcDisplay))); } catch { setCalcDisplay('Error'); }
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

  return (
    <Animated.View style={[styles.container, { backgroundColor: sosBackground }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>Girl Safety</Text>
            <Text style={styles.appSubtitle}>Your Protection Shield 🛡️</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
            <Ionicons name="settings-outline" size={26} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── Journey Active Banner ──────────────────── */}
        {activeJourney && (
          <TouchableOpacity
            style={[styles.journeyBanner, journeyOverdue && styles.journeyBannerOverdue]}
            onPress={() => navigation.navigate('JourneyTracker')}
          >
            <Ionicons name="navigate" size={20} color={journeyOverdue ? '#FF1744' : '#1565C0'} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.journeyText, journeyOverdue && { color: '#FF1744' }]}>
                {journeyOverdue ? '⚠️ Journey Overdue!' : '📍 Journey Active'}
              </Text>
              <Text style={styles.journeySubtext}>
                To: {activeJourney.destination} • ETA: {new Date(activeJourney.expectedArrival).toLocaleTimeString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#888" />
          </TouchableOpacity>
        )}

        {/* ── Protection Status Card ─────────────────── */}
        <View style={[styles.statusCard, isSOSActive && styles.statusCardDanger]}>
          <View style={styles.statusRow}>
            <Ionicons
              name={isSOSActive ? 'warning' : 'shield-checkmark'}
              size={28}
              color={isSOSActive ? '#FF1744' : '#00E676'}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[styles.statusTitle, isSOSActive && { color: '#FF1744' }]}>
                {protectionStatus}
              </Text>
              <Text style={styles.statusSub}>
                {isSOSActive
                  ? 'Emergency mode active • Sending alerts'
                  : `${emergencyContacts.length} contacts • Shake & Siren ready`}
              </Text>
            </View>
          </View>
          <View style={styles.featurePills}>
            {settings.shakeToSOS && <View style={styles.pill}><Text style={styles.pillText}>📳 Shake</Text></View>}
            {settings.sirenEnabled && <View style={styles.pill}><Text style={styles.pillText}>🔊 Siren</Text></View>}
            {settings.autoRecordAudio && <View style={styles.pill}><Text style={styles.pillText}>🎙️ Record</Text></View>}
            {settings.screamDetection && <View style={[styles.pill, isScreamDetecting && { backgroundColor: '#00C85320' }]}><Text style={styles.pillText}>🤖 AI Sound</Text></View>}
            {settings.inactivitySOSEnabled && <View style={styles.pill}><Text style={styles.pillText}>⏰ Check-In</Text></View>}
            {isRecording && <View style={[styles.pill, { backgroundColor: '#FF1744' }]}><Text style={[styles.pillText, { color: '#fff' }]}>● REC</Text></View>}
          </View>
        </View>

        {/* ── Check-In Button (when inactivity timer active) ── */}
        {settings.inactivitySOSEnabled && !isSOSActive && (
          <TouchableOpacity
            style={[styles.checkInCard, checkInOverdue && styles.checkInOverdue]}
            onPress={() => {
              checkIn();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('✅ Checked In', 'Your safety has been confirmed.');
            }}
          >
            <Ionicons name="checkmark-circle" size={28} color={checkInOverdue ? '#FF1744' : '#00C853'} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.checkInText, checkInOverdue && { color: '#FF1744' }]}>
                {checkInOverdue ? '⚠️ CHECK-IN OVERDUE!' : 'Tap to Check In'}
              </Text>
              <Text style={styles.checkInSub}>
                Last check-in: {timeSinceCheckIn < 1 ? 'Just now' : `${timeSinceCheckIn} min ago`}
                {' • Timer: '}{settings.inactivityTimeout} min
              </Text>
            </View>
            <View style={[styles.checkInBtn, checkInOverdue && { backgroundColor: '#FF1744' }]}>
              <Text style={styles.checkInBtnText}>✓ SAFE</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── SOS BUTTON ─────────────────────────────── */}
        {countdown !== null ? (
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownLabel}>SOS ACTIVATING IN</Text>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelCountdown}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        ) : isSOSActive ? (
          <TouchableOpacity style={styles.stopSOSBtn} onPress={stopSOS} activeOpacity={0.8}>
            <Ionicons name="stop-circle" size={50} color="#FFF" />
            <Text style={styles.stopSOSText}>STOP SOS</Text>
            <Text style={styles.stopSOSSub}>Tap to cancel emergency</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={styles.sosButton}
              onPress={startSOSCountdown}
              onLongPress={executeFullSOS}
              activeOpacity={0.7}
            >
              <Ionicons name="alert-circle" size={50} color="#FFF" />
              <Text style={styles.sosText}>SOS</Text>
              <Text style={styles.sosSubText}>Tap to start • Long press = Instant</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Power Features ─────────────────────────── */}
        <View style={styles.powerRow}>
          <TouchableOpacity
            style={[styles.powerBtn, sirenActive && styles.powerBtnActive]}
            onPress={sirenActive ? stopSiren : startSiren}
          >
            <Ionicons name="volume-high" size={28} color={sirenActive ? '#FFF' : '#FF1744'} />
            <Text style={[styles.powerLabel, sirenActive && { color: '#FFF' }]}>
              {sirenActive ? 'STOP\nSIREN' : 'LOUD\nSIREN'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.powerBtn, isRecording && styles.powerBtnRec]}
            onPress={isRecording ? stopEvidenceRecording : startEvidenceRecording}
          >
            <Ionicons name="mic" size={28} color={isRecording ? '#FFF' : '#FF6D00'} />
            <Text style={[styles.powerLabel, isRecording && { color: '#FFF' }]}>
              {isRecording ? 'STOP\nREC' : 'RECORD\nEVIDENCE'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.powerBtn}
            onPress={() => makePhoneCall(EMERGENCY_NUMBERS.nationalEmergency)}
          >
            <Ionicons name="call" size={28} color="#2962FF" />
            <Text style={styles.powerLabel}>CALL\n112</Text>
          </TouchableOpacity>
        </View>

        {/* ── Quick Actions Grid ─────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action, idx) => (
            <TouchableOpacity key={idx} style={styles.quickCard} onPress={action.onPress}>
              <View style={[styles.quickIcon, { backgroundColor: action.color + '20' }]}>
                <Ionicons name={action.icon} size={26} color={action.color} />
              </View>
              <Text style={styles.quickLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Emergency Helplines ─────────────────────── */}
        <Text style={styles.sectionTitle}>Emergency Helplines</Text>
        <View style={styles.helplineCard}>
          {[
            { label: 'National Emergency', number: '112', icon: 'call' },
            { label: 'Police', number: '100', icon: 'shield' },
            { label: 'Women Helpline', number: '1091', icon: 'woman' },
            { label: 'Ambulance', number: '108', icon: 'medical' },
            { label: 'Child Helpline', number: '1098', icon: 'heart' },
            { label: 'Cyber Crime', number: '1930', icon: 'globe' },
          ].map((line, i) => (
            <TouchableOpacity
              key={i}
              style={styles.helplineRow}
              onPress={() => makePhoneCall(line.number)}
            >
              <Ionicons name={line.icon} size={20} color={COLORS.primary} />
              <Text style={styles.helplineName}>{line.label}</Text>
              <Text style={styles.helplineNum}>{line.number}</Text>
              <Ionicons name="call-outline" size={18} color="#00C853" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </Animated.View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingBottom: 18,
    backgroundColor: COLORS.primaryDark,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  appTitle: { fontSize: 26, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  appSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  settingsBtn: { padding: 8 },

  // Journey Banner
  journeyBanner: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#90CAF9',
  },
  journeyBannerOverdue: { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  journeyText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  journeySubtext: { fontSize: 11, color: '#666', marginTop: 2 },

  // Status Card
  statusCard: {
    marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16,
    backgroundColor: COLORS.surface, ...SHADOWS.medium,
  },
  statusCardDanger: { borderWidth: 2, borderColor: '#FF1744' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '700', color: '#00E676' },
  statusSub: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  featurePills: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' },
  pill: {
    backgroundColor: 'rgba(233,30,99,0.1)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 4,
  },
  pillText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },

  // Check-In
  checkInCard: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#E8F5E9', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#A5D6A7',
  },
  checkInOverdue: { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  checkInText: { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  checkInSub: { fontSize: 11, color: '#666', marginTop: 2 },
  checkInBtn: {
    backgroundColor: '#00C853', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  checkInBtnText: { fontSize: 12, fontWeight: '800', color: '#FFF' },

  // SOS Button
  sosButton: {
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: '#FF1744', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginVertical: 24,
    elevation: 16, shadowColor: '#FF1744', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 16,
    borderWidth: 4, borderColor: 'rgba(255,23,68,0.3)',
  },
  sosText: { fontSize: 38, fontWeight: '900', color: '#FFF', marginTop: 4, letterSpacing: 2 },
  sosSubText: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center' },
  countdownContainer: { alignItems: 'center', marginVertical: 24 },
  countdownLabel: { fontSize: 16, fontWeight: '700', color: '#FF6D00' },
  countdownNumber: { fontSize: 72, fontWeight: '900', color: '#FF1744', marginVertical: 8 },
  cancelBtn: {
    backgroundColor: COLORS.surface, borderRadius: 25, paddingHorizontal: 30, paddingVertical: 12,
    borderWidth: 2, borderColor: '#FF1744',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '700', color: '#FF1744' },
  stopSOSBtn: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#B71C1C', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginVertical: 24,
    elevation: 12, shadowColor: '#FF1744', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 12,
  },
  stopSOSText: { fontSize: 22, fontWeight: '900', color: '#FFF', marginTop: 6 },
  stopSOSSub: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // Power Features
  powerRow: { flexDirection: 'row', marginHorizontal: 16, justifyContent: 'space-between' },
  powerBtn: {
    flex: 1, marginHorizontal: 5, backgroundColor: COLORS.surface,
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  powerBtnActive: { backgroundColor: '#FF1744', borderColor: '#FF1744' },
  powerBtnRec: { backgroundColor: '#FF6D00', borderColor: '#FF6D00' },
  powerLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text, marginTop: 6, textAlign: 'center' },

  // Quick Actions
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: COLORS.text,
    marginHorizontal: 20, marginTop: 24, marginBottom: 12,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 8, justifyContent: 'space-between' },
  quickCard: {
    width: (width - 52) / 3, alignItems: 'center', padding: 14, marginBottom: 10,
    backgroundColor: COLORS.surface, borderRadius: 16, ...SHADOWS.small,
  },
  quickIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text, marginTop: 8, textAlign: 'center', lineHeight: 15 },

  // Helplines
  helplineCard: {
    marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 16,
    ...SHADOWS.small, overflow: 'hidden',
  },
  helplineRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  helplineName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text, marginLeft: 12 },
  helplineNum: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginRight: 12 },

  // Calculator (Stealth)
  calcContainer: { flex: 1, backgroundColor: '#1C1C1E', justifyContent: 'flex-end', padding: 16 },
  calcDisplayBox: {
    backgroundColor: '#2C2C2E', borderRadius: 12, padding: 20, marginBottom: 8,
    minHeight: 80, justifyContent: 'flex-end',
  },
  calcDisplayText: { fontSize: 48, fontWeight: '300', color: '#FFF', textAlign: 'right' },
  calcHint: { fontSize: 10, color: '#555', textAlign: 'center', marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  calcBtn: {
    width: (width - 60) / 4, height: 70, borderRadius: 35,
    backgroundColor: '#3A3A3C', alignItems: 'center', justifyContent: 'center',
  },
  calcOpBtn: { backgroundColor: '#FF9F0A' },
  calcEqBtn: { backgroundColor: '#FF9F0A' },
  calcClrBtn: { backgroundColor: '#A5A5A5' },
  calcBtnText: { fontSize: 26, fontWeight: '500', color: '#FFF' },
  calcOpText: { color: '#FFF' },
});

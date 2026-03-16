/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         SafeHer — SECURITY SETUP SCREEN                        ║
 * ║  Shown after first login to set up PIN + Biometric              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Prompts users to set up a 4-digit PIN and optionally enable
 * biometric authentication (fingerprint / Face ID).
 * Users can skip and set up later from Settings.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated, Vibration, Alert,
  Dimensions, Platform, Switch,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Design tokens (same as AuthScreen) ──────────────────────────
const C = {
  bg:          '#0D0D14',
  surface:     '#13131F',
  card:        '#1A1A2A',
  border:      'rgba(255,255,255,0.08)',
  borderGlow:  'rgba(233,30,99,0.5)',
  primary:     '#E91E63',
  primaryDark: '#C2185B',
  primaryGlow: 'rgba(233,30,99,0.25)',
  accent:      '#FF6B9D',
  gold:        '#FFB300',
  white:       '#FFFFFF',
  text:        '#F0F0F8',
  textSub:     '#8888AA',
  textHint:    '#555570',
  danger:      '#FF5252',
  success:     '#00E676',
  purple:      '#7C4DFF',
};

const { width } = Dimensions.get('window');
const PIN_LENGTH = 4;
const SETUP_SHOWN_KEY = '@gs_security_setup_shown';

// ── Floating Orb (same as AuthScreen) ───────────────────────────
function FloatingOrb({ size, color, startX, startY, duration }) {
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(startY)).current;

  useEffect(() => {
    const animate = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(x, { toValue: startX + 30, duration: duration * 0.6, useNativeDriver: true }),
          Animated.timing(x, { toValue: startX - 15, duration: duration * 0.4, useNativeDriver: true }),
          Animated.timing(x, { toValue: startX,      duration: duration * 0.3, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(y, { toValue: startY - 40, duration: duration * 0.5, useNativeDriver: true }),
          Animated.timing(y, { toValue: startY + 20, duration: duration * 0.5, useNativeDriver: true }),
          Animated.timing(y, { toValue: startY,      duration: duration * 0.3, useNativeDriver: true }),
        ]),
      ]).start(animate);
    };
    animate();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ translateX: x }, { translateY: y }],
        opacity: 0.15,
      }}
    />
  );
}

// ── Main Component ──────────────────────────────────────────────
export default function SecuritySetupScreen({ onComplete, setupPin, toggleBiometric }) {
  const [step, setStep]         = useState('intro');  // 'intro' | 'pin_enter' | 'pin_confirm' | 'biometric' | 'done'
  const [entered, setEntered]   = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [errMsg, setErrMsg]     = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType]           = useState('Biometric');
  const [bioEnabled, setBioEnabled]                 = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Intro fade-in
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
    ]).start();
  }, []);

  // Check biometric availability
  useEffect(() => {
    (async () => {
      try {
        const hasHW = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHW && enrolled) {
          setBiometricAvailable(true);
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('Face ID');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType('Fingerprint');
          }
        }
      } catch {}
    })();
  }, []);

  // Auto-process when PIN is complete
  useEffect(() => {
    if (entered.length === PIN_LENGTH) {
      setTimeout(() => processPin(entered), 100);
    }
  }, [entered]);

  const shake = () => {
    Vibration.vibrate(300);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const processPin = async (code) => {
    if (step === 'pin_enter') {
      setFirstPin(code);
      setEntered('');
      setStep('pin_confirm');
    } else if (step === 'pin_confirm') {
      if (code !== firstPin) {
        setErrMsg("PINs don't match. Try again.");
        shake();
        setEntered('');
        setFirstPin('');
        setStep('pin_enter');
        return;
      }
      // PIN matched — save it
      await setupPin(code);
      // Move to biometric setup if available, else finish
      if (biometricAvailable) {
        setStep('biometric');
      } else {
        await finishSetup();
      }
    }
  };

  const pressKey = (k) => {
    if (entered.length < PIN_LENGTH) {
      setErrMsg('');
      setEntered(p => p + k);
    }
  };
  const backspace = () => {
    setErrMsg('');
    setEntered(p => p.slice(0, -1));
  };

  const handleBiometricToggle = async (value) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify to enable biometric login',
        fallbackLabel: 'Cancel',
      });
      if (result.success) {
        setBioEnabled(true);
        await toggleBiometric(true);
      }
    } else {
      setBioEnabled(false);
      await toggleBiometric(false);
    }
  };

  const finishSetup = async () => {
    await AsyncStorage.setItem(SETUP_SHOWN_KEY, 'true');
    onComplete();
  };

  const handleSkip = () => {
    Alert.alert(
      '⏭️ Skip Security Setup?',
      'You can always set up PIN and biometric from Settings later.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: async () => {
          await AsyncStorage.setItem(SETUP_SHOWN_KEY, 'true');
          onComplete();
        }},
      ]
    );
  };

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

  // ────────────── INTRO VIEW ──────────────
  const renderIntro = () => (
    <Animated.View style={[S.centered, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={S.shieldIcon}>🛡️</Text>
      <Text style={S.title}>Secure Your Account</Text>
      <Text style={S.subtitle}>Set up extra security to protect your safety features</Text>

      <View style={S.featureList}>
        <View style={S.featureRow}>
          <Text style={S.featureIcon}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.featureTitle}>4-Digit PIN</Text>
            <Text style={S.featureDesc}>Quick unlock without internet</Text>
          </View>
        </View>
        {biometricAvailable && (
          <View style={S.featureRow}>
            <Text style={S.featureIcon}>{biometricType === 'Face ID' ? '🔐' : '👆'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={S.featureTitle}>{biometricType}</Text>
              <Text style={S.featureDesc}>Fastest way to unlock SafeHer</Text>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity style={S.primaryBtn} onPress={() => setStep('pin_enter')} activeOpacity={0.8}>
        <Text style={S.btnText}>Set Up Now 🔐</Text>
      </TouchableOpacity>

      <TouchableOpacity style={S.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
        <Text style={S.skipText}>Set Up Later →</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  // ────────────── PIN VIEW ──────────────
  const renderPin = () => {
    const isConfirm = step === 'pin_confirm';
    return (
      <View style={S.centered}>
        <Text style={S.pinIcon}>{isConfirm ? '✅' : '🔒'}</Text>
        <Text style={S.title}>{isConfirm ? 'Confirm Your PIN' : 'Create a PIN'}</Text>
        <Text style={S.subtitle}>
          {isConfirm ? 'Re-enter your 4-digit PIN to confirm' : 'Choose a 4-digit PIN for quick access'}
        </Text>

        <Animated.View style={[S.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[S.dot, i < entered.length && S.dotFilled]} />
          ))}
        </Animated.View>

        {errMsg ? <Text style={S.errText}>{errMsg}</Text> : null}

        <View style={S.keypad}>
          {KEYS.map((row, ri) => (
            <View key={ri} style={S.keyRow}>
              {row.map((k, ki) =>
                k === '' ? <View key={ki} style={S.keyEmpty} />
                : k === '⌫' ? (
                  <TouchableOpacity key={ki} style={S.keyBtn} onPress={backspace} activeOpacity={0.5}>
                    <Text style={{ fontSize: 20, color: C.textSub }}>⌫</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity key={ki} style={S.keyBtn} onPress={() => pressKey(k)} activeOpacity={0.5}>
                    <Text style={S.keyText}>{k}</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ────────────── BIOMETRIC VIEW ──────────────
  const renderBiometric = () => (
    <View style={S.centered}>
      <Text style={S.shieldIcon}>{biometricType === 'Face ID' ? '🔐' : '👆'}</Text>
      <Text style={S.title}>Enable {biometricType}?</Text>
      <Text style={S.subtitle}>Use {biometricType} for fastest access to your safety features</Text>

      <View style={S.bioCard}>
        <View style={S.bioRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.bioLabel}>{biometricType} Login</Text>
            <Text style={S.bioDesc}>Unlock SafeHer instantly</Text>
          </View>
          <Switch
            value={bioEnabled}
            onValueChange={handleBiometricToggle}
            trackColor={{ false: C.border, true: C.primaryGlow }}
            thumbColor={bioEnabled ? C.primary : C.textSub}
          />
        </View>
      </View>

      <TouchableOpacity style={S.primaryBtn} onPress={finishSetup} activeOpacity={0.8}>
        <Text style={S.btnText}>{bioEnabled ? 'All Set! Continue 🎉' : 'Continue Without Biometric'}</Text>
      </TouchableOpacity>
    </View>
  );

  // ────────────── RENDER ──────────────
  return (
    <View style={S.root}>
      <FloatingOrb size={200} color={C.primary} startX={-40}       startY={-60}  duration={8000} />
      <FloatingOrb size={140} color={C.purple}  startX={width - 80} startY={200}  duration={10000} />
      <FloatingOrb size={100} color={C.accent}  startX={width * 0.3} startY={500}  duration={7000} />

      <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
        {step === 'intro'                                && renderIntro()}
        {(step === 'pin_enter' || step === 'pin_confirm') && renderPin()}
        {step === 'biometric'                            && renderBiometric()}
      </ScrollView>
    </View>
  );
}

// Helper to check if security setup was already shown/skipped
export async function isSecuritySetupComplete(pin) {
  if (pin) return true; // PIN already exists
  try {
    const shown = await AsyncStorage.getItem(SETUP_SHOWN_KEY);
    return shown === 'true';
  } catch {
    return false;
  }
}

// ── Styles ──────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  centered: {
    alignItems: 'center',
  },

  // Intro
  shieldIcon: { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 28, fontWeight: '900', color: C.white,
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: C.textSub, textAlign: 'center',
    lineHeight: 20, marginBottom: 32, paddingHorizontal: 16,
  },

  // Feature list
  featureList: {
    width: '100%', backgroundColor: C.card,
    borderRadius: 20, padding: 20, marginBottom: 32,
    borderWidth: 1, borderColor: C.border,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 14,
  },
  featureIcon: { fontSize: 28 },
  featureTitle: { fontSize: 16, fontWeight: '800', color: C.white },
  featureDesc: { fontSize: 12, color: C.textSub, marginTop: 2 },

  // Buttons
  primaryBtn: {
    backgroundColor: C.primary, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 48,
    alignItems: 'center', width: '100%',
    elevation: 8,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12,
  },
  btnText: { color: C.white, fontSize: 17, fontWeight: '900' },
  skipBtn: { marginTop: 20, paddingVertical: 12 },
  skipText: { color: C.textSub, fontSize: 14, fontWeight: '600' },

  // PIN view
  pinIcon: { fontSize: 52, marginBottom: 12 },
  pinDots: { flexDirection: 'row', gap: 20, marginVertical: 28 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2.5, borderColor: C.primary,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: C.primary },
  errText: {
    color: C.danger, fontSize: 13, fontWeight: '600',
    marginBottom: 12, textAlign: 'center',
  },
  keypad: { width: '100%', maxWidth: 280, marginTop: 4 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  keyBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    elevation: 4, borderWidth: 1, borderColor: C.border,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6,
  },
  keyEmpty: { width: 76, height: 76 },
  keyText: { fontSize: 26, fontWeight: '700', color: C.white },

  // Biometric view
  bioCard: {
    width: '100%', backgroundColor: C.card,
    borderRadius: 20, padding: 20, marginBottom: 32,
    borderWidth: 1, borderColor: C.border,
  },
  bioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  bioLabel: { fontSize: 16, fontWeight: '800', color: C.white },
  bioDesc: { fontSize: 12, color: C.textSub, marginTop: 2 },
});

/**
 * AuthScreen — Multi-Provider Authentication
 * Supports: Phone OTP, Gmail, Facebook, Instagram, PIN
 * Clean, modern UI with social login buttons
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Platform, StatusBar, Alert, TextInput,
  KeyboardAvoidingView, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../constants/theme';

const { width, height } = Dimensions.get('window');
const PIN_LENGTH = 4;

export default function AuthScreen({ onDuressTriggered }) {
  const {
    pin, setupPin, verifyPin, biometricEnabled,
    authenticate, enterDuressMode, completeOnboarding, isOnboarded,
    updateProfile, userProfile,
    socialLogin, authMethod,
  } = useAuth();

  // Screen modes: 'welcome' | 'phone' | 'otp' | 'pin-setup' | 'pin-confirm' | 'pin-login'
  const [mode, setMode] = useState('welcome');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // If user already has a PIN saved, go straight to PIN login
    if (pin) {
      setMode('pin-login');
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
      Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
    ]).start();
  }, []);

  const shakeError = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // ─── Phone OTP Flow ──────────────────────────────────────────
  const handleSendOTP = () => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      shakeError();
      return;
    }
    setError('');
    setLoading(true);

    // Generate a random 6-digit OTP (simulated - in production use Firebase/Twilio)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOTP(otp);

    // Simulate sending OTP
    setTimeout(() => {
      setLoading(false);
      setMode('otp');
      Alert.alert(
        '📱 OTP Sent',
        `A verification code has been sent to +91 ${cleaned.slice(-10)}.\n\nDemo OTP: ${otp}`,
        [{ text: 'OK' }]
      );
    }, 1500);
  };

  const handleVerifyOTP = async () => {
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP');
      shakeError();
      return;
    }

    setLoading(true);
    setError('');

    setTimeout(async () => {
      if (otpCode === generatedOTP) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const cleaned = phoneNumber.replace(/\D/g, '');
        await updateProfile({ phone: cleaned });
        await socialLogin('phone', { phone: cleaned });
        setLoading(false);

        // Move to PIN setup if no PIN exists
        if (!pin) {
          setMode('pin-setup');
        } else {
          await completeOnboarding();
          authenticate();
        }
      } else {
        setLoading(false);
        setError('Invalid OTP. Please try again.');
        shakeError();
        setOtpCode('');
      }
    }, 1000);
  };

  // ─── Social Login Handlers ───────────────────────────────────
  const handleGmailLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // Simulated Google Sign-In (in production, use expo-auth-session + Google)
      setTimeout(async () => {
        const mockUser = {
          email: 'user@gmail.com',
          name: userName || 'SafeHer User',
          provider: 'google',
        };
        await socialLogin('google', mockUser);
        await updateProfile({ fullName: mockUser.name });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLoading(false);
        if (!pin) {
          setMode('pin-setup');
        } else {
          await completeOnboarding();
          authenticate();
        }
      }, 1500);
    } catch (e) {
      setLoading(false);
      setError('Google sign-in failed. Please try again.');
    }
  };

  const handleFacebookLogin = async () => {
    setLoading(true);
    setError('');
    try {
      setTimeout(async () => {
        const mockUser = {
          name: userName || 'SafeHer User',
          provider: 'facebook',
        };
        await socialLogin('facebook', mockUser);
        await updateProfile({ fullName: mockUser.name });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLoading(false);
        if (!pin) {
          setMode('pin-setup');
        } else {
          await completeOnboarding();
          authenticate();
        }
      }, 1500);
    } catch (e) {
      setLoading(false);
      setError('Facebook login failed. Please try again.');
    }
  };

  const handleInstagramLogin = async () => {
    setLoading(true);
    setError('');
    try {
      setTimeout(async () => {
        const mockUser = {
          name: userName || 'SafeHer User',
          provider: 'instagram',
        };
        await socialLogin('instagram', mockUser);
        await updateProfile({ fullName: mockUser.name });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLoading(false);
        if (!pin) {
          setMode('pin-setup');
        } else {
          await completeOnboarding();
          authenticate();
        }
      }, 1500);
    } catch (e) {
      setLoading(false);
      setError('Instagram login failed. Please try again.');
    }
  };

  // ─── PIN Handlers ────────────────────────────────────────────
  const handlePinPress = (digit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (enteredPin.length >= PIN_LENGTH) return;

    const newPin = enteredPin + digit;
    setEnteredPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      setTimeout(() => processPin(newPin), 200);
    }
  };

  const processPin = async (fullPin) => {
    if (mode === 'pin-setup') {
      setFirstPin(fullPin);
      setEnteredPin('');
      setMode('pin-confirm');
      return;
    }

    if (mode === 'pin-confirm') {
      if (fullPin === firstPin) {
        await setupPin(fullPin);
        if (!isOnboarded) await completeOnboarding();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        authenticate();
      } else {
        shakeError();
        setError("PINs don't match. Try again.");
        setEnteredPin('');
        setMode('pin-setup');
        setFirstPin('');
      }
      return;
    }

    // pin-login mode
    const result = verifyPin(fullPin);
    if (result === 'normal') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      authenticate();
    } else if (result === 'duress') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      enterDuressMode();
      if (onDuressTriggered) onDuressTriggered();
    } else {
      setAttempts((a) => a + 1);
      shakeError();
      setError(attempts >= 2 ? 'Wrong PIN. Multiple failed attempts.' : 'Wrong PIN. Try again.');
      setEnteredPin('');
    }
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnteredPin(enteredPin.slice(0, -1));
    setError('');
  };

  // ─── PIN Keypad Component ────────────────────────────────────
  const renderPinKeypad = (title, subtitle) => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={styles.pinTopSection}>
        <View style={styles.logoCircleSmall}>
          <Ionicons name="shield-checkmark" size={36} color="#FFF" />
        </View>
        <Text style={styles.pinTitle}>{title}</Text>
        <Text style={styles.pinSubtitle}>{subtitle}</Text>
      </View>

      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              enteredPin.length > i && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 24 }} />}

      <View style={styles.keypad}>
        {[[1, 2, 3], [4, 5, 6], [7, 8, 9], ['', 0, 'del']].map((row, ri) => (
          <View key={ri} style={styles.keypadRow}>
            {row.map((key, ki) => {
              if (key === '') {
                return <View key={`empty-${ki}`} style={styles.keyBtn} />;
              }
              if (key === 'del') {
                return (
                  <TouchableOpacity key="del" style={styles.keyBtn} onPress={handleDelete}>
                    <Ionicons name="backspace-outline" size={26} color={COLORS.text} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.keyBtn}
                  onPress={() => handlePinPress(String(key))}
                >
                  <Text style={styles.keyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.emergencyLink} onPress={() => {
        Alert.alert('Emergency Call', 'Call 112 (National Emergency)?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call 112', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
        ]);
      }}>
        <Ionicons name="call" size={16} color="#FF1744" />
        <Text style={styles.emergencyLinkText}>Emergency? Call 112</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── PIN SCREENS ─────────────────────────────────────────────
  if (mode === 'pin-setup') {
    return renderPinKeypad('Create Your PIN', 'Set a 4-digit PIN to secure your safety app');
  }

  if (mode === 'pin-confirm') {
    return renderPinKeypad('Confirm Your PIN', 'Enter the same PIN again to confirm');
  }

  if (mode === 'pin-login') {
    return renderPinKeypad('Welcome Back', 'Enter your PIN to access SafeHer');
  }

  // ─── OTP VERIFICATION SCREEN ─────────────────────────────────
  if (mode === 'otp') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backArrow} onPress={() => { setMode('phone'); setOtpCode(''); setError(''); }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>

            <View style={styles.otpIconWrap}>
              <Ionicons name="chatbubble-ellipses" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.formTitle}>Verify OTP</Text>
            <Text style={styles.formSubtitle}>
              Enter the 6-digit code sent to{'\n'}+91 {phoneNumber.replace(/\D/g, '').slice(-10)}
            </Text>

            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <TextInput
                style={styles.otpInput}
                value={otpCode}
                onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                autoFocus
              />
            </Animated.View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendBtn} onPress={handleSendOTP}>
              <Text style={styles.resendText}>Didn't receive code? <Text style={styles.resendLink}>Resend</Text></Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── PHONE INPUT SCREEN ──────────────────────────────────────
  if (mode === 'phone') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
        <KeyboardAvoidingView
          style={{ flex: 1, width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backArrow} onPress={() => { setMode('welcome'); setError(''); }}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>

            <View style={styles.phoneIconWrap}>
              <Ionicons name="phone-portrait" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.formTitle}>Phone Verification</Text>
            <Text style={styles.formSubtitle}>We'll send a 6-digit OTP to verify your number</Text>

            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phoneNumber}
                  onChangeText={(t) => { setPhoneNumber(t.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                  placeholder="Enter phone number"
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>
            </Animated.View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSendOTP}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── WELCOME SCREEN (Social Login Options) ───────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <ScrollView
        contentContainerStyle={styles.welcomeScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.welcomeTop, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.logoCircle, { transform: [{ scale: logoScale }] }]}>
            <Ionicons name="shield-checkmark" size={56} color="#FFF" />
          </Animated.View>
          <Text style={styles.appName}>SafeHer</Text>
          <Text style={styles.appTagline}>Your Safety, Your Shield</Text>
        </Animated.View>

        <Animated.View style={[styles.authOptions, { opacity: fadeAnim }]}>
          {/* Phone OTP */}
          <TouchableOpacity
            style={[styles.socialBtn, styles.phoneBtn]}
            onPress={() => setMode('phone')}
          >
            <View style={[styles.socialIconWrap, { backgroundColor: '#00897B' }]}>
              <Ionicons name="call" size={22} color="#FFF" />
            </View>
            <Text style={[styles.socialBtnText, { color: '#FFF' }]}>Continue with Phone</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          {/* Gmail */}
          <TouchableOpacity
            style={[styles.socialBtn, styles.gmailBtn]}
            onPress={handleGmailLogin}
            disabled={loading}
          >
            <View style={[styles.socialIconWrap, { backgroundColor: '#D93025' }]}>
              <Ionicons name="mail" size={22} color="#FFF" />
            </View>
            <Text style={[styles.socialBtnText, { color: '#FFF' }]}>Continue with Gmail</Text>
            {loading ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> :
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          {/* Facebook */}
          <TouchableOpacity
            style={[styles.socialBtn, styles.facebookBtn]}
            onPress={handleFacebookLogin}
            disabled={loading}
          >
            <View style={[styles.socialIconWrap, { backgroundColor: '#1877F2' }]}>
              <Ionicons name="logo-facebook" size={22} color="#FFF" />
            </View>
            <Text style={[styles.socialBtnText, { color: '#FFF' }]}>Continue with Facebook</Text>
            {loading ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> :
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          {/* Instagram */}
          <TouchableOpacity
            style={[styles.socialBtn, styles.instagramBtn]}
            onPress={handleInstagramLogin}
            disabled={loading}
          >
            <View style={[styles.socialIconWrap, { backgroundColor: '#C13584' }]}>
              <Ionicons name="logo-instagram" size={22} color="#FFF" />
            </View>
            <Text style={[styles.socialBtnText, { color: '#FFF' }]}>Continue with Instagram</Text>
            {loading ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" /> :
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* PIN only if already set */}
          {pin ? (
            <TouchableOpacity
              style={[styles.socialBtn, styles.pinBtn]}
              onPress={() => setMode('pin-login')}
            >
              <View style={[styles.socialIconWrap, { backgroundColor: COLORS.primary }]}>
                <Ionicons name="keypad" size={22} color="#FFF" />
              </View>
              <Text style={[styles.socialBtnText, { color: COLORS.text }]}>Login with PIN</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.socialBtn, styles.pinBtn]}
              onPress={() => setMode('pin-setup')}
            >
              <View style={[styles.socialIconWrap, { backgroundColor: COLORS.primary }]}>
                <Ionicons name="keypad" size={22} color="#FFF" />
              </View>
              <Text style={[styles.socialBtnText, { color: COLORS.text }]}>Setup with PIN only</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Emergency call */}
        <TouchableOpacity style={styles.emergencyLink} onPress={() => {
          Alert.alert('Emergency Call', 'Call 112 (National Emergency)?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Call 112', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
          ]);
        }}>
          <Ionicons name="call" size={16} color="#FF1744" />
          <Text style={styles.emergencyLinkText}>Emergency? Call 112</Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },

  // Welcome
  welcomeScrollContent: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 50, paddingBottom: 30, paddingHorizontal: 24,
  },
  welcomeTop: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, ...SHADOWS.large,
  },
  appName: { fontSize: 32, fontWeight: '900', color: COLORS.primary, letterSpacing: 1 },
  appTagline: { fontSize: 15, color: COLORS.textSecondary, marginTop: 6, fontWeight: '500' },

  // Auth options
  authOptions: { width: '100%', gap: 12 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 16, ...SHADOWS.small,
  },
  socialIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', marginRight: 14,
  },
  socialBtnText: { flex: 1, fontSize: 16, fontWeight: '700' },
  phoneBtn: { backgroundColor: '#00897B' },
  gmailBtn: { backgroundColor: '#D93025' },
  facebookBtn: { backgroundColor: '#1877F2' },
  instagramBtn: { backgroundColor: '#C13584' },
  pinBtn: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 16, fontSize: 13, fontWeight: '600', color: COLORS.textLight },

  // Phone input
  authScrollContent: {
    flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 50,
    justifyContent: 'center',
  },
  backArrow: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 48, left: 0,
    padding: 8, backgroundColor: COLORS.surface, borderRadius: 12, ...SHADOWS.small,
  },
  phoneIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  otpIconWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  formTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  formSubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  phoneInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  countryCode: {
    backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 14,
    marginRight: 10, borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  countryCodeText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  phoneInput: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 16, fontSize: 18, fontWeight: '600', color: COLORS.text,
    borderWidth: 1.5, borderColor: COLORS.border, letterSpacing: 1, ...SHADOWS.small,
  },
  otpInput: {
    backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 18,
    paddingHorizontal: 16, fontSize: 28, fontWeight: '700', color: COLORS.text,
    borderWidth: 1.5, borderColor: COLORS.primary, letterSpacing: 8, marginBottom: 12,
    ...SHADOWS.small,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 12, ...SHADOWS.medium,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 17, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  resendBtn: { alignItems: 'center', marginTop: 20, padding: 8 },
  resendText: { fontSize: 14, color: COLORS.textSecondary },
  resendLink: { color: COLORS.primary, fontWeight: '700' },

  // PIN screen
  pinTopSection: { alignItems: 'center', marginBottom: 30 },
  logoCircleSmall: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, ...SHADOWS.medium,
  },
  pinTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  pinSubtitle: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', paddingHorizontal: 40 },

  // Dots
  dotsRow: { flexDirection: 'row', marginBottom: 8 },
  dot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: COLORS.primary, marginHorizontal: 10,
  },
  dotFilled: { backgroundColor: COLORS.primary },
  dotError: { borderColor: '#FF1744' },
  errorText: { fontSize: 13, color: '#FF1744', fontWeight: '600', marginBottom: 8, textAlign: 'center' },

  // Keypad
  keypad: { width: width * 0.75, alignSelf: 'center' },
  keypadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  keyBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.small,
  },
  keyText: { fontSize: 28, fontWeight: '600', color: COLORS.text },

  // Emergency
  emergencyLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 24, padding: 10,
  },
  emergencyLinkText: { fontSize: 14, color: '#FF1744', fontWeight: '600', marginLeft: 6 },
  termsText: {
    fontSize: 11, color: COLORS.textLight, textAlign: 'center',
    marginTop: 16, paddingHorizontal: 30, lineHeight: 16,
  },
});

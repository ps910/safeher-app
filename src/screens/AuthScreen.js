/**
 * AuthScreen - Full Authentication with Social Login, OTP, PIN & Biometrics
 * Features: Google/Facebook/Instagram login, Phone & Email OTP,
 * PIN setup/login, fingerprint/face ID, lockout, duress PIN, profile entry
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Alert,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Dimensions, Vibration, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

// Lazy DB helpers to prevent crash if Database module has issues
const safeDB = async () => {
  try {
    const db = await import('../services/Database');
    return { UserDB: db.UserDB, SessionsDB: db.SessionsDB };
  } catch (e) {
    return { UserDB: null, SessionsDB: null };
  }
};

// Safe dimensions
const windowDims = Dimensions.get('window') || {};
const width = windowDims.width || 400;
const height = windowDims.height || 800;

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60;
const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN = 30;

// Generate mock OTP (in production, call your backend API)
const generateOTP = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

export default function AuthScreen({ onDuressTriggered }) {
  const {
    pin, biometricEnabled, authMethod,
    setupPin, verifyPin, authenticate, enterDuressMode,
    socialLogin, updateProfile, toggleBiometric, userProfile,
  } = useAuth();

  // --- State ---
  const [screen, setScreen] = useState('welcome');
  const [enteredPin, setEnteredPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isConfirmStep, setIsConfirmStep] = useState(false);
  const [name, setName] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP & Social Login state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [generatedOTP, setGeneratedOTP] = useState('');
  const [otpMethod, setOtpMethod] = useState('');
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [socialProvider, setSocialProvider] = useState('');

  // --- Animations ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lockTimerRef = useRef(null);
  const otpTimerRef = useRef(null);
  const otpInputRef = useRef(null);

  // --- Init ---
  useEffect(() => {
    checkBiometricAvailability();
    determineInitialScreen();
    animateIn();
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    };
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  };

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometric(compatible && enrolled);
    } catch (e) {
      setHasBiometric(false);
    }
  };

  const determineInitialScreen = () => {
    if (pin) {
      setScreen('login');
      if (biometricEnabled) {
        setTimeout(() => attemptBiometric(), 500);
      }
    } else {
      setScreen('welcome');
    }
  };

  // --- Biometric Auth ---
  const attemptBiometric = async () => {
    if (!hasBiometric || !biometricEnabled) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SafeHer',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (result.success) {
        await handleSuccessfulAuth('biometric');
      }
    } catch (e) {
      console.log('Biometric error:', e);
    }
  };

  // ======= PHONE / EMAIL OTP FLOW =======

  const startPhoneLogin = () => {
    setPhoneNumber('');
    setError('');
    setScreen('phone_input');
    animateIn();
  };

  const startEmailLogin = () => {
    setEmailAddress('');
    setError('');
    setScreen('email_input');
    animateIn();
  };

  const sendPhoneOTP = async () => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    try {
      // In production: call your backend API to send SMS OTP
      const otp = generateOTP();
      setGeneratedOTP(otp);
      setOtpMethod('phone');
      setOtpValue('');
      setOtpAttempts(0);

      // Show OTP in alert for development/demo (remove in production)
      Alert.alert(
        'OTP Sent',
        'Your verification code is: ' + otp + '\n\nSent to +91 ' + cleaned.slice(-10, -5) + ' ' + cleaned.slice(-5),
        [{ text: 'OK' }]
      );

      startResendTimer();
      setScreen('otp_verify');
      animateIn();
    } catch (e) {
      setError('Failed to send OTP. Please try again.');
    }
    setLoading(false);
  };

  const sendEmailOTP = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress.trim())) {
      setError('Please enter a valid email address');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const otp = generateOTP();
      setGeneratedOTP(otp);
      setOtpMethod('email');
      setOtpValue('');
      setOtpAttempts(0);

      Alert.alert(
        'OTP Sent',
        'Your verification code is: ' + otp + '\n\nSent to ' + emailAddress.trim(),
        [{ text: 'OK' }]
      );

      startResendTimer();
      setScreen('otp_verify');
      animateIn();
    } catch (e) {
      setError('Failed to send OTP. Please try again.');
    }
    setLoading(false);
  };

  const startResendTimer = () => {
    setOtpResendTimer(OTP_RESEND_COOLDOWN);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    otpTimerRef.current = setInterval(() => {
      setOtpResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(otpTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resendOTP = () => {
    if (otpResendTimer > 0) return;
    const otp = generateOTP();
    setGeneratedOTP(otp);
    setOtpValue('');
    setError('');
    startResendTimer();

    const destination = otpMethod === 'phone'
      ? '+91 ' + phoneNumber.replace(/\D/g, '').slice(-10)
      : emailAddress.trim();
    Alert.alert('OTP Resent', 'New code: ' + otp + '\n\nSent to ' + destination, [{ text: 'OK' }]);
  };

  const verifyOTP = async () => {
    if (otpValue.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit code');
      shakeError();
      return;
    }

    if (otpValue === generatedOTP) {
      setLoading(true);
      try {
        const method = otpMethod === 'phone' ? 'phone' : 'email';
        const data = otpMethod === 'phone'
          ? { phone: phoneNumber.replace(/\D/g, ''), method: 'phone_otp' }
          : { email: emailAddress.trim(), method: 'email_otp' };

        await socialLogin(method, data);

        if (otpMethod === 'phone') {
          await updateProfile({ phone: phoneNumber.replace(/\D/g, '') });
        }

        try {
          const { UserDB } = await safeDB();
          if (UserDB) {
            await UserDB.save({
              authMethod: method,
              ...(otpMethod === 'phone'
                ? { phone: phoneNumber.replace(/\D/g, '') }
                : { email: emailAddress.trim() }),
              verifiedAt: new Date().toISOString(),
            });
          }
        } catch (e) {}

        setScreen('setup_name');
        animateIn();
      } catch (e) {
        setError('Verification failed. Please try again.');
      }
      setLoading(false);
    } else {
      const newAttempts = otpAttempts + 1;
      setOtpAttempts(newAttempts);
      shakeError();
      if (newAttempts >= 5) {
        setError('Too many wrong attempts. Please request a new code.');
        setOtpValue('');
      } else {
        setError('Invalid code. ' + (5 - newAttempts) + ' attempts remaining.');
        setOtpValue('');
      }
    }
  };

  // ======= SOCIAL LOGIN (Google / Facebook / Instagram) =======

  const handleSocialLogin = async (provider) => {
    setSocialProvider(provider);
    setScreen('social_loading');
    setLoading(true);
    animateIn();

    // Simulate OAuth flow delay (in production: use expo-auth-session)
    setTimeout(async () => {
      try {
        const mockProfiles = {
          google: { name: '', email: 'user@gmail.com', avatar: null, provider: 'google' },
          facebook: { name: '', email: 'user@facebook.com', avatar: null, provider: 'facebook' },
          instagram: { name: '', username: '@user', avatar: null, provider: 'instagram' },
        };

        const profile = mockProfiles[provider];
        await socialLogin(provider, profile);

        try {
          const { UserDB } = await safeDB();
          if (UserDB) {
            await UserDB.save({
              authMethod: provider,
              socialProvider: provider,
              linkedAt: new Date().toISOString(),
            });
          }
        } catch (e) {}

        setLoading(false);
        setScreen('setup_name');
        animateIn();
      } catch (e) {
        setLoading(false);
        setError(provider + ' login failed. Please try again.');
        setScreen('welcome');
        animateIn();
      }
    }, 1500);
  };

  // ======= PIN FLOW (existing) =======

  const handlePinInput = (digit) => {
    if (isLocked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (screen === 'login') {
      const newPin = enteredPin + digit;
      setEnteredPin(newPin);
      setError('');
      if (newPin.length === PIN_LENGTH) {
        verifyEnteredPin(newPin);
      }
    } else if (screen === 'setup_pin') {
      if (!isConfirmStep) {
        const newPin = enteredPin + digit;
        setEnteredPin(newPin);
        setError('');
        if (newPin.length === PIN_LENGTH) {
          setTimeout(() => {
            setIsConfirmStep(true);
            setConfirmPin(newPin);
            setEnteredPin('');
          }, 200);
        }
      } else {
        const newPin = enteredPin + digit;
        setEnteredPin(newPin);
        setError('');
        if (newPin.length === PIN_LENGTH) {
          if (newPin === confirmPin) {
            completePinSetup(newPin);
          } else {
            shakeError();
            setError('PINs do not match. Try again.');
            setEnteredPin('');
            setIsConfirmStep(false);
            setConfirmPin('');
          }
        }
      }
    }
  };

  const handlePinDelete = () => {
    if (enteredPin.length > 0) {
      setEnteredPin(enteredPin.slice(0, -1));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const verifyEnteredPin = async (enteredValue) => {
    const result = verifyPin(enteredValue);
    if (result === 'normal') {
      await handleSuccessfulAuth('pin');
    } else if (result === 'duress') {
      await handleSuccessfulAuth('pin');
      if (onDuressTriggered) onDuressTriggered();
      enterDuressMode();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      shakeError();
      if (newAttempts >= MAX_ATTEMPTS) {
        startLockout();
      } else {
        setError('Wrong PIN. ' + (MAX_ATTEMPTS - newAttempts) + ' attempts left.');
      }
      setEnteredPin('');
    }
  };

  const startLockout = () => {
    setIsLocked(true);
    setLockTimer(LOCKOUT_DURATION);
    setError('Too many attempts. Locked for 60 seconds.');
    Vibration.vibrate([0, 500, 200, 500]);

    lockTimerRef.current = setInterval(() => {
      setLockTimer((prev) => {
        if (prev <= 1) {
          clearInterval(lockTimerRef.current);
          setIsLocked(false);
          setAttempts(0);
          setError('');
          setEnteredPin('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const shakeError = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const completePinSetup = async (newPin) => {
    setLoading(true);
    try {
      await setupPin(newPin);
      await socialLogin('pin', { method: 'pin' });
      try {
        const { UserDB } = await safeDB();
        if (UserDB) await UserDB.save({ authMethod: 'pin', pinSetAt: new Date().toISOString() });
      } catch (e) {}

      if (hasBiometric) {
        setScreen('biometric_setup');
      } else {
        setScreen('setup_name');
      }
      animateIn();
    } catch (e) {
      setError('Failed to set up PIN. Try again.');
    }
    setLoading(false);
  };

  const handleBiometricSetup = async (enable) => {
    if (enable) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Enable biometric unlock',
          cancelLabel: 'Cancel',
        });
        if (result.success) {
          await toggleBiometric(true);
          try {
            const { UserDB } = await safeDB();
            if (UserDB) await UserDB.save({ biometricEnabled: true });
          } catch (e) {}
        }
      } catch (e) {
        console.log('Bio setup error:', e);
      }
    }
    setScreen('setup_name');
    animateIn();
  };

  const completeSetup = async () => {
    setLoading(true);
    try {
      const trimmedName = name.trim();
      if (trimmedName) {
        await updateProfile({ fullName: trimmedName });
        try {
          const { UserDB } = await safeDB();
          if (UserDB) await UserDB.save({ fullName: trimmedName });
        } catch (e) {}
      }
      await handleSuccessfulAuth(otpMethod || socialProvider || 'pin');
    } catch (e) {
      console.error('Setup complete error:', e);
      await handleSuccessfulAuth('unknown');
    }
    setLoading(false);
  };

  const handleQuickStart = async () => {
    setLoading(true);
    try {
      await socialLogin('quick', { method: 'quick_start' });
      try {
        const { UserDB, SessionsDB } = await safeDB();
        if (UserDB) await UserDB.save({ authMethod: 'quick_start' });
        if (SessionsDB) await SessionsDB.start();
      } catch (e) {}
      authenticate();
    } catch (e) {
      authenticate();
    }
    setLoading(false);
  };

  const handleSuccessfulAuth = async (method) => {
    try {
      const { UserDB, SessionsDB } = await safeDB();
      if (SessionsDB) await SessionsDB.start();
      if (UserDB) await UserDB.save({ lastLogin: new Date().toISOString(), loginMethod: method });
    } catch (e) {
      console.log('Session save error:', e);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    authenticate();
  };

  const handleForgotPin = () => {
    Alert.alert(
      'Reset PIN',
      'This will erase your current PIN. Your data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await setupPin(null);
              setScreen('setup_pin');
              setEnteredPin('');
              setAttempts(0);
              setIsLocked(false);
              setError('');
              animateIn();
            } catch (e) {
              Alert.alert('Error', 'Failed to reset PIN');
            }
          },
        },
      ]
    );
  };

  const goBackToWelcome = () => {
    setError('');
    setEnteredPin('');
    setIsConfirmStep(false);
    setPhoneNumber('');
    setEmailAddress('');
    setOtpValue('');
    setOtpAttempts(0);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    setScreen('welcome');
    animateIn();
  };

  // ======= RENDER COMPONENTS =======

  const renderPinDots = () => (
    <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pinDot,
            i < enteredPin.length && styles.pinDotFilled,
            isLocked && styles.pinDotLocked,
          ]}
        />
      ))}
    </Animated.View>
  );

  const renderNumberPad = () => (
    <View style={styles.numberPad}>
      {[
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        ['bio', 0, 'del'],
      ].map((row, rowIndex) => (
        <View key={rowIndex} style={styles.numberRow}>
          {row.map((item) => {
            if (item === 'bio') {
              return (
                <TouchableOpacity
                  key="bio"
                  style={styles.numberBtn}
                  onPress={attemptBiometric}
                  disabled={!biometricEnabled || !hasBiometric || screen !== 'login'}
                >
                  {biometricEnabled && hasBiometric && screen === 'login' ? (
                    <Ionicons name="finger-print" size={28} color={COLORS.primary} />
                  ) : (
                    <View />
                  )}
                </TouchableOpacity>
              );
            }
            if (item === 'del') {
              return (
                <TouchableOpacity
                  key="del"
                  style={styles.numberBtn}
                  onPress={handlePinDelete}
                  onLongPress={() => setEnteredPin('')}
                >
                  <Ionicons name="backspace-outline" size={28} color={COLORS.text} />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={item}
                style={[styles.numberBtn, isLocked && styles.numberBtnDisabled]}
                onPress={() => handlePinInput(String(item))}
                disabled={isLocked}
                activeOpacity={0.6}
              >
                <Text style={[styles.numberText, isLocked && styles.numberTextDisabled]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );

  const renderBackButton = () => (
    <TouchableOpacity style={styles.backLink} onPress={goBackToWelcome}>
      <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
      <Text style={styles.backText}>Back</Text>
    </TouchableOpacity>
  );

  const renderDivider = (text) => (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{text}</Text>
      <View style={styles.dividerLine} />
    </View>
  );

  // ======= WELCOME SCREEN =======
  const renderWelcome = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <ScrollView
        contentContainerStyle={styles.welcomeScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeTop}>
          <Animated.View style={[styles.shieldContainer, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.shieldCircle}>
              <Ionicons name="shield-checkmark" size={56} color={COLORS.white} />
            </View>
          </Animated.View>
          <Text style={styles.appTitle}>SafeHer</Text>
          <Text style={styles.appSubtitle}>Your Personal Safety Guardian</Text>
        </View>

        {/* Social Login Buttons */}
        <View style={styles.socialSection}>
          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#DB4437' }]}
            onPress={() => handleSocialLogin('google')}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-google" size={22} color="#FFF" />
            <Text style={styles.socialBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#1877F2' }]}
            onPress={() => handleSocialLogin('facebook')}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-facebook" size={22} color="#FFF" />
            <Text style={styles.socialBtnText}>Continue with Facebook</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.socialBtn, { backgroundColor: '#E4405F' }]}
            onPress={() => handleSocialLogin('instagram')}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-instagram" size={22} color="#FFF" />
            <Text style={styles.socialBtnText}>Continue with Instagram</Text>
          </TouchableOpacity>
        </View>

        {renderDivider('or')}

        {/* Phone & Email Login */}
        <View style={styles.otpSection}>
          <TouchableOpacity
            style={[styles.otpMethodBtn, { borderColor: '#00C853' }]}
            onPress={startPhoneLogin}
            activeOpacity={0.8}
          >
            <View style={[styles.otpIconCircle, { backgroundColor: '#00C85315' }]}>
              <Ionicons name="call" size={20} color="#00C853" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.otpMethodTitle}>Mobile Number</Text>
              <Text style={styles.otpMethodSub}>Login with OTP</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.otpMethodBtn, { borderColor: '#2196F3' }]}
            onPress={startEmailLogin}
            activeOpacity={0.8}
          >
            <View style={[styles.otpIconCircle, { backgroundColor: '#2196F315' }]}>
              <Ionicons name="mail" size={20} color="#2196F3" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.otpMethodTitle}>Email / Gmail</Text>
              <Text style={styles.otpMethodSub}>Login with OTP</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {renderDivider('or')}

        {/* PIN & Quick Start */}
        <View style={styles.pinSection}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { setScreen('setup_pin'); setEnteredPin(''); setIsConfirmStep(false); setError(''); animateIn(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed" size={20} color={COLORS.white} style={{ marginRight: 10 }} />
            <Text style={styles.primaryBtnText}>Set Up PIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleQuickStart}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                <Text style={styles.secondaryBtnText}>Quick Start</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Quick Start skips authentication {'\u2014'} set up a PIN later in Settings
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );

  // ======= PHONE INPUT SCREEN =======
  const renderPhoneInput = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
        <View style={styles.otpTop}>
          <View style={[styles.otpBigIcon, { backgroundColor: '#00C85315' }]}>
            <Ionicons name="call" size={48} color="#00C853" />
          </View>
          <Text style={styles.loginTitle}>Phone Login</Text>
          <Text style={styles.loginSubtitle}>{"We'll send a 6-digit OTP to verify your number"}</Text>
        </View>

        <View style={styles.phoneInputRow}>
          <View style={styles.countryCode}>
            <Text style={styles.countryFlag}>{'\uD83C\uDDEE\uD83C\uDDF3'}</Text>
            <Text style={styles.countryCodeText}>+91</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter mobile number"
            placeholderTextColor={COLORS.textLight}
            value={phoneNumber}
            onChangeText={(text) => { setPhoneNumber(text.replace(/[^0-9]/g, '')); setError(''); }}
            keyboardType="phone-pad"
            maxLength={10}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 24 }, phoneNumber.replace(/\D/g, '').length < 10 && styles.btnDisabled]}
          onPress={sendPhoneOTP}
          disabled={loading || phoneNumber.replace(/\D/g, '').length < 10}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>Send OTP</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        {renderBackButton()}
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // ======= EMAIL INPUT SCREEN =======
  const renderEmailInput = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
        <View style={styles.otpTop}>
          <View style={[styles.otpBigIcon, { backgroundColor: '#2196F315' }]}>
            <Ionicons name="mail" size={48} color="#2196F3" />
          </View>
          <Text style={styles.loginTitle}>Email Login</Text>
          <Text style={styles.loginSubtitle}>{"We'll send a 6-digit OTP to verify your email"}</Text>
        </View>

        <TextInput
          style={styles.emailInput}
          placeholder="Enter your email address"
          placeholderTextColor={COLORS.textLight}
          value={emailAddress}
          onChangeText={(text) => { setEmailAddress(text); setError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={100}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 24 }, !emailAddress.trim() && styles.btnDisabled]}
          onPress={sendEmailOTP}
          disabled={loading || !emailAddress.trim()}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>Send OTP</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>

        {renderBackButton()}
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // ======= OTP VERIFICATION SCREEN =======
  const renderOTPVerify = () => {
    const destination = otpMethod === 'phone'
      ? '+91 ' + phoneNumber.replace(/\D/g, '').slice(0, 5) + ' \u2022\u2022\u2022\u2022\u2022'
      : emailAddress.replace(/(.{3}).+(@.+)/, '\u2022\u2022\u2022');

    return (
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
          <View style={styles.otpTop}>
            <View style={[styles.otpBigIcon, { backgroundColor: COLORS.primaryLight + '30' }]}>
              <Ionicons name="keypad" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.loginTitle}>Verify OTP</Text>
            <Text style={styles.loginSubtitle}>
              {'Enter the 6-digit code sent to\n'}
              <Text style={{ fontWeight: '700', color: COLORS.text }}>{destination}</Text>
            </Text>
          </View>

          <Animated.View style={[styles.otpBoxRow, { transform: [{ translateX: shakeAnim }] }]}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  i < otpValue.length && styles.otpBoxFilled,
                  error && otpAttempts > 0 && styles.otpBoxError,
                ]}
              >
                <Text style={styles.otpBoxText}>
                  {otpValue[i] || ''}
                </Text>
              </View>
            ))}
          </Animated.View>

          <TextInput
            ref={otpInputRef}
            style={styles.hiddenOtpInput}
            value={otpValue}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
              setOtpValue(cleaned);
              setError('');
            }}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
          />

          <TouchableOpacity
            style={styles.otpTapArea}
            onPress={() => otpInputRef.current && otpInputRef.current.focus()}
            activeOpacity={1}
          >
            <Text style={styles.otpTapHint}>Tap here to type OTP</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 20 }, otpValue.length < OTP_LENGTH && styles.btnDisabled]}
            onPress={verifyOTP}
            disabled={loading || otpValue.length < OTP_LENGTH}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>{"Didn't receive it? "}</Text>
            {otpResendTimer > 0 ? (
              <Text style={styles.resendTimer}>{'Resend in ' + otpResendTimer + 's'}</Text>
            ) : (
              <TouchableOpacity onPress={resendOTP}>
                <Text style={styles.resendLink}>Resend OTP</Text>
              </TouchableOpacity>
            )}
          </View>

          {renderBackButton()}
        </KeyboardAvoidingView>
      </Animated.View>
    );
  };

  // ======= SOCIAL LOADING SCREEN =======
  const renderSocialLoading = () => {
    const providerConfig = {
      google: { color: '#DB4437', icon: 'logo-google', label: 'Google' },
      facebook: { color: '#1877F2', icon: 'logo-facebook', label: 'Facebook' },
      instagram: { color: '#E4405F', icon: 'logo-instagram', label: 'Instagram' },
    };
    const config = providerConfig[socialProvider] || providerConfig.google;

    return (
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.socialLoadingContainer}>
          <View style={[styles.socialLoadingIcon, { backgroundColor: config.color }]}>
            <Ionicons name={config.icon} size={48} color="#FFF" />
          </View>
          <Text style={styles.socialLoadingText}>{'Connecting to ' + config.label + '...'}</Text>
          <ActivityIndicator size="large" color={config.color} style={{ marginTop: 24 }} />
          <Text style={styles.socialLoadingSubtext}>Please wait while we verify your account</Text>
        </View>
      </Animated.View>
    );
  };

  // ======= LOGIN SCREEN (existing PIN) =======
  const renderLogin = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.loginTop}>
        <View style={styles.loginShield}>
          <Ionicons name="shield-checkmark" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.loginTitle}>Welcome Back</Text>
        <Text style={styles.loginSubtitle}>
          {isLocked
            ? 'Locked \u2014 try again in ' + lockTimer + 's'
            : biometricEnabled
              ? 'Enter PIN or use biometrics'
              : 'Enter your 4-digit PIN'
          }
        </Text>
      </View>

      {renderPinDots()}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {renderNumberPad()}

      <View style={styles.loginFooter}>
        <TouchableOpacity onPress={handleForgotPin}>
          <Text style={styles.forgotText}>Forgot PIN?</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // --- SETUP PIN SCREEN ---
  const renderSetupPin = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.loginTop}>
        <View style={styles.setupBadge}>
          <Ionicons name="lock-closed" size={32} color={COLORS.white} />
        </View>
        <Text style={styles.loginTitle}>
          {isConfirmStep ? 'Confirm PIN' : 'Create PIN'}
        </Text>
        <Text style={styles.loginSubtitle}>
          {isConfirmStep
            ? 'Re-enter your 4-digit PIN to confirm'
            : 'Choose a 4-digit PIN to secure your app'
          }
        </Text>
      </View>

      {renderPinDots()}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Setting up...</Text>
        </View>
      ) : (
        renderNumberPad()
      )}

      {renderBackButton()}
    </Animated.View>
  );

  // --- BIOMETRIC SETUP SCREEN ---
  const renderBiometricSetup = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bioSetupContent}>
        <View style={styles.bioIcon}>
          <Ionicons name="finger-print" size={72} color={COLORS.primary} />
        </View>
        <Text style={styles.loginTitle}>Enable Biometrics?</Text>
        <Text style={styles.loginSubtitle}>
          Unlock SafeHer with your fingerprint or face for quick access
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 40 }]}
          onPress={() => handleBiometricSetup(true)}
        >
          <Ionicons name="finger-print" size={22} color={COLORS.white} style={{ marginRight: 10 }} />
          <Text style={styles.primaryBtnText}>Enable</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { marginTop: 12 }]}
          onPress={() => handleBiometricSetup(false)}
        >
          <Text style={styles.secondaryBtnText}>Skip for Now</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  // --- NAME ENTRY SCREEN ---
  const renderNameSetup = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.nameContent}
      >
        <View style={styles.nameTop}>
          <View style={styles.nameIcon}>
            <Ionicons name="person" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.loginTitle}>{"What's your name?"}</Text>
          <Text style={styles.loginSubtitle}>This helps personalize your experience</Text>
        </View>

        <TextInput
          style={styles.nameInput}
          placeholder="Enter your name"
          placeholderTextColor={COLORS.textLight}
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={completeSetup}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 24 }]}
          onPress={completeSetup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={COLORS.white} style={{ marginRight: 10 }} />
              <Text style={styles.primaryBtnText}>
                {name.trim() ? 'Continue' : 'Skip'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // ======= MAIN RENDER =======
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {screen === 'welcome' && renderWelcome()}
      {screen === 'login' && renderLogin()}
      {screen === 'setup_pin' && renderSetupPin()}
      {screen === 'biometric_setup' && renderBiometricSetup()}
      {screen === 'setup_name' && renderNameSetup()}
      {screen === 'phone_input' && renderPhoneInput()}
      {screen === 'email_input' && renderEmailInput()}
      {screen === 'otp_verify' && renderOTPVerify()}
      {screen === 'social_loading' && renderSocialLoading()}
    </View>
  );
}

// ======= STYLES =======
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  welcomeScroll: {
    paddingBottom: 40,
  },
  welcomeTop: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 24,
  },
  shieldContainer: {
    marginBottom: 16,
  },
  shieldCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  appSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  socialSection: {
    gap: 10,
    marginBottom: 4,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: SIZES.radiusMd,
    gap: 12,
    ...SHADOWS.small,
  },
  socialBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  otpSection: {
    gap: 10,
    marginBottom: 4,
  },
  otpMethodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    gap: 12,
    ...SHADOWS.small,
  },
  otpIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpMethodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  otpMethodSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  pinSection: {
    marginTop: 0,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radiusLg,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusLg,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  disclaimer: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 14,
  },
  otpContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 60,
  },
  otpTop: {
    alignItems: 'center',
    marginBottom: 32,
  },
  otpBigIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: 6,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.border,
    letterSpacing: 2,
  },
  emailInput: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  otpBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  otpBox: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight + '20',
  },
  otpBoxError: {
    borderColor: COLORS.danger,
  },
  otpBoxText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  otpTapArea: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  otpTapHint: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  resendText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resendTimer: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  resendLink: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
  socialLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  socialLoadingIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...SHADOWS.large,
  },
  socialLoadingText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  socialLoadingSubtext: {
    fontSize: 14,
    color: COLORS.textLight,
    marginTop: 12,
  },
  loginTop: {
    alignItems: 'center',
    marginBottom: 30,
  },
  loginShield: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  loginSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 21,
  },
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 16,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: COLORS.primary,
  },
  pinDotLocked: {
    borderColor: COLORS.danger,
  },
  numberPad: {
    alignItems: 'center',
    marginTop: 10,
  },
  numberRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  numberBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  numberBtnDisabled: {
    opacity: 0.4,
  },
  numberText: {
    fontSize: 28,
    fontWeight: '600',
    color: COLORS.text,
  },
  numberTextDisabled: {
    color: COLORS.textLight,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  loginFooter: {
    alignItems: 'center',
    marginTop: 16,
    paddingBottom: 30,
  },
  forgotText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  setupBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingBottom: 30,
  },
  backText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: 6,
    fontWeight: '500',
  },
  bioSetupContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  bioIcon: {
    marginBottom: 24,
  },
  nameContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  nameTop: {
    alignItems: 'center',
    marginBottom: 40,
  },
  nameIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  nameInput: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '500',
    borderWidth: 2,
    borderColor: COLORS.border,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
});

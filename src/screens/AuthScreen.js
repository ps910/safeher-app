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
import JWTAuthService from '../services/JWTAuthService';

// Safe dimensions
const windowDims = Dimensions.get('window') || {};
const width = windowDims.width || 400;
const height = windowDims.height || 800;

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60;
const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN = 30;

export default function AuthScreen({ onDuressTriggered }) {
  const {
    pin, biometricEnabled, authMethod,
    setupPin, verifyPin, authenticate, enterDuressMode,
    socialLogin, updateProfile, toggleBiometric, userProfile,
    issueJWTTokens, getAccessToken,
    // Passkey
    passkeyAvailable, passkeyRegistered,
    registerPasskey, authenticateWithPasskey,
    // OAuth
    authenticateWithOAuth,
    // Magic Link & OTP
    sendPhoneOTP: ctxSendPhoneOTP, sendEmailOTP: ctxSendEmailOTP,
    verifyOTPAndAuth, sendMagicLink, verifyMagicLinkAndAuth,
    // Password + MFA
    hasPasswordSet, mfaEnabled, pendingMFA,
    createPassword, verifyPasswordAndAuth,
    verifyMFAAndAuth, enableMFA, validatePassword,
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
  const [socialEmail, setSocialEmail] = useState('');
  const [socialName, setSocialName] = useState('');
  const [otpSessionId, setOtpSessionId] = useState('');

  // Password + MFA state
  const [passwordEmail, setPasswordEmail] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState('');

  // Magic link state
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkToken, setMagicLinkToken] = useState('');

  // --- Animations ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lockTimerRef = useRef(null);
  const otpTimerRef = useRef(null);
  const otpInputRef = useRef(null);
  const autoFillTimerRef = useRef(null);

  // --- Init ---
  useEffect(() => {
    checkBiometricAvailability();
    determineInitialScreen();
    animateIn();
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
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
        await handleSuccessfulAuth('biometric', {});
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
      const result = await ctxSendPhoneOTP(cleaned);
      setOtpSessionId(result.sessionId);
      setOtpMethod('phone');
      setOtpValue('');
      setOtpAttempts(0);
      setGeneratedOTP(result.code || '');

      startResendTimer();
      setScreen('otp_verify');
      animateIn();

      // Auto-fill OTP after delay (simulates SMS auto-read)
      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
      if (result.code) {
        autoFillTimerRef.current = setTimeout(() => {
          setOtpValue(result.code);
        }, 2500);
      }
    } catch (e) {
      setError(e.message || 'Failed to send OTP. Please try again.');
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
      const result = await ctxSendEmailOTP(emailAddress.trim());
      setOtpSessionId(result.sessionId);
      setOtpMethod('email');
      setOtpValue('');
      setOtpAttempts(0);
      setGeneratedOTP(result.code || '');

      startResendTimer();
      setScreen('otp_verify');
      animateIn();

      // Auto-fill OTP after delay (simulates email auto-read)
      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
      if (result.code) {
        autoFillTimerRef.current = setTimeout(() => {
          setOtpValue(result.code);
        }, 2500);
      }
    } catch (e) {
      setError(e.message || 'Failed to send OTP. Please try again.');
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

  const resendOTP = async () => {
    if (otpResendTimer > 0) return;
    try {
      let result;
      if (otpMethod === 'phone') {
        result = await ctxSendPhoneOTP(phoneNumber.replace(/\D/g, ''));
      } else {
        result = await ctxSendEmailOTP(emailAddress.trim());
      }
      setOtpSessionId(result.sessionId);
      setGeneratedOTP(result.code || '');
      setOtpValue('');
      setError('');
      startResendTimer();

      if (result.code && autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
      if (result.code) {
        autoFillTimerRef.current = setTimeout(() => {
          setOtpValue(result.code);
        }, 2500);
      }
    } catch (e) {
      setError(e.message || 'Failed to resend OTP');
    }
  };

  const verifyOTP = async () => {
    if (otpValue.length !== OTP_LENGTH) {
      setError('Please enter the complete 6-digit code');
      shakeError();
      return;
    }

    setLoading(true);
    try {
      const extra = otpMethod === 'phone'
        ? { phone: phoneNumber.replace(/\D/g, '') }
        : { email: emailAddress.trim() };

      const result = await verifyOTPAndAuth(otpSessionId, otpValue, extra);

      if (result.success) {
        if (otpMethod === 'phone') {
          await updateProfile({ phone: phoneNumber.replace(/\D/g, '') });
        }
        setScreen('setup_name');
        animateIn();
      } else {
        const newAttempts = otpAttempts + 1;
        setOtpAttempts(newAttempts);
        shakeError();
        setError(result.error || 'Invalid code. ' + (5 - newAttempts) + ' attempts remaining.');
        setOtpValue('');
      }
    } catch (e) {
      const newAttempts = otpAttempts + 1;
      setOtpAttempts(newAttempts);
      shakeError();
      setError(e.message || 'Verification failed. Please try again.');
      setOtpValue('');
    }
    setLoading(false);
  };

  // ======= SOCIAL LOGIN (OAuth 2.0 + OIDC) =======

  const handleSocialLogin = async (provider) => {
    setSocialProvider(provider);
    setSocialEmail('');
    setSocialName('');
    setError('');
    setScreen('social_account_input');
    animateIn();
  };

  const completeSocialLogin = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(socialEmail.trim())) {
      setError('Please enter a valid email address');
      shakeError();
      return;
    }

    setScreen('social_loading');
    setLoading(true);
    animateIn();

    setTimeout(async () => {
      try {
        await authenticateWithOAuth(socialProvider, {
          email: socialEmail.trim(),
          name: socialName.trim(),
        });

        setLoading(false);
        if (socialName.trim()) setName(socialName.trim());
        setScreen('setup_name');
        animateIn();
      } catch (e) {
        setLoading(false);
        setError(socialProvider + ' login failed. Please try again.');
        setScreen('welcome');
        animateIn();
      }
    }, 1500);
  };

  // ======= PASSKEY (WebAuthn/FIDO2) FLOW =======

  const handlePasskeyAuth = async () => {
    setLoading(true);
    setError('');
    try {
      if (passkeyRegistered) {
        await authenticateWithPasskey();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await handleSuccessfulAuth('passkey', {});
      } else {
        setScreen('passkey_register');
        animateIn();
      }
    } catch (e) {
      setError(e.message || 'Passkey authentication failed');
      shakeError();
    }
    setLoading(false);
  };

  const handlePasskeyRegister = async () => {
    setLoading(true);
    setError('');
    try {
      await registerPasskey({
        displayName: name || userProfile.fullName || '',
        email: emailAddress || userProfile.email || '',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreen('setup_name');
      animateIn();
    } catch (e) {
      setError(e.message || 'Passkey registration failed');
      shakeError();
    }
    setLoading(false);
  };

  // ======= PASSWORD + MFA FLOW =======

  const handlePasswordScreen = (isSignupMode) => {
    setIsSignup(isSignupMode);
    setPasswordEmail('');
    setPasswordValue('');
    setPasswordConfirm('');
    setPasswordStrength(null);
    setShowPassword(false);
    setError('');
    setScreen('password_auth');
    animateIn();
  };

  const handlePasswordAction = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(passwordEmail.trim())) {
      setError('Please enter a valid email address');
      shakeError();
      return;
    }
    if (!passwordValue) {
      setError('Please enter a password');
      shakeError();
      return;
    }

    if (isSignup) {
      // Validate password match
      if (passwordValue !== passwordConfirm) {
        setError('Passwords do not match');
        shakeError();
        return;
      }
      // Validate strength
      const strength = validatePassword(passwordValue);
      if (!strength.isValid) {
        setError(strength.issues[0] || 'Password does not meet requirements');
        shakeError();
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      if (isSignup) {
        const result = await createPassword(passwordEmail.trim(), passwordValue);
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Auto-login after signup
          const loginResult = await verifyPasswordAndAuth(passwordEmail.trim(), passwordValue);
          if (loginResult.mfaRequired) {
            setMfaMethod(loginResult.mfaMethods?.[0] || 'totp');
            setMfaCode('');
            setScreen('mfa_verify');
            animateIn();
          } else {
            setScreen('setup_name');
            animateIn();
          }
        } else {
          setError(result.error || 'Failed to create account');
          shakeError();
        }
      } else {
        const result = await verifyPasswordAndAuth(passwordEmail.trim(), passwordValue);
        if (result.success) {
          if (result.mfaRequired) {
            setMfaMethod(result.mfaMethods?.[0] || 'totp');
            setMfaCode('');
            setScreen('mfa_verify');
            animateIn();
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setScreen('setup_name');
            animateIn();
          }
        } else {
          setError(result.error || 'Invalid email or password');
          shakeError();
        }
      }
    } catch (e) {
      setError(e.message || 'Authentication failed');
      shakeError();
    }
    setLoading(false);
  };

  const handleMFAVerify = async () => {
    if (mfaCode.length < 6) {
      setError('Please enter the complete code');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyMFAAndAuth(mfaMethod, mfaCode);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScreen('setup_name');
        animateIn();
      } else {
        setError(result.error || 'Invalid MFA code');
        shakeError();
        setMfaCode('');
      }
    } catch (e) {
      setError(e.message || 'MFA verification failed');
      shakeError();
      setMfaCode('');
    }
    setLoading(false);
  };

  // ======= MAGIC LINK FLOW =======

  const handleMagicLinkScreen = () => {
    setMagicLinkEmail('');
    setMagicLinkSent(false);
    setMagicLinkToken('');
    setError('');
    setScreen('magic_link');
    animateIn();
  };

  const handleSendMagicLink = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(magicLinkEmail.trim())) {
      setError('Please enter a valid email address');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await sendMagicLink(magicLinkEmail.trim());
      setMagicLinkSent(true);
      // In demo: auto-fill the token for testing
      if (result.token) setMagicLinkToken(result.token);
    } catch (e) {
      setError(e.message || 'Failed to send magic link');
    }
    setLoading(false);
  };

  const handleVerifyMagicLink = async () => {
    if (!magicLinkToken.trim()) {
      setError('Please enter the magic link token');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyMagicLinkAndAuth(magicLinkToken.trim());
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScreen('setup_name');
        animateIn();
      } else {
        setError(result.error || 'Invalid or expired magic link');
        shakeError();
      }
    } catch (e) {
      setError(e.message || 'Magic link verification failed');
      shakeError();
    }
    setLoading(false);
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
      await handleSuccessfulAuth('pin', {});
    } else if (result === 'duress') {
      await handleSuccessfulAuth('pin', {}, true);
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
      }
      await handleSuccessfulAuth(otpMethod || socialProvider || 'pin', {});
    } catch (e) {
      console.error('Setup complete error:', e);
      await handleSuccessfulAuth('unknown', {});
    }
    setLoading(false);
  };

  const handleQuickStart = async () => {
    setLoading(true);
    try {
      await socialLogin('quick', { method: 'quick_start' });
      await authenticate('quick', {});
    } catch (e) {
      await authenticate('quick', {});
    }
    setLoading(false);
  };

  const handleSuccessfulAuth = async (method, extra = {}, isDuress = false) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await authenticate(method, extra, isDuress);
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
    setSocialEmail('');
    setSocialName('');
    setPasswordEmail('');
    setPasswordValue('');
    setPasswordConfirm('');
    setPasswordStrength(null);
    setMfaCode('');
    setMagicLinkEmail('');
    setMagicLinkSent(false);
    setMagicLinkToken('');
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
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

        {/* Social Login Buttons (OAuth 2.0 + OIDC) */}
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
            style={[styles.socialBtn, { backgroundColor: '#000000' }]}
            onPress={() => handleSocialLogin('apple')}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-apple" size={22} color="#FFF" />
            <Text style={styles.socialBtnText}>Continue with Apple</Text>
          </TouchableOpacity>
        </View>

        {renderDivider('or sign in with')}

        {/* Passkey (WebAuthn/FIDO2) */}
        {passkeyAvailable && (
          <TouchableOpacity
            style={[styles.otpMethodBtn, { borderColor: '#6C63FF', marginBottom: 10 }]}
            onPress={handlePasskeyAuth}
            activeOpacity={0.8}
          >
            <View style={[styles.otpIconCircle, { backgroundColor: '#6C63FF15' }]}>
              <Ionicons name="finger-print" size={20} color="#6C63FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.otpMethodTitle}>Passkey {passkeyRegistered ? '' : '(New)'}</Text>
              <Text style={styles.otpMethodSub}>WebAuthn / FIDO2 biometric login</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        )}

        {/* Password + MFA */}
        <View style={styles.otpSection}>
          <TouchableOpacity
            style={[styles.otpMethodBtn, { borderColor: '#7B1FA2' }]}
            onPress={() => handlePasswordScreen(false)}
            activeOpacity={0.8}
          >
            <View style={[styles.otpIconCircle, { backgroundColor: '#7B1FA215' }]}>
              <Ionicons name="key" size={20} color="#7B1FA2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.otpMethodTitle}>Password Login</Text>
              <Text style={styles.otpMethodSub}>Email & password with MFA</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.otpMethodBtn, { borderColor: '#FF6F00' }]}
            onPress={handleMagicLinkScreen}
            activeOpacity={0.8}
          >
            <View style={[styles.otpIconCircle, { backgroundColor: '#FF6F0015' }]}>
              <Ionicons name="link" size={20} color="#FF6F00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.otpMethodTitle}>Magic Link</Text>
              <Text style={styles.otpMethodSub}>Passwordless email login</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {renderDivider('or use OTP')}

        {/* Phone & Email OTP */}
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

        {/* PIN, Create Account & Quick Start */}
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
            style={[styles.secondaryBtn, { borderColor: '#7B1FA2' }]}
            onPress={() => handlePasswordScreen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={20} color="#7B1FA2" style={{ marginRight: 10 }} />
            <Text style={[styles.secondaryBtnText, { color: '#7B1FA2' }]}>Create Account (Email & Password)</Text>
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
      : emailAddress.replace(/(.{3}).+(@.+)/, '$1\u2022\u2022\u2022$2');

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

  // ======= SOCIAL ACCOUNT INPUT SCREEN =======
  const renderSocialAccountInput = () => {
    const providerConfig = {
      google: { color: '#DB4437', icon: 'logo-google', label: 'Google', emailPlaceholder: 'Enter your Gmail address' },
      facebook: { color: '#1877F2', icon: 'logo-facebook', label: 'Facebook', emailPlaceholder: 'Enter your Facebook email' },
      instagram: { color: '#E4405F', icon: 'logo-instagram', label: 'Instagram', emailPlaceholder: 'Enter your Instagram email' },
    };
    const config = providerConfig[socialProvider] || providerConfig.google;

    return (
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
          <View style={styles.otpTop}>
            <View style={[styles.socialLoadingIcon, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon} size={48} color="#FFF" />
            </View>
            <Text style={styles.loginTitle}>{'Sign in with ' + config.label}</Text>
            <Text style={styles.loginSubtitle}>{'Enter your ' + config.label + ' account details to continue'}</Text>
          </View>

          <TextInput
            style={styles.emailInput}
            placeholder={config.emailPlaceholder}
            placeholderTextColor={COLORS.textLight}
            value={socialEmail}
            onChangeText={(text) => { setSocialEmail(text); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={100}
          />

          <TextInput
            style={[styles.emailInput, { marginTop: 12 }]}
            placeholder="Enter your name"
            placeholderTextColor={COLORS.textLight}
            value={socialName}
            onChangeText={setSocialName}
            maxLength={50}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 24, backgroundColor: config.color }, !socialEmail.trim() && styles.btnDisabled]}
            onPress={completeSocialLogin}
            disabled={loading || !socialEmail.trim()}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} size="small" />
            ) : (
              <>
                <Ionicons name={config.icon} size={20} color="#FFF" style={{ marginRight: 10 }} />
                <Text style={styles.primaryBtnText}>{'Continue with ' + config.label}</Text>
              </>
            )}
          </TouchableOpacity>

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

  // ======= PASSKEY REGISTER SCREEN =======
  const renderPasskeyRegister = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bioSetupContent}>
        <View style={[styles.socialLoadingIcon, { backgroundColor: '#6C63FF' }]}>
          <Ionicons name="finger-print" size={56} color="#FFF" />
        </View>
        <Text style={styles.loginTitle}>Set Up Passkey</Text>
        <Text style={styles.loginSubtitle}>
          Register a passkey using your device biometrics.{'\n'}
          Fast, secure, and passwordless authentication.
        </Text>

        <View style={styles.passkeyFeatures}>
          <View style={styles.featureRow}>
            <Ionicons name="shield-checkmark" size={20} color="#6C63FF" />
            <Text style={styles.featureText}>FIDO2 / WebAuthn standard</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="finger-print" size={20} color="#6C63FF" />
            <Text style={styles.featureText}>Biometric verification required</Text>
          </View>
          <View style={styles.featureRow}>
            <Ionicons name="key" size={20} color="#6C63FF" />
            <Text style={styles.featureText}>Cryptographic key pair on device</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 32, backgroundColor: '#6C63FF' }]}
          onPress={handlePasskeyRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Ionicons name="finger-print" size={22} color={COLORS.white} style={{ marginRight: 10 }} />
              <Text style={styles.primaryBtnText}>Register Passkey</Text>
            </>
          )}
        </TouchableOpacity>

        {error ? <Text style={[styles.errorText, { marginTop: 16 }]}>{error}</Text> : null}
        {renderBackButton()}
      </View>
    </Animated.View>
  );

  // ======= PASSWORD AUTH SCREEN =======
  const renderPasswordAuth = () => {
    const strengthColors = ['#F44336', '#FF9800', '#FFC107', '#8BC34A', '#4CAF50'];
    const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

    return (
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.otpTop}>
              <View style={[styles.otpBigIcon, { backgroundColor: '#7B1FA215' }]}>
                <Ionicons name={isSignup ? 'person-add' : 'key'} size={48} color="#7B1FA2" />
              </View>
              <Text style={styles.loginTitle}>{isSignup ? 'Create Account' : 'Password Login'}</Text>
              <Text style={styles.loginSubtitle}>
                {isSignup
                  ? 'Create a secure account with email & password'
                  : 'Sign in with your email & password'}
              </Text>
            </View>

            <TextInput
              style={styles.emailInput}
              placeholder="Email address"
              placeholderTextColor={COLORS.textLight}
              value={passwordEmail}
              onChangeText={(t) => { setPasswordEmail(t); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={100}
            />

            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.emailInput, { flex: 1, marginTop: 12 }]}
                placeholder="Password"
                placeholderTextColor={COLORS.textLight}
                value={passwordValue}
                onChangeText={(t) => {
                  setPasswordValue(t);
                  setError('');
                  if (isSignup && t) {
                    setPasswordStrength(validatePassword(t));
                  } else {
                    setPasswordStrength(null);
                  }
                }}
                secureTextEntry={!showPassword}
                maxLength={128}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            {isSignup && passwordStrength && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarBg}>
                  <View style={[
                    styles.strengthBarFill,
                    {
                      width: Math.min(100, (passwordStrength.score / 7) * 100) + '%',
                      backgroundColor: strengthColors[Math.min(Math.floor(passwordStrength.score / 2), 4)],
                    },
                  ]} />
                </View>
                <Text style={[
                  styles.strengthLabel,
                  { color: strengthColors[Math.min(Math.floor(passwordStrength.score / 2), 4)] },
                ]}>
                  {strengthLabels[Math.min(Math.floor(passwordStrength.score / 2), 4)]}
                </Text>
                {passwordStrength.issues?.length > 0 && (
                  <Text style={styles.strengthIssue}>{passwordStrength.issues[0]}</Text>
                )}
              </View>
            )}

            {isSignup && (
              <TextInput
                style={[styles.emailInput, { marginTop: 12 }]}
                placeholder="Confirm password"
                placeholderTextColor={COLORS.textLight}
                value={passwordConfirm}
                onChangeText={(t) => { setPasswordConfirm(t); setError(''); }}
                secureTextEntry={!showPassword}
                maxLength={128}
              />
            )}

            {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24, backgroundColor: '#7B1FA2' },
                (!passwordEmail.trim() || !passwordValue) && styles.btnDisabled]}
              onPress={handlePasswordAction}
              disabled={loading || !passwordEmail.trim() || !passwordValue}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name={isSignup ? 'person-add' : 'log-in'} size={20} color="#FFF" style={{ marginRight: 10 }} />
                  <Text style={styles.primaryBtnText}>{isSignup ? 'Create Account' : 'Sign In'}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ alignItems: 'center', marginTop: 16 }}
              onPress={() => { setIsSignup(!isSignup); setError(''); setPasswordStrength(null); }}
            >
              <Text style={styles.resendLink}>
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
              </Text>
            </TouchableOpacity>

            {renderBackButton()}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    );
  };

  // ======= MFA VERIFY SCREEN =======
  const renderMFAVerify = () => {
    const mfaConfigs = {
      totp: { icon: 'time', color: '#009688', label: 'Authenticator App', hint: 'Enter the 6-digit code from your authenticator app' },
      sms: { icon: 'chatbubble-ellipses', color: '#00C853', label: 'SMS Code', hint: 'Enter the 6-digit code sent to your phone' },
      email: { icon: 'mail', color: '#2196F3', label: 'Email Code', hint: 'Enter the 6-digit code sent to your email' },
      biometric: { icon: 'finger-print', color: '#6C63FF', label: 'Biometric', hint: 'Verify with your fingerprint or face' },
      recovery: { icon: 'key', color: '#FF5722', label: 'Recovery Code', hint: 'Enter one of your 8-character recovery codes' },
    };
    const config = mfaConfigs[mfaMethod] || mfaConfigs.totp;
    const availableMethods = pendingMFA?.methods || [];

    return (
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
          <View style={styles.otpTop}>
            <View style={[styles.otpBigIcon, { backgroundColor: config.color + '15' }]}>
              <Ionicons name={config.icon} size={48} color={config.color} />
            </View>
            <Text style={styles.loginTitle}>Two-Factor Auth</Text>
            <Text style={styles.loginSubtitle}>{config.hint}</Text>
          </View>

          {mfaMethod === 'biometric' ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: config.color }]}
              onPress={() => handleMFAVerify()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="finger-print" size={22} color="#FFF" style={{ marginRight: 10 }} />
                  <Text style={styles.primaryBtnText}>Verify Biometric</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={[styles.emailInput, { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '700' }]}
                placeholder={mfaMethod === 'recovery' ? 'XXXXXXXX' : '000000'}
                placeholderTextColor={COLORS.textLight}
                value={mfaCode}
                onChangeText={(t) => { setMfaCode(t.replace(/[^a-zA-Z0-9]/g, '')); setError(''); }}
                keyboardType={mfaMethod === 'recovery' ? 'default' : 'number-pad'}
                maxLength={mfaMethod === 'recovery' ? 8 : 6}
                autoFocus
              />

              {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 24, backgroundColor: config.color },
                  mfaCode.length < (mfaMethod === 'recovery' ? 8 : 6) && styles.btnDisabled]}
                onPress={handleMFAVerify}
                disabled={loading || mfaCode.length < (mfaMethod === 'recovery' ? 8 : 6)}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verify & Continue</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Switch MFA method */}
          {availableMethods.length > 1 && (
            <View style={styles.mfaSwitchContainer}>
              <Text style={styles.mfaSwitchLabel}>Use a different method:</Text>
              <View style={styles.mfaSwitchRow}>
                {availableMethods.filter(m => m !== mfaMethod).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.mfaSwitchBtn}
                    onPress={() => { setMfaMethod(m); setMfaCode(''); setError(''); }}
                  >
                    <Ionicons name={(mfaConfigs[m] || mfaConfigs.totp).icon} size={18} color={COLORS.primary} />
                    <Text style={styles.mfaSwitchText}>{(mfaConfigs[m] || mfaConfigs.totp).label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Recovery code fallback */}
          {mfaMethod !== 'recovery' && (
            <TouchableOpacity
              style={{ alignItems: 'center', marginTop: 16 }}
              onPress={() => { setMfaMethod('recovery'); setMfaCode(''); setError(''); }}
            >
              <Text style={styles.resendLink}>Use recovery code</Text>
            </TouchableOpacity>
          )}

          {renderBackButton()}
        </KeyboardAvoidingView>
      </Animated.View>
    );
  };

  // ======= MAGIC LINK SCREEN =======
  const renderMagicLink = () => (
    <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.otpContent}>
        <View style={styles.otpTop}>
          <View style={[styles.otpBigIcon, { backgroundColor: '#FF6F0015' }]}>
            <Ionicons name={magicLinkSent ? 'mail-open' : 'link'} size={48} color="#FF6F00" />
          </View>
          <Text style={styles.loginTitle}>{magicLinkSent ? 'Check Your Email' : 'Magic Link Login'}</Text>
          <Text style={styles.loginSubtitle}>
            {magicLinkSent
              ? 'We sent a magic link to your email.\nClick it or paste the token below.'
              : 'Enter your email and we\'ll send you a sign-in link — no password needed!'}
          </Text>
        </View>

        {!magicLinkSent ? (
          <>
            <TextInput
              style={styles.emailInput}
              placeholder="Enter your email address"
              placeholderTextColor={COLORS.textLight}
              value={magicLinkEmail}
              onChangeText={(t) => { setMagicLinkEmail(t); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={100}
            />

            {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24, backgroundColor: '#FF6F00' },
                !magicLinkEmail.trim() && styles.btnDisabled]}
              onPress={handleSendMagicLink}
              disabled={loading || !magicLinkEmail.trim()}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#FFF" style={{ marginRight: 10 }} />
                  <Text style={styles.primaryBtnText}>Send Magic Link</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={[styles.emailInput, { textAlign: 'center', fontSize: 14 }]}
              placeholder="Paste magic link token here"
              placeholderTextColor={COLORS.textLight}
              value={magicLinkToken}
              onChangeText={(t) => { setMagicLinkToken(t); setError(''); }}
              autoFocus
              maxLength={200}
            />

            {error ? <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24, backgroundColor: '#FF6F00' },
                !magicLinkToken.trim() && styles.btnDisabled]}
              onPress={handleVerifyMagicLink}
              disabled={loading || !magicLinkToken.trim()}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify & Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ alignItems: 'center', marginTop: 16 }}
              onPress={() => { setMagicLinkSent(false); setMagicLinkToken(''); setError(''); }}
            >
              <Text style={styles.resendLink}>Resend magic link</Text>
            </TouchableOpacity>
          </>
        )}

        {renderBackButton()}
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
      {screen === 'social_account_input' && renderSocialAccountInput()}
      {screen === 'social_loading' && renderSocialLoading()}
      {screen === 'passkey_register' && renderPasskeyRegister()}
      {screen === 'password_auth' && renderPasswordAuth()}
      {screen === 'mfa_verify' && renderMFAVerify()}
      {screen === 'magic_link' && renderMagicLink()}
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
  // ── Passkey Styles ──
  passkeyFeatures: {
    marginTop: 24,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  // ── Password Styles ──
  passwordRow: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 24,
  },
  strengthContainer: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  strengthBarBg: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  strengthIssue: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 2,
  },
  // ── MFA Styles ──
  mfaSwitchContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  mfaSwitchLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  mfaSwitchRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  mfaSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mfaSwitchText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
});

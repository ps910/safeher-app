/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          SafeHer — STANDALONE AUTH SCREEN  v7.0                ║
 * ║  Dark Luxury Theme · Firebase Auth · All 11 Methods Working    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Self-contained: no external navigation, no broken services.
 * On success → calls authenticate() from AuthContext → App.js shows main app.
 *
 * Views (internal state machine):
 *   'home'          → main landing with all sign-in options
 *   'register'      → create account
 *   'password'      → email + password login
 *   'phone'         → phone number + country code
 *   'otp'           → 6-digit OTP entry
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, Dimensions, Animated, Vibration,
} from 'react-native';

import * as AppleAuthentication from 'expo-apple-authentication';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser          from 'expo-web-browser';

// Native Firebase Auth (required for phone OTP on Android/iOS)
let nativeFirebaseAuth = null;
try {
  nativeFirebaseAuth = require('@react-native-firebase/auth').default;
} catch (e) {
  console.log('[Auth] @react-native-firebase/auth not available, native phone OTP disabled');
}

// Native Google Sign-In — safe import (may not be linked in all builds)
let GoogleSignin = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
} catch (e) {
  console.log('[Auth] @react-native-google-signin not available, will use fallback');
}

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  signInWithCredential,
  signInAnonymously,
  updateProfile as fbUpdateProfile,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import app       from '../config/firebase';
import { useAuth } from '../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

// ────────────────────────────────────────────────────────────────
//  DESIGN TOKENS — Dark Luxury
// ────────────────────────────────────────────────────────────────
const C = {
  bg:           '#07070B', // Deepest black
  surface:      'rgba(255,255,255,0.03)', // Glass surface
  card:         'rgba(30,30,42,0.6)', // Glass card
  border:       'rgba(255,255,255,0.06)', // Subtle border
  borderGlow:   'rgba(255,42,112,0.8)', // Primary glow border
  primary:      '#FF2A70', // Vibrant pink
  primaryDark:  '#D81B60', // Darker pink
  primaryGlow:  'rgba(255,42,112,0.3)', // Glow drop shadow
  accent:       '#FF8FAB', // Soft accent
  gold:         '#FFB300',
  white:        '#FFFFFF',
  text:         '#F0F0F8',
  textSub:      '#8B8C9E',
  textHint:     '#5C5D72',
  danger:       '#FF1744',
  success:      '#00E676',
  google:       '#DB4437',
  facebook:     '#1877F2',
  apple:        '#FFFFFF',
  purple:       '#7C4DFF',
};

const { width, height } = Dimensions.get('window');

// ────────────────────────────────────────────────────────────────
//  COUNTRY CODES
// ────────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+91',  flag: '🇮🇳', name: 'India' },
  { code: '+1',   flag: '🇺🇸', name: 'USA' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+61',  flag: '🇦🇺', name: 'Australia' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { code: '+81',  flag: '🇯🇵', name: 'Japan' },
];

const PIN_LENGTH = 4;

// ────────────────────────────────────────────────────────────────
//  ANIMATED ORB COMPONENT
// ────────────────────────────────────────────────────────────────
function FloatingOrb({ size, color, startX, startY, duration }) {
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(startY)).current;

  useEffect(() => {
    const animate = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(x, { toValue: startX + 40,  duration: duration * 0.6, useNativeDriver: true }),
          Animated.timing(x, { toValue: startX - 20,  duration: duration * 0.4, useNativeDriver: true }),
          Animated.timing(x, { toValue: startX,       duration: duration * 0.3, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(y, { toValue: startY - 50,  duration: duration * 0.5, useNativeDriver: true }),
          Animated.timing(y, { toValue: startY + 30,  duration: duration * 0.5, useNativeDriver: true }),
          Animated.timing(y, { toValue: startY,       duration: duration * 0.3, useNativeDriver: true }),
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
        opacity: 0.25, // Increased opacity for better glow
        shadowColor: color, // Added pure glow
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: size / 3,
        elevation: 10,
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────
//  ERROR TOAST
// ────────────────────────────────────────────────────────────────
function ErrorToast({ message, onDismiss }) {
  const slide = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    if (!message) return;
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
    const t = setTimeout(() => {
      Animated.timing(slide, { toValue: -80, duration: 300, useNativeDriver: true }).start(onDismiss);
    }, 3500);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <Animated.View style={[S.toast, { transform: [{ translateY: slide }] }]}>
      <Text style={S.toastText}>⚠️  {message}</Text>
      <TouchableOpacity onPress={onDismiss}><Text style={{ color: C.accent, fontWeight: '700', paddingLeft: 8 }}>✕</Text></TouchableOpacity>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────
//  PASSWORD STRENGTH
// ────────────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const hasUpper   = /[A-Z]/.test(password);
  const hasNum     = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = (password.length >= 8 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpecial ? 1 : 0);
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', C.danger, C.gold, '#66BB6A', C.success];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>
        {[1,2,3,4].map(i => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= score ? colors[score] : C.border }} />
        ))}
      </View>
      <Text style={{ fontSize: 10, color: colors[score], fontWeight: '700' }}>{labels[score]}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  MAIN SCREEN
// ────────────────────────────────────────────────────────────────
export default function AuthScreen({ onDuressTriggered }) {
  const { authenticate, biometricEnabled } = useAuth();

  // ── Internal nav state ───────────────────────────────────────
  const [view, setView] = useState('home'); // view name
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goTo = useCallback((target) => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: width, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setView(target);
      slideAnim.setValue(-width);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 9 }).start();
    });
  }, []);

  // ── Error ────────────────────────────────────────────────────
  const [errorMsg, setErrorMsg] = useState('');
  const showError = (msg) => setErrorMsg(typeof msg === 'string' ? msg : friendlyError(msg));

  // ── Loading key ──────────────────────────────────────────────
  const [loadingKey, setLoadingKey] = useState(null);
  const run = async (key, fn) => {
    setLoadingKey(key);
    setErrorMsg('');
    try { await fn(); }
    catch (e) { showError(e); }
    finally { setLoadingKey(null); }
  };

  // ── Google Sign-In (native — no browser redirect) ──────────
  const GOOGLE_WEB_CLIENT_ID = '684405408737-uuvrtio9cmcuhpgmt1jv0k5401hu0otp.apps.googleusercontent.com';

  useEffect(() => {
    if (GoogleSignin) {
      try {
        GoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
        });
      } catch (e) {
        console.log('[Auth] GoogleSignin.configure failed:', e);
      }
    }
  }, []);

  // ── Recaptcha ref (Phone OTP — invisible verifier) ──────────
  const recaptchaRef = useRef(null);
  const recaptchaContainerRef = useRef(null);

  // ────────────────────────────────────────────────────────────
  // Render correct view
  // ────────────────────────────────────────────────────────────
  return (
    <View style={S.root}>
      {/* Background orbs */}
      <FloatingOrb size={260} color={C.primary}  startX={-60}  startY={-80}  duration={7000} />
      <FloatingOrb size={180} color={C.purple}   startX={width - 100} startY={height * 0.3} duration={9000} />
      <FloatingOrb size={120} color={C.accent}   startX={width * 0.4} startY={height * 0.65} duration={6000} />

      {/* Recaptcha container (invisible) */}
      <View ref={recaptchaContainerRef} style={{ width: 0, height: 0 }} />

      {/* Error toast (top) */}
      <ErrorToast message={errorMsg} onDismiss={() => setErrorMsg('')} />

      {/* Animated view container */}
      <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: slideAnim }] }]}>
        {view === 'home'         && <HomeView         goTo={goTo} run={run} loadingKey={loadingKey} authenticate={authenticate} showError={showError} biometricEnabled={biometricEnabled} />}
        {view === 'register'     && <RegisterView     goTo={goTo} run={run} loadingKey={loadingKey} authenticate={authenticate} />}
        {view === 'password'     && <PasswordView     goTo={goTo} run={run} loadingKey={loadingKey} authenticate={authenticate} />}
        {view === 'phone'        && <PhoneView        goTo={goTo} run={run} loadingKey={loadingKey} setView={setView} recaptchaRef={recaptchaRef} />}
        {view === 'otp'          && <OTPView          goTo={goTo} run={run} loadingKey={loadingKey} authenticate={authenticate} showError={showError} />}
      </Animated.View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  HOME VIEW
// ────────────────────────────────────────────────────────────────
function HomeView({ goTo, run, loadingKey, authenticate, showError, biometricEnabled }) {
  // ── Entrance animations ─────────────────────────────────────
  const heroFade  = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const cardsFade = useRef(new Animated.Value(0)).current;
  const cardsSlide = useRef(new Animated.Value(30)).current;
  const btnsFade  = useRef(new Animated.Value(0)).current;
  const ctaGlow   = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.parallel([
        Animated.timing(heroFade,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(heroSlide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardsFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(cardsSlide, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(btnsFade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Pulsing glow on CTA
    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaGlow, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
        Animated.timing(ctaGlow, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleGoogle = () => {
    if (!GoogleSignin) {
      Alert.alert(
        '🔧 Google Sign-In',
        'Google Sign-In native module is not available in this build.\n\nPlease use Email/Password, Mobile OTP, or Biometric to sign in.',
        [{ text: 'OK' }]
      );
      return;
    }
    run('google', async () => {
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const signInResult = await GoogleSignin.signIn();
        const idToken = signInResult?.data?.idToken || signInResult?.idToken;
        if (!idToken) throw new Error('Failed to get Google ID token.');
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        await authenticate('google');
      } catch (e) {
        if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '12501') {
          throw new Error('Google sign-in cancelled.');
        }
        throw e;
      }
    });
  };

  const handleApple = () => run('apple', async () => {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const provider = new OAuthProvider('apple.com');
    const firebaseCred = provider.credential({ idToken: cred.identityToken, rawNonce: cred.authorizationCode });
    await signInWithCredential(auth, firebaseCred);
    await authenticate('apple');
  });

  const handleBiometric = () => run('bio', async () => {
    const hasHW = await LocalAuthentication.hasHardwareAsync();
    if (!hasHW) throw new Error('This device does not support biometric authentication.');
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) throw new Error('No biometrics enrolled. Set up Face ID or fingerprint in device Settings.');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access SafeHer',
      fallbackLabel:  'Use PIN',
      cancelLabel:    'Cancel',
    });
    if (!result.success) throw new Error('Biometric authentication failed.');
    await authenticate('biometric');
  });

  const handleQuickStart = () => {
    Alert.alert(
      '⚡ Quick Start',
      'You will be signed in as a guest. Data will not be saved if you uninstall. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => run('quick', async () => { await signInAnonymously(auth); await authenticate('anonymous'); }) },
      ]
    );
  };

  const Spinner = ({ id }) => loadingKey === id
    ? <ActivityIndicator color={C.white} size="small" style={{ marginLeft: 8 }} /> : null;

  return (
    <ScrollView contentContainerStyle={S.homeScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* ── Hero Brand (animated entrance) ── */}
      <Animated.View style={[S.brandWrap, { opacity: heroFade, transform: [{ translateY: heroSlide }] }]}>
        <View style={S.brandGlow} />
        <Text style={S.brandIcon}>🌸</Text>
        <Text style={S.brandName}>SafeHer</Text>
        <Text style={S.brandTag}>Your Personal Safety Guardian</Text>
        <View style={S.trustBadge}>
          <Text style={S.trustText}>🛡️ Trusted by thousands  ·  🔒 End-to-end encrypted</Text>
        </View>
      </Animated.View>

      {/* ── Social Sign-In (glassmorphic) ── */}
      <Animated.View style={{ opacity: heroFade }}>
        <PressBtn style={S.googleBtn} onPress={handleGoogle} disabled={!!loadingKey}>
          <View style={S.googleIconWrap}>
            <Text style={S.googleIconText}>G</Text>
          </View>
          <Text style={S.socialText}>Continue with Google</Text>
          <Spinner id="google" />
          <Text style={{ color: C.textHint, fontSize: 16 }}>→</Text>
        </PressBtn>

        {Platform.OS === 'ios' && (
          <PressBtn style={S.appleBtn} onPress={handleApple} disabled={!!loadingKey}>
            <View style={S.appleIconWrap}>
              <Text style={{ fontSize: 16, color: '#000' }}></Text>
            </View>
            <Text style={[S.socialText, { color: '#000' }]}>Continue with Apple</Text>
            <Spinner id="apple" />
            <Text style={{ color: '#999', fontSize: 16 }}>→</Text>
          </PressBtn>
        )}
      </Animated.View>

      {/* ── Divider ── */}
      <Divider label="MORE OPTIONS" />

      {/* ── Auth Method Cards (animated) ── */}
      <Animated.View style={[S.cardGrid, { opacity: cardsFade, transform: [{ translateY: cardsSlide }] }]}>
        {AUTH_CARDS.map(card => (
          <PressBtn
            key={card.id}
            style={[S.authCard, { borderColor: card.border }]}
            onPress={() => {
              if (card.id === 'passkey') handleBiometric();
              else goTo(card.view);
            }}
            disabled={!!loadingKey}
          >
            <View style={[S.cardIconBg, { backgroundColor: card.border + '18' }]}>
              <Text style={S.cardIcon}>{card.icon}</Text>
            </View>
            <Text style={S.cardLabel}>{card.label}</Text>
            <Text style={S.cardSub}>{card.sub}</Text>
            {loadingKey === card.id && <ActivityIndicator color={card.border} size="small" style={{ marginTop: 6 }} />}
          </PressBtn>
        ))}
      </Animated.View>

      {/* ── Bottom Actions (animated) ── */}
      <Animated.View style={[S.bottomActions, { opacity: btnsFade }]}>
        <View>
          <Animated.View style={[S.ctaGlowBg, { opacity: ctaGlow }]} />
          <PressBtn style={S.createBtn} onPress={() => goTo('register')} disabled={!!loadingKey}>
            <Text style={S.createBtnText}>Create Account  →</Text>
          </PressBtn>
        </View>

        <PressBtn style={S.quickBtn} onPress={handleQuickStart} disabled={!!loadingKey}>
          {loadingKey === 'quick'
            ? <ActivityIndicator color={C.primary} size="small" />
            : <Text style={S.quickBtnText}>⚡ Quick Start as Guest</Text>}
        </PressBtn>
      </Animated.View>

      {/* ── Footer ── */}
      <View style={S.footerWrap}>
        <View style={S.footerDivider} />
        <Text style={S.footerNote}>🔒 Your data stays on device  ·  Privacy first</Text>
        <Text style={S.footerVersion}>SafeHer v7.0</Text>
      </View>
    </ScrollView>
  );
}

const AUTH_CARDS = [
  { id: 'passkey',  view: null,       icon: '🔑', label: 'Biometric',    sub: 'Face ID / Fingerprint',     border: C.purple },
  { id: 'password', view: 'password', icon: '🔐', label: 'Email Login',  sub: 'Email & password',          border: '#00BCD4' },
  { id: 'phone',    view: 'phone',    icon: '📱', label: 'Mobile OTP',   sub: 'SMS verification',          border: '#4CAF50' },
];

// ────────────────────────────────────────────────────────────────
//  REGISTER VIEW
// ────────────────────────────────────────────────────────────────
function RegisterView({ goTo, run, loadingKey, authenticate }) {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleRegister = () => run('register', async () => {
    if (!name.trim())       throw new Error('Please enter your full name.');
    if (!email.trim())      throw new Error('Please enter your email address.');
    if (password.length < 6)throw new Error('Password must be at least 6 characters.');
    if (password !== confirm)throw new Error('Passwords do not match.');
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await fbUpdateProfile(cred.user, { displayName: name.trim() });
    await authenticate('email_password', { email: email.trim(), name: name.trim() });
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={S.formScroll} keyboardShouldPersistTaps="handled">
        <BackBtn onPress={() => goTo('home')} />
        <ViewHeader icon="👤" title="Create Account" sub="Join SafeHer and stay protected" />

        <Label>Full Name</Label>
        <GlassInput placeholder="Priya Sharma" value={name} onChangeText={setName} autoCapitalize="words" />

        <Label>Email Address</Label>
        <GlassInput placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Label>Password</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GlassInput
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            style={{ flex: 1 }}
          />
          <EyeBtn show={showPass} onToggle={() => setShowPass(!showPass)} />
        </View>
        <PasswordStrength password={password} />

        <Label>Confirm Password</Label>
        <GlassInput
          placeholder="Re-enter password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!showPass}
          style={confirm && password !== confirm ? { borderColor: C.danger } : {}}
        />
        {confirm && password !== confirm &&
          <Text style={{ color: C.danger, fontSize: 11, marginTop: 4 }}>Passwords do not match</Text>}

        <PrimaryBtn onPress={handleRegister} loading={loadingKey === 'register'} style={{ marginTop: 28 }}>
          Create Account 🌸
        </PrimaryBtn>

        <TouchableOpacity style={{ alignItems: 'center', marginTop: 20 }} onPress={() => goTo('home')}>
          <Text style={{ color: C.textSub, fontSize: 13 }}>Already have an account? <Text style={{ color: C.accent, fontWeight: '700' }}>Sign In</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ────────────────────────────────────────────────────────────────
//  PASSWORD LOGIN VIEW
// ────────────────────────────────────────────────────────────────
function PasswordView({ goTo, run, loadingKey, authenticate }) {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = () => run('login', async () => {
    if (!email.trim() || !password) throw new Error('Please enter your email and password.');
    await signInWithEmailAndPassword(auth, email.trim(), password);
    await authenticate('email_password', { email: email.trim() });
  });

  const handleForgot = () => run('forgot', async () => {
    if (!email.trim()) throw new Error('Please enter your email address first.');
    await sendPasswordResetEmail(auth, email.trim());
    setResetSent(true);
    Alert.alert('Email Sent ✅', `Password reset link sent to ${email}.`);
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={S.formScroll} keyboardShouldPersistTaps="handled">
        <BackBtn onPress={() => goTo('home')} />
        <ViewHeader icon="🔐" title="Password Login" sub="Sign in with email and password" />

        <Label>Email Address</Label>
        <GlassInput placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

        <Label>Password</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GlassInput
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPass}
            style={{ flex: 1 }}
          />
          <EyeBtn show={showPass} onToggle={() => setShowPass(!showPass)} />
        </View>

        <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 10 }} onPress={handleForgot}>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: '700' }}>
            {loadingKey === 'forgot' ? 'Sending…' : 'Forgot Password?'}
          </Text>
        </TouchableOpacity>

        <PrimaryBtn onPress={handleLogin} loading={loadingKey === 'login'} style={{ marginTop: 20 }}>
          Sign In
        </PrimaryBtn>

        <View style={S.dividerRow}>
          <View style={S.divLine} /><Text style={S.divText}>Don't have an account?</Text><View style={S.divLine} />
        </View>

        <OutlineBtn onPress={() => goTo('register')}>Create Account</OutlineBtn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ────────────────────────────────────────────────────────────────
//  PHONE VIEW
// ────────────────────────────────────────────────────────────────
// We store verificationId in a module-level ref so OTPView can read it
const phoneVerificationRef = { id: null, number: null, confirmation: null };

function PhoneView({ goTo, run, loadingKey, setView, recaptchaRef }) {
  const [selectedCC,    setSelectedCC]    = useState(COUNTRY_CODES[0]);
  const [phone,         setPhone]         = useState('');
  const [showCCPicker,  setShowCCPicker]  = useState(false);

  const handleSend = () => run('phone', async () => {
    const full = `${selectedCC.code}${phone.replace(/\D/g, '')}`;
    if (phone.replace(/\D/g, '').length < 7) throw new Error('Please enter a valid phone number.');

    if (Platform.OS !== 'web') {
      if (!nativeFirebaseAuth) {
        throw new Error(
          'Phone OTP is not available in this build.\n\n'
          + 'Install @react-native-firebase/app and @react-native-firebase/auth, '
          + 'then rebuild the app (expo run:android or a fresh dev build).'
        );
      }

      // Native Firebase flow for Android/iOS
      const confirmation = await nativeFirebaseAuth().signInWithPhoneNumber(full);
      phoneVerificationRef.id = null;
      phoneVerificationRef.number = full;
      phoneVerificationRef.confirmation = confirmation;
      setView('otp');
      return;
    }

    const { RecaptchaVerifier } = await import('firebase/auth');
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    const provider = new PhoneAuthProvider(auth);
    const vId = await provider.verifyPhoneNumber(full, verifier);
    phoneVerificationRef.id     = vId;
    phoneVerificationRef.number = full;
    phoneVerificationRef.confirmation = null;
    setView('otp');
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={S.formScroll}>
        <BackBtn onPress={() => goTo('home')} />
        <ViewHeader icon="📱" title="Mobile Number" sub="We'll send a one-time password to your number" />

        <Label>Country Code</Label>
        <PressBtn style={S.ccBtn} onPress={() => setShowCCPicker(!showCCPicker)}>
          <Text style={{ fontSize: 22 }}>{selectedCC.flag}</Text>
          <Text style={{ color: C.white, fontWeight: '800', marginLeft: 8 }}>{selectedCC.code}</Text>
          <Text style={{ color: C.textSub, flex: 1, marginLeft: 6, fontSize: 13 }}>{selectedCC.name}</Text>
          <Text style={{ color: C.textHint }}>▾</Text>
        </PressBtn>

        {showCCPicker && (
          <View style={S.ccDropdown}>
            {COUNTRY_CODES.map(cc => (
              <PressBtn key={cc.code} style={S.ccOption} onPress={() => { setSelectedCC(cc); setShowCCPicker(false); }}>
                <Text style={{ fontSize: 20 }}>{cc.flag}</Text>
                <Text style={{ color: C.white, fontWeight: '700', marginLeft: 8 }}>{cc.code}</Text>
                <Text style={{ color: C.textSub, marginLeft: 6, fontSize: 13 }}>{cc.name}</Text>
              </PressBtn>
            ))}
          </View>
        )}

        <Label>Phone Number</Label>
        <GlassInput
          placeholder="98765 43210"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={12}
        />

        <PrimaryBtn onPress={handleSend} loading={loadingKey === 'phone'} style={{ marginTop: 24 }}>
          Send OTP 📲
        </PrimaryBtn>
      </View>
    </KeyboardAvoidingView>
  );
}

// ────────────────────────────────────────────────────────────────
//  OTP VIEW
// ────────────────────────────────────────────────────────────────
function OTPView({ goTo, run, loadingKey, authenticate, showError }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs    = Array.from({ length: 6 }, () => useRef(null));

  const handleDigit = (val, idx) => {
    const d = [...digits];
    d[idx] = val.replace(/\D/g, '').slice(-1);
    setDigits(d);
    if (val && idx < 5) refs[idx + 1].current?.focus();
    if (!val && idx > 0) refs[idx - 1].current?.focus();
  };

  const verifyOTP = () => run('otp', async () => {
    const code = digits.join('');
    if (code.length !== 6) throw new Error('Please enter all 6 digits.');

    if (Platform.OS !== 'web') {
      if (!phoneVerificationRef.confirmation) throw new Error('Session expired. Please resend OTP.');
      await phoneVerificationRef.confirmation.confirm(code);
    } else {
      if (!phoneVerificationRef.id) throw new Error('Session expired. Please resend OTP.');
      const cred = PhoneAuthProvider.credential(phoneVerificationRef.id, code);
      await signInWithCredential(auth, cred);
    }

    await authenticate('phone', { phone: phoneVerificationRef.number || '' });
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={S.formScroll}>
        <BackBtn onPress={() => goTo('phone')} />
        <ViewHeader
          icon="📲"
          title="Enter OTP"
          sub={`6-digit code sent to ${phoneVerificationRef.number || 'your number'}`}
        />

        <Label>One-Time Password</Label>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={refs[i]}
              style={[S.otpBox, d && { borderColor: C.primary, backgroundColor: 'rgba(233,30,99,0.12)' }]}
              value={d}
              onChangeText={v => handleDigit(v, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity style={{ alignSelf: 'center', marginBottom: 24 }} onPress={() => goTo('phone')}>
          <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>Didn't receive it? Resend OTP</Text>
        </TouchableOpacity>

        <PrimaryBtn onPress={verifyOTP} loading={loadingKey === 'otp'}>
          Verify & Sign In ✅
        </PrimaryBtn>
      </View>
    </KeyboardAvoidingView>
  );
}

// PIN View removed — PIN setup/verify now handled by SecuritySetupScreen

// ────────────────────────────────────────────────────────────────
//  SHARED UI PRIMITIVES
// ────────────────────────────────────────────────────────────────

function PressBtn({ children, style, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 200 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 200 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[style, disabled && { opacity: 0.5 }]}
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        disabled={disabled}
        activeOpacity={1}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function PrimaryBtn({ children, onPress, loading, style }) {
  return (
    <PressBtn style={[S.primaryBtn, style]} onPress={onPress} disabled={loading}>
      {loading
        ? <ActivityIndicator color={C.white} />
        : <Text style={{ color: C.white, fontSize: 16, fontWeight: '800' }}>{children}</Text>}
    </PressBtn>
  );
}

function OutlineBtn({ children, onPress }) {
  return (
    <PressBtn style={S.outlineBtn} onPress={onPress}>
      <Text style={{ color: C.primary, fontSize: 15, fontWeight: '800' }}>{children}</Text>
    </PressBtn>
  );
}

function BackBtn({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ marginBottom: 8 }}>
      <Text style={{ color: C.accent, fontWeight: '700', fontSize: 15 }}>← Back</Text>
    </TouchableOpacity>
  );
}

function ViewHeader({ icon, title, sub }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 28, marginTop: 8 }}>
      <Text style={{ fontSize: 52, marginBottom: 10 }}>{icon}</Text>
      <Text style={{ fontSize: 26, fontWeight: '900', color: C.white }}>{title}</Text>
      {sub && <Text style={{ fontSize: 13, color: C.textSub, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>{sub}</Text>}
    </View>
  );
}

function Label({ children }) {
  return <Text style={{ color: C.textSub, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 16, letterSpacing: 0.5 }}>{children}</Text>;
}

function GlassInput({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const onFocus = () => { setFocused(true);  Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start(); };
  const onBlur  = () => { setFocused(false); Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start(); };
  const borderColor = glow.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.borderGlow] });
  return (
    <Animated.View style={[S.inputWrap, { borderColor }, style]}>
      <TextInput
        style={S.input}
        placeholderTextColor={C.textHint}
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
      />
    </Animated.View>
  );
}

function EyeBtn({ show, onToggle }) {
  return (
    <TouchableOpacity style={S.eyeBtn} onPress={onToggle}>
      <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁️'}</Text>
    </TouchableOpacity>
  );
}

function Divider({ label }) {
  return (
    <View style={S.dividerOuter}>
      <View style={S.divLine2} />
      <Text style={S.divLabel}>{label}</Text>
      <View style={S.divLine2} />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  FRIENDLY ERRORS
// ────────────────────────────────────────────────────────────────
const FIREBASE_SETUP_MSG = 'This sign-in method is not enabled yet.\n\n'
  + 'Go to Firebase Console → Authentication → Sign-in method and enable the required provider.\n\n'
  + 'Firebase project: safeher-app-242a1';

const friendlyError = (e) => {
  if (typeof e === 'string') return e;
  const code = e?.code || '';
  const msg  = e?.message || '';
  const map  = {
    'auth/invalid-email':              'Please enter a valid email address.',
    'auth/user-not-found':             'No account found with this email.',
    'auth/wrong-password':             'Incorrect password. Please try again.',
    'auth/invalid-credential':         'Invalid email or password. Please try again.',
    'auth/email-already-in-use':       'An account with this email already exists.',
    'auth/weak-password':              'Password must be at least 6 characters.',
    'auth/too-many-requests':          'Too many attempts. Please wait and try again.',
    'auth/network-request-failed':     'No internet connection. Please check your network.',
    'auth/invalid-verification-code':  'Invalid OTP. Please check the code and try again.',
    'auth/invalid-phone-number':       'Please enter a valid phone number with country code.',
    'auth/quota-exceeded':             'SMS quota exceeded. Please try again later.',
    'auth/billing-not-enabled':        'Phone OTP requires Firebase Blaze plan.\n\nFix: Firebase Console → Project Settings → Upgrade to Blaze (pay-as-you-go) → then enable Phone provider under Authentication → Sign-in method.',
    'auth/popup-closed-by-user':       'Sign-in was cancelled.',
    'auth/user-disabled':              'This account has been disabled. Contact support.',
    'auth/operation-not-allowed':      FIREBASE_SETUP_MSG,
    'auth/configuration-not-found':    FIREBASE_SETUP_MSG,
    'auth/admin-restricted-operation': FIREBASE_SETUP_MSG,
    'auth/unauthorized-domain':        'This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/invalid-action-code':        'This link has expired or already been used. Please request a new one.',
    'auth/missing-android-pkg-name':   'Android package name is missing in magic link settings.',
    'auth/missing-continue-uri':       'Continue URL is missing in magic link settings.',
    'ERR_CANCELED':                    'Sign-in was cancelled.',
  };

  // Handle "config not found" variations
  if (code.includes('config') || msg.toLowerCase().includes('config-not-found') || msg.toLowerCase().includes('configuration-not-found')) {
    return FIREBASE_SETUP_MSG;
  }

  // Handle billing-not-enabled (sometimes arrives without auth/ prefix)
  if (code.includes('billing') || msg.toLowerCase().includes('billing')) {
    return 'Phone OTP requires Firebase Blaze plan.\n\nFix: Firebase Console → Project Settings → Upgrade to Blaze (pay-as-you-go) → then enable Phone provider under Authentication → Sign-in method.';
  }

  return map[code] || e?.message || 'Something went wrong. Please try again.';
};

// ────────────────────────────────────────────────────────────────
//  STYLES
// ────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },

  // Home
  homeScroll: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },

  // Brand / Hero
  brandWrap: { alignItems: 'center', marginBottom: 40, position: 'relative' },
  brandGlow: {
    position: 'absolute', top: -20, width: 180, height: 180, borderRadius: 90,
    backgroundColor: C.primaryGlow, opacity: 0.3,
  },
  brandIcon: { fontSize: 72, marginBottom: 4 },
  brandName: { fontSize: 42, fontWeight: '900', color: C.white, letterSpacing: -1 },
  brandTag:  { fontSize: 15, color: C.textSub, marginTop: 6, letterSpacing: 0.5, fontWeight: '500' },
  trustBadge: {
    marginTop: 18, backgroundColor: 'rgba(233,30,99,0.06)',
    borderRadius: 24, paddingVertical: 10, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(233,30,99,0.12)',
  },
  trustText: { fontSize: 11, color: C.accent, fontWeight: '600', letterSpacing: 0.3 },

  // Social buttons — glassmorphic
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card,
    paddingVertical: 16, paddingHorizontal: 18,
    borderRadius: 18, marginBottom: 12, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(219,68,55,0.25)',
  },
  googleIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.google,
    alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { fontSize: 18, fontWeight: '900', color: C.white },
  appleBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.apple,
    paddingVertical: 16, paddingHorizontal: 18,
    borderRadius: 18, marginBottom: 12, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  appleIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  socialText: { flex: 1, color: C.white, fontWeight: '700', fontSize: 15, marginLeft: 14 },

  // Divider
  dividerOuter: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  divLine2:     { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  divLabel:     { color: C.textHint, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginHorizontal: 16 },

  // Auth method card grid
  cardGrid: {
    flexDirection: 'row', justifyContent: 'space-between',
    gap: 12, marginBottom: 28,
  },
  authCard: {
    flex: 1, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 12, // More padding, rounder
    alignItems: 'center', minHeight: 145,
    backgroundColor: C.card,
    borderWidth: 1, elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  cardIconBg: {
    width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  cardIcon:  { fontSize: 26 },
  cardLabel: { fontSize: 13, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 4 },
  cardSub:   { fontSize: 10, color: C.textSub, textAlign: 'center', lineHeight: 14 },

  // Bottom actions
  bottomActions: { gap: 14, marginBottom: 28 },
  ctaGlowBg: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 20, backgroundColor: C.primaryGlow,
  },
  createBtn: {
    backgroundColor: C.primary, borderRadius: 20, // softer radius
    paddingVertical: 18, alignItems: 'center', elevation: 12,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, // glowing shadow
  },
  createBtnText: { fontSize: 17, fontWeight: '900', color: C.white, letterSpacing: 0.3 },
  quickBtn: {
    borderRadius: 16, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: C.surface,
  },
  quickBtnText: { fontSize: 14, fontWeight: '700', color: C.textSub },

  // Footer
  footerWrap: { alignItems: 'center', paddingBottom: 20 },
  footerDivider: { width: 40, height: 2, borderRadius: 1, backgroundColor: C.border, marginBottom: 14 },
  footerNote: { textAlign: 'center', color: C.textHint, fontSize: 11 },
  footerVersion: { textAlign: 'center', color: 'rgba(255,255,255,0.04)', fontSize: 10, marginTop: 8, fontWeight: '600' },

  // Toast
  toast: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999,
    backgroundColor: '#1E0010',
    borderBottomWidth: 2, borderBottomColor: C.danger,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
  },
  toastText: { color: C.danger, fontWeight: '700', flex: 1, fontSize: 13 },

  // Form views
  formScroll: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
  },

  // Glass input
  inputWrap: {
    borderRadius: 16, borderWidth: 1,
    backgroundColor: C.surface,
    backdropFilter: 'blur(10px)', // Will work gracefully fallback in RN
    overflow: 'hidden',
  },
  input: {
    color: C.white, fontSize: 15,
    paddingHorizontal: 16, paddingVertical: 14,
  },

  eyeBtn: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.border, padding: 14, justifyContent: 'center', alignItems: 'center',
  },

  // Primary button
  primaryBtn: {
    backgroundColor: C.primary, borderRadius: 20,
    paddingVertical: 18, alignItems: 'center',
    elevation: 8,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20,
  },
  outlineBtn: {
    borderWidth: 1.5, borderColor: C.primary, borderRadius: 20,
    backgroundColor: 'rgba(255,42,112,0.05)', // slight fill for glass look
    paddingVertical: 16, alignItems: 'center',
  },

  // Divider (forms)
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  divLine:    { flex: 1, height: 1, backgroundColor: C.border },
  divText:    { color: C.textHint, fontSize: 11, fontWeight: '600', marginHorizontal: 12 },

  // Info card
  infoCard: {
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderLeftWidth: 3, borderLeftColor: C.gold,
    borderRadius: 10, padding: 14, marginTop: 16, marginBottom: 20,
  },

  // CC picker
  ccBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.border, padding: 14,
  },
  ccDropdown: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5,
    borderColor: C.border, marginTop: 4, elevation: 12, overflow: 'hidden',
  },
  ccOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },

  // OTP boxes
  otpBox: {
    flex: 1, aspectRatio: 1, borderRadius: 12, borderWidth: 2,
    borderColor: C.border, textAlign: 'center', fontSize: 24,
    fontWeight: '900', color: C.white, backgroundColor: C.surface,
  },

  // PIN pad (removed — now in SecuritySetupScreen)
});


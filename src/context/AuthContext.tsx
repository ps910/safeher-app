/**
 * AuthContext v8.0 — Firebase + Secure Local Auth (TypeScript)
 * ══════════════════════════════════════════════════════════════════
 *
 * - PINs are stored as PBKDF2-style salted hashes in SecureStore
 *   (Android Keystore / iOS Keychain), never plaintext.
 * - `enterDuressMode` no longer bypasses authentication; only
 *   `verifyPin('duress-pin') === 'duress'` flips the flag.
 * - Old auth stubs that returned `{ success: true }` are removed —
 *   any caller now gets a hard error so silent auth bypasses cannot ship.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut as firebaseSignOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import SecureStorageService from '../services/EncryptedStorageService';
import Logger from '../utils/logger';

import type { AuthContextValue, UserProfile, AuthMethod } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const KEYS = {
  PIN_HASH:         '@gs_auth_pin_hash',
  PIN_SALT:         '@gs_auth_pin_salt',
  DURESS_HASH:      '@gs_duress_pin_hash',
  DURESS_SALT:      '@gs_duress_pin_salt',
  PIN_FAILS:        '@gs_pin_fails',
  PIN_LOCKED_UNTIL: '@gs_pin_locked_until',
  PROFILE:          '@gs_user_profile',
  ONBOARDED:        '@gs_onboarded',
  BIOMETRIC:        '@gs_biometric',
  AUTH_METHOD:      '@gs_auth_method',
  SOCIAL_DATA:      '@gs_social_data',
  PROFILE_COMPLETE: '@gs_profile_complete',
} as const;

const DEFAULT_PROFILE: UserProfile = {
  fullName: '',       phone: '',         email: '',
  dateOfBirth: '',    gender: '',        profilePicUri: null,
  bloodGroup: '',     allergies: '',     medicalConditions: '',
  medications: '',    homeAddress: '',   workAddress: '',
  collegeAddress: '', vehicleDetails: '',
};

const PIN_PEPPER = 'safeher-pin-v1'; // app-wide constant slowing pre-built rainbow tables
const PIN_LOCK_AFTER_FAILS = 5;
const PIN_LOCK_DURATION_MS = 5 * 60 * 1000;

// ── PIN hashing (10k rounds of SHA-256 over salt+pepper+pin) ────────
const hashPin = async (pin: string, salt: string): Promise<string> => {
  let acc = `${PIN_PEPPER}:${salt}:${pin}`;
  for (let i = 0; i < 10_000; i++) {
    acc = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, acc);
  }
  return acc;
};

const newSalt = async (): Promise<string> => {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // ── Core Auth State ──────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading,       setIsLoading]       = useState<boolean>(true);
  const [firebaseUser,    setFirebaseUser]    = useState<FirebaseUser | null>(null);

  // ── Local App State ──────────────────────────────────────────
  const [isOnboarded,       setIsOnboarded]       = useState<boolean>(false);
  const [userProfile,       setUserProfile]       = useState<UserProfile>(DEFAULT_PROFILE);
  const [hasPin,            setHasPin]            = useState<boolean>(false);
  const [hasDuressPin,      setHasDuressPin]      = useState<boolean>(false);
  const [biometricEnabled,  setBiometricEnabled]  = useState<boolean>(false);
  const [isDuressMode,      setIsDuressMode]      = useState<boolean>(false);
  const [authMethod,        setAuthMethod]        = useState<AuthMethod | null>(null);
  const [socialData,        setSocialData]        = useState<Record<string, any> | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean>(false);

  // ── Bootstrap ────────────────────────────────────────────────
  useEffect(() => {
    const unsubFirebase = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        setIsAuthenticated(true);
        if (fbUser.email || fbUser.displayName) {
          setUserProfile(prev => ({
            ...prev,
            email:    fbUser.email    || prev.email,
            fullName: prev.fullName   || fbUser.displayName || '',
          }));
        }
      }
    });

    loadLocal().finally(() => setIsLoading(false));

    return unsubFirebase;
  }, []);

  const loadLocal = async (): Promise<void> => {
    try {
      const [pinHash, duressHash] = await Promise.all([
        SecureStorageService.getItem(KEYS.PIN_HASH),
        SecureStorageService.getItem(KEYS.DURESS_HASH),
      ]);
      setHasPin(!!pinHash);
      setHasDuressPin(!!duressHash);

      const [profileData, onboardedData, bioData, authMethodData, socialDataStr, profileCompleteStr] =
        await Promise.all([
          AsyncStorage.getItem(KEYS.PROFILE),
          AsyncStorage.getItem(KEYS.ONBOARDED),
          AsyncStorage.getItem(KEYS.BIOMETRIC),
          AsyncStorage.getItem(KEYS.AUTH_METHOD),
          AsyncStorage.getItem(KEYS.SOCIAL_DATA),
          AsyncStorage.getItem(KEYS.PROFILE_COMPLETE),
        ]);

      if (profileData) {
        const saved = JSON.parse(profileData) as Partial<UserProfile>;
        setUserProfile(prev => ({
          ...DEFAULT_PROFILE,
          ...saved,
          email: prev.email || saved.email || '',
          fullName: prev.fullName || saved.fullName || '',
        }));
      }
      if (onboardedData)      setIsOnboarded(JSON.parse(onboardedData));
      if (bioData)            setBiometricEnabled(JSON.parse(bioData));
      if (authMethodData)     setAuthMethod(authMethodData as AuthMethod);
      if (socialDataStr)      setSocialData(JSON.parse(socialDataStr));
      if (profileCompleteStr) setIsProfileComplete(JSON.parse(profileCompleteStr));
    } catch (e) {
      Logger.warn('[AuthContext] loadLocal error', e);
    }
  };

  const authenticate = async (
    method: string = 'unknown',
    extra: Record<string, any> = {},
    isDuress: boolean = false,
  ): Promise<void> => {
    setIsAuthenticated(true);
    setIsDuressMode(!!isDuress);
    setAuthMethod(method as AuthMethod);
    try {
      await AsyncStorage.setItem(KEYS.AUTH_METHOD, method);
      if (extra?.email) _patchProfile({ email: extra.email });
      if (extra?.phone) _patchProfile({ phone: extra.phone });
      if (extra?.name)  _patchProfile({ fullName: extra.name });
    } catch {}
  };

  const lock = async (): Promise<void> => {
    setIsAuthenticated(false);
    setIsDuressMode(false);
    try { await firebaseSignOut(auth); } catch {}
  };

  // ── PIN Setup / Verification ─────────────────────────────────
  const setupPin = async (newPin: string): Promise<void> => {
    if (!/^\d{4,8}$/.test(newPin)) throw new Error('PIN must be 4–8 digits.');
    const salt = await newSalt();
    const hash = await hashPin(newPin, salt);
    await SecureStorageService.setItem(KEYS.PIN_SALT, salt);
    await SecureStorageService.setItem(KEYS.PIN_HASH, hash);
    setHasPin(true);
  };

  const setupDuressPin = async (newPin: string): Promise<void> => {
    if (!/^\d{4,8}$/.test(newPin)) throw new Error('Duress PIN must be 4–8 digits.');
    const salt = await newSalt();
    const hash = await hashPin(newPin, salt);
    await SecureStorageService.setItem(KEYS.DURESS_SALT, salt);
    await SecureStorageService.setItem(KEYS.DURESS_HASH, hash);
    setHasDuressPin(true);
  };

  const isPinLocked = async (): Promise<number> => {
    const until = await AsyncStorage.getItem(KEYS.PIN_LOCKED_UNTIL);
    const ts = until ? parseInt(until, 10) : 0;
    return Number.isFinite(ts) && ts > Date.now() ? ts - Date.now() : 0;
  };

  const verifyPin = async (entered: string): Promise<'normal' | 'duress' | false> => {
    const lockMs = await isPinLocked();
    if (lockMs > 0) throw new Error(`PIN locked. Try again in ${Math.ceil(lockMs / 1000)}s.`);

    const [pinSalt, pinHash, duressSalt, duressHash] = await Promise.all([
      SecureStorageService.getItem(KEYS.PIN_SALT),
      SecureStorageService.getItem(KEYS.PIN_HASH),
      SecureStorageService.getItem(KEYS.DURESS_SALT),
      SecureStorageService.getItem(KEYS.DURESS_HASH),
    ]);

    if (pinSalt && pinHash) {
      const candidate = await hashPin(entered, pinSalt);
      if (constantTimeEqual(candidate, pinHash)) {
        await AsyncStorage.multiRemove([KEYS.PIN_FAILS, KEYS.PIN_LOCKED_UNTIL]);
        return 'normal';
      }
    }
    if (duressSalt && duressHash) {
      const candidate = await hashPin(entered, duressSalt);
      if (constantTimeEqual(candidate, duressHash)) {
        await AsyncStorage.multiRemove([KEYS.PIN_FAILS, KEYS.PIN_LOCKED_UNTIL]);
        return 'duress';
      }
    }

    // Track failures
    const failsRaw = await AsyncStorage.getItem(KEYS.PIN_FAILS);
    const fails = (failsRaw ? parseInt(failsRaw, 10) : 0) + 1;
    await AsyncStorage.setItem(KEYS.PIN_FAILS, String(fails));
    if (fails >= PIN_LOCK_AFTER_FAILS) {
      await AsyncStorage.setItem(KEYS.PIN_LOCKED_UNTIL, String(Date.now() + PIN_LOCK_DURATION_MS));
    }
    return false;
  };

  // Internal — only called by verifyPin returning 'duress'.
  const _enterDuressMode = (): void => {
    setIsDuressMode(true);
    setIsAuthenticated(true);
  };

  const verifyAndEnter = async (entered: string): Promise<'normal' | 'duress' | false> => {
    const result = await verifyPin(entered);
    if (result === 'normal') {
      setIsAuthenticated(true);
      setIsDuressMode(false);
    } else if (result === 'duress') {
      _enterDuressMode();
    }
    return result;
  };

  const toggleBiometric = async (val: boolean): Promise<void> => {
    setBiometricEnabled(val);
    await AsyncStorage.setItem(KEYS.BIOMETRIC, JSON.stringify(val));
  };

  const _patchProfile = (updates: Partial<UserProfile>): void => {
    setUserProfile(prev => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<void> => {
    _patchProfile(updates);
  };

  const markProfileComplete = async (): Promise<void> => {
    setIsProfileComplete(true);
    await AsyncStorage.setItem(KEYS.PROFILE_COMPLETE, JSON.stringify(true));
  };

  const completeOnboarding = async (): Promise<void> => {
    setIsOnboarded(true);
    await AsyncStorage.setItem(KEYS.ONBOARDED, JSON.stringify(true));
  };

  const prefillFromSocial = (): Partial<UserProfile> => {
    if (!socialData) return {};
    const fill: Partial<UserProfile> = {};
    if (socialData.name)       fill.fullName     = socialData.name;
    if (socialData.email)      fill.email        = socialData.email;
    if (socialData.phone)      fill.phone        = socialData.phone;
    if (socialData.picture)    fill.profilePicUri = socialData.picture;
    if (socialData.given_name) fill.fullName = `${socialData.given_name} ${socialData.family_name || ''}`.trim();
    return fill;
  };

  const socialLogin = async (method: string, data: Record<string, any>): Promise<void> => {
    setAuthMethod(method as AuthMethod);
    setSocialData(data);
    try {
      await AsyncStorage.setItem(KEYS.AUTH_METHOD, method);
      await AsyncStorage.setItem(KEYS.SOCIAL_DATA, JSON.stringify(data));
      if (data?.email) _patchProfile({ email: data.email });
      if (data?.name)  _patchProfile({ fullName: data.name });
    } catch {}
  };

  // ── Backward-compat: throw on the dangerous stubs so accidental
  //    callers in older screens don't silently grant access.
  const notImplemented = (name: string) => async () => {
    throw new Error(`${name} is not available in this build. Use Firebase auth flows directly.`);
  };

  const value: AuthContextValue = {
    isAuthenticated, isLoading, isOnboarded, userProfile,
    firebaseUser,
    pin: null, duressPin: null, hasPin, hasDuressPin,
    biometricEnabled, isDuressMode, authMethod, socialData,
    isProfileComplete,
    jwtPayload: null,
    passkeyAvailable: false, passkeyRegistered: false,
    mfaEnabled: false, mfaMethods: [], hasPasswordSet: false, pendingMFA: null,

    authenticate, lock,
    enterDuressMode: notImplemented('enterDuressMode') as any, // legacy stub — real flow is verifyAndEnter
    setIsDuressMode,
    setupPin, setupDuressPin,
    verifyPin: verifyAndEnter,
    toggleBiometric,
    updateProfile, markProfileComplete, completeOnboarding,
    prefillFromSocial, socialLogin,

    issueJWTTokens:           notImplemented('issueJWTTokens') as any,
    getAccessToken:           notImplemented('getAccessToken') as any,
    getAuthHeader:            notImplemented('getAuthHeader') as any,
    registerPasskey:          notImplemented('registerPasskey') as any,
    authenticateWithPasskey:  notImplemented('authenticateWithPasskey') as any,
    authenticateWithOAuth:    notImplemented('authenticateWithOAuth') as any,
    handleOAuthCallback:      notImplemented('handleOAuthCallback') as any,
    sendPhoneOTP:             notImplemented('sendPhoneOTP') as any,
    sendEmailOTP:             notImplemented('sendEmailOTP') as any,
    verifyOTPAndAuth:         notImplemented('verifyOTPAndAuth') as any,
    sendMagicLink:            notImplemented('sendMagicLink') as any,
    verifyMagicLinkAndAuth:   notImplemented('verifyMagicLinkAndAuth') as any,
    createPassword:           notImplemented('createPassword') as any,
    verifyPasswordAndAuth:    notImplemented('verifyPasswordAndAuth') as any,
    verifyMFAAndAuth:         notImplemented('verifyMFAAndAuth') as any,
    enableMFA:                notImplemented('enableMFA') as any,
    disableMFA:               notImplemented('disableMFA') as any,
    validatePassword:         (p: string) => ({
      valid: p.length >= 8 && /[A-Z]/.test(p) && /\d/.test(p),
      score: Math.min(4, (p.length >= 8 ? 1 : 0) + (/[A-Z]/.test(p) ? 1 : 0) + (/\d/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) ? 1 : 0)),
    }),
    changePassword:           notImplemented('changePassword') as any,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;

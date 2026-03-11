/**
 * AuthContext v7.0 — Firebase + Local Auth Provider (TypeScript)
 * ══════════════════════════════════════════════════════════════════
 *
 * Bridges Firebase Authentication with local app state.
 * All existing screens continue to work (backward-compatible).
 * New AuthScreen.js uses Firebase directly and calls authenticate().
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, signOut as firebaseSignOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';

import type { AuthContextValue, UserProfile, AuthMethod } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const KEYS = {
  PIN:              '@gs_auth_pin',
  DURESS_PIN:       '@gs_duress_pin',
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
  const [pin,               setPin]               = useState<string | null>(null);
  const [duressPin,         setDuressPin]         = useState<string | null>(null);
  const [biometricEnabled,  setBiometricEnabled]  = useState<boolean>(false);
  const [isDuressMode,      setIsDuressMode]      = useState<boolean>(false);
  const [authMethod,        setAuthMethod]        = useState<AuthMethod | null>(null);
  const [socialData,        setSocialData]        = useState<Record<string, any> | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean>(false);

  // ── Stubs (screens reference these — non-fatal) ──────────────
  const [passkeyAvailable]  = useState<boolean>(false);
  const [passkeyRegistered] = useState<boolean>(false);
  const [mfaEnabled]        = useState<boolean>(false);
  const [mfaMethods]        = useState<string[]>([]);
  const [hasPasswordSet]    = useState<boolean>(false);
  const [pendingMFA]        = useState<any>(null);
  const [jwtPayload]        = useState<any>(null);

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
      const [
        pinData, duressData, profileData, onboardedData,
        bioData, authMethodData, socialDataStr, profileCompleteStr,
      ] = await Promise.all([
        AsyncStorage.getItem(KEYS.PIN),
        AsyncStorage.getItem(KEYS.DURESS_PIN),
        AsyncStorage.getItem(KEYS.PROFILE),
        AsyncStorage.getItem(KEYS.ONBOARDED),
        AsyncStorage.getItem(KEYS.BIOMETRIC),
        AsyncStorage.getItem(KEYS.AUTH_METHOD),
        AsyncStorage.getItem(KEYS.SOCIAL_DATA),
        AsyncStorage.getItem(KEYS.PROFILE_COMPLETE),
      ]);
      if (pinData)            setPin(pinData);
      if (duressData)         setDuressPin(duressData);
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
      console.log('[AuthContext] loadLocal error (non-fatal):', e);
    }
  };

  const authenticate = async (
    method: string = 'unknown',
    extra: Record<string, any> = {},
    isDuress: boolean = false
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

  const enterDuressMode = async (): Promise<void> => {
    setIsDuressMode(true);
    setIsAuthenticated(true);
  };

  const setupPin = async (newPin: string): Promise<void> => {
    await AsyncStorage.setItem(KEYS.PIN, newPin);
    setPin(newPin);
  };

  const setupDuressPin = async (newPin: string): Promise<void> => {
    await AsyncStorage.setItem(KEYS.DURESS_PIN, newPin);
    setDuressPin(newPin);
  };

  const verifyPin = (entered: string): 'normal' | 'duress' | false => {
    if (entered === pin) return 'normal';
    if (duressPin && entered === duressPin) return 'duress';
    return false;
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

  // ── Backward-compat stubs ────────────────────────────────────
  const issueJWTTokens          = async () => null;
  const getAccessToken          = async () => null;
  const getAuthHeader           = async () => ({ Authorization: 'Bearer stub' });
  const registerPasskey         = async () => ({ credentialId: 'stub' });
  const authenticateWithPasskey = async () => { await authenticate('passkey'); return {}; };
  const authenticateWithOAuth   = async (provider: string, data: Record<string, any> = {}) => {
    await authenticate(provider, data);
    return { profile: data };
  };
  const handleOAuthCallback     = async () => {};
  const sendPhoneOTP            = async () => ({ sessionId: 'stub', code: '000000' });
  const sendEmailOTP            = async () => ({ sessionId: 'stub', code: '000000' });
  const verifyOTPAndAuth        = async () => ({ success: true });
  const sendMagicLink           = async () => ({});
  const verifyMagicLinkAndAuth  = async () => ({ success: true });
  const createPassword          = async () => ({ success: true });
  const verifyPasswordAndAuth   = async () => ({ success: true });
  const verifyMFAAndAuth        = async () => ({ success: true });
  const enableMFA               = async () => ({ success: true });
  const disableMFA              = async () => ({ success: true });
  const validatePassword        = (p: string) => ({
    valid: p.length >= 6,
    score: Math.min(4, Math.floor(p.length / 3)),
  });
  const changePassword          = async () => ({ success: true });

  const hasDuressPin = !!duressPin;

  const value: AuthContextValue = {
    isAuthenticated, isLoading, isOnboarded, userProfile,
    firebaseUser, pin, duressPin, hasDuressPin,
    biometricEnabled, isDuressMode, authMethod, socialData,
    isProfileComplete, jwtPayload,
    passkeyAvailable, passkeyRegistered,
    mfaEnabled, mfaMethods, hasPasswordSet, pendingMFA,

    authenticate, lock, enterDuressMode, setIsDuressMode,
    setupPin, setupDuressPin, verifyPin,
    toggleBiometric,
    updateProfile, markProfileComplete, completeOnboarding,
    prefillFromSocial, socialLogin,

    issueJWTTokens, getAccessToken, getAuthHeader,
    registerPasskey, authenticateWithPasskey,
    authenticateWithOAuth, handleOAuthCallback,
    sendPhoneOTP, sendEmailOTP, verifyOTPAndAuth,
    sendMagicLink, verifyMagicLinkAndAuth,
    createPassword, verifyPasswordAndAuth,
    verifyMFAAndAuth, enableMFA, disableMFA,
    validatePassword, changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;

/**
 * AuthContext - Authentication, PIN, Biometrics, Duress PIN, User Profile
 * Manages: login state, user profile (medical, addresses, vehicle), biometric auth
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

const AUTH_KEYS = {
  PIN: '@gs_auth_pin',
  DURESS_PIN: '@gs_duress_pin',
  PROFILE: '@gs_user_profile',
  ONBOARDED: '@gs_onboarded',
  BIOMETRIC_ENABLED: '@gs_biometric',
  AUTH_METHOD: '@gs_auth_method',
  SOCIAL_DATA: '@gs_social_data',
};

const DEFAULT_PROFILE = {
  fullName: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  profilePicUri: null,
  bloodGroup: '',
  allergies: '',
  medicalConditions: '',
  medications: '',
  homeAddress: '',
  workAddress: '',
  collegeAddress: '',
  vehicleDetails: '',
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(DEFAULT_PROFILE);
  const [pin, setPin] = useState(null);
  const [duressPin, setDuressPin] = useState(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isDuressMode, setIsDuressMode] = useState(false);
  const [authMethod, setAuthMethod] = useState(null); // 'phone' | 'google' | 'facebook' | 'instagram' | 'pin'
  const [socialData, setSocialData] = useState(null);

  useEffect(() => {
    loadAuthData();
  }, []);

  const loadAuthData = async () => {
    try {
      const [pinData, duressData, profileData, onboardedData, bioData, authMethodData, socialDataStr] = await Promise.all([
        AsyncStorage.getItem(AUTH_KEYS.PIN),
        AsyncStorage.getItem(AUTH_KEYS.DURESS_PIN),
        AsyncStorage.getItem(AUTH_KEYS.PROFILE),
        AsyncStorage.getItem(AUTH_KEYS.ONBOARDED),
        AsyncStorage.getItem(AUTH_KEYS.BIOMETRIC_ENABLED),
        AsyncStorage.getItem(AUTH_KEYS.AUTH_METHOD),
        AsyncStorage.getItem(AUTH_KEYS.SOCIAL_DATA),
      ]);

      if (pinData) setPin(pinData);
      if (duressData) setDuressPin(duressData);
      if (profileData) setUserProfile({ ...DEFAULT_PROFILE, ...JSON.parse(profileData) });
      if (onboardedData) setIsOnboarded(JSON.parse(onboardedData));
      if (bioData) setBiometricEnabled(JSON.parse(bioData));
      if (authMethodData) setAuthMethod(authMethodData);
      if (socialDataStr) setSocialData(JSON.parse(socialDataStr));
    } catch (e) {
      console.error('Auth load error:', e);
    }
    setIsLoading(false);
  };

  // Set up PIN
  const setupPin = async (newPin) => {
    try {
      await AsyncStorage.setItem(AUTH_KEYS.PIN, newPin);
      setPin(newPin);
    } catch (e) {
      console.error('PIN save error:', e);
    }
  };

  // Set up Duress PIN (silent SOS trigger)
  const setupDuressPin = async (newDuressPin) => {
    try {
      await AsyncStorage.setItem(AUTH_KEYS.DURESS_PIN, newDuressPin);
      setDuressPin(newDuressPin);
    } catch (e) {
      console.error('Duress PIN save error:', e);
    }
  };

  // Verify PIN — returns 'normal', 'duress', or false
  const verifyPin = (enteredPin) => {
    if (enteredPin === pin) return 'normal';
    if (duressPin && enteredPin === duressPin) return 'duress';
    return false;
  };

  // Toggle biometric
  const toggleBiometric = async (val) => {
    setBiometricEnabled(val);
    await AsyncStorage.setItem(AUTH_KEYS.BIOMETRIC_ENABLED, JSON.stringify(val));
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    setIsOnboarded(true);
    await AsyncStorage.setItem(AUTH_KEYS.ONBOARDED, JSON.stringify(true));
  };

  // Update profile
  const updateProfile = async (updates) => {
    const updated = { ...userProfile, ...updates };
    setUserProfile(updated);
    try {
      await AsyncStorage.setItem(AUTH_KEYS.PROFILE, JSON.stringify(updated));
    } catch (e) {
      console.error('Profile save error:', e);
    }
  };

  // Authenticate
  const authenticate = () => setIsAuthenticated(true);
  const lock = () => setIsAuthenticated(false);

  // Enter duress mode (silent SOS)
  const enterDuressMode = () => {
    setIsDuressMode(true);
    setIsAuthenticated(true);
  };

  // Social login (phone, google, facebook, instagram)
  const socialLogin = async (method, data) => {
    try {
      setAuthMethod(method);
      setSocialData(data);
      await AsyncStorage.setItem(AUTH_KEYS.AUTH_METHOD, method);
      await AsyncStorage.setItem(AUTH_KEYS.SOCIAL_DATA, JSON.stringify(data));
    } catch (e) {
      console.error('Social login save error:', e);
    }
  };

  const hasDuressPin = !!duressPin;

  const value = {
    isAuthenticated, isOnboarded, isLoading, userProfile,
    pin, duressPin, hasDuressPin, biometricEnabled, isDuressMode,
    authMethod, socialData,
    setupPin, setupDuressPin, verifyPin, toggleBiometric,
    completeOnboarding, updateProfile, authenticate, lock,
    enterDuressMode, setIsDuressMode, socialLogin,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;

/**
 * AuthContext - Authentication, PIN, Biometrics, Duress PIN, User Profile
 * Manages: login state, user profile (medical, addresses, vehicle), biometric auth
 * Integrates with Database service for persistent user storage
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy helper to safely get UserDB (avoid crash if Database module has issues)
const getUserDB = async () => {
  try {
    const { UserDB } = await import('../services/Database');
    return UserDB;
  } catch (e) {
    console.log('UserDB not available:', e);
    return null;
  }
};

const AuthContext = createContext();

const AUTH_KEYS = {
  PIN: '@gs_auth_pin',
  DURESS_PIN: '@gs_duress_pin',
  PROFILE: '@gs_user_profile',
  ONBOARDED: '@gs_onboarded',
  BIOMETRIC_ENABLED: '@gs_biometric',
  AUTH_METHOD: '@gs_auth_method',
  SOCIAL_DATA: '@gs_social_data',
  PROFILE_COMPLETE: '@gs_profile_complete',
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
  const [isProfileComplete, setIsProfileComplete] = useState(false);

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

      // Load profile completion flag
      const profileCompleteStr = await AsyncStorage.getItem(AUTH_KEYS.PROFILE_COMPLETE);
      if (profileCompleteStr) setIsProfileComplete(JSON.parse(profileCompleteStr));

      // Sync profile data to database (lazy)
      try {
        const UserDB = await getUserDB();
        if (UserDB) {
          const dbUser = await UserDB.get();
          if (profileData && !dbUser?.fullName) {
            const profile = JSON.parse(profileData);
            await UserDB.save({
              fullName: profile.fullName,
              phone: profile.phone,
              authMethod: authMethodData,
            });
          }
        }
      } catch (dbErr) {
        console.log('DB sync during auth load:', dbErr);
      }
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
      // Sync to database (lazy)
      try {
        const UserDB = await getUserDB();
        if (UserDB) {
          await UserDB.save({
            fullName: updated.fullName,
            phone: updated.phone,
            bloodGroup: updated.bloodGroup,
          });
        }
      } catch (dbErr) {
        console.log('Profile DB sync error:', dbErr);
      }
    } catch (e) {
      console.error('Profile save error:', e);
    }
  };

  // Mark profile as complete (called after first-time setup)
  const markProfileComplete = async () => {
    setIsProfileComplete(true);
    try {
      await AsyncStorage.setItem(AUTH_KEYS.PROFILE_COMPLETE, JSON.stringify(true));
    } catch (e) {
      console.error('Profile complete flag save error:', e);
    }
  };

  // Pre-fill profile from social/Gmail login data
  const prefillFromSocial = () => {
    const prefill = {};
    if (socialData) {
      if (socialData.name) prefill.fullName = socialData.name;
      if (socialData.email) prefill.email = socialData.email;
      if (socialData.phone) prefill.phone = socialData.phone;
      if (socialData.avatar || socialData.picture) prefill.profilePicUri = socialData.avatar || socialData.picture;
      if (socialData.given_name && socialData.family_name) {
        prefill.fullName = `${socialData.given_name} ${socialData.family_name}`;
      }
    }
    if (authMethod === 'phone' && userProfile.phone) {
      prefill.phone = userProfile.phone;
    }
    return prefill;
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
    authMethod, socialData, isProfileComplete,
    setupPin, setupDuressPin, verifyPin, toggleBiometric,
    completeOnboarding, updateProfile, authenticate, lock,
    enterDuressMode, setIsDuressMode, socialLogin,
    markProfileComplete, prefillFromSocial,
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

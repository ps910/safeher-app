/**
 * AuthContext — Unified Authentication Provider
 * ══════════════════════════════════════════════════════════════════
 *
 * Integrates ALL four auth technologies:
 *  1. Passkeys (WebAuthn / FIDO2)
 *  2. Social Login / SSO (OAuth 2.0 & OpenID Connect)
 *  3. Magic Links & One-Time Passwords (OTP)
 *  4. Traditional Passwords + Multi-Factor Auth (MFA)
 *
 * Plus existing features: PIN, biometrics, duress PIN, user profile
 * All methods issue JWT tokens on success via JWTAuthService.
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import JWTAuthService from '../services/JWTAuthService';
import PasskeyAuthService from '../services/PasskeyAuthService';
import OAuthService from '../services/OAuthService';
import MagicLinkOTPService from '../services/MagicLinkOTPService';
import PasswordMFAService from '../services/PasswordMFAService';

// Lazy helper to safely get DB modules (avoid crash if Database module has issues)
const getDB = async () => {
  try {
    const db = await import('../services/Database');
    return { UserDB: db.UserDB, SessionsDB: db.SessionsDB };
  } catch (e) {
    console.log('Database not available:', e);
    return { UserDB: null, SessionsDB: null };
  }
};

/**
 * Persist auth event to UserDB (fire-and-forget, never throws)
 * @param {Object} data - User data fields to merge into the user record
 */
const persistUserData = async (data) => {
  try {
    const { UserDB } = await getDB();
    if (UserDB) {
      await UserDB.save({
        ...data,
        lastActivity: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.log('[AuthContext] DB persist error:', e);
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
  const [jwtPayload, setJwtPayload] = useState(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaMethods, setMfaMethods] = useState([]);
  const [hasPasswordSet, setHasPasswordSet] = useState(false);
  const [pendingMFA, setPendingMFA] = useState(null); // { method, email } when MFA needed
  const tokenRefreshTimer = useRef(null);

  useEffect(() => {
    loadAuthData();
    return () => {
      if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
    };
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

      // Check existing JWT session — auto-restore if valid
      try {
        const session = await JWTAuthService.checkSession();
        if (session.isValid) {
          if (session.needsRefresh) {
            const refreshed = await JWTAuthService.refreshTokens();
            if (refreshed) {
              const payload = await JWTAuthService.verifyAccessToken();
              setJwtPayload(payload);
              startTokenRefreshScheduler();
            }
          } else {
            setJwtPayload(session.payload);
            startTokenRefreshScheduler();
          }
        }
      } catch (jwtErr) {
        console.log('JWT session check error:', jwtErr);
      }

      // Check passkey availability
      try {
        const pkSupport = await PasskeyAuthService.isSupported();
        setPasskeyAvailable(pkSupport.supported);
        const pkRegistered = await PasskeyAuthService.hasCredential();
        setPasskeyRegistered(pkRegistered);
      } catch (pkErr) {
        console.log('Passkey check error:', pkErr);
      }

      // Check MFA configuration
      try {
        const mfaConfig = await PasswordMFAService.getMFAConfig();
        if (mfaConfig && mfaConfig.enabled) {
          setMfaEnabled(true);
          setMfaMethods(mfaConfig.methods || []);
        }
      } catch (mfaErr) {
        console.log('MFA config check error:', mfaErr);
      }

      // Check if password is set
      try {
        const hasPwd = await PasswordMFAService.hasPassword();
        setHasPasswordSet(hasPwd);
      } catch (pwdErr) {
        console.log('Password check error:', pwdErr);
      }

      // Sync profile data to database on startup
      try {
        const { UserDB } = await getDB();
        if (UserDB) {
          const profile = profileData ? JSON.parse(profileData) : {};
          await UserDB.save({
            fullName: profile.fullName || '',
            phone: profile.phone || '',
            email: profile.email || '',
            bloodGroup: profile.bloodGroup || '',
            gender: profile.gender || '',
            dateOfBirth: profile.dateOfBirth || '',
            homeAddress: profile.homeAddress || '',
            workAddress: profile.workAddress || '',
            collegeAddress: profile.collegeAddress || '',
            vehicleDetails: profile.vehicleDetails || '',
            allergies: profile.allergies || '',
            medicalConditions: profile.medicalConditions || '',
            medications: profile.medications || '',
            authMethod: authMethodData || 'unknown',
            biometricEnabled: bioData ? JSON.parse(bioData) : false,
            passkeyRegistered: passkeyRegistered,
            mfaEnabled: mfaEnabled,
            hasPassword: hasPasswordSet,
            appLaunchedAt: new Date().toISOString(),
          });
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
      await persistUserData({
        authMethod: 'pin',
        pinConfigured: true,
        pinSetAt: new Date().toISOString(),
      });
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
    await persistUserData({
      biometricEnabled: val,
      biometricToggledAt: new Date().toISOString(),
    });
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
      // Sync full profile to database
      await persistUserData({
        fullName: updated.fullName,
        phone: updated.phone,
        email: updated.email,
        bloodGroup: updated.bloodGroup,
        dateOfBirth: updated.dateOfBirth,
        gender: updated.gender,
        homeAddress: updated.homeAddress,
        workAddress: updated.workAddress,
        collegeAddress: updated.collegeAddress,
        vehicleDetails: updated.vehicleDetails,
        allergies: updated.allergies,
        medicalConditions: updated.medicalConditions,
        medications: updated.medications,
        profilePicUri: updated.profilePicUri,
        profileUpdatedAt: new Date().toISOString(),
      });
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

  // --- JWT Token Management ---

  const startTokenRefreshScheduler = () => {
    if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
    // Check every 4 minutes if token needs refresh
    tokenRefreshTimer.current = setInterval(async () => {
      try {
        const expiring = await JWTAuthService.isTokenExpiringSoon();
        if (expiring) {
          const refreshed = await JWTAuthService.refreshTokens();
          if (refreshed) {
            const payload = await JWTAuthService.verifyAccessToken();
            setJwtPayload(payload);
          } else {
            // Refresh failed — force re-auth
            setIsAuthenticated(false);
            setJwtPayload(null);
            clearInterval(tokenRefreshTimer.current);
          }
        }
      } catch (e) {
        console.log('Token refresh scheduler error:', e);
      }
    }, 4 * 60 * 1000);
  };

  /**
   * Issue JWT tokens after successful authentication
   * @param {string} method - Auth method used
   * @param {Object} [extra] - Additional claims (email, phone)
   * @param {boolean} [isDuress] - Duress login flag
   */
  const issueJWTTokens = async (method, extra = {}, isDuress = false) => {
    try {
      const userId = userProfile.phone || userProfile.email || extra.email || extra.phone || 'user_' + Date.now();
      const tokens = await JWTAuthService.generateTokens({
        userId,
        method,
        email: extra.email || userProfile.email,
        phone: extra.phone || userProfile.phone,
        isDuress,
      });
      const payload = await JWTAuthService.verifyAccessToken();
      setJwtPayload(payload);
      startTokenRefreshScheduler();
      return tokens;
    } catch (e) {
      console.error('JWT token issue error:', e);
      return null;
    }
  };

  /**
   * Get the current access token (auto-refreshes if needed)
   */
  const getAccessToken = async () => {
    return await JWTAuthService.getAccessToken();
  };

  /**
   * Get the Bearer auth header for API requests
   */
  const getAuthHeader = async () => {
    return await JWTAuthService.getAuthHeader();
  };

  // ═══════════════════════════════════════════════════
  //  1. PASSKEY (WebAuthn / FIDO2)
  // ═══════════════════════════════════════════════════

  /**
   * Register a new passkey credential
   * @param {Object} params - { displayName, email }
   */
  const registerPasskey = async ({ displayName, email } = {}) => {
    const userId = userProfile.phone || userProfile.email || email || 'user_' + Date.now();
    const result = await PasskeyAuthService.register({
      userId,
      displayName: displayName || userProfile.fullName || '',
      email: email || userProfile.email || '',
    });
    setPasskeyRegistered(true);
    // Persist passkey registration to DB
    await persistUserData({
      passkeyRegistered: true,
      passkeyRegisteredAt: new Date().toISOString(),
      passkeyCredentialId: result.credentialId,
      authMethod: 'passkey',
      email: email || userProfile.email,
      fullName: displayName || userProfile.fullName,
    });
    return result;
  };

  /**
   * Authenticate via passkey (biometric + crypto challenge)
   */
  const authenticateWithPasskey = async () => {
    const assertion = await PasskeyAuthService.authenticate();
    // Issue JWT on success
    await issueJWTTokens('passkey', { userId: assertion.userHandle });
    setIsAuthenticated(true);
    // Persist passkey login to DB
    await persistUserData({
      authMethod: 'passkey',
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'passkey',
      passkeyAuthCount: (await (async () => {
        try { const { UserDB } = await getDB(); const u = UserDB ? await UserDB.get() : null; return (u?.passkeyAuthCount || 0) + 1; } catch { return 1; }
      })()),
    });
    return assertion;
  };

  // ═══════════════════════════════════════════════════
  //  2. SOCIAL LOGIN / SSO (OAuth 2.0 & OIDC)
  // ═══════════════════════════════════════════════════

  /**
   * Start OAuth flow for a provider
   * @param {string} provider - 'google'|'facebook'|'apple'|'instagram'
   * @param {Object} [userData] - { email, name } for demo mode
   */
  const authenticateWithOAuth = async (provider, userData = {}) => {
    const { tokens, profile } = await OAuthService.authenticateWithUserData(provider, userData);

    // Save social data locally
    await socialLogin(provider, { ...profile, method: 'oauth2_' + provider });

    if (profile.email) {
      await updateProfile({ email: profile.email });
    }
    if (profile.name) {
      await updateProfile({ fullName: profile.name });
    }

    // Issue JWT
    await issueJWTTokens(provider, {
      email: profile.email,
      oauthProvider: provider,
      oauthId: profile.id,
    });

    // Persist OAuth login to DB
    await persistUserData({
      authMethod: 'oauth2_' + provider,
      oauthProvider: provider,
      oauthId: profile.id,
      email: profile.email,
      fullName: profile.name,
      profilePicUri: profile.picture || profile.avatar || null,
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'oauth2_' + provider,
      oauthLinkedAt: new Date().toISOString(),
    });

    return { tokens, profile };
  };

  /**
   * Handle OAuth callback URL (for real provider redirect)
   * @param {string} callbackUrl
   */
  const handleOAuthCallback = async (callbackUrl) => {
    const { code, provider } = await OAuthService.handleCallback(callbackUrl);
    const { tokens, profile } = await OAuthService.exchangeCode(provider, code);
    await socialLogin(provider, profile);
    await issueJWTTokens(provider, { email: profile.email });
    setIsAuthenticated(true);
    // Persist OAuth callback login to DB
    await persistUserData({
      authMethod: 'oauth2_' + provider,
      oauthProvider: provider,
      email: profile.email,
      fullName: profile.name,
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'oauth2_callback_' + provider,
    });
    return { tokens, profile };
  };

  // ═══════════════════════════════════════════════════
  //  3. MAGIC LINKS & OTP
  // ═══════════════════════════════════════════════════

  /**
   * Send phone OTP via MagicLinkOTPService
   * @param {string} phoneNumber
   * @returns {Promise<{sessionId, code, expiresAt, cooldown}>}
   */
  const sendPhoneOTP = async (phoneNumber) => {
    const result = await MagicLinkOTPService.sendPhoneOTP(phoneNumber);
    return result;
  };

  /**
   * Send email OTP via MagicLinkOTPService
   * @param {string} email
   * @returns {Promise<{sessionId, code, expiresAt, cooldown}>}
   */
  const sendEmailOTP = async (email) => {
    const result = await MagicLinkOTPService.sendEmailOTP(email);
    return result;
  };

  /**
   * Verify OTP and authenticate
   * @param {string} sessionId
   * @param {string} userCode
   * @param {Object} extra - { phone?, email? }
   */
  const verifyOTPAndAuth = async (sessionId, userCode, extra = {}) => {
    const result = await MagicLinkOTPService.verifyOTP(sessionId, userCode);
    if (!result.success) return result;

    const method = result.type === 'phone_otp' ? 'phone' : 'email';
    await socialLogin(method, { destination: result.destination, method: 'otp_' + method });

    if (extra.phone) await updateProfile({ phone: extra.phone });
    if (extra.email) await updateProfile({ email: extra.email });

    await issueJWTTokens(method, extra);

    // Persist OTP-verified login to DB
    await persistUserData({
      authMethod: 'otp_' + method,
      ...(extra.phone ? { phone: extra.phone } : {}),
      ...(extra.email ? { email: extra.email } : {}),
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'otp_' + method,
      otpVerifiedAt: new Date().toISOString(),
    });
    return result;
  };

  /**
   * Send magic link to email
   * @param {string} email
   */
  const sendMagicLink = async (email) => {
    return MagicLinkOTPService.sendMagicLink(email);
  };

  /**
   * Verify magic link token and authenticate
   * @param {string} token
   */
  const verifyMagicLinkAndAuth = async (token) => {
    const result = await MagicLinkOTPService.verifyMagicLink(token);
    if (!result.success) return result;

    await socialLogin('magic_link', { email: result.email, method: 'magic_link' });
    await updateProfile({ email: result.email });
    await issueJWTTokens('magic_link', { email: result.email });
    setIsAuthenticated(true);
    // Persist magic link login to DB
    await persistUserData({
      authMethod: 'magic_link',
      email: result.email,
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'magic_link',
      magicLinkVerifiedAt: new Date().toISOString(),
    });
    return result;
  };

  // ═══════════════════════════════════════════════════
  //  4. PASSWORD + MFA
  // ═══════════════════════════════════════════════════

  /**
   * Create password (signup)
   * @param {string} email
   * @param {string} password
   */
  const createPassword = async (email, password) => {
    const result = await PasswordMFAService.createPassword(email, password);
    if (result.success) {
      setHasPasswordSet(true);
      await updateProfile({ email });
      // Persist account creation to DB
      await persistUserData({
        email,
        hasPassword: true,
        passwordCreatedAt: new Date().toISOString(),
        accountCreatedAt: new Date().toISOString(),
        authMethod: 'password',
      });
    }
    return result;
  };

  /**
   * Verify password (login) — may trigger MFA
   * @param {string} email
   * @param {string} password
   */
  const verifyPasswordAndAuth = async (email, password) => {
    const result = await PasswordMFAService.verifyPassword(email, password);

    if (!result.success) return result;

    if (result.mfaRequired) {
      // Password correct, but MFA needed — set pending state
      setPendingMFA({ email, methods: result.mfaMethods });
      return { success: true, mfaRequired: true, mfaMethods: result.mfaMethods };
    }

    // No MFA — authenticate directly
    await socialLogin('password', { email, method: 'password' });
    await updateProfile({ email });
    await issueJWTTokens('password', { email });
    setIsAuthenticated(true);
    setPendingMFA(null);
    // Persist password login to DB
    await persistUserData({
      authMethod: 'password',
      email,
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'password',
    });
    return { success: true, mfaRequired: false };
  };

  /**
   * Verify MFA code after password step
   * @param {string} method - 'totp'|'biometric'|'recovery'|'sms'|'email'
   * @param {string} code
   */
  const verifyMFAAndAuth = async (method, code) => {
    const result = await PasswordMFAService.verifyMFA(method, code);
    if (!result.success) return result;

    // MFA passed — complete auth
    const email = pendingMFA?.email || userProfile.email || '';
    await socialLogin('password_mfa', { email, method: 'password_mfa_' + method });
    await issueJWTTokens('password_mfa', { email, mfaMethod: method });
    setIsAuthenticated(true);
    setPendingMFA(null);
    // Persist MFA-verified login to DB
    await persistUserData({
      authMethod: 'password_mfa',
      mfaMethod: method,
      email,
      lastLogin: new Date().toISOString(),
      lastLoginMethod: 'password_mfa_' + method,
      mfaVerifiedAt: new Date().toISOString(),
    });
    return result;
  };

  /**
   * Enable MFA
   * @param {string} method
   * @param {Object} config
   */
  const enableMFA = async (method, config = {}) => {
    const result = await PasswordMFAService.enableMFA(method, config);
    if (result.success) {
      setMfaEnabled(true);
      const mfaConfig = await PasswordMFAService.getMFAConfig();
      setMfaMethods(mfaConfig?.methods || []);
      // Persist MFA enablement to DB
      await persistUserData({
        mfaEnabled: true,
        mfaMethods: mfaConfig?.methods || [method],
        mfaEnabledAt: new Date().toISOString(),
        mfaLastMethod: method,
      });
    }
    return result;
  };

  /**
   * Disable MFA
   * @param {string} method
   */
  const disableMFA = async (method) => {
    const result = await PasswordMFAService.disableMFA(method);
    const mfaConfig = await PasswordMFAService.getMFAConfig();
    setMfaEnabled(mfaConfig?.enabled || false);
    setMfaMethods(mfaConfig?.methods || []);
    // Persist MFA state change to DB
    await persistUserData({
      mfaEnabled: mfaConfig?.enabled || false,
      mfaMethods: mfaConfig?.methods || [],
      mfaDisabledMethod: method,
      mfaUpdatedAt: new Date().toISOString(),
    });
    return result;
  };

  /**
   * Validate password strength
   * @param {string} password
   */
  const validatePassword = (password) => {
    return PasswordMFAService.validatePassword(password);
  };

  /**
   * Change password
   * @param {string} currentPassword
   * @param {string} newPassword
   */
  const changePassword = async (currentPassword, newPassword) => {
    const result = await PasswordMFAService.changePassword(currentPassword, newPassword);
    if (result.success) {
      await persistUserData({
        passwordChangedAt: new Date().toISOString(),
      });
    }
    return result;
  };

  // ═══════════════════════════════════════════════════
  //  UNIFIED AUTH METHODS
  // ═══════════════════════════════════════════════════

  // Authenticate (issues JWT tokens)
  const authenticate = async (method, extra = {}, isDuress = false) => {
    await issueJWTTokens(method || authMethod || 'unknown', extra, isDuress);
    setIsAuthenticated(true);
    // Persist authentication event + start session
    const { SessionsDB } = await getDB();
    if (SessionsDB) {
      try { await SessionsDB.start(); } catch (e) { console.log('Session start error:', e); }
    }
    await persistUserData({
      authMethod: method || authMethod || 'unknown',
      lastLogin: new Date().toISOString(),
      lastLoginMethod: method || authMethod || 'unknown',
      isDuress: isDuress || false,
      ...(extra.email ? { email: extra.email } : {}),
      ...(extra.phone ? { phone: extra.phone } : {}),
    });
  };

  // Lock (clears JWT tokens)
  const lock = async () => {
    setIsAuthenticated(false);
    setJwtPayload(null);
    if (tokenRefreshTimer.current) clearInterval(tokenRefreshTimer.current);
    await JWTAuthService.clearTokens();
    // End session in DB
    try {
      const { SessionsDB } = await getDB();
      if (SessionsDB) await SessionsDB.end();
    } catch (e) { console.log('Session end error:', e); }
    await persistUserData({ lastLogout: new Date().toISOString() });
  };

  // Enter duress mode (silent SOS — tags JWT with duress flag)
  const enterDuressMode = async () => {
    setIsDuressMode(true);
    setIsAuthenticated(true);
    // Re-issue token with duress flag
    await issueJWTTokens(authMethod || 'pin', {}, true);
    await persistUserData({
      duressTriggeredAt: new Date().toISOString(),
      isDuress: true,
    });
  };

  // Social login (phone, google, facebook, instagram)
  const socialLogin = async (method, data) => {
    try {
      setAuthMethod(method);
      setSocialData(data);
      await AsyncStorage.setItem(AUTH_KEYS.AUTH_METHOD, method);
      await AsyncStorage.setItem(AUTH_KEYS.SOCIAL_DATA, JSON.stringify(data));
      // Persist social login data to DB
      await persistUserData({
        authMethod: method,
        socialProvider: method,
        socialData: data,
        ...(data?.email ? { email: data.email } : {}),
        ...(data?.name ? { fullName: data.name } : {}),
        ...(data?.phone ? { phone: data.phone } : {}),
        socialLinkedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Social login save error:', e);
    }
  };

  const hasDuressPin = !!duressPin;

  const value = {
    // ── State ──
    isAuthenticated, isOnboarded, isLoading, userProfile,
    pin, duressPin, hasDuressPin, biometricEnabled, isDuressMode,
    authMethod, socialData, isProfileComplete, jwtPayload,
    passkeyAvailable, passkeyRegistered,
    mfaEnabled, mfaMethods, hasPasswordSet, pendingMFA,

    // ── Original Methods ──
    setupPin, setupDuressPin, verifyPin, toggleBiometric,
    completeOnboarding, updateProfile, authenticate, lock,
    enterDuressMode, setIsDuressMode, socialLogin,
    markProfileComplete, prefillFromSocial,
    issueJWTTokens, getAccessToken, getAuthHeader,

    // ── Passkeys ──
    registerPasskey, authenticateWithPasskey,

    // ── OAuth / SSO ──
    authenticateWithOAuth, handleOAuthCallback,

    // ── Magic Links & OTP ──
    sendPhoneOTP, sendEmailOTP, verifyOTPAndAuth,
    sendMagicLink, verifyMagicLinkAndAuth,

    // ── Password + MFA ──
    createPassword, verifyPasswordAndAuth,
    verifyMFAAndAuth, enableMFA, disableMFA,
    validatePassword, changePassword,
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

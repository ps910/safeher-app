// ═══════════════════════════════════════════════════════════════════
// SafeHer — Global Type Definitions
// ═══════════════════════════════════════════════════════════════════

// ── React Native / Expo globals ────────────────────────────────
declare const __DEV__: boolean;

// ── Navigation Types ───────────────────────────────────────────
export type RootStackParamList = {
  MainTabs: undefined;
  FakeCall: undefined;
  Settings: undefined;
  SelfDefense: undefined;
  NearbyHelp: undefined;
  Profile: undefined;
  EvidenceVault: undefined;
  GuardianMode: undefined;
  JourneyTracker: undefined;
  IncidentReport: undefined;
  HiddenCamera: undefined;
};

export type TabParamList = {
  Home: undefined;
  Contacts: undefined;
  Location: undefined;
  Tips: undefined;
};

// ── Location Types ─────────────────────────────────────────────
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface LocationData {
  coords: Coordinates;
  timestamp: number;
}

export interface StoredLocation {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: number;
  context?: string;
  synced?: boolean;
  createdAt?: string;
  hash?: string;
}

// ── Contact Types ──────────────────────────────────────────────
export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  isEmergency?: boolean;
  isPrimary?: boolean;
  pushToken?: string | null;
}

// ── SOS / Alert Types ──────────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertType = 'SOS_DANGER' | 'JOURNEY_OVERDUE' | 'INACTIVITY' | 'SCREAM_DETECTED' | 'SHAKE_DETECTED';

export interface AlertRecord {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  message: string;
  deviceId: string;
  contactsNotified: number;
  isMoving: boolean;
  locationUpdateCount: number;
  locationHistory: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy?: number | null;
  }>;
  status?: 'ACTIVE' | 'RESOLVED';
  createdAt: string;
  resolvedAt?: string | null;
}

// ── Evidence Types ─────────────────────────────────────────────
export type EvidenceType = 'photo' | 'video' | 'audio' | 'document' | 'text';

export interface EvidenceRecord {
  id: string;
  type: EvidenceType;
  uri: string;
  filename?: string;
  size?: number;
  mimeType?: string;
  encrypted?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
  createdAt: string;
  hash?: string;
}

// ── Journey Types ──────────────────────────────────────────────
export interface Journey {
  id: string;
  destination: string;
  startTime: string;
  expectedArrivalTime: string;
  endTime?: string | null;
  status: 'active' | 'completed' | 'overdue' | 'cancelled';
  contacts: EmergencyContact[];
  startLocation?: { latitude: number; longitude: number };
  endLocation?: { latitude: number; longitude: number } | null;
  breadcrumbs: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    speed?: number;
  }>;
}

// ── Auth Types ─────────────────────────────────────────────────
export type AuthMethod =
  | 'email_password'
  | 'google'
  | 'facebook'
  | 'apple'
  | 'phone'
  | 'magic_link'
  | 'biometric'
  | 'passkey'
  | 'pin'
  | 'anonymous'
  | 'unknown';

export interface UserProfile {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  profilePicUri: string | null;
  bloodGroup: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  homeAddress: string;
  workAddress: string;
  collegeAddress: string;
  vehicleDetails: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnboarded: boolean;
  userProfile: UserProfile;
  firebaseUser: any; // Firebase User type
  pin: string | null;
  duressPin: string | null;
  hasDuressPin: boolean;
  biometricEnabled: boolean;
  isDuressMode: boolean;
  authMethod: AuthMethod | null;
  socialData: Record<string, any> | null;
  isProfileComplete: boolean;
  jwtPayload: any;
  passkeyAvailable: boolean;
  passkeyRegistered: boolean;
  mfaEnabled: boolean;
  mfaMethods: string[];
  hasPasswordSet: boolean;
  pendingMFA: any;

  authenticate: (method?: string, extra?: Record<string, any>, isDuress?: boolean) => Promise<void>;
  lock: () => Promise<void>;
  enterDuressMode: () => Promise<void>;
  setIsDuressMode: (val: boolean) => void;
  setupPin: (pin: string) => Promise<void>;
  setupDuressPin: (pin: string) => Promise<void>;
  verifyPin: (entered: string) => 'normal' | 'duress' | false;
  toggleBiometric: (val: boolean) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  markProfileComplete: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  prefillFromSocial: () => Partial<UserProfile>;
  socialLogin: (method: string, data: Record<string, any>) => Promise<void>;

  // Backward-compat stubs
  issueJWTTokens: () => Promise<null>;
  getAccessToken: () => Promise<null>;
  getAuthHeader: () => Promise<{ Authorization: string }>;
  registerPasskey: () => Promise<{ credentialId: string }>;
  authenticateWithPasskey: () => Promise<Record<string, any>>;
  authenticateWithOAuth: (provider: string, data?: Record<string, any>) => Promise<{ profile: any }>;
  handleOAuthCallback: () => Promise<void>;
  sendPhoneOTP: () => Promise<{ sessionId: string; code: string }>;
  sendEmailOTP: () => Promise<{ sessionId: string; code: string }>;
  verifyOTPAndAuth: () => Promise<{ success: boolean }>;
  sendMagicLink: () => Promise<Record<string, any>>;
  verifyMagicLinkAndAuth: () => Promise<{ success: boolean }>;
  createPassword: () => Promise<{ success: boolean }>;
  verifyPasswordAndAuth: () => Promise<{ success: boolean }>;
  verifyMFAAndAuth: () => Promise<{ success: boolean }>;
  enableMFA: () => Promise<{ success: boolean }>;
  disableMFA: () => Promise<{ success: boolean }>;
  validatePassword: (p: string) => { valid: boolean; score: number };
  changePassword: () => Promise<{ success: boolean }>;
}

// ── Emergency Context Types ────────────────────────────────────
export interface EmergencySettings {
  shakeToSOS: boolean;
  autoLocationShare: boolean;
  sirenEnabled: boolean;
  countdownSeconds: number;
  autoCallPolice: boolean;
  autoRecordAudio: boolean;
  offlineSOS: boolean;
  hiddenMode: boolean;
  voiceActivation: boolean;
  inactivitySOSEnabled: boolean;
  inactivityTimeout: number;
  screamDetection: boolean;
  screamThreshold: number;
  autoPhotoCapture: boolean;
  journeyAlerts: boolean;
  panicWipeEnabled: boolean;
  backgroundLocationEnabled: boolean;
  persistentSOSNotification: boolean;
  volumeButtonSOS: boolean;
  liveLocationSharing: boolean;
  pushNotifications: boolean;
  countryOverride: string | null;
}

// ── Database Record Types ──────────────────────────────────────
export interface DBRecord {
  id: string;
  createdAt: string;
  hash?: string;
  [key: string]: any;
}

export interface OfflineQueueItem {
  id: string;
  type: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  data: Record<string, any>;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface NearbyUser {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  hasInternet: boolean;
  platform: string;
  lastSeen: string;
}

// ── Cloud Sync Types ───────────────────────────────────────────
export interface SyncStats {
  total: number;
  success: number;
  failed: number;
  lastError: string | null;
}

export interface CloudSyncStatus {
  isInitialized: boolean;
  isEnabled: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  stats: SyncStats;
  hasFirebaseConfig: boolean;
}

// ── Encrypted Storage Types ────────────────────────────────────
export interface EncryptedEntry {
  ct: string;   // ciphertext (base64)
  iv: string;   // initialization vector
  hmac: string; // integrity hash
  v: number;    // version
}

// ── Notification Types ─────────────────────────────────────────
export interface PushTokenInfo {
  token: string;
  platform: string;
  timestamp: string;
}

// ── Safety AI Types ────────────────────────────────────────────
export interface SafetyAIStatus {
  shakeEnabled: boolean;
  screamEnabled: boolean;
  isRecording: boolean;
  isSirenPlaying: boolean;
}

// ── Live Location Sharing Types ────────────────────────────────
export interface LiveSession {
  id: string;
  shareUrl: string;
  startedAt: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
}

// ── Theme Types ────────────────────────────────────────────────
export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  tertiary: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  textLight: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  white: string;
  black: string;
  overlay: string;
  cardGradientStart: string;
  cardGradientEnd: string;
  sosRed: string;
  safeGreen: string;
  grey?: string;
  darkGrey?: string;
  lightGrey?: string;
}

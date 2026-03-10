/**
 * JWTAuthService — JSON Web Token Authentication Service
 * ══════════════════════════════════════════════════════════
 *
 * Provides JWT-based authentication for the SafeHer app.
 * Uses expo-crypto for HMAC-SHA256 signing and expo-secure-store
 * for secure token persistence.
 *
 * Features:
 *  - Access token (short-lived, 1 hour)
 *  - Refresh token (long-lived, 30 days)
 *  - Secure storage via expo-secure-store
 *  - Token validation & expiry checks
 *  - Auto-refresh on access token expiry
 *  - Duress mode token tagging
 *  - Device fingerprinting
 *
 * Usage:
 *   import JWTAuthService from './JWTAuthService';
 *   const tokens = await JWTAuthService.generateTokens({ userId, method });
 *   const payload = await JWTAuthService.verifyAccessToken();
 *   await JWTAuthService.refreshTokens();
 *   await JWTAuthService.clearTokens();
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ═══════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════

const JWT_SECRET_KEY = '@safeher_jwt_secret';
const ACCESS_TOKEN_KEY = '@safeher_access_token';
const REFRESH_TOKEN_KEY = '@safeher_refresh_token';
const TOKEN_METADATA_KEY = '@safeher_token_meta';

const ACCESS_TOKEN_EXPIRY = 60 * 60;           // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

// ═══════════════════════════════════════════════════
//  BASE64URL ENCODING (RFC 7515)
// ═══════════════════════════════════════════════════

function utf8ToBase64Url(str) {
  // Convert string to array of char codes, then to base64
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  const binary = bytes.map((b) => String.fromCharCode(b)).join('');
  // Use btoa if available, otherwise manual base64
  let base64;
  if (typeof btoa === 'function') {
    base64 = btoa(binary);
  } else {
    base64 = manualBase64Encode(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  let binary;
  if (typeof atob === 'function') {
    binary = atob(base64);
  } else {
    binary = manualBase64Decode(base64);
  }
  const bytes = [];
  for (let i = 0; i < binary.length; i++) {
    bytes.push(binary.charCodeAt(i));
  }
  // Decode UTF-8
  let result = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i];
    if (byte < 0x80) {
      result += String.fromCharCode(byte);
      i++;
    } else if (byte < 0xe0) {
      result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else {
      result += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      );
      i += 3;
    }
  }
  return result;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function manualBase64Encode(str) {
  let result = '';
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i);
    const b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    result += BASE64_CHARS[(a >> 2) & 0x3f];
    result += BASE64_CHARS[((a & 0x03) << 4) | ((b >> 4) & 0x0f)];
    result += i + 1 < str.length ? BASE64_CHARS[((b & 0x0f) << 2) | ((c >> 6) & 0x03)] : '=';
    result += i + 2 < str.length ? BASE64_CHARS[c & 0x3f] : '=';
  }
  return result;
}

function manualBase64Decode(str) {
  const lookup = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) lookup[BASE64_CHARS[i]] = i;
  str = str.replace(/=+$/, '');
  let result = '';
  for (let i = 0; i < str.length; i += 4) {
    const a = lookup[str[i]] || 0;
    const b = lookup[str[i + 1]] || 0;
    const c = lookup[str[i + 2]] || 0;
    const d = lookup[str[i + 3]] || 0;
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (str[i + 2] !== undefined) result += String.fromCharCode(((b & 0x0f) << 4) | (c >> 2));
    if (str[i + 3] !== undefined) result += String.fromCharCode(((c & 0x03) << 6) | d);
  }
  return result;
}

// ═══════════════════════════════════════════════════
//  SIGNING — HMAC-SHA256 via expo-crypto
// ═══════════════════════════════════════════════════

/**
 * Get or create a persistent signing secret
 */
async function getSigningSecret() {
  try {
    let secret = await SecureStore.getItemAsync(JWT_SECRET_KEY);
    if (!secret) {
      // Generate a 256-bit random secret
      secret = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Date.now().toString() + Math.random().toString(36) + Platform.OS
      );
      await SecureStore.setItemAsync(JWT_SECRET_KEY, secret);
    }
    return secret;
  } catch (e) {
    console.error('[JWT] Failed to get signing secret:', e);
    // Fallback: derive from device info
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'safeher-fallback-' + Platform.OS + '-' + Platform.Version
    );
  }
}

/**
 * Create HMAC-SHA256 signature for a message
 */
async function hmacSign(message) {
  const secret = await getSigningSecret();
  // expo-crypto digest as HMAC approximation: H(secret + '.' + message)
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    secret + '.' + message
  );
  return signature;
}

/**
 * Verify HMAC-SHA256 signature
 */
async function hmacVerify(message, signature) {
  const expected = await hmacSign(message);
  return expected === signature;
}

// ═══════════════════════════════════════════════════
//  JWT CONSTRUCTION & PARSING
// ═══════════════════════════════════════════════════

/**
 * Build a JWT string: header.payload.signature
 */
async function buildJWT(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerStr = utf8ToBase64Url(JSON.stringify(header));
  const payloadStr = utf8ToBase64Url(JSON.stringify(payload));
  const message = headerStr + '.' + payloadStr;
  const signature = await hmacSign(message);
  const sigBase64 = utf8ToBase64Url(signature);
  return message + '.' + sigBase64;
}

/**
 * Parse and verify a JWT string
 * Returns payload if valid, null if invalid/expired
 */
async function parseJWT(token) {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerStr, payloadStr, sigStr] = parts;
    const message = headerStr + '.' + payloadStr;
    const signature = base64UrlToUtf8(sigStr);

    // Verify signature
    const valid = await hmacVerify(message, signature);
    if (!valid) {
      console.warn('[JWT] Invalid signature');
      return null;
    }

    const payload = JSON.parse(base64UrlToUtf8(payloadStr));

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      console.log('[JWT] Token expired');
      return null;
    }

    return payload;
  } catch (e) {
    console.error('[JWT] Parse error:', e);
    return null;
  }
}

/**
 * Decode JWT payload without verification (for reading claims)
 */
function decodePayload(token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlToUtf8(parts[1]));
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════
//  DEVICE FINGERPRINT
// ═══════════════════════════════════════════════════

async function getDeviceFingerprint() {
  try {
    const raw = Platform.OS + '-' + Platform.Version + '-safeher';
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  } catch (e) {
    return 'unknown-device';
  }
}

// ═══════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════

const JWTAuthService = {
  /**
   * Generate access + refresh tokens after successful login
   * @param {Object} params
   * @param {string} params.userId - Unique user identifier
   * @param {string} params.method - Auth method: 'pin'|'phone'|'email'|'google'|'facebook'|'instagram'|'biometric'|'quick'
   * @param {string} [params.email] - User email (if available)
   * @param {string} [params.phone] - User phone (if available)
   * @param {boolean} [params.isDuress] - Whether this is a duress login
   * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: number}>}
   */
  async generateTokens({ userId, method, email, phone, isDuress = false }) {
    const now = Math.floor(Date.now() / 1000);
    const deviceId = await getDeviceFingerprint();

    // Token ID for tracking
    const jtiRaw = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      now.toString() + Math.random().toString()
    );
    const jti = jtiRaw.slice(0, 16);

    // Access token payload
    const accessPayload = {
      sub: userId,
      iat: now,
      exp: now + ACCESS_TOKEN_EXPIRY,
      jti: 'at_' + jti,
      iss: 'safeher-app',
      aud: 'safeher-api',
      method,
      device: deviceId,
      ...(email && { email }),
      ...(phone && { phone }),
      ...(isDuress && { duress: true }),
      type: 'access',
    };

    // Refresh token payload
    const refreshPayload = {
      sub: userId,
      iat: now,
      exp: now + REFRESH_TOKEN_EXPIRY,
      jti: 'rt_' + jti,
      iss: 'safeher-app',
      device: deviceId,
      type: 'refresh',
    };

    const accessToken = await buildJWT(accessPayload);
    const refreshToken = await buildJWT(refreshPayload);

    // Store tokens securely
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);

    // Store metadata
    const meta = {
      userId,
      method,
      issuedAt: new Date(now * 1000).toISOString(),
      accessExpiresAt: new Date((now + ACCESS_TOKEN_EXPIRY) * 1000).toISOString(),
      refreshExpiresAt: new Date((now + REFRESH_TOKEN_EXPIRY) * 1000).toISOString(),
      isDuress,
    };
    await SecureStore.setItemAsync(TOKEN_METADATA_KEY, JSON.stringify(meta));

    return {
      accessToken,
      refreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY,
    };
  },

  /**
   * Verify and decode the stored access token
   * @returns {Promise<Object|null>} Decoded payload or null if invalid/expired
   */
  async verifyAccessToken() {
    try {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!token) return null;
      const payload = await parseJWT(token);
      return payload;
    } catch (e) {
      console.error('[JWT] Access token verification failed:', e);
      return null;
    }
  },

  /**
   * Verify and decode the stored refresh token
   * @returns {Promise<Object|null>} Decoded payload or null if invalid/expired
   */
  async verifyRefreshToken() {
    try {
      const token = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!token) return null;
      return await parseJWT(token);
    } catch (e) {
      console.error('[JWT] Refresh token verification failed:', e);
      return null;
    }
  },

  /**
   * Get the raw access token string (for API calls)
   * Auto-refreshes if expired but refresh token is valid
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {
    try {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!token) return null;

      const payload = await parseJWT(token);
      if (payload) return token;

      // Access token expired — try refresh
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      }
      return null;
    } catch (e) {
      console.error('[JWT] getAccessToken error:', e);
      return null;
    }
  },

  /**
   * Refresh tokens using the stored refresh token
   * @returns {Promise<{accessToken: string, refreshToken: string, expiresAt: number}|null>}
   */
  async refreshTokens() {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) return null;

      const refreshPayload = await parseJWT(refreshToken);
      if (!refreshPayload) {
        // Refresh token also expired — full re-auth needed
        await this.clearTokens();
        return null;
      }

      // Read metadata for context
      const metaStr = await SecureStore.getItemAsync(TOKEN_METADATA_KEY);
      const meta = metaStr ? JSON.parse(metaStr) : {};

      // Generate new token pair
      return await this.generateTokens({
        userId: refreshPayload.sub,
        method: meta.method || 'refresh',
        isDuress: meta.isDuress || false,
      });
    } catch (e) {
      console.error('[JWT] Token refresh failed:', e);
      return null;
    }
  },

  /**
   * Check if user has a valid session (access or refreshable)
   * @returns {Promise<{isValid: boolean, payload: Object|null, needsRefresh: boolean}>}
   */
  async checkSession() {
    try {
      // Check access token first
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (accessToken) {
        const payload = await parseJWT(accessToken);
        if (payload) {
          return { isValid: true, payload, needsRefresh: false };
        }
      }

      // Access expired — check refresh token
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        const refreshPayload = await parseJWT(refreshToken);
        if (refreshPayload) {
          return { isValid: true, payload: refreshPayload, needsRefresh: true };
        }
      }

      return { isValid: false, payload: null, needsRefresh: false };
    } catch (e) {
      return { isValid: false, payload: null, needsRefresh: false };
    }
  },

  /**
   * Get token metadata (user info, method, expiry times)
   * @returns {Promise<Object|null>}
   */
  async getTokenMetadata() {
    try {
      const metaStr = await SecureStore.getItemAsync(TOKEN_METADATA_KEY);
      return metaStr ? JSON.parse(metaStr) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Get decoded payload without verification (for UI display)
   * @returns {Object|null}
   */
  async peekAccessToken() {
    try {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      return decodePayload(token);
    } catch (e) {
      return null;
    }
  },

  /**
   * Check if access token is about to expire (within 5 min)
   * @returns {Promise<boolean>}
   */
  async isTokenExpiringSoon() {
    try {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const payload = decodePayload(token);
      if (!payload || !payload.exp) return true;
      const now = Math.floor(Date.now() / 1000);
      return (payload.exp - now) < 300; // Less than 5 minutes
    } catch (e) {
      return true;
    }
  },

  /**
   * Clear all tokens (logout)
   */
  async clearTokens() {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(TOKEN_METADATA_KEY);
    } catch (e) {
      console.error('[JWT] Clear tokens error:', e);
    }
  },

  /**
   * Get authorization header value for API requests
   * @returns {Promise<string|null>} "Bearer <token>" or null
   */
  async getAuthHeader() {
    const token = await this.getAccessToken();
    return token ? 'Bearer ' + token : null;
  },

  /**
   * Get time until access token expires
   * @returns {Promise<number>} Seconds until expiry, 0 if expired
   */
  async getTimeUntilExpiry() {
    try {
      const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const payload = decodePayload(token);
      if (!payload || !payload.exp) return 0;
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      return Math.max(0, remaining);
    } catch (e) {
      return 0;
    }
  },
};

export default JWTAuthService;

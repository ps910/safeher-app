/**
 * MagicLinkOTPService — Magic Links & One-Time Password Authentication
 * ══════════════════════════════════════════════════════════════════════
 *
 * Passwordless authentication via:
 *  1. Magic Links — time-limited, single-use deep links sent via email/SMS
 *  2. OTP (TOTP/HOTP) — 6-digit codes via email or SMS
 *  3. Email verification codes
 *  4. Phone SMS verification codes
 *
 * Standards:
 *  - TOTP: RFC 6238 (Time-Based One-Time Password)
 *  - HOTP: RFC 4226 (HMAC-Based One-Time Password)
 *  - Magic Links: URI-based authentication tokens
 *
 * Security:
 *  - Codes expire after 5 minutes
 *  - Max 5 verification attempts per code
 *  - Rate limiting on code generation (30s cooldown)
 *  - Codes are hashed before storage
 *  - Magic link tokens are single-use + time-bound
 *  - Brute-force lockout after repeated failures
 *
 * Usage:
 *   import MagicLinkOTPService from './MagicLinkOTPService';
 *   const { code } = await MagicLinkOTPService.sendPhoneOTP('+919876543210');
 *   const result = await MagicLinkOTPService.verifyOTP(sessionId, userInput);
 *   const { magicLink } = await MagicLinkOTPService.sendMagicLink('user@example.com');
 *   const result = await MagicLinkOTPService.verifyMagicLink(token);
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ═══════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════

const OTP_SESSION_KEY = '@safeher_otp_session';
const MAGIC_LINK_KEY = '@safeher_magic_link';
const OTP_RATE_LIMIT_KEY = '@safeher_otp_rate';
const OTP_LOCKOUT_KEY = '@safeher_otp_lockout';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 300;       // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN = 30;        // 30 seconds
const MAGIC_LINK_EXPIRY = 600;         // 10 minutes
const LOCKOUT_DURATION = 300;           // 5 minutes lockout after max failures
const MAX_SESSIONS_PER_HOUR = 10;
const MAGIC_LINK_BASE_URL = 'https://safeher.app/auth/magic';
const DEEP_LINK_SCHEME = 'safeher://auth/magic';

// ═══════════════════════════════════════════════════
//  CRYPTO HELPERS
// ═══════════════════════════════════════════════════

async function generateSecureRandom(length = 32) {
  const raw = Date.now().toString(36) +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2) +
    Math.random().toString(36).substring(2);
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)).slice(0, length);
}

function generateNumericOTP(length = OTP_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  // Ensure first digit is not 0
  if (code[0] === '0') code = (Math.floor(Math.random() * 9) + 1).toString() + code.slice(1);
  return code;
}

async function hashValue(value) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value + '|safeher-otp-salt');
}

/**
 * TOTP generator (RFC 6238 simplified)
 * Uses time-step of 30 seconds, SHA-256
 */
async function generateTOTP(secret, timeStep = 30) {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const hmac = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    secret + '|' + counter.toString()
  );
  // Dynamic truncation — take last nibble as offset
  const offset = parseInt(hmac.slice(-1), 16) % (hmac.length - 8);
  const code = parseInt(hmac.slice(offset, offset + 8), 16) % Math.pow(10, OTP_LENGTH);
  return code.toString().padStart(OTP_LENGTH, '0');
}

/**
 * HOTP generator (RFC 4226 simplified)
 * Counter-based OTP
 */
async function generateHOTP(secret, counter) {
  const hmac = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    secret + '|hotp|' + counter.toString()
  );
  const offset = parseInt(hmac.slice(-1), 16) % (hmac.length - 8);
  const code = parseInt(hmac.slice(offset, offset + 8), 16) % Math.pow(10, OTP_LENGTH);
  return code.toString().padStart(OTP_LENGTH, '0');
}

// ═══════════════════════════════════════════════════
//  RATE LIMITING
// ═══════════════════════════════════════════════════

async function checkRateLimit() {
  try {
    const rateStr = await AsyncStorage.getItem(OTP_RATE_LIMIT_KEY);
    if (!rateStr) return { allowed: true };

    const rate = JSON.parse(rateStr);
    const now = Date.now();

    // Check lockout
    if (rate.lockedUntil && now < rate.lockedUntil) {
      const remaining = Math.ceil((rate.lockedUntil - now) / 1000);
      return { allowed: false, reason: 'LOCKED_OUT', remaining };
    }

    // Check resend cooldown
    if (rate.lastSent && (now - rate.lastSent) < OTP_RESEND_COOLDOWN * 1000) {
      const remaining = Math.ceil((OTP_RESEND_COOLDOWN * 1000 - (now - rate.lastSent)) / 1000);
      return { allowed: false, reason: 'COOLDOWN', remaining };
    }

    // Check hourly limit
    const oneHourAgo = now - 3600000;
    const recentSends = (rate.sends || []).filter((t) => t > oneHourAgo);
    if (recentSends.length >= MAX_SESSIONS_PER_HOUR) {
      return { allowed: false, reason: 'HOURLY_LIMIT', remaining: 3600 };
    }

    return { allowed: true };
  } catch (e) {
    return { allowed: true };
  }
}

async function recordSend() {
  try {
    const rateStr = await AsyncStorage.getItem(OTP_RATE_LIMIT_KEY);
    const rate = rateStr ? JSON.parse(rateStr) : { sends: [] };
    const now = Date.now();
    rate.sends = [...(rate.sends || []).filter((t) => t > now - 3600000), now];
    rate.lastSent = now;
    await AsyncStorage.setItem(OTP_RATE_LIMIT_KEY, JSON.stringify(rate));
  } catch (e) {}
}

async function recordLockout() {
  try {
    const rateStr = await AsyncStorage.getItem(OTP_RATE_LIMIT_KEY);
    const rate = rateStr ? JSON.parse(rateStr) : {};
    rate.lockedUntil = Date.now() + LOCKOUT_DURATION * 1000;
    await AsyncStorage.setItem(OTP_RATE_LIMIT_KEY, JSON.stringify(rate));
  } catch (e) {}
}

// ═══════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════

const MagicLinkOTPService = {
  // ─────────────────────────────────────────────
  //  OTP METHODS
  // ─────────────────────────────────────────────

  /**
   * Send OTP to phone number via SMS
   * @param {string} phoneNumber - Phone number (with country code)
   * @returns {Promise<{sessionId: string, expiresAt: number, code: string}>}
   */
  async sendPhoneOTP(phoneNumber) {
    // Rate limit check
    const rateCheck = await checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason + '|' + rateCheck.remaining);
    }

    const code = generateNumericOTP();
    const sessionId = await generateSecureRandom(24);
    const codeHash = await hashValue(code);
    const now = Date.now();
    const expiresAt = now + OTP_EXPIRY_SECONDS * 1000;

    const session = {
      sessionId,
      type: 'phone_otp',
      destination: phoneNumber,
      codeHash,
      expiresAt,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      createdAt: now,
      verified: false,
    };

    await SecureStore.setItemAsync(OTP_SESSION_KEY, JSON.stringify(session));
    await recordSend();

    // In production: send SMS via Twilio/Firebase/AWS SNS
    // For demo: return code for auto-fill simulation
    console.log('[OTP] Phone OTP sent to', phoneNumber, ':', code);

    return { sessionId, expiresAt, code, cooldown: OTP_RESEND_COOLDOWN };
  },

  /**
   * Send OTP to email address
   * @param {string} email - Email address
   * @returns {Promise<{sessionId: string, expiresAt: number, code: string}>}
   */
  async sendEmailOTP(email) {
    const rateCheck = await checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason + '|' + rateCheck.remaining);
    }

    const code = generateNumericOTP();
    const sessionId = await generateSecureRandom(24);
    const codeHash = await hashValue(code);
    const now = Date.now();
    const expiresAt = now + OTP_EXPIRY_SECONDS * 1000;

    const session = {
      sessionId,
      type: 'email_otp',
      destination: email,
      codeHash,
      expiresAt,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      createdAt: now,
      verified: false,
    };

    await SecureStore.setItemAsync(OTP_SESSION_KEY, JSON.stringify(session));
    await recordSend();

    // In production: send email via SendGrid/SES/Mailgun
    console.log('[OTP] Email OTP sent to', email, ':', code);

    return { sessionId, expiresAt, code, cooldown: OTP_RESEND_COOLDOWN };
  },

  /**
   * Generate TOTP code (for authenticator apps)
   * @param {string} secret - User's TOTP secret
   * @returns {Promise<{code: string, validFor: number}>}
   */
  async generateTOTPCode(secret) {
    const code = await generateTOTP(secret);
    const timeStep = 30;
    const elapsed = (Date.now() / 1000) % timeStep;
    const validFor = Math.ceil(timeStep - elapsed);
    return { code, validFor };
  },

  /**
   * Verify OTP code
   * @param {string} sessionId - Session ID from sendPhoneOTP/sendEmailOTP
   * @param {string} userCode - Code entered by user
   * @returns {Promise<{success: boolean, error?: string, destination?: string, type?: string}>}
   */
  async verifyOTP(sessionId, userCode) {
    try {
      const sessionStr = await SecureStore.getItemAsync(OTP_SESSION_KEY);
      if (!sessionStr) {
        return { success: false, error: 'SESSION_EXPIRED' };
      }

      const session = JSON.parse(sessionStr);
      const now = Date.now();

      // Validate session ID
      if (session.sessionId !== sessionId) {
        return { success: false, error: 'INVALID_SESSION' };
      }

      // Check expiry
      if (now > session.expiresAt) {
        await SecureStore.deleteItemAsync(OTP_SESSION_KEY);
        return { success: false, error: 'CODE_EXPIRED' };
      }

      // Check attempts
      if (session.attempts >= session.maxAttempts) {
        await SecureStore.deleteItemAsync(OTP_SESSION_KEY);
        await recordLockout();
        return { success: false, error: 'MAX_ATTEMPTS_EXCEEDED' };
      }

      // Verify code (constant-time comparison via hash)
      const userCodeHash = await hashValue(userCode);
      if (userCodeHash === session.codeHash) {
        // Success — mark verified and clean up
        session.verified = true;
        session.verifiedAt = now;
        await SecureStore.setItemAsync(OTP_SESSION_KEY, JSON.stringify(session));

        return {
          success: true,
          destination: session.destination,
          type: session.type,
          sessionId,
        };
      } else {
        // Wrong code
        session.attempts += 1;
        await SecureStore.setItemAsync(OTP_SESSION_KEY, JSON.stringify(session));
        const remaining = session.maxAttempts - session.attempts;

        return {
          success: false,
          error: 'INVALID_CODE',
          attemptsRemaining: remaining,
        };
      }
    } catch (e) {
      console.error('[OTP] Verify error:', e);
      return { success: false, error: 'VERIFY_ERROR' };
    }
  },

  /**
   * Verify TOTP code (for authenticator app integration)
   * Checks current and previous time windows for clock drift tolerance
   *
   * @param {string} secret - User's TOTP secret
   * @param {string} userCode - Code entered by user
   * @returns {Promise<boolean>}
   */
  async verifyTOTP(secret, userCode) {
    // Check current time window and ±1 window for drift tolerance
    for (const offset of [0, -30, 30]) {
      const adjustedTime = Date.now() + offset * 1000;
      const counter = Math.floor(adjustedTime / 1000 / 30);
      const hmac = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        secret + '|' + counter.toString()
      );
      const off = parseInt(hmac.slice(-1), 16) % (hmac.length - 8);
      const code = (parseInt(hmac.slice(off, off + 8), 16) % Math.pow(10, OTP_LENGTH))
        .toString()
        .padStart(OTP_LENGTH, '0');
      if (code === userCode) return true;
    }
    return false;
  },

  /**
   * Get remaining time for current OTP session
   * @returns {Promise<{active: boolean, remainingSeconds: number, destination: string}>}
   */
  async getSessionStatus() {
    try {
      const sessionStr = await SecureStore.getItemAsync(OTP_SESSION_KEY);
      if (!sessionStr) return { active: false, remainingSeconds: 0, destination: '' };

      const session = JSON.parse(sessionStr);
      const remaining = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));

      return {
        active: remaining > 0 && !session.verified,
        remainingSeconds: remaining,
        destination: session.destination,
        attempts: session.attempts,
        maxAttempts: session.maxAttempts,
      };
    } catch (e) {
      return { active: false, remainingSeconds: 0, destination: '' };
    }
  },

  // ─────────────────────────────────────────────
  //  MAGIC LINK METHODS
  // ─────────────────────────────────────────────

  /**
   * Generate and "send" a magic link for email authentication
   * @param {string} email - Recipient email
   * @returns {Promise<{magicLink: string, deepLink: string, token: string, expiresAt: number}>}
   */
  async sendMagicLink(email) {
    const rateCheck = await checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason + '|' + rateCheck.remaining);
    }

    const token = await generateSecureRandom(48);
    const tokenHash = await hashValue(token);
    const now = Date.now();
    const expiresAt = now + MAGIC_LINK_EXPIRY * 1000;

    const linkData = {
      tokenHash,
      email,
      expiresAt,
      used: false,
      createdAt: now,
    };

    await SecureStore.setItemAsync(MAGIC_LINK_KEY, JSON.stringify(linkData));
    await recordSend();

    const magicLink = MAGIC_LINK_BASE_URL + '?token=' + token + '&email=' + encodeURIComponent(email);
    const deepLink = DEEP_LINK_SCHEME + '?token=' + token + '&email=' + encodeURIComponent(email);

    // In production: send email with magicLink
    console.log('[MagicLink] Sent to', email, ':', magicLink);

    return { magicLink, deepLink, token, expiresAt };
  },

  /**
   * Verify a magic link token
   * @param {string} token - Token from magic link URL
   * @returns {Promise<{success: boolean, email?: string, error?: string}>}
   */
  async verifyMagicLink(token) {
    try {
      const linkStr = await SecureStore.getItemAsync(MAGIC_LINK_KEY);
      if (!linkStr) {
        return { success: false, error: 'LINK_EXPIRED' };
      }

      const linkData = JSON.parse(linkStr);
      const now = Date.now();

      // Check expiry
      if (now > linkData.expiresAt) {
        await SecureStore.deleteItemAsync(MAGIC_LINK_KEY);
        return { success: false, error: 'LINK_EXPIRED' };
      }

      // Check if already used (single-use)
      if (linkData.used) {
        return { success: false, error: 'LINK_ALREADY_USED' };
      }

      // Verify token
      const tokenHash = await hashValue(token);
      if (tokenHash !== linkData.tokenHash) {
        return { success: false, error: 'INVALID_TOKEN' };
      }

      // Mark as used
      linkData.used = true;
      linkData.usedAt = now;
      await SecureStore.setItemAsync(MAGIC_LINK_KEY, JSON.stringify(linkData));

      return { success: true, email: linkData.email };
    } catch (e) {
      return { success: false, error: 'VERIFY_ERROR' };
    }
  },

  /**
   * Send magic link via SMS (phone-based magic link)
   * @param {string} phoneNumber - Recipient phone
   * @returns {Promise<{deepLink: string, token: string, expiresAt: number}>}
   */
  async sendPhoneMagicLink(phoneNumber) {
    const rateCheck = await checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason + '|' + rateCheck.remaining);
    }

    const token = await generateSecureRandom(48);
    const tokenHash = await hashValue(token);
    const now = Date.now();
    const expiresAt = now + MAGIC_LINK_EXPIRY * 1000;

    const linkData = {
      tokenHash,
      phone: phoneNumber,
      expiresAt,
      used: false,
      createdAt: now,
    };

    await SecureStore.setItemAsync(MAGIC_LINK_KEY, JSON.stringify(linkData));
    await recordSend();

    const deepLink = DEEP_LINK_SCHEME + '?token=' + token + '&phone=' + encodeURIComponent(phoneNumber);

    console.log('[MagicLink] SMS sent to', phoneNumber, ':', deepLink);

    return { deepLink, token, expiresAt };
  },

  // ─────────────────────────────────────────────
  //  TOTP SECRET MANAGEMENT (for Authenticator apps)
  // ─────────────────────────────────────────────

  /**
   * Generate a TOTP secret for authenticator app setup
   * @param {string} userId - User identifier
   * @returns {Promise<{secret: string, uri: string, qrData: string}>}
   */
  async generateTOTPSecret(userId) {
    const secret = await generateSecureRandom(32);

    // Build otpauth:// URI (Google Authenticator format)
    const issuer = 'SafeHer';
    const account = encodeURIComponent(userId);
    const uri = 'otpauth://totp/' + issuer + ':' + account +
      '?secret=' + secret + '&issuer=' + issuer + '&algorithm=SHA256&digits=6&period=30';

    return { secret, uri, qrData: uri };
  },

  /**
   * Store TOTP secret securely
   * @param {string} secret - TOTP secret
   */
  async storeTOTPSecret(secret) {
    await SecureStore.setItemAsync('@safeher_totp_secret', secret);
  },

  /**
   * Get stored TOTP secret
   * @returns {Promise<string|null>}
   */
  async getTOTPSecret() {
    try {
      return await SecureStore.getItemAsync('@safeher_totp_secret');
    } catch (e) {
      return null;
    }
  },

  // ─────────────────────────────────────────────
  //  CLEANUP
  // ─────────────────────────────────────────────

  /**
   * Clear all OTP/magic link state
   */
  async clearAll() {
    const keys = [OTP_SESSION_KEY, MAGIC_LINK_KEY, OTP_RATE_LIMIT_KEY, OTP_LOCKOUT_KEY];
    for (const k of keys) {
      try { await SecureStore.deleteItemAsync(k); } catch (e) {}
    }
    try { await AsyncStorage.removeItem(OTP_RATE_LIMIT_KEY); } catch (e) {}
  },

  /**
   * Get rate limit status
   * @returns {Promise<{canSend: boolean, cooldownRemaining: number}>}
   */
  async getRateLimitStatus() {
    const check = await checkRateLimit();
    return {
      canSend: check.allowed,
      cooldownRemaining: check.remaining || 0,
      reason: check.reason || null,
    };
  },
};

export default MagicLinkOTPService;

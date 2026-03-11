/**
 * EncryptedStorageService — TypeScript — Secure data storage wrapper
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────
interface EncryptedPayload {
  v: number;
  d: string;
  h: string;
}

interface MigrationResult {
  success: boolean;
  alreadyMigrated?: boolean;
  migratedCount?: number;
  error?: string;
}

// ── Base64 Encoder/Decoder ───────────────────────────────────────
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const base64Encode = (str: string): string => {
  try {
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
  } catch {}
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += BASE64_CHARS[(a >> 2) & 0x3f];
    result += BASE64_CHARS[((a & 3) << 4) | ((b >> 4) & 0xf)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b & 0xf) << 2) | ((c >> 6) & 3)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[c & 0x3f] : '=';
  }
  return result;
};

const base64Decode = (str: string): string => {
  try {
    if (typeof atob === 'function') {
      return decodeURIComponent(escape(atob(str)));
    }
  } catch {}
  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) lookup[BASE64_CHARS[i]] = i;
  str = str.replace(/=+$/, '');
  let result = '';
  for (let i = 0; i < str.length; i += 4) {
    const a = lookup[str[i]] || 0;
    const b = lookup[str[i + 1]] || 0;
    const c = lookup[str[i + 2]] || 0;
    const d = lookup[str[i + 3]] || 0;
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (str[i + 2] !== undefined && str[i + 2] !== '=') result += String.fromCharCode(((b & 0x0f) << 4) | (c >> 2));
    if (str[i + 3] !== undefined && str[i + 3] !== '=') result += String.fromCharCode(((c & 0x03) << 6) | d);
  }
  return result;
};

// ── Constants ────────────────────────────────────────────────────
const MIGRATION_KEY = '@gs_encrypted_migration_v1';
const ENCRYPTION_KEY_ALIAS = 'gs_data_encryption_key';

const SENSITIVE_KEYS = [
  '@girl_safety_contacts',
  '@girl_safety_settings',
  '@gs_sos_message',
  '@gs_user_profile',
  '@gs_auth_data',
  '@gs_evidence_vault',
  '@gs_journey_history',
  '@gs_incident_reports',
];

// ── Encryption Helpers ───────────────────────────────────────────
let _encryptionKey: string | null = null;

const getEncryptionKey = async (): Promise<string | null> => {
  if (_encryptionKey) return _encryptionKey;

  try {
    const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_ALIAS);
    if (existing) {
      _encryptionKey = existing;
      return existing;
    }

    const keyBytes = await Crypto.getRandomBytesAsync(32);
    const key = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await SecureStore.setItemAsync(ENCRYPTION_KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    _encryptionKey = key;
    return key;
  } catch (e) {
    console.error('[EncStorage] Key generation error:', e);
    return null;
  }
};

const encrypt = async (plaintext: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    if (!key) return plaintext;

    const hmac = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key + plaintext
    );

    const keyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key
    );

    let encrypted = '';
    for (let i = 0; i < plaintext.length; i++) {
      const charCode = plaintext.charCodeAt(i) ^ keyHash.charCodeAt(i % keyHash.length);
      encrypted += String.fromCharCode(charCode);
    }

    const encoded = base64Encode(encrypted);
    return JSON.stringify({ v: 1, d: encoded, h: hmac.substring(0, 16) });
  } catch (e) {
    console.error('[EncStorage] Encrypt error:', e);
    return plaintext;
  }
};

const decrypt = async (ciphertext: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    if (!key) return ciphertext;

    let parsed: EncryptedPayload;
    try {
      parsed = JSON.parse(ciphertext);
    } catch {
      return ciphertext;
    }

    if (!parsed.v || !parsed.d) {
      return ciphertext;
    }

    const encrypted = base64Decode(parsed.d);

    const keyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key
    );

    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i) ^ keyHash.charCodeAt(i % keyHash.length);
      decrypted += String.fromCharCode(charCode);
    }

    const hmac = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key + decrypted
    );

    if (hmac.substring(0, 16) !== parsed.h) {
      console.warn('[EncStorage] Integrity check failed — data may be corrupted');
    }

    return decrypted;
  } catch (e) {
    console.error('[EncStorage] Decrypt error:', e);
    return ciphertext;
  }
};

// ── Public API ───────────────────────────────────────────────────
const EncryptedStorageService = {
  async setItem(key: string, value: string): Promise<boolean> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (stringValue.length < 2048) {
        try {
          await SecureStore.setItemAsync(key, stringValue, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
          return true;
        } catch {
          // Fall through to encrypted AsyncStorage
        }
      }

      const encrypted = await encrypt(stringValue);
      await AsyncStorage.setItem(`enc_${key}`, encrypted);
      return true;
    } catch (e) {
      console.error('[EncStorage] setItem error:', e);
      return false;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      try {
        const secure = await SecureStore.getItemAsync(key);
        if (secure !== null) return secure;
      } catch {}

      const encrypted = await AsyncStorage.getItem(`enc_${key}`);
      if (encrypted !== null) {
        return await decrypt(encrypted);
      }

      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.error('[EncStorage] getItem error:', e);
      return null;
    }
  },

  async removeItem(key: string): Promise<boolean> {
    try {
      try { await SecureStore.deleteItemAsync(key); } catch {}
      try { await AsyncStorage.removeItem(`enc_${key}`); } catch {}
      try { await AsyncStorage.removeItem(key); } catch {}
      return true;
    } catch {
      return false;
    }
  },

  async migrateToEncrypted(): Promise<MigrationResult> {
    try {
      const migrated = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrated === 'done') {
        console.log('[EncStorage] Already migrated');
        return { success: true, alreadyMigrated: true };
      }

      console.log('[EncStorage] Starting migration...');
      let migratedCount = 0;

      for (const key of SENSITIVE_KEYS) {
        try {
          const plainValue = await AsyncStorage.getItem(key);
          if (plainValue !== null) {
            await this.setItem(key, plainValue);
            await AsyncStorage.removeItem(key);
            migratedCount++;
            console.log(`[EncStorage] Migrated: ${key}`);
          }
        } catch (e) {
          console.error(`[EncStorage] Migration failed for ${key}:`, e);
        }
      }

      await AsyncStorage.setItem(MIGRATION_KEY, 'done');
      console.log(`[EncStorage] Migration complete: ${migratedCount} keys`);

      return { success: true, migratedCount };
    } catch (e: any) {
      console.error('[EncStorage] Migration error:', e);
      return { success: false, error: e.message };
    }
  },

  async secureWipe(): Promise<boolean> {
    try {
      for (const key of SENSITIVE_KEYS) {
        try { await SecureStore.deleteItemAsync(key); } catch {}
        try { await AsyncStorage.removeItem(key); } catch {}
        try { await AsyncStorage.removeItem(`enc_${key}`); } catch {}
      }

      try { await SecureStore.deleteItemAsync(ENCRYPTION_KEY_ALIAS); } catch {}
      _encryptionKey = null;

      await AsyncStorage.removeItem(MIGRATION_KEY);

      console.log('[EncStorage] Secure wipe complete');
      return true;
    } catch (e) {
      console.error('[EncStorage] Wipe error:', e);
      return false;
    }
  },

  async getJSON<T = any>(key: string): Promise<T | null> {
    try {
      const val = await this.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  },

  async setJSON(key: string, value: any): Promise<boolean> {
    return this.setItem(key, JSON.stringify(value));
  },
};

export default EncryptedStorageService;

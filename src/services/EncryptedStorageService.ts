/**
 * SecureStorageService — TypeScript — Hardware-backed secure storage
 *
 * v7.0 — Replaced homemade XOR encryption with platform key stores:
 *   • Android: Android Keystore (KeyChain via expo-secure-store)
 *   • iOS:     Keychain Services (kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
 *
 * SecureStore caps each value at ~2 KB. For larger payloads we chunk
 * across multiple keys, keep an index, and verify with a stored SHA-256.
 *
 * Public API kept the same (setItem/getItem/removeItem/getJSON/setJSON/
 * migrateToEncrypted/secureWipe) so existing callers don't change.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Logger from '../utils/logger';

interface MigrationResult {
  success: boolean;
  alreadyMigrated?: boolean;
  migratedCount?: number;
  error?: string;
}

const SECURE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

const CHUNK_SIZE = 1800; // safely under SecureStore's ~2KB limit
const CHUNK_INDEX_PREFIX = '@safe_chunked_';
const HASH_SUFFIX = '__h';
const MIGRATION_KEY = '@safe_secure_migration_v2';

const SENSITIVE_KEYS = [
  '@girl_safety_contacts',
  '@girl_safety_settings',
  '@girl_safety_sos_message',
  '@gs_user_profile',
  '@gs_auth_pin',
  '@gs_duress_pin',
  '@gs_evidence_vault',
  '@gs_journey_history',
  '@gs_incident_reports',
];

// SecureStore keys must be alphanumeric + . - _; sanitize app keys
const safeKey = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, '_');

const sha256 = async (s: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

const writeChunked = async (key: string, value: string): Promise<void> => {
  const sk = safeKey(key);
  const hash = await sha256(value);
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  // Write chunks
  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${sk}__${i}`, chunks[i], SECURE_OPTS);
  }
  // Index + integrity
  await SecureStore.setItemAsync(`${sk}${HASH_SUFFIX}`, hash, SECURE_OPTS);
  await AsyncStorage.setItem(`${CHUNK_INDEX_PREFIX}${sk}`, String(chunks.length));
};

const readChunked = async (key: string): Promise<string | null> => {
  const sk = safeKey(key);
  const countRaw = await AsyncStorage.getItem(`${CHUNK_INDEX_PREFIX}${sk}`);
  if (!countRaw) return null;
  const count = parseInt(countRaw, 10);
  if (!Number.isFinite(count) || count < 1) return null;

  let result = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${sk}__${i}`);
    if (part === null) return null;
    result += part;
  }
  const expected = await SecureStore.getItemAsync(`${sk}${HASH_SUFFIX}`);
  if (expected) {
    const got = await sha256(result);
    if (got !== expected) {
      Logger.warn('[SecureStorage] Integrity check failed for', key);
      return null;
    }
  }
  return result;
};

const removeChunked = async (key: string): Promise<void> => {
  const sk = safeKey(key);
  const countRaw = await AsyncStorage.getItem(`${CHUNK_INDEX_PREFIX}${sk}`);
  if (countRaw) {
    const count = parseInt(countRaw, 10) || 0;
    for (let i = 0; i < count; i++) {
      try { await SecureStore.deleteItemAsync(`${sk}__${i}`); } catch {}
    }
  }
  try { await SecureStore.deleteItemAsync(`${sk}${HASH_SUFFIX}`); } catch {}
  try { await AsyncStorage.removeItem(`${CHUNK_INDEX_PREFIX}${sk}`); } catch {}
};

const SecureStorageService = {
  async setItem(key: string, value: string): Promise<boolean> {
    if (typeof value !== 'string') value = JSON.stringify(value);
    const sk = safeKey(key);

    try {
      if (value.length <= CHUNK_SIZE) {
        // Clear any previous chunked version first
        await removeChunked(key);
        await SecureStore.setItemAsync(sk, value, SECURE_OPTS);
        return true;
      }
      // Large payload: clear single-value form first, then chunk
      try { await SecureStore.deleteItemAsync(sk); } catch {}
      await writeChunked(key, value);
      return true;
    } catch (e) {
      Logger.error('[SecureStorage] setItem failed', e);
      // Fail closed for sensitive paths — do NOT silently fall back to plaintext.
      return false;
    }
  },

  async getItem(key: string): Promise<string | null> {
    const sk = safeKey(key);
    try {
      const direct = await SecureStore.getItemAsync(sk);
      if (direct !== null) return direct;
      return await readChunked(key);
    } catch (e) {
      Logger.error('[SecureStorage] getItem failed', e);
      return null;
    }
  },

  async removeItem(key: string): Promise<boolean> {
    const sk = safeKey(key);
    try { await SecureStore.deleteItemAsync(sk); } catch {}
    await removeChunked(key);
    // Also clear any legacy AsyncStorage residue
    try { await AsyncStorage.removeItem(key); } catch {}
    try { await AsyncStorage.removeItem(`enc_${key}`); } catch {}
    return true;
  },

  async migrateToEncrypted(): Promise<MigrationResult> {
    try {
      const done = await AsyncStorage.getItem(MIGRATION_KEY);
      if (done === 'done') return { success: true, alreadyMigrated: true };

      let migratedCount = 0;
      for (const key of SENSITIVE_KEYS) {
        try {
          // Pull from legacy plaintext or legacy "enc_" XOR location
          const plain = await AsyncStorage.getItem(key);
          const legacy = await AsyncStorage.getItem(`enc_${key}`);
          const value = plain ?? legacy;
          if (value !== null) {
            await this.setItem(key, value);
            await AsyncStorage.removeItem(key);
            await AsyncStorage.removeItem(`enc_${key}`);
            migratedCount++;
          }
        } catch (e) {
          Logger.warn('[SecureStorage] Migration skipped key', key, e);
        }
      }
      await AsyncStorage.setItem(MIGRATION_KEY, 'done');
      return { success: true, migratedCount };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  },

  async secureWipe(): Promise<boolean> {
    let ok = true;
    for (const key of SENSITIVE_KEYS) {
      try { await this.removeItem(key); } catch { ok = false; }
    }
    try { await AsyncStorage.removeItem(MIGRATION_KEY); } catch {}
    return ok;
  },

  async getJSON<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async setJSON(key: string, value: unknown): Promise<boolean> {
    return this.setItem(key, JSON.stringify(value));
  },
};

export default SecureStorageService;

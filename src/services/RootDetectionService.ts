/**
 * RootDetectionService — TypeScript — Root/Jailbreak Detection
 */
import { Platform, Alert, NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';

// ── Types ────────────────────────────────────────────────────────
interface DetectionResult {
  isRooted: boolean;
  indicators: string[];
}

// ── Constants ────────────────────────────────────────────────────
const ANDROID_ROOT_PATHS = [
  '/system/app/Superuser.apk',
  '/system/xbin/su',
  '/system/bin/su',
  '/sbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/data/local/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/su/bin/su',
];

class RootDetectionService {
  private static _warned = false;

  static async checkDevice(): Promise<DetectionResult> {
    const indicators: string[] = [];

    if (Platform.OS === 'android') {
      for (const path of ANDROID_ROOT_PATHS) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists) {
            indicators.push(`Root binary found: ${path}`);
          }
        } catch {}
      }

      try {
        const { PlatformConstants } = NativeModules;
        if (PlatformConstants?.Release?.endsWith?.('test-keys')) {
          indicators.push('Test-keys build detected');
        }
      } catch {}

      const rootDataPaths = ['/data/data/com.topjohnwu.magisk', '/data/data/eu.chainfire.supersu'];
      for (const path of rootDataPaths) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists) {
            indicators.push(`Root app data: ${path}`);
          }
        } catch {}
      }
    }

    return { isRooted: indicators.length > 0, indicators };
  }

  static async warnIfRooted(): Promise<boolean> {
    if (RootDetectionService._warned) return false;

    try {
      const result = await RootDetectionService.checkDevice();
      if (result.isRooted) {
        RootDetectionService._warned = true;
        Alert.alert(
          '⚠️ Security Warning',
          'This device appears to be rooted/modified. Your safety data may be vulnerable to other apps.\n\nFor maximum security, use SafeHer on an unmodified device.',
          [{ text: 'I Understand', style: 'cancel' }],
          { cancelable: true }
        );
        return true;
      }
    } catch (e) {
      if (__DEV__) console.log('[RootDetection] Check error:', e);
    }
    return false;
  }
}

export default RootDetectionService;

/**
 * Root/Jailbreak Detection Service (Vuln #18)
 * Checks for common indicators of rooted/jailbroken devices
 * and warns the user that data may not be secure.
 */
import { Platform, Alert, NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Common root indicators on Android
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

const ANDROID_ROOT_PACKAGES = [
  'com.topjohnwu.magisk',
  'eu.chainfire.supersu',
  'com.koushikdutta.superuser',
  'com.noshufou.android.su',
  'com.thirdparty.superuser',
];

class RootDetectionService {
  static _warned = false;

  /**
   * Check if the device appears to be rooted/jailbroken
   * Returns { isRooted: boolean, indicators: string[] }
   */
  static async checkDevice() {
    const indicators = [];

    if (Platform.OS === 'android') {
      // Check for su binary paths
      for (const path of ANDROID_ROOT_PATHS) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists) {
            indicators.push(`Root binary found: ${path}`);
          }
        } catch (e) {
          // Permission denied can also indicate root files exist
        }
      }

      // Check for test-keys build
      try {
        const { PlatformConstants } = NativeModules;
        if (PlatformConstants?.Release?.endsWith?.('test-keys')) {
          indicators.push('Test-keys build detected');
        }
      } catch (e) { /* ignore */ }

      // Check for common root data directories
      const rootDataPaths = ['/data/data/com.topjohnwu.magisk', '/data/data/eu.chainfire.supersu'];
      for (const path of rootDataPaths) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists) {
            indicators.push(`Root app data: ${path}`);
          }
        } catch (e) { /* ignore */ }
      }
    }

    return {
      isRooted: indicators.length > 0,
      indicators,
    };
  }

  /**
   * Run check and show warning alert if device is rooted (once per session)
   */
  static async warnIfRooted() {
    if (RootDetectionService._warned) return;

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
      // Silent fail — don't block app usage
      if (__DEV__) console.log('[RootDetection] Check error:', e);
    }
    return false;
  }
}

export default RootDetectionService;

/**
 * OnboardingScreen — First-time user walkthrough
 * 3-screen onboarding that explains features, prompts for contacts,
 * and requests all permissions upfront.
 * 
 * v1.0 — SafeHer App
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  ScrollView, Platform, StatusBar, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES, SHADOWS, useTheme } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ONBOARDING_KEY = '@gs_onboarding_complete';

const PAGES = [
  {
    icon: 'shield-checkmark',
    iconColor: '#E91E63',
    title: 'Welcome to SafeHer',
    subtitle: 'Your Personal Safety Shield',
    description:
      'SafeHer uses cutting-edge technology to keep you safe — SOS alerts, ' +
      'live location sharing, evidence recording, fake calls, and AI-powered ' +
      'threat detection. Everything works even offline.',
    features: [
      { icon: 'alert-circle', text: 'Instant SOS with shake, voice, or tap' },
      { icon: 'location', text: 'Live location sharing with contacts' },
      { icon: 'videocam', text: 'Hidden camera & evidence vault' },
      { icon: 'navigate', text: 'Journey tracker with auto-alerts' },
    ],
  },
  {
    icon: 'people',
    iconColor: '#7C4DFF',
    title: 'Add Emergency Contacts',
    subtitle: 'Your Trusted Circle',
    description:
      'Add family, friends, or trusted people as emergency contacts. ' +
      'When you trigger SOS, they instantly receive your location via SMS, ' +
      'push notifications, and WhatsApp.',
    features: [
      { icon: 'chatbubbles', text: 'Multi-channel SOS alerts (SMS + Push + WhatsApp)' },
      { icon: 'globe', text: 'Country-specific emergency helplines' },
      { icon: 'eye', text: 'Contacts can track you live in a browser' },
      { icon: 'time', text: 'Auto check-in timers for safety' },
    ],
    action: 'contacts',
  },
  {
    icon: 'key',
    iconColor: '#00C853',
    title: 'Grant Permissions',
    subtitle: 'Essential for Your Safety',
    description:
      'SafeHer needs a few permissions to protect you effectively. ' +
      'All data stays on your device and is encrypted. We never share your ' +
      'information with third parties.',
    permissions: [
      { icon: 'location', label: 'Location', desc: 'For SOS & live tracking' },
      { icon: 'notifications', label: 'Notifications', desc: 'For SOS alerts & reminders' },
      { icon: 'mic', label: 'Microphone', desc: 'For scream detection & evidence' },
      { icon: 'finger-print', label: 'Biometrics', desc: 'For app lock security' },
    ],
    action: 'permissions',
  },
];

export default function OnboardingScreen({ onComplete }) {
  const { colors, isDark } = useTheme();
  const [currentPage, setCurrentPage] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState({});
  const scrollRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goToPage = (index) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setCurrentPage(index);
      scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      goToPage(currentPage + 1);
    } else {
      finishOnboarding();
    }
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  const finishOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    if (onComplete) onComplete();
  };

  const requestAllPermissions = async () => {
    const results = {};

    // Location
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      results.location = fgStatus === 'granted';
      if (results.location) {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        results.backgroundLocation = bgStatus === 'granted';
      }
    } catch {
      results.location = false;
    }

    // Notifications
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      results.notifications = status === 'granted';
    } catch {
      results.notifications = false;
    }

    // Microphone
    try {
      const { status } = await Audio.requestPermissionsAsync();
      results.microphone = status === 'granted';
    } catch {
      results.microphone = false;
    }

    // Biometrics (just check availability)
    try {
      const available = await LocalAuthentication.hasHardwareAsync();
      results.biometrics = available;
    } catch {
      results.biometrics = false;
    }

    setPermissionStatus(results);

    const granted = Object.values(results).filter(Boolean).length;
    const total = Object.values(results).length;

    if (granted === total) {
      Alert.alert('All Set! ✅', 'All permissions granted. You\'re ready to use SafeHer!');
    } else {
      Alert.alert(
        'Permissions',
        `${granted}/${total} permissions granted. You can change these later in Settings.`
      );
    }
  };

  const page = PAGES[currentPage];

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : COLORS.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Skip Button */}
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={handleSkip}
        accessibilityLabel="Skip onboarding"
        accessibilityRole="button"
      >
        <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <Animated.View key={i} style={[styles.page, { width: SCREEN_W, opacity: fadeAnim }]}>
            <ScrollView
              contentContainerStyle={styles.pageContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Icon */}
              <View style={[styles.iconCircle, { backgroundColor: p.iconColor + '15' }]}>
                <Ionicons name={p.icon} size={56} color={p.iconColor} />
              </View>

              {/* Title */}
              <Text style={[styles.title, { color: colors.text }]}>{p.title}</Text>
              <Text style={[styles.subtitle, { color: p.iconColor }]}>{p.subtitle}</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                {p.description}
              </Text>

              {/* Features list */}
              {p.features && (
                <View style={styles.featureList}>
                  {p.features.map((f, fi) => (
                    <View key={fi} style={[styles.featureRow, { backgroundColor: colors.card }]}>
                      <View style={[styles.featureIcon, { backgroundColor: p.iconColor + '12' }]}>
                        <Ionicons name={f.icon} size={20} color={p.iconColor} />
                      </View>
                      <Text style={[styles.featureText, { color: colors.text }]}>{f.text}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Permissions list with status */}
              {p.permissions && (
                <View style={styles.permissionList}>
                  {p.permissions.map((perm, pi) => (
                    <View key={pi} style={[styles.permRow, { backgroundColor: colors.card }]}>
                      <View style={[styles.permIcon, { backgroundColor: '#00C85312' }]}>
                        <Ionicons name={perm.icon} size={22} color="#00C853" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.permLabel, { color: colors.text }]}>{perm.label}</Text>
                        <Text style={[styles.permDesc, { color: colors.textSecondary }]}>{perm.desc}</Text>
                      </View>
                      {permissionStatus[perm.label.toLowerCase()] !== undefined && (
                        <Ionicons
                          name={permissionStatus[perm.label.toLowerCase()] ? 'checkmark-circle' : 'close-circle'}
                          size={24}
                          color={permissionStatus[perm.label.toLowerCase()] ? '#00C853' : '#FF1744'}
                        />
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.grantBtn}
                    onPress={requestAllPermissions}
                    accessibilityLabel="Grant all permissions"
                    accessibilityRole="button"
                  >
                    <Ionicons name="shield-checkmark" size={20} color="#fff" />
                    <Text style={styles.grantBtnText}>Grant All Permissions</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface }]}>
        {/* Page Dots */}
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentPage && styles.dotActive,
                i === currentPage && { backgroundColor: page.iconColor },
              ]}
            />
          ))}
        </View>

        {/* Navigation Buttons */}
        <View style={styles.navBtns}>
          {currentPage > 0 && (
            <TouchableOpacity
              style={[styles.backBtn, { borderColor: colors.border }]}
              onPress={() => goToPage(currentPage - 1)}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: page.iconColor }]}
            onPress={handleNext}
            accessibilityLabel={currentPage === PAGES.length - 1 ? 'Get started' : 'Next page'}
            accessibilityRole="button"
          >
            <Text style={styles.nextBtnText}>
              {currentPage === PAGES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons
              name={currentPage === PAGES.length - 1 ? 'checkmark' : 'arrow-forward'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * Check if onboarding has been completed.
 */
export const isOnboardingComplete = async () => {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === 'true';
  } catch {
    return false;
  }
};

/**
 * Reset onboarding (for testing).
 */
export const resetOnboarding = async () => {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch {}
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  skipBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 40,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
    paddingHorizontal: 28,
    paddingBottom: 180,
    alignItems: 'center',
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 10,
  },
  featureList: {
    width: '100%',
    marginTop: 28,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    ...SHADOWS.small,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 12,
  },
  permissionList: {
    width: '100%',
    marginTop: 28,
    gap: 10,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    ...SHADOWS.small,
  },
  permIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  permDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00C853',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 6,
    ...SHADOWS.medium,
  },
  grantBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 16,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    ...SHADOWS.large,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
  },
  dotActive: {
    width: 28,
    borderRadius: 5,
  },
  navBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...SHADOWS.medium,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

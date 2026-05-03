/**
 * OnboardingScreen v7.0 — First-run walkthrough (Dark Luxury)
 */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, ScrollView, TouchableOpacity, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrimaryBtn, GhostBtn, FloatingOrb, T } from '../components/ui';

const { width, height } = Dimensions.get('window');
const ONBOARD_KEY = '@gs_onboarded';

export const isOnboardingComplete = async () => {
  try {
    const v = await AsyncStorage.getItem(ONBOARD_KEY);
    return v === 'true';
  } catch { return false; }
};

const SLIDES = [
  {
    icon: 'shield-checkmark',
    color: T.primary,
    title: 'Welcome to SafeHer',
    body: 'Your personal safety guardian. Designed with one purpose: keeping you safe in any situation.',
  },
  {
    icon: 'alert-circle',
    color: T.danger,
    title: 'One-tap SOS',
    body: 'Tap the SOS button — or shake your phone, or press volume 5×. Your trusted contacts are notified instantly.',
  },
  {
    icon: 'navigate',
    color: T.info,
    title: 'Live Location',
    body: 'Share your live location with family during journeys. Get auto-alerts if you\'re overdue at your destination.',
  },
  {
    icon: 'lock-closed',
    color: T.success,
    title: 'Privacy First',
    body: 'Your data stays on your device. PIN + biometric protected. Hardware-backed encryption for sensitive info.',
  },
];

export default function OnboardingScreen({ onComplete }) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);

  const scrollX = useRef(new Animated.Value(0)).current;

  const next = async () => {
    if (page < SLIDES.length - 1) {
      const nextPage = page + 1;
      setPage(nextPage);
      scrollRef.current?.scrollTo({ x: width * nextPage, animated: true });
      Haptics.selectionAsync();
    } else {
      await AsyncStorage.setItem(ONBOARD_KEY, 'true');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete?.();
    }
  };

  const skip = async () => {
    await AsyncStorage.setItem(ONBOARD_KEY, 'true');
    onComplete?.();
  };

  return (
    <View style={styles.root}>
      <FloatingOrb size={260} color={T.primary} startX={-60}  startY={-80}  duration={7000} />
      <FloatingOrb size={180} color={T.info}    startX={width - 100} startY={height * 0.3} duration={9000} />
      <FloatingOrb size={120} color={T.accent}  startX={width * 0.4} startY={height * 0.7} duration={6000} />

      <TouchableOpacity style={styles.skipBtn} onPress={skip} accessibilityLabel="Skip">
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width)) },
        )}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => <Slide key={i} slide={slide} />)}
      </ScrollView>

      {/* Pagination */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' });
          const opacity  = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { width: dotWidth, opacity, backgroundColor: T.primary }]}
            />
          );
        })}
      </View>

      <View style={styles.bottomActions}>
        <PrimaryBtn icon={page === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'} onPress={next}>
          {page === SLIDES.length - 1 ? 'Get Started' : 'Next'}
        </PrimaryBtn>
      </View>
    </View>
  );
}

function Slide({ slide }) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,   { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.slide, { width, opacity: fade, transform: [{ translateY: slideY }] }]}>
      <View style={[styles.iconCircle, { backgroundColor: `${slide.color}22` }]}>
        <Ionicons name={slide.icon} size={68} color={slide.color} />
      </View>
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.body}>{slide.body}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, justifyContent: 'space-between' },

  skipBtn: { position: 'absolute', top: 60, right: 24, zIndex: 10, padding: 8 },
  skipText: { color: T.textSub, fontSize: 14, fontWeight: '700' },

  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 150, height: 150, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 40,
  },
  title: { color: T.white, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  body:  { color: T.textSub, fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 23, paddingHorizontal: 16 },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 28 },
  dot:  { height: 8, borderRadius: 4 },

  bottomActions: { paddingHorizontal: 32, paddingBottom: 50 },
});

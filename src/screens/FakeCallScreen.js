/**
 * Fake Call Screen — Ultra-realistic phone call simulation
 * Designed to be indistinguishable from a native incoming/active call
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Vibration,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
  PanResponder,
  Easing,
  Image,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useTheme } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Preset callers with realistic Indian numbers ──
const PRESET_CALLERS = [
  { id: '1', name: 'Mom', emoji: '❤️', number: '+91 98765 43210', label: 'Mobile' },
  { id: '2', name: 'Dad', emoji: '👨', number: '+91 87654 32109', label: 'Mobile' },
  { id: '3', name: 'Sister', emoji: '👧', number: '+91 76543 21098', label: 'Mobile' },
  { id: '4', name: 'Best Friend', emoji: '💜', number: '+91 65432 10987', label: 'Mobile' },
  { id: '5', name: 'Boss', emoji: '💼', number: '+91 54321 09876', label: 'Work' },
  { id: '6', name: 'Brother', emoji: '👦', number: '+91 99887 76655', label: 'Mobile' },
];

const DELAY_OPTIONS = [
  { label: 'Now', value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
];

const FakeCallScreen = ({ navigation }) => {
  const { colors: themeColors, isDark } = useTheme();
  // ── State ──
  const [selectedCaller, setSelectedCaller] = useState(PRESET_CALLERS[0]);
  const [selectedDelay, setSelectedDelay] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customCaller, setCustomCaller] = useState({ name: '', number: '', photo: null });

  // Call features
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isHold, setIsHold] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmfDigits, setDtmfDigits] = useState('');
  const [callConnecting, setCallConnecting] = useState(false);

  // Ringtone audio
  const ringtoneRef = useRef(null);
  const ringLoopRef = useRef(null);

  // Animations
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringPulse1 = useRef(new Animated.Value(0)).current;
  const ringPulse2 = useRef(new Animated.Value(0)).current;
  const ringPulse3 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;

  const pulseAnimRef = useRef(null);
  const ringAnimRef = useRef(null);

  // Swipe-to-answer threshold
  const SWIPE_THRESHOLD = SCREEN_W * 0.35;

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      Vibration.cancel();
      stopRingtone();
      if (pulseAnimRef.current) pulseAnimRef.current.stop();
      if (ringAnimRef.current) ringAnimRef.current.stop();
    };
  }, []);

  // ── Ringtone audio playback ──
  const playRingtone = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
      // Generate a realistic ring pattern using 440Hz + 480Hz (standard US ring)
      // Since we can't easily generate tones, we use the built-in vibration pattern
      // and set maximum volume ring simulation
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/telephones/phone_ringing.ogg' },
        { isLooping: true, volume: 1.0, shouldPlay: true }
      );
      ringtoneRef.current = sound;
    } catch (e) {
      console.log('[FakeCall] Ringtone playback fallback (no network):', e.message);
      // Fallback: use vibration-only pattern if audio fails
    }
  };

  const stopRingtone = async () => {
    try {
      if (ringtoneRef.current) {
        await ringtoneRef.current.stopAsync();
        await ringtoneRef.current.unloadAsync();
        ringtoneRef.current = null;
      }
    } catch (e) {
      console.log('[FakeCall] Ringtone stop error:', e.message);
    }
  };

  // ── Custom caller photo picker ──
  const pickCallerPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!result.canceled && result.assets?.[0]) {
        setCustomCaller(prev => ({ ...prev, photo: result.assets[0].uri }));
      }
    } catch (e) {
      console.log('[FakeCall] Photo pick error:', e.message);
    }
  };

  // ── Countdown timer ──
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      triggerIncomingCall();
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ── Call duration timer ──
  useEffect(() => {
    if (!isCallActive) return;
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isCallActive]);

  // ── Ring pulse animation (concentric circles behind avatar) ──
  const startRingAnimation = () => {
    const createPulse = (anim, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const anim = Animated.parallel([
      createPulse(ringPulse1, 0),
      createPulse(ringPulse2, 600),
      createPulse(ringPulse3, 1200),
    ]);
    ringAnimRef.current = anim;
    anim.start();
  };

  const stopRingAnimation = () => {
    if (ringAnimRef.current) ringAnimRef.current.stop();
    ringPulse1.setValue(0);
    ringPulse2.setValue(0);
    ringPulse3.setValue(0);
  };

  // ── Swipe-to-answer PanResponder ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) {
          swipeX.setValue(Math.min(gs.dx, SCREEN_W * 0.55));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: SCREEN_W * 0.55,
            duration: 150,
            useNativeDriver: true,
          }).start(() => answerCall());
        } else {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  // ── Trigger incoming call ──
  const triggerIncomingCall = useCallback(() => {
    setIsIncoming(true);
    setIsCallActive(false);
    setCallDuration(0);
    setShowKeypad(false);
    setDtmfDigits('');
    setIsMuted(false);
    setIsSpeaker(false);
    setIsHold(false);
    swipeX.setValue(0);

    // Realistic vibration pattern
    Vibration.vibrate([0, 800, 600, 800, 600, 800], true);
    startRingAnimation();
    playRingtone(); // Play ringtone audio

    slideAnim.setValue(SCREEN_H);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 40,
      friction: 10,
    }).start();

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseAnimRef.current = pulse;
    pulse.start();
  }, []);

  // ── Schedule call ──
  const handleScheduleCall = () => {
    if (selectedDelay === 0) {
      triggerIncomingCall();
    } else {
      setCountdown(selectedDelay);
      Vibration.vibrate(100);
    }
  };

  // ── Answer call ──
  const answerCall = useCallback(() => {
    Vibration.cancel();
    stopRingAnimation();
    stopRingtone();
    if (pulseAnimRef.current) pulseAnimRef.current.stop();

    setIsIncoming(false);
    setCallConnecting(true);
    setIsCallActive(false);

    // Realistic "connecting" delay
    setTimeout(() => {
      setCallConnecting(false);
      setIsCallActive(true);
      setCallDuration(0);
    }, 1200 + Math.random() * 800);
  }, []);

  // ── Decline / end call ──
  const endCall = useCallback(() => {
    Vibration.cancel();
    stopRingAnimation();
    stopRingtone();
    if (pulseAnimRef.current) pulseAnimRef.current.stop();

    setIsCallActive(false);
    setIsIncoming(false);
    setCallConnecting(false);
    setCallDuration(0);
    setCountdown(null);
    setShowKeypad(false);
    setDtmfDigits('');
    setIsMuted(false);
    setIsSpeaker(false);
    setIsHold(false);
    swipeX.setValue(0);
    slideAnim.setValue(SCREEN_H);
    fadeAnim.setValue(0);
  }, []);

  // ── Formatters ──
  const formatDuration = (secs) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (secs) => {
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${secs}s`;
  };

  const addCustomCaller = () => {
    // Security: Sanitize custom caller inputs (Vuln #6)
    const sanitizedName = customCaller.name.replace(/[<>{}\\/"'`;]/g, '').trim().substring(0, 30);
    const sanitizedNumber = customCaller.number.replace(/[^0-9+\-() ]/g, '').trim().substring(0, 15);
    if (sanitizedName) {
      setSelectedCaller({
        id: 'custom',
        name: sanitizedName,
        number: sanitizedNumber || '+91 00000 00000',
        emoji: '📱',
        label: 'Mobile',
        photo: customCaller.photo || null,
      });
      setCustomModalVisible(false);
      setCustomCaller({ name: '', number: '', photo: null });
    }
  };

  const onKeypadPress = (digit) => {
    setDtmfDigits(prev => prev + digit);
    Vibration.vibrate(30);
  };

  const getTimeString = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ──────────────────────────────────────────────────────────
  //  INCOMING CALL SCREEN — looks like stock Android dialer
  // ──────────────────────────────────────────────────────────
  if (isIncoming) {
    const renderRingPulse = (anim, size) => (
      <Animated.View
        style={[
          styles.ringPulse,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
          },
        ]}
      />
    );

    const arrowOpacity = swipeX.interpolate({
      inputRange: [0, SWIPE_THRESHOLD],
      outputRange: [0.6, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.incomingScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        {/* Top bar — clock + icons */}
        <View style={styles.nativeStatusBar}>
          <Text style={styles.nativeTime}>{getTimeString()}</Text>
          <View style={styles.nativeIcons}>
            <Ionicons name="cellular" size={14} color="rgba(255,255,255,0.8)" />
            <Ionicons name="wifi" size={14} color="rgba(255,255,255,0.8)" />
            <Ionicons name="battery-full" size={14} color="rgba(255,255,255,0.8)" />
          </View>
        </View>

        {/* Caller info */}
        <Animated.View style={[styles.incomingBody, { opacity: fadeAnim }]}>
          <Text style={styles.incomingLabel}>Incoming call</Text>

          {/* Ripple rings */}
          <View style={styles.avatarContainer}>
            {renderRingPulse(ringPulse1, 160)}
            {renderRingPulse(ringPulse2, 160)}
            {renderRingPulse(ringPulse3, 160)}
            <View style={styles.avatarCircle}>
              {selectedCaller.photo ? (
                <Image source={{ uri: selectedCaller.photo }} style={styles.avatarPhoto} />
              ) : (
                <Text style={styles.avatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </View>

          <Text style={styles.incomingName}>{selectedCaller.name}</Text>
          <Text style={styles.incomingNumber}>{selectedCaller.number}</Text>
          <Text style={styles.incomingNumberLabel}>{selectedCaller.label || 'Mobile'}</Text>
        </Animated.View>

        {/* Bottom actions */}
        <View style={styles.incomingBottom}>
          {/* Quick actions row */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity style={styles.quickAction}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="chatbubble" size={22} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickAction}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="alarm" size={22} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>Remind me</Text>
            </TouchableOpacity>
          </View>

          {/* Decline button */}
          <TouchableOpacity style={styles.declineBtn} onPress={endCall} activeOpacity={0.7}>
            <MaterialIcons name="call-end" size={32} color="#fff" />
          </TouchableOpacity>

          {/* Swipe to answer */}
          <View style={styles.swipeTrack}>
            <Animated.View style={[styles.swipeArrows, { opacity: arrowOpacity }]}>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </Animated.View>

            <Animated.View
              style={[
                styles.swipeThumb,
                { transform: [{ translateX: swipeX }] },
              ]}
              {...panResponder.panHandlers}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.answerBtnInner}>
                  <MaterialIcons name="call" size={32} color="#fff" />
                </View>
              </Animated.View>
            </Animated.View>

            <Text style={styles.swipeHint}>Swipe to answer</Text>
          </View>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────
  //  CONNECTING SCREEN — brief "Calling..." state
  // ──────────────────────────────────────────────────────────
  if (callConnecting) {
    return (
      <View style={styles.activeCallScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.activeCallBody}>
          <View style={styles.activeAvatarCircle}>
            {selectedCaller.photo ? (
              <Image source={{ uri: selectedCaller.photo }} style={styles.activeAvatarPhoto} />
            ) : (
              <Text style={styles.activeAvatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.activeCallerName}>{selectedCaller.name}</Text>
          <Text style={styles.activeCallStatus}>Connecting...</Text>
        </View>

        <View style={styles.activeCallBottom}>
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.7}>
            <MaterialIcons name="call-end" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────
  //  ACTIVE CALL SCREEN — full dialer UI
  // ──────────────────────────────────────────────────────────
  if (isCallActive) {
    const KEYPAD = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#'],
    ];
    const KEYPAD_SUB = {
      '1': '', '2': 'ABC', '3': 'DEF',
      '4': 'GHI', '5': 'JKL', '6': 'MNO',
      '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
      '*': '', '0': '+', '#': '',
    };

    return (
      <View style={styles.activeCallScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        <View style={styles.activeCallBody}>
          {!showKeypad && (
            <>
              <View style={styles.activeAvatarCircle}>
                {selectedCaller.photo ? (
                  <Image source={{ uri: selectedCaller.photo }} style={styles.activeAvatarPhoto} />
                ) : (
                  <Text style={styles.activeAvatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <Text style={styles.activeCallerName}>{selectedCaller.name}</Text>
            </>
          )}

          <Text style={styles.activeCallStatus}>
            {isHold ? 'On hold' : formatDuration(callDuration)}
          </Text>

          {!showKeypad && callDuration > 2 && (
            <View style={styles.hdBadge}>
              <Text style={styles.hdBadgeText}>HD</Text>
            </View>
          )}

          {showKeypad && (
            <View style={styles.keypadSection}>
              <Text style={styles.dtmfDisplay}>{dtmfDigits || ''}</Text>
              <View style={styles.keypadGrid}>
                {KEYPAD.map((row, ri) => (
                  <View key={ri} style={styles.keypadRow}>
                    {row.map((digit) => (
                      <TouchableOpacity
                        key={digit}
                        style={styles.keypadBtn}
                        onPress={() => onKeypadPress(digit)}
                        activeOpacity={0.5}
                      >
                        <Text style={styles.keypadDigit}>{digit}</Text>
                        <Text style={styles.keypadSub}>{KEYPAD_SUB[digit]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Control buttons — 2 rows of 3 */}
        <View style={styles.controlGrid}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={26} color="#fff" />
              <Text style={styles.controlLabel}>Mute</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, showKeypad && styles.controlBtnActive]}
              onPress={() => setShowKeypad(!showKeypad)}
            >
              <MaterialIcons name="dialpad" size={26} color="#fff" />
              <Text style={styles.controlLabel}>Keypad</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons name={isSpeaker ? 'volume-high' : 'volume-medium'} size={26} color="#fff" />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlBtn}>
              <Ionicons name="add-circle-outline" size={26} color="#fff" />
              <Text style={styles.controlLabel}>Add call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, isHold && styles.controlBtnActive]}
              onPress={() => setIsHold(!isHold)}
            >
              <Ionicons name="pause" size={26} color="#fff" />
              <Text style={styles.controlLabel}>Hold</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn}>
              <MaterialCommunityIcons name="video-outline" size={26} color="#fff" />
              <Text style={styles.controlLabel}>Video</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* End call */}
        <View style={styles.activeCallBottom}>
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.7}>
            <MaterialIcons name="call-end" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────
  //  SETUP SCREEN — disguised as "Quick Dial"
  // ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.secondary} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Dial</Text>
        <TouchableOpacity style={styles.headerInfoBtn}>
          <Ionicons name="shield-checkmark" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Discreet info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#4527A0" />
          <Text style={styles.infoText}>
            Schedule a call to help you step away from any situation safely.
          </Text>
        </View>

        {/* Select Caller */}
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.callerGrid}>
          {PRESET_CALLERS.map((caller) => (
            <TouchableOpacity
              key={caller.id}
              style={[
                styles.callerOption,
                selectedCaller.id === caller.id && styles.callerOptionActive,
              ]}
              onPress={() => setSelectedCaller(caller)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.callerAvatar,
                selectedCaller.id === caller.id && styles.callerAvatarSelected,
              ]}>
                <Text style={[
                  styles.callerInitial,
                  selectedCaller.id === caller.id && styles.callerInitialSelected,
                ]}>
                  {caller.name.charAt(0)}
                </Text>
              </View>
              <Text style={[
                styles.callerName,
                selectedCaller.id === caller.id && styles.callerNameSelected,
              ]} numberOfLines={1}>
                {caller.name} {caller.emoji}
              </Text>
              {selectedCaller.id === caller.id && (
                <View style={styles.callerCheck}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.secondary} />
                </View>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.callerOption}
            onPress={() => setCustomModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.callerAvatar}>
              <Ionicons name="add" size={22} color={COLORS.secondary} />
            </View>
            <Text style={styles.callerName}>Custom</Text>
          </TouchableOpacity>
        </View>

        {/* Delay selection */}
        <Text style={styles.sectionTitle}>Delay</Text>
        <View style={styles.delayGrid}>
          {DELAY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.delayChip,
                selectedDelay === option.value && styles.delayChipActive,
              ]}
              onPress={() => setSelectedDelay(option.value)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.delayChipText,
                selectedDelay === option.value && styles.delayChipTextActive,
              ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected caller preview */}
        <View style={styles.previewCard}>
          <View style={styles.previewAvatar}>
            <Text style={styles.previewInitial}>{selectedCaller.name.charAt(0)}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewName}>{selectedCaller.name}</Text>
            <Text style={styles.previewNumber}>{selectedCaller.number}</Text>
          </View>
          <View style={styles.previewDelay}>
            <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.previewDelayText}>
              {selectedDelay === 0 ? 'Instant' : formatCountdown(selectedDelay)}
            </Text>
          </View>
        </View>

        {/* Countdown display */}
        {countdown !== null && (
          <View style={styles.countdownBanner}>
            <View style={styles.countdownPulse}>
              <Ionicons name="call" size={20} color={COLORS.secondary} />
            </View>
            <View style={styles.countdownInfo}>
              <Text style={styles.countdownText}>
                Call in {formatCountdown(countdown)}
              </Text>
              <Text style={styles.countdownSubtext}>Stay on this screen or go back — the call will come through</Text>
            </View>
            <TouchableOpacity onPress={() => setCountdown(null)} style={styles.countdownCancel}>
              <Ionicons name="close" size={20} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        )}

        {/* Start button */}
        <TouchableOpacity
          style={[
            styles.startBtn,
            countdown !== null && styles.startBtnDisabled,
          ]}
          onPress={handleScheduleCall}
          disabled={countdown !== null}
          activeOpacity={0.8}
        >
          <MaterialIcons name="call" size={24} color="#fff" />
          <Text style={styles.startBtnText}>
            {selectedDelay === 0 ? 'Call Now' : 'Schedule Call'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Custom Caller Modal */}
      <Modal
        visible={customModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Contact</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter name"
                placeholderTextColor="#999"
                value={customCaller.name}
                onChangeText={(t) => setCustomCaller({ ...customCaller, name: t })}
                autoFocus
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Phone Number</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="+91 00000 00000"
                placeholderTextColor="#999"
                value={customCaller.number}
                onChangeText={(t) => setCustomCaller({ ...customCaller, number: t })}
                keyboardType="phone-pad"
              />
            </View>

            {/* Caller Photo Picker */}
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Caller Photo (optional)</Text>
              <TouchableOpacity
                style={styles.photoPickerBtn}
                onPress={pickCallerPhoto}
                accessibilityLabel="Pick caller photo from gallery"
              >
                {customCaller.photo ? (
                  <Image source={{ uri: customCaller.photo }} style={styles.photoPickerPreview} />
                ) : (
                  <View style={styles.photoPickerPlaceholder}>
                    <Ionicons name="camera" size={24} color={COLORS.textLight} />
                    <Text style={styles.photoPickerText}>Choose Photo</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, !customCaller.name.trim() && { opacity: 0.5 }]}
                onPress={addCustomCaller}
                disabled={!customCaller.name.trim()}
              >
                <Text style={styles.modalSaveText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Incoming Call Screen ──
  incomingScreen: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  nativeStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 38,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  nativeTime: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  nativeIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  incomingBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  incomingLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 28,
  },
  avatarContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ringPulse: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#3d5afe',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: {
    width: 90, height: 90, borderRadius: 45,
  },
  avatarLetter: {
    fontSize: 38,
    fontWeight: '600',
    color: '#fff',
  },
  incomingName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  incomingNumber: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '400',
    marginBottom: 4,
  },
  incomingNumberLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '400',
    textTransform: 'capitalize',
  },
  incomingBottom: {
    paddingBottom: Platform.OS === 'ios' ? 50 : 36,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 50,
    marginBottom: 36,
  },
  quickAction: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '400',
  },
  declineBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  swipeTrack: {
    width: SCREEN_W - 60,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swipeArrows: {
    position: 'absolute',
    right: 24,
    flexDirection: 'row',
    gap: -8,
  },
  swipeThumb: {
    position: 'absolute',
    left: 4,
  },
  answerBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#34a853',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    position: 'absolute',
    width: '100%',
  },

  // ── Active Call Screen ──
  activeCallScreen: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  activeCallBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  activeAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3d5afe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  activeAvatarPhoto: {
    width: 80, height: 80, borderRadius: 40,
  },
  activeAvatarLetter: {
    fontSize: 34,
    fontWeight: '600',
    color: '#fff',
  },
  activeCallerName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 6,
  },
  activeCallStatus: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  hdBadge: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  hdBadgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  controlGrid: {
    paddingHorizontal: 24,
    gap: 20,
    marginBottom: 30,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '400',
  },
  activeCallBottom: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 50 : 36,
  },
  endCallBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ea4335',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Keypad ──
  keypadSection: {
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
    paddingHorizontal: 40,
  },
  dtmfDisplay: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 3,
    marginBottom: 16,
    minHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  keypadGrid: {
    gap: 12,
    width: '100%',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  keypadBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadDigit: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
  },
  keypadSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: -2,
  },

  // ── Setup Screen ──
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerInfoBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoBanner: {
    backgroundColor: '#EDE7F6',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#4527A0',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    marginTop: 4,
  },
  callerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  callerOption: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    width: (SCREEN_W - 52) / 3,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.small,
  },
  callerOptionActive: {
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondaryLight + '15',
  },
  callerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e8e0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  callerAvatarSelected: {
    backgroundColor: COLORS.secondary,
  },
  callerInitial: {
    fontSize: 19,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  callerInitialSelected: {
    color: '#fff',
  },
  callerName: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  callerNameSelected: {
    color: COLORS.secondary,
  },
  callerCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  delayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  delayChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  delayChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  delayChipText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  delayChipTextActive: {
    color: '#fff',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.small,
  },
  previewAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3d5afe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  previewInitial: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  previewNumber: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  previewDelay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0edf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  previewDelayText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE7F6',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  countdownPulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.secondary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownInfo: {
    flex: 1,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  countdownSubtext: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countdownCancel: {
    padding: 8,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.secondary,
    borderRadius: 16,
    paddingVertical: 18,
    ...SHADOWS.medium,
  },
  startBtnDisabled: {
    opacity: 0.5,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Custom Caller Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Photo picker
  photoPickerBtn: {
    height: 80, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background, overflow: 'hidden',
  },
  photoPickerPreview: {
    width: '100%', height: '100%', borderRadius: 14,
  },
  photoPickerPlaceholder: {
    alignItems: 'center', gap: 4,
  },
  photoPickerText: {
    fontSize: 11, color: COLORS.textLight, fontWeight: '600',
  },
});

export default FakeCallScreen;

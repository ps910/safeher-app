/**
 * FakeCallScreen — Pixel-perfect replica of Android/Google Phone incoming call
 * Looks identical to the native stock dialer — no emojis, no branding
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
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Preset callers — realistic names, no emojis ──
const PRESET_CALLERS = [
  { id: '1', name: 'Mom', number: '+91 98765 43210', label: 'Mobile' },
  { id: '2', name: 'Dad', number: '+91 87654 32109', label: 'Mobile' },
  { id: '3', name: 'Priya', number: '+91 76543 21098', label: 'Mobile' },
  { id: '4', name: 'Rahul', number: '+91 65432 10987', label: 'Mobile' },
  { id: '5', name: 'Office', number: '+91 54321 09876', label: 'Work' },
  { id: '6', name: 'Ananya', number: '+91 99887 76655', label: 'Mobile' },
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

// Avatar background colors — Google Contacts style
const AVATAR_COLORS = [
  '#1A73E8', '#E8710A', '#D93025', '#188038',
  '#A142F4', '#E37400', '#5F6368', '#1967D2',
];

const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const FakeCallScreen = ({ navigation }) => {
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

  // Ringtone
  const ringtoneRef = useRef(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringPulse1 = useRef(new Animated.Value(0)).current;
  const ringPulse2 = useRef(new Animated.Value(0)).current;
  const ringPulse3 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;

  const pulseAnimRef = useRef(null);
  const ringAnimRef = useRef(null);
  const breatheAnimRef = useRef(null);

  const SWIPE_THRESHOLD = SCREEN_W * 0.35;

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      Vibration.cancel();
      stopRingtone();
      if (pulseAnimRef.current) pulseAnimRef.current.stop();
      if (ringAnimRef.current) ringAnimRef.current.stop();
      if (breatheAnimRef.current) breatheAnimRef.current.stop();
    };
  }, []);

  // ── Ringtone ──
  const playRingtone = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/telephones/phone_ringing.ogg' },
        { isLooping: true, volume: 1.0, shouldPlay: true }
      );
      ringtoneRef.current = sound;
    } catch (e) {
      // Offline — vibration only
    }
  };

  const stopRingtone = async () => {
    try {
      if (ringtoneRef.current) {
        await ringtoneRef.current.stopAsync();
        await ringtoneRef.current.unloadAsync();
        ringtoneRef.current = null;
      }
    } catch (e) {}
  };

  // ── Custom caller photo ──
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
    } catch (e) {}
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

  // ── Ring pulse animation ──
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

  // ── Breathe animation for swipe button ──
  const startBreatheAnimation = () => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    breatheAnimRef.current = anim;
    anim.start();
  };

  // ── Swipe-to-answer PanResponder ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0) swipeX.setValue(Math.min(gs.dx, SCREEN_W * 0.6));
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: SCREEN_W * 0.6,
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

    Vibration.vibrate([0, 800, 600, 800, 600, 800], true);
    startRingAnimation();
    startBreatheAnimation();
    playRingtone();

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
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
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch(e) {}
    }
  };

  // ── Answer call ──
  const answerCall = useCallback(() => {
    Vibration.cancel();
    stopRingAnimation();
    stopRingtone();
    if (pulseAnimRef.current) pulseAnimRef.current.stop();
    if (breatheAnimRef.current) breatheAnimRef.current.stop();

    setIsIncoming(false);
    setCallConnecting(true);
    setIsCallActive(false);

    setTimeout(() => {
      setCallConnecting(false);
      setIsCallActive(true);
      setCallDuration(0);
    }, 1000 + Math.random() * 1000);
  }, []);

  // ── End call ──
  const endCall = useCallback(() => {
    Vibration.cancel();
    stopRingAnimation();
    stopRingtone();
    if (pulseAnimRef.current) pulseAnimRef.current.stop();
    if (breatheAnimRef.current) breatheAnimRef.current.stop();

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
    const sanitizedName = customCaller.name.replace(/[<>{}\\/"'`;]/g, '').trim().substring(0, 30);
    const sanitizedNumber = customCaller.number.replace(/[^0-9+\-() ]/g, '').trim().substring(0, 15);
    if (sanitizedName) {
      setSelectedCaller({
        id: 'custom',
        name: sanitizedName,
        number: sanitizedNumber || '+91 00000 00000',
        label: 'Mobile',
        photo: customCaller.photo || null,
      });
      setCustomModalVisible(false);
      setCustomCaller({ name: '', number: '', photo: null });
    }
  };

  const onKeypadPress = (digit) => {
    setDtmfDigits(prev => prev + digit);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch(e) { Vibration.vibrate(20); }
  };

  const callerColor = getAvatarColor(selectedCaller.name);

  // ────────────────────────────────────────────────────────
  //  INCOMING CALL SCREEN — Stock Android Google Phone UI
  // ────────────────────────────────────────────────────────
  if (isIncoming) {
    const renderRingPulse = (anim, size) => (
      <Animated.View
        style={[
          styles.ringPulse,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: callerColor + '30',
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }],
          },
        ]}
      />
    );

    const swipeBg = swipeX.interpolate({
      inputRange: [0, SCREEN_W * 0.6],
      outputRange: ['rgba(52,168,83,0)', 'rgba(52,168,83,0.15)'],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.incomingScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        {/* Caller info — centered */}
        <Animated.View style={[styles.incomingBody, { opacity: fadeAnim }]}>
          {/* Ring pulses */}
          <View style={styles.avatarContainer}>
            {renderRingPulse(ringPulse1, 180)}
            {renderRingPulse(ringPulse2, 180)}
            {renderRingPulse(ringPulse3, 180)}
            <View style={[styles.avatarCircle, { backgroundColor: callerColor }]}>
              {selectedCaller.photo ? (
                <Image source={{ uri: selectedCaller.photo }} style={styles.avatarPhoto} />
              ) : (
                <Text style={styles.avatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </View>

          <Text style={styles.incomingName}>{selectedCaller.name}</Text>
          <Text style={styles.incomingNumber}>{selectedCaller.number}</Text>
          <Text style={styles.incomingSubLabel}>Incoming call</Text>
        </Animated.View>

        {/* Bottom — answer / decline */}
        <View style={styles.incomingBottom}>
          {/* Decline */}
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={endCall}
            activeOpacity={0.7}
          >
            <MaterialIcons name="call-end" size={30} color="#fff" />
          </TouchableOpacity>

          {/* Answer */}
          <TouchableOpacity
            style={styles.answerBtn}
            onPress={answerCall}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <MaterialIcons name="call" size={30} color="#fff" />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomLabelsRow}>
          <Text style={styles.bottomLabel}>Decline</Text>
          <Text style={styles.bottomLabel}>Answer</Text>
        </View>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────
  //  CONNECTING SCREEN
  // ────────────────────────────────────────────────────────
  if (callConnecting) {
    return (
      <View style={styles.callScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <View style={styles.callBody}>
          <View style={[styles.callAvatarCircle, { backgroundColor: callerColor }]}>
            {selectedCaller.photo ? (
              <Image source={{ uri: selectedCaller.photo }} style={styles.callAvatarPhoto} />
            ) : (
              <Text style={styles.callAvatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.callCallerName}>{selectedCaller.name}</Text>
          <Text style={styles.callStatusText}>Calling...</Text>
        </View>

        <View style={styles.callBottomSection}>
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.7}>
            <MaterialIcons name="call-end" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────
  //  ACTIVE CALL SCREEN — Google Phone in-call UI
  // ────────────────────────────────────────────────────────
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
      <View style={styles.callScreen}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

        <View style={styles.callBody}>
          {!showKeypad && (
            <>
              <View style={[styles.callAvatarCircle, { backgroundColor: callerColor }]}>
                {selectedCaller.photo ? (
                  <Image source={{ uri: selectedCaller.photo }} style={styles.callAvatarPhoto} />
                ) : (
                  <Text style={styles.callAvatarLetter}>{selectedCaller.name.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <Text style={styles.callCallerName}>{selectedCaller.name}</Text>
            </>
          )}

          <Text style={styles.callStatusText}>
            {isHold ? 'On hold' : formatDuration(callDuration)}
          </Text>

          {!showKeypad && callDuration > 2 && (
            <View style={styles.hdBadge}>
              <Text style={styles.hdBadgeText}>HD</Text>
            </View>
          )}

          {showKeypad && (
            <View style={styles.keypadSection}>
              <Text style={styles.dtmfDisplay}>{dtmfDigits || ' '}</Text>
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
                        {KEYPAD_SUB[digit] ? (
                          <Text style={styles.keypadSub}>{KEYPAD_SUB[digit]}</Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Control grid — 2 rows x 3 */}
        <View style={styles.controlGrid}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color="#fff" />
              <Text style={styles.controlLabel}>Mute</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, showKeypad && styles.controlBtnActive]}
              onPress={() => setShowKeypad(!showKeypad)}
            >
              <MaterialIcons name="dialpad" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Keypad</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons name={isSpeaker ? 'volume-high' : 'volume-medium'} size={24} color="#fff" />
              <Text style={styles.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlBtn}>
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Add call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, isHold && styles.controlBtnActive]}
              onPress={() => setIsHold(!isHold)}
            >
              <Ionicons name="pause" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Hold</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn}>
              <MaterialCommunityIcons name="record-circle-outline" size={24} color="#fff" />
              <Text style={styles.controlLabel}>Record</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* End call */}
        <View style={styles.callBottomSection}>
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.7}>
            <MaterialIcons name="call-end" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────
  //  SETUP SCREEN — Disguised as "Quick Dial"
  // ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#272738" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quick Dial</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color="#5C6BC0" />
          <Text style={styles.infoText}>
            Schedule a realistic call to help you leave any situation safely
          </Text>
        </View>

        {/* Select Caller */}
        <Text style={styles.sectionTitle}>Select contact</Text>
        <View style={styles.callerGrid}>
          {PRESET_CALLERS.map((caller) => {
            const isSelected = selectedCaller.id === caller.id;
            const color = getAvatarColor(caller.name);
            return (
              <TouchableOpacity
                key={caller.id}
                style={[styles.callerCard, isSelected && styles.callerCardActive]}
                onPress={() => setSelectedCaller(caller)}
                activeOpacity={0.7}
              >
                <View style={[styles.callerAvatar, { backgroundColor: isSelected ? color : color + '18' }]}>
                  <Text style={[styles.callerInitial, { color: isSelected ? '#fff' : color }]}>
                    {caller.name.charAt(0)}
                  </Text>
                </View>
                <Text style={[styles.callerName, isSelected && styles.callerNameActive]} numberOfLines={1}>
                  {caller.name}
                </Text>
                {isSelected && (
                  <View style={[styles.callerCheck, { backgroundColor: color }]}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.callerCard}
            onPress={() => setCustomModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.callerAvatar, { backgroundColor: '#E8E8EE' }]}>
              <Ionicons name="add" size={20} color="#666" />
            </View>
            <Text style={styles.callerName}>Custom</Text>
          </TouchableOpacity>
        </View>

        {/* Delay */}
        <Text style={styles.sectionTitle}>Call after</Text>
        <View style={styles.delayRow}>
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

        {/* Preview card */}
        <View style={styles.previewCard}>
          <View style={[styles.previewAvatar, { backgroundColor: callerColor }]}>
            <Text style={styles.previewInitial}>{selectedCaller.name.charAt(0)}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewName}>{selectedCaller.name}</Text>
            <Text style={styles.previewNumber}>{selectedCaller.number}</Text>
          </View>
          <View style={styles.previewDelayBadge}>
            <Ionicons name="time-outline" size={13} color="#888" />
            <Text style={styles.previewDelayText}>
              {selectedDelay === 0 ? 'Now' : formatCountdown(selectedDelay)}
            </Text>
          </View>
        </View>

        {/* Countdown */}
        {countdown !== null && (
          <View style={styles.countdownBanner}>
            <View style={styles.countdownIconWrap}>
              <Ionicons name="call" size={18} color="#1A73E8" />
            </View>
            <View style={styles.countdownInfo}>
              <Text style={styles.countdownText}>Calling in {formatCountdown(countdown)}</Text>
              <Text style={styles.countdownSub}>The call will ring even if you leave this screen</Text>
            </View>
            <TouchableOpacity onPress={() => setCountdown(null)} style={styles.countdownCancel}>
              <Ionicons name="close" size={18} color="#D93025" />
            </TouchableOpacity>
          </View>
        )}

        {/* Call button */}
        <TouchableOpacity
          style={[styles.callButton, countdown !== null && { opacity: 0.5 }]}
          onPress={handleScheduleCall}
          disabled={countdown !== null}
          activeOpacity={0.85}
        >
          <MaterialIcons name="call" size={22} color="#fff" />
          <Text style={styles.callButtonText}>
            {selectedDelay === 0 ? 'Call Now' : 'Schedule Call'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
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
            <Text style={styles.modalTitle}>New Contact</Text>

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

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Photo (optional)</Text>
              <TouchableOpacity style={styles.photoPickerBtn} onPress={pickCallerPhoto}>
                {customCaller.photo ? (
                  <Image source={{ uri: customCaller.photo }} style={styles.photoPickerPreview} />
                ) : (
                  <View style={styles.photoPickerPlaceholder}>
                    <Ionicons name="camera-outline" size={22} color="#999" />
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
                style={[styles.modalSaveBtn, !customCaller.name.trim() && { opacity: 0.4 }]}
                onPress={addCustomCaller}
                disabled={!customCaller.name.trim()}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ═══ Incoming Call ═══
  incomingScreen: {
    flex: 1,
    backgroundColor: '#1B1B1F',
  },
  incomingBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  avatarContainer: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  ringPulse: {
    position: 'absolute',
    borderWidth: 2,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarLetter: {
    fontSize: 40,
    fontWeight: '400',
    color: '#fff',
  },
  incomingName: {
    color: '#E3E3E8',
    fontSize: 30,
    fontWeight: '400',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  incomingNumber: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  incomingSubLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '400',
  },
  incomingBottom: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingBottom: 12,
  },
  bottomLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 60,
    paddingBottom: Platform.OS === 'ios' ? 50 : 40,
  },
  bottomLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '400',
  },
  declineBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EA4335',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#EA4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  answerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#34A853',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#34A853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // ═══ Active / Connecting Call Screen ═══
  callScreen: {
    flex: 1,
    backgroundColor: '#1B1B1F',
  },
  callBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  callAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  callAvatarPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  callAvatarLetter: {
    fontSize: 34,
    fontWeight: '400',
    color: '#fff',
  },
  callCallerName: {
    color: '#E3E3E8',
    fontSize: 24,
    fontWeight: '400',
    marginBottom: 6,
  },
  callStatusText: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 15,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  hdBadge: {
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hdBadgeText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ═══ Controls ═══
  controlGrid: {
    paddingHorizontal: 28,
    gap: 16,
    marginBottom: 28,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '400',
  },
  callBottomSection: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 50 : 36,
  },
  endCallBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EA4335',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#EA4335',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // ═══ Keypad ═══
  keypadSection: {
    alignItems: 'center',
    marginTop: 10,
    width: '100%',
    paddingHorizontal: 44,
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
    gap: 10,
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
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: -2,
  },

  // ═══ Setup Screen ═══
  container: {
    flex: 1,
    backgroundColor: '#F5F5F8',
  },
  header: {
    backgroundColor: '#272738',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoBanner: {
    backgroundColor: '#E8EAF6',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#3949AB',
    lineHeight: 18,
    fontWeight: '400',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A24',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  callerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  callerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    width: (SCREEN_W - 52) / 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  callerCardActive: {
    borderColor: '#1A73E8',
    backgroundColor: '#E8F0FE',
  },
  callerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  callerInitial: {
    fontSize: 18,
    fontWeight: '500',
  },
  callerName: {
    fontSize: 12,
    color: '#444',
    fontWeight: '500',
    textAlign: 'center',
  },
  callerNameActive: {
    color: '#1A73E8',
    fontWeight: '600',
  },
  callerCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Delay chips
  delayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  delayChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  delayChipActive: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  delayChipText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
  },
  delayChipTextActive: {
    color: '#fff',
  },

  // Preview card
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  previewAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  previewInitial: {
    fontSize: 20,
    fontWeight: '400',
    color: '#fff',
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A24',
    marginBottom: 2,
  },
  previewNumber: {
    fontSize: 13,
    color: '#888',
    fontVariant: ['tabular-nums'],
  },
  previewDelayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F0F4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  previewDelayText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },

  // Countdown banner
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  countdownIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#BBDEFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownInfo: {
    flex: 1,
  },
  countdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A73E8',
  },
  countdownSub: {
    fontSize: 11,
    color: '#5C6BC0',
    marginTop: 2,
  },
  countdownCancel: {
    padding: 8,
  },

  // Call NOW button
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#34A853',
    borderRadius: 14,
    paddingVertical: 17,
    elevation: 3,
    shadowColor: '#34A853',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // ═══ Custom Caller Modal ═══
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
    fontWeight: '600',
    color: '#1A1A24',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F5F5F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A24',
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  photoPickerBtn: {
    height: 80,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  photoPickerPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  photoPickerPlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  photoPickerText: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
});

export default FakeCallScreen;

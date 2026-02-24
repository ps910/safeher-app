/**
 * Fake Call Screen - Simulate incoming call to escape unsafe situations
 */
import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';

const PRESET_CALLERS = [
  { id: '1', name: 'Mom ❤️', number: '+91 98765 43210' },
  { id: '2', name: 'Dad 👨', number: '+91 87654 32109' },
  { id: '3', name: 'Sister 👧', number: '+91 76543 21098' },
  { id: '4', name: 'Best Friend 👩‍❤️‍👩', number: '+91 65432 10987' },
  { id: '5', name: 'Boss 💼', number: '+91 54321 09876' },
];

const DELAY_OPTIONS = [
  { label: 'Now', value: 0 },
  { label: '5 sec', value: 5 },
  { label: '10 sec', value: 10 },
  { label: '15 sec', value: 15 },
  { label: '30 sec', value: 30 },
  { label: '1 min', value: 60 },
];

const FakeCallScreen = ({ navigation }) => {
  const [selectedCaller, setSelectedCaller] = useState(PRESET_CALLERS[0]);
  const [selectedDelay, setSelectedDelay] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customCaller, setCustomCaller] = useState({ name: '', number: '' });

  const slideAnim = useRef(new Animated.Value(300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Countdown to fake call
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      startFakeCall();
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Call duration timer
  useEffect(() => {
    if (!isCallActive) return;
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isCallActive]);

  // Incoming call animation
  useEffect(() => {
    if (isCallActive) return;
    if (countdown === 0) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    }
  }, [countdown]);

  const handleScheduleCall = () => {
    if (selectedDelay === 0) {
      startIncomingCall();
    } else {
      setCountdown(selectedDelay);
      Vibration.vibrate(200);
    }
  };

  const startIncomingCall = () => {
    // Vibrate like a real phone call
    Vibration.vibrate([0, 1000, 500, 1000, 500, 1000], true);

    // Animate slide up
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Pulse animation for answer button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    setIsCallActive(false);
    setIsIncoming(true);
    slideAnim.setValue(0); // Show incoming screen
  };

  const startFakeCall = () => {
    startIncomingCall();
  };

  const answerCall = () => {
    Vibration.cancel();
    setIsIncoming(false);
    setIsCallActive(true);
    setCallDuration(0);
  };

  const endCall = () => {
    Vibration.cancel();
    setIsCallActive(false);
    setIsIncoming(false);
    setCallDuration(0);
    slideAnim.setValue(300);
    setCountdown(null);
  };

  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const addCustomCaller = () => {
    if (customCaller.name.trim()) {
      setSelectedCaller({
        id: 'custom',
        name: customCaller.name,
        number: customCaller.number || 'Unknown Number',
      });
      setCustomModalVisible(false);
      setCustomCaller({ name: '', number: '' });
    }
  };

  // Incoming Call / Active Call Full Screen
  if (isIncoming || isCallActive) {
    if (isCallActive) {
      // Active call screen
      return (
        <View style={styles.callScreen}>
          <StatusBar backgroundColor="#1B5E20" barStyle="light-content" />
          <View style={styles.callScreenContent}>
            <View style={styles.callerAvatarLarge}>
              <Text style={styles.callerAvatarText}>
                {selectedCaller.name.charAt(0)}
              </Text>
            </View>
            <Text style={styles.callerNameLarge}>{selectedCaller.name}</Text>
            <Text style={styles.callStatus}>
              {formatDuration(callDuration)}
            </Text>

            <View style={styles.callControls}>
              <TouchableOpacity style={styles.callControlBtn}>
                <Text style={styles.controlIcon}>🔇</Text>
                <Text style={styles.controlLabel}>Mute</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.callControlBtn}>
                <Text style={styles.controlIcon}>🔊</Text>
                <Text style={styles.controlLabel}>Speaker</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.callControlBtn}>
                <Text style={styles.controlIcon}>⌨️</Text>
                <Text style={styles.controlLabel}>Keypad</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.endCallBtn, SHADOWS.medium]}
              onPress={endCall}
            >
              <Text style={styles.endCallIcon}>📞</Text>
              <Text style={styles.endCallText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Incoming call screen
    return (
      <View style={styles.incomingScreen}>
        <StatusBar backgroundColor="#0D47A1" barStyle="light-content" />
        <Animated.View
          style={[
            styles.incomingContent,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.incomingLabel}>Incoming Call...</Text>
          <View style={styles.callerAvatarLarge}>
            <Text style={styles.callerAvatarText}>
              {selectedCaller.name.charAt(0)}
            </Text>
          </View>
          <Text style={styles.callerNameLarge}>{selectedCaller.name}</Text>
          <Text style={styles.callerNumberLarge}>{selectedCaller.number}</Text>

          <View style={styles.incomingButtons}>
            <TouchableOpacity
              style={[styles.declineBtn, SHADOWS.medium]}
              onPress={endCall}
            >
              <Text style={styles.incomingBtnIcon}>✕</Text>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.answerBtn, SHADOWS.medium]}
                onPress={answerCall}
              >
                <Text style={styles.incomingBtnIcon}>📞</Text>
                <Text style={styles.answerText}>Answer</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    );
  }

  // Setup Screen
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.secondary} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📞 Fake Call</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info */}
        <View style={[styles.infoBanner, SHADOWS.small]}>
          <Text style={styles.infoIcon}>💡</Text>
          <Text style={styles.infoText}>
            Schedule a fake incoming call to excuse yourself from an
            uncomfortable or unsafe situation.
          </Text>
        </View>

        {/* Select Caller */}
        <Text style={styles.sectionTitle}>Choose Caller</Text>
        <View style={styles.callerGrid}>
          {PRESET_CALLERS.map((caller) => (
            <TouchableOpacity
              key={caller.id}
              style={[
                styles.callerOption,
                selectedCaller.id === caller.id && styles.callerOptionActive,
                SHADOWS.small,
              ]}
              onPress={() => setSelectedCaller(caller)}
            >
              <View
                style={[
                  styles.callerAvatar,
                  selectedCaller.id === caller.id && styles.callerAvatarActive,
                ]}
              >
                <Text style={styles.callerInitial}>
                  {caller.name.charAt(0)}
                </Text>
              </View>
              <Text
                style={[
                  styles.callerName,
                  selectedCaller.id === caller.id && styles.callerNameActive,
                ]}
                numberOfLines={1}
              >
                {caller.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.callerOption, SHADOWS.small]}
            onPress={() => setCustomModalVisible(true)}
          >
            <View style={styles.callerAvatar}>
              <Text style={styles.callerInitial}>+</Text>
            </View>
            <Text style={styles.callerName}>Custom</Text>
          </TouchableOpacity>
        </View>

        {/* Select Delay */}
        <Text style={styles.sectionTitle}>Call Delay</Text>
        <View style={styles.delayGrid}>
          {DELAY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.delayOption,
                selectedDelay === option.value && styles.delayOptionActive,
              ]}
              onPress={() => setSelectedDelay(option.value)}
            >
              <Text
                style={[
                  styles.delayText,
                  selectedDelay === option.value && styles.delayTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Countdown Display */}
        {countdown !== null && (
          <View style={styles.countdownSection}>
            <Text style={styles.countdownText}>
              📞 Call coming in {countdown}s...
            </Text>
            <TouchableOpacity
              style={styles.cancelCountdown}
              onPress={() => setCountdown(null)}
            >
              <Text style={styles.cancelCountdownText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Start Call Button */}
        <TouchableOpacity
          style={[styles.startCallBtn, SHADOWS.medium]}
          onPress={handleScheduleCall}
          disabled={countdown !== null}
        >
          <Text style={styles.startCallIcon}>📞</Text>
          <Text style={styles.startCallText}>
            {selectedDelay === 0
              ? 'Start Fake Call Now'
              : `Schedule Call (${selectedDelay}s delay)`}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Custom Caller Modal */}
      <Modal
        visible={customModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, SHADOWS.large]}>
            <Text style={styles.modalTitle}>Custom Caller</Text>

            <TextInput
              style={styles.input}
              placeholder="Caller Name"
              placeholderTextColor={COLORS.textLight}
              value={customCaller.name}
              onChangeText={(text) =>
                setCustomCaller({ ...customCaller, name: text })
              }
            />

            <TextInput
              style={styles.input}
              placeholder="Phone Number (optional)"
              placeholderTextColor={COLORS.textLight}
              value={customCaller.number}
              onChangeText={(text) =>
                setCustomCaller({ ...customCaller, number: text })
              }
              keyboardType="phone-pad"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={addCustomCaller}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingTop: 48,
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SIZES.md,
  },
  infoBanner: {
    backgroundColor: '#EDE7F6',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SIZES.sm,
  },
  infoText: {
    flex: 1,
    fontSize: SIZES.small,
    color: '#4527A0',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.md,
  },
  callerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
    marginBottom: SIZES.lg,
  },
  callerOption: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.sm,
    alignItems: 'center',
    width: '30%',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  callerOptionActive: {
    borderColor: COLORS.secondary,
    backgroundColor: COLORS.secondaryLight + '20',
  },
  callerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.xs,
  },
  callerAvatarActive: {
    backgroundColor: COLORS.secondary,
  },
  callerInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  callerName: {
    fontSize: SIZES.small,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  callerNameActive: {
    color: COLORS.secondary,
  },
  delayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
    marginBottom: SIZES.xl,
  },
  delayOption: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusFull,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  delayOptionActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  delayText: {
    fontSize: SIZES.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  delayTextActive: {
    color: COLORS.white,
  },
  countdownSection: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  countdownText: {
    fontSize: SIZES.h4,
    color: COLORS.secondary,
    fontWeight: 'bold',
    marginBottom: SIZES.sm,
  },
  cancelCountdown: {
    padding: SIZES.sm,
  },
  cancelCountdownText: {
    color: COLORS.danger,
    fontSize: SIZES.body,
    fontWeight: '600',
  },
  startCallBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  startCallIcon: {
    fontSize: 24,
  },
  startCallText: {
    color: COLORS.white,
    fontSize: SIZES.h4,
    fontWeight: 'bold',
  },
  // Incoming Call Screen
  incomingScreen: {
    flex: 1,
    backgroundColor: '#0D47A1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomingContent: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: SIZES.xl,
  },
  incomingLabel: {
    color: COLORS.white,
    fontSize: SIZES.h4,
    marginBottom: SIZES.xl,
    opacity: 0.8,
  },
  callerAvatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  callerAvatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  callerNameLarge: {
    fontSize: SIZES.h2,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SIZES.sm,
  },
  callerNumberLarge: {
    fontSize: SIZES.h4,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: SIZES.xxl,
  },
  incomingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: SIZES.xxl,
  },
  declineBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomingBtnIcon: {
    fontSize: 24,
    color: COLORS.white,
  },
  declineText: {
    color: COLORS.white,
    fontSize: SIZES.small,
    marginTop: 4,
    fontWeight: '600',
  },
  answerText: {
    color: COLORS.white,
    fontSize: SIZES.small,
    marginTop: 4,
    fontWeight: '600',
  },
  // Active Call Screen
  callScreen: {
    flex: 1,
    backgroundColor: '#1B5E20',
  },
  callScreenContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.xl,
  },
  callStatus: {
    fontSize: SIZES.h3,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SIZES.xxl,
    fontFamily: 'monospace',
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: SIZES.xxl,
  },
  callControlBtn: {
    alignItems: 'center',
    padding: SIZES.md,
  },
  controlIcon: {
    fontSize: 28,
    marginBottom: SIZES.xs,
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: SIZES.small,
  },
  endCallBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.danger,
    paddingHorizontal: SIZES.xl,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusFull,
    alignItems: 'center',
    gap: SIZES.sm,
  },
  endCallIcon: {
    fontSize: 20,
    transform: [{ rotate: '135deg' }],
  },
  endCallText: {
    color: COLORS.white,
    fontSize: SIZES.h4,
    fontWeight: 'bold',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SIZES.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
  },
  modalTitle: {
    fontSize: SIZES.h3,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.lg,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.md,
    fontSize: SIZES.body,
    color: COLORS.text,
    marginBottom: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SIZES.md,
    marginTop: SIZES.sm,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
  },
  modalSaveText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});

export default FakeCallScreen;

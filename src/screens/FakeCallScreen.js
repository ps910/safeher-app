/**
 * FakeCallScreen v7.0 — Pixel-perfect incoming call decoy
 *
 * Mimics native Google Phone UI to provide a believable escape excuse.
 * No SafeHer branding visible to anyone observing the screen.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Input, Label, Pill, T,
} from '../components/ui';

const PRESETS = [
  { id: 'mom',   name: 'Mom',         emoji: '👩‍🦱', delay: 0 },
  { id: 'dad',   name: 'Dad',         emoji: '👨‍🦰', delay: 5 },
  { id: 'boss',  name: 'Boss',        emoji: '👔', delay: 10 },
  { id: 'sis',   name: 'Sister',      emoji: '👧', delay: 15 },
  { id: 'work',  name: 'Office',      emoji: '🏢', delay: 30 },
];

export default function FakeCallScreen() {
  const navigation = useNavigation();
  const [callerName, setCallerName] = useState('Mom');
  const [delaySec,   setDelaySec]   = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const [incoming,   setIncoming]   = useState(false);
  const [accepted,   setAccepted]   = useState(false);
  const [duration,   setDuration]   = useState(0);

  const ringSound = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef(null);
  const ringTimerRef = useRef(null);

  // ─── Cleanup ──
  useEffect(() => () => {
    if (ringSound.current) ringSound.current.unloadAsync().catch(() => {});
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    Vibration.cancel();
  }, []);

  const startRinging = async () => {
    setIncoming(true);
    Vibration.vibrate([0, 1000, 600, 1000, 600], true);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  };

  const triggerCall = async () => {
    setScheduling(true);
    if (delaySec > 0) {
      ringTimerRef.current = setTimeout(() => { startRinging(); setScheduling(false); }, delaySec * 1000);
    } else {
      await startRinging();
      setScheduling(false);
    }
  };

  const accept = () => {
    Vibration.cancel();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIncoming(false);
    setAccepted(true);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };

  const decline = () => {
    Vibration.cancel();
    if (ringSound.current) ringSound.current.unloadAsync().catch(() => {});
    setIncoming(false);
    setAccepted(false);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ─── ACCEPTED CALL VIEW ──────────────────────
  if (accepted) {
    const m = String(Math.floor(duration / 60)).padStart(2, '0');
    const s = String(duration % 60).padStart(2, '0');
    return (
      <View style={styles.callRoot}>
        <StatusBar hidden />
        <View style={styles.callTop}>
          <Text style={styles.callDuration}>{m}:{s}</Text>
          <Text style={styles.callName}>{callerName}</Text>
          <View style={styles.callAvatar}>
            <Ionicons name="person" size={70} color={T.white} />
          </View>
        </View>
        <View style={styles.callBottom}>
          <View style={styles.callActionsRow}>
            <CallAction icon="mic-off" label="Mute" />
            <CallAction icon="keypad" label="Keypad" />
            <CallAction icon="volume-high" label="Speaker" />
          </View>
          <TouchableOpacity style={styles.endBtn} onPress={decline}>
            <Ionicons name="call" size={32} color={T.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <Text style={styles.endLabel}>End</Text>
        </View>
      </View>
    );
  }

  // ─── INCOMING RING VIEW ──────────────────────
  if (incoming) {
    return (
      <View style={styles.callRoot}>
        <StatusBar hidden />
        <View style={styles.ringTop}>
          <Text style={styles.incomingLabel}>Incoming call…</Text>
          <Text style={styles.callName}>{callerName}</Text>
          <Text style={styles.callNumber}>Mobile</Text>
          <Animated.View style={[styles.callAvatar, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="person" size={70} color={T.white} />
          </Animated.View>
        </View>
        <View style={styles.ringBottom}>
          <View style={styles.ringActionRow}>
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity style={styles.declineBtn} onPress={decline}>
                <Ionicons name="call" size={28} color={T.white} style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.ringActionLabel}>Decline</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity style={styles.acceptBtn} onPress={accept}>
                <Ionicons name="call" size={28} color={T.white} />
              </TouchableOpacity>
              <Text style={styles.ringActionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ─── SETUP VIEW ──────────────────────────────
  return (
    <Screen>
      <Header title="Fake Call" subtitle="Generate a believable escape excuse" onBack={() => navigation.goBack()} />

      <Card>
        <Text style={styles.tipTitle}>📞 How it works</Text>
        <Text style={styles.tip}>
          Pick who's "calling" and when. The phone will ring with a perfect replica of your normal call screen.
          Useful when you need an excuse to leave, ignore someone, or look busy.
        </Text>
      </Card>

      <SectionTitle>Quick Presets</SectionTitle>
      <View style={styles.presetRow}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.preset, callerName === p.name && delaySec === p.delay && styles.presetActive]}
            onPress={() => { setCallerName(p.name); setDelaySec(p.delay); Haptics.selectionAsync(); }}
          >
            <Text style={styles.presetEmoji}>{p.emoji}</Text>
            <Text style={styles.presetName}>{p.name}</Text>
            <Text style={styles.presetDelay}>{p.delay === 0 ? 'now' : `${p.delay}s`}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionTitle>Customize</SectionTitle>
      <Card>
        <Label>Caller Name</Label>
        <Input value={callerName} onChangeText={setCallerName} placeholder="Mom, Boss, Friend…" />

        <Label>Delay before ringing (seconds)</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {[0, 5, 10, 30, 60].map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.delayChip, delaySec === s && { backgroundColor: T.primaryGlow, borderColor: T.primary }]}
              onPress={() => setDelaySec(s)}
            >
              <Text style={[styles.delayText, delaySec === s && { color: T.white }]}>
                {s === 0 ? 'Now' : `${s}s`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <PrimaryBtn icon="call" loading={scheduling} onPress={triggerCall}>
        {delaySec === 0 ? 'Ring Now' : `Ring in ${delaySec}s`}
      </PrimaryBtn>
    </Screen>
  );
}

function CallAction({ icon, label }) {
  return (
    <TouchableOpacity style={styles.callActionBtn}>
      <View style={styles.callActionIcon}>
        <Ionicons name={icon} size={22} color={T.white} />
      </View>
      <Text style={styles.callActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Setup styles
  tipTitle: { color: T.white, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  tip:      { color: T.textSub, fontSize: 12, lineHeight: 18 },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  preset: {
    width: '30%', alignItems: 'center',
    backgroundColor: T.card, borderRadius: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: T.border,
  },
  presetActive: { borderColor: T.primary, backgroundColor: T.primaryGlow },
  presetEmoji: { fontSize: 26 },
  presetName:  { color: T.white, fontSize: 13, fontWeight: '800', marginTop: 6 },
  presetDelay: { color: T.textSub, fontSize: 10, marginTop: 2 },

  delayChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
    backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.border,
  },
  delayText: { color: T.textSub, fontWeight: '800', fontSize: 12 },

  // Call screen styles (fullscreen, native-look)
  callRoot: { flex: 1, backgroundColor: '#1a1a1a', justifyContent: 'space-between' },
  callTop: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 80 : 60 },
  ringTop: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 100 : 80 },
  incomingLabel: { color: '#aaa', fontSize: 14, marginBottom: 8, fontWeight: '500' },
  callName: { color: T.white, fontSize: 32, fontWeight: '300', marginTop: 4, letterSpacing: 0.3 },
  callNumber: { color: '#aaa', fontSize: 14, marginTop: 4 },
  callDuration: { color: '#7ed957', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  callAvatar: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#3a3a3a',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 36,
  },

  callBottom: { paddingBottom: 50, alignItems: 'center' },
  callActionsRow: { flexDirection: 'row', gap: 50, marginBottom: 60 },
  callActionBtn: { alignItems: 'center' },
  callActionIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  callActionLabel: { color: T.white, fontSize: 12, marginTop: 8 },
  endBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#e74c3c',
    alignItems: 'center', justifyContent: 'center',
  },
  endLabel: { color: T.white, fontSize: 12, marginTop: 8 },

  ringBottom: { paddingBottom: 80 },
  ringActionRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 60 },
  declineBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#e74c3c',
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtn: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#27ae60',
    alignItems: 'center', justifyContent: 'center',
  },
  ringActionLabel: { color: T.white, fontSize: 13, marginTop: 10 },
});

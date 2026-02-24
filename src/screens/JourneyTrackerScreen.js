/**
 * JourneyTrackerScreen — Trip monitoring with auto-alerts
 * Features: Set destination + ETA, auto-alert contacts if overdue,
 *           extend trip, complete journey, live GPS tracking during trip
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useEmergency } from '../context/EmergencyContext';
import { COLORS, SHADOWS } from '../constants/theme';
import { sendSOSToContacts, getCurrentPosition } from '../utils/helpers';

const TIME_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function JourneyTrackerScreen() {
  const navigation = useNavigation();
  const {
    activeJourney, journeyOverdue,
    startJourney, completeJourney, extendJourney,
    emergencyContacts, currentLocation, setCurrentLocation,
    sosMessage, triggerSOS,
  } = useEmergency();

  const [destination, setDestination] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [timeLeft, setTimeLeft] = useState(null);

  // Countdown display
  useEffect(() => {
    if (!activeJourney) { setTimeLeft(null); return; }

    const interval = setInterval(() => {
      const eta = new Date(activeJourney.expectedArrival).getTime();
      const remaining = Math.max(0, Math.floor((eta - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJourney]);

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const handleStartJourney = async () => {
    if (!destination.trim()) {
      Alert.alert('Required', 'Please enter your destination.');
      return;
    }

    await startJourney(destination.trim(), selectedMinutes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Notify contacts about journey start
    if (emergencyContacts.length > 0) {
      const loc = currentLocation;
      const locText = loc
        ? `\n📍 Starting from: https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`
        : '';
      const msg = `🚶‍♀️ I've started a journey to "${destination.trim()}". Expected arrival in ${selectedMinutes} minutes.${locText}\n\nIf I don't check in by then, please try to reach me.\n\n— Girl Safety App`;

      for (const contact of emergencyContacts.filter(c => (c.tier || 1) === 1)) {
        try {
          const url = Platform.select({
            ios: `sms:${contact.phone}&body=${encodeURIComponent(msg)}`,
            android: `sms:${contact.phone}?body=${encodeURIComponent(msg)}`,
          });
          const { Linking } = require('react-native');
          await Linking.openURL(url);
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.log('SMS send error:', e);
        }
      }
    }

    Alert.alert(
      '🚶‍♀️ Journey Started',
      `Tracking your trip to "${destination.trim()}".\nYou have ${selectedMinutes} minutes to arrive.\n\nWe'll check on you if you're late!`
    );
    setDestination('');
  };

  const handleComplete = async () => {
    await completeJourney();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('✅ Journey Complete', 'Glad you arrived safely!');
  };

  const handleExtend = async (minutes) => {
    await extendJourney(minutes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('⏰ Extended', `Journey extended by ${minutes} minutes.`);
  };

  const handleSOS = () => {
    triggerSOS();
    Vibration.vibrate([0, 1000, 200, 1000], true);
    if (emergencyContacts.length > 0) {
      sendSOSToContacts(
        emergencyContacts,
        `🆘 EMERGENCY during journey to "${activeJourney?.destination || 'unknown'}"! I need help NOW!\n\n${sosMessage}`,
        currentLocation
      );
    }
    Alert.alert('🚨 SOS Sent', 'Emergency alerts sent to all contacts!');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Journey Tracker</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="navigate" size={22} color="#1565C0" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>Trip Safety Monitor</Text>
            <Text style={styles.infoText}>
              Set your destination and expected arrival time. If you don't check in,
              your emergency contacts will be automatically alerted.
            </Text>
          </View>
        </View>

        {activeJourney ? (
          /* ── Active Journey ── */
          <View>
            <View style={[styles.activeCard, journeyOverdue && styles.activeCardOverdue]}>
              <View style={styles.activeHeader}>
                <Ionicons
                  name={journeyOverdue ? 'warning' : 'navigate'}
                  size={32}
                  color={journeyOverdue ? '#FF1744' : '#1565C0'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.activeTitle, journeyOverdue && { color: '#FF1744' }]}>
                    {journeyOverdue ? '⚠️ OVERDUE!' : '📍 Journey Active'}
                  </Text>
                  <Text style={styles.activeDestination}>To: {activeJourney.destination}</Text>
                </View>
              </View>

              {/* Timer */}
              <View style={[styles.timerBox, journeyOverdue && styles.timerBoxOverdue]}>
                <Text style={styles.timerLabel}>
                  {journeyOverdue ? 'OVERDUE BY' : 'TIME REMAINING'}
                </Text>
                <Text style={[styles.timerValue, journeyOverdue && { color: '#FF1744' }]}>
                  {journeyOverdue && timeLeft === 0
                    ? formatTime(Math.floor((Date.now() - new Date(activeJourney.expectedArrival).getTime()) / 1000))
                    : formatTime(timeLeft)}
                </Text>
              </View>

              {/* Details */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Started</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeJourney.startTime).toLocaleTimeString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expected Arrival</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeJourney.expectedArrival).toLocaleTimeString()}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
              <Ionicons name="checkmark-circle" size={24} color="#FFF" />
              <Text style={styles.completeBtnText}>I've Arrived Safely ✅</Text>
            </TouchableOpacity>

            {/* Extend Options */}
            <Text style={styles.extendTitle}>Need More Time?</Text>
            <View style={styles.extendRow}>
              {[10, 15, 30, 60].map((min) => (
                <TouchableOpacity
                  key={min}
                  style={styles.extendBtn}
                  onPress={() => handleExtend(min)}
                >
                  <Text style={styles.extendBtnText}>+{min}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Emergency SOS */}
            {journeyOverdue && (
              <TouchableOpacity style={styles.sosBtn} onPress={handleSOS}>
                <Ionicons name="alert-circle" size={24} color="#FFF" />
                <Text style={styles.sosBtnText}>SEND SOS NOW</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* ── New Journey Setup ── */
          <View>
            <View style={styles.setupCard}>
              <Text style={styles.setupTitle}>Start a New Journey</Text>

              <Text style={styles.fieldLabel}>Where are you going?</Text>
              <TextInput
                style={styles.input}
                value={destination}
                onChangeText={setDestination}
                placeholder="e.g., Home, College, Office, Friend's house"
                placeholderTextColor={COLORS.textLight}
              />

              <Text style={styles.fieldLabel}>Expected travel time</Text>
              <View style={styles.timeGrid}>
                {TIME_OPTIONS.map((min) => (
                  <TouchableOpacity
                    key={min}
                    style={[styles.timeBtn, selectedMinutes === min && styles.timeBtnActive]}
                    onPress={() => setSelectedMinutes(min)}
                  >
                    <Text style={[
                      styles.timeBtnText,
                      selectedMinutes === min && styles.timeBtnTextActive,
                    ]}>
                      {min >= 60 ? `${min / 60}h` : `${min}m`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.startBtn} onPress={handleStartJourney}>
                <Ionicons name="navigate" size={22} color="#FFF" />
                <Text style={styles.startBtnText}>Start Journey Tracking</Text>
              </TouchableOpacity>
            </View>

            {/* How it works */}
            <View style={styles.howItWorks}>
              <Text style={styles.howTitle}>How it Works</Text>
              {[
                { icon: 'location', text: 'Set destination & expected travel time' },
                { icon: 'timer', text: 'App monitors your trip countdown' },
                { icon: 'notifications', text: 'Get reminded if you haven\'t arrived' },
                { icon: 'people', text: 'Contacts alerted if you don\'t check in' },
                { icon: 'alert-circle', text: 'Quick SOS if something goes wrong' },
              ].map((step, i) => (
                <View key={i} style={styles.howStep}>
                  <View style={styles.howIcon}>
                    <Ionicons name={step.icon} size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.howText}>{step.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingBottom: 18,
    backgroundColor: '#1565C0',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  content: { padding: 16 },

  infoBanner: {
    flexDirection: 'row', backgroundColor: '#E3F2FD', borderRadius: 14, padding: 14,
    marginBottom: 16, alignItems: 'flex-start', borderWidth: 1, borderColor: '#90CAF9',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0' },
  infoText: { fontSize: 12, color: '#1976D2', marginTop: 4, lineHeight: 17 },

  // Active Journey
  activeCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18,
    ...SHADOWS.medium, borderWidth: 2, borderColor: '#90CAF9',
  },
  activeCardOverdue: { borderColor: '#FF1744', backgroundColor: '#FFF5F5' },
  activeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  activeTitle: { fontSize: 18, fontWeight: '800', color: '#1565C0' },
  activeDestination: { fontSize: 14, color: COLORS.textLight, marginTop: 2 },

  timerBox: {
    backgroundColor: '#E3F2FD', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16,
  },
  timerBoxOverdue: { backgroundColor: '#FFEBEE' },
  timerLabel: { fontSize: 12, fontWeight: '700', color: '#666', letterSpacing: 1 },
  timerValue: { fontSize: 42, fontWeight: '900', color: '#1565C0', marginTop: 4 },

  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 13, color: COLORS.textLight },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 16, marginTop: 16,
  },
  completeBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', marginLeft: 8 },

  extendTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  extendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  extendBtn: {
    flex: 1, marginHorizontal: 4, backgroundColor: '#E3F2FD', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  extendBtnText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },

  sosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF1744', borderRadius: 14, paddingVertical: 16, marginTop: 16,
  },
  sosBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF', marginLeft: 8 },

  // Setup
  setupCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18,
    ...SHADOWS.medium,
  },
  setupTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 12, padding: 14,
    fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: {
    width: '30%', paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  timeBtnActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  timeBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  timeBtnTextActive: { color: '#FFF' },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 16, marginTop: 20,
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', marginLeft: 8 },

  // How it works
  howItWorks: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 18,
    marginTop: 16, ...SHADOWS.small,
  },
  howTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  howStep: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  howIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  howText: { fontSize: 13, color: COLORS.text, flex: 1 },
});

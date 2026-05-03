/**
 * JourneyTrackerScreen v7.0 — Plan + monitor trips (Dark Luxury)
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Input, Label, EmptyState, Stat, T,
} from '../components/ui';

const PRESETS = [10, 20, 30, 60, 90, 120];

export default function JourneyTrackerScreen() {
  const navigation = useNavigation();
  const {
    activeJourney, journeyOverdue, journeyBreadcrumbs, journeyStats,
    isDeviceMoving, journeyHistory,
    startJourney, completeJourney, extendJourney, currentLocation,
  } = useEmergency();

  const [destination, setDestination] = useState('');
  const [eta, setEta] = useState(30);
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (!destination.trim()) { Alert.alert('Missing', 'Where are you going?'); return; }
    if (!currentLocation) { Alert.alert('Waiting for GPS', 'Cannot start a journey without your current location. Try again in a moment.'); return; }
    setStarting(true);
    try {
      await startJourney(destination.trim(), eta);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDestination('');
    } finally { setStarting(false); }
  };

  const handleComplete = () => {
    Alert.alert('Complete Journey', 'Mark this journey as safely completed?', [
      { text: 'Not Yet', style: 'cancel' },
      { text: 'I Arrived', onPress: () => { completeJourney(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
    ]);
  };

  const handleExtend = (mins) => {
    extendJourney(mins);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Active journey ────────────────────────────────────────────
  if (activeJourney) {
    const eta = new Date(activeJourney.expectedArrival);
    const remaining = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60000));
    const distKm = ((journeyStats?.distance || 0) / 1000).toFixed(2);
    const avgKmh = ((journeyStats?.avgSpeed || 0) * 3.6).toFixed(1);

    return (
      <Screen>
        <Header title="Journey Active" subtitle={journeyOverdue ? '⚠️ Overdue' : 'Tracking your trip'} onBack={() => navigation.goBack()} />

        <Card style={[journeyOverdue && { borderColor: 'rgba(255,23,68,0.5)' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={[styles.bigIcon, { backgroundColor: journeyOverdue ? '#FF174422' : T.primaryGlow }]}>
              <Ionicons name="navigate" size={26} color={journeyOverdue ? T.danger : T.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.destLabel}>DESTINATION</Text>
              <Text style={styles.destText}>{activeJourney.destination}</Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <Metric label="ETA"      value={eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
            <Metric label="Remaining" value={`${remaining}m`} accent={journeyOverdue ? T.danger : T.primary} />
            <Metric label="Status"   value={isDeviceMoving ? 'Moving' : 'Idle'} accent={isDeviceMoving ? T.success : T.warning} />
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat icon="map" label="Distance" value={`${distKm} km`} color={T.info} />
          <Stat icon="speedometer" label="Avg Speed" value={`${avgKmh} km/h`} color={T.success} />
          <Stat icon="pin" label="GPS Pts" value={journeyBreadcrumbs?.length || 0} color={T.accent} />
        </View>

        <SectionTitle>Quick Actions</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[5, 10, 15].map(m => (
            <TouchableOpacity key={m} style={styles.extendChip} onPress={() => handleExtend(m)}>
              <Text style={styles.extendText}>+{m} min</Text>
            </TouchableOpacity>
          ))}
        </View>

        <PrimaryBtn icon="checkmark-circle" onPress={handleComplete}>I Arrived Safely</PrimaryBtn>
      </Screen>
    );
  }

  // ── Plan a journey ────────────────────────────────────────────
  return (
    <Screen>
      <Header title="Journey Tracker" subtitle="Tell us where you're going" onBack={() => navigation.goBack()} />

      <Card>
        <Label>Destination</Label>
        <Input value={destination} onChangeText={setDestination} placeholder="College, home, friend's place…" />

        <Label>How long should it take?</Label>
        <View style={styles.presetRow}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.presetChip, eta === p && { backgroundColor: T.primaryGlow, borderColor: T.primary }]}
              onPress={() => setEta(p)}
            >
              <Text style={[styles.presetText, eta === p && { color: T.white }]}>{p}m</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.note}>If you're not back by ETA, your contacts get an overdue alert.</Text>

        <PrimaryBtn icon="play" loading={starting} onPress={handleStart} style={{ marginTop: 18 }}>
          Start Journey
        </PrimaryBtn>
      </Card>

      {/* History */}
      <SectionTitle>Recent Journeys</SectionTitle>
      {journeyHistory?.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No past journeys"
          subtitle="Start your first tracked trip and it'll appear here."
        />
      ) : (
        journeyHistory?.slice(0, 10).map((j, i) => (
          <Card key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.histIcon, { backgroundColor: j.status === 'overdue' ? '#FF174422' : '#00E67622' }]}>
                <Ionicons name={j.status === 'overdue' ? 'alert' : 'checkmark'} size={16} color={j.status === 'overdue' ? T.danger : T.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.histDest}>{j.destination}</Text>
                <Text style={styles.histTime}>
                  {new Date(j.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
                <Text style={styles.histStats}>
                  {((j.stats?.distance || 0) / 1000).toFixed(1)} km • {j.breadcrumbs?.length || 0} GPS points
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

function Metric({ label, value, accent }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bigIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  destLabel: { color: T.textHint, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  destText:  { color: T.white, fontSize: 18, fontWeight: '900', marginTop: 4 },

  metricRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14 },
  metric:    { flex: 1, alignItems: 'center' },
  metricLabel: { color: T.textHint, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  metricValue: { color: T.white, fontSize: 18, fontWeight: '900', marginTop: 4 },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  presetChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.border,
  },
  presetText: { color: T.textSub, fontWeight: '800', fontSize: 13 },
  note: { color: T.textHint, fontSize: 11, marginTop: 12, lineHeight: 16 },

  extendChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center',
  },
  extendText: { color: T.text, fontWeight: '800', fontSize: 13 },

  histIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  histDest: { color: T.white, fontSize: 14, fontWeight: '800' },
  histTime: { color: T.textSub, fontSize: 11, marginTop: 2 },
  histStats: { color: T.textHint, fontSize: 10, marginTop: 2 },
});

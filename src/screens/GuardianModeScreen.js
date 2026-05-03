/**
 * GuardianModeScreen v7.0 — Always-on protection toggle (Dark Luxury)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import {
  Screen, Header, Card, SectionTitle, ToggleRow, PrimaryBtn,
  Pill, Stat, T,
} from '../components/ui';

export default function GuardianModeScreen() {
  const navigation = useNavigation();
  const {
    settings, updateSettings,
    isBackgroundTracking, currentLocation,
    isLiveSharing, startLiveLocationSharing, stopLiveLocationSharing,
  } = useEmergency();

  const [activating, setActivating] = useState(false);
  const isActive =
    settings.backgroundLocationEnabled &&
    settings.shakeToSOS &&
    settings.persistentSOSNotification;

  const activateAll = async () => {
    setActivating(true);
    try {
      await updateSettings({
        backgroundLocationEnabled: true,
        shakeToSOS: true,
        persistentSOSNotification: true,
        screamDetection: true,
        liveLocationSharing: true,
        autoRecordAudio: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Guardian Mode On', 'All protective monitors are now active.');
    } finally { setActivating(false); }
  };

  const deactivateAll = async () => {
    Alert.alert(
      'Turn off Guardian Mode?',
      'Background tracking, shake-to-SOS, and persistent notifications will be disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off', style: 'destructive',
          onPress: async () => {
            await updateSettings({
              backgroundLocationEnabled: false,
              persistentSOSNotification: false,
              screamDetection: false,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Header title="Guardian Mode" subtitle="Always-on protection" onBack={() => navigation.goBack()} />

      {/* Status hero */}
      <Card style={{ alignItems: 'center', padding: 24 }}>
        <View style={[styles.shieldWrap, { backgroundColor: isActive ? `${T.success}22` : T.primaryGlow }]}>
          <Ionicons name={isActive ? 'shield-checkmark' : 'shield-outline'} size={56} color={isActive ? T.success : T.primary} />
        </View>
        <Text style={[styles.statusText, { color: isActive ? T.success : T.text }]}>
          {isActive ? 'Guardian Active' : 'Guardian Inactive'}
        </Text>
        <Text style={styles.statusSub}>
          {isActive
            ? 'All protective monitors are running.'
            : 'Activate to enable continuous safety monitoring.'}
        </Text>

        <View style={{ marginTop: 22, width: '100%' }}>
          {isActive
            ? <PrimaryBtn icon="stop-circle" danger onPress={deactivateAll}>Turn Off Guardian</PrimaryBtn>
            : <PrimaryBtn icon="shield-checkmark" loading={activating} onPress={activateAll}>Activate Guardian Mode</PrimaryBtn>}
        </View>
      </Card>

      {/* Live status */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        <Stat
          icon={isBackgroundTracking ? 'cloud-done' : 'cloud-offline'}
          label="BG Tracking"
          value={isBackgroundTracking ? 'On' : 'Off'}
          color={isBackgroundTracking ? T.success : T.textSub}
        />
        <Stat
          icon={isLiveSharing ? 'radio' : 'radio-outline'}
          label="Live Share"
          value={isLiveSharing ? 'Active' : 'Off'}
          color={isLiveSharing ? T.primary : T.textSub}
        />
        <Stat
          icon={currentLocation ? 'navigate' : 'navigate-outline'}
          label="GPS"
          value={currentLocation ? 'Lock' : 'Searching'}
          color={currentLocation ? T.success : T.warning}
        />
      </View>

      {/* Feature toggles */}
      <SectionTitle>Active Monitors</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          icon="locate" iconColor={T.success}
          title="Background location" subtitle="Tracks GPS even when app is closed"
          value={settings.backgroundLocationEnabled}
          onValueChange={(v) => updateSettings({ backgroundLocationEnabled: v })}
        />
        <ToggleRow
          icon="phone-portrait" iconColor={T.primary}
          title="Shake to SOS" subtitle="3 shakes triggers emergency"
          value={settings.shakeToSOS}
          onValueChange={(v) => updateSettings({ shakeToSOS: v })}
        />
        <ToggleRow
          icon="ear" iconColor={T.warning}
          title="Scream detection" subtitle="Listens for distress sounds"
          value={settings.screamDetection}
          onValueChange={(v) => updateSettings({ screamDetection: v })}
        />
        <ToggleRow
          icon="notifications" iconColor={T.info}
          title="Persistent notification" subtitle="Quick-trigger from notification shade"
          value={settings.persistentSOSNotification}
          onValueChange={(v) => updateSettings({ persistentSOSNotification: v })}
          last
        />
      </Card>

      <View style={styles.footer}>
        <Ionicons name="information-circle" size={14} color={T.textHint} />
        <Text style={styles.footerText}>Battery use increases by ~5–10% with all monitors active.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shieldWrap: {
    width: 110, height: 110, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  statusText: { fontSize: 22, fontWeight: '900', letterSpacing: 0.3 },
  statusSub:  { color: T.textSub, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  footerText: { color: T.textHint, fontSize: 11 },
});

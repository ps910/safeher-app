/**
 * SettingsScreen v7.0 — Safety controls + privacy + danger zone (Dark Luxury)
 */
import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { panicWipe } from '../utils/helpers';
import {
  Screen, Header, Card, SectionTitle, Row, ToggleRow,
  PrimaryBtn, GhostBtn, T,
} from '../components/ui';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const {
    settings, updateSettings, sosMessage, updateSOSMessage,
    toggleStealthMode, stealthMode,
  } = useEmergency();
  const { lock, hasPin, hasDuressPin, biometricEnabled, toggleBiometric } = useAuth();

  const [wiping, setWiping] = useState(false);

  const handleWipe = () => {
    Alert.alert(
      '⚠️  Panic Wipe',
      'This deletes ALL local data: contacts, journey history, evidence, encryption keys, and signs you out. Cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything', style: 'destructive',
          onPress: async () => {
            setWiping(true);
            try {
              const ok = await panicWipe();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert(ok ? 'Wipe Complete' : 'Partial Wipe', ok
                ? 'All local data has been removed.'
                : 'Some items could not be removed. Please reinstall the app for a complete wipe.',
              );
            } finally { setWiping(false); }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'You\'ll need to sign in again to access SafeHer.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => lock() },
      ],
    );
  };

  return (
    <Screen>
      <Header title="Settings" subtitle="Tune SafeHer to your needs" onBack={() => navigation.goBack()} />

      {/* SOS triggers */}
      <SectionTitle>SOS Triggers</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          icon="phone-portrait" iconColor={T.primary}
          title="Shake to Trigger" subtitle="Shake the phone 3× to activate SOS"
          value={settings.shakeToSOS} onValueChange={(v) => updateSettings({ shakeToSOS: v })}
        />
        <ToggleRow
          icon="volume-high" iconColor={T.warning}
          title="Volume Button SOS" subtitle="Press volume button 5× in 3s"
          value={settings.volumeButtonSOS} onValueChange={(v) => updateSettings({ volumeButtonSOS: v })}
        />
        <ToggleRow
          icon="ear" iconColor={T.success}
          title="Scream Detection" subtitle="AI listens for distress sounds"
          value={settings.screamDetection} onValueChange={(v) => updateSettings({ screamDetection: v })}
        />
        <ToggleRow
          icon="timer" iconColor={T.info}
          title="Inactivity Check-In" subtitle={`Reminds every ${settings.inactivityTimeout} min`}
          value={settings.inactivitySOSEnabled} onValueChange={(v) => updateSettings({ inactivitySOSEnabled: v })}
          last
        />
      </Card>

      {/* SOS actions */}
      <SectionTitle>When SOS is triggered</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          icon="megaphone" iconColor={T.danger}
          title="Loud Siren" subtitle="Plays alarm to attract help"
          value={settings.sirenEnabled} onValueChange={(v) => updateSettings({ sirenEnabled: v })}
        />
        <ToggleRow
          icon="mic" iconColor={T.orange}
          title="Auto-record audio" subtitle="Captures evidence automatically"
          value={settings.autoRecordAudio} onValueChange={(v) => updateSettings({ autoRecordAudio: v })}
        />
        <ToggleRow
          icon="camera" iconColor={T.accent}
          title="Auto-capture photo" subtitle="Snaps a photo on trigger"
          value={settings.autoPhotoCapture} onValueChange={(v) => updateSettings({ autoPhotoCapture: v })}
        />
        <ToggleRow
          icon="call" iconColor={T.danger}
          title="Auto-call police" subtitle="Dials 112 after 3 seconds"
          value={settings.autoCallPolice} onValueChange={(v) => updateSettings({ autoCallPolice: v })}
        />
        <ToggleRow
          icon="navigate" iconColor={T.info}
          title="Live location sharing" subtitle="60-min shareable link to contacts"
          value={settings.liveLocationSharing} onValueChange={(v) => updateSettings({ liveLocationSharing: v })}
          last
        />
      </Card>

      {/* Privacy & background */}
      <SectionTitle>Privacy & Background</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          icon="locate" iconColor={T.success}
          title="Background location" subtitle="Tracks even when app is closed"
          value={settings.backgroundLocationEnabled}
          onValueChange={(v) => updateSettings({ backgroundLocationEnabled: v })}
        />
        <ToggleRow
          icon="notifications" iconColor={T.primary}
          title="Persistent SOS notification" subtitle="Quick-trigger from notification shade"
          value={settings.persistentSOSNotification}
          onValueChange={(v) => updateSettings({ persistentSOSNotification: v })}
        />
        <ToggleRow
          icon="cloud-upload" iconColor={T.info}
          title="Push notifications" subtitle="Cloud-routed alerts to contacts"
          value={settings.pushNotifications}
          onValueChange={(v) => updateSettings({ pushNotifications: v })}
        />
        <ToggleRow
          icon="cloud-offline" iconColor={T.warning}
          title="Offline SOS" subtitle="Queues alerts when no internet"
          value={settings.offlineSOS} onValueChange={(v) => updateSettings({ offlineSOS: v })}
          last
        />
      </Card>

      {/* Stealth */}
      <SectionTitle>Stealth & Disguise</SectionTitle>
      <Card padded={false}>
        <ToggleRow
          icon="calculator" iconColor={T.info}
          title="Calculator disguise" subtitle="Replace home with a calculator. Type 112 then = for SOS"
          value={stealthMode} onValueChange={() => toggleStealthMode()}
          last
        />
      </Card>

      {/* Account */}
      <SectionTitle>Account & Security</SectionTitle>
      <Card padded={false}>
        <Row
          icon="person-circle" iconColor={T.primary}
          title="Edit profile"
          subtitle="Personal info, medical, addresses"
          onPress={() => navigation.navigate('Profile')}
        />
        <Row
          icon="finger-print" iconColor={T.info}
          title="Biometric unlock"
          subtitle={biometricEnabled ? 'Enabled' : 'Use fingerprint / Face ID'}
          right={null}
          onPress={() => toggleBiometric(!biometricEnabled)}
        />
        <Row
          icon="key" iconColor={hasPin ? T.success : T.warning}
          title={hasPin ? 'PIN set' : 'Set up PIN'}
          subtitle={hasDuressPin ? 'Duress PIN also configured' : 'Use a different PIN to silently trigger SOS'}
        />
        <Row
          icon="log-out" iconColor={T.warning}
          title="Sign out"
          onPress={handleLogout}
          last
        />
      </Card>

      {/* Danger zone */}
      <SectionTitle>Danger Zone</SectionTitle>
      <Card>
        <Text style={styles.dangerTitle}>🔥 Panic Wipe</Text>
        <Text style={styles.dangerSub}>
          Erases every byte of SafeHer data on this device — contacts, evidence, journey history, encryption keys —
          and signs you out. Use if your phone is being inspected and you need to leave nothing behind.
        </Text>
        <PrimaryBtn icon="flame" danger loading={wiping} onPress={handleWipe} style={{ marginTop: 14 }}>
          Wipe All Local Data
        </PrimaryBtn>
      </Card>

      <Text style={styles.version}>SafeHer v7.0 • Built for safety</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dangerTitle: { color: T.danger, fontSize: 16, fontWeight: '900' },
  dangerSub:   { color: T.textSub, fontSize: 12, marginTop: 8, lineHeight: 18 },
  version:     { color: T.textHint, fontSize: 10, textAlign: 'center', marginTop: 22, fontStyle: 'italic' },
});

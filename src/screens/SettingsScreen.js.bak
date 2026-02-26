/**
 * SettingsScreen v4.0 — All safety feature toggles & configuration
 * New: Inactivity Timer, Scream Detection, Panic Wipe, Journey Alerts
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
  TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { panicWipe } from '../utils/helpers';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const {
    settings, updateSettings, sosMessage, updateSOSMessage,
    stealthMode, toggleStealthMode,
  } = useEmergency();
  const { biometricEnabled, toggleBiometric, hasDuressPin, setupDuressPin, lock } = useAuth();

  const [editingMessage, setEditingMessage] = useState(false);
  const [tempMessage, setTempMessage] = useState(sosMessage);
  const [duressInput, setDuressInput] = useState('');
  const [showDuressSetup, setShowDuressSetup] = useState(false);

  const toggleSetting = (key) => {
    updateSettings({ [key]: !settings[key] });
  };

  const saveMessage = () => {
    if (tempMessage.trim()) {
      updateSOSMessage(tempMessage.trim());
    }
    setEditingMessage(false);
  };

  const handlePanicWipe = () => {
    Alert.alert(
      '⚠️ PANIC WIPE',
      'This will DELETE ALL app data including contacts, settings, evidence, and reports. This CANNOT be undone.\n\nAre you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'WIPE EVERYTHING',
          style: 'destructive',
          onPress: async () => {
            const success = await panicWipe();
            if (success) {
              lock();
              Alert.alert('✓ Wiped', 'All data has been erased.');
            }
          },
        },
      ]
    );
  };

  const countdownOptions = [3, 5, 10, 15];
  const inactivityOptions = [15, 30, 60, 120];

  const settingSections = [
    {
      title: '🚨 SOS Settings',
      items: [
        { key: 'shakeToSOS', icon: 'phone-portrait', label: 'Shake to SOS', desc: 'Shake phone 3 times rapidly to trigger SOS' },
        { key: 'autoCallPolice', icon: 'call', label: 'Auto Call Police', desc: 'Automatically call 112 during SOS' },
        { key: 'autoLocationShare', icon: 'location', label: 'Auto Share Location', desc: 'Send GPS coordinates to emergency contacts' },
      ],
    },
    {
      title: '🔊 Alarm & Evidence',
      items: [
        { key: 'sirenEnabled', icon: 'volume-high', label: 'Loud Emergency Siren', desc: 'Activate maximum-volume alarm during SOS' },
        { key: 'autoRecordAudio', icon: 'mic', label: 'Auto Record Evidence', desc: 'Start audio recording during SOS for evidence' },
        { key: 'autoPhotoCapture', icon: 'camera', label: 'Auto Photo Capture', desc: 'Silently capture photos during SOS' },
      ],
    },
    {
      title: '🤖 AI & Smart Features',
      items: [
        { key: 'screamDetection', icon: 'ear', label: 'Scream / Loud Sound Detection', desc: 'AI detects aggressive sounds and prompts SOS' },
        { key: 'inactivitySOSEnabled', icon: 'timer', label: 'Auto-SOS on Inactivity', desc: 'Alert if you don\'t check in within set time' },
        { key: 'journeyAlerts', icon: 'navigate', label: 'Journey Alerts', desc: 'Monitor trips and alert if you\'re overdue' },
      ],
    },
    {
      title: '🔒 Privacy & Stealth',
      items: [
        { key: 'hiddenMode', icon: 'eye-off', label: 'Hidden Mode', desc: 'App works silently in background' },
      ],
    },
    {
      title: '📡 Offline Safety',
      items: [
        { key: 'offlineSOS', icon: 'cloud-offline', label: 'Offline SOS', desc: 'Send SMS-based SOS without internet' },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stealth Mode Toggle */}
        <TouchableOpacity style={styles.stealthCard} onPress={toggleStealthMode}>
          <View style={styles.stealthRow}>
            <View style={[styles.stealthIcon, stealthMode && styles.stealthIconActive]}>
              <Ionicons name="calculator" size={28} color={stealthMode ? '#FFF' : '#9C27B0'} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.stealthLabel}>Stealth Calculator Mode</Text>
              <Text style={styles.stealthDesc}>Disguise app as calculator. Type 112 + = to trigger silent SOS</Text>
            </View>
            <Switch
              value={stealthMode}
              onValueChange={toggleStealthMode}
              trackColor={{ false: '#ddd', true: '#CE93D8' }}
              thumbColor={stealthMode ? '#9C27B0' : '#f4f3f4'}
            />
          </View>
        </TouchableOpacity>

        {/* Security & Authentication */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔐 Security & Authentication</Text>
          <Text style={styles.sectionDesc}>Protect access to your safety app</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="finger-print" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Biometric Unlock</Text>
              <Text style={styles.settingDesc}>Use fingerprint or face to unlock</Text>
            </View>
            <Switch
              value={biometricEnabled || false}
              onValueChange={(val) => toggleBiometric(val)}
              trackColor={{ false: '#ddd', true: COLORS.primary + '80' }}
              thumbColor={biometricEnabled ? COLORS.primary : '#f4f3f4'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="warning" size={22} color="#FF6D00" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Duress PIN</Text>
              <Text style={styles.settingDesc}>
                {hasDuressPin ? '✅ Active — Entering it triggers silent SOS' : 'Set a secret PIN that triggers SOS when forced to unlock'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.setupBtn, hasDuressPin && { backgroundColor: '#E8F5E9' }]}
              onPress={() => setShowDuressSetup(!showDuressSetup)}
            >
              <Text style={[styles.setupBtnText, hasDuressPin && { color: '#2E7D32' }]}>
                {hasDuressPin ? 'Change' : 'Setup'}
              </Text>
            </TouchableOpacity>
          </View>

          {showDuressSetup && (
            <View style={styles.duressSetupBox}>
              <Text style={styles.duressHint}>Enter a 4-digit duress PIN (different from your main PIN):</Text>
              <TextInput
                style={styles.duressInput}
                value={duressInput}
                onChangeText={setDuressInput}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textLight}
              />
              <TouchableOpacity
                style={styles.duressSaveBtn}
                onPress={async () => {
                  if (duressInput.length === 4) {
                    await setupDuressPin(duressInput);
                    setDuressInput('');
                    setShowDuressSetup(false);
                    Alert.alert('✅ Duress PIN Set', 'Entering this PIN on the lock screen will silently trigger SOS.');
                  } else {
                    Alert.alert('Error', 'PIN must be 4 digits');
                  }
                }}
              >
                <Text style={styles.duressSaveBtnText}>Save Duress PIN</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Panic Wipe */}
          <TouchableOpacity style={[styles.settingRow, { borderBottomWidth: 0 }]} onPress={handlePanicWipe}>
            <View style={[styles.settingIcon, { backgroundColor: '#FF174415' }]}>
              <Ionicons name="trash" size={22} color="#FF1744" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: '#FF1744' }]}>Panic Wipe</Text>
              <Text style={styles.settingDesc}>Instantly erase all app data if phone is taken</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FF1744" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, { borderBottomWidth: 0 }]}
            onPress={() => { lock(); }}
          >
            <View style={styles.settingIcon}>
              <Ionicons name="lock-closed" size={22} color="#FF1744" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Lock App Now</Text>
              <Text style={styles.settingDesc}>Return to PIN screen immediately</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {/* Quick Navigation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Quick Navigation</Text>
          {[
            { icon: 'person-circle', label: 'Safety Profile', desc: 'Medical ID, addresses, vehicle', screen: 'Profile', color: '#6200EA' },
            { icon: 'lock-closed', label: 'Evidence Vault', desc: 'Tamper-proof evidence logs', screen: 'EvidenceVault', color: '#37474F' },
            { icon: 'locate', label: 'Guardian Mode', desc: 'Geofence zones & check-in', screen: 'GuardianMode', color: '#00838F' },
            { icon: 'navigate', label: 'Journey Tracker', desc: 'Trip monitoring & auto-alerts', screen: 'JourneyTracker', color: '#1565C0' },
            { icon: 'document-text', label: 'Incident Report', desc: 'Generate police-ready reports', screen: 'IncidentReport', color: '#4E342E' },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.settingRow} onPress={() => navigation.navigate(item.screen)}>
              <View style={[styles.settingIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingDesc}>{item.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Inactivity Timer Config */}
        {settings.inactivitySOSEnabled && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏱️ Inactivity Timer</Text>
            <Text style={styles.sectionDesc}>Auto-SOS if you don't check in within this time</Text>
            <View style={styles.countdownRow}>
              {inactivityOptions.map((min) => (
                <TouchableOpacity
                  key={min}
                  style={[styles.countdownBtn, settings.inactivityTimeout === min && styles.countdownBtnActive]}
                  onPress={() => updateSettings({ inactivityTimeout: min })}
                >
                  <Text style={[
                    styles.countdownBtnText,
                    settings.inactivityTimeout === min && styles.countdownBtnTextActive,
                  ]}>{min >= 60 ? `${min / 60}h` : `${min}m`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* SOS Countdown Timer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ SOS Countdown</Text>
          <Text style={styles.sectionDesc}>Time before SOS activates (gives you time to cancel)</Text>
          <View style={styles.countdownRow}>
            {countdownOptions.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[styles.countdownBtn, settings.countdownSeconds === sec && styles.countdownBtnActive]}
                onPress={() => updateSettings({ countdownSeconds: sec })}
              >
                <Text style={[
                  styles.countdownBtnText,
                  settings.countdownSeconds === sec && styles.countdownBtnTextActive,
                ]}>{sec}s</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Setting Sections */}
        {settingSections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item.key} style={styles.settingRow}>
                <View style={styles.settingIcon}>
                  <Ionicons name={item.icon} size={22} color={COLORS.primary} />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  <Text style={styles.settingDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={settings[item.key] || false}
                  onValueChange={() => toggleSetting(item.key)}
                  trackColor={{ false: '#ddd', true: COLORS.primary + '80' }}
                  thumbColor={settings[item.key] ? COLORS.primary : '#f4f3f4'}
                />
              </View>
            ))}
          </View>
        ))}

        {/* SOS Message Editor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 SOS Message</Text>
          <Text style={styles.sectionDesc}>This message is sent to your emergency contacts during SOS</Text>
          {editingMessage ? (
            <View style={styles.messageEditor}>
              <TextInput
                style={styles.messageInput}
                value={tempMessage}
                onChangeText={setTempMessage}
                multiline
                maxLength={300}
                placeholder="Enter your SOS message..."
                placeholderTextColor={COLORS.textLight}
              />
              <View style={styles.messageActions}>
                <TouchableOpacity style={styles.msgCancelBtn} onPress={() => { setTempMessage(sosMessage); setEditingMessage(false); }}>
                  <Text style={styles.msgCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.msgSaveBtn} onPress={saveMessage}>
                  <Text style={styles.msgSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.messageBox} onPress={() => setEditingMessage(true)}>
              <Text style={styles.messageText} numberOfLines={3}>{sosMessage}</Text>
              <Ionicons name="pencil" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ About</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>Girl Safety App</Text>
            <Text style={styles.aboutVersion}>Version 4.0 — Next-Gen Safety Ecosystem</Text>
            <Text style={styles.aboutDesc}>
              AI-powered distress detection, journey tracking, evidence vault,
              incident reports, guardian mode, stealth calculator, panic wipe,
              inactivity auto-SOS, biometric auth, and much more.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingBottom: 18,
    backgroundColor: COLORS.primaryDark,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  backBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.surface, letterSpacing: 0.3 },
  content: { padding: 16 },

  // Stealth
  stealthCard: {
    backgroundColor: '#F3E5F5', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 2, borderColor: '#CE93D8',
  },
  stealthRow: { flexDirection: 'row', alignItems: 'center' },
  stealthIcon: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#E1BEE7',
    alignItems: 'center', justifyContent: 'center',
  },
  stealthIconActive: { backgroundColor: '#9C27B0' },
  stealthLabel: { fontSize: 16, fontWeight: '700', color: '#4A148C' },
  stealthDesc: { fontSize: 12, color: '#7B1FA2', marginTop: 2 },

  // Section
  section: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: COLORS.textLight, marginBottom: 12 },

  // Countdown
  countdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  countdownBtn: {
    flex: 1, marginHorizontal: 4, paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  countdownBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  countdownBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  countdownBtnTextActive: { color: '#FFF' },

  // Setting Row
  settingRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  settingIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  settingInfo: { flex: 1, marginLeft: 12 },
  settingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  settingDesc: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },

  // Message
  messageBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  messageText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  messageEditor: { marginTop: 4 },
  messageInput: {
    backgroundColor: COLORS.background, borderRadius: 12, padding: 14,
    fontSize: 14, color: COLORS.text, minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: COLORS.primary,
  },
  messageActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  msgCancelBtn: { padding: 10 },
  msgCancelText: { fontSize: 14, color: COLORS.textLight },
  msgSaveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10,
    marginLeft: 10,
  },
  msgSaveText: { fontSize: 14, fontWeight: '600', color: '#FFF' },

  // About
  aboutCard: { alignItems: 'center', paddingVertical: 12 },
  aboutTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  aboutVersion: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  aboutDesc: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', marginTop: 10, lineHeight: 19 },

  // Security Setup
  setupBtn: {
    backgroundColor: COLORS.primary + '15', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  setupBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  duressSetupBox: {
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: '#FFE0B2',
  },
  duressHint: { fontSize: 12, color: '#E65100', marginBottom: 10 },
  duressInput: {
    backgroundColor: '#FFF', borderRadius: 10, padding: 14, fontSize: 24,
    textAlign: 'center', letterSpacing: 12, borderWidth: 1, borderColor: '#FFE0B2',
    color: COLORS.text,
  },
  duressSaveBtn: {
    backgroundColor: '#FF6D00', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  duressSaveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});

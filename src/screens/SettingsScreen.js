/**
 * SettingsScreen v6.0 — Fully Functional AI-Powered Safety Settings
 *
 * All toggles are LIVE and wired to real services:
 *  - Shake-to-SOS (Accelerometer monitoring)
 *  - Scream / Loud Sound Detection (Audio metering AI)
 *  - Emergency Siren (Generated WAV alarm, max volume)
 *  - Auto Audio Recording (Evidence capture during SOS)
 *  - Auto Photo Capture (Camera burst on SOS)
 *  - Inactivity Auto-SOS (Timer + alert + auto-trigger)
 *  - Journey Alerts (Monitor & alert if overdue)
 *  - Stealth Calculator Mode (Disguise as calculator)
 *  - Biometric / Duress PIN / Panic Wipe
 *  - Offline SOS (SMS-based, no internet)
 *  - Auto Call Police (112 after SOS sends)
 *  - Real-time AI service status badges
 *  - Test buttons for siren & shake
 *  - v6.0: Background location, push notifications, volume SOS, live sharing
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity,
  TextInput, Platform, Alert, Animated, Vibration,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, SIZES, SHADOWS, useTheme } from '../constants/theme';
import { panicWipe } from '../utils/helpers';
import { getSupportedCountries } from '../constants/globalEmergencyNumbers';
import SafetyAIService from '../services/SafetyAIService';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const {
    settings, updateSettings, sosMessage, updateSOSMessage,
    stealthMode, toggleStealthMode, aiServiceStatus,
    isSOSActive, sirenActive, isRecording, checkIn, lastCheckIn,
    checkInOverdue, isBackgroundTracking, isLiveSharing, pushToken,
  } = useEmergency();
  const {
    biometricEnabled, toggleBiometric, hasDuressPin, setupDuressPin, lock,
    userProfile,
  } = useAuth();

  const [editingMessage, setEditingMessage] = useState(false);
  const [tempMessage, setTempMessage] = useState(sosMessage);
  const [duressInput, setDuressInput] = useState('');
  const [showDuressSetup, setShowDuressSetup] = useState(false);
  const [testingSiren, setTestingSiren] = useState(false);

  // Animations
  const headerAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    // Pulse animation for active indicators
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const toggleSetting = (key) => {
    const newVal = !settings[key];
    updateSettings({ [key]: newVal });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const handleTestSiren = async () => {
    if (testingSiren) {
      await SafetyAIService.stopSiren();
      setTestingSiren(false);
      return;
    }
    setTestingSiren(true);
    await SafetyAIService.startSiren();
    // Auto-stop after 3 seconds
    setTimeout(async () => {
      await SafetyAIService.stopSiren();
      setTestingSiren(false);
    }, 3000);
  };

  const handleCheckIn = () => {
    checkIn();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('✅ Checked In', 'Your safety check-in has been recorded.');
  };

  const countdownOptions = [3, 5, 10, 15];
  const inactivityOptions = [15, 30, 60, 120];
  const screamSensitivity = [
    { label: 'Low', value: 60, desc: 'Only very loud sounds' },
    { label: 'Medium', value: 80, desc: 'Balanced detection' },
    { label: 'High', value: 95, desc: 'Sensitive — may false trigger' },
  ];

  // ─── Status Badge Component ────────────────────────────────────
  const StatusBadge = ({ active, label, color }) => (
    <Animated.View style={[
      styles.statusBadge,
      active && { backgroundColor: (color || '#00C853') + '20', borderColor: color || '#00C853' },
      active && { transform: [{ scale: pulseAnim }] },
    ]}>
      <View style={[styles.statusDot, { backgroundColor: active ? (color || '#00C853') : '#CCC' }]} />
      <Text style={[styles.statusBadgeText, active && { color: color || '#00C853' }]}>
        {active ? label || 'ACTIVE' : 'OFF'}
      </Text>
    </Animated.View>
  );

  // ─── AI Status Card ────────────────────────────────────────────
  const AIStatusCard = () => {
    const activeCount = [
      settings.shakeToSOS,
      settings.screamDetection,
      settings.inactivitySOSEnabled,
      settings.journeyAlerts,
    ].filter(Boolean).length;

    return (
      <View style={styles.aiStatusCard}>
        <View style={styles.aiStatusHeader}>
          <View style={styles.aiIconWrap}>
            <MaterialCommunityIcons name="robot" size={26} color="#FFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.aiStatusTitle}>AI Safety Engine</Text>
            <Text style={styles.aiStatusSub}>
              {activeCount} of 4 AI services active
            </Text>
          </View>
          <View style={[styles.aiCountBadge, activeCount > 0 && styles.aiCountBadgeActive]}>
            <Text style={[styles.aiCountText, activeCount > 0 && { color: '#FFF' }]}>
              {activeCount}/4
            </Text>
          </View>
        </View>

        <View style={styles.aiGrid}>
          <View style={styles.aiGridItem}>
            <Ionicons name="phone-portrait" size={16}
              color={aiServiceStatus?.shake === 'active' ? '#00C853' : '#CCC'} />
            <Text style={styles.aiGridLabel}>Shake</Text>
            <Text style={[styles.aiGridStatus,
              aiServiceStatus?.shake === 'active' && { color: '#00C853' }]}>
              {aiServiceStatus?.shake === 'active' ? '● ON' : '○ Off'}
            </Text>
          </View>
          <View style={styles.aiGridItem}>
            <Ionicons name="ear" size={16}
              color={aiServiceStatus?.scream === 'active' ? '#FF6D00' : '#CCC'} />
            <Text style={styles.aiGridLabel}>Scream</Text>
            <Text style={[styles.aiGridStatus,
              aiServiceStatus?.scream === 'active' && { color: '#FF6D00' }]}>
              {aiServiceStatus?.scream === 'active' ? '● ON' : '○ Off'}
            </Text>
          </View>
          <View style={styles.aiGridItem}>
            <Ionicons name="volume-high" size={16}
              color={aiServiceStatus?.siren === 'playing' ? '#FF1744' : '#CCC'} />
            <Text style={styles.aiGridLabel}>Siren</Text>
            <Text style={[styles.aiGridStatus,
              aiServiceStatus?.siren === 'playing' && { color: '#FF1744' }]}>
              {aiServiceStatus?.siren === 'playing' ? '● LOUD' : '○ Ready'}
            </Text>
          </View>
          <View style={styles.aiGridItem}>
            <Ionicons name="mic" size={16}
              color={aiServiceStatus?.recording === 'active' ? '#C62828' : '#CCC'} />
            <Text style={styles.aiGridLabel}>Record</Text>
            <Text style={[styles.aiGridStatus,
              aiServiceStatus?.recording === 'active' && { color: '#C62828' }]}>
              {aiServiceStatus?.recording === 'active' ? '● REC' : '○ Standby'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── Section Component ─────────────────────────────────────────
  const Section = ({ icon, iconColor, title, desc, children }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: (iconColor || COLORS.primary) + '15' }]}>
          <Ionicons name={icon} size={20} color={iconColor || COLORS.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {desc ? <Text style={styles.sectionDesc}>{desc}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );

  // ─── Setting Row Component ─────────────────────────────────────
  const SettingRow = ({ icon, iconColor, label, desc, value, onToggle, badge, testBtn, onTest, last }) => (
    <View style={[styles.settingRow, last && { borderBottomWidth: 0 }]}>
      <View style={[styles.settingIcon, { backgroundColor: (iconColor || COLORS.primary) + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor || COLORS.primary} />
      </View>
      <View style={styles.settingInfo}>
        <View style={styles.settingLabelRow}>
          <Text style={styles.settingLabel}>{label}</Text>
          {badge && <StatusBadge active={value} label={badge} color={iconColor} />}
        </View>
        <Text style={styles.settingDesc}>{desc}</Text>
        {testBtn && value && (
          <TouchableOpacity style={styles.testBtn} onPress={onTest} activeOpacity={0.7}>
            <Ionicons name="play-circle" size={14} color={COLORS.primary} />
            <Text style={styles.testBtnText}>{testBtn}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Switch
        value={value || false}
        onValueChange={onToggle}
        trackColor={{ false: '#E0E0E0', true: (iconColor || COLORS.primary) + '60' }}
        thumbColor={value ? (iconColor || COLORS.primary) : '#F5F5F5'}
      />
    </View>
  );

  // ─── Nav Row Component ─────────────────────────────────────────
  const NavRow = ({ icon, iconColor, label, desc, screen, last }) => (
    <TouchableOpacity
      style={[styles.settingRow, last && { borderBottomWidth: 0 }]}
      onPress={() => navigation.navigate(screen)}
      activeOpacity={0.7}
    >
      <View style={[styles.settingIcon, { backgroundColor: (iconColor || COLORS.primary) + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor || COLORS.primary} />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
    </TouchableOpacity>
  );

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>Safety Feature Control Center</Text>
        </View>
        {isSOSActive && (
          <Animated.View style={[styles.sosActiveBadge, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.sosActiveDot} />
            <Text style={styles.sosActiveText}>SOS</Text>
          </Animated.View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI Status Card */}
        <AIStatusCard />

        {/* Stealth Calculator Mode */}
        <TouchableOpacity style={styles.stealthCard} onPress={toggleStealthMode} activeOpacity={0.8}>
          <View style={styles.stealthRow}>
            <View style={[styles.stealthIcon, stealthMode && styles.stealthIconActive]}>
              <Ionicons name="calculator" size={26} color={stealthMode ? '#FFF' : '#9C27B0'} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.stealthLabel}>Stealth Calculator Mode</Text>
                <StatusBadge active={stealthMode} label="STEALTH" color="#9C27B0" />
              </View>
              <Text style={styles.stealthDesc}>
                Disguise app as calculator. Type 112 + = to trigger silent SOS
              </Text>
            </View>
            <Switch
              value={stealthMode}
              onValueChange={toggleStealthMode}
              trackColor={{ false: '#E0E0E0', true: '#CE93D8' }}
              thumbColor={stealthMode ? '#9C27B0' : '#F5F5F5'}
            />
          </View>
        </TouchableOpacity>

        {/* ─── v6.0 Advanced Services ─── */}
        <Section icon="rocket" iconColor="#00BFA5" title="v6.0 Advanced Services"
          desc="Background tracking, push alerts, live sharing">

          <SettingRow
            icon="navigate-circle" iconColor="#00BFA5"
            label="Background Location" desc="Track location even when app is closed (for SOS accuracy)"
            value={settings.backgroundLocationEnabled} onToggle={() => toggleSetting('backgroundLocationEnabled')}
            badge={isBackgroundTracking ? 'TRACKING' : 'OFF'}
          />
          <SettingRow
            icon="notifications" iconColor="#FF6D00"
            label="Push Notifications" desc="Receive safety alerts and send SOS push to contacts"
            value={settings.pushNotifications} onToggle={() => toggleSetting('pushNotifications')}
            badge={pushToken ? 'REGISTERED' : 'OFF'}
          />
          <SettingRow
            icon="volume-high" iconColor="#D50000"
            label="Volume Button SOS" desc="Press volume 5 times rapidly to trigger silent SOS"
            value={settings.volumeButtonSOS} onToggle={() => toggleSetting('volumeButtonSOS')}
            badge="ARMED"
          />
          <SettingRow
            icon="link" iconColor="#1565C0"
            label="Live Location Sharing" desc="Generate shareable URL during SOS for contacts without the app"
            value={settings.liveLocationSharing} onToggle={() => toggleSetting('liveLocationSharing')}
            badge={isLiveSharing ? 'SHARING' : 'READY'}
          />
          <SettingRow
            icon="alert-circle" iconColor="#9C27B0"
            label="Persistent SOS Notification" desc="Show quick-tap SOS button in notification tray"
            value={settings.persistentSOSNotification} onToggle={() => toggleSetting('persistentSOSNotification')}
            badge="TRAY"
          />

          {/* Country Picker */}
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: '#00695C15' }]}>
              <Ionicons name="globe" size={20} color="#00695C" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Emergency Country</Text>
              <Text style={styles.settingDesc}>
                {settings.countryOverride ? `Override: ${settings.countryOverride}` : 'Auto-detect from device locale'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.setupBtn}
              onPress={() => {
                const countries = getSupportedCountries();
                const options = countries.map(c => ({ text: `${c.flag} ${c.name}`, onPress: () => updateSettings({ countryOverride: c.code }) }));
                Alert.alert(
                  '🌍 Select Country',
                  'Choose your country for emergency numbers',
                  [
                    { text: '📱 Auto-Detect', onPress: () => updateSettings({ countryOverride: null }) },
                    ...options.slice(0, 8),
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Text style={styles.setupBtnText}>
                {settings.countryOverride || 'Auto'}
              </Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* ─── SOS Trigger Settings ─── */}
        <Section icon="warning" iconColor="#FF1744" title="SOS Trigger Settings"
          desc="How and when SOS activates">

          <SettingRow
            icon="phone-portrait" iconColor="#E91E63"
            label="Shake to SOS" desc="Shake phone 3 times rapidly to trigger SOS"
            value={settings.shakeToSOS} onToggle={() => toggleSetting('shakeToSOS')}
            badge="MONITORING"
            testBtn="Shake now to test"
            onTest={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Alert.alert('📱 Shake Test', 'Shake your phone 3 times rapidly within 2 seconds to test.');
            }}
          />
          <SettingRow
            icon="call" iconColor="#4CAF50"
            label="Auto Call Police (112)" desc="Automatically call 112 emergency number during SOS"
            value={settings.autoCallPolice} onToggle={() => toggleSetting('autoCallPolice')}
            badge="ARMED"
          />
          <SettingRow
            icon="location" iconColor="#1565C0"
            label="Auto Share Location" desc="Send GPS coordinates to emergency contacts via SMS"
            value={settings.autoLocationShare} onToggle={() => toggleSetting('autoLocationShare')}
            badge="GPS"
          />
          <SettingRow
            icon="cloud-offline" iconColor="#37474F"
            label="Offline SOS" desc="Send SMS-based SOS without internet connection"
            value={settings.offlineSOS} onToggle={() => toggleSetting('offlineSOS')}
            badge="SMS" last
          />
        </Section>

        {/* ─── Alarm & Evidence ─── */}
        <Section icon="volume-high" iconColor="#C62828" title="Alarm & Evidence Collection"
          desc="Activated automatically during SOS">

          <SettingRow
            icon="volume-high" iconColor="#FF1744"
            label="Emergency Siren" desc="Emit maximum-volume alarm tone + vibration during SOS"
            value={settings.sirenEnabled} onToggle={() => toggleSetting('sirenEnabled')}
            badge={sirenActive ? 'BLARING' : 'ARMED'}
            testBtn={testingSiren ? '⏹ Stop Test' : '▶ Test Siren (3s)'}
            onTest={handleTestSiren}
          />
          <SettingRow
            icon="mic" iconColor="#C62828"
            label="Auto Record Audio" desc="Capture ambient audio evidence during SOS"
            value={settings.autoRecordAudio} onToggle={() => toggleSetting('autoRecordAudio')}
            badge={isRecording ? 'REC ●' : 'STANDBY'}
          />
          <SettingRow
            icon="camera" iconColor="#6200EA"
            label="Auto Photo Capture" desc="Silently capture camera photos during SOS"
            value={settings.autoPhotoCapture} onToggle={() => toggleSetting('autoPhotoCapture')}
            badge="READY" last
          />
        </Section>

        {/* ─── AI Smart Detection ─── */}
        <Section icon="flash" iconColor="#FF6D00" title="AI Smart Detection"
          desc="AI monitors for danger automatically">

          <SettingRow
            icon="ear" iconColor="#FF6D00"
            label="Scream / Loud Sound Detection"
            desc="AI analyzes ambient audio for screams or aggressive sounds and prompts SOS"
            value={settings.screamDetection} onToggle={() => toggleSetting('screamDetection')}
            badge="AI LISTENING"
          />

          {/* Scream sensitivity selector */}
          {settings.screamDetection && (
            <View style={styles.subSetting}>
              <Text style={styles.subSettingLabel}>Detection Sensitivity</Text>
              <View style={styles.sensitivityRow}>
                {screamSensitivity.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.sensitivityBtn,
                      settings.screamThreshold === opt.value && styles.sensitivityBtnActive,
                    ]}
                    onPress={() => updateSettings({ screamThreshold: opt.value })}
                  >
                    <Text style={[
                      styles.sensitivityBtnText,
                      settings.screamThreshold === opt.value && styles.sensitivityBtnTextActive,
                    ]}>{opt.label}</Text>
                    <Text style={[
                      styles.sensitivityBtnDesc,
                      settings.screamThreshold === opt.value && { color: 'rgba(255,255,255,0.7)' },
                    ]}>{opt.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <SettingRow
            icon="timer" iconColor="#D84315"
            label="Auto-SOS on Inactivity"
            desc="Alert if you don't check in within set time, then auto-trigger SOS"
            value={settings.inactivitySOSEnabled} onToggle={() => toggleSetting('inactivitySOSEnabled')}
            badge="WATCHING"
          />

          {/* Inactivity timer config */}
          {settings.inactivitySOSEnabled && (
            <View style={styles.subSetting}>
              <Text style={styles.subSettingLabel}>Check-in Timeout</Text>
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

              {/* Check-in button */}
              <TouchableOpacity
                style={[styles.checkInBtn, checkInOverdue && styles.checkInBtnOverdue]}
                onPress={handleCheckIn}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark" size={18}
                  color={checkInOverdue ? '#FFF' : '#4CAF50'} />
                <Text style={[styles.checkInText, checkInOverdue && { color: '#FFF' }]}>
                  {checkInOverdue ? '⚠️ OVERDUE — Tap to Check In' : '✓ Check In Now'}
                </Text>
                <Text style={[styles.checkInSub, checkInOverdue && { color: 'rgba(255,255,255,0.7)' }]}>
                  Last: {lastCheckIn ? new Date(lastCheckIn).toLocaleTimeString() : 'Never'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <SettingRow
            icon="navigate" iconColor="#1565C0"
            label="Journey Alerts" desc="Monitor trips and alert contacts if you're overdue"
            value={settings.journeyAlerts} onToggle={() => toggleSetting('journeyAlerts')}
            badge="TRACKING"
          />
          <SettingRow
            icon="eye-off" iconColor="#37474F"
            label="Hidden Background Mode" desc="App works silently in background without notification"
            value={settings.hiddenMode} onToggle={() => toggleSetting('hiddenMode')}
            badge="HIDDEN" last
          />
        </Section>

        {/* ─── SOS Countdown Timer ─── */}
        <Section icon="hourglass" iconColor="#9C27B0" title="SOS Countdown Timer"
          desc="Delay before SOS activates (cancel window)">
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
          <Text style={styles.countdownHint}>
            After pressing SOS, you have {settings.countdownSeconds || 5} seconds to cancel before alerts send.
          </Text>
        </Section>

        {/* ─── Security & Authentication ─── */}
        <Section icon="shield-checkmark" iconColor="#6200EA" title="Security & Authentication"
          desc="Protect access to your safety app">

          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: '#6200EA15' }]}>
              <Ionicons name="finger-print" size={20} color="#6200EA" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Biometric Unlock</Text>
              <Text style={styles.settingDesc}>Use fingerprint or face ID to unlock</Text>
            </View>
            <Switch
              value={biometricEnabled || false}
              onValueChange={(val) => { toggleBiometric(val); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              trackColor={{ false: '#E0E0E0', true: '#6200EA60' }}
              thumbColor={biometricEnabled ? '#6200EA' : '#F5F5F5'}
            />
          </View>

          {/* Duress PIN */}
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: '#FF6D0015' }]}>
              <Ionicons name="warning" size={20} color="#FF6D00" />
            </View>
            <View style={styles.settingInfo}>
              <View style={styles.settingLabelRow}>
                <Text style={styles.settingLabel}>Duress PIN</Text>
                {hasDuressPin && <StatusBadge active={true} label="SET" color="#FF6D00" />}
              </View>
              <Text style={styles.settingDesc}>
                {hasDuressPin
                  ? 'Active — Entering this PIN triggers silent SOS while appearing to unlock normally'
                  : 'Set a secret PIN that triggers SOS when forced to unlock'}
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
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('✅ Duress PIN Set', 'Entering this PIN on the lock screen will silently trigger SOS while appearing to unlock normally.');
                  } else {
                    Alert.alert('Error', 'PIN must be exactly 4 digits.');
                  }
                }}
              >
                <Text style={styles.duressSaveBtnText}>Save Duress PIN</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Panic Wipe */}
          <TouchableOpacity style={styles.settingRow} onPress={handlePanicWipe} activeOpacity={0.7}>
            <View style={[styles.settingIcon, { backgroundColor: '#FF174415' }]}>
              <Ionicons name="trash" size={20} color="#FF1744" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: '#FF1744' }]}>Panic Wipe</Text>
              <Text style={styles.settingDesc}>Instantly erase ALL app data if phone is taken</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FF1744" />
          </TouchableOpacity>

          {/* Lock App */}
          <TouchableOpacity
            style={[styles.settingRow, { borderBottomWidth: 0 }]}
            onPress={() => { lock(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#E91E6315' }]}>
              <Ionicons name="lock-closed" size={20} color="#E91E63" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Lock App Now</Text>
              <Text style={styles.settingDesc}>Return to PIN screen immediately</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        </Section>

        {/* ─── SOS Message ─── */}
        <Section icon="chatbubble-ellipses" iconColor="#00838F" title="SOS Emergency Message"
          desc="This message is sent to emergency contacts during SOS">

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
              <Text style={styles.charCount}>{tempMessage.length}/300</Text>
              <View style={styles.messageActions}>
                <TouchableOpacity
                  style={styles.msgCancelBtn}
                  onPress={() => { setTempMessage(sosMessage); setEditingMessage(false); }}
                >
                  <Text style={styles.msgCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.msgSaveBtn} onPress={saveMessage}>
                  <Ionicons name="checkmark" size={16} color="#FFF" />
                  <Text style={styles.msgSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.messageBox} onPress={() => setEditingMessage(true)} activeOpacity={0.7}>
              <Text style={styles.messageText} numberOfLines={3}>{sosMessage}</Text>
              <View style={styles.editBadge}>
                <Ionicons name="pencil" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.messageInfo}>
            <Ionicons name="information-circle" size={14} color={COLORS.textLight} />
            <Text style={styles.messageInfoText}>
              This message is sent via SMS to all your emergency contacts. GPS coordinates are automatically appended.
            </Text>
          </View>
        </Section>

        {/* ─── Quick Navigation ─── */}
        <Section icon="grid" iconColor="#1565C0" title="Quick Navigation"
          desc="Access other safety features">

          <NavRow icon="person-circle" iconColor="#6200EA" label="Safety Profile"
            desc="Medical ID, addresses, vehicle info" screen="Profile" />
          <NavRow icon="lock-closed" iconColor="#37474F" label="Evidence Vault"
            desc="Tamper-proof evidence logs & recordings" screen="EvidenceVault" />
          <NavRow icon="locate" iconColor="#00838F" label="Guardian Mode"
            desc="Geofence zones & periodic check-in" screen="GuardianMode" />
          <NavRow icon="navigate" iconColor="#1565C0" label="Journey Tracker"
            desc="Trip monitoring & overdue auto-alerts" screen="JourneyTracker" />
          <NavRow icon="document-text" iconColor="#4E342E" label="Incident Report"
            desc="Generate police-ready reports with AI" screen="IncidentReport" />
          <NavRow icon="people" iconColor="#C62828" label="Nearby Help"
            desc="SOS alerts to nearby app users" screen="NearbyHelp" last />
        </Section>

        {/* ─── About ─── */}
        <View style={styles.aboutCard}>
          <View style={styles.aboutIcon}>
            <MaterialCommunityIcons name="shield-check" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.aboutTitle}>SafeHer</Text>
          <Text style={styles.aboutVersion}>Version 6.0 — AI-Powered Safety Ecosystem</Text>
          <Text style={styles.aboutDesc}>
            Shake detection • Scream AI • Emergency siren • Evidence recording •{'\n'}
            Live GPS tracking • Journey monitor • Stealth calculator •{'\n'}
            Panic wipe • Biometric auth • Offline SOS • Duress PIN •{'\n'}
            Background location • Push notifications • Live sharing
          </Text>

          <View style={styles.aboutFeatures}>
            {[
              { icon: 'flash', label: 'AI Engine', color: '#FF6D00' },
              { icon: 'shield-checkmark', label: 'End-to-End', color: '#00C853' },
              { icon: 'cloud-offline', label: 'Works Offline', color: '#1565C0' },
              { icon: 'lock-closed', label: 'Privacy First', color: '#6200EA' },
            ].map((f, i) => (
              <View key={i} style={styles.aboutFeatureItem}>
                <Ionicons name={f.icon} size={16} color={f.color} />
                <Text style={styles.aboutFeatureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 18,
    backgroundColor: COLORS.primaryDark,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  sosActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF1744', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  sosActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  sosActiveText: { fontSize: 11, fontWeight: '900', color: '#FFF' },

  content: { padding: 16 },

  // AI Status Card
  aiStatusCard: {
    backgroundColor: '#1A1A2E', borderRadius: 22, padding: 18,
    marginBottom: 16, ...SHADOWS.medium,
  },
  aiStatusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  aiIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  aiStatusTitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  aiStatusSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  aiCountBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  aiCountBadgeActive: { backgroundColor: '#00C853' },
  aiCountText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  aiGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  aiGridItem: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 3,
  },
  aiGridLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  aiGridStatus: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.3)' },

  // Stealth Mode
  stealthCard: {
    backgroundColor: '#F3E5F5', borderRadius: 20, padding: 16, marginBottom: 16,
    borderWidth: 2, borderColor: '#CE93D8',
  },
  stealthRow: { flexDirection: 'row', alignItems: 'center' },
  stealthIcon: {
    width: 50, height: 50, borderRadius: 16, backgroundColor: '#E1BEE7',
    alignItems: 'center', justifyContent: 'center',
  },
  stealthIconActive: { backgroundColor: '#9C27B0' },
  stealthLabel: { fontSize: 15, fontWeight: '800', color: '#4A148C' },
  stealthDesc: { fontSize: 11, color: '#7B1FA2', marginTop: 4, lineHeight: 16 },

  // Status Badge
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 8, fontWeight: '900', color: '#999', letterSpacing: 0.5 },

  // Section
  section: {
    backgroundColor: COLORS.surface, borderRadius: 22, padding: 18,
    marginBottom: 16, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sectionDesc: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },

  // Setting Row
  settingRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  settingIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  settingInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  settingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  settingLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  settingDesc: { fontSize: 11, color: COLORS.textLight, marginTop: 2, lineHeight: 16 },

  // Test Button
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: COLORS.primary + '10', borderRadius: 8,
    alignSelf: 'flex-start',
  },
  testBtnText: { fontSize: 10, fontWeight: '700', color: COLORS.primary },

  // Sub-setting
  subSetting: {
    marginLeft: 50, marginBottom: 12, paddingTop: 4,
  },
  subSettingLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },

  // Sensitivity
  sensitivityRow: { flexDirection: 'row', gap: 8 },
  sensitivityBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center',
  },
  sensitivityBtnActive: { backgroundColor: '#FF6D00', borderColor: '#FF6D00' },
  sensitivityBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  sensitivityBtnTextActive: { color: '#FFF' },
  sensitivityBtnDesc: { fontSize: 8, color: COLORS.textLight, marginTop: 2, textAlign: 'center' },

  // Countdown
  countdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  countdownBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 14,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  countdownBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  countdownBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  countdownBtnTextActive: { color: '#FFF' },
  countdownHint: { fontSize: 11, color: COLORS.textLight, marginTop: 10, textAlign: 'center' },

  // Check-in
  checkInBtn: {
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: '#E8F5E9', borderWidth: 1.5, borderColor: '#A5D6A7',
    alignItems: 'center',
  },
  checkInBtnOverdue: { backgroundColor: '#FF1744', borderColor: '#FF1744' },
  checkInText: { fontSize: 14, fontWeight: '700', color: '#4CAF50' },
  checkInSub: { fontSize: 10, color: '#81C784', marginTop: 3 },

  // Message
  messageBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  messageText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 18 },
  editBadge: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
  },
  messageEditor: { marginTop: 4 },
  messageInput: {
    backgroundColor: COLORS.background, borderRadius: 14, padding: 14,
    fontSize: 14, color: COLORS.text, minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  charCount: { fontSize: 10, color: COLORS.textLight, textAlign: 'right', marginTop: 4 },
  messageActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 8 },
  msgCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  msgCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textLight },
  msgSaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  msgSaveText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  messageInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 10, paddingHorizontal: 4,
  },
  messageInfoText: { flex: 1, fontSize: 10, color: COLORS.textLight, lineHeight: 14 },

  // Security Setup
  setupBtn: {
    backgroundColor: COLORS.primary + '15', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  setupBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  duressSetupBox: {
    backgroundColor: '#FFF3E0', borderRadius: 16, padding: 16, marginBottom: 8,
    marginLeft: 50, borderWidth: 1, borderColor: '#FFE0B2',
  },
  duressHint: { fontSize: 12, color: '#E65100', marginBottom: 10, lineHeight: 17 },
  duressInput: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 24,
    textAlign: 'center', letterSpacing: 12, borderWidth: 1.5, borderColor: '#FFE0B2',
    color: COLORS.text,
  },
  duressSaveBtn: {
    backgroundColor: '#FF6D00', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 12,
  },
  duressSaveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // About
  aboutCard: {
    backgroundColor: COLORS.surface, borderRadius: 22, padding: 24,
    alignItems: 'center', ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  aboutIcon: {
    width: 60, height: 60, borderRadius: 20,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  aboutTitle: { fontSize: 22, fontWeight: '900', color: COLORS.primary },
  aboutVersion: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  aboutDesc: {
    fontSize: 11, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 12, lineHeight: 18,
  },
  aboutFeatures: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, marginTop: 16,
  },
  aboutFeatureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  aboutFeatureLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
});

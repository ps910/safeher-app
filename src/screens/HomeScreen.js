/**
 * Home Screen - Main dashboard with SOS button and quick actions
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Vibration,
  Alert,
  Dimensions,
} from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';
import {
  makePhoneCall,
  sendSOSToContacts,
  EMERGENCY_NUMBERS,
  requestLocationPermission,
} from '../utils/helpers';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const {
    emergencyContacts,
    sosMessage,
    settings,
    isSOSActive,
    triggerSOS,
    cancelSOS,
    currentLocation,
  } = useEmergency();

  const [countdown, setCountdown] = useState(null);
  const pulseAnim = new Animated.Value(1);
  const shakeAnim = new Animated.Value(0);

  // SOS button pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Request permissions on mount
  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Countdown logic for SOS
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      executeEmergency();
      setCountdown(null);
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSOSPress = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    if (countdown !== null) {
      // Cancel countdown
      setCountdown(null);
      cancelSOS();
      return;
    }
    setCountdown(settings.countdownSeconds);
    triggerSOS();
  };

  const executeEmergency = () => {
    if (emergencyContacts.length === 0) {
      Alert.alert(
        '⚠️ No Emergency Contacts',
        'Please add emergency contacts first to use SOS.',
        [
          { text: 'Add Contacts', onPress: () => navigation.navigate('Contacts') },
          { text: 'Call Police', onPress: () => makePhoneCall(EMERGENCY_NUMBERS.police) },
        ]
      );
      cancelSOS();
      return;
    }

    // Send SMS to all emergency contacts
    sendSOSToContacts(emergencyContacts, sosMessage, currentLocation);

    // Vibrate pattern for emergency
    Vibration.vibrate([0, 500, 200, 500, 200, 500], true);

    Alert.alert(
      '🆘 SOS Activated!',
      'Emergency alerts have been sent to all your contacts with your location.',
      [
        {
          text: 'Call Police (100)',
          onPress: () => {
            Vibration.cancel();
            makePhoneCall(EMERGENCY_NUMBERS.police);
          },
        },
        {
          text: 'Stop Alert',
          style: 'cancel',
          onPress: () => {
            Vibration.cancel();
            cancelSOS();
          },
        },
      ]
    );
  };

  const QuickAction = ({ icon, label, color, onPress }) => (
    <TouchableOpacity style={[styles.quickAction, SHADOWS.medium]} onPress={onPress}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>
        <Text style={[styles.quickActionEmoji]}>{icon}</Text>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const EmergencyNumberCard = ({ name, number, icon }) => (
    <TouchableOpacity
      style={[styles.emergencyCard, SHADOWS.small]}
      onPress={() => makePhoneCall(number)}
    >
      <Text style={styles.emergencyIcon}>{icon}</Text>
      <View style={styles.emergencyInfo}>
        <Text style={styles.emergencyName}>{name}</Text>
        <Text style={styles.emergencyNumber}>{number}</Text>
      </View>
      <Text style={styles.callIcon}>📞</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>👩‍🦰 Girl Safety</Text>
          <Text style={styles.headerSubtitle}>Your safety, our priority</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* SOS Button */}
        <View style={styles.sosSection}>
          <Text style={styles.sosLabel}>
            {countdown !== null
              ? `SOS in ${countdown}s - Tap to Cancel`
              : 'Press & Hold for Emergency'}
          </Text>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                styles.sosButton,
                countdown !== null && styles.sosButtonActive,
                SHADOWS.large,
              ]}
              onPress={handleSOSPress}
              activeOpacity={0.8}
            >
              <Text style={styles.sosButtonText}>
                {countdown !== null ? countdown : 'SOS'}
              </Text>
              <Text style={styles.sosButtonSubtext}>
                {countdown !== null ? 'TAP TO CANCEL' : 'EMERGENCY'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.sosHint}>
            {emergencyContacts.length > 0
              ? `✅ ${emergencyContacts.length} emergency contact(s) set`
              : '⚠️ Add emergency contacts to enable SOS'}
          </Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            icon="📞"
            label="Fake Call"
            color={COLORS.secondary}
            onPress={() => navigation.navigate('FakeCall')}
          />
          <QuickAction
            icon="📍"
            label="Share Location"
            color={COLORS.success}
            onPress={() => navigation.navigate('Location')}
          />
          <QuickAction
            icon="👥"
            label="Contacts"
            color={COLORS.primary}
            onPress={() => navigation.navigate('Contacts')}
          />
          <QuickAction
            icon="📖"
            label="Safety Tips"
            color={COLORS.warning}
            onPress={() => navigation.navigate('SafetyTips')}
          />
        </View>

        {/* Emergency Helplines */}
        <Text style={styles.sectionTitle}>🚨 Emergency Helplines</Text>
        <EmergencyNumberCard
          name="Police"
          number={EMERGENCY_NUMBERS.police}
          icon="🚔"
        />
        <EmergencyNumberCard
          name="Women Helpline"
          number={EMERGENCY_NUMBERS.womenHelpline}
          icon="👩"
        />
        <EmergencyNumberCard
          name="Ambulance"
          number={EMERGENCY_NUMBERS.ambulance}
          icon="🚑"
        />
        <EmergencyNumberCard
          name="National Emergency"
          number={EMERGENCY_NUMBERS.nationalEmergency}
          icon="🆘"
        />
        <EmergencyNumberCard
          name="Child Helpline"
          number={EMERGENCY_NUMBERS.childHelpline}
          icon="👧"
        />

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SIZES.lg,
    paddingTop: SIZES.xl + 10,
    paddingBottom: SIZES.lg,
    borderBottomLeftRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: SIZES.h2,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: SIZES.body,
    color: COLORS.primaryLight,
    marginTop: 2,
  },
  settingsBtn: {
    padding: SIZES.sm,
  },
  settingsIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SIZES.md,
  },
  sosSection: {
    alignItems: 'center',
    paddingVertical: SIZES.xl,
  },
  sosLabel: {
    fontSize: SIZES.body,
    color: COLORS.textSecondary,
    marginBottom: SIZES.md,
    fontWeight: '600',
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.danger,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 6,
    borderColor: COLORS.dangerLight,
  },
  sosButtonActive: {
    backgroundColor: '#FF6D00',
    borderColor: '#FFAB40',
  },
  sosButtonText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  sosButtonSubtext: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 1,
  },
  sosHint: {
    marginTop: SIZES.md,
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SIZES.lg,
    marginBottom: SIZES.md,
    marginLeft: SIZES.xs,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickAction: {
    width: (width - SIZES.md * 2 - SIZES.sm) / 2,
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  quickActionEmoji: {
    fontSize: 28,
  },
  quickActionLabel: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  emergencyCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  emergencyIcon: {
    fontSize: 28,
    marginRight: SIZES.md,
  },
  emergencyInfo: {
    flex: 1,
  },
  emergencyName: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  emergencyNumber: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 2,
  },
  callIcon: {
    fontSize: 24,
  },
  bottomPadding: {
    height: 100,
  },
});

export default HomeScreen;

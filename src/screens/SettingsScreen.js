/**
 * Settings Screen - App configuration and preferences
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  StatusBar,
} from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';

const SettingsScreen = ({ navigation }) => {
  const { settings, updateSettings, sosMessage, updateSOSMessage } = useEmergency();
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageText, setMessageText] = useState(sosMessage);

  const handleToggle = (key) => {
    updateSettings({ [key]: !settings[key] });
  };

  const handleSaveMessage = () => {
    if (messageText.trim()) {
      updateSOSMessage(messageText.trim());
      setEditingMessage(false);
      Alert.alert('✅ Saved', 'SOS message has been updated.');
    }
  };

  const SettingToggle = ({ icon, title, subtitle, value, onToggle }) => (
    <View style={[styles.settingItem, SHADOWS.small]}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : '#ccc'}
      />
    </View>
  );

  const CountdownOption = ({ seconds, isSelected }) => (
    <TouchableOpacity
      style={[
        styles.countdownOption,
        isSelected && styles.countdownOptionActive,
      ]}
      onPress={() => updateSettings({ countdownSeconds: seconds })}
    >
      <Text
        style={[
          styles.countdownText,
          isSelected && styles.countdownTextActive,
        ]}
      >
        {seconds}s
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.text} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* SOS Settings */}
        <Text style={styles.sectionTitle}>🆘 SOS Settings</Text>

        <SettingToggle
          icon="📳"
          title="Shake to SOS"
          subtitle="Shake your phone vigorously to trigger SOS"
          value={settings.shakeToSOS}
          onToggle={() => handleToggle('shakeToSOS')}
        />

        <SettingToggle
          icon="📍"
          title="Auto Location Share"
          subtitle="Automatically share location with SOS alert"
          value={settings.autoLocationShare}
          onToggle={() => handleToggle('autoLocationShare')}
        />

        <SettingToggle
          icon="🔊"
          title="SOS Siren"
          subtitle="Play loud siren sound when SOS is triggered"
          value={settings.sirenEnabled}
          onToggle={() => handleToggle('sirenEnabled')}
        />

        <SettingToggle
          icon="📞"
          title="Auto Call Police"
          subtitle="Automatically call 100 after SOS countdown"
          value={settings.autoCallPolice}
          onToggle={() => handleToggle('autoCallPolice')}
        />

        {/* Countdown Timer */}
        <Text style={styles.sectionTitle}>⏱️ SOS Countdown</Text>
        <View style={[styles.countdownCard, SHADOWS.small]}>
          <Text style={styles.countdownLabel}>
            Time before SOS activates after pressing the button:
          </Text>
          <View style={styles.countdownRow}>
            {[3, 5, 10, 15].map((sec) => (
              <CountdownOption
                key={sec}
                seconds={sec}
                isSelected={settings.countdownSeconds === sec}
              />
            ))}
          </View>
        </View>

        {/* SOS Message */}
        <Text style={styles.sectionTitle}>💬 SOS Message</Text>
        <View style={[styles.messageCard, SHADOWS.small]}>
          <Text style={styles.messageLabel}>
            This message will be sent to your emergency contacts:
          </Text>
          {editingMessage ? (
            <>
              <TextInput
                style={styles.messageInput}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                numberOfLines={4}
                placeholder="Type your emergency message..."
                placeholderTextColor={COLORS.textLight}
              />
              <View style={styles.messageButtons}>
                <TouchableOpacity
                  style={styles.cancelMsgBtn}
                  onPress={() => {
                    setMessageText(sosMessage);
                    setEditingMessage(false);
                  }}
                >
                  <Text style={styles.cancelMsgText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveMsgBtn}
                  onPress={handleSaveMessage}
                >
                  <Text style={styles.saveMsgText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.messagePreview}>{sosMessage}</Text>
              <TouchableOpacity
                style={styles.editMsgBtn}
                onPress={() => setEditingMessage(true)}
              >
                <Text style={styles.editMsgText}>✏️ Edit Message</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* About Section */}
        <Text style={styles.sectionTitle}>ℹ️ About</Text>
        <View style={[styles.aboutCard, SHADOWS.small]}>
          <Text style={styles.appName}>👩‍🦰 Girl Safety App</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.aboutText}>
            Designed to help women and girls stay safe with emergency SOS,
            location sharing, fake calls, and safety education.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.aboutText}>
            🚨 In an emergency, always call:{'\n'}
            📞 Police: 100{'\n'}
            📞 Women Helpline: 1091{'\n'}
            📞 National Emergency: 112
          </Text>
        </View>

        <View style={{ height: 100 }} />
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
    backgroundColor: COLORS.text,
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.xl + 10,
    paddingBottom: SIZES.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
  },
  backBtn: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: '600',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: SIZES.h3,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SIZES.md,
  },
  sectionTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SIZES.lg,
    marginBottom: SIZES.md,
  },
  settingItem: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  settingIcon: {
    fontSize: 24,
    marginRight: SIZES.md,
  },
  settingInfo: {
    flex: 1,
    marginRight: SIZES.sm,
  },
  settingTitle: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingSubtitle: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countdownCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
  },
  countdownLabel: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginBottom: SIZES.md,
  },
  countdownRow: {
    flexDirection: 'row',
    gap: SIZES.sm,
  },
  countdownOption: {
    flex: 1,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  countdownOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight + '40',
  },
  countdownText: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  countdownTextActive: {
    color: COLORS.primary,
  },
  messageCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
  },
  messageLabel: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginBottom: SIZES.sm,
  },
  messagePreview: {
    fontSize: SIZES.body,
    color: COLORS.text,
    lineHeight: 22,
    backgroundColor: COLORS.background,
    padding: SIZES.md,
    borderRadius: SIZES.radiusSm,
    marginBottom: SIZES.sm,
  },
  editMsgBtn: {
    alignSelf: 'flex-end',
    paddingVertical: SIZES.xs,
    paddingHorizontal: SIZES.md,
  },
  editMsgText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: SIZES.body,
  },
  messageInput: {
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusSm,
    padding: SIZES.md,
    fontSize: SIZES.body,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: SIZES.sm,
  },
  messageButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SIZES.sm,
  },
  cancelMsgBtn: {
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelMsgText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  saveMsgBtn: {
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primary,
  },
  saveMsgText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  aboutCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    alignItems: 'center',
  },
  appName: {
    fontSize: SIZES.h3,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SIZES.xs,
  },
  appVersion: {
    fontSize: SIZES.small,
    color: COLORS.textLight,
    marginBottom: SIZES.md,
  },
  aboutText: {
    fontSize: SIZES.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SIZES.md,
  },
});

export default SettingsScreen;

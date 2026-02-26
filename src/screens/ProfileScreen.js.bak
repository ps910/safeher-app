/**
 * ProfileScreen - Comprehensive Safety Profile / Digital Medical & Safety ID
 * Fields: Basic ID, Medical Info (blood group, allergies, conditions, meds),
 *         Location Hubs (home/work/college), Vehicle Details
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../constants/theme';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Female', 'Male', 'Non-Binary', 'Prefer not to say'];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { userProfile, updateProfile } = useAuth();
  const [profile, setProfile] = useState({ ...userProfile });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!profile.fullName || !profile.fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    await updateProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    Alert.alert('✅ Profile Saved', 'Your safety profile has been updated.');
  };

  const updateField = (key, value) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const Section = ({ icon, title, subtitle, children }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={22} color={COLORS.primary} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );

  const Field = ({ label, value, onChangeText, placeholder, keyboardType, multiline }) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety Profile</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn}>
          <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={20} color="#1565C0" />
            <Text style={styles.infoText}>
              This is your Digital Safety ID. First responders and emergency contacts can use this information to help you faster.
            </Text>
          </View>

          {/* Basic Identification */}
          <Section icon="person" title="Basic Identification" subtitle="Helps authorities identify you">
            <Field
              label="Full Name *"
              value={profile.fullName}
              onChangeText={(v) => updateField('fullName', v)}
              placeholder="Your full name"
            />
            <Field
              label="Phone Number"
              value={profile.phone}
              onChangeText={(v) => updateField('phone', v)}
              placeholder="Your phone number"
              keyboardType="phone-pad"
            />
            <Field
              label="Date of Birth"
              value={profile.dateOfBirth}
              onChangeText={(v) => updateField('dateOfBirth', v)}
              placeholder="DD/MM/YYYY"
            />
            {/* Gender selector */}
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.chipRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, profile.gender === g && styles.chipActive]}
                  onPress={() => updateField('gender', g)}
                >
                  <Text style={[styles.chipText, profile.gender === g && styles.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Medical Information */}
          <Section icon="medical" title="Medical Information" subtitle="Critical first-responder data">
            <Text style={styles.fieldLabel}>Blood Group</Text>
            <View style={styles.chipRow}>
              {BLOOD_GROUPS.map((bg) => (
                <TouchableOpacity
                  key={bg}
                  style={[styles.chip, styles.chipSmall, profile.bloodGroup === bg && styles.chipActiveMedical]}
                  onPress={() => updateField('bloodGroup', bg)}
                >
                  <Text style={[styles.chipText, profile.bloodGroup === bg && styles.chipTextActive]}>{bg}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field
              label="Known Allergies"
              value={profile.allergies}
              onChangeText={(v) => updateField('allergies', v)}
              placeholder="e.g., Penicillin, Peanuts, Dust"
              multiline
            />
            <Field
              label="Chronic Medical Conditions"
              value={profile.medicalConditions}
              onChangeText={(v) => updateField('medicalConditions', v)}
              placeholder="e.g., Asthma, Diabetes, Epilepsy"
              multiline
            />
            <Field
              label="Current Medications"
              value={profile.medications}
              onChangeText={(v) => updateField('medications', v)}
              placeholder="e.g., Inhaler, Insulin"
              multiline
            />
          </Section>

          {/* Location Hubs */}
          <Section icon="location" title="Primary Locations" subtitle="For geofence monitoring & route safety">
            <Field
              label="🏠 Home Address"
              value={profile.homeAddress}
              onChangeText={(v) => updateField('homeAddress', v)}
              placeholder="Your home address"
              multiline
            />
            <Field
              label="🏢 Work Address"
              value={profile.workAddress}
              onChangeText={(v) => updateField('workAddress', v)}
              placeholder="Your workplace address"
              multiline
            />
            <Field
              label="🎓 College / University"
              value={profile.collegeAddress}
              onChangeText={(v) => updateField('collegeAddress', v)}
              placeholder="Your college address"
              multiline
            />
          </Section>

          {/* Vehicle Details */}
          <Section icon="car" title="Vehicle Details" subtitle="Helps in search efforts if offline">
            <Field
              label="Vehicle / Commute Info"
              value={profile.vehicleDetails}
              onChangeText={(v) => updateField('vehicleDetails', v)}
              placeholder="e.g., White Honda Activa - KA01AB1234"
              multiline
            />
          </Section>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Ionicons name="save" size={20} color="#FFF" />
            <Text style={styles.saveBtnText}>Save Profile</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  saveHeaderBtn: { padding: 8 },
  content: { padding: 16 },

  infoBanner: {
    flexDirection: 'row', backgroundColor: '#E3F2FD', borderRadius: 12,
    padding: 14, marginBottom: 16, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: '#1565C0', marginLeft: 10, lineHeight: 17 },

  // Section
  section: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  sectionSubtitle: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },

  // Field
  fieldContainer: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textLight, marginBottom: 6 },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  fieldMultiline: { minHeight: 60, textAlignVertical: 'top' },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8, marginBottom: 8,
  },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipActiveMedical: { backgroundColor: '#C62828', borderColor: '#C62828' },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#FFF' },

  // Save
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    marginTop: 8, ...SHADOWS.medium,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', marginLeft: 8 },
});

/**
 * ProfileScreen v2.0 — Digital Safety ID + First-Login Wizard
 *
 * Features:
 *  - First-login: step-by-step wizard to collect all user details
 *  - Gmail auto-fill: pre-fills name, email, photo from Google login
 *  - Phone OTP fills phone automatically
 *  - Step progress bar with animated transitions
 *  - 4 steps: Identity → Medical → Locations → Vehicle & Review
 *  - Modern card-based UI with glass morphism styling
 *  - Edit mode for returning users
 *  - Animated save confirmation
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Platform, Alert, KeyboardAvoidingView, Animated, Dimensions,
  Image, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Female', 'Male', 'Non-Binary', 'Prefer not to say'];

const STEPS = [
  { key: 'identity', label: 'Identity', icon: 'person', color: COLORS.primary },
  { key: 'medical', label: 'Medical', icon: 'medical', color: '#C62828' },
  { key: 'locations', label: 'Locations', icon: 'location', color: '#1565C0' },
  { key: 'vehicle', label: 'Review', icon: 'checkmark-circle', color: '#00C853' },
];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const {
    userProfile, updateProfile, authMethod, socialData,
    isProfileComplete, markProfileComplete, prefillFromSocial,
  } = useAuth();

  // Determine if this is first-time setup
  const [isFirstTime, setIsFirstTime] = useState(!isProfileComplete);
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState({ ...userProfile });
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const saveAnim = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Pre-fill from social login data (Gmail, etc.)
    if (isFirstTime) {
      const prefill = prefillFromSocial();
      if (Object.keys(prefill).length > 0) {
        setProfile(prev => ({ ...prev, ...prefill }));
      }
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    animateProgress(0);
  }, []);

  const animateProgress = (step) => {
    Animated.spring(progressAnim, {
      toValue: (step + 1) / STEPS.length,
      friction: 8,
      useNativeDriver: false,
    }).start();
  };

  const animateStepChange = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  };

  const updateField = (key, value) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setHasChanges(true);
  };

  const goToStep = (step) => {
    if (step < 0 || step >= STEPS.length) return;
    setCurrentStep(step);
    animateProgress(step);
    animateStepChange();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleNext = () => {
    // Validate current step
    if (currentStep === 0 && (!profile.fullName || !profile.fullName.trim())) {
      Alert.alert('Required', 'Please enter your full name to continue.');
      return;
    }
    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    if (!profile.fullName || !profile.fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }

    await updateProfile(profile);

    if (isFirstTime) {
      await markProfileComplete();
      setIsFirstTime(false);
    }

    setSaved(true);
    setHasChanges(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate save checkmark
    Animated.sequence([
      Animated.spring(saveAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(saveAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    if (isFirstTime) {
      Alert.alert(
        '✅ Profile Complete!',
        'Your Digital Safety ID has been created. This information helps first responders and emergency contacts assist you faster.',
        [{ text: 'Continue', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('✅ Profile Saved', 'Your safety profile has been updated.');
    }
  };

  const pickProfileImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow access to your photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        updateField('profilePicUri', result.assets[0].uri);
      }
    } catch (e) {
      console.log('Image pick error:', e);
    }
  };

  // ─── Gmail Badge Component ─────────────────────────────────────
  const GmailBadge = () => {
    if (authMethod !== 'google') return null;
    return (
      <View style={styles.gmailBadge}>
        <MaterialCommunityIcons name="google" size={14} color="#FFF" />
        <Text style={styles.gmailBadgeText}>Fetched from Google</Text>
      </View>
    );
  };

  // ─── Step Progress Bar ─────────────────────────────────────────
  const StepProgress = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <Animated.View
          style={[styles.progressFill, {
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }]}
        />
      </View>
      <View style={styles.stepsRow}>
        {STEPS.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <TouchableOpacity
              key={step.key}
              style={[styles.stepDot, isActive && styles.stepDotActive, isDone && styles.stepDotDone]}
              onPress={() => { if (!isFirstTime || isDone) goToStep(i); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isDone ? 'checkmark' : step.icon}
                size={16}
                color={isActive || isDone ? '#FFF' : COLORS.textLight}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.stepLabel}>
        Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep].label}
      </Text>
    </View>
  );

  // ─── Field Component ───────────────────────────────────────────
  const Field = ({ label, value, onChangeText, placeholder, keyboardType, multiline, icon, prefilled }) => (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldLabelRow}>
        {icon && <Ionicons name={icon} size={14} color={COLORS.primary} style={{ marginRight: 6 }} />}
        <Text style={styles.fieldLabel}>{label}</Text>
        {prefilled && authMethod === 'google' && (
          <View style={styles.prefilledTag}>
            <MaterialCommunityIcons name="google" size={10} color="#FFF" />
            <Text style={styles.prefilledTagText}>Gmail</Text>
          </View>
        )}
      </View>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldMultiline, prefilled && styles.fieldPrefilled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );

  // ─── Section Card ──────────────────────────────────────────────
  const SectionCard = ({ icon, iconColor, title, subtitle, children }) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: (iconColor || COLORS.primary) + '15' }]}>
          <Ionicons name={icon} size={22} color={iconColor || COLORS.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );

  // ─── STEP 1: Identity ──────────────────────────────────────────
  const StepIdentity = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {isFirstTime && (
        <View style={styles.wizardBanner}>
          <View style={styles.wizardBannerIcon}>
            <Ionicons name="shield-checkmark" size={28} color="#FFF" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.wizardBannerTitle}>Create Your Digital Safety ID</Text>
            <Text style={styles.wizardBannerSub}>
              This info helps first responders and emergency contacts help you faster
            </Text>
          </View>
        </View>
      )}

      {authMethod === 'google' && socialData?.email && (
        <View style={styles.gmailInfoCard}>
          <MaterialCommunityIcons name="google" size={24} color="#4285F4" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.gmailInfoTitle}>Signed in with Google</Text>
            <Text style={styles.gmailInfoEmail}>{socialData.email}</Text>
            {socialData.name ? (
              <Text style={styles.gmailInfoFetched}>
                Name auto-filled from your Google account ✓
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {authMethod === 'phone' && profile.phone ? (
        <View style={styles.gmailInfoCard}>
          <Ionicons name="call" size={24} color="#00C853" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.gmailInfoTitle}>Signed in with Phone</Text>
            <Text style={styles.gmailInfoEmail}>+91 {profile.phone}</Text>
            <Text style={styles.gmailInfoFetched}>Phone number auto-filled ✓</Text>
          </View>
        </View>
      ) : null}

      <SectionCard icon="person" title="Basic Identification" subtitle="Helps authorities identify you">
        {/* Profile Picture */}
        <TouchableOpacity style={styles.avatarSection} onPress={pickProfileImage} activeOpacity={0.8}>
          <Animated.View style={[styles.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
            {profile.profilePicUri ? (
              <Image source={{ uri: profile.profilePicUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="camera" size={28} color={COLORS.primary} />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="pencil" size={12} color="#FFF" />
            </View>
          </Animated.View>
          <Text style={styles.avatarHint}>Tap to add photo</Text>
        </TouchableOpacity>

        <Field
          label="Full Name *"
          value={profile.fullName}
          onChangeText={(v) => updateField('fullName', v)}
          placeholder="Your full name"
          icon="person-outline"
          prefilled={authMethod === 'google' && socialData?.name}
        />
        <Field
          label="Phone Number"
          value={profile.phone}
          onChangeText={(v) => updateField('phone', v)}
          placeholder="+91 1234567890"
          keyboardType="phone-pad"
          icon="call-outline"
          prefilled={authMethod === 'phone'}
        />
        {authMethod === 'google' && socialData?.email && (
          <Field
            label="Email Address"
            value={profile.email || socialData?.email || ''}
            onChangeText={(v) => updateField('email', v)}
            placeholder="your@email.com"
            keyboardType="email-address"
            icon="mail-outline"
            prefilled={true}
          />
        )}
        <Field
          label="Date of Birth"
          value={profile.dateOfBirth}
          onChangeText={(v) => updateField('dateOfBirth', v)}
          placeholder="DD/MM/YYYY"
          icon="calendar-outline"
        />

        {/* Gender */}
        <View style={styles.fieldContainer}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="transgender-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={styles.fieldLabel}>Gender</Text>
          </View>
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
        </View>
      </SectionCard>
    </Animated.View>
  );

  // ─── STEP 2: Medical ───────────────────────────────────────────
  const StepMedical = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <SectionCard icon="medical" iconColor="#C62828" title="Medical Information" subtitle="Critical data for first responders">
        <View style={styles.medicalWarning}>
          <Ionicons name="alert-circle" size={18} color="#C62828" />
          <Text style={styles.medicalWarningText}>
            This information can save your life in an emergency. Please fill it accurately.
          </Text>
        </View>

        {/* Blood Group */}
        <View style={styles.fieldContainer}>
          <View style={styles.fieldLabelRow}>
            <Ionicons name="water" size={14} color="#C62828" style={{ marginRight: 6 }} />
            <Text style={styles.fieldLabel}>Blood Group</Text>
          </View>
          <View style={styles.bloodGroupGrid}>
            {BLOOD_GROUPS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[styles.bloodChip, profile.bloodGroup === bg && styles.bloodChipActive]}
                onPress={() => updateField('bloodGroup', bg)}
              >
                <Text style={[styles.bloodChipText, profile.bloodGroup === bg && styles.bloodChipTextActive]}>
                  {bg}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Field
          label="Known Allergies"
          value={profile.allergies}
          onChangeText={(v) => updateField('allergies', v)}
          placeholder="e.g., Penicillin, Peanuts, Dust"
          icon="alert-circle-outline"
          multiline
        />
        <Field
          label="Chronic Medical Conditions"
          value={profile.medicalConditions}
          onChangeText={(v) => updateField('medicalConditions', v)}
          placeholder="e.g., Asthma, Diabetes, Epilepsy"
          icon="fitness-outline"
          multiline
        />
        <Field
          label="Current Medications"
          value={profile.medications}
          onChangeText={(v) => updateField('medications', v)}
          placeholder="e.g., Inhaler, Insulin, Aspirin"
          icon="medkit-outline"
          multiline
        />

        <View style={styles.emergencyContact}>
          <Ionicons name="call" size={16} color="#FF6D00" />
          <Text style={styles.emergencyContactText}>
            Emergency Medical Helpline: 108
          </Text>
        </View>
      </SectionCard>
    </Animated.View>
  );

  // ─── STEP 3: Locations ─────────────────────────────────────────
  const StepLocations = () => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <SectionCard icon="location" iconColor="#1565C0" title="Primary Locations" subtitle="For route safety & geofence monitoring">
        <View style={styles.locationTip}>
          <Ionicons name="navigate" size={16} color="#1565C0" />
          <Text style={styles.locationTipText}>
            These addresses help us detect unusual routes and alert your contacts if you deviate from known paths.
          </Text>
        </View>

        <Field
          label="🏠 Home Address"
          value={profile.homeAddress}
          onChangeText={(v) => updateField('homeAddress', v)}
          placeholder="Your home address"
          icon="home-outline"
          multiline
        />
        <Field
          label="🏢 Work Address"
          value={profile.workAddress}
          onChangeText={(v) => updateField('workAddress', v)}
          placeholder="Your workplace address"
          icon="business-outline"
          multiline
        />
        <Field
          label="🎓 College / University"
          value={profile.collegeAddress}
          onChangeText={(v) => updateField('collegeAddress', v)}
          placeholder="Your college / university address"
          icon="school-outline"
          multiline
        />
      </SectionCard>
    </Animated.View>
  );

  // ─── STEP 4: Vehicle + Review ──────────────────────────────────
  const StepReview = () => {
    const completionItems = [
      { label: 'Full Name', done: !!profile.fullName?.trim(), required: true },
      { label: 'Phone', done: !!profile.phone?.trim() },
      { label: 'Blood Group', done: !!profile.bloodGroup },
      { label: 'Gender', done: !!profile.gender },
      { label: 'Date of Birth', done: !!profile.dateOfBirth?.trim() },
      { label: 'Allergies', done: !!profile.allergies?.trim() },
      { label: 'Medical Conditions', done: !!profile.medicalConditions?.trim() },
      { label: 'Home Address', done: !!profile.homeAddress?.trim() },
      { label: 'Work Address', done: !!profile.workAddress?.trim() },
      { label: 'Vehicle Details', done: !!profile.vehicleDetails?.trim() },
    ];
    const doneCount = completionItems.filter(i => i.done).length;
    const percent = Math.round((doneCount / completionItems.length) * 100);

    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <SectionCard icon="car" iconColor="#37474F" title="Vehicle Details" subtitle="Helps in search efforts if offline">
          <Field
            label="Vehicle / Commute Info"
            value={profile.vehicleDetails}
            onChangeText={(v) => updateField('vehicleDetails', v)}
            placeholder="e.g., White Honda Activa — KA01AB1234"
            icon="car-outline"
            multiline
          />
        </SectionCard>

        {/* Profile Completion Card */}
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <Ionicons name="checkmark-circle" size={24} color="#00C853" />
            <Text style={styles.reviewTitle}>Profile Completion — {percent}%</Text>
          </View>

          {/* Progress Ring */}
          <View style={styles.reviewProgressBar}>
            <View style={[styles.reviewProgressFill, { width: `${percent}%` }]} />
          </View>

          <View style={styles.reviewGrid}>
            {completionItems.map((item) => (
              <View key={item.label} style={styles.reviewItem}>
                <Ionicons
                  name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={item.done ? '#00C853' : COLORS.textLight}
                />
                <Text style={[
                  styles.reviewItemText,
                  item.done && styles.reviewItemDone,
                  item.required && !item.done && { color: '#FF1744' },
                ]}>
                  {item.label}{item.required ? ' *' : ''}
                </Text>
              </View>
            ))}
          </View>

          {percent < 50 && (
            <View style={styles.reviewTip}>
              <Ionicons name="information-circle" size={16} color="#FF6D00" />
              <Text style={styles.reviewTipText}>
                A complete profile helps emergency services respond faster. Try to fill at least 70%.
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  // ─── Step Content Renderer ─────────────────────────────────────
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: return <StepIdentity />;
      case 1: return <StepMedical />;
      case 2: return <StepLocations />;
      case 3: return <StepReview />;
      default: return null;
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>
            {isFirstTime ? 'Setup Profile' : 'Safety Profile'}
          </Text>
          <Text style={styles.headerSub}>
            {isFirstTime ? 'Complete your Digital Safety ID' : 'Your Digital Safety ID'}
          </Text>
        </View>
        {!isFirstTime && (
          <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn} disabled={!hasChanges}>
            <Animated.View style={{ transform: [{ scale: saveAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
              <Ionicons
                name={saved ? 'checkmark-circle' : 'save-outline'}
                size={22}
                color={hasChanges ? '#FFF' : 'rgba(255,255,255,0.4)'}
              />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* Step Progress (for wizard mode) */}
      {isFirstTime && <StepProgress />}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isFirstTime ? (
          /* ── Wizard Mode ── */
          <>
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {renderStepContent()}
              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom Navigation */}
            <View style={styles.bottomBar}>
              {currentStep > 0 ? (
                <TouchableOpacity style={styles.backStepBtn} onPress={handleBack}>
                  <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
                  <Text style={styles.backStepText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 80 }} />
              )}

              <Text style={styles.stepIndicator}>
                {currentStep + 1} / {STEPS.length}
              </Text>

              {currentStep < STEPS.length - 1 ? (
                <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                  <Text style={styles.nextBtnText}>Next</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.saveStepBtn} onPress={handleSave}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.saveStepText}>Save</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          /* ── Edit Mode (returning users) ── */
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="shield-checkmark" size={20} color="#1565C0" />
              <Text style={styles.infoBannerText}>
                Your Digital Safety ID helps first responders and emergency contacts assist you faster.
              </Text>
            </View>

            {authMethod === 'google' && socialData?.email && (
              <View style={styles.gmailInfoCard}>
                <MaterialCommunityIcons name="google" size={24} color="#4285F4" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.gmailInfoTitle}>Connected to Google</Text>
                  <Text style={styles.gmailInfoEmail}>{socialData.email}</Text>
                </View>
              </View>
            )}

            {/* All sections in edit mode */}
            <SectionCard icon="person" title="Basic Identification" subtitle="Helps authorities identify you">
              <TouchableOpacity style={styles.avatarSection} onPress={pickProfileImage} activeOpacity={0.8}>
                <View style={styles.avatarWrapSmall}>
                  {profile.profilePicUri ? (
                    <Image source={{ uri: profile.profilePicUri }} style={styles.avatarImageSmall} />
                  ) : (
                    <View style={styles.avatarPlaceholderSmall}>
                      <Ionicons name="camera" size={22} color={COLORS.primary} />
                    </View>
                  )}
                  <View style={styles.avatarEditBadgeSmall}>
                    <Ionicons name="pencil" size={10} color="#FFF" />
                  </View>
                </View>
              </TouchableOpacity>

              <Field
                label="Full Name *"
                value={profile.fullName}
                onChangeText={(v) => updateField('fullName', v)}
                placeholder="Your full name"
                icon="person-outline"
                prefilled={authMethod === 'google' && socialData?.name}
              />
              <Field
                label="Phone Number"
                value={profile.phone}
                onChangeText={(v) => updateField('phone', v)}
                placeholder="+91 1234567890"
                keyboardType="phone-pad"
                icon="call-outline"
              />
              <Field
                label="Date of Birth"
                value={profile.dateOfBirth}
                onChangeText={(v) => updateField('dateOfBirth', v)}
                placeholder="DD/MM/YYYY"
                icon="calendar-outline"
              />
              <View style={styles.fieldContainer}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="transgender-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.fieldLabel}>Gender</Text>
                </View>
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
              </View>
            </SectionCard>

            <SectionCard icon="medical" iconColor="#C62828" title="Medical Information" subtitle="Critical first-responder data">
              <View style={styles.fieldContainer}>
                <View style={styles.fieldLabelRow}>
                  <Ionicons name="water" size={14} color="#C62828" style={{ marginRight: 6 }} />
                  <Text style={styles.fieldLabel}>Blood Group</Text>
                </View>
                <View style={styles.bloodGroupGrid}>
                  {BLOOD_GROUPS.map((bg) => (
                    <TouchableOpacity
                      key={bg}
                      style={[styles.bloodChip, profile.bloodGroup === bg && styles.bloodChipActive]}
                      onPress={() => updateField('bloodGroup', bg)}
                    >
                      <Text style={[styles.bloodChipText, profile.bloodGroup === bg && styles.bloodChipTextActive]}>
                        {bg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Field label="Allergies" value={profile.allergies} onChangeText={(v) => updateField('allergies', v)} placeholder="e.g., Penicillin, Peanuts" icon="alert-circle-outline" multiline />
              <Field label="Medical Conditions" value={profile.medicalConditions} onChangeText={(v) => updateField('medicalConditions', v)} placeholder="e.g., Asthma, Diabetes" icon="fitness-outline" multiline />
              <Field label="Medications" value={profile.medications} onChangeText={(v) => updateField('medications', v)} placeholder="e.g., Inhaler, Insulin" icon="medkit-outline" multiline />
            </SectionCard>

            <SectionCard icon="location" iconColor="#1565C0" title="Primary Locations" subtitle="For route safety monitoring">
              <Field label="🏠 Home Address" value={profile.homeAddress} onChangeText={(v) => updateField('homeAddress', v)} placeholder="Your home address" icon="home-outline" multiline />
              <Field label="🏢 Work Address" value={profile.workAddress} onChangeText={(v) => updateField('workAddress', v)} placeholder="Your workplace" icon="business-outline" multiline />
              <Field label="🎓 College" value={profile.collegeAddress} onChangeText={(v) => updateField('collegeAddress', v)} placeholder="Your college" icon="school-outline" multiline />
            </SectionCard>

            <SectionCard icon="car" iconColor="#37474F" title="Vehicle Details" subtitle="Helps in search efforts if offline">
              <Field label="Vehicle / Commute Info" value={profile.vehicleDetails} onChangeText={(v) => updateField('vehicleDetails', v)} placeholder="e.g., White Honda Activa — KA01AB1234" icon="car-outline" multiline />
            </SectionCard>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, !hasChanges && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!hasChanges}
              activeOpacity={0.85}
            >
              <Ionicons name={saved ? 'checkmark-circle' : 'save'} size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>{saved ? 'Saved ✓' : 'Save Profile'}</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  saveHeaderBtn: { padding: 8 },

  // Progress
  progressContainer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  progressBar: {
    height: 6, backgroundColor: COLORS.border, borderRadius: 3,
    overflow: 'hidden', marginBottom: 14,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stepDot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#E0E0E0',
  },
  stepDotActive: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primary,
    ...SHADOWS.medium,
  },
  stepDotDone: { backgroundColor: '#00C853', borderColor: '#00C853' },
  stepLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center' },

  content: { padding: 16 },

  // Wizard Banner (first-time)
  wizardBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primary, borderRadius: 20, padding: 16,
    marginBottom: 16, ...SHADOWS.medium,
  },
  wizardBannerIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  wizardBannerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  wizardBannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 17 },

  // Gmail Info Card
  gmailInfoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8F0FE', borderRadius: 16, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#C8DAFC',
  },
  gmailInfoTitle: { fontSize: 14, fontWeight: '700', color: '#1A73E8' },
  gmailInfoEmail: { fontSize: 12, color: '#5F6368', marginTop: 2 },
  gmailInfoFetched: { fontSize: 11, color: '#00C853', fontWeight: '600', marginTop: 3 },

  // Gmail Badge
  gmailBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#4285F4', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  gmailBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },

  // Section Card
  sectionCard: {
    backgroundColor: '#FFF', borderRadius: 22, padding: 18,
    marginBottom: 16, ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  sectionSubtitle: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 18 },
  avatarWrap: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: COLORS.primary,
    overflow: 'visible', position: 'relative',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  avatarPlaceholder: {
    width: '100%', height: '100%', borderRadius: 50,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  avatarHint: { fontSize: 12, color: COLORS.textLight, marginTop: 8 },

  avatarWrapSmall: {
    width: 70, height: 70, borderRadius: 35,
    borderWidth: 3, borderColor: COLORS.primary,
    position: 'relative', alignSelf: 'center', marginBottom: 14,
  },
  avatarImageSmall: { width: '100%', height: '100%', borderRadius: 35 },
  avatarPlaceholderSmall: {
    width: '100%', height: '100%', borderRadius: 35,
    backgroundColor: COLORS.primary + '12',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarEditBadgeSmall: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },

  // Field
  fieldContainer: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  prefilledTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8,
    backgroundColor: '#4285F4', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  prefilledTagText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: 14, paddingHorizontal: 16,
    paddingVertical: 13, fontSize: 15, color: COLORS.text,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  fieldMultiline: { minHeight: 70, textAlignVertical: 'top', paddingTop: 13 },
  fieldPrefilled: { borderColor: '#4285F420', backgroundColor: '#E8F0FE40' },

  // Chips (Gender)
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#FFF' },

  // Blood Group Grid
  bloodGroupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  bloodChip: {
    width: (SCREEN_W - 36 - 56 - 56) / 4, // 4 per row
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#FFF5F5', borderWidth: 1.5, borderColor: '#FFCDD2',
    alignItems: 'center', justifyContent: 'center',
  },
  bloodChipActive: { backgroundColor: '#C62828', borderColor: '#C62828' },
  bloodChipText: { fontSize: 15, fontWeight: '800', color: '#C62828' },
  bloodChipTextActive: { color: '#FFF' },

  // Medical Warning
  medicalWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFF5F5', borderRadius: 14, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FFCDD2',
  },
  medicalWarningText: { flex: 1, fontSize: 12, color: '#C62828', lineHeight: 17 },

  // Emergency Contact
  emergencyContact: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#FFE0B2',
  },
  emergencyContactText: { fontSize: 12, fontWeight: '600', color: '#E65100' },

  // Location Tip
  locationTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#E3F2FD', borderRadius: 14, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#90CAF9',
  },
  locationTipText: { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },

  // Review Card
  reviewCard: {
    backgroundColor: '#FFF', borderRadius: 22, padding: 18,
    marginBottom: 16, ...SHADOWS.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  reviewHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  reviewTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  reviewProgressBar: {
    height: 8, backgroundColor: '#F0F0F0', borderRadius: 4,
    overflow: 'hidden', marginBottom: 16,
  },
  reviewProgressFill: { height: '100%', backgroundColor: '#00C853', borderRadius: 4 },
  reviewGrid: { gap: 6 },
  reviewItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  reviewItemText: { fontSize: 13, color: COLORS.textSecondary },
  reviewItemDone: { color: '#00C853', fontWeight: '600' },
  reviewTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 10,
    marginTop: 12, borderWidth: 1, borderColor: '#FFE0B2',
  },
  reviewTipText: { flex: 1, fontSize: 11, color: '#E65100', lineHeight: 16 },

  // Info Banner (edit mode)
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#E3F2FD', borderRadius: 16, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#90CAF9',
  },
  infoBannerText: { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },

  // Bottom Bar (Wizard)
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
    backgroundColor: '#FFF',
    borderTopWidth: 1, borderTopColor: COLORS.border,
    ...SHADOWS.medium,
  },
  backStepBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14,
    backgroundColor: COLORS.primary + '10',
  },
  backStepText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  stepIndicator: { fontSize: 13, fontWeight: '700', color: COLORS.textLight },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
    backgroundColor: COLORS.primary, ...SHADOWS.small,
  },
  nextBtnText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  saveStepBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#00C853', ...SHADOWS.small,
  },
  saveStepText: { fontSize: 14, fontWeight: '800', color: '#FFF' },

  // Save Button (edit mode)
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16,
    marginTop: 8, ...SHADOWS.medium,
  },
  saveBtnDisabled: { backgroundColor: COLORS.textLight, opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});

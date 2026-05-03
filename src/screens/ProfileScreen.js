/**
 * ProfileScreen v7.0 — Digital Safety ID (Dark Luxury)
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn,
  Input, Label, T,
} from '../components/ui';

const FIELDS = [
  { group: 'Personal', items: [
    { key: 'fullName',     label: 'Full Name',         placeholder: 'Priya Sharma',         icon: 'person' },
    { key: 'phone',        label: 'Phone Number',      placeholder: '+91 98765 43210',      icon: 'call', kb: 'phone-pad' },
    { key: 'email',        label: 'Email',             placeholder: 'you@example.com',      icon: 'mail', kb: 'email-address' },
    { key: 'dateOfBirth',  label: 'Date of Birth',     placeholder: 'YYYY-MM-DD',           icon: 'calendar' },
    { key: 'gender',       label: 'Gender',            placeholder: 'Female / Other',       icon: 'transgender' },
  ]},
  { group: 'Medical', items: [
    { key: 'bloodGroup',         label: 'Blood Group',       placeholder: 'O+',                   icon: 'water' },
    { key: 'allergies',          label: 'Allergies',         placeholder: 'Penicillin, peanuts',  icon: 'warning', multi: true },
    { key: 'medicalConditions',  label: 'Medical Conditions', placeholder: 'Asthma, diabetes',     icon: 'medical', multi: true },
    { key: 'medications',        label: 'Current Medications', placeholder: 'Inhaler, insulin',    icon: 'medkit', multi: true },
  ]},
  { group: 'Addresses', items: [
    { key: 'homeAddress',     label: 'Home Address',     placeholder: '123 Main St, City',    icon: 'home',     multi: true },
    { key: 'workAddress',     label: 'Work / Office',    placeholder: '500 Park Ave',         icon: 'business', multi: true },
    { key: 'collegeAddress',  label: 'College / School', placeholder: 'University name',      icon: 'school',   multi: true },
    { key: 'vehicleDetails',  label: 'Vehicle Details',  placeholder: 'Honda Civic - DL 8C XXXX', icon: 'car-sport' },
  ]},
];

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { userProfile, updateProfile, markProfileComplete } = useAuth();
  const [form, setForm] = useState(userProfile);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(userProfile); }, [userProfile]);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const completeness = (() => {
    const all = FIELDS.flatMap(g => g.items.map(i => i.key));
    const done = all.filter(k => form[k]?.trim?.());
    return Math.round((done.length / all.length) * 100);
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      if (completeness >= 60) await markProfileComplete();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Your safety profile has been updated.');
    } catch (e) {
      Alert.alert('Error', 'Could not save profile.');
    } finally { setSaving(false); }
  };

  const pickPicture = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6, allowsEditing: true, aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) {
      setField('profilePicUri', result.assets[0].uri);
    }
  };

  return (
    <Screen>
      <Header title="Safety Profile" subtitle="Used by responders during emergencies" onBack={() => navigation.goBack()} />

      {/* Avatar + completeness */}
      <Card style={{ alignItems: 'center', padding: 22 }}>
        <TouchableOpacity onPress={pickPicture} activeOpacity={0.8}>
          {form.profilePicUri ? (
            <Image source={{ uri: form.profilePicUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={42} color={T.primary} />
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color={T.white} />
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>{form.fullName || 'Your Name'}</Text>
        <Text style={styles.email}>{form.email || form.phone || 'Add contact info'}</Text>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${completeness}%` }]} />
        </View>
        <Text style={styles.progressLabel}>Profile {completeness}% complete</Text>
      </Card>

      {/* Field groups */}
      {FIELDS.map((group) => (
        <View key={group.group}>
          <SectionTitle>{group.group}</SectionTitle>
          <Card>
            {group.items.map((field) => (
              <View key={field.key} style={{ marginBottom: 6 }}>
                <Label>{field.label}</Label>
                <Input
                  value={form[field.key] || ''}
                  onChangeText={(v) => setField(field.key, v)}
                  placeholder={field.placeholder}
                  keyboardType={field.kb || 'default'}
                  multiline={!!field.multi}
                  numberOfLines={field.multi ? 2 : 1}
                  style={field.multi ? { minHeight: 60 } : null}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}

      <PrimaryBtn icon="save" loading={saving} onPress={handleSave} style={{ marginTop: 12 }}>
        Save Profile
      </PrimaryBtn>

      <Text style={styles.note}>
        🔒 Profile is stored locally and shared only when you trigger SOS or grant explicit access.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: {
    backgroundColor: T.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.borderActive,
  },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#0F0F18',
  },
  name:  { color: T.white, fontSize: 20, fontWeight: '900', marginTop: 14 },
  email: { color: T.textSub, fontSize: 13, marginTop: 4 },

  progressBar: {
    width: '100%', height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 18, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: T.primary, borderRadius: 3 },
  progressLabel: { color: T.textSub, fontSize: 11, fontWeight: '700', marginTop: 8 },

  note: {
    color: T.textHint, fontSize: 11, textAlign: 'center', marginTop: 16,
    paddingHorizontal: 12, lineHeight: 17,
  },
});

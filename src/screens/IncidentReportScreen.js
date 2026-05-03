/**
 * IncidentReportScreen v7.0 — File a structured incident report (Dark Luxury)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Input, Label, EmptyState, T,
} from '../components/ui';

const STORAGE_KEY = '@gs_incident_reports';

const TYPES = [
  { id: 'harassment', label: 'Harassment',   icon: 'warning',          color: T.warning },
  { id: 'stalking',   label: 'Stalking',     icon: 'eye-off',          color: '#7C4DFF' },
  { id: 'assault',    label: 'Assault',      icon: 'alert-circle',     color: T.danger },
  { id: 'theft',      label: 'Theft',        icon: 'lock-closed',      color: '#FF6D00' },
  { id: 'unsafe',     label: 'Unsafe Place', icon: 'location',         color: '#42A5F5' },
  { id: 'other',      label: 'Other',        icon: 'document-text',    color: T.textSub },
];

export default function IncidentReportScreen() {
  const navigation = useNavigation();
  const [reports, setReports] = useState([]);
  const [creating, setCreating] = useState(false);

  // form state
  const [type, setType] = useState('harassment');
  const [where, setWhere] = useState('');
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16).replace('T', ' '));
  const [description, setDescription] = useState('');
  const [witnesses, setWitnesses] = useState('');

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setReports(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setType('harassment'); setWhere(''); setDescription(''); setWitnesses('');
    setWhen(new Date().toISOString().slice(0, 16).replace('T', ' '));
  };

  const captureLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      try {
        const [info] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        });
        if (info) {
          setWhere([info.name, info.street, info.city, info.region].filter(Boolean).join(', '));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {}
    } catch {}
  };

  const save = async () => {
    if (!description.trim()) { Alert.alert('Missing', 'Please describe what happened.'); return; }
    const report = {
      id: Date.now().toString(36),
      type, where: where.trim(), when, description: description.trim(),
      witnesses: witnesses.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [report, ...reports];
    setReports(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreating(false);
    reset();
  };

  const exportReport = async (r) => {
    const t = TYPES.find(x => x.id === r.type) || TYPES[0];
    const text = [
      `INCIDENT REPORT`,
      `Type: ${t.label}`,
      `When: ${r.when}`,
      `Where: ${r.where || '—'}`,
      ``,
      `Description:`,
      r.description,
      ``,
      r.witnesses ? `Witnesses: ${r.witnesses}` : '',
      ``,
      `Filed: ${new Date(r.createdAt).toLocaleString()}`,
      `— SafeHer`,
    ].join('\n');
    try { await Share.share({ message: text }); } catch {}
  };

  const remove = (r) => {
    Alert.alert('Delete report?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const next = reports.filter(x => x.id !== r.id);
          setReports(next);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        },
      },
    ]);
  };

  if (creating) {
    return (
      <Screen>
        <Header title="New Report" subtitle="The more detail, the stronger your record" onBack={() => setCreating(false)} />

        <Label>Incident Type</Label>
        <View style={styles.typeGrid}>
          {TYPES.map(t => {
            const active = type === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeChip, active && { backgroundColor: `${t.color}22`, borderColor: t.color }]}
                onPress={() => { setType(t.id); Haptics.selectionAsync(); }}
              >
                <Ionicons name={t.icon} size={16} color={active ? t.color : T.textSub} />
                <Text style={[styles.typeText, active && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Label>When did it happen?</Label>
        <Input value={when} onChangeText={setWhen} placeholder="2026-05-03 22:15" />

        <Label>Where?</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input value={where} onChangeText={setWhere} placeholder="Address, landmark, or description" />
          </View>
          <TouchableOpacity style={styles.locBtn} onPress={captureLocation} accessibilityLabel="Use current location">
            <Ionicons name="locate" size={18} color={T.primary} />
          </TouchableOpacity>
        </View>

        <Label>Describe what happened</Label>
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="Be specific: what you saw, what was said, who was involved…"
          multiline
          numberOfLines={6}
          style={{ minHeight: 140 }}
          textAlignVertical="top"
        />

        <Label>Witnesses (optional)</Label>
        <Input value={witnesses} onChangeText={setWitnesses} placeholder="Names, descriptions, contact info" />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
          <View style={{ flex: 1 }}><GhostBtn onPress={() => setCreating(false)} color={T.textSub}>Cancel</GhostBtn></View>
          <View style={{ flex: 2 }}><PrimaryBtn icon="checkmark" onPress={save}>Save Report</PrimaryBtn></View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Incident Reports"
        subtitle={`${reports.length} record${reports.length !== 1 ? 's' : ''}`}
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity style={styles.addBtn} onPress={() => setCreating(true)} accessibilityLabel="New report">
            <Ionicons name="add" size={22} color={T.white} />
          </TouchableOpacity>
        }
      />

      {reports.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No reports yet"
          subtitle="Document harassment, stalking, or unsafe situations. A timestamped record strengthens your case if you ever need to escalate."
          action={<PrimaryBtn icon="add" onPress={() => setCreating(true)}>File First Report</PrimaryBtn>}
        />
      ) : (
        <>
          <SectionTitle>All Reports</SectionTitle>
          {reports.map(r => {
            const t = TYPES.find(x => x.id === r.type) || TYPES[0];
            return (
              <Card key={r.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={[styles.typeIcon, { backgroundColor: `${t.color}22` }]}>
                    <Ionicons name={t.icon} size={18} color={t.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.itemTitle}>{t.label}</Text>
                    <Text style={styles.itemTime}>{new Date(r.createdAt).toLocaleString()}</Text>
                  </View>
                </View>
                <Text style={styles.itemDesc} numberOfLines={3}>{r.description}</Text>
                {r.where ? <Text style={styles.itemMeta}>📍 {r.where}</Text> : null}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={{ flex: 1 }}><GhostBtn icon="share" onPress={() => exportReport(r)} color={T.info}>Export</GhostBtn></View>
                  <View style={{ flex: 1 }}><GhostBtn icon="trash" onPress={() => remove(r)} color={T.danger}>Delete</GhostBtn></View>
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: T.primary, shadowOpacity: 0.5, shadowRadius: 12,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    backgroundColor: T.surface, borderWidth: 1.5, borderColor: T.border,
  },
  typeText: { color: T.textSub, fontSize: 12, fontWeight: '700' },

  locBtn: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },

  typeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: T.white, fontSize: 14, fontWeight: '800' },
  itemTime: { color: T.textSub, fontSize: 11, marginTop: 2 },
  itemDesc: { color: T.text, fontSize: 13, lineHeight: 19 },
  itemMeta: { color: T.textHint, fontSize: 11, marginTop: 6 },
});

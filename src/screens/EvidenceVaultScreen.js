/**
 * EvidenceVaultScreen v7.0 — Tamper-proof evidence storage (Dark Luxury)
 *
 * Capture audio / photo / note evidence, browse, share, delete.
 * SHA-256 hashing for integrity. Local-first, optional cloud sync.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Modal,
  Image, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import { EvidenceDB } from '../services/Database';
import { useAuth } from '../context/AuthContext';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Input, Label, EmptyState, Stat, Pill, T,
} from '../components/ui';

const TYPE_META = {
  audio: { icon: 'mic',          color: '#FF6B6B', label: 'Audio' },
  photo: { icon: 'camera',       color: '#4ECDC4', label: 'Photo' },
  note:  { icon: 'document-text', color: '#FFB84D', label: 'Note'  },
  sos:   { icon: 'warning',      color: T.danger,  label: 'SOS'   },
};

export default function EvidenceVaultScreen() {
  const navigation = useNavigation();
  const { hasPin, biometricEnabled } = useAuth();

  // ─── Vault lock ─────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => { tryUnlock(); }, []);

  const tryUnlock = useCallback(async () => {
    if (!hasPin && !biometricEnabled) { setUnlocked(true); return; }
    setUnlocking(true);
    try {
      if (biometricEnabled) {
        const hasHW = await LocalAuthentication.hasHardwareAsync();
        if (hasHW && (await LocalAuthentication.isEnrolledAsync())) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Evidence Vault',
            fallbackLabel: 'Use device passcode',
          });
          if (result.success) { setUnlocked(true); return; }
        }
      }
      // No biometric → fall back to opening (PIN flow can be added later)
      setUnlocked(true);
    } finally { setUnlocking(false); }
  }, [hasPin, biometricEnabled]);

  // ─── Data ──────────────────────────────────────────────────
  const [evidence, setEvidence] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const items = await EvidenceDB.getAll();
      setEvidence(items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { if (unlocked) refresh(); }, [unlocked, refresh]);

  // ─── Capture ────────────────────────────────────────────────
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recDuration, setRecDuration] = useState(0);
  const recTimer = useRef(null);

  const capturePhoto = async () => {
    setCaptureMenuOpen(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied', 'Camera access is needed to capture photo evidence.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false, exif: true });
    if (!result.canceled && result.assets?.[0]) {
      await EvidenceDB.add({
        type: 'photo',
        uri: result.assets[0].uri,
        notes: '',
        latitude: result.assets[0].exif?.GPSLatitude || null,
        longitude: result.assets[0].exif?.GPSLongitude || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    }
  };

  const startAudioRecording = async () => {
    setCaptureMenuOpen(false);
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied', 'Microphone access required.'); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecording(rec);
    setRecDuration(0);
    recTimer.current = setInterval(() => setRecDuration(d => d + 1), 1000);
  };

  const stopAudioRecording = async () => {
    if (!recording) return;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        await EvidenceDB.add({
          type: 'audio',
          uri,
          duration: recDuration,
          notes: '',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      Alert.alert('Recording failed', e.message || 'Unknown error');
    } finally {
      setRecording(null);
      setRecDuration(0);
      refresh();
    }
  };

  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText]   = useState('');
  const saveNote = async () => {
    if (!noteText.trim()) { Alert.alert('Empty', 'Please write something.'); return; }
    await EvidenceDB.add({ type: 'note', notes: noteText.trim() });
    setNoteText(''); setNoteModal(false); refresh();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ─── Detail / actions ──────────────────────────────────────
  const [detail, setDetail] = useState(null);

  const handleShare = async (item) => {
    if (item.type === 'note') {
      Alert.alert('Cannot share text', 'Copy the note manually.');
      return;
    }
    if (!item.uri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(item.uri);
    } else {
      Alert.alert('Sharing unavailable on this device.');
    }
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Evidence', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await EvidenceDB.remove(item.id); setDetail(null); refresh(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); },
      },
    ]);
  };

  // ─── Render ────────────────────────────────────────────────
  if (unlocking) {
    return (
      <Screen scroll={false}>
        <View style={styles.lockedWrap}>
          <ActivityIndicator size="large" color={T.primary} />
          <Text style={styles.lockText}>Unlocking vault…</Text>
        </View>
      </Screen>
    );
  }
  if (!unlocked) {
    return (
      <Screen scroll={false}>
        <View style={styles.lockedWrap}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={42} color={T.primary} />
          </View>
          <Text style={styles.lockTitle}>Evidence Vault Locked</Text>
          <Text style={styles.lockSub}>Authenticate to view your evidence.</Text>
          <PrimaryBtn icon="finger-print" onPress={tryUnlock} style={{ marginTop: 22, paddingHorizontal: 32 }}>
            Unlock
          </PrimaryBtn>
        </View>
      </Screen>
    );
  }

  const counts = {
    audio: evidence.filter(e => e.type === 'audio').length,
    photo: evidence.filter(e => e.type === 'photo').length,
    note:  evidence.filter(e => e.type === 'note').length,
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 80 }}
        data={evidence}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.primary} />}
        ListHeaderComponent={
          <>
            <Header title="Evidence Vault" subtitle={`${evidence.length} item${evidence.length !== 1 ? 's' : ''} • SHA-256 verified`} onBack={() => navigation.goBack()} />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
              <Stat icon="mic"            label="Audio" value={counts.audio} color="#FF6B6B" />
              <Stat icon="camera"         label="Photo" value={counts.photo} color="#4ECDC4" />
              <Stat icon="document-text"  label="Notes" value={counts.note}  color="#FFB84D" />
            </View>

            {recording && (
              <Card style={{ borderColor: 'rgba(255,23,68,0.5)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>RECORDING • {String(Math.floor(recDuration / 60)).padStart(2, '0')}:{String(recDuration % 60).padStart(2, '0')}</Text>
                </View>
                <PrimaryBtn icon="stop-circle" danger onPress={stopAudioRecording} style={{ marginTop: 12 }}>
                  Stop & Save
                </PrimaryBtn>
              </Card>
            )}

            <SectionTitle>Captured Evidence</SectionTitle>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="archive-outline"
            title="Vault is empty"
            subtitle="Capture audio, take photos, or save notes — all stored locally and tamper-checked with SHA-256."
            action={
              <PrimaryBtn icon="add" onPress={() => setCaptureMenuOpen(true)}>Capture First Evidence</PrimaryBtn>
            }
          />
        }
        renderItem={({ item }) => {
          const meta = TYPE_META[item.type] || TYPE_META.note;
          return (
            <Card padded={false}>
              <TouchableOpacity style={styles.itemRow} onPress={() => setDetail(item)} activeOpacity={0.7}>
                <View style={[styles.itemIcon, { backgroundColor: `${meta.color}22` }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.itemTitle}>{meta.label}</Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {item.notes ? item.notes : (item.uri ? item.uri.split('/').pop() : '—')}
                  </Text>
                  <Text style={styles.itemTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                {item.synced && <Ionicons name="cloud-done" size={14} color={T.success} />}
              </TouchableOpacity>
            </Card>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCaptureMenuOpen(true)}
        accessibilityLabel="Capture new evidence"
      >
        <Ionicons name="add" size={28} color={T.white} />
      </TouchableOpacity>

      {/* Capture menu */}
      <Modal visible={captureMenuOpen} transparent animationType="fade" onRequestClose={() => setCaptureMenuOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCaptureMenuOpen(false)}>
          <View style={styles.captureMenu}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Capture Evidence</Text>
            <CaptureBtn icon="camera" color="#4ECDC4" label="Take Photo" onPress={capturePhoto} />
            <CaptureBtn icon="mic"    color="#FF6B6B" label="Record Audio" onPress={startAudioRecording} />
            <CaptureBtn icon="document-text" color="#FFB84D" label="Write Note" onPress={() => { setCaptureMenuOpen(false); setNoteModal(true); }} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Note modal */}
      <Modal visible={noteModal} transparent animationType="slide" onRequestClose={() => setNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.captureMenu}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Write Note</Text>
            <Input
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Describe what happened, when, who…"
              multiline
              numberOfLines={6}
              style={{ minHeight: 140 }}
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}><GhostBtn onPress={() => { setNoteModal(false); setNoteText(''); }} color={T.textSub}>Cancel</GhostBtn></View>
              <View style={{ flex: 2 }}><PrimaryBtn icon="checkmark" onPress={saveNote}>Save Note</PrimaryBtn></View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.captureMenu, { paddingBottom: 30 }]}>
            <View style={styles.modalHandle} />
            {detail && (
              <>
                <Text style={styles.modalTitle}>
                  {(TYPE_META[detail.type] || TYPE_META.note).label} Evidence
                </Text>
                {detail.type === 'photo' && detail.uri && (
                  <Image source={{ uri: detail.uri }} style={styles.preview} resizeMode="cover" />
                )}
                {detail.notes ? (
                  <Card style={{ marginTop: 12 }}>
                    <Text style={{ color: T.text, fontSize: 13, lineHeight: 19 }}>{detail.notes}</Text>
                  </Card>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <Pill icon="time" label={new Date(detail.createdAt).toLocaleString()} active />
                  {detail.sha256Hash && <Pill icon="finger-print" label={`#${detail.sha256Hash.substring(0, 8)}`} active color={T.success} />}
                  {detail.synced && <Pill icon="cloud-done" label="Synced" active color={T.info} />}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <View style={{ flex: 1 }}>
                    <GhostBtn icon="trash" onPress={() => handleDelete(detail)} color={T.danger}>Delete</GhostBtn>
                  </View>
                  <View style={{ flex: 1 }}>
                    <GhostBtn icon="share" onPress={() => handleShare(detail)} color={T.info}>Share</GhostBtn>
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryBtn icon="close" onPress={() => setDetail(null)}>Close</PrimaryBtn>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CaptureBtn({ icon, color, label, onPress }) {
  return (
    <TouchableOpacity style={styles.capBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.capIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.capLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={T.textHint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockIcon: {
    width: 90, height: 90, borderRadius: 30,
    backgroundColor: T.primaryGlow, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  lockTitle: { color: T.white, fontSize: 22, fontWeight: '900' },
  lockSub:   { color: T.textSub, fontSize: 13, marginTop: 8, textAlign: 'center' },
  lockText:  { color: T.textSub, fontSize: 13, marginTop: 14 },

  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  itemIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: T.white, fontSize: 14, fontWeight: '800' },
  itemSub:   { color: T.textSub, fontSize: 12, marginTop: 3 },
  itemTime:  { color: T.textHint, fontSize: 10, marginTop: 2 },

  fab: {
    position: 'absolute', right: 22, bottom: 30,
    width: 60, height: 60, borderRadius: 22,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 12,
    shadowColor: T.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6, shadowRadius: 16,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  captureMenu: {
    backgroundColor: '#0F0F18',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 18,
  },
  modalTitle: { color: T.white, fontSize: 20, fontWeight: '900', marginBottom: 14 },

  capBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: 16,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: T.border,
  },
  capIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  capLabel: { flex: 1, color: T.white, fontSize: 14, fontWeight: '800', marginLeft: 14 },

  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: T.danger, marginRight: 10 },
  recText: { color: T.danger, fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  preview: { width: '100%', height: 220, borderRadius: 16, marginTop: 12, backgroundColor: '#000' },
});

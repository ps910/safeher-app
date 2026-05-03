/**
 * ContactsScreen v7.0 — Emergency contacts manager (Dark Luxury)
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEmergency } from '../context/EmergencyContext';
import {
  Screen, Header, Card, SectionTitle, PrimaryBtn, GhostBtn,
  Input, Label, EmptyState, Stat, Pill, T,
} from '../components/ui';

export default function ContactsScreen() {
  const { emergencyContacts, addContact, removeContact, updateContact } = useEmergency();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [name,    setName]      = useState('');
  const [phone,   setPhone]     = useState('');
  const [relation, setRelation] = useState('');
  const [tier,    setTier]      = useState(1);
  const [saving,  setSaving]    = useState(false);

  const tier1 = useMemo(() => emergencyContacts.filter(c => (c.tier || 1) === 1), [emergencyContacts]);
  const tier2 = useMemo(() => emergencyContacts.filter(c => (c.tier || 1) === 2), [emergencyContacts]);

  const openAdd = () => {
    setEditing(null);
    setName(''); setPhone(''); setRelation(''); setTier(1);
    setModalVisible(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setName(c.name || ''); setPhone(c.phone || ''); setRelation(c.relationship || ''); setTier(c.tier || 1);
    setModalVisible(true);
  };

  const validate = () => {
    if (!name.trim()) return 'Please enter a name.';
    if (!phone.trim()) return 'Please enter a phone number.';
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.length < 7) return 'Phone number is too short.';
    if (!cleaned.startsWith('+') && cleaned.length < 10) return 'Use international format (+91…) or full local number.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { Alert.alert('Invalid', err); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), phone: phone.trim(), relationship: relation.trim(), tier };
      if (editing) await updateContact(editing.id, payload);
      else         await addContact(payload);
      setModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save contact.');
    } finally { setSaving(false); }
  };

  const handleDelete = (c) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${c.name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await removeContact(c.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  };

  const handleCall = (phone) => {
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Cannot place call.'));
  };

  const renderContact = (c) => (
    <Card key={c.id} padded={false}>
      <TouchableOpacity style={styles.contactRow} onPress={() => openEdit(c)} activeOpacity={0.7}>
        <View style={[styles.avatar, { backgroundColor: c.tier === 2 ? '#7C4DFF22' : T.primaryGlow }]}>
          <Text style={styles.avatarText}>{(c.name || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.contactName}>{c.name}</Text>
            {c.tier === 1 && <Pill icon="star" label="Primary" color={T.primary} active />}
          </View>
          <Text style={styles.contactPhone}>{c.phone}</Text>
          {c.relationship ? <Text style={styles.contactRel}>{c.relationship}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.actionIconBtn}
          onPress={() => handleCall(c.phone)}
          accessibilityLabel={`Call ${c.name}`}
          hitSlop={8}
        >
          <Ionicons name="call" size={18} color={T.success} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionIconBtn, { marginLeft: 6 }]}
          onPress={() => handleDelete(c)}
          accessibilityLabel={`Delete ${c.name}`}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={T.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Card>
  );

  return (
    <Screen>
      <Header
        title="Emergency Contacts"
        subtitle="Alerted the moment you trigger SOS"
        right={
          <TouchableOpacity style={styles.addIcon} onPress={openAdd} accessibilityLabel="Add contact">
            <Ionicons name="add" size={22} color={T.white} />
          </TouchableOpacity>
        }
      />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
        <Stat icon="people" label="Total"     value={emergencyContacts.length} color={T.primary} />
        <Stat icon="star"   label="Primary"   value={tier1.length}              color={T.warning} />
        <Stat icon="shield" label="Secondary" value={tier2.length}              color={T.info} />
      </View>

      {emergencyContacts.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No emergency contacts yet"
          subtitle="Add at least one trusted person who'll be notified the moment you trigger SOS."
          action={<PrimaryBtn icon="add" onPress={openAdd}>Add First Contact</PrimaryBtn>}
        />
      ) : (
        <>
          {tier1.length > 0 && (<><SectionTitle>Primary contacts • alerted first</SectionTitle>{tier1.map(renderContact)}</>)}
          {tier2.length > 0 && (<><SectionTitle>Secondary contacts</SectionTitle>{tier2.map(renderContact)}</>)}
          <PrimaryBtn icon="person-add" onPress={openAdd} style={{ marginTop: 8 }}>Add Another Contact</PrimaryBtn>
        </>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editing ? 'Edit Contact' : 'Add Contact'}</Text>

            <Label>Full Name</Label>
            <Input value={name} onChangeText={setName} placeholder="Priya Sharma" autoCapitalize="words" />

            <Label>Phone Number (with country code)</Label>
            <Input value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />

            <Label>Relationship (optional)</Label>
            <Input value={relation} onChangeText={setRelation} placeholder="Mother, Friend, Partner…" />

            <Label>Priority Tier</Label>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.tierBtn, tier === 1 && { backgroundColor: T.primaryGlow, borderColor: T.primary }]}
                onPress={() => setTier(1)}
              >
                <Ionicons name="star" size={14} color={tier === 1 ? T.primary : T.textSub} />
                <Text style={[styles.tierBtnText, tier === 1 && { color: T.white }]}>Primary</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tierBtn, tier === 2 && { backgroundColor: 'rgba(124,77,255,0.15)', borderColor: T.info }]}
                onPress={() => setTier(2)}
              >
                <Ionicons name="shield" size={14} color={tier === 2 ? T.info : T.textSub} />
                <Text style={[styles.tierBtnText, tier === 2 && { color: T.white }]}>Secondary</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <View style={{ flex: 1 }}>
                <GhostBtn onPress={() => setModalVisible(false)} color={T.textSub}>Cancel</GhostBtn>
              </View>
              <View style={{ flex: 2 }}>
                <PrimaryBtn icon="checkmark" loading={saving} onPress={handleSave}>
                  {editing ? 'Save Changes' : 'Add Contact'}
                </PrimaryBtn>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: T.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: T.primary, shadowOpacity: 0.5, shadowRadius: 12,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: T.white, fontSize: 20, fontWeight: '900' },
  contactName: { color: T.white, fontSize: 15, fontWeight: '800' },
  contactPhone: { color: T.textSub, fontSize: 12, marginTop: 3 },
  contactRel: { color: T.textHint, fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  actionIconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0F0F18',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 18,
  },
  modalTitle: { color: T.white, fontSize: 22, fontWeight: '900', marginBottom: 14 },

  tierBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1.5, borderColor: T.border,
  },
  tierBtnText: { color: T.textSub, fontWeight: '800', fontSize: 12 },
});

/**
 * Contacts Screen - Manage emergency contacts
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  StatusBar,
} from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';
import { formatPhoneNumber, makePhoneCall, sendSMS } from '../utils/helpers';

const ContactsScreen = ({ navigation }) => {
  const { emergencyContacts, addContact, removeContact } = useEmergency();
  const [modalVisible, setModalVisible] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phone: '',
    relation: '',
  });

  const handleAddContact = async () => {
    if (!newContact.name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (!newContact.phone.trim() || newContact.phone.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    await addContact(newContact);
    setNewContact({ name: '', phone: '', relation: '' });
    setModalVisible(false);
  };

  const handleRemoveContact = (contact) => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${contact.name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeContact(contact.id),
        },
      ]
    );
  };

  const ContactCard = ({ contact }) => (
    <View style={[styles.contactCard, SHADOWS.small]}>
      <View style={styles.contactAvatar}>
        <Text style={styles.avatarText}>
          {contact.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactPhone}>
          {formatPhoneNumber(contact.phone)}
        </Text>
        {contact.relation ? (
          <Text style={styles.contactRelation}>{contact.relation}</Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.success + '20' }]}
          onPress={() => makePhoneCall(contact.phone)}
        >
          <Text style={styles.actionIcon}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.primary + '20' }]}
          onPress={() =>
            sendSMS(contact.phone, 'Hey, I wanted to let you know I\'m safe! 💕')
          }
        >
          <Text style={styles.actionIcon}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.danger + '20' }]}
          onPress={() => handleRemoveContact(contact)}
        >
          <Text style={styles.actionIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Contacts</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtn}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Info Banner */}
        <View style={[styles.infoBanner, SHADOWS.small]}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Add trusted people who will receive your SOS alerts with your live
            location during emergencies.
          </Text>
        </View>

        {/* Contact Count */}
        <View style={styles.countSection}>
          <Text style={styles.countText}>
            {emergencyContacts.length} / 5 Contacts
          </Text>
          <View style={styles.countBar}>
            <View
              style={[
                styles.countBarFill,
                { width: `${(emergencyContacts.length / 5) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Contact List */}
        {emergencyContacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No Emergency Contacts</Text>
            <Text style={styles.emptyText}>
              Add at least one trusted contact to enable the SOS feature.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, SHADOWS.small]}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>+ Add First Contact</Text>
            </TouchableOpacity>
          </View>
        ) : (
          emergencyContacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, SHADOWS.large]}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <Text style={styles.inputLabel}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Mom, Dad, Sister"
              placeholderTextColor={COLORS.textLight}
              value={newContact.name}
              onChangeText={(text) =>
                setNewContact({ ...newContact, name: text })
              }
            />

            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 9876543210"
              placeholderTextColor={COLORS.textLight}
              value={newContact.phone}
              onChangeText={(text) =>
                setNewContact({ ...newContact, phone: text })
              }
              keyboardType="phone-pad"
              maxLength={15}
            />

            <Text style={styles.inputLabel}>Relation (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Mother, Father, Friend"
              placeholderTextColor={COLORS.textLight}
              value={newContact.relation}
              onChangeText={(text) =>
                setNewContact({ ...newContact, relation: text })
              }
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  setNewContact({ name: '', phone: '', relation: '' });
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, SHADOWS.small]}
                onPress={handleAddContact}
              >
                <Text style={styles.saveBtnText}>Save Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Add Button */}
      {emergencyContacts.length < 5 && emergencyContacts.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, SHADOWS.large]}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
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
  addBtn: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: '600',
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SIZES.md,
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SIZES.sm,
  },
  infoText: {
    flex: 1,
    fontSize: SIZES.small,
    color: '#1565C0',
    lineHeight: 18,
  },
  countSection: {
    marginBottom: SIZES.md,
  },
  countText: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SIZES.xs,
  },
  countBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  countBarFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  contactCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  avatarText: {
    fontSize: SIZES.h3,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  contactInfo: {
    marginBottom: SIZES.sm,
  },
  contactName: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  contactPhone: {
    fontSize: SIZES.body,
    color: COLORS.primary,
    marginTop: 2,
  },
  contactRelation: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  contactActions: {
    flexDirection: 'row',
    gap: SIZES.sm,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SIZES.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SIZES.md,
  },
  emptyTitle: {
    fontSize: SIZES.h3,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.sm,
  },
  emptyText: {
    fontSize: SIZES.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SIZES.xl,
    marginBottom: SIZES.lg,
  },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SIZES.xl,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusFull,
  },
  emptyBtnText: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
    padding: SIZES.lg,
    paddingBottom: SIZES.xxl,
  },
  modalTitle: {
    fontSize: SIZES.h3,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SIZES.lg,
  },
  inputLabel: {
    fontSize: SIZES.small,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
    marginLeft: SIZES.xs,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.md,
    fontSize: SIZES.body,
    color: COLORS.text,
    marginBottom: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SIZES.md,
    marginTop: SIZES.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.body,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: '300',
  },
});

export default ContactsScreen;

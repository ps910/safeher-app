/**
 * SafetyTipsScreen v7.0 — Curated safety tips by category (Dark Luxury)
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen, Header, Card, SectionTitle, T } from '../components/ui';

const CATEGORIES = [
  { id: 'all',       label: 'All',        icon: 'sparkles',  color: T.primary },
  { id: 'physical',  label: 'Physical',   icon: 'walk',      color: '#42A5F5' },
  { id: 'digital',   label: 'Digital',    icon: 'phone-portrait', color: '#CE93D8' },
  { id: 'travel',    label: 'Travel',     icon: 'car-sport', color: T.warning },
  { id: 'home',      label: 'Home',       icon: 'home',      color: T.info },
  { id: 'workplace', label: 'Work',       icon: 'business',  color: T.teal },
  { id: 'dating',    label: 'Dating',     icon: 'heart',     color: '#EF5350' },
  { id: 'emergency', label: 'Emergency',  icon: 'medical',   color: T.danger },
];

const TIPS = [
  // Physical
  { cat: 'physical', title: 'Walk like you mean it', body: 'Confident posture, head up, eyes scanning. Predators target people who look distracted or lost.' },
  { cat: 'physical', title: 'Avoid earbuds in unfamiliar areas', body: 'Awareness of surroundings is your first defense. Keep at least one ear free in public.' },
  { cat: 'physical', title: 'Carry a personal alarm', body: '120dB+ alarms attract attention and can disorient an attacker. Keep on a keychain, not buried in a bag.' },
  { cat: 'physical', title: 'Trust your gut', body: 'If a situation feels off, leave. You don\'t owe anyone a polite explanation.' },

  // Digital
  { cat: 'digital', title: 'Lock down social media', body: 'Set everything to friends-only. Disable location tags. Don\'t post real-time check-ins.' },
  { cat: 'digital', title: 'Use a password manager', body: 'Reused passwords are how stalkers escalate. 1Password, Bitwarden, or Apple Keychain — pick one.' },
  { cat: 'digital', title: 'Enable 2FA everywhere', body: 'Especially email, banking, and your primary social accounts. Use an authenticator app, not SMS where possible.' },
  { cat: 'digital', title: 'Audit app permissions', body: 'Most apps don\'t need your location, mic, or contacts. Revoke aggressively.' },

  // Travel
  { cat: 'travel', title: 'Share your ride details', body: 'Send your driver\'s name, plate, and ETA to a contact before getting in. Use SafeHer\'s journey tracker.' },
  { cat: 'travel', title: 'Sit behind the driver', body: 'In a cab/rideshare, sit diagonally — easier to exit, harder to grab.' },
  { cat: 'travel', title: 'Keep emergency cash', body: 'A small note hidden in your phone case or shoe. For when phone or cards fail.' },
  { cat: 'travel', title: 'Avoid the same route every day', body: 'Predictable patterns help anyone watching you. Vary your timing if possible.' },

  // Home
  { cat: 'home', title: "Don't announce living alone", body: 'Use plural names on mailboxes & doormats. "The Sharmas" not "Priya".' },
  { cat: 'home', title: 'Verify visitors before opening', body: "Even if they say they're a delivery person. Use a peephole or video doorbell." },
  { cat: 'home', title: 'Keep curtains closed at night', body: 'Lit interiors against dark exteriors are visible from far. Privacy and safety in one.' },
  { cat: 'home', title: 'Have a "duress" code with family', body: 'A normal-sounding word that means "I need help, call police." Practice it.' },

  // Workplace
  { cat: 'workplace', title: 'Document inappropriate behavior', body: 'Date, time, what was said, witnesses. Email it to yourself — creates a timestamped record.' },
  { cat: 'workplace', title: "Know HR's anti-harassment policy", body: 'Read it before you ever need it. Know who to escalate to outside your reporting line.' },
  { cat: 'workplace', title: "Don't leave drinks unattended at work events", body: 'Same rules as a bar apply at office parties.' },
  { cat: 'workplace', title: 'Learn local labor laws', body: 'Knowing your rights changes how you respond. Many countries protect against retaliation for reporting.' },

  // Dating
  { cat: 'dating', title: 'First date in a public place', body: 'Coffee shop, brunch spot, busy bar. Daytime is even better.' },
  { cat: 'dating', title: 'Tell a friend the plan', body: "Where, who, when you'll check in. Use SafeHer's journey tracker if going to their place." },
  { cat: 'dating', title: 'Reverse-image search profile photos', body: 'Catches catfish in 30 seconds. Google Images or Yandex.' },
  { cat: 'dating', title: 'Watch for love-bombing', body: 'Excessive early intensity is a controlling-personality red flag, not romance.' },

  // Emergency
  { cat: 'emergency', title: 'Yell "FIRE!" not "HELP!"', body: 'People reliably respond to fire alarms; many ignore generic distress calls.' },
  { cat: 'emergency', title: 'Aim for vulnerable targets', body: 'Eyes, throat, groin, knees. Not chest or arms. One disabling strike beats five weak ones.' },
  { cat: 'emergency', title: 'Get to a busy public place', body: 'Stores, lit streets, hospitals, hotels. Predators avoid witnesses.' },
  { cat: 'emergency', title: 'Memorize 2 emergency numbers', body: 'Local police + one family member. When stressed, you forget — muscle memory wins.' },
];

export default function SafetyTipsScreen() {
  const [activeCat, setActiveCat] = useState('all');

  const visible = useMemo(() => {
    if (activeCat === 'all') return TIPS;
    return TIPS.filter(t => t.cat === activeCat);
  }, [activeCat]);

  return (
    <Screen>
      <Header title="Safety Tips" subtitle={`${TIPS.length} curated tips • Stay sharp`} />

      <View style={styles.catRow}>
        {CATEGORIES.map(c => {
          const active = activeCat === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.catChip, active && { backgroundColor: `${c.color}22`, borderColor: c.color }]}
              onPress={() => { setActiveCat(c.id); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <Ionicons name={c.icon} size={13} color={active ? c.color : T.textSub} />
              <Text style={[styles.catText, active && { color: c.color }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionTitle>{visible.length} tips • {CATEGORIES.find(c => c.id === activeCat)?.label}</SectionTitle>

      {visible.map((tip, i) => {
        const cat = CATEGORIES.find(c => c.id === tip.cat);
        return (
          <Card key={i}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={[styles.tipIcon, { backgroundColor: `${cat?.color || T.primary}22` }]}>
                <Ionicons name={cat?.icon || 'sparkles'} size={18} color={cat?.color || T.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipBody}>{tip.body}</Text>
              </View>
            </View>
          </Card>
        );
      })}

      <View style={styles.footer}>
        <Ionicons name="heart" size={14} color={T.accent} />
        <Text style={styles.footerText}>Stay safe. Trust yourself.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
  },
  catText: { color: T.textSub, fontSize: 12, fontWeight: '700' },

  tipIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { color: T.white, fontSize: 14, fontWeight: '800' },
  tipBody:  { color: T.textSub, fontSize: 12, marginTop: 6, lineHeight: 18 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  footerText: { color: T.textHint, fontSize: 11, fontStyle: 'italic' },
});

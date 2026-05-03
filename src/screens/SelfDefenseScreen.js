/**
 * SelfDefenseScreen v7.0 — Step-by-step techniques (Dark Luxury)
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { Screen, Header, Card, SectionTitle, T } from '../components/ui';

const TECHNIQUES = [
  {
    id: 'palm-strike',
    name: 'Palm Heel Strike',
    difficulty: 'Beginner',
    target: 'Nose / chin',
    icon: 'hand-right',
    color: T.danger,
    why: 'Stronger than a fist, no risk of breaking knuckles. Aimed at nose, it momentarily blinds the attacker with tearing.',
    steps: [
      'Open hand, fingers together, thumb tucked.',
      'Strike up with the heel of your palm.',
      'Drive through the target — do not pull back early.',
      'Follow up with a knee strike or run.',
    ],
  },
  {
    id: 'knee-strike',
    name: 'Knee to Groin',
    difficulty: 'Beginner',
    target: 'Groin',
    icon: 'walk',
    color: T.warning,
    why: 'A correctly placed knee can disable an attacker for 5–10 seconds. That is your escape window.',
    steps: [
      'Grab the attacker\'s shoulders or head for stability.',
      'Drive the knee straight up into the groin.',
      'Use your hips for power, not just the leg.',
      'Push them away and run.',
    ],
  },
  {
    id: 'eye-strike',
    name: 'Eye Strike',
    difficulty: 'Critical',
    target: 'Eyes',
    icon: 'eye-off',
    color: T.danger,
    why: 'The most disabling target on the body. Even a graze causes involuntary tearing and panic.',
    steps: [
      'Keep fingers slightly bent and stiff (not straight).',
      'Aim with index and middle finger like a fork.',
      'Strike or rake across the eyes.',
      'Your goal is disruption, not injury — escape immediately after.',
    ],
  },
  {
    id: 'wrist-escape',
    name: 'Wrist Grab Escape',
    difficulty: 'Beginner',
    target: 'Self-defense',
    icon: 'hand-left',
    color: T.info,
    why: 'When grabbed, never pull straight back — that\'s where they\'re strongest. Rotate against the thumb.',
    steps: [
      'Make a fist with the trapped hand.',
      'Rotate your wrist toward the attacker\'s thumb.',
      'Pull sharply through the gap their thumb leaves.',
      'Counter-strike if possible, then run.',
    ],
  },
  {
    id: 'choke-defense',
    name: 'Two-Hand Choke Defense',
    difficulty: 'Intermediate',
    target: 'Self-defense',
    icon: 'shield',
    color: T.accent,
    why: 'A choke is a serious threat. You have ~10 seconds before vision narrows. Act fast.',
    steps: [
      'Tuck your chin to protect your throat.',
      'Raise both arms straight up between attacker\'s arms.',
      'Twist your body sharply to one side — this breaks the grip.',
      'Counter with palm strike + knee, then escape.',
    ],
  },
  {
    id: 'ground-defense',
    name: 'Ground Position Defense',
    difficulty: 'Intermediate',
    target: 'Self-defense',
    icon: 'fitness',
    color: T.info,
    why: 'On your back, your legs are stronger than their arms. Use them as your primary weapon.',
    steps: [
      'Lay on your back, knees up, feet between you and attacker.',
      'Kick at knees, shins, or groin — never let them inside your guard.',
      'Roll to one side and push up to standing as soon as possible.',
      'Run toward people, lights, or noise.',
    ],
  },
  {
    id: 'pen-weapon',
    name: 'Pen as Weapon',
    difficulty: 'Beginner',
    target: 'Improvised',
    icon: 'create',
    color: '#FFB300',
    why: 'You probably carry one daily. Held correctly, it strikes harder than a fist and is legal everywhere.',
    steps: [
      'Hold pen with thumb on the cap, point exposed past pinky.',
      'Strike with downward stabbing motion.',
      'Aim for soft tissue: throat, neck, ribs, hand.',
      'Drop the pen and run if escape is possible.',
    ],
  },
];

export default function SelfDefenseScreen() {
  const navigation = useNavigation();
  const [expanded, setExpanded] = useState(null);

  return (
    <Screen>
      <Header title="Self Defense" subtitle={`${TECHNIQUES.length} life-saving techniques`} onBack={() => navigation.goBack()} />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Ionicons name="information-circle" size={20} color={T.warning} style={{ marginTop: 2 }} />
          <Text style={styles.disclaimer}>
            These are last-resort moves. Your first goal is always to escape. If you can run, run.
            Practice these slowly with a trusted partner before you ever need them.
          </Text>
        </View>
      </Card>

      <SectionTitle>Techniques</SectionTitle>
      {TECHNIQUES.map((t) => {
        const open = expanded === t.id;
        return (
          <Card key={t.id} padded={false}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => { setExpanded(open ? null : t.id); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.icon, { backgroundColor: `${t.color}22` }]}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.name}>{t.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={styles.metaPill}>
                    <Text style={[styles.metaText, { color: t.difficulty === 'Critical' ? T.danger : T.textSub }]}>{t.difficulty}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaText}>{t.target}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={T.textHint} />
            </TouchableOpacity>

            {open && (
              <View style={styles.expanded}>
                <Text style={styles.whyLabel}>WHY IT WORKS</Text>
                <Text style={styles.whyText}>{t.why}</Text>

                <Text style={[styles.whyLabel, { marginTop: 14 }]}>STEPS</Text>
                {t.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        );
      })}

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={14} color={T.success} />
        <Text style={styles.footerText}>You are stronger than you think.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  disclaimer: { color: T.textSub, fontSize: 12, lineHeight: 18, flex: 1 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { color: T.white, fontSize: 15, fontWeight: '800' },

  metaPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: T.border,
  },
  metaText: { fontSize: 10, color: T.textSub, fontWeight: '700' },

  expanded: {
    paddingHorizontal: 14, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: T.border,
    paddingTop: 14,
  },
  whyLabel: { color: T.textHint, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  whyText:  { color: T.text, fontSize: 13, lineHeight: 19 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: T.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: T.primary, fontSize: 12, fontWeight: '900' },
  stepText: { flex: 1, color: T.text, fontSize: 13, marginLeft: 12, lineHeight: 19 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  footerText: { color: T.textHint, fontSize: 11, fontStyle: 'italic' },
});

/**
 * SelfDefenseScreen - Step-by-step self-defense techniques
 * Practical moves every girl should know to protect herself
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS } from '../constants/theme';

const TECHNIQUES = [
  {
    id: '1',
    title: 'Palm Strike',
    difficulty: 'Beginner',
    icon: 'hand-left',
    color: '#4CAF50',
    target: 'Nose, chin, or throat',
    description: 'A powerful open-palm strike that can disorient an attacker.',
    steps: [
      'Extend your dominant hand with fingers together',
      'Pull your arm back with elbow bent',
      'Push forward using your hip and shoulder power',
      'Strike with the heel of your palm (bottom of palm)',
      'Aim for the nose, chin, or throat',
      'Immediately create distance and run',
    ],
    tip: 'A palm strike is safer for your hand than a punch and can be just as effective.',
  },
  {
    id: '2',
    title: 'Knee Strike',
    difficulty: 'Beginner',
    icon: 'fitness',
    color: '#FF9800',
    target: 'Groin area',
    description: 'One of the most effective close-range self-defense moves.',
    steps: [
      'If grabbed, grab the attacker\'s shoulders for balance',
      'Shift your weight to one leg',
      'Drive your knee upward with maximum force',
      'Aim for the groin area',
      'Strike multiple times if needed',
      'Push attacker away and RUN immediately',
    ],
    tip: 'This works best when the attacker is very close to you. Use maximum force.',
  },
  {
    id: '3',
    title: 'Elbow Strike',
    difficulty: 'Beginner',
    icon: 'body',
    color: '#F44336',
    target: 'Face, temple, ribs',
    description: 'Your elbow is one of the hardest parts of your body - use it!',
    steps: [
      'Bend your arm at a 90-degree angle',
      'Rotate your body toward the attacker',
      'Swing your bent arm horizontally',
      'Strike with the point of your elbow',
      'Aim for the face, temple, jaw, or ribs',
      'Follow up with a knee strike if possible, then flee',
    ],
    tip: 'Elbow strikes work great in close quarters when you can\'t extend your arm for a punch.',
  },
  {
    id: '4',
    title: 'Wrist Escape',
    difficulty: 'Intermediate',
    icon: 'link',
    color: '#9C27B0',
    target: 'Breaking wrist grabs',
    description: 'Escape when someone grabs your wrist tightly.',
    steps: [
      'Stay calm - don\'t pull away instinctively',
      'Rotate your arm toward the attacker\'s thumb',
      'The thumb is the weakest part of their grip',
      'Yank your arm quickly through the gap between thumb and fingers',
      'Step back immediately to create distance',
      'Run to safety or use another strike if needed',
    ],
    tip: 'Always move toward the thumb side - it\'s the weakest link in any grip.',
  },
  {
    id: '5',
    title: 'Bear Hug Defense',
    difficulty: 'Intermediate',
    icon: 'shield',
    color: '#2196F3',
    target: 'Escaping from behind',
    description: 'Escape when grabbed from behind in a bear hug.',
    steps: [
      'Lower your center of gravity by bending your knees',
      'Shift your hips to one side',
      'Strike backward with your elbow into attacker\'s ribs',
      'Stomp down hard on attacker\'s foot with your heel',
      'Turn your body to face the attacker',
      'Strike with palm or knee and RUN immediately',
    ],
    tip: 'Making yourself heavier by dropping your weight makes it harder for them to hold you.',
  },
  {
    id: '6',
    title: 'Eye Gouge / Distraction',
    difficulty: 'Advanced',
    icon: 'eye',
    color: '#FF5722',
    target: 'Eyes',
    description: 'Last resort technique for life-threatening situations only.',
    steps: [
      'ONLY use in life-threatening emergencies',
      'Use your thumb or fingers',
      'Push firmly toward the attacker\'s eyes',
      'This will cause immediate pain and temporary blindness',
      'Use the moment of distraction to break free',
      'RUN and call for help immediately',
    ],
    tip: '⚠️ This is a last-resort move when your life is in danger. Always prioritize escape.',
  },
  {
    id: '7',
    title: 'Verbal Self-Defense',
    difficulty: 'Beginner',
    icon: 'megaphone',
    color: '#607D8B',
    target: 'De-escalation',
    description: 'Use your voice as your first line of defense.',
    steps: [
      'Stand tall with confident body language',
      'Use a loud, firm voice - SHOUT "BACK OFF" or "STOP"',
      'Make eye contact - don\'t look down',
      'Set clear boundaries: "Do NOT come closer"',
      'Draw attention from bystanders by yelling "FIRE!" or "HELP!"',
      'If they don\'t stop, prepare your physical defense',
    ],
    tip: 'Yelling "FIRE" gets more attention than "Help" in public. Use it strategically.',
  },
  {
    id: '8',
    title: 'Bag / Object Defense',
    difficulty: 'Beginner',
    icon: 'bag-handle',
    color: '#795548',
    target: 'Using everyday objects',
    description: 'Turn everyday objects into defensive tools.',
    steps: [
      'Keys: Hold between fingers for striking',
      'Bag: Swing heavy bag at attacker\'s head',
      'Umbrella: Use as a jabbing weapon',
      'Water bottle: Strike with the bottom',
      'High heels: Use the heel as a striking point',
      'Spray: Deodorant or perfume spray to the eyes',
    ],
    tip: 'Always be aware of objects around you that can be used for defense.',
  },
];

export default function SelfDefenseScreen() {
  const navigation = useNavigation();
  const [selectedTechnique, setSelectedTechnique] = useState(null);

  if (selectedTechnique) {
    const t = selectedTechnique;
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedTechnique(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          {/* Technique header */}
          <View style={[styles.detailBanner, { backgroundColor: t.color + '15' }]}>
            <Ionicons name={t.icon} size={50} color={t.color} />
            <Text style={[styles.detailDifficulty, { color: t.color }]}>{t.difficulty}</Text>
            <Text style={styles.detailTarget}>Target: {t.target}</Text>
          </View>

          <Text style={styles.detailDesc}>{t.description}</Text>

          {/* Steps */}
          <Text style={styles.stepsTitle}>Step-by-Step Guide</Text>
          {t.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: t.color }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}

          {/* Tip */}
          <View style={styles.tipCard}>
            <Ionicons name="bulb" size={22} color="#FF8F00" />
            <Text style={styles.tipText}>💡 {t.tip}</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Self Defense</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.introText}>
          🥊 Learn practical techniques to protect yourself. Remember: the goal is always to escape and get to safety.
        </Text>

        {TECHNIQUES.map((tech) => (
          <TouchableOpacity
            key={tech.id}
            style={styles.techCard}
            onPress={() => setSelectedTechnique(tech)}
          >
            <View style={[styles.techIcon, { backgroundColor: tech.color + '20' }]}>
              <Ionicons name={tech.icon} size={28} color={tech.color} />
            </View>
            <View style={styles.techInfo}>
              <Text style={styles.techTitle}>{tech.title}</Text>
              <Text style={styles.techDesc} numberOfLines={1}>{tech.description}</Text>
              <View style={styles.techMeta}>
                <Text style={[styles.techDifficulty, { color: tech.color }]}>
                  {tech.difficulty}
                </Text>
                <Text style={styles.techTarget}>→ {tech.target}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        ))}

        {/* Bottom reminder */}
        <View style={styles.reminderCard}>
          <Ionicons name="heart" size={24} color="#E91E63" />
          <Text style={styles.reminderText}>
            Your safety matters more than anything. Always trust your instincts.
            If something feels wrong, leave immediately. No possession is worth your life.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
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
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.surface, letterSpacing: 0.3 },
  content: { padding: 16 },

  introText: {
    fontSize: 14, color: COLORS.text, lineHeight: 21, marginBottom: 18,
    backgroundColor: '#FFF3E0', padding: 16, borderRadius: 16,
    borderLeftWidth: 4, borderLeftColor: '#FF9800',
  },

  // Tech cards
  techCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: 18, padding: 16, marginBottom: 12, ...SHADOWS.small,
  },
  techIcon: {
    width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  techInfo: { flex: 1, marginLeft: 14 },
  techTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  techDesc: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  techMeta: { flexDirection: 'row', marginTop: 6, alignItems: 'center' },
  techDifficulty: { fontSize: 11, fontWeight: '700' },
  techTarget: { fontSize: 11, color: COLORS.textLight, marginLeft: 10 },

  // Detail view
  detailContent: { padding: 16 },
  detailBanner: {
    borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  detailDifficulty: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  detailTarget: { fontSize: 13, color: COLORS.textLight, marginTop: 4 },
  detailDesc: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginBottom: 20 },
  stepsTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepNum: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  stepNumText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  stepText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20, paddingTop: 4 },

  tipCard: {
    flexDirection: 'row', backgroundColor: '#FFF8E1', borderRadius: 12,
    padding: 14, marginTop: 10, alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 13, color: '#F57F17', marginLeft: 10, lineHeight: 18 },

  reminderCard: {
    flexDirection: 'row', backgroundColor: '#FCE4EC', borderRadius: 16,
    padding: 16, marginTop: 8, alignItems: 'flex-start',
  },
  reminderText: { flex: 1, fontSize: 13, color: '#C62828', marginLeft: 12, lineHeight: 19 },
});

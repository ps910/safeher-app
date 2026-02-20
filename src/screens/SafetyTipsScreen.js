/**
 * Safety Tips Screen - Educational safety information
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';

const SAFETY_CATEGORIES = [
  {
    id: 'travel',
    icon: '🚗',
    title: 'Travel Safety',
    color: '#1565C0',
    tips: [
      {
        title: 'Share your ride details',
        desc: 'Always share your cab/auto details (number plate, driver info) with a trusted person before traveling.',
      },
      {
        title: 'Sit behind the driver',
        desc: 'When taking a cab alone, sit in the back seat behind the driver for safety.',
      },
      {
        title: 'Stay on well-lit routes',
        desc: 'Avoid dark, lonely streets especially at night. Stick to main roads with street lights.',
      },
      {
        title: 'Keep your phone charged',
        desc: 'Always ensure your phone is charged before heading out. Carry a power bank.',
      },
      {
        title: 'Trust your instincts',
        desc: 'If a situation feels wrong, leave immediately. Your instincts are your best guide.',
      },
      {
        title: 'Verify ride details',
        desc: 'Before getting in a cab, verify the car model, license plate, and driver name match the app.',
      },
    ],
  },
  {
    id: 'online',
    icon: '💻',
    title: 'Online Safety',
    color: '#7B1FA2',
    tips: [
      {
        title: 'Protect personal info',
        desc: 'Never share your address, phone number, or daily routine on social media.',
      },
      {
        title: 'Strong passwords',
        desc: 'Use different strong passwords for each account. Enable two-factor authentication.',
      },
      {
        title: 'Be cautious with strangers',
        desc: 'Never meet someone from the internet alone. Always meet in public places.',
      },
      {
        title: 'Check privacy settings',
        desc: 'Review and restrict your social media privacy settings regularly.',
      },
      {
        title: 'Report cyberbullying',
        desc: 'Don\'t engage with bullies. Screenshot evidence and report to authorities.',
      },
    ],
  },
  {
    id: 'self-defense',
    icon: '🥋',
    title: 'Self Defense',
    color: '#C62828',
    tips: [
      {
        title: 'Aim for vulnerable spots',
        desc: 'In an attack, target eyes, nose, throat, and groin. Strike hard and escape.',
      },
      {
        title: 'Make noise',
        desc: 'Scream loudly to attract attention. Carry a whistle or personal alarm.',
      },
      {
        title: 'Use everyday items',
        desc: 'Keys, pens, umbrella, bag - anything can be used as a defensive tool.',
      },
      {
        title: 'Learn basic moves',
        desc: 'Take a basic self-defense class. Practice palm strikes, knee kicks, and escape techniques.',
      },
      {
        title: 'Stay aware of surroundings',
        desc: 'Avoid using headphones in isolated areas. Stay alert and aware at all times.',
      },
      {
        title: 'Carry pepper spray',
        desc: 'Keep a pepper spray or safety keychain easily accessible in your purse or pocket.',
      },
    ],
  },
  {
    id: 'workplace',
    icon: '🏢',
    title: 'Workplace Safety',
    color: '#00695C',
    tips: [
      {
        title: 'Know your rights',
        desc: 'Familiarize yourself with sexual harassment laws and company policies.',
      },
      {
        title: 'Document everything',
        desc: 'Keep records of any inappropriate behavior - dates, times, witnesses.',
      },
      {
        title: 'Report harassment',
        desc: 'Report to HR, Internal Complaints Committee, or Women Helpline (1091).',
      },
      {
        title: 'Trusted colleagues',
        desc: 'Build a network of trusted colleagues who can support you.',
      },
      {
        title: 'Safe commute',
        desc: 'If working late, arrange safe transport. Ask for company cab facility.',
      },
    ],
  },
  {
    id: 'emergency',
    icon: '🆘',
    title: 'Emergency Preparedness',
    color: '#E65100',
    tips: [
      {
        title: 'Emergency contacts ready',
        desc: 'Keep emergency numbers on speed dial. Add ICE (In Case of Emergency) contacts.',
      },
      {
        title: 'Know nearby safe spots',
        desc: 'Identify police stations, hospitals, and public places near your regular routes.',
      },
      {
        title: 'Code word system',
        desc: 'Set up a code word with family/friends that signals you need help.',
      },
      {
        title: 'First aid basics',
        desc: 'Learn basic first aid - CPR, wound care, and how to handle emergencies.',
      },
      {
        title: 'Important documents',
        desc: 'Keep digital copies of important documents accessible on your phone.',
      },
    ],
  },
  {
    id: 'home',
    icon: '🏠',
    title: 'Home Safety',
    color: '#4527A0',
    tips: [
      {
        title: 'Secure your home',
        desc: 'Always lock doors and windows. Don\'t open the door for strangers.',
      },
      {
        title: 'Verify visitors',
        desc: 'Ask for ID from delivery/service people. Call the company to verify if unsure.',
      },
      {
        title: 'Know your neighbors',
        desc: 'Build good relations with neighbors. They can be your first help in emergencies.',
      },
      {
        title: 'Safety devices',
        desc: 'Install a door chain, peephole, and if possible, a security camera.',
      },
    ],
  },
];

const SafetyTipsScreen = ({ navigation }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const CategoryCard = ({ category }) => (
    <TouchableOpacity
      style={[
        styles.categoryCard,
        SHADOWS.small,
        { borderLeftColor: category.color },
      ]}
      onPress={() => setSelectedCategory(category)}
    >
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryTitle}>{category.title}</Text>
        <Text style={styles.categoryCount}>
          {category.tips.length} tips
        </Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );

  const TipCard = ({ tip, index }) => (
    <View style={[styles.tipCard, SHADOWS.small]}>
      <View style={styles.tipNumber}>
        <Text style={styles.tipNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.tipContent}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        <Text style={styles.tipDesc}>{tip.desc}</Text>
      </View>
    </View>
  );

  // Tips Detail View
  if (selectedCategory) {
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor={selectedCategory.color} barStyle="light-content" />
        <View style={[styles.header, { backgroundColor: selectedCategory.color }]}>
          <TouchableOpacity onPress={() => setSelectedCategory(null)}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectedCategory.icon} {selectedCategory.title}
          </Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {selectedCategory.tips.map((tip, index) => (
            <TipCard key={index} tip={tip} index={index} />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  }

  // Categories View
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#F57F17" barStyle="light-content" />

      <View style={[styles.header, { backgroundColor: '#F57F17' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📖 Safety Tips</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Quick Stats */}
        <View style={[styles.statsCard, SHADOWS.medium]}>
          <Text style={styles.statsTitle}>📚 Safety Knowledge Base</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {SAFETY_CATEGORIES.length}
              </Text>
              <Text style={styles.statLabel}>Categories</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {SAFETY_CATEGORIES.reduce(
                  (sum, cat) => sum + cat.tips.length,
                  0
                )}
              </Text>
              <Text style={styles.statLabel}>Total Tips</Text>
            </View>
          </View>
        </View>

        {/* Categories */}
        <Text style={styles.sectionTitle}>Categories</Text>
        {SAFETY_CATEGORIES.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}

        {/* Emergency Reminder */}
        <View style={[styles.reminderCard, SHADOWS.small]}>
          <Text style={styles.reminderIcon}>🚨</Text>
          <View style={styles.reminderContent}>
            <Text style={styles.reminderTitle}>Remember!</Text>
            <Text style={styles.reminderText}>
              In any emergency, call 112 (National Emergency Number) or 1091
              (Women Helpline) immediately.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SIZES.md,
  },
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    marginBottom: SIZES.lg,
  },
  statsTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SIZES.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: SIZES.xl,
  },
  statNumber: {
    fontSize: SIZES.h1,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.md,
  },
  categoryCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.sm,
    borderLeftWidth: 4,
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: SIZES.md,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: SIZES.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  categoryCount: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  arrow: {
    fontSize: SIZES.h4,
    color: COLORS.textLight,
  },
  tipCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    marginBottom: SIZES.sm,
  },
  tipNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
    marginTop: 2,
  },
  tipNumberText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: SIZES.body,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: SIZES.body,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.xs,
  },
  tipDesc: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  reminderCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.md,
  },
  reminderIcon: {
    fontSize: 28,
    marginRight: SIZES.md,
  },
  reminderContent: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: SIZES.body,
    fontWeight: 'bold',
    color: COLORS.danger,
    marginBottom: 4,
  },
  reminderText: {
    fontSize: SIZES.small,
    color: '#B71C1C',
    lineHeight: 18,
  },
});

export default SafetyTipsScreen;

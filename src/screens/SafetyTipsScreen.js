/**
 * Safety Tips Screen v2.0 - Comprehensive safety guide with beautiful UI
 * Covers: Physical, Digital, Dating, Home, Workplace, Emergency, Hidden Camera safety
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Dimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');

const SAFETY_CATEGORIES = [
  {
    id: 'physical',
    icon: 'shield-checkmark',
    emoji: '🛡️',
    title: 'Physical Safety',
    subtitle: 'Stay safe in public spaces',
    color: '#1565C0',
    tips: [
      {
        title: 'Stay aware of surroundings',
        desc: 'Avoid being absorbed in your phone, especially at night or in unfamiliar areas. Keep your head up and scan your environment.',
        priority: 'high',
      },
      {
        title: 'Trust your gut',
        desc: 'If something or someone feels off, remove yourself from the situation without hesitation. Your instincts are a powerful safety tool.',
        priority: 'high',
      },
      {
        title: 'Walk with confidence',
        desc: 'Walk confidently and with purpose — body language matters. Attackers often target people who appear distracted or vulnerable.',
        priority: 'medium',
      },
      {
        title: 'Share your live location',
        desc: 'Share your live location with a trusted friend or family member when going somewhere new. Use WhatsApp or Google Maps sharing.',
        priority: 'high',
      },
      {
        title: 'Avoid isolated routes',
        desc: 'Especially at night, stick to well-lit, populated areas. Plan your route in advance and let someone know your path.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'transport',
    icon: 'car',
    emoji: '🚗',
    title: 'Transportation Safety',
    subtitle: 'Rideshare & commute tips',
    color: '#00838F',
    tips: [
      {
        title: 'Verify rideshare details',
        desc: "Before getting into a rideshare, verify the driver's name, photo, license plate, and car model. Ask \"Who are you here for?\" instead of giving your name.",
        priority: 'high',
      },
      {
        title: 'Sit behind the driver',
        desc: 'Never sit in the front seat of a rideshare. The back seat gives you more exit options and distance from the driver.',
        priority: 'high',
      },
      {
        title: 'Share trip details',
        desc: 'Share your trip details with someone before you leave. Most rideshare apps have a built-in trip sharing feature.',
        priority: 'medium',
      },
      {
        title: 'Speak your location aloud',
        desc: 'If you feel unsafe in a cab or rideshare, call someone and speak your location aloud. This signals to the driver that someone knows where you are.',
        priority: 'high',
      },
      {
        title: 'Keep phone charged',
        desc: 'Always ensure your phone is charged before heading out. Carry a power bank as backup.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'digital',
    icon: 'phone-portrait',
    emoji: '📱',
    title: 'Digital Safety',
    subtitle: 'Protect yourself online',
    color: '#7B1FA2',
    tips: [
      {
        title: 'Keep social media private',
        desc: 'Avoid sharing real-time location, daily routines, or home address publicly. Set accounts to private and review followers regularly.',
        priority: 'high',
      },
      {
        title: 'Be cautious with connections',
        desc: 'Be selective about who you accept as followers or connections online. Review new requests carefully before accepting.',
        priority: 'medium',
      },
      {
        title: 'Reverse image search',
        desc: 'Reverse image search your own photos occasionally to check for misuse. Use Google Images or TinEye.',
        priority: 'low',
      },
      {
        title: 'Strong passwords & 2FA',
        desc: 'Use strong, unique passwords and enable two-factor authentication on ALL accounts. Use a password manager.',
        priority: 'high',
      },
      {
        title: 'Beware of catfishing',
        desc: 'Verify identities before meeting anyone from online in person. Video call first and trust your instincts.',
        priority: 'high',
      },
      {
        title: 'Document online harassment',
        desc: 'If being harassed online, screenshot everything and report it. Do not delete anything — it could be evidence.',
        priority: 'high',
      },
    ],
  },
  {
    id: 'dating',
    icon: 'heart',
    emoji: '💜',
    title: 'Dating Safety',
    subtitle: 'Safe dating practices',
    color: '#C62828',
    tips: [
      {
        title: 'Meet in public places',
        desc: 'For first dates, always meet in a public place and arrange your own transportation. Never let a stranger pick you up from home.',
        priority: 'high',
      },
      {
        title: 'Tell a friend your plans',
        desc: "Tell a friend where you're going, who you're meeting, and when you expect to be back. Send them the person's profile.",
        priority: 'high',
      },
      {
        title: "Don't leave drinks unattended",
        desc: 'Drink spiking is a real risk. Always watch your drink being made and never accept open drinks from strangers.',
        priority: 'high',
      },
      {
        title: 'Set up a code word',
        desc: 'Have a code word with a friend that signals you need help or an excuse to leave. A simple text is enough.',
        priority: 'medium',
      },
      {
        title: 'Video call before meeting',
        desc: 'Video call someone before meeting them in person to verify they are who they say they are. This catches catfishing.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'home',
    icon: 'home',
    emoji: '🏠',
    title: 'Home Safety',
    subtitle: 'Secure your personal space',
    color: '#4527A0',
    tips: [
      {
        title: "Don't open doors to strangers",
        desc: "Don't open the door to strangers without verifying who they are. Ask for ID from delivery/service people.",
        priority: 'high',
      },
      {
        title: "Don't post when away",
        desc: "Avoid posting on social media when you're away from home — it signals an empty house. Post photos after you return.",
        priority: 'medium',
      },
      {
        title: 'Know your neighbors',
        desc: 'A good community network is a genuine safety asset. Introduce yourself and exchange phone numbers.',
        priority: 'medium',
      },
      {
        title: 'Keep phone accessible',
        desc: 'Keep a phone charged and nearby, especially at night. Consider keeping a charged spare phone as backup.',
        priority: 'medium',
      },
      {
        title: 'Install security devices',
        desc: 'Install a door chain, peephole, and if possible a security camera. Smart doorbells provide visibility without opening the door.',
        priority: 'low',
      },
    ],
  },
  {
    id: 'workplace',
    icon: 'briefcase',
    emoji: '💼',
    title: 'Workplace Safety',
    subtitle: 'Know your rights at work',
    color: '#00695C',
    tips: [
      {
        title: 'Know your rights',
        desc: 'Sexual harassment is illegal and reportable. Familiarize yourself with your company policies and the law.',
        priority: 'high',
      },
      {
        title: 'Document everything',
        desc: 'Document any uncomfortable interactions — dates, times, witnesses, what was said. Keep copies outside work systems.',
        priority: 'high',
      },
      {
        title: 'Build a trusted network',
        desc: 'Have trusted colleagues you can alert if a situation feels unsafe. Safety in numbers is real.',
        priority: 'medium',
      },
      {
        title: "Don't stay late alone",
        desc: "Don't feel pressured to stay late alone with someone who makes you uncomfortable. Your safety comes first.",
        priority: 'medium',
      },
      {
        title: 'Report to authorities',
        desc: 'Report harassment to HR, Internal Complaints Committee, or Women Helpline (1091). You are not alone.',
        priority: 'high',
      },
    ],
  },
  {
    id: 'emergency',
    icon: 'alert-circle',
    emoji: '🆘',
    title: 'Emergency Preparedness',
    subtitle: 'Be ready for anything',
    color: '#E65100',
    tips: [
      {
        title: 'Emergency contacts on speed dial',
        desc: 'Save emergency contacts including local police and at least two trusted people. Add ICE contacts to your phone.',
        priority: 'high',
      },
      {
        title: 'Learn basic self-defense',
        desc: 'Even a short self-defense course builds confidence and practical skills. Practice regularly to build muscle memory.',
        priority: 'medium',
      },
      {
        title: 'Carry a personal safety alarm',
        desc: 'A loud alarm keychain can deter attackers and attract attention. They are small, cheap, and effective.',
        priority: 'medium',
      },
      {
        title: 'Know nearby safe spots',
        desc: 'Know the location of the nearest hospital, police station, or safe public space wherever you go.',
        priority: 'high',
      },
      {
        title: 'Use safety apps',
        desc: 'Apps like bSafe, Noonlight, or Life360 allow friends to monitor your location and trigger alerts automatically.',
        priority: 'medium',
      },
      {
        title: 'Code word system',
        desc: 'Set up a code word with family/friends that signals you need immediate help. Keep it simple and memorable.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'hidden-camera',
    icon: 'eye-off',
    emoji: '📷',
    title: 'Hidden Camera Detection',
    subtitle: 'Protect your privacy everywhere',
    color: '#37474F',
    tips: [
      {
        title: 'Visual inspection first',
        desc: 'Scan the room for anything out of place — a small hole in the wall, suspicious objects, oddly placed smoke detectors, hooks, clocks, or air fresheners.',
        priority: 'high',
      },
      {
        title: 'The mirror test',
        desc: 'Touch your fingertip to a mirror. If there is NO gap between your finger and its reflection, it may be a two-way mirror. Real mirrors have a small gap.',
        priority: 'high',
      },
      {
        title: 'Use your phone camera',
        desc: 'Many hidden cameras use infrared light invisible to naked eye but visible through a smartphone camera. Turn off lights and scan for purple/white blinking lights.',
        priority: 'high',
      },
      {
        title: 'RF detector apps',
        desc: 'Apps like Glint Finder or Hidden Camera Detector can help detect wireless signals from hidden cameras. Physical RF detectors are more reliable.',
        priority: 'medium',
      },
      {
        title: 'Change in corners',
        desc: "Change in corners or against walls where camera angles are most limited. Block gaps in curtains or doors with your bag.",
        priority: 'medium',
      },
      {
        title: 'Scan hotel rooms thoroughly',
        desc: 'Be cautious in budget hotels, Airbnbs, and guesthouses — scan smoke detectors, alarm clocks, and decorative items carefully.',
        priority: 'high',
      },
      {
        title: 'If you find a camera',
        desc: "DON'T touch it — preserve evidence. Leave immediately, report to management AND police. Photograph the device from a distance.",
        priority: 'high',
      },
    ],
  },
  {
    id: 'leaked-content',
    icon: 'lock-closed',
    emoji: '🔒',
    title: 'If Content is Leaked',
    subtitle: 'Steps to take & get help',
    color: '#880E4F',
    tips: [
      {
        title: "Don't panic — take action",
        desc: 'There are concrete steps you can take. Report the content to the platform using their "non-consensual intimate imagery" reporting tools.',
        priority: 'high',
      },
      {
        title: "Use Google's Remove Tool",
        desc: "Google's removal tool for non-consensual intimate images can remove content from search results. This significantly limits the spread.",
        priority: 'high',
      },
      {
        title: 'Contact support organizations',
        desc: 'Reach out to Cyber Civil Rights Initiative or your local equivalent for legal and emotional support. You are not alone.',
        priority: 'high',
      },
      {
        title: 'Consult a lawyer',
        desc: 'Sharing intimate images without consent is a criminal offense in India, UK, US, Australia, and many other countries.',
        priority: 'medium',
      },
      {
        title: 'Tell someone you trust',
        desc: 'You do not have to deal with this alone. Reach out to a trusted friend, family member, or counselor. It is NEVER your fault.',
        priority: 'high',
      },
    ],
  },
];

const SafetyTipsScreen = ({ navigation }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedTip, setExpandedTip] = useState(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#FF1744';
      case 'medium': return '#FF9100';
      case 'low': return '#00C853';
      default: return COLORS.textLight;
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high': return 'Essential';
      case 'medium': return 'Important';
      case 'low': return 'Good to Know';
      default: return '';
    }
  };

  const TipCard = ({ tip, index, categoryColor }) => {
    const isExpanded = expandedTip === index;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpandedTip(isExpanded ? null : index)}
        style={[styles.tipCard, SHADOWS.small]}
      >
        <View style={styles.tipHeader}>
          <View style={[styles.tipNumber, { backgroundColor: categoryColor }]}>
            <Text style={styles.tipNumberText}>{index + 1}</Text>
          </View>
          <View style={styles.tipHeaderContent}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(tip.priority) + '18' }]}>
              <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(tip.priority) }]} />
              <Text style={[styles.priorityText, { color: getPriorityColor(tip.priority) }]}>
                {getPriorityLabel(tip.priority)}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={COLORS.textLight}
          />
        </View>
        {isExpanded && (
          <View style={styles.tipExpandedContent}>
            <View style={styles.tipDivider} />
            <Text style={styles.tipDesc}>{tip.desc}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── Tips Detail View ───────────────────────────────────────────
  if (selectedCategory) {
    const cat = selectedCategory;
    const highPriorityCount = cat.tips.filter(t => t.priority === 'high').length;

    return (
      <View style={styles.container}>
        <StatusBar backgroundColor={cat.color} barStyle="light-content" />

        {/* Header */}
        <View style={[styles.detailHeader, { backgroundColor: cat.color }]}>
          <TouchableOpacity
            onPress={() => { setSelectedCategory(null); setExpandedTip(null); }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.detailHeaderContent}>
            <Text style={styles.detailHeaderEmoji}>{cat.emoji}</Text>
            <Text style={styles.detailHeaderTitle}>{cat.title}</Text>
            <Text style={styles.detailHeaderSubtitle}>{cat.subtitle}</Text>
          </View>
          <View style={styles.detailStats}>
            <View style={styles.detailStatItem}>
              <Text style={styles.detailStatNumber}>{cat.tips.length}</Text>
              <Text style={styles.detailStatLabel}>Tips</Text>
            </View>
            <View style={styles.detailStatDivider} />
            <View style={styles.detailStatItem}>
              <Text style={styles.detailStatNumber}>{highPriorityCount}</Text>
              <Text style={styles.detailStatLabel}>Essential</Text>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.detailContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.detailScrollContent}
        >
          {/* Priority Legend */}
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>Priority Guide</Text>
            <View style={styles.legendRow}>
              {[
                { label: 'Essential', color: '#FF1744' },
                { label: 'Important', color: '#FF9100' },
                { label: 'Good to Know', color: '#00C853' },
              ].map((item, i) => (
                <View key={i} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Tips */}
          {cat.tips.map((tip, index) => (
            <TipCard key={index} tip={tip} index={index} categoryColor={cat.color} />
          ))}

          {/* Bottom CTA */}
          <View style={[styles.ctaCard, { borderColor: cat.color + '40' }]}>
            <Ionicons name="share-social" size={24} color={cat.color} />
            <Text style={styles.ctaText}>
              Share these tips with your friends and family. Awareness saves lives.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  }

  // ─── Categories View ────────────────────────────────────────────
  const totalTips = SAFETY_CATEGORIES.reduce((sum, cat) => sum + cat.tips.length, 0);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.primaryDark} barStyle="light-content" />

      {/* Header */}
      <View style={styles.mainHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.mainHeaderContent}>
          <Text style={styles.mainHeaderTitle}>Safety Guide</Text>
          <Text style={styles.mainHeaderSubtitle}>Knowledge is your best protection</Text>
        </View>
      </View>

      <ScrollView
        style={styles.mainContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.mainScrollContent}
      >
        {/* Stats Overview */}
        <View style={[styles.overviewCard, SHADOWS.medium]}>
          <View style={styles.overviewHeader}>
            <Ionicons name="library" size={24} color={COLORS.primary} />
            <Text style={styles.overviewTitle}>Safety Knowledge Base</Text>
          </View>
          <View style={styles.overviewStats}>
            <View style={styles.overviewStatItem}>
              <Text style={styles.overviewStatNumber}>{SAFETY_CATEGORIES.length}</Text>
              <Text style={styles.overviewStatLabel}>Categories</Text>
            </View>
            <View style={styles.overviewStatDivider} />
            <View style={styles.overviewStatItem}>
              <Text style={styles.overviewStatNumber}>{totalTips}</Text>
              <Text style={styles.overviewStatLabel}>Safety Tips</Text>
            </View>
            <View style={styles.overviewStatDivider} />
            <View style={styles.overviewStatItem}>
              <Text style={styles.overviewStatNumber}>24/7</Text>
              <Text style={styles.overviewStatLabel}>Access</Text>
            </View>
          </View>
        </View>

        {/* Category Cards */}
        <Text style={styles.sectionTitle}>Browse Categories</Text>
        {SAFETY_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            activeOpacity={0.7}
            style={[styles.categoryCard, SHADOWS.small]}
            onPress={() => setSelectedCategory(category)}
          >
            <View style={[styles.categoryIconBox, { backgroundColor: category.color + '15' }]}>
              <Ionicons name={category.icon} size={28} color={category.color} />
            </View>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryTitle}>{category.title}</Text>
              <Text style={styles.categorySubtitle}>{category.subtitle}</Text>
              <View style={styles.categoryMeta}>
                <View style={[styles.categoryBadge, { backgroundColor: category.color + '15' }]}>
                  <Text style={[styles.categoryBadgeText, { color: category.color }]}>
                    {category.tips.length} tips
                  </Text>
                </View>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    {category.tips.filter(t => t.priority === 'high').length} essential
                  </Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color={category.color} />
          </TouchableOpacity>
        ))}

        {/* Emergency Reminder */}
        <View style={[styles.emergencyCard, SHADOWS.medium]}>
          <View style={styles.emergencyIconBox}>
            <Ionicons name="call" size={28} color="#FF1744" />
          </View>
          <View style={styles.emergencyContent}>
            <Text style={styles.emergencyTitle}>In Any Emergency</Text>
            <Text style={styles.emergencyText}>
              Call 112 (National Emergency) or 1091 (Women Helpline) immediately. Your safety comes first.
            </Text>
            <View style={styles.emergencyButtons}>
              <TouchableOpacity
                style={[styles.emergencyBtn, { backgroundColor: '#FF1744' }]}
                onPress={() => Linking.openURL('tel:112')}
              >
                <Ionicons name="call" size={16} color="#FFF" />
                <Text style={styles.emergencyBtnText}>Call 112</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emergencyBtn, { backgroundColor: '#7B1FA2' }]}
                onPress={() => Linking.openURL('tel:1091')}
              >
                <Ionicons name="woman" size={16} color="#FFF" />
                <Text style={styles.emergencyBtnText}>Call 1091</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Spread Awareness */}
        <View style={[styles.awarenessCard, SHADOWS.small]}>
          <Ionicons name="megaphone" size={24} color={COLORS.primary} />
          <View style={styles.awarenessContent}>
            <Text style={styles.awarenessTitle}>Spread Awareness</Text>
            <Text style={styles.awarenessText}>
              Teach younger girls and friends about these safety checks. Your awareness could protect others.
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

  // ─── Main Header ───────────────────────────────────────────────
  mainHeader: {
    backgroundColor: COLORS.primaryDark,
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  mainHeaderContent: {
    marginTop: 12,
  },
  mainHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
  },
  mainHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },

  // ─── Detail Header ─────────────────────────────────────────────
  detailHeader: {
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  detailHeaderContent: {
    alignItems: 'center',
    marginTop: 8,
  },
  detailHeaderEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  detailHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  detailHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  detailStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  detailStatItem: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  detailStatNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  detailStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  detailStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Content ───────────────────────────────────────────────────
  mainContent: {
    flex: 1,
  },
  mainScrollContent: {
    padding: 16,
  },
  detailContent: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 16,
  },

  // ─── Overview Card ─────────────────────────────────────────────
  overviewCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  overviewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 10,
  },
  overviewStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  overviewStatItem: {
    alignItems: 'center',
  },
  overviewStatNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
  },
  overviewStatLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  overviewStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },

  // ─── Section Title ─────────────────────────────────────────────
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
    marginTop: 4,
  },

  // ─── Category Card ─────────────────────────────────────────────
  categoryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  categorySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  categoryMeta: {
    flexDirection: 'row',
    marginTop: 8,
  },
  categoryBadge: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // ─── Legend ────────────────────────────────────────────────────
  legendCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // ─── Tip Card ──────────────────────────────────────────────────
  tipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipNumberText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  tipHeaderContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tipExpandedContent: {
    marginTop: 10,
  },
  tipDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 10,
  },
  tipDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  // ─── CTA Card ──────────────────────────────────────────────────
  ctaCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ctaText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },

  // ─── Emergency Card ────────────────────────────────────────────
  emergencyCard: {
    backgroundColor: '#FFF0F0',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  emergencyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF174415',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  emergencyContent: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#C62828',
    marginBottom: 4,
  },
  emergencyText: {
    fontSize: 13,
    color: '#B71C1C',
    lineHeight: 19,
    marginBottom: 12,
  },
  emergencyButtons: {
    flexDirection: 'row',
  },
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 10,
  },
  emergencyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
    marginLeft: 6,
  },

  // ─── Awareness Card ────────────────────────────────────────────
  awarenessCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  awarenessContent: {
    flex: 1,
    marginLeft: 14,
  },
  awarenessTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  awarenessText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});

export default SafetyTipsScreen;

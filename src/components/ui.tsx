/**
 * SafeHer Design System v7.0 — Dark Luxury Primitives
 *
 * Reusable building blocks so every screen looks consistent
 * and we don't repeat 200 lines of styles per file.
 */
import React, { ReactNode, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Platform, Animated, ActivityIndicator, Switch, ViewStyle,
  TextStyle, StyleProp, Pressable, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ────────────────────────────────────────────────────────────────
//  TOKENS
// ────────────────────────────────────────────────────────────────
export const T = {
  bg:           '#07070B',
  bgGradient:   '#0E0E18',
  surface:      'rgba(255,255,255,0.03)',
  surfaceElev:  'rgba(255,255,255,0.05)',
  card:         'rgba(30,30,42,0.65)',
  cardElev:     'rgba(40,40,55,0.85)',
  border:       'rgba(255,255,255,0.06)',
  borderActive: 'rgba(255,42,112,0.4)',

  primary:      '#FF2A70',
  primaryDark:  '#D81B60',
  primaryGlow:  'rgba(255,42,112,0.3)',
  accent:       '#FF8FAB',

  white:        '#FFFFFF',
  text:         '#F0F0F8',
  textSub:      '#8B8C9E',
  textHint:     '#5C5D72',

  danger:       '#FF1744',
  warning:      '#FFB300',
  success:      '#00E676',
  info:         '#7C4DFF',
  blue:         '#4FC3F7',
  teal:         '#26A69A',
  orange:       '#FF6D00',
} as const;

// ────────────────────────────────────────────────────────────────
//  SCREEN — page wrapper with consistent padding + status bar
// ────────────────────────────────────────────────────────────────
export function Screen({ children, scroll = true, style }: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.screen, style]}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      {scroll
        ? <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        : <View style={s.scroll}>{children}</View>}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  HEADER — back button + title + optional action
// ────────────────────────────────────────────────────────────────
export function Header({ title, subtitle, onBack, right }: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={s.header}>
      {onBack && (
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={T.white} />
        </Pressable>
      )}
      <View style={{ flex: 1, marginLeft: onBack ? 12 : 0 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle && <Text style={s.headerSub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  GLASS CARD
// ────────────────────────────────────────────────────────────────
export function Card({ children, style, padded = true, onPress }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}) {
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      style={({ pressed }: any) => [s.card, padded && { padding: 16 }, pressed && onPress && { opacity: 0.7 }, style]}
    >
      {children}
    </Wrap>
  );
}

// ────────────────────────────────────────────────────────────────
//  SECTION TITLE
// ────────────────────────────────────────────────────────────────
export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.section, style]}>{children}</Text>;
}

// ────────────────────────────────────────────────────────────────
//  LIST ROW
// ────────────────────────────────────────────────────────────────
export function Row({ icon, iconColor, title, subtitle, right, onPress, danger, last }: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const Wrap: any = onPress ? Pressable : View;
  const tint = iconColor || (danger ? T.danger : T.primary);
  return (
    <Wrap
      onPress={onPress}
      style={({ pressed }: any) => [s.row, !last && s.rowDivider, pressed && onPress && { backgroundColor: 'rgba(255,255,255,0.02)' }]}
    >
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: `${tint}1F` }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: icon ? 12 : 0 }}>
        <Text style={[s.rowTitle, danger && { color: T.danger }]}>{title}</Text>
        {subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      {right || (onPress && <Ionicons name="chevron-forward" size={16} color={T.textHint} />)}
    </Wrap>
  );
}

// ────────────────────────────────────────────────────────────────
//  PRIMARY BUTTON
// ────────────────────────────────────────────────────────────────
export function PrimaryBtn({ children, onPress, loading, style, danger, icon }: {
  children: ReactNode;
  onPress?: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  danger?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 200 }).start();
  const onOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 200 }).start();
  const bg = danger ? T.danger : T.primary;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[s.primaryBtn, { backgroundColor: bg, shadowColor: bg }, style]}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        disabled={loading}
        activeOpacity={1}
      >
        {loading ? <ActivityIndicator color={T.white} /> : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon && <Ionicons name={icon} size={18} color={T.white} />}
            <Text style={s.primaryBtnText}>{children}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────
//  OUTLINE / GHOST BUTTON
// ────────────────────────────────────────────────────────────────
export function GhostBtn({ children, onPress, style, icon, color = T.primary }: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
}) {
  return (
    <TouchableOpacity
      style={[s.ghostBtn, { borderColor: color }, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Ionicons name={icon} size={16} color={color} />}
        <Text style={[s.ghostBtnText, { color }]}>{children}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ────────────────────────────────────────────────────────────────
//  GLASS INPUT
// ────────────────────────────────────────────────────────────────
export function Input(props: React.ComponentProps<typeof TextInput> & { style?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = React.useState(false);
  const { style, ...rest } = props;
  return (
    <View style={[s.inputWrap, focused && { borderColor: T.borderActive }, style]}>
      <TextInput
        {...rest}
        placeholderTextColor={T.textHint}
        style={s.input}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  LABEL
// ────────────────────────────────────────────────────────────────
export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

// ────────────────────────────────────────────────────────────────
//  PILL
// ────────────────────────────────────────────────────────────────
export function Pill({ icon, label, color = T.primary, active }: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  active?: boolean;
}) {
  const tint = active ? color : T.textSub;
  const bg = active ? `${color}1A` : 'rgba(255,255,255,0.04)';
  return (
    <View style={[s.pill, { borderColor: active ? color : T.border, backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={10} color={tint} />}
      <Text style={[s.pillText, { color: tint }]}>{label}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  TOGGLE ROW
// ────────────────────────────────────────────────────────────────
export function ToggleRow({ icon, iconColor, title, subtitle, value, onValueChange, last }: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  const tint = iconColor || T.primary;
  return (
    <View style={[s.row, !last && s.rowDivider]}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: `${tint}1F` }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: icon ? 12 : 0 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: T.primaryGlow }}
        thumbColor={value ? T.primary : '#aaa'}
        ios_backgroundColor="rgba(255,255,255,0.1)"
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  EMPTY STATE
// ────────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'sparkles-outline', title, subtitle, action }: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={36} color={T.primary} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle && <Text style={s.emptySub}>{subtitle}</Text>}
      {action && <View style={{ marginTop: 18 }}>{action}</View>}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  STAT CARD
// ────────────────────────────────────────────────────────────────
export function Stat({ icon, label, value, color = T.primary }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <View style={s.stat}>
      <View style={[s.statIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
//  ANIMATED ORBS BACKGROUND
// ────────────────────────────────────────────────────────────────
export function FloatingOrb({ size, color, startX, startY, duration }: {
  size: number; color: string; startX: number; startY: number; duration: number;
}) {
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(startY)).current;
  React.useEffect(() => {
    const animate = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(x, { toValue: startX + 30, duration: duration * 0.6, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(x, { toValue: startX - 15, duration: duration * 0.4, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(x, { toValue: startX,      duration: duration * 0.3, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(y, { toValue: startY - 40, duration: duration * 0.5, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(y, { toValue: startY + 20, duration: duration * 0.5, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
          Animated.timing(y, { toValue: startY,      duration: duration * 0.3, useNativeDriver: true }),
        ]),
      ]).start(animate);
    };
    animate();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: 0.12,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    />
  );
}

// ────────────────────────────────────────────────────────────────
//  STYLES
// ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 40,
  },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: T.white, letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: T.textSub, marginTop: 2 },

  // Card
  card: {
    backgroundColor: T.card, borderRadius: 18,
    borderWidth: 1, borderColor: T.border,
    marginBottom: 14,
  },

  // Section
  section: {
    fontSize: 11, fontWeight: '800', color: T.textSub, letterSpacing: 1.5,
    marginTop: 8, marginBottom: 10, textTransform: 'uppercase',
  },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: T.border },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: T.text },
  rowSub:   { fontSize: 11, color: T.textSub, marginTop: 2 },

  // Buttons
  primaryBtn: {
    paddingVertical: 16, alignItems: 'center', borderRadius: 18,
    elevation: 8, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 16,
  },
  primaryBtnText: { color: T.white, fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },
  ghostBtn: {
    paddingVertical: 14, alignItems: 'center', borderRadius: 18,
    borderWidth: 1.5, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  ghostBtnText: { fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },

  // Input
  inputWrap: {
    borderRadius: 14, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.surface,
  },
  input: { color: T.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },
  label: { color: T.textSub, fontSize: 11, fontWeight: '800', marginBottom: 6, marginTop: 14, letterSpacing: 0.6 },

  // Pill
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Empty
  empty: { alignItems: 'center', padding: 32 },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: T.primaryGlow, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: T.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:   { color: T.textSub, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 },

  // Stat
  stat: {
    flex: 1, backgroundColor: T.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: T.border,
  },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '900', color: T.white },
  statLabel: { fontSize: 11, color: T.textSub, marginTop: 2, fontWeight: '600' },
});

export default { T, Screen, Header, Card, SectionTitle, Row, PrimaryBtn, GhostBtn, Input, Label, Pill, ToggleRow, EmptyState, Stat, FloatingOrb };

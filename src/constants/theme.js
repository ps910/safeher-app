/**
 * App Theme - Colors, Fonts & Styling Constants
 * Girl Safety App — Modern, clean, empowering design system
 * 
 * v2.0: Dark mode support via useColorScheme()
 */
import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

// ─── Light Mode Colors ───────────────────────────────────────────
export const LIGHT_COLORS = {
  // Primary palette - empowering pink/magenta, refined for premium feel
  primary: '#FF2A70',
  primaryDark: '#D81B60',
  primaryLight: '#FF8FAB',
  secondary: '#7C4DFF',
  secondaryDark: '#512DA8',
  secondaryLight: '#D1C4E9',

  // Status colors with slight vibrancy enhancements
  danger: '#FF1744',
  dangerLight: '#FF8A80',
  success: '#00E676',
  successDark: '#00C853',
  warning: '#FFC400',
  warningDark: '#FF8F00',
  info: '#2979FF',

  // Neutrals - Cleaner, softer
  white: '#FFFFFF',
  surface: '#FFFFFF',
  background: '#F8F9FB', // Softer, cleaner background
  card: '#FFFFFF',
  text: '#1A1A24',
  textSecondary: '#6B6C7E',
  textLight: '#A3A4B8',
  border: '#E8E9F2',
  shadow: '#00000015',
  overlay: 'rgba(0,0,0,0.4)',

  // Deep Premium Gradients
  gradientPrimary: ['#FF2A70', '#C2185B'],
  gradientSOS: ['#FF1744', '#D50000'],
  gradientPurple: ['#7C4DFF', '#4A148C'],
  gradientSafe: ['#00E676', '#00C853'],
  gradientGlass: ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)'],

  // Category colors
  physical: '#2979FF',
  digital: '#AB47BC',
  dating: '#E53935',
  home: '#5E35B1',
  workplace: '#00897B',
  emergency: '#F4511E',
  camera: '#455A64',
};

// ─── Dark Mode Colors ────────────────────────────────────────────
export const DARK_COLORS = {
  // Deep space dark luxury
  primary: '#FF337A',
  primaryDark: '#E91E63',
  primaryLight: '#880E4F',
  secondary: '#B388FF',
  secondaryDark: '#7C4DFF',
  secondaryLight: '#4A148C',

  danger: '#FF5252',
  dangerLight: '#FF1744',
  success: '#69F0AE',
  successDark: '#00E676',
  warning: '#FFFF00',
  warningDark: '#FFD600',
  info: '#64B5F6',

  // Real deep dark mode for AMOLED screens
  white: '#FFFFFF',
  surface: '#15151F', // Dark purple-tinted surface
  background: '#0B0B10', // Deepest background
  card: '#1A1A26', // slightly elevated card
  text: '#F0F0F8',
  textSecondary: '#8B8C9E',
  textLight: '#5C5D72',
  border: 'rgba(255,255,255,0.06)', // subtle borders
  shadow: '#00000099',
  overlay: 'rgba(0,0,0,0.75)',

  gradientPrimary: ['#FF337A', '#C2185B'],
  gradientSOS: ['#FF5252', '#D50000'],
  gradientPurple: ['#B388FF', '#5E35B1'],
  gradientSafe: ['#69F0AE', '#00E676'],
  gradientGlass: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],

  physical: '#42A5F5',
  digital: '#CE93D8',
  dating: '#EF5350',
  home: '#7E57C2',
  workplace: '#26A69A',
  emergency: '#FF8A65',
  camera: '#78909C',
};

// ─── Default export (light) for backwards compatibility ──────────
export const COLORS = {
  ...LIGHT_COLORS,
  // Aliases for screens that use these names
  grey:       '#9E9EB8',
  darkGrey:   '#555770',
  lightGrey:  '#E8E8F0',
};

export const FONTS = {
  bold: 'System',
  semiBold: 'System',
  medium: 'System',
  regular: 'System',
  light: 'System',
};

export const SIZES = {
  // Font sizes
  h1: 30,
  h2: 24,
  h3: 20,
  h4: 16,
  body: 14,
  small: 12,
  tiny: 10,

  // Aliases used by auth screens
  base:  14,
  sm:    12,
  xs:    10,
  lg:    18,
  xl:    22,
  xxl:   28,
  xxxl:  26,

  // Spacing (also aliased as sm/md/lg above)
  md: 16,

  // Border radius
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 20,
  radiusXl: 30,
  radiusFull: 999,

  // Icon sizes
  iconSm: 20,
  iconMd: 24,
  iconLg: 32,
  iconXl: 48,
};

export const SHADOWS = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
  },
  glow: {
    shadowColor: '#FF2A70',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 12,
  },
};

// ─── useTheme Hook — Dark Mode Support ───────────────────────────
/**
 * Returns theme-aware colors based on system appearance.
 * Usage: const { colors, isDark } = useTheme();
 */
export const useTheme = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = useMemo(
    () => (isDark ? DARK_COLORS : LIGHT_COLORS),
    [isDark]
  );

  return { colors, isDark, colorScheme };
};

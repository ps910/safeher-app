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
  // Primary palette - empowering pink/magenta
  primary: '#E91E63',
  primaryDark: '#C2185B',
  primaryLight: '#F8BBD0',
  secondary: '#7C4DFF',
  secondaryDark: '#651FFF',
  secondaryLight: '#B388FF',

  // Status colors
  danger: '#FF1744',
  dangerLight: '#FF8A80',
  success: '#00E676',
  successDark: '#00C853',
  warning: '#FFD600',
  warningDark: '#FFC400',
  info: '#2196F3',

  // Neutrals
  white: '#FFFFFF',
  surface: '#FFFFFF',
  background: '#FEF0F5',
  card: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#555770',
  textLight: '#9E9EB8',
  border: '#F0E0E8',
  shadow: '#00000020',
  overlay: 'rgba(0,0,0,0.5)',

  // Gradients
  gradientPrimary: ['#E91E63', '#AD1457'],
  gradientSOS: ['#FF1744', '#D50000'],
  gradientPurple: ['#7C4DFF', '#4A148C'],
  gradientSafe: ['#00E676', '#00C853'],

  // Category colors
  physical: '#1565C0',
  digital: '#7B1FA2',
  dating: '#C62828',
  home: '#4527A0',
  workplace: '#00695C',
  emergency: '#E65100',
  camera: '#37474F',
};

// ─── Dark Mode Colors ────────────────────────────────────────────
export const DARK_COLORS = {
  primary: '#F06292',
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

  white: '#FFFFFF',
  surface: '#1E1E2E',
  background: '#121218',
  card: '#252535',
  text: '#EAEAEF',
  textSecondary: '#A0A0B8',
  textLight: '#6E6E88',
  border: '#2E2E3E',
  shadow: '#00000060',
  overlay: 'rgba(0,0,0,0.7)',

  gradientPrimary: ['#F06292', '#C2185B'],
  gradientSOS: ['#FF5252', '#D50000'],
  gradientPurple: ['#B388FF', '#7C4DFF'],
  gradientSafe: ['#69F0AE', '#00E676'],

  physical: '#42A5F5',
  digital: '#CE93D8',
  dating: '#EF5350',
  home: '#7E57C2',
  workplace: '#26A69A',
  emergency: '#FF8A65',
  camera: '#78909C',
};

// ─── Default export (light) for backwards compatibility ──────────
export const COLORS = LIGHT_COLORS;

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

  // Spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,

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
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
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

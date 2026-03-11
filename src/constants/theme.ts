/**
 * App Theme - Colors, Fonts & Styling Constants
 * Girl Safety App — Modern, clean, empowering design system
 *
 * v2.0: Dark mode support via useColorScheme()
 * TypeScript — type-safe theme access prevents runtime typo bugs
 */
import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────────
interface ColorPalette {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  danger: string;
  dangerLight: string;
  success: string;
  successDark: string;
  warning: string;
  warningDark: string;
  info: string;
  white: string;
  surface: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  textLight: string;
  textMuted?: string;
  border: string;
  shadow: string;
  overlay: string;
  gradientPrimary: string[];
  gradientSOS: string[];
  gradientPurple: string[];
  gradientSafe: string[];
  physical: string;
  digital: string;
  dating: string;
  home: string;
  workplace: string;
  emergency: string;
  camera: string;
  // Aliases
  grey?: string;
  darkGrey?: string;
  lightGrey?: string;
  black?: string;
  sosRed?: string;
  safeGreen?: string;
  cardGradientStart?: string;
  cardGradientEnd?: string;
}

interface FontConfig {
  bold: string;
  semiBold: string;
  medium: string;
  regular: string;
  light: string;
}

interface SizeConfig {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  body: number;
  small: number;
  tiny: number;
  base: number;
  sm: number;
  xs: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
  md: number;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  radiusFull: number;
  iconSm: number;
  iconMd: number;
  iconLg: number;
  iconXl: number;
}

interface ShadowDef {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

interface ShadowConfig {
  small: ShadowDef;
  medium: ShadowDef;
  large: ShadowDef;
}

// ─── Light Mode Colors ───────────────────────────────────────────
export const LIGHT_COLORS: ColorPalette = {
  primary: '#E91E63',
  primaryDark: '#C2185B',
  primaryLight: '#F8BBD0',
  secondary: '#7C4DFF',
  secondaryDark: '#651FFF',
  secondaryLight: '#B388FF',

  danger: '#FF1744',
  dangerLight: '#FF8A80',
  success: '#00E676',
  successDark: '#00C853',
  warning: '#FFD600',
  warningDark: '#FFC400',
  info: '#2196F3',

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

  gradientPrimary: ['#E91E63', '#AD1457'],
  gradientSOS: ['#FF1744', '#D50000'],
  gradientPurple: ['#7C4DFF', '#4A148C'],
  gradientSafe: ['#00E676', '#00C853'],

  physical: '#1565C0',
  digital: '#7B1FA2',
  dating: '#C62828',
  home: '#4527A0',
  workplace: '#00695C',
  emergency: '#E65100',
  camera: '#37474F',
};

// ─── Dark Mode Colors ────────────────────────────────────────────
export const DARK_COLORS: ColorPalette = {
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
export const COLORS: ColorPalette & { grey: string; darkGrey: string; lightGrey: string } = {
  ...LIGHT_COLORS,
  grey:       '#9E9EB8',
  darkGrey:   '#555770',
  lightGrey:  '#E8E8F0',
};

export const FONTS: FontConfig = {
  bold: 'System',
  semiBold: 'System',
  medium: 'System',
  regular: 'System',
  light: 'System',
};

export const SIZES: SizeConfig = {
  h1: 30,
  h2: 24,
  h3: 20,
  h4: 16,
  body: 14,
  small: 12,
  tiny: 10,

  base:  14,
  sm:    12,
  xs:    10,
  lg:    18,
  xl:    22,
  xxl:   28,
  xxxl:  26,

  md: 16,

  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 20,
  radiusXl: 30,
  radiusFull: 999,

  iconSm: 20,
  iconMd: 24,
  iconLg: 32,
  iconXl: 48,
};

export const SHADOWS: ShadowConfig = {
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
interface ThemeReturn {
  colors: ColorPalette;
  isDark: boolean;
  colorScheme: 'light' | 'dark' | null | undefined;
}

export const useTheme = (): ThemeReturn => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = useMemo(
    () => (isDark ? DARK_COLORS : LIGHT_COLORS),
    [isDark]
  );

  return { colors, isDark, colorScheme };
};

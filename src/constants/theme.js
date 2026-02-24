/**
 * App Theme - Colors, Fonts & Styling Constants
 * Girl Safety App — Modern, clean, empowering design system
 */

export const COLORS = {
  // Primary palette - empowering pink/magenta
  primary: '#E91E63',        // Pink - primary brand
  primaryDark: '#C2185B',    // Dark pink
  primaryLight: '#F8BBD0',   // Light pink
  secondary: '#7C4DFF',      // Purple accent
  secondaryDark: '#651FFF',
  secondaryLight: '#B388FF',

  // Status colors
  danger: '#FF1744',         // Emergency red
  dangerLight: '#FF8A80',
  success: '#00E676',        // Green - safe
  successDark: '#00C853',
  warning: '#FFD600',        // Yellow - caution
  warningDark: '#FFC400',
  info: '#2196F3',           // Blue - informational

  // Neutrals
  white: '#FFFFFF',
  surface: '#FFFFFF',          // Surface/card color
  background: '#FEF0F5',     // Soft lavender blush
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

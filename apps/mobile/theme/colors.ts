/**
 * SIJ Production Scheduler - Industrial Craft Theme Colors
 */

// Primary Colors
export const colors = {
  // Primary palette
  navy: '#1E3A5F',
  amber: '#F59E0B',
  cream: '#FAFAF9',
  charcoal: '#1F2937',
  white: '#FFFFFF',

  // Grays
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Status colors
  status: {
    success: '#059669',
    successLight: '#D1FAE5',
    warning: '#D97706',
    warningLight: '#FEF3C7',
    error: '#DC2626',
    errorLight: '#FEE2E2',
    info: '#3B82F6',
    infoLight: '#DBEAFE',
  },

  // Production category colors
  category: {
    cutting: '#8B5CF6',
    cuttingLight: '#EDE9FE',
    silkscreen: '#EC4899',
    silkscreenLight: '#FCE7F3',
    prep: '#06B6D4',
    prepLight: '#CFFAFE',
    sewing: '#F59E0B',
    sewingLight: '#FEF3C7',
    inspection: '#10B981',
    inspectionLight: '#D1FAE5',
  },

  // Semantic aliases
  primary: '#1E3A5F',
  primaryLight: '#2D4A6F',
  accent: '#F59E0B',
  accentDark: '#D97706',
  background: '#FAFAF9',
  surface: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
} as const;

// Theme variants for light/dark mode support
export const lightTheme = {
  text: colors.charcoal,
  textSecondary: colors.gray[500],
  background: colors.cream,
  surface: colors.white,
  tint: colors.navy,
  border: colors.gray[200],
  tabIconDefault: colors.gray[400],
  tabIconSelected: colors.navy,
};

export const darkTheme = {
  text: colors.white,
  textSecondary: colors.gray[400],
  background: colors.gray[900],
  surface: colors.gray[800],
  tint: colors.amber,
  border: colors.gray[700],
  tabIconDefault: colors.gray[500],
  tabIconSelected: colors.amber,
};

// Export theme object for compatibility with existing Colors pattern
export default {
  light: lightTheme,
  dark: darkTheme,
};

// Category color helper
export type CategoryType = 'cutting' | 'silkscreen' | 'prep' | 'sewing' | 'inspection';

export const getCategoryColor = (category: CategoryType) => colors.category[category];
export const getCategoryLightColor = (category: CategoryType) =>
  colors.category[`${category}Light` as keyof typeof colors.category];

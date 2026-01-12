/**
 * SIJ Production Scheduler - Theme System
 * Industrial Craft theme with navy + amber color scheme
 */

export * from './colors';
export * from './typography';
export * from './spacing';

// Re-export defaults
export { default as Colors } from './colors';
export { typography } from './typography';
export { spacing, layout } from './spacing';

// Convenience imports
import { colors, lightTheme, darkTheme, getCategoryColor, getCategoryLightColor } from './colors';
import { typography, fontWeights } from './typography';
import { spacing, layout } from './spacing';

// Unified theme object
export const theme = {
  colors,
  typography,
  spacing,
  layout,
  fontWeights,

  // Theme variants
  light: lightTheme,
  dark: darkTheme,

  // Helpers
  getCategoryColor,
  getCategoryLightColor,
} as const;

export default theme;

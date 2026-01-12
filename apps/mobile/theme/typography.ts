/**
 * SIJ Production Scheduler - Typography System
 */

import { Platform, TextStyle } from 'react-native';

// Font family - Inter on iOS/Android, system fonts as fallback
const fontFamily = Platform.select({
  ios: 'Inter',
  android: 'Inter',
  default: 'Inter, system-ui, -apple-system, sans-serif',
});

const monoFontFamily = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'JetBrainsMono-Regular',
  default: '"JetBrains Mono", monospace',
});

// Font weights mapped to font files (React Native requires separate files)
export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Typography scale
export const typography = {
  // Headings
  h1: {
    fontFamily,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    lineHeight: 34, // 1.2
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontFamily,
    fontSize: 22,
    fontWeight: fontWeights.semibold,
    lineHeight: 29, // 1.3
    letterSpacing: -0.3,
  } as TextStyle,

  h3: {
    fontFamily,
    fontSize: 18,
    fontWeight: fontWeights.semibold,
    lineHeight: 25, // 1.4
    letterSpacing: 0,
  } as TextStyle,

  // Body text
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: fontWeights.regular,
    lineHeight: 24, // 1.5
    letterSpacing: 0,
  } as TextStyle,

  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 21, // 1.5
    letterSpacing: 0,
  } as TextStyle,

  // Labels and captions
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: fontWeights.medium,
    lineHeight: 17, // 1.4
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  } as TextStyle,

  caption: {
    fontFamily,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    lineHeight: 15, // 1.4
    letterSpacing: 0.1,
  } as TextStyle,

  // Button text
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: fontWeights.semibold,
    lineHeight: 24,
    letterSpacing: 0.3,
  } as TextStyle,

  buttonSmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
    letterSpacing: 0.2,
  } as TextStyle,

  // Monospace for numbers, times, quantities
  mono: {
    fontFamily: monoFontFamily,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    letterSpacing: 0,
  } as TextStyle,

  monoLarge: {
    fontFamily: monoFontFamily,
    fontSize: 18,
    fontWeight: fontWeights.medium,
    lineHeight: 24,
    letterSpacing: 0,
  } as TextStyle,
} as const;

export type TypographyVariant = keyof typeof typography;

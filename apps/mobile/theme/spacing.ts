/**
 * SIJ Production Scheduler - Spacing System
 * Base unit: 4px
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Specific spacing for common use cases
export const layout = {
  // Screen padding
  screenPadding: spacing.md,
  screenPaddingHorizontal: spacing.md,
  screenPaddingVertical: spacing.lg,

  // Card styling
  cardPadding: spacing.md,
  cardMargin: spacing.sm,
  cardBorderRadius: 12,

  // Button styling
  buttonPadding: spacing.md,
  buttonPaddingHorizontal: spacing.lg,
  buttonBorderRadius: 8,
  buttonMinHeight: 48, // Touch-friendly

  // Form elements
  inputPadding: spacing.md,
  inputBorderRadius: 8,
  inputMinHeight: 48,

  // List items
  listItemPadding: spacing.md,
  listItemGap: spacing.sm,

  // Section spacing
  sectionGap: spacing.lg,
  itemGap: spacing.sm,

  // Tab bar
  tabBarHeight: 60,
  tabBarPadding: spacing.sm,

  // Category indicator (left border on cards)
  categoryBorderWidth: 4,

  // Touch targets (accessibility minimum)
  minTouchTarget: 44,

  // Shadows
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
  elevation: 2,
} as const;

export type SpacingKey = keyof typeof spacing;
export type LayoutKey = keyof typeof layout;

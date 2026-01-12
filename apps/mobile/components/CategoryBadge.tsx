import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography, CategoryType, getCategoryColor, getCategoryLightColor } from '@/theme';

interface CategoryBadgeProps {
  /** Production category */
  category: CategoryType;
  /** Display style */
  variant?: 'filled' | 'outline' | 'subtle';
  /** Badge size */
  size?: 'small' | 'default';
  /** Additional style */
  style?: ViewStyle;
}

const categoryLabels: Record<CategoryType, string> = {
  cutting: 'Cutting',
  silkscreen: 'Silkscreen',
  prep: 'Prep',
  sewing: 'Sewing',
  inspection: 'Inspection',
};

export function CategoryBadge({
  category,
  variant = 'subtle',
  size = 'default',
  style,
}: CategoryBadgeProps) {
  const categoryColor = getCategoryColor(category);
  const categoryLightColor = getCategoryLightColor(category);

  const badgeStyles: ViewStyle[] = [
    styles.badge,
    size === 'small' && styles.small,
  ];

  const textStyles = [
    styles.text,
    size === 'small' && styles.smallText,
  ];

  if (variant === 'filled') {
    badgeStyles.push({ backgroundColor: categoryColor });
    textStyles.push({ color: colors.white });
  } else if (variant === 'outline') {
    badgeStyles.push({
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: categoryColor,
    });
    textStyles.push({ color: categoryColor });
  } else {
    // subtle
    badgeStyles.push({ backgroundColor: categoryLightColor });
    textStyles.push({ color: categoryColor });
  }

  return (
    <View style={[badgeStyles, style]}>
      <Text style={textStyles}>{categoryLabels[category]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    ...typography.label,
    fontSize: 11,
  },
  smallText: {
    fontSize: 9,
  },
});

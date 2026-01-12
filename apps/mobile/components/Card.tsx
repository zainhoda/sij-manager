import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, layout, CategoryType, getCategoryColor } from '@/theme';

interface CardProps extends ViewProps {
  /** Optional category to show colored left border */
  category?: CategoryType;
  /** Remove padding (useful for custom layouts) */
  noPadding?: boolean;
  /** Custom background color */
  backgroundColor?: string;
}

export function Card({
  children,
  style,
  category,
  noPadding = false,
  backgroundColor,
  ...props
}: CardProps) {
  const cardStyle: ViewStyle[] = [
    styles.card,
    !noPadding && styles.padding,
    category && styles.withCategory,
    category && { borderLeftColor: getCategoryColor(category) },
    backgroundColor && { backgroundColor },
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.cardBorderRadius,
    shadowColor: colors.charcoal,
    shadowOffset: layout.shadowOffset,
    shadowOpacity: layout.shadowOpacity,
    shadowRadius: layout.shadowRadius,
    elevation: layout.elevation,
  },
  padding: {
    padding: layout.cardPadding,
  },
  withCategory: {
    borderLeftWidth: layout.categoryBorderWidth,
    borderTopLeftRadius: layout.cardBorderRadius,
    borderBottomLeftRadius: layout.cardBorderRadius,
  },
});

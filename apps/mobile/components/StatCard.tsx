import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { colors, spacing, typography, layout } from '@/theme';
import { Card } from './Card';

type TrendDirection = 'up' | 'down' | 'neutral';

interface StatCardProps {
  /** Stat label */
  label: string;
  /** Main value */
  value: string | number;
  /** Unit suffix */
  unit?: string;
  /** Previous value for comparison */
  previousValue?: number;
  /** Trend direction override */
  trend?: TrendDirection;
  /** Trend label (e.g., "vs last week") */
  trendLabel?: string;
  /** Icon */
  icon?: React.ReactNode;
  /** Accent color for the card */
  accentColor?: string;
  /** Press handler */
  onPress?: () => void;
  /** Container style */
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  unit,
  previousValue,
  trend: trendOverride,
  trendLabel,
  icon,
  accentColor,
  onPress,
  style,
}: StatCardProps) {
  // Calculate trend if not overridden
  let trend = trendOverride;
  let trendPercent = 0;

  if (!trend && previousValue !== undefined && typeof value === 'number') {
    const diff = value - previousValue;
    trendPercent = previousValue !== 0 ? Math.round((diff / previousValue) * 100) : 0;
    trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
  }

  const content = (
    <Card style={[styles.card, accentColor && { borderTopColor: accentColor, borderTopWidth: 3 }, style]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {icon && <View style={styles.icon}>{icon}</View>}
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>

      {(trend || trendLabel) && (
        <View style={styles.trendRow}>
          {trend && trend !== 'neutral' && (
            <View style={[styles.trendBadge, trend === 'up' ? styles.trendUp : styles.trendDown]}>
              <Text style={styles.trendArrow}>{trend === 'up' ? '↑' : '↓'}</Text>
              {trendPercent !== 0 && (
                <Text style={styles.trendPercent}>{Math.abs(trendPercent)}%</Text>
              )}
            </View>
          )}
          {trendLabel && <Text style={styles.trendLabel}>{trendLabel}</Text>}
        </View>
      )}
    </Card>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }

  return content;
}

// Grid layout for multiple stat cards
interface StatGridProps {
  children: React.ReactNode;
  columns?: 2 | 3;
  style?: ViewStyle;
}

export function StatGrid({ children, columns = 2, style }: StatGridProps) {
  return (
    <View style={[styles.grid, { gap: spacing.sm }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 140,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  icon: {
    opacity: 0.6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  value: {
    ...typography.h1,
    color: colors.text,
  },
  unit: {
    ...typography.body,
    color: colors.textSecondary,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  trendUp: {
    backgroundColor: colors.status.successLight,
  },
  trendDown: {
    backgroundColor: colors.status.errorLight,
  },
  trendArrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendPercent: {
    ...typography.caption,
    fontWeight: '600',
  },
  trendLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

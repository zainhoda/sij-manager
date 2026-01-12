import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { colors, spacing, typography, layout, CategoryType, getCategoryColor } from '@/theme';
import { Card } from './Card';
import { WorkerBadge } from './WorkerBadge';
import { CategoryBadge } from './CategoryBadge';

interface ScheduleEntryProps {
  /** Production category */
  category: CategoryType;
  /** Step name */
  stepName: string;
  /** Time range (e.g., "9:00 - 11:00") */
  timeRange: string;
  /** Assigned worker name */
  workerName?: string;
  /** Planned output quantity */
  plannedOutput?: number;
  /** Actual completed output */
  actualOutput?: number;
  /** Press handler */
  onPress?: () => void;
  /** Additional style */
  style?: ViewStyle;
}

export function ScheduleEntry({
  category,
  stepName,
  timeRange,
  workerName,
  plannedOutput,
  actualOutput,
  onPress,
  style,
}: ScheduleEntryProps) {
  const progress = plannedOutput && actualOutput ? actualOutput / plannedOutput : 0;
  const progressPercent = Math.min(Math.round(progress * 100), 100);

  const content = (
    <Card category={category} style={[styles.card, style]}>
      <View style={styles.header}>
        <Text style={styles.time}>{timeRange}</Text>
        <CategoryBadge category={category} size="small" />
      </View>

      <Text style={styles.stepName}>{stepName}</Text>

      <View style={styles.details}>
        {workerName && (
          <WorkerBadge name={workerName} size="small" showName />
        )}

        {plannedOutput !== undefined && (
          <View style={styles.outputContainer}>
            <Text style={styles.outputText}>
              {actualOutput !== undefined ? `${actualOutput}/${plannedOutput}` : plannedOutput} pcs
            </Text>
          </View>
        )}
      </View>

      {actualOutput !== undefined && plannedOutput !== undefined && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: getCategoryColor(category),
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progressPercent}%</Text>
        </View>
      )}
    </Card>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  time: {
    ...typography.mono,
    color: colors.textSecondary,
  },
  stepName: {
    ...typography.h3,
    color: colors.text,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  outputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  outputText: {
    ...typography.mono,
    color: colors.textSecondary,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.gray[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 32,
    textAlign: 'right',
  },
});

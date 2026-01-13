import { StyleSheet, Text, View, Pressable, ViewStyle, ScrollView } from 'react-native';
import { colors, spacing, typography, CategoryType, getCategoryColor } from '@/theme';

export interface TimeSlot {
  id: string;
  startTime: string; // "HH:MM" format
  endTime: string;
  title: string;
  category?: CategoryType;
  workerName?: string; // Legacy single worker
  workerNames?: string[]; // New: array of worker names for multi-worker tasks
  workerCount?: number; // Number of assigned workers
  progress?: number; // 0-100
  orderColor?: string | null; // Color for order distinction
}

interface DayColumnProps {
  /** Date for this column */
  date: Date;
  /** Time slots/entries for this day */
  slots: TimeSlot[];
  /** Whether this day is today */
  isToday?: boolean;
  /** Whether this day is selected */
  isSelected?: boolean;
  /** Press handler for the day header */
  onDayPress?: () => void;
  /** Press handler for a slot */
  onSlotPress?: (slot: TimeSlot) => void;
  /** Show compact view (for week overview) */
  compact?: boolean;
  /** Container style */
  style?: ViewStyle;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDayHeader(date: Date): { day: string; date: number } {
  return {
    day: DAYS[date.getDay()],
    date: date.getDate(),
  };
}

export function DayColumn({
  date,
  slots,
  isToday = false,
  isSelected = false,
  onDayPress,
  onSlotPress,
  compact = false,
  style,
}: DayColumnProps) {
  const { day, date: dateNum } = formatDayHeader(date);

  if (compact) {
    return (
      <Pressable
        style={[styles.compactContainer, isSelected && styles.compactSelected, style]}
        onPress={onDayPress}
      >
        <Text style={[styles.compactDay, isToday && styles.todayText]}>{day}</Text>
        <View style={[styles.compactDate, isToday && styles.todayBadge]}>
          <Text style={[styles.compactDateText, isToday && styles.todayDateText]}>
            {dateNum}
          </Text>
        </View>
        <View style={styles.compactSlots}>
          {slots.slice(0, 4).map((slot) => (
            <View
              key={slot.id}
              style={[
                styles.compactSlot,
                { backgroundColor: slot.category ? getCategoryColor(slot.category) : colors.gray[300] },
              ]}
            />
          ))}
          {slots.length > 4 && (
            <Text style={styles.moreSlots}>+{slots.length - 4}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Pressable
        style={[styles.header, isSelected && styles.headerSelected]}
        onPress={onDayPress}
      >
        <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
        <View style={[styles.dateBadge, isToday && styles.todayBadge]}>
          <Text style={[styles.dateText, isToday && styles.todayDateText]}>
            {dateNum}
          </Text>
        </View>
      </Pressable>

      <ScrollView style={styles.slotsContainer} showsVerticalScrollIndicator={false}>
        {slots.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyText}>No tasks</Text>
          </View>
        ) : (
          slots.map((slot) => (
            <Pressable
              key={slot.id}
              style={[
                styles.slot,
                slot.category && {
                  borderLeftColor: getCategoryColor(slot.category),
                  borderLeftWidth: 3,
                },
                slot.orderColor && {
                  borderRightColor: slot.orderColor,
                  borderRightWidth: 4,
                },
              ]}
              onPress={() => onSlotPress?.(slot)}
            >
              <View style={styles.slotHeader}>
                <Text style={styles.slotTime}>
                  {slot.startTime} - {slot.endTime}
                </Text>
                {slot.orderColor && (
                  <View
                    style={[styles.orderDot, { backgroundColor: slot.orderColor }]}
                  />
                )}
              </View>
              <Text style={styles.slotTitle} numberOfLines={2}>
                {slot.title}
              </Text>
              {/* Show worker info - support both single and multiple workers */}
              {(slot.workerNames && slot.workerNames.length > 0) ? (
                <Text style={styles.slotWorker} numberOfLines={1}>
                  {slot.workerNames.length === 1
                    ? slot.workerNames[0]
                    : slot.workerNames.length <= 2
                    ? slot.workerNames.join(', ')
                    : `${slot.workerNames[0]} +${slot.workerNames.length - 1}`}
                </Text>
              ) : slot.workerCount && slot.workerCount > 0 ? (
                <Text style={styles.slotWorker}>
                  {slot.workerCount} worker{slot.workerCount > 1 ? 's' : ''}
                </Text>
              ) : slot.workerName ? (
                <Text style={styles.slotWorker}>{slot.workerName}</Text>
              ) : null}
              {slot.progress !== undefined && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${slot.progress}%`,
                          backgroundColor: slot.category
                            ? getCategoryColor(slot.category)
                            : colors.navy,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSelected: {
    backgroundColor: colors.gray[50],
  },
  dayText: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dateBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dateText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  todayBadge: {
    backgroundColor: colors.navy,
  },
  todayText: {
    color: colors.navy,
    fontWeight: '600',
  },
  todayDateText: {
    color: colors.white,
  },
  slotsContainer: {
    flex: 1,
    padding: spacing.xs,
  },
  emptyDay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  slot: {
    backgroundColor: colors.gray[50],
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  slotTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  slotTitle: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
    marginTop: 2,
  },
  slotWorker: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressContainer: {
    marginTop: spacing.xs,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.gray[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Compact styles
  compactContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
  },
  compactSelected: {
    backgroundColor: colors.gray[100],
  },
  compactDay: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
  },
  compactDate: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  compactDateText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  compactSlots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    marginTop: spacing.xs,
    maxWidth: 40,
  },
  compactSlot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  moreSlots: {
    ...typography.caption,
    fontSize: 8,
    color: colors.textMuted,
  },
});

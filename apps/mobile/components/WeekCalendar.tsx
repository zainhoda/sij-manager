import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/theme';
import { DayColumn, TimeSlot } from './DayColumn';

interface WeekCalendarProps {
  /** Start date of the week (should be a Monday or Sunday depending on locale) */
  weekStart: Date;
  /** Slots organized by date key (YYYY-MM-DD) */
  slotsByDate: Record<string, TimeSlot[]>;
  /** Currently selected date */
  selectedDate?: Date;
  /** Handler when week navigation changes */
  onWeekChange?: (weekStart: Date) => void;
  /** Handler when a day is selected */
  onDaySelect?: (date: Date) => void;
  /** Handler when a slot is pressed */
  onSlotPress?: (slot: TimeSlot, date: Date) => void;
  /** Show Saturday */
  showSaturday?: boolean;
  /** Container style */
  style?: ViewStyle;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getWeekDates(weekStart: Date, includeSaturday: boolean): Date[] {
  const dates: Date[] = [];
  const numDays = includeSaturday ? 6 : 5;
  for (let i = 0; i < numDays; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isSameDay(a: Date, b: Date): boolean {
  return formatDateKey(a) === formatDateKey(b);
}

function getWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  } else if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    return `${MONTHS[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()} - ${MONTHS[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  } else {
    return `${MONTHS[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()}, ${weekStart.getFullYear()} - ${MONTHS[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }
}

export function WeekCalendar({
  weekStart,
  slotsByDate,
  selectedDate,
  onWeekChange,
  onDaySelect,
  onSlotPress,
  showSaturday = false,
  style,
}: WeekCalendarProps) {
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const today = new Date();

  const weekDates = getWeekDates(weekStart, showSaturday);

  const goToPrevWeek = () => {
    const prevWeek = new Date(weekStart);
    prevWeek.setDate(weekStart.getDate() - 7);
    onWeekChange?.(prevWeek);
  };

  const goToNextWeek = () => {
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(weekStart.getDate() + 7);
    onWeekChange?.(nextWeek);
  };

  const goToToday = () => {
    // Find the Monday of the current week
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    onWeekChange?.(monday);
    onDaySelect?.(today);
  };

  const handleDaySelect = (date: Date) => {
    onDaySelect?.(date);
    if (viewMode === 'week') {
      setViewMode('day');
    }
  };

  const selectedDaySlots = selectedDate
    ? slotsByDate[formatDateKey(selectedDate)] || []
    : [];

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goToPrevWeek} style={styles.navButton}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>

        <Pressable onPress={goToToday} style={styles.weekLabel}>
          <Text style={styles.weekLabelText}>{getWeekLabel(weekStart)}</Text>
        </Pressable>

        <Pressable onPress={goToNextWeek} style={styles.navButton}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      {/* View mode toggle */}
      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.toggleButton, viewMode === 'week' && styles.toggleActive]}
          onPress={() => setViewMode('week')}
        >
          <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>
            Week
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, viewMode === 'day' && styles.toggleActive]}
          onPress={() => setViewMode('day')}
        >
          <Text style={[styles.toggleText, viewMode === 'day' && styles.toggleTextActive]}>
            Day
          </Text>
        </Pressable>
      </View>

      {/* Calendar content */}
      {viewMode === 'week' ? (
        <View style={styles.weekView}>
          {weekDates.map((date) => {
            const dateKey = formatDateKey(date);
            const slots = slotsByDate[dateKey] || [];
            return (
              <DayColumn
                key={dateKey}
                date={date}
                slots={slots}
                isToday={isSameDay(date, today)}
                isSelected={selectedDate ? isSameDay(date, selectedDate) : false}
                onDayPress={() => handleDaySelect(date)}
                onSlotPress={(slot) => onSlotPress?.(slot, date)}
                compact
                style={styles.dayColumn}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.dayView}>
          {/* Day selector strip */}
          <View style={styles.dayStrip}>
            {weekDates.map((date) => {
              const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
              return (
                <Pressable
                  key={formatDateKey(date)}
                  style={[styles.dayStripItem, isSelected && styles.dayStripSelected]}
                  onPress={() => onDaySelect?.(date)}
                >
                  <Text style={[styles.dayStripDay, isSameDay(date, today) && styles.todayText]}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}
                  </Text>
                  <Text
                    style={[
                      styles.dayStripDate,
                      isSelected && styles.dayStripDateSelected,
                      isSameDay(date, today) && !isSelected && styles.todayText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Selected day detail */}
          {selectedDate && (
            <DayColumn
              date={selectedDate}
              slots={selectedDaySlots}
              isToday={isSameDay(selectedDate, today)}
              isSelected
              onSlotPress={(slot) => onSlotPress?.(slot, selectedDate)}
              style={styles.selectedDayColumn}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  navButton: {
    padding: spacing.sm,
  },
  navText: {
    fontSize: 28,
    color: colors.navy,
    fontWeight: '300',
  },
  weekLabel: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabelText: {
    ...typography.h3,
    color: colors.text,
  },
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    padding: 2,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: colors.white,
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: colors.navy,
  },
  weekView: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  dayColumn: {
    flex: 1,
  },
  dayView: {
    flex: 1,
  },
  dayStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  dayStripItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  dayStripSelected: {
    backgroundColor: colors.navy,
  },
  dayStripDay: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
  },
  dayStripDate: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  dayStripDateSelected: {
    color: colors.white,
  },
  todayText: {
    color: colors.navy,
  },
  selectedDayColumn: {
    flex: 1,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
});

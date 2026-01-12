import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  ViewStyle,
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, layout, spacing, typography } from '@/theme';

interface DatePickerProps {
  /** Currently selected date */
  value: Date | null;
  /** Change handler */
  onChange: (date: Date) => void;
  /** Input label */
  label?: string;
  /** Placeholder when no date selected */
  placeholder?: string;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Disable picker */
  disabled?: boolean;
  /** Container style */
  style?: ViewStyle;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatDate(date: Date): string {
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${date.getFullYear()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  minDate,
  maxDate,
  helperText,
  error,
  disabled = false,
  style,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const selectDate = (day: number) => {
    const selected = new Date(year, month, day);
    if (minDate && selected < minDate) return;
    if (maxDate && selected > maxDate) return;
    onChange(selected);
    setIsOpen(false);
  };

  const isDateDisabled = (day: number): boolean => {
    const date = new Date(year, month, day);
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const renderCalendar = () => {
    const days: React.ReactNode[] = [];

    // Empty cells for days before first of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isSelected = value && isSameDay(date, value);
      const isDisabled = isDateDisabled(day);
      const isToday = isSameDay(date, new Date());

      days.push(
        <Pressable
          key={day}
          style={[
            styles.dayCell,
            isSelected && styles.dayCellSelected,
            isToday && !isSelected && styles.dayCellToday,
          ]}
          onPress={() => !isDisabled && selectDate(day)}
          disabled={isDisabled}
        >
          <Text
            style={[
              styles.dayText,
              isSelected && styles.dayTextSelected,
              isDisabled && styles.dayTextDisabled,
            ]}
          >
            {day}
          </Text>
        </Pressable>
      );
    }

    return days;
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable
        style={[
          styles.selectButton,
          isOpen && styles.selectButtonOpen,
          error && styles.selectButtonError,
          disabled && styles.selectButtonDisabled,
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        <Text style={[styles.selectText, !value && styles.placeholderText]}>
          {value ? formatDate(value) : placeholder}
        </Text>
        <Calendar size={18} color={colors.textSecondary} strokeWidth={1.5} />
      </Pressable>

      {(helperText || error) && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {error || helperText}
        </Text>
      )}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          <View style={styles.calendar} onStartShouldSetResponder={() => true}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={prevMonth} style={styles.navButton}>
                <ChevronLeft size={24} color={colors.navy} strokeWidth={2} />
              </Pressable>
              <Text style={styles.monthYear}>
                {MONTHS[month]} {year}
              </Text>
              <Pressable onPress={nextMonth} style={styles.navButton}>
                <ChevronRight size={24} color={colors.navy} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={styles.weekHeader}>
              {DAYS.map((day) => (
                <View key={day} style={styles.dayCell}>
                  <Text style={styles.weekDayText}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={styles.daysGrid}>{renderCalendar()}</View>

            <View style={styles.calendarFooter}>
              <Pressable
                style={styles.todayButton}
                onPress={() => {
                  const today = new Date();
                  setViewDate(today);
                  selectDate(today.getDate());
                }}
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.text,
    textTransform: 'none',
    fontSize: 14,
    fontWeight: '500',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.inputBorderRadius,
    minHeight: layout.inputMinHeight,
    paddingHorizontal: layout.inputPadding,
  },
  selectButtonOpen: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  selectButtonError: {
    borderColor: colors.status.error,
  },
  selectButtonDisabled: {
    backgroundColor: colors.gray[100],
  },
  selectText: {
    ...typography.body,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textMuted,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.status.error,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  calendar: {
    backgroundColor: colors.white,
    borderRadius: layout.cardBorderRadius,
    padding: spacing.md,
    width: '100%',
    maxWidth: 340,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navButton: {
    padding: spacing.sm,
  },
  monthYear: {
    ...typography.h3,
    color: colors.text,
  },
  weekHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  weekDayText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: colors.navy,
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 20,
  },
  dayText: {
    ...typography.body,
    color: colors.text,
  },
  dayTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  dayTextDisabled: {
    color: colors.textMuted,
  },
  calendarFooter: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  todayButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  todayButtonText: {
    ...typography.button,
    color: colors.navy,
  },
});

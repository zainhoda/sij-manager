import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { View, Text } from '@/components/Themed';
import { WeekCalendar, NoScheduleEmpty, Button, Card, ProductionLogSheet } from '@/components';
import { TimeSlot } from '@/components/DayColumn';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { getSchedules, getScheduleEntry, Schedule, ScheduleEntry } from '@/api/client';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mapCategoryToType(category: string): CategoryType {
  const mapping: Record<string, CategoryType> = {
    CUTTING: 'cutting',
    SILKSCREEN: 'silkscreen',
    PREP: 'prep',
    SEWING: 'sewing',
    INSPECTION: 'inspection',
  };
  return mapping[category] || 'sewing';
}

function convertEntriesToSlots(entries: ScheduleEntry[]): TimeSlot[] {
  return entries.map((entry) => ({
    id: entry.id.toString(),
    startTime: entry.start_time,
    endTime: entry.end_time,
    title: entry.step_name,
    category: mapCategoryToType(entry.category),
    progress: entry.planned_output > 0
      ? Math.round((entry.actual_output / entry.planned_output) * 100)
      : 0,
  }));
}

export default function ScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [logSheetVisible, setLogSheetVisible] = useState(false);

  const fetchSchedules = async () => {
    try {
      setError(null);
      const data = await getSchedules();
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedules();
  };

  const handleSlotPress = async (slot: TimeSlot) => {
    const entryId = parseInt(slot.id, 10);
    try {
      const entry = await getScheduleEntry(entryId);
      setSelectedEntry(entry);
      setLogSheetVisible(true);
    } catch (err) {
      console.error('Failed to load entry:', err);
    }
  };

  const handleEntryUpdated = () => {
    fetchSchedules();
    // Refresh the selected entry too
    if (selectedEntry) {
      getScheduleEntry(selectedEntry.id).then(setSelectedEntry).catch(console.error);
    }
  };

  // Combine all schedule entries by date
  const slotsByDate: Record<string, TimeSlot[]> = {};
  for (const schedule of schedules) {
    if (schedule.entriesByDate) {
      for (const [date, entries] of Object.entries(schedule.entriesByDate)) {
        if (!slotsByDate[date]) {
          slotsByDate[date] = [];
        }
        slotsByDate[date].push(...convertEntriesToSlots(entries));
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading schedule...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchSchedules} variant="secondary" />
      </View>
    );
  }

  if (schedules.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <NoScheduleEmpty />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <WeekCalendar
        weekStart={weekStart}
        slotsByDate={slotsByDate}
        selectedDate={selectedDate}
        onWeekChange={setWeekStart}
        onDaySelect={setSelectedDate}
        onSlotPress={handleSlotPress}
        showSaturday
        style={styles.calendar}
      />

      {/* Summary stats */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Active Orders</Text>
          <Text style={styles.summaryValue}>{schedules.length}</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Today's Tasks</Text>
          <Text style={styles.summaryValue}>
            {slotsByDate[new Date().toISOString().split('T')[0]]?.length || 0}
          </Text>
        </Card>
      </View>

      {/* Production logging bottom sheet */}
      <ProductionLogSheet
        visible={logSheetVisible}
        onClose={() => setLogSheetVisible(false)}
        entry={selectedEntry}
        onUpdated={handleEntryUpdated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  calendar: {
    flex: 1,
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.h2,
    color: colors.navy,
    marginTop: spacing.xs,
  },
});

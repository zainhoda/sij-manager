import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { RefreshCw } from 'lucide-react-native';

import { View, Text } from '@/components/Themed';
import { WeekCalendar, NoScheduleEmpty, Button, Card, ProductionLogSheet, FilterChipGroup } from '@/components';
import { TimeSlot } from '@/components/DayColumn';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { getSchedules, getScheduleEntry, Schedule, ScheduleEntry } from '@/api/client';

interface OrderFilter {
  id: number;
  name: string;
  color: string | null;
}

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

function convertEntriesToSlots(entries: ScheduleEntry[], scheduleOrderColor?: string | null): TimeSlot[] {
  return entries.map((entry) => ({
    id: entry.id.toString(),
    startTime: entry.start_time,
    endTime: entry.end_time,
    title: entry.step_name,
    category: mapCategoryToType(entry.category),
    progress: entry.planned_output > 0
      ? Math.round((entry.actual_output / entry.planned_output) * 100)
      : 0,
    orderColor: entry.order_color || scheduleOrderColor,
  }));
}

export default function AdminScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const orderFilters: OrderFilter[] = schedules.map((s) => ({
    id: s.order_id,
    name: s.product_name || `Order #${s.order_id}`,
    color: s.order_color || null,
  }));

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
    if (selectedEntry) {
      getScheduleEntry(selectedEntry.id).then(setSelectedEntry).catch(console.error);
    }
  };

  const filteredSchedules = selectedOrderId
    ? schedules.filter((s) => s.order_id === selectedOrderId)
    : schedules;

  const selectedSchedule = selectedOrderId
    ? schedules.find((s) => s.order_id === selectedOrderId)
    : null;

  const handleReplan = () => {
    if (selectedSchedule) {
      router.push(`/admin/replan/${selectedSchedule.id}`);
    }
  };

  const slotsByDate: Record<string, TimeSlot[]> = {};
  for (const schedule of filteredSchedules) {
    if (schedule.entriesByDate) {
      for (const [date, entries] of Object.entries(schedule.entriesByDate)) {
        if (!slotsByDate[date]) {
          slotsByDate[date] = [];
        }
        slotsByDate[date].push(...convertEntriesToSlots(entries, schedule.order_color));
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
        <Pressable onPress={() => router.push('/scheduling')} style={styles.emptyPlanningCard}>
          <Card style={styles.planningCard}>
            <View style={styles.planningContent}>
              <View style={styles.planningIcon}>
                <FontAwesome name="line-chart" size={20} color={colors.white} />
              </View>
              <View style={styles.planningText}>
                <Text style={styles.planningTitle}>8-Week Planning</Text>
                <Text style={styles.planningSubtitle}>
                  View capacity, deadline risks & what-if scenarios
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={16} color={colors.textMuted} />
            </View>
          </Card>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {orderFilters.length > 0 && (
        <View style={styles.filterContainer}>
          <View style={styles.filterRow}>
            <View style={styles.filterChips}>
              <FilterChipGroup
                options={[
                  { value: 'all', label: 'All Orders' },
                  ...orderFilters.map((o) => ({
                    value: o.id.toString(),
                    label: o.name,
                    color: o.color || undefined,
                  })),
                ]}
                selected={selectedOrderId ? [selectedOrderId.toString()] : ['all']}
                onChange={(values) => {
                  const value = values[values.length - 1] || 'all';
                  setSelectedOrderId(value === 'all' ? null : parseInt(value, 10));
                }}
                multiple={false}
              />
            </View>
            {selectedSchedule && (
              <Pressable style={styles.replanButton} onPress={handleReplan}>
                <RefreshCw size={16} color={colors.navy} />
                <Text style={styles.replanText}>Re-plan</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

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

      <Pressable onPress={() => router.push('/scheduling')}>
        <Card style={styles.planningCard}>
          <View style={styles.planningContent}>
            <View style={styles.planningIcon}>
              <FontAwesome name="line-chart" size={20} color={colors.white} />
            </View>
            <View style={styles.planningText}>
              <Text style={styles.planningTitle}>8-Week Planning</Text>
              <Text style={styles.planningSubtitle}>
                View capacity, deadline risks & what-if scenarios
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={16} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

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
  filterContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterChips: {
    flex: 1,
  },
  replanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replanText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.navy,
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
    paddingBottom: spacing.xl,
  },
  emptyPlanningCard: {
    marginTop: spacing.xl,
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
  planningCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.navy + '08',
    borderWidth: 1,
    borderColor: colors.navy + '20',
  },
  planningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  planningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningText: {
    flex: 1,
  },
  planningTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.navy,
  },
  planningSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

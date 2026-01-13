import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { WeekCalendar, Card, Button, ProductionLogSheet, StatCard, StatGrid, ProgressBar } from '@/components';
import { TimeSlot } from '@/components/DayColumn';
import { colors, spacing, typography, CategoryType } from '@/theme';
import {
  getSchedules,
  getScheduleEntry,
  getDeadlineRisks,
  getOvertimeProjections,
  Schedule,
  ScheduleEntry,
  DeadlineRisk,
  OvertimeProjection,
} from '@/api/client';

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
  return entries.map((entry) => {
    // Get worker info from assignments if available
    const workerNames = entry.assignments?.map(a => a.worker_name) || [];
    const workerCount = entry.assignments?.length || 0;

    // Use computed values if available, otherwise fallback to legacy
    const actualOutput = entry.total_actual_output ?? entry.actual_output;
    const progress = entry.planned_output > 0
      ? Math.round((actualOutput / entry.planned_output) * 100)
      : 0;

    return {
      id: entry.id.toString(),
      startTime: entry.start_time,
      endTime: entry.end_time,
      title: entry.step_name,
      category: mapCategoryToType(entry.category),
      progress,
      orderColor: entry.order_color || scheduleOrderColor,
      // Multi-worker support
      workerNames: workerNames.length > 0 ? workerNames : undefined,
      workerCount: workerCount > 0 ? workerCount : undefined,
      // Legacy fallback
      workerName: workerNames.length === 0 ? entry.worker_name || undefined : undefined,
    };
  });
}

export default function SupervisorScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [deadlineRisks, setDeadlineRisks] = useState<DeadlineRisk[]>([]);
  const [overtime, setOvertime] = useState<OvertimeProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [logSheetVisible, setLogSheetVisible] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [schedulesData, risksData, overtimeData] = await Promise.all([
        getSchedules(),
        getDeadlineRisks(),
        getOvertimeProjections(),
      ]);
      setSchedules(schedulesData);
      setDeadlineRisks(risksData);
      setOvertime(overtimeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
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
    fetchData();
    if (selectedEntry) {
      getScheduleEntry(selectedEntry.id).then(setSelectedEntry).catch(console.error);
    }
  };

  const slotsByDate: Record<string, TimeSlot[]> = {};
  for (const schedule of schedules) {
    if (schedule.entriesByDate) {
      for (const [date, entries] of Object.entries(schedule.entriesByDate)) {
        if (!slotsByDate[date]) {
          slotsByDate[date] = [];
        }
        slotsByDate[date].push(...convertEntriesToSlots(entries, schedule.order_color));
      }
    }
  }

  const atRiskOrders = deadlineRisks.filter((r) => !r.canMeet);
  const overtimeDays = overtime.filter((o) => o.overtimeHours > 0);
  const todayTasks = slotsByDate[new Date().toISOString().split('T')[0]]?.length || 0;

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
        <Button title="Retry" onPress={fetchData} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Alert Banner */}
      {(atRiskOrders.length > 0 || overtimeDays.length > 0) && (
        <Pressable onPress={() => router.push('/scheduling')} style={styles.alertBanner}>
          {atRiskOrders.length > 0 && (
            <View style={styles.alertItem}>
              <FontAwesome name="warning" size={14} color={colors.status.error} />
              <Text style={styles.alertText}>
                {atRiskOrders.length} order{atRiskOrders.length > 1 ? 's' : ''} at risk
              </Text>
            </View>
          )}
          {overtimeDays.length > 0 && (
            <View style={styles.alertItem}>
              <FontAwesome name="clock-o" size={14} color={colors.status.warning} />
              <Text style={styles.alertText}>
                {overtimeDays.length} overtime day{overtimeDays.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}
          <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
        </Pressable>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{schedules.length}</Text>
          <Text style={styles.statLabel}>Active Orders</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{todayTasks}</Text>
          <Text style={styles.statLabel}>Today's Tasks</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, atRiskOrders.length > 0 && { color: colors.status.error }]}>
            {atRiskOrders.length}
          </Text>
          <Text style={styles.statLabel}>At Risk</Text>
        </View>
      </View>

      {/* Calendar */}
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

      {/* Quick Planning Link */}
      <Pressable onPress={() => router.push('/scheduling')} style={styles.planningLink}>
        <FontAwesome name="line-chart" size={16} color={colors.navy} />
        <Text style={styles.planningText}>View 8-Week Planning</Text>
        <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
      </Pressable>

      <ProductionLogSheet
        visible={logSheetVisible}
        onClose={() => setLogSheetVisible(false)}
        entry={selectedEntry}
        onUpdated={handleEntryUpdated}
        isSupervisor={true}
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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.status.errorLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.status.error + '30',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  alertText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    color: colors.navy,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  calendar: {
    flex: 1,
  },
  planningLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  planningText: {
    ...typography.body,
    color: colors.navy,
  },
});

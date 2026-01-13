import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, Select, WorkerBadge, ProductionLogSheet, CategoryBadge, ProgressBar } from '@/components';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { getWorkers, getSchedules, getScheduleEntry, Worker, Schedule, ScheduleEntry } from '@/api/client';

const WORKER_STORAGE_KEY = '@sij:selectedWorkerId';

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

interface TodayTask {
  id: number;
  stepName: string;
  category: CategoryType;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  actualOutput: number;
  status: string;
  productName: string;
  orderColor: string | null;
  // Assignment info for the current worker
  assignmentId?: number;
  assignmentStatus?: string;
  myActualOutput?: number;
}

export default function WorkerDashboardScreen() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [logSheetVisible, setLogSheetVisible] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Load saved worker ID
  useEffect(() => {
    const loadSavedWorker = async () => {
      try {
        const saved = await AsyncStorage.getItem(WORKER_STORAGE_KEY);
        if (saved) {
          setSelectedWorkerId(parseInt(saved, 10));
        }
      } catch (err) {
        console.error('Failed to load saved worker:', err);
      }
    };
    loadSavedWorker();
  }, []);

  // Save worker selection
  const handleWorkerChange = async (workerId: number) => {
    setSelectedWorkerId(workerId);
    try {
      await AsyncStorage.setItem(WORKER_STORAGE_KEY, workerId.toString());
    } catch (err) {
      console.error('Failed to save worker:', err);
    }
  };

  const fetchData = async () => {
    try {
      setError(null);
      const [workersData, schedulesData] = await Promise.all([
        getWorkers(),
        getSchedules(),
      ]);
      setWorkers(workersData.filter((w) => w.status === 'active'));

      // Extract today's tasks from all schedules
      const todayTasks: TodayTask[] = [];
      for (const schedule of schedulesData) {
        if (schedule.entriesByDate && schedule.entriesByDate[today]) {
          for (const entry of schedule.entriesByDate[today]) {
            // Check if this worker is assigned to this task
            const myAssignment = selectedWorkerId
              ? entry.assignments?.find(a => a.worker_id === selectedWorkerId)
              : null;

            // For worker view: only show tasks where this worker is assigned
            // If no worker selected, show nothing (they need to select themselves first)
            if (selectedWorkerId) {
              // Check new assignment system first
              if (myAssignment) {
                todayTasks.push({
                  id: entry.id,
                  stepName: entry.step_name,
                  category: mapCategoryToType(entry.category),
                  startTime: entry.start_time,
                  endTime: entry.end_time,
                  plannedOutput: entry.planned_output,
                  actualOutput: entry.total_actual_output ?? entry.actual_output,
                  status: myAssignment.status, // Use this worker's assignment status
                  productName: schedule.product_name || `Order #${schedule.order_id}`,
                  orderColor: schedule.order_color || null,
                  assignmentId: myAssignment.id,
                  assignmentStatus: myAssignment.status,
                  myActualOutput: myAssignment.actual_output,
                });
              }
              // Fallback: check legacy worker_id field
              else if (entry.worker_id === selectedWorkerId) {
                todayTasks.push({
                  id: entry.id,
                  stepName: entry.step_name,
                  category: mapCategoryToType(entry.category),
                  startTime: entry.start_time,
                  endTime: entry.end_time,
                  plannedOutput: entry.planned_output,
                  actualOutput: entry.actual_output,
                  status: entry.status,
                  productName: schedule.product_name || `Order #${schedule.order_id}`,
                  orderColor: schedule.order_color || null,
                });
              }
            }
          }
        }
      }
      // Sort by start time
      todayTasks.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setTasks(todayTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedWorkerId]); // Re-fetch when worker selection changes

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleTaskPress = async (taskId: number) => {
    try {
      const entry = await getScheduleEntry(taskId);
      setSelectedEntry(entry);
      setLogSheetVisible(true);
    } catch (err) {
      console.error('Failed to load task:', err);
    }
  };

  const handleEntryUpdated = () => {
    fetchData();
    if (selectedEntry) {
      getScheduleEntry(selectedEntry.id).then(setSelectedEntry).catch(console.error);
    }
  };

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);
  const completedTasks = tasks.filter((t) =>
    t.assignmentStatus === 'completed' || t.status === 'completed'
  ).length;
  // Use worker's personal output when available
  const totalUnits = tasks.reduce((sum, t) => sum + (t.myActualOutput ?? t.actualOutput), 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading...</Text>
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
      {/* Worker Picker */}
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>Working as:</Text>
        <Select
          value={selectedWorkerId?.toString() || ''}
          options={workers.map((w) => ({
            value: w.id.toString(),
            label: w.name,
          }))}
          onChange={(value) => handleWorkerChange(parseInt(value, 10))}
          placeholder="Select yourself"
          style={styles.picker}
        />
      </View>

      {selectedWorker && (
        <View style={styles.workerBanner}>
          <WorkerBadge name={selectedWorker.name} size="medium" />
          <View style={styles.workerInfo}>
            <Text style={styles.workerName}>{selectedWorker.name}</Text>
            {selectedWorker.employee_id && (
              <Text style={styles.employeeId}>{selectedWorker.employee_id}</Text>
            )}
          </View>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{tasks.length}</Text>
          <Text style={styles.statLabel}>Today's Tasks</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{completedTasks}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalUnits}</Text>
          <Text style={styles.statLabel}>Units Done</Text>
        </View>
      </View>

      {/* Task List */}
      <ScrollView
        style={styles.taskList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {tasks.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="calendar-check-o" size={48} color={colors.gray[300]} />
            <Text style={styles.emptyTitle}>No Tasks Today</Text>
            <Text style={styles.emptyText}>Check back later for scheduled work</Text>
          </View>
        ) : (
          tasks.map((task) => {
            // Use worker's personal output for progress if available
            const myOutput = task.myActualOutput ?? task.actualOutput;
            const progress = task.plannedOutput > 0
              ? Math.round((myOutput / task.plannedOutput) * 100)
              : 0;
            // Use worker's personal status if available
            const taskStatus = task.assignmentStatus || task.status;
            const isCompleted = taskStatus === 'completed';
            const isInProgress = taskStatus === 'in_progress';

            return (
              <Pressable
                key={task.id}
                onPress={() => handleTaskPress(task.id)}
              >
                <Card style={[
                  styles.taskCard,
                  isCompleted && styles.taskCardCompleted,
                ]}>
                  <View style={styles.taskHeader}>
                    <View style={styles.taskTitleRow}>
                      {task.orderColor && (
                        <View style={[styles.orderDot, { backgroundColor: task.orderColor }]} />
                      )}
                      <Text style={styles.taskTitle}>{task.stepName}</Text>
                    </View>
                    <CategoryBadge category={task.category} size="small" />
                  </View>

                  <Text style={styles.taskProduct}>{task.productName}</Text>

                  <View style={styles.taskTime}>
                    <FontAwesome name="clock-o" size={12} color={colors.textSecondary} />
                    <Text style={styles.taskTimeText}>
                      {task.startTime} - {task.endTime}
                    </Text>
                  </View>

                  <View style={styles.taskProgress}>
                    <ProgressBar
                      progress={progress}
                      color={isCompleted ? colors.status.success : colors.navy}
                      style={styles.progressBar}
                    />
                    <Text style={styles.progressText}>
                      {myOutput} / {task.plannedOutput}
                    </Text>
                  </View>

                  <View style={styles.taskStatus}>
                    {isCompleted ? (
                      <View style={styles.statusComplete}>
                        <FontAwesome name="check-circle" size={14} color={colors.status.success} />
                        <Text style={styles.statusCompleteText}>Completed</Text>
                      </View>
                    ) : isInProgress ? (
                      <View style={styles.statusInProgress}>
                        <FontAwesome name="play-circle" size={14} color={colors.navy} />
                        <Text style={styles.statusInProgressText}>In Progress</Text>
                      </View>
                    ) : (
                      <Text style={styles.tapToStart}>Tap to log production</Text>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>

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
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  pickerLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  picker: {
    flex: 1,
  },
  workerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.navy + '10',
    gap: spacing.md,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.navy,
  },
  employeeId: {
    ...typography.caption,
    color: colors.textSecondary,
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
  taskList: {
    flex: 1,
    padding: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  taskCard: {
    marginBottom: spacing.md,
  },
  taskCardCompleted: {
    opacity: 0.7,
    backgroundColor: colors.status.successLight,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskTitle: {
    ...typography.h3,
    color: colors.text,
  },
  taskProduct: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  taskTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  taskTimeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  taskProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 8,
  },
  progressText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    width: 70,
    textAlign: 'right',
  },
  taskStatus: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusCompleteText: {
    ...typography.caption,
    color: colors.status.success,
    fontWeight: '600',
  },
  statusInProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusInProgressText: {
    ...typography.caption,
    color: colors.navy,
    fontWeight: '600',
  },
  tapToStart: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});

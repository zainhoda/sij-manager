import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { TrendingUp, Clock } from 'lucide-react-native';

import { View, Text } from '@/components/Themed';
import { Card, StatCard, StatGrid, CategoryBadge, ProficiencyDots, Button } from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  getWorkerProductivity,
  getWorkerProficiencyHistory,
  getWorkerAssignmentAnalytics,
  ProductivitySummary,
  ProficiencyHistoryEntry,
  AssignmentAnalytics as AssignmentAnalyticsType,
} from '@/api/client';

const REASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  manual: { label: 'Manual', icon: 'pencil', color: colors.gray[500] },
  auto_increase: { label: 'Performance', icon: 'arrow-up', color: colors.status.success },
  auto_decrease: { label: 'Performance', icon: 'arrow-down', color: colors.status.warning },
};

export default function WorkerProductivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [productivity, setProductivity] = useState<ProductivitySummary | null>(null);
  const [history, setHistory] = useState<ProficiencyHistoryEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignmentAnalyticsType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    try {
      setError(null);
      const [prodData, histData, assignmentsData] = await Promise.all([
        getWorkerProductivity(parseInt(id)),
        getWorkerProficiencyHistory(parseInt(id)),
        getWorkerAssignmentAnalytics(parseInt(id)),
      ]);
      setProductivity(prodData);
      setHistory(histData);
      setAssignments(assignmentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading productivity data...</Text>
      </View>
    );
  }

  if (error || !productivity) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <Button title="Retry" onPress={fetchData} variant="secondary" />
      </View>
    );
  }

  const efficiencyColor =
    productivity.averageEfficiency >= 100
      ? colors.status.success
      : productivity.averageEfficiency >= 80
      ? colors.status.warning
      : colors.status.error;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Productivity',
          headerBackTitle: 'Worker',
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Summary Stats */}
        <View style={styles.summaryHeader}>
          <Text style={styles.workerName}>{productivity.workerName}</Text>
        </View>

        <StatGrid style={styles.statsGrid}>
          <StatCard
            label="Avg Efficiency"
            value={`${productivity.averageEfficiency}%`}
            color={efficiencyColor}
          />
          <StatCard
            label="Total Hours"
            value={productivity.totalHoursWorked.toString()}
          />
          <StatCard
            label="Units Produced"
            value={productivity.totalUnitsProduced.toString()}
          />
          <StatCard
            label="Steps Tracked"
            value={productivity.stepBreakdown.length.toString()}
          />
        </StatGrid>

        {/* Step Breakdown */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Performance by Step</Text>
          {productivity.stepBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No completed work recorded yet</Text>
          ) : (
            <View style={styles.stepList}>
              {productivity.stepBreakdown.map((step) => {
                const stepEffColor =
                  step.averageEfficiency >= 100
                    ? colors.status.success
                    : step.averageEfficiency >= 80
                    ? colors.status.warning
                    : colors.status.error;

                return (
                  <View key={step.stepId} style={styles.stepItem}>
                    <View style={styles.stepHeader}>
                      <View style={styles.stepTitleRow}>
                        <Text style={styles.stepName}>{step.stepName}</Text>
                        <CategoryBadge category={step.category as any} size="small" />
                      </View>
                      <ProficiencyDots
                        level={step.currentProficiency as 1 | 2 | 3 | 4 | 5}
                        size="small"
                      />
                    </View>
                    <View style={styles.stepStats}>
                      <View style={styles.stepStat}>
                        <Text style={styles.stepStatValue}>{step.totalUnits}</Text>
                        <Text style={styles.stepStatLabel}>units</Text>
                      </View>
                      <View style={styles.stepStat}>
                        <Text style={styles.stepStatValue}>{step.entryCount}</Text>
                        <Text style={styles.stepStatLabel}>entries</Text>
                      </View>
                      <View style={styles.stepStat}>
                        <Text style={[styles.stepStatValue, { color: stepEffColor }]}>
                          {step.averageEfficiency}%
                        </Text>
                        <Text style={styles.stepStatLabel}>efficiency</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Proficiency History */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Proficiency Changes</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>No proficiency changes recorded</Text>
          ) : (
            <View style={styles.historyList}>
              {history.slice(0, 10).map((entry) => {
                const reasonInfo = REASON_LABELS[entry.reason] || REASON_LABELS.manual;
                const isIncrease = entry.new_level > entry.old_level;

                return (
                  <View key={entry.id} style={styles.historyItem}>
                    <View style={styles.historyIcon}>
                      <FontAwesome
                        name={isIncrease ? 'arrow-up' : 'arrow-down'}
                        size={12}
                        color={isIncrease ? colors.status.success : colors.status.warning}
                      />
                    </View>
                    <View style={styles.historyContent}>
                      <Text style={styles.historyStep}>
                        {entry.step_name || `Step #${entry.product_step_id}`}
                      </Text>
                      <Text style={styles.historyChange}>
                        Level {entry.old_level} → {entry.new_level}
                      </Text>
                      <View style={styles.historyMeta}>
                        <Text style={[styles.historyReason, { color: reasonInfo.color }]}>
                          {reasonInfo.label}
                        </Text>
                        <Text style={styles.historyDate}>
                          {new Date(entry.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Assignment Performance */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Assignment Performance</Text>
          {assignments.length === 0 ? (
            <Text style={styles.emptyText}>No assignment data available</Text>
          ) : (
            <View style={styles.assignmentsList}>
              {assignments.slice(0, 10).map((assignment) => {
                const metrics = assignment.timeMetrics;
                const speedupColor =
                  metrics?.speedupPercentage !== null && metrics.speedupPercentage > 0
                    ? colors.status.success
                    : metrics?.speedupPercentage !== null && metrics.speedupPercentage < 0
                    ? colors.status.warning
                    : colors.textSecondary;

                return (
                  <Pressable
                    key={assignment.assignmentId}
                    style={styles.assignmentItem}
                    onPress={() => router.push(`/assignments/${assignment.assignmentId}/analytics`)}
                  >
                    <View style={styles.assignmentHeader}>
                      <View style={styles.assignmentInfo}>
                        <Text style={styles.assignmentStep}>{assignment.stepName}</Text>
                        <Text style={styles.assignmentStatus}>
                          {assignment.status === 'completed' ? 'Completed' : 'In Progress'}
                        </Text>
                      </View>
                      {metrics?.speedupPercentage !== null && (
                        <View style={[styles.speedupBadge, { backgroundColor: speedupColor + '20' }]}>
                          <TrendingUp size={12} color={speedupColor} />
                          <Text style={[styles.speedupText, { color: speedupColor }]}>
                            {metrics.speedupPercentage > 0 ? '+' : ''}
                            {metrics.speedupPercentage.toFixed(1)}%
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.assignmentMetrics}>
                      {metrics?.overallAvgTimePerPiece !== null && (
                        <View style={styles.metricItem}>
                          <Clock size={12} color={colors.textSecondary} />
                          <Text style={styles.metricText}>
                            {(metrics.overallAvgTimePerPiece / 60).toFixed(1)}m/piece
                          </Text>
                        </View>
                      )}
                      <View style={styles.metricItem}>
                        <Text style={styles.metricText}>
                          {assignment.currentOutput} / {assignment.plannedOutput} pcs
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>
    </>
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
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  summaryHeader: {
    padding: spacing.md,
    paddingBottom: 0,
  },
  workerName: {
    ...typography.h2,
    color: colors.text,
  },
  statsGrid: {
    padding: spacing.md,
  },
  sectionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  stepList: {
    gap: spacing.md,
  },
  stepItem: {
    backgroundColor: colors.gray[50],
    padding: spacing.sm,
    borderRadius: 8,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  stepName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  stepStats: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  stepStat: {
    alignItems: 'center',
  },
  stepStatValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.navy,
  },
  stepStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  historyList: {
    gap: spacing.sm,
  },
  historyItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  historyIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyStep: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  historyChange: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  historyMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  historyReason: {
    ...typography.caption,
    fontWeight: '500',
  },
  historyDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  assignmentsList: {
    gap: spacing.sm,
  },
  assignmentItem: {
    backgroundColor: colors.gray[50],
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  assignmentInfo: {
    flex: 1,
  },
  assignmentStep: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  assignmentStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  speedupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: 12,
  },
  speedupText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 10,
  },
  assignmentMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

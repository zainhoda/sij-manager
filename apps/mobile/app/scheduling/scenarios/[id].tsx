import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { useFocusEffect, Stack, useLocalSearchParams, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, StatCard, StatGrid, ProgressBar } from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  getScenario,
  getWorkers,
  generateScenarioSchedule,
  SchedulingScenario,
  ScenarioResult,
  Worker,
} from '@/api/client';

interface WorkerPoolEntry {
  workerId: number;
  available: boolean;
  hoursPerDay?: number;
}

export default function ScenarioDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scenarioId = parseInt(id || '0');

  const [scenario, setScenario] = useState<SchedulingScenario | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerPool, setWorkerPool] = useState<WorkerPoolEntry[]>([]);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [scenarioData, workersData] = await Promise.all([
        getScenario(scenarioId),
        getWorkers(),
      ]);
      setScenario(scenarioData);
      setWorkers(workersData.filter((w) => w.status === 'active'));

      // Parse worker pool from scenario
      const pool = scenarioData.workerPoolParsed || [];
      setWorkerPool(pool);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenario');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [scenarioId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [scenarioId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleWorker = (workerId: number) => {
    setWorkerPool((prev) =>
      prev.map((entry) =>
        entry.workerId === workerId ? { ...entry, available: !entry.available } : entry
      )
    );
    setResult(null); // Clear previous results when config changes
  };

  const updateHours = (workerId: number, hours: number) => {
    setWorkerPool((prev) =>
      prev.map((entry) =>
        entry.workerId === workerId ? { ...entry, hoursPerDay: hours } : entry
      )
    );
    setResult(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resultData = await generateScenarioSchedule(scenarioId);
      setResult(resultData);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading scenario...</Text>
      </View>
    );
  }

  if (error || !scenario) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Scenario not found'}</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  const availableWorkers = workerPool.filter((w) => w.available).length;
  const totalHours = workerPool
    .filter((w) => w.available)
    .reduce((sum, w) => sum + (w.hoursPerDay || 8), 0);

  return (
    <>
      <Stack.Screen
        options={{
          title: scenario.name,
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Summary Stats */}
        <StatGrid style={styles.statsGrid}>
          <StatCard label="Workers" value={`${availableWorkers}/${workers.length}`} />
          <StatCard label="Daily Hours" value={totalHours.toString()} />
        </StatGrid>

        {scenario.description && (
          <Card style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>{scenario.description}</Text>
          </Card>
        )}

        {/* Worker Pool Configuration */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Worker Pool</Text>
          <Text style={styles.sectionSubtitle}>
            Toggle workers and adjust hours to model different scenarios
          </Text>

          <View style={styles.workerList}>
            {workers.map((worker) => {
              const poolEntry = workerPool.find((w) => w.workerId === worker.id);
              const isAvailable = poolEntry?.available ?? true;
              const hours = poolEntry?.hoursPerDay ?? 8;

              return (
                <View key={worker.id} style={styles.workerItem}>
                  <View style={styles.workerInfo}>
                    <Switch
                      value={isAvailable}
                      onValueChange={() => toggleWorker(worker.id)}
                      trackColor={{ false: colors.gray[300], true: colors.navy + '60' }}
                      thumbColor={isAvailable ? colors.navy : colors.gray[400]}
                    />
                    <View style={styles.workerDetails}>
                      <Text
                        style={[styles.workerName, !isAvailable && styles.workerDisabled]}
                      >
                        {worker.name}
                      </Text>
                      <Text style={styles.workerSkill}>{worker.skill_category}</Text>
                    </View>
                  </View>

                  {isAvailable && (
                    <View style={styles.hoursInput}>
                      <TextInput
                        style={styles.hoursField}
                        value={hours.toString()}
                        onChangeText={(text) => {
                          const num = parseInt(text) || 0;
                          updateHours(worker.id, Math.min(12, Math.max(0, num)));
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={styles.hoursLabel}>h/day</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </Card>

        {/* Generate Button */}
        <View style={styles.generateSection}>
          <Button
            title="Generate Scenario"
            onPress={handleGenerate}
            loading={generating}
          />
        </View>

        {/* Results */}
        {result && (
          <>
            {/* Capacity Analysis */}
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Capacity Analysis</Text>

              <View style={styles.capacityStats}>
                <View style={styles.capacityStat}>
                  <Text style={styles.capacityValue}>
                    {result.capacityAnalysis.totalAvailableHours}h
                  </Text>
                  <Text style={styles.capacityLabel}>Available</Text>
                </View>
                <View style={styles.capacityStat}>
                  <Text style={styles.capacityValue}>
                    {result.capacityAnalysis.totalRequiredHours}h
                  </Text>
                  <Text style={styles.capacityLabel}>Required</Text>
                </View>
                <View style={styles.capacityStat}>
                  <Text
                    style={[
                      styles.capacityValue,
                      {
                        color:
                          result.capacityAnalysis.utilizationPercent > 100
                            ? colors.status.error
                            : result.capacityAnalysis.utilizationPercent > 80
                            ? colors.status.warning
                            : colors.status.success,
                      },
                    ]}
                  >
                    {result.capacityAnalysis.utilizationPercent}%
                  </Text>
                  <Text style={styles.capacityLabel}>Utilization</Text>
                </View>
              </View>

              {result.capacityAnalysis.weeklyBreakdown.length > 0 && (
                <View style={styles.weeklyList}>
                  {result.capacityAnalysis.weeklyBreakdown.slice(0, 4).map((week, index) => {
                    const utilization =
                      week.availableHours > 0
                        ? (week.requiredHours / week.availableHours) * 100
                        : 0;
                    const weekColor =
                      utilization > 100
                        ? colors.status.error
                        : utilization > 80
                        ? colors.status.warning
                        : colors.status.success;

                    return (
                      <View key={week.weekStart} style={styles.weekItem}>
                        <Text style={styles.weekLabel}>Week {index + 1}</Text>
                        <ProgressBar
                          progress={Math.min(100, utilization)}
                          color={weekColor}
                          style={styles.weekProgress}
                        />
                        <Text style={[styles.weekUtilization, { color: weekColor }]}>
                          {Math.round(utilization)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            {/* Deadline Risks */}
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Deadline Risks</Text>
                {result.deadlineRisks.filter((r) => !r.canMeet).length > 0 && (
                  <View style={styles.riskBadge}>
                    <Text style={styles.riskBadgeText}>
                      {result.deadlineRisks.filter((r) => !r.canMeet).length} at risk
                    </Text>
                  </View>
                )}
              </View>

              {result.deadlineRisks.length === 0 ? (
                <Text style={styles.emptyText}>No pending orders</Text>
              ) : (
                <View style={styles.riskList}>
                  {result.deadlineRisks.map((risk) => (
                    <View
                      key={risk.orderId}
                      style={[
                        styles.riskItem,
                        !risk.canMeet && styles.riskItemDanger,
                      ]}
                    >
                      <View style={styles.riskHeader}>
                        <View style={styles.riskTitleRow}>
                          {!risk.canMeet && (
                            <FontAwesome
                              name="warning"
                              size={14}
                              color={colors.status.error}
                              style={styles.riskIcon}
                            />
                          )}
                          <Text style={styles.riskTitle}>{risk.productName}</Text>
                        </View>
                        <Text style={styles.riskDueDate}>Due: {risk.dueDate}</Text>
                      </View>
                      <View style={styles.riskStats}>
                        <Text style={styles.riskStat}>
                          Required: {risk.requiredHours}h
                        </Text>
                        <Text style={styles.riskStat}>
                          Available: {risk.availableHours}h
                        </Text>
                        {!risk.canMeet && (
                          <Text style={[styles.riskStat, styles.riskShortfall]}>
                            Shortfall: {risk.shortfallHours}h
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}

        <View style={styles.bottomPadding} />
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
  statsGrid: {
    padding: spacing.md,
  },
  descriptionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  workerList: {
    gap: spacing.sm,
  },
  workerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  workerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workerDetails: {
    gap: 2,
  },
  workerName: {
    ...typography.body,
    color: colors.text,
  },
  workerDisabled: {
    color: colors.textMuted,
  },
  workerSkill: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hoursInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hoursField: {
    ...typography.body,
    width: 40,
    height: 36,
    backgroundColor: colors.gray[100],
    borderRadius: 6,
    textAlign: 'center',
    color: colors.text,
  },
  hoursLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  generateSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  capacityStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  capacityStat: {
    alignItems: 'center',
  },
  capacityValue: {
    ...typography.h2,
    color: colors.text,
  },
  capacityLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  weeklyList: {
    gap: spacing.sm,
  },
  weekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  weekLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    width: 60,
  },
  weekProgress: {
    flex: 1,
    height: 8,
  },
  weekUtilization: {
    ...typography.bodySmall,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
  riskBadge: {
    backgroundColor: colors.status.error + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  riskBadgeText: {
    ...typography.caption,
    color: colors.status.error,
    fontWeight: '600',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  riskList: {
    gap: spacing.sm,
  },
  riskItem: {
    backgroundColor: colors.gray[50],
    padding: spacing.sm,
    borderRadius: 8,
  },
  riskItemDanger: {
    backgroundColor: colors.status.error + '10',
    borderLeftWidth: 3,
    borderLeftColor: colors.status.error,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  riskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riskIcon: {
    marginRight: spacing.xs,
  },
  riskTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  riskDueDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  riskStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  riskStat: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  riskShortfall: {
    color: colors.status.error,
    fontWeight: '600',
  },
  bottomPadding: {
    height: spacing.xl,
  },
});

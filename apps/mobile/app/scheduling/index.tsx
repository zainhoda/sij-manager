import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, StatCard, StatGrid, ProgressBar } from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  getDeadlineRisks,
  getOvertimeProjections,
  getCapacityAnalysis,
  DeadlineRisk,
  OvertimeProjection,
  CapacityAnalysis,
} from '@/api/client';

export default function SchedulingOverviewScreen() {
  const [deadlineRisks, setDeadlineRisks] = useState<DeadlineRisk[]>([]);
  const [overtime, setOvertime] = useState<OvertimeProjection[]>([]);
  const [capacity, setCapacity] = useState<CapacityAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [risksData, overtimeData, capacityData] = await Promise.all([
        getDeadlineRisks(),
        getOvertimeProjections(),
        getCapacityAnalysis(8),
      ]);
      setDeadlineRisks(risksData);
      setOvertime(overtimeData);
      setCapacity(capacityData);
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading scheduling data...</Text>
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

  const atRiskOrders = deadlineRisks.filter((r) => !r.canMeet);
  const overtimeDays = overtime.filter((o) => o.overtimeHours > 0);
  const utilizationColor =
    (capacity?.utilizationPercent || 0) > 100
      ? colors.status.error
      : (capacity?.utilizationPercent || 0) > 80
      ? colors.status.warning
      : colors.status.success;

  return (
    <>
      <Stack.Screen
        options={{
          title: '8-Week Overview',
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Capacity Summary */}
        <StatGrid style={styles.statsGrid}>
          <StatCard
            label="Utilization"
            value={`${capacity?.utilizationPercent || 0}%`}
            color={utilizationColor}
          />
          <StatCard
            label="At Risk Orders"
            value={atRiskOrders.length.toString()}
            color={atRiskOrders.length > 0 ? colors.status.error : colors.status.success}
          />
          <StatCard
            label="Overtime Days"
            value={overtimeDays.length.toString()}
            color={overtimeDays.length > 0 ? colors.status.warning : colors.status.success}
          />
          <StatCard
            label="Available Hours"
            value={(capacity?.totalAvailableHours || 0).toString()}
          />
        </StatGrid>

        {/* Deadline Risks */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deadline Risks</Text>
            {atRiskOrders.length > 0 && (
              <View style={styles.riskBadge}>
                <Text style={styles.riskBadgeText}>{atRiskOrders.length} at risk</Text>
              </View>
            )}
          </View>

          {deadlineRisks.length === 0 ? (
            <Text style={styles.emptyText}>No pending orders</Text>
          ) : (
            <View style={styles.riskList}>
              {deadlineRisks.map((risk) => (
                <View key={risk.orderId} style={styles.riskItem}>
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
                  <ProgressBar
                    progress={Math.min(100, (risk.availableHours / risk.requiredHours) * 100)}
                    color={risk.canMeet ? colors.status.success : colors.status.error}
                    style={styles.riskProgress}
                  />
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Overtime Projections */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Overtime Projections</Text>

          {overtime.length === 0 ? (
            <Text style={styles.emptyText}>No scheduled work</Text>
          ) : overtimeDays.length === 0 ? (
            <Text style={styles.successText}>No overtime required</Text>
          ) : (
            <View style={styles.overtimeList}>
              {overtimeDays.slice(0, 5).map((day) => (
                <View key={day.date} style={styles.overtimeItem}>
                  <View style={styles.overtimeDate}>
                    <FontAwesome
                      name="clock-o"
                      size={14}
                      color={colors.status.warning}
                    />
                    <Text style={styles.overtimeDateText}>
                      {new Date(day.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.overtimeHours}>+{day.overtimeHours}h</Text>
                </View>
              ))}
              {overtimeDays.length > 5 && (
                <Text style={styles.moreText}>
                  +{overtimeDays.length - 5} more days
                </Text>
              )}
            </View>
          )}
        </Card>

        {/* Weekly Breakdown */}
        {capacity && capacity.weeklyBreakdown.length > 0 && (
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Weekly Capacity</Text>
            <View style={styles.weeklyList}>
              {capacity.weeklyBreakdown.map((week, index) => {
                const utilization = week.availableHours > 0
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
          </Card>
        )}

        {/* Scenarios Button */}
        <View style={styles.actionsContainer}>
          <Button
            title="What-If Scenarios"
            onPress={() => router.push('/scheduling/scenarios')}
            variant="secondary"
          />
        </View>
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
  sectionCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
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
  successText: {
    ...typography.body,
    color: colors.status.success,
  },
  riskList: {
    gap: spacing.md,
  },
  riskItem: {
    backgroundColor: colors.gray[50],
    padding: spacing.sm,
    borderRadius: 8,
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
    marginBottom: spacing.sm,
  },
  riskStat: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  riskShortfall: {
    color: colors.status.error,
    fontWeight: '600',
  },
  riskProgress: {
    height: 4,
  },
  overtimeList: {
    gap: spacing.sm,
  },
  overtimeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  overtimeDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  overtimeDateText: {
    ...typography.body,
    color: colors.text,
  },
  overtimeHours: {
    ...typography.body,
    fontWeight: '600',
    color: colors.status.warning,
  },
  moreText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
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
  actionsContainer: {
    padding: spacing.md,
    paddingTop: 0,
  },
});

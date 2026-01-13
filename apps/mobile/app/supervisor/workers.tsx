import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, WorkerBadge } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getWorkers, Worker } from '@/api/client';

const STATUS_COLORS: Record<string, string> = {
  active: colors.status.success,
  inactive: colors.gray[400],
  on_leave: colors.status.warning,
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  on_leave: 'On Leave',
};

export default function SupervisorWorkersScreen() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkers = async () => {
    try {
      setError(null);
      const data = await getWorkers();
      setWorkers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchWorkers();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchWorkers();
  };

  const activeWorkers = workers.filter((w) => w.status === 'active');
  const onLeaveWorkers = workers.filter((w) => w.status === 'on_leave');

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading workers...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchWorkers} variant="secondary" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Status Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.success }]} />
          <Text style={styles.summaryValue}>{activeWorkers.length}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.warning }]} />
          <Text style={styles.summaryValue}>{onLeaveWorkers.length}</Text>
          <Text style={styles.summaryLabel}>On Leave</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.gray[400] }]} />
          <Text style={styles.summaryValue}>{workers.length - activeWorkers.length - onLeaveWorkers.length}</Text>
          <Text style={styles.summaryLabel}>Inactive</Text>
        </View>
      </View>

      {/* Worker List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team ({workers.length})</Text>
        {workers.map((worker) => (
          <Pressable
            key={worker.id}
            onPress={() => router.push(`/workers/${worker.id}`)}
          >
            <Card style={styles.workerCard}>
              <View style={styles.workerRow}>
                <WorkerBadge name={worker.name} size="medium" />
                <View style={styles.workerInfo}>
                  <Text style={styles.workerName}>{worker.name}</Text>
                  {worker.employee_id && (
                    <Text style={styles.employeeId}>{worker.employee_id}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[worker.status] + '20' },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: STATUS_COLORS[worker.status] },
                    ]}
                  />
                  <Text
                    style={[styles.statusText, { color: STATUS_COLORS[worker.status] }]}
                  >
                    {STATUS_LABELS[worker.status]}
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
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
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    ...typography.h2,
    color: colors.text,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  section: {
    padding: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  workerCard: {
    marginBottom: spacing.sm,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  employeeId: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
});

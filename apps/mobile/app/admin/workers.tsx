import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Link, useFocusEffect, router } from 'expo-router';
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

const SKILL_LABELS: Record<string, string> = {
  SEWING: 'Sewing',
  OTHER: 'General',
};

export default function AdminWorkersScreen() {
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

  if (workers.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyState}>
          <FontAwesome name="users" size={48} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>No Workers</Text>
          <Text style={styles.emptyText}>Add workers to manage your production team.</Text>
        </View>
        <Link href="/workers/new" asChild>
          <Button title="Add Worker" variant="primary" style={styles.createButton} />
        </Link>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Workers</Text>
        <Link href="/workers/new" asChild>
          <Pressable style={styles.addButton}>
            <FontAwesome name="plus" size={16} color={colors.white} />
          </Pressable>
        </Link>
      </View>

      {workers.map((worker) => (
        <Pressable
          key={worker.id}
          onPress={() => router.push(`/workers/${worker.id}`)}
        >
          <Card style={styles.workerCard}>
            <View style={styles.workerHeader}>
              <WorkerBadge name={worker.name} size="large" />
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

            <View style={styles.workerDetails}>
              <View style={styles.detailRow}>
                <FontAwesome name="wrench" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>
                  Skill: {SKILL_LABELS[worker.skill_category]}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <FontAwesome name="certificate" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>
                  {worker.certifications?.length || 0} equipment certifications
                </Text>
              </View>
            </View>

            {worker.certifications && worker.certifications.length > 0 && (
              <View style={styles.certifications}>
                {worker.certifications.slice(0, 3).map((cert) => (
                  <View key={cert.id} style={styles.certBadge}>
                    <Text style={styles.certText}>{cert.equipment_name}</Text>
                  </View>
                ))}
                {worker.certifications.length > 3 && (
                  <Text style={styles.moreText}>
                    +{worker.certifications.length - 3} more
                  </Text>
                )}
              </View>
            )}
          </Card>
        </Pressable>
      ))}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
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
  createButton: {
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.navy,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  workerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    ...typography.h3,
    color: colors.text,
  },
  employeeId: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
  workerDetails: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  certifications: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  certBadge: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  certText: {
    ...typography.caption,
    color: colors.text,
  },
  moreText: {
    ...typography.caption,
    color: colors.textSecondary,
    alignSelf: 'center',
  },
});

import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, WorkerBadge } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getWorkerById, deleteWorker, updateWorker, Worker } from '@/api/client';

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

export default function WorkerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorker = async () => {
    if (!id) return;
    try {
      setError(null);
      const data = await getWorkerById(parseInt(id));
      setWorker(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load worker');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorker();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWorker();
  };

  const handleStatusChange = async (newStatus: Worker['status']) => {
    if (!worker) return;
    try {
      await updateWorker(worker.id, { status: newStatus });
      await fetchWorker();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = () => {
    if (!worker) return;
    Alert.alert(
      'Delete Worker',
      `Are you sure you want to delete ${worker.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorker(worker.id);
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete worker');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading worker...</Text>
      </View>
    );
  }

  if (error || !worker) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Worker not found'}</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: worker.name,
          headerBackTitle: 'Workers',
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Card style={styles.headerCard}>
          <View style={styles.header}>
            <WorkerBadge name={worker.name} size="large" />
            <View style={styles.headerInfo}>
              <Text style={styles.name}>{worker.name}</Text>
              {worker.employee_id && (
                <Text style={styles.employeeId}>{worker.employee_id}</Text>
              )}
            </View>
          </View>

          <View style={styles.statusRow}>
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

            <View style={styles.skillBadge}>
              <Text style={styles.skillText}>{SKILL_LABELS[worker.skill_category]}</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Equipment Certifications</Text>
          {worker.certifications && worker.certifications.length > 0 ? (
            <View style={styles.certList}>
              {worker.certifications.map((cert) => (
                <View key={cert.id} style={styles.certItem}>
                  <FontAwesome name="certificate" size={16} color={colors.status.success} />
                  <Text style={styles.certName}>{cert.equipment_name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No equipment certifications</Text>
          )}
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statusButtons}>
            {(['active', 'on_leave', 'inactive'] as Worker['status'][]).map((status) => (
              <Button
                key={status}
                title={STATUS_LABELS[status]}
                variant={worker.status === status ? 'primary' : 'secondary'}
                size="small"
                onPress={() => handleStatusChange(status)}
                style={styles.statusButton}
              />
            ))}
          </View>
        </Card>

        <View style={styles.dangerZone}>
          <Button
            title="Delete Worker"
            variant="ghost"
            onPress={handleDelete}
            style={styles.deleteButton}
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
  headerCard: {
    margin: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...typography.h2,
    color: colors.text,
  },
  employeeId: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  skillBadge: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
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
  certList: {
    gap: spacing.sm,
  },
  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  certName: {
    ...typography.body,
    color: colors.text,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusButton: {
    flex: 1,
  },
  dangerZone: {
    padding: spacing.md,
    paddingTop: spacing.xl,
  },
  deleteButton: {
    borderColor: colors.status.error,
    borderWidth: 1,
  },
});

import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, EquipmentBadge, WorkerBadge } from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  getEquipmentById,
  deleteEquipment,
  updateEquipment,
  getEquipmentCertifiedWorkers,
  Equipment,
  Worker,
} from '@/api/client';

const STATUS_COLORS: Record<string, string> = {
  available: colors.status.success,
  in_use: colors.status.warning,
  maintenance: colors.status.info,
  retired: colors.gray[400],
};

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  in_use: 'In Use',
  maintenance: 'Maintenance',
  retired: 'Retired',
};

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [certifiedWorkers, setCertifiedWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEquipment = async () => {
    if (!id) return;
    try {
      setError(null);
      const [equipData, workers] = await Promise.all([
        getEquipmentById(parseInt(id)),
        getEquipmentCertifiedWorkers(parseInt(id)),
      ]);
      setEquipment(equipData);
      setCertifiedWorkers(workers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equipment');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEquipment();
  };

  const handleStatusChange = async (newStatus: Equipment['status']) => {
    if (!equipment) return;
    try {
      await updateEquipment(equipment.id, { status: newStatus });
      await fetchEquipment();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = () => {
    if (!equipment) return;
    Alert.alert(
      'Delete Equipment',
      `Are you sure you want to delete ${equipment.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEquipment(equipment.id);
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete equipment');
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
        <Text style={styles.loadingText}>Loading equipment...</Text>
      </View>
    );
  }

  if (error || !equipment) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Equipment not found'}</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: equipment.name,
          headerBackTitle: 'Equipment',
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
            <EquipmentBadge name={equipment.name} size="large" status={equipment.status} />
            <View style={styles.headerInfo}>
              <Text style={styles.name}>{equipment.name}</Text>
              {equipment.description && (
                <Text style={styles.description}>{equipment.description}</Text>
              )}
            </View>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLORS[equipment.status] + '20' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_COLORS[equipment.status] },
                ]}
              />
              <Text
                style={[styles.statusText, { color: STATUS_COLORS[equipment.status] }]}
              >
                {STATUS_LABELS[equipment.status]}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Certified Workers ({certifiedWorkers.length})</Text>
          {certifiedWorkers.length > 0 ? (
            <View style={styles.workerList}>
              {certifiedWorkers.map((worker) => (
                <View key={worker.id} style={styles.workerItem}>
                  <WorkerBadge name={worker.name} size="small" showName />
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No certified workers</Text>
          )}
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statusButtons}>
            {(['available', 'in_use', 'maintenance', 'retired'] as Equipment['status'][]).map((status) => (
              <Button
                key={status}
                title={STATUS_LABELS[status]}
                variant={equipment.status === status ? 'primary' : 'secondary'}
                size="small"
                onPress={() => handleStatusChange(status)}
                style={styles.statusButton}
              />
            ))}
          </View>
        </Card>

        <View style={styles.dangerZone}>
          <Button
            title="Delete Equipment"
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
  description: {
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
  workerList: {
    gap: spacing.sm,
  },
  workerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusButton: {
    minWidth: '45%',
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

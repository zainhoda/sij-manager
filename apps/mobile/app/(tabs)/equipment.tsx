import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Link, useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, EquipmentBadge } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getEquipment, Equipment, getEquipmentCertifiedWorkers } from '@/api/client';

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

interface EquipmentWithCount extends Equipment {
  certifiedWorkerCount?: number;
}

export default function EquipmentScreen() {
  const [equipment, setEquipment] = useState<EquipmentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEquipment = async () => {
    try {
      setError(null);
      const data = await getEquipment();

      // Fetch certified worker counts for each equipment
      const equipmentWithCounts = await Promise.all(
        data.map(async (equip) => {
          try {
            const workers = await getEquipmentCertifiedWorkers(equip.id);
            return { ...equip, certifiedWorkerCount: workers.length };
          } catch {
            return { ...equip, certifiedWorkerCount: 0 };
          }
        })
      );

      setEquipment(equipmentWithCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equipment');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEquipment();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchEquipment();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading equipment...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchEquipment} variant="secondary" />
      </View>
    );
  }

  if (equipment.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyState}>
          <FontAwesome name="wrench" size={48} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>No Equipment</Text>
          <Text style={styles.emptyText}>Add equipment to track machines and certifications.</Text>
        </View>
        <Link href="/equipment/new" asChild>
          <Button title="Add Equipment" variant="primary" style={styles.createButton} />
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
        <Text style={styles.headerTitle}>Equipment</Text>
        <Link href="/equipment/new" asChild>
          <Pressable style={styles.addButton}>
            <FontAwesome name="plus" size={16} color={colors.white} />
          </Pressable>
        </Link>
      </View>

      {equipment.map((equip) => (
        <Pressable
          key={equip.id}
          onPress={() => router.push(`/equipment/${equip.id}`)}
        >
          <Card style={styles.equipmentCard}>
            <View style={styles.equipmentHeader}>
              <EquipmentBadge name={equip.name} size="large" status={equip.status} />
              <View style={styles.equipmentInfo}>
                <Text style={styles.equipmentName}>{equip.name}</Text>
                {equip.description && (
                  <Text style={styles.description} numberOfLines={1}>{equip.description}</Text>
                )}
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATUS_COLORS[equip.status] + '20' },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: STATUS_COLORS[equip.status] },
                  ]}
                />
                <Text
                  style={[styles.statusText, { color: STATUS_COLORS[equip.status] }]}
                >
                  {STATUS_LABELS[equip.status]}
                </Text>
              </View>
            </View>

            <View style={styles.equipmentDetails}>
              <View style={styles.detailRow}>
                <FontAwesome name="users" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>
                  {equip.certifiedWorkerCount} certified workers
                </Text>
              </View>
            </View>
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
  equipmentCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  equipmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  equipmentInfo: {
    flex: 1,
  },
  equipmentName: {
    ...typography.h3,
    color: colors.text,
  },
  description: {
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
  equipmentDetails: {
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
});

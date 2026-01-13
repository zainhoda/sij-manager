import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
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

export default function SupervisorEquipmentScreen() {
  const [equipment, setEquipment] = useState<EquipmentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEquipment = async () => {
    try {
      setError(null);
      const data = await getEquipment();

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

  const availableEquipment = equipment.filter((e) => e.status === 'available');
  const inUseEquipment = equipment.filter((e) => e.status === 'in_use');
  const maintenanceEquipment = equipment.filter((e) => e.status === 'maintenance');

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
          <Text style={styles.summaryValue}>{availableEquipment.length}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.warning }]} />
          <Text style={styles.summaryValue}>{inUseEquipment.length}</Text>
          <Text style={styles.summaryLabel}>In Use</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.info }]} />
          <Text style={styles.summaryValue}>{maintenanceEquipment.length}</Text>
          <Text style={styles.summaryLabel}>Maintenance</Text>
        </View>
      </View>

      {/* Equipment List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Equipment ({equipment.length})</Text>
        {equipment.map((equip) => (
          <Pressable
            key={equip.id}
            onPress={() => router.push(`/equipment/${equip.id}`)}
          >
            <Card style={styles.equipmentCard}>
              <View style={styles.equipmentRow}>
                <EquipmentBadge name={equip.name} size="medium" status={equip.status} />
                <View style={styles.equipmentInfo}>
                  <Text style={styles.equipmentName}>{equip.name}</Text>
                  <Text style={styles.certCount}>
                    {equip.certifiedWorkerCount} certified
                  </Text>
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
  equipmentCard: {
    marginBottom: spacing.sm,
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  equipmentInfo: {
    flex: 1,
  },
  equipmentName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  certCount: {
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

import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable, Dimensions } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Button } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getEquipment, Equipment, getEquipmentCertifiedWorkers, updateEquipment } from '@/api/client';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - spacing.md * 3) / 2;

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

const STATUS_ICONS: Record<string, string> = {
  available: 'check-circle',
  in_use: 'play-circle',
  maintenance: 'wrench',
  retired: 'ban',
};

interface EquipmentWithCount extends Equipment {
  certifiedWorkerCount?: number;
}

export default function EquipmentTabletScreen() {
  const [equipment, setEquipment] = useState<EquipmentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

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

  const handleStatusToggle = async (equip: EquipmentWithCount) => {
    // Simple toggle between available and in_use
    const newStatus = equip.status === 'available' ? 'in_use' : 'available';
    try {
      setUpdatingId(equip.id);
      await updateEquipment(equip.id, { status: newStatus });
      await fetchEquipment();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const availableCount = equipment.filter((e) => e.status === 'available').length;
  const inUseCount = equipment.filter((e) => e.status === 'in_use').length;
  const maintenanceCount = equipment.filter((e) => e.status === 'maintenance').length;

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
    <View style={styles.container}>
      {/* Status Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.success }]} />
          <Text style={styles.summaryCount}>{availableCount}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.warning }]} />
          <Text style={styles.summaryCount}>{inUseCount}</Text>
          <Text style={styles.summaryLabel}>In Use</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: colors.status.info }]} />
          <Text style={styles.summaryCount}>{maintenanceCount}</Text>
          <Text style={styles.summaryLabel}>Maintenance</Text>
        </View>
      </View>

      {/* Equipment Grid */}
      <ScrollView
        style={styles.gridContainer}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {equipment.map((equip) => (
          <Pressable
            key={equip.id}
            onPress={() => handleStatusToggle(equip)}
            onLongPress={() => router.push(`/equipment/${equip.id}`)}
            style={({ pressed }) => [
              styles.equipmentCard,
              { backgroundColor: STATUS_COLORS[equip.status] + '15' },
              { borderColor: STATUS_COLORS[equip.status] },
              pressed && styles.cardPressed,
            ]}
            disabled={updatingId === equip.id || equip.status === 'maintenance' || equip.status === 'retired'}
          >
            {updatingId === equip.id ? (
              <ActivityIndicator size="large" color={STATUS_COLORS[equip.status]} />
            ) : (
              <>
                <FontAwesome
                  name={STATUS_ICONS[equip.status] as any}
                  size={48}
                  color={STATUS_COLORS[equip.status]}
                />
                <Text style={styles.equipmentName}>{equip.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[equip.status] }]}>
                  <Text style={styles.statusText}>{STATUS_LABELS[equip.status]}</Text>
                </View>
                <Text style={styles.certCount}>
                  {equip.certifiedWorkerCount} certified operator{equip.certifiedWorkerCount !== 1 ? 's' : ''}
                </Text>
              </>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* Instructions */}
      <View style={styles.instructionsBar}>
        <Text style={styles.instructionText}>
          <FontAwesome name="hand-pointer-o" size={14} color={colors.textSecondary} />
          {' '}Tap to toggle Available/In Use
        </Text>
        <Text style={styles.instructionText}>
          <FontAwesome name="hand-rock-o" size={14} color={colors.textSecondary} />
          {' '}Long press for details
        </Text>
      </View>
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
  summaryBar: {
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
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: spacing.xs,
  },
  summaryCount: {
    ...typography.h1,
    color: colors.text,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  gridContainer: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.md,
  },
  equipmentCard: {
    width: CARD_WIDTH,
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 3,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  equipmentName: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
  },
  statusText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
  certCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  instructionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  instructionText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Button } from '@/components';
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

export default function EquipmentTabletSelectionScreen() {
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

  const handleEquipmentSelect = (equipId: number) => {
    router.push(`/equipment-tablet/${equipId}`);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Equipment</Text>
        <Text style={styles.headerSubtitle}>
          Choose an equipment to view its tablet display
        </Text>
      </View>

      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {equipment.map((equip) => (
          <Pressable
            key={equip.id}
            onPress={() => handleEquipmentSelect(equip.id)}
            style={({ pressed }) => [
              styles.equipmentCard,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardLeft}>
                <Text style={styles.equipmentName}>{equip.name}</Text>
                {equip.description && (
                  <Text style={styles.equipmentDescription}>{equip.description}</Text>
                )}
                <Text style={styles.certCount}>
                  {equip.certifiedWorkerCount} certified operator{equip.certifiedWorkerCount !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.cardRight}>
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
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[equip.status] },
                    ]}
                  >
                    {STATUS_LABELS[equip.status]}
                  </Text>
                </View>
                <FontAwesome
                  name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.chevron}
                />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
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
  header: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  equipmentCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.7,
    backgroundColor: colors.gray[50],
  },
  cardContent: {
    flexDirection: 'row',
    padding: spacing.lg,
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    gap: spacing.xs,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  equipmentName: {
    ...typography.h3,
    color: colors.text,
  },
  equipmentDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  certCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
  chevron: {
    marginLeft: spacing.xs,
  },
});

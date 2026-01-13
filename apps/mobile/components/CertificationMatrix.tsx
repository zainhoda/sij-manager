import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { colors, spacing, typography } from '@/theme';
import type { Worker, Equipment, EquipmentCertification } from '@/api/client';

interface CertificationMatrixProps {
  workers: Worker[];
  equipment: Equipment[];
  certifications: EquipmentCertification[];
  onToggle: (
    workerId: number,
    equipmentId: number,
    certificationId?: number
  ) => Promise<void>;
}

const CELL_SIZE = 48;
const WORKER_COL_WIDTH = 140;

export function CertificationMatrix({
  workers,
  equipment,
  certifications,
  onToggle,
}: CertificationMatrixProps) {
  const [updatingCell, setUpdatingCell] = useState<{
    workerId: number;
    equipmentId: number;
  } | null>(null);

  // Build certification lookup map: workerId -> equipmentId -> certificationId
  const certMap = new Map<number, Map<number, number>>();
  for (const cert of certifications) {
    if (!certMap.has(cert.worker_id)) {
      certMap.set(cert.worker_id, new Map());
    }
    certMap.get(cert.worker_id)!.set(cert.equipment_id, cert.id);
  }

  const handleCellPress = useCallback(
    async (workerId: number, equipmentId: number) => {
      const certId = certMap.get(workerId)?.get(equipmentId);
      setUpdatingCell({ workerId, equipmentId });
      try {
        await onToggle(workerId, equipmentId, certId);
      } finally {
        setUpdatingCell(null);
      }
    },
    [certMap, onToggle]
  );

  if (workers.length === 0 || equipment.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome name="certificate" size={48} color={colors.gray[300]} />
        <Text style={styles.emptyText}>
          {workers.length === 0
            ? 'No workers found'
            : 'No equipment found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fixed header row with equipment names */}
      <View style={styles.headerRow}>
        <View style={styles.cornerCell} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
        >
          <View style={styles.headerCells}>
            {equipment.map((eq) => (
              <View key={eq.id} style={styles.headerCell}>
                <Text style={styles.headerText} numberOfLines={2}>
                  {eq.name}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Scrollable matrix body */}
      <ScrollView style={styles.bodyScroll}>
        {workers.map((worker) => (
          <View key={worker.id} style={styles.row}>
            {/* Fixed worker name column */}
            <View style={styles.workerCell}>
              <View style={styles.workerBadge}>
                <Text style={styles.workerInitials}>
                  {getInitials(worker.name)}
                </Text>
              </View>
              <Text style={styles.workerName} numberOfLines={1}>
                {worker.name}
              </Text>
            </View>

            {/* Scrollable certification cells */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.cells}>
                {equipment.map((eq) => {
                  const isCertified = certMap.get(worker.id)?.has(eq.id);
                  const isUpdating =
                    updatingCell?.workerId === worker.id &&
                    updatingCell?.equipmentId === eq.id;

                  return (
                    <TouchableOpacity
                      key={eq.id}
                      style={[
                        styles.cell,
                        isCertified && styles.cellCertified,
                        isUpdating && styles.cellUpdating,
                      ]}
                      onPress={() => handleCellPress(worker.id, eq.id)}
                      disabled={isUpdating}
                      activeOpacity={0.7}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color={colors.navy} />
                      ) : isCertified ? (
                        <FontAwesome
                          name="check"
                          size={18}
                          color={colors.status.success}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cornerCell: {
    width: WORKER_COL_WIDTH,
    height: 56,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  headerCells: {
    flexDirection: 'row',
  },
  headerCell: {
    width: CELL_SIZE,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  headerText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 10,
  },
  bodyScroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  workerCell: {
    width: WORKER_COL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray[50],
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  workerBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerInitials: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  workerName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 13,
  },
  cells: {
    flexDirection: 'row',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  cellCertified: {
    backgroundColor: colors.status.successLight,
  },
  cellUpdating: {
    opacity: 0.6,
  },
});

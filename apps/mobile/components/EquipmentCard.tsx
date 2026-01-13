import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/theme';
import { Card } from './Card';
import { EquipmentBadge } from './EquipmentBadge';

type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

interface EquipmentCardProps {
  /** Equipment name */
  name: string;
  /** Equipment description */
  description?: string | null;
  /** Equipment status */
  status?: EquipmentStatus;
  /** Number of certified workers */
  certifiedWorkerCount?: number;
  /** Press handler */
  onPress?: () => void;
  /** Show compact view */
  compact?: boolean;
  /** Container style */
  style?: ViewStyle;
}

const statusLabels: Record<EquipmentStatus, string> = {
  available: 'Available',
  in_use: 'In Use',
  maintenance: 'Maintenance',
  retired: 'Retired',
};

const statusColors: Record<EquipmentStatus, string> = {
  available: colors.status.success,
  in_use: colors.status.warning,
  maintenance: colors.status.info,
  retired: colors.gray[400],
};

export function EquipmentCard({
  name,
  description,
  status = 'available',
  certifiedWorkerCount,
  onPress,
  compact = false,
  style,
}: EquipmentCardProps) {
  if (compact) {
    return (
      <Pressable onPress={onPress} disabled={!onPress}>
        <Card style={[styles.compactCard, style]}>
          <View style={styles.compactContent}>
            <EquipmentBadge name={name} size="default" status={status} />
            <View style={styles.compactInfo}>
              <Text style={styles.compactName} numberOfLines={1}>{name}</Text>
              <View style={styles.compactStatus}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColors[status] },
                  ]}
                />
                <Text style={styles.statusText}>{statusLabels[status]}</Text>
              </View>
            </View>
            {certifiedWorkerCount !== undefined && (
              <View style={styles.certifiedCount}>
                <Text style={styles.certifiedValue}>{certifiedWorkerCount}</Text>
                <Text style={styles.certifiedLabel}>certified</Text>
              </View>
            )}
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card style={[styles.card, style]}>
        {/* Header */}
        <View style={styles.header}>
          <EquipmentBadge name={name} size="large" status={status} />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusColors[status] },
                ]}
              />
              <Text style={styles.statusText}>{statusLabels[status]}</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}

        {/* Stats */}
        {certifiedWorkerCount !== undefined && (
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{certifiedWorkerCount}</Text>
              <Text style={styles.statLabel}>Certified Workers</Text>
            </View>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  compactCard: {
    padding: spacing.sm,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactInfo: {
    flex: 1,
  },
  compactName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  compactStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  certifiedCount: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  certifiedValue: {
    ...typography.h4,
    color: colors.navy,
  },
  certifiedLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    ...typography.h3,
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h3,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

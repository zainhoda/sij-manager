import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, typography } from '@/theme';

type BadgeSize = 'small' | 'default' | 'large';

interface EquipmentBadgeProps {
  /** Equipment name */
  name: string;
  /** Badge size */
  size?: BadgeSize;
  /** Equipment status */
  status?: 'available' | 'in_use' | 'maintenance' | 'retired';
  /** Show full name alongside badge */
  showName?: boolean;
  /** Additional style */
  style?: ViewStyle;
}

const sizeMap = {
  small: 20,
  default: 28,
  large: 36,
};

const fontSizeMap = {
  small: 10,
  default: 14,
  large: 18,
};

const statusColors = {
  available: colors.status.success,
  in_use: colors.status.warning,
  maintenance: colors.status.info,
  retired: colors.gray[400],
};

export function EquipmentBadge({
  name,
  size = 'default',
  status = 'available',
  showName = false,
  style,
}: EquipmentBadgeProps) {
  const badgeSize = sizeMap[size];
  const fontSize = fontSizeMap[size];
  const bgColor = statusColors[status];

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: 4,
            backgroundColor: bgColor,
          },
        ]}
      >
        <Text style={[styles.icon, { fontSize }]}>E</Text>
      </View>
      {showName && <Text style={styles.name}>{name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: colors.white,
    fontWeight: '700',
  },
  name: {
    ...typography.bodySmall,
    color: colors.text,
  },
});

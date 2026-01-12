import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, typography } from '@/theme';

type BadgeSize = 'small' | 'default' | 'large';

interface WorkerBadgeProps {
  /** Worker name (will extract initials) */
  name: string;
  /** Badge size */
  size?: BadgeSize;
  /** Custom background color */
  backgroundColor?: string;
  /** Show full name alongside badge */
  showName?: boolean;
  /** Additional style */
  style?: ViewStyle;
}

const sizeMap = {
  small: 24,
  default: 32,
  large: 40,
};

const fontSizeMap = {
  small: 10,
  default: 12,
  large: 14,
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function WorkerBadge({
  name,
  size = 'default',
  backgroundColor = colors.navy,
  showName = false,
  style,
}: WorkerBadgeProps) {
  const initials = getInitials(name);
  const badgeSize = sizeMap[size];
  const fontSize = fontSizeMap[size];

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor,
          },
        ]}
      >
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
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
  initials: {
    color: colors.white,
    fontWeight: '600',
  },
  name: {
    ...typography.bodySmall,
    color: colors.text,
  },
});

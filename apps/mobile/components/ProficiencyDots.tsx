import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface ProficiencyDotsProps {
  /** Proficiency level (1-5) */
  level: 1 | 2 | 3 | 4 | 5;
  /** Maximum level to display */
  maxLevel?: number;
  /** Show text label */
  showLabel?: boolean;
  /** Dot size */
  size?: 'small' | 'default';
  /** Additional style */
  style?: ViewStyle;
}

const levelLabels: Record<number, string> = {
  1: 'Novice',
  2: 'Learning',
  3: 'Competent',
  4: 'Skilled',
  5: 'Expert',
};

const dotSizes = {
  small: 8,
  default: 10,
};

export function ProficiencyDots({
  level,
  maxLevel = 5,
  showLabel = false,
  size = 'default',
  style,
}: ProficiencyDotsProps) {
  const dotSize = dotSizes[size];

  return (
    <View style={[styles.container, style]}>
      <View style={styles.dots}>
        {Array.from({ length: maxLevel }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
              },
              i < level ? styles.filled : styles.empty,
            ]}
          />
        ))}
      </View>
      {showLabel && <Text style={styles.label}>{levelLabels[level]}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    borderWidth: 1.5,
  },
  filled: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  empty: {
    backgroundColor: 'transparent',
    borderColor: colors.gray[300],
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface ProgressBarProps {
  /** Progress value (0-100) */
  value: number;
  /** Maximum value (default 100) */
  max?: number;
  /** Bar height */
  height?: number;
  /** Progress color */
  color?: string;
  /** Background color */
  backgroundColor?: string;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: 'right' | 'inside' | 'above';
  /** Custom label formatter */
  formatLabel?: (value: number, max: number) => string;
  /** Show animated stripes for active progress */
  animated?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function ProgressBar({
  value,
  max = 100,
  height = 8,
  color = colors.navy,
  backgroundColor = colors.gray[200],
  showLabel = false,
  labelPosition = 'right',
  formatLabel,
  animated = false,
  style,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const label = formatLabel
    ? formatLabel(value, max)
    : `${Math.round(percentage)}%`;

  const renderBar = () => (
    <View style={[styles.track, { height, backgroundColor }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${percentage}%`,
            backgroundColor: color,
            height,
          },
        ]}
      />
    </View>
  );

  if (!showLabel) {
    return <View style={style}>{renderBar()}</View>;
  }

  if (labelPosition === 'above') {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.labelAbove}>
          <Text style={styles.labelText}>{label}</Text>
        </View>
        {renderBar()}
      </View>
    );
  }

  if (labelPosition === 'inside' && height >= 16) {
    return (
      <View style={[styles.track, { height, backgroundColor }, style]}>
        <View
          style={[
            styles.fill,
            {
              width: `${percentage}%`,
              backgroundColor: color,
              height,
            },
          ]}
        />
        <Text style={[styles.labelInside, { lineHeight: height }]}>{label}</Text>
      </View>
    );
  }

  // Default: right position
  return (
    <View style={[styles.rowContainer, style]}>
      <View style={styles.barWrapper}>{renderBar()}</View>
      <Text style={styles.labelRight}>{label}</Text>
    </View>
  );
}

// Segmented progress for multi-step processes
interface SegmentedProgressProps {
  /** Total segments */
  total: number;
  /** Completed segments */
  completed: number;
  /** Currently active segment */
  active?: number;
  /** Segment colors */
  colors?: {
    completed?: string;
    active?: string;
    pending?: string;
  };
  /** Container style */
  style?: ViewStyle;
}

export function SegmentedProgress({
  total,
  completed,
  active,
  colors: customColors,
  style,
}: SegmentedProgressProps) {
  const segmentColors = {
    completed: customColors?.completed || colors.status.success,
    active: customColors?.active || colors.amber,
    pending: customColors?.pending || colors.gray[200],
  };

  return (
    <View style={[styles.segmentedContainer, style]}>
      {Array.from({ length: total }, (_, i) => {
        let segmentColor = segmentColors.pending;
        if (i < completed) {
          segmentColor = segmentColors.completed;
        } else if (i === active) {
          segmentColor = segmentColors.active;
        }

        return (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: segmentColor },
              i === 0 && styles.segmentFirst,
              i === total - 1 && styles.segmentLast,
            ]}
          />
        );
      })}
    </View>
  );
}

// Circular progress indicator
interface CircularProgressProps {
  /** Progress value (0-100) */
  value: number;
  /** Circle size */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Progress color */
  color?: string;
  /** Background color */
  backgroundColor?: string;
  /** Show percentage in center */
  showLabel?: boolean;
  /** Children to render in center */
  children?: React.ReactNode;
  /** Container style */
  style?: ViewStyle;
}

export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 8,
  color = colors.navy,
  backgroundColor = colors.gray[200],
  showLabel = true,
  children,
  style,
}: CircularProgressProps) {
  const percentage = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Using View-based approach for RN compatibility
  // For a real app, consider react-native-svg for proper circular progress
  return (
    <View style={[styles.circularContainer, { width: size, height: size }, style]}>
      <View
        style={[
          styles.circularTrack,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: backgroundColor,
          },
        ]}
      />
      <View style={styles.circularCenter}>
        {children || (showLabel && (
          <Text style={styles.circularLabel}>{Math.round(percentage)}%</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barWrapper: {
    flex: 1,
  },
  track: {
    borderRadius: 100,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    borderRadius: 100,
  },
  labelAbove: {
    alignItems: 'flex-end',
  },
  labelText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  labelRight: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'right',
  },
  labelInside: {
    position: 'absolute',
    right: spacing.sm,
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },

  // Segmented
  segmentedContainer: {
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 6,
  },
  segmentFirst: {
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  segmentLast: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },

  // Circular
  circularContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularTrack: {
    position: 'absolute',
  },
  circularCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularLabel: {
    ...typography.h3,
    color: colors.text,
  },
});

import { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  PanResponder,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface SliderProps {
  /** Current value */
  value: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Input label */
  label?: string;
  /** Show value label */
  showValue?: boolean;
  /** Custom value formatter */
  formatValue?: (value: number) => string;
  /** Show step markers */
  showSteps?: boolean;
  /** Step labels */
  stepLabels?: string[];
  /** Disabled state */
  disabled?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  formatValue,
  showSteps = false,
  stepLabels,
  disabled = false,
  style,
}: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);

  const range = max - min;
  const percentage = ((value - min) / range) * 100;
  const numSteps = Math.floor(range / step);

  const valueToPosition = (val: number) => {
    return ((val - min) / range) * trackWidth;
  };

  const positionToValue = (pos: number) => {
    const rawValue = (pos / trackWidth) * range + min;
    const steppedValue = Math.round(rawValue / step) * step;
    return Math.max(min, Math.min(max, steppedValue));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        onChange(positionToValue(x));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        onChange(positionToValue(x));
      },
    })
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View style={[styles.container, style]}>
      {(label || showValue) && (
        <View style={styles.header}>
          {label && <Text style={styles.label}>{label}</Text>}
          {showValue && <Text style={styles.value}>{displayValue}</Text>}
        </View>
      )}

      <View
        ref={trackRef}
        style={[styles.track, disabled && styles.trackDisabled]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.fill, { width: `${percentage}%` }]} />
        <View
          style={[
            styles.thumb,
            { left: `${percentage}%` },
            disabled && styles.thumbDisabled,
          ]}
        />
      </View>

      {showSteps && (
        <View style={styles.stepsContainer}>
          {Array.from({ length: numSteps + 1 }, (_, i) => {
            const stepValue = min + i * step;
            const stepLabel = stepLabels?.[i] || String(stepValue);
            return (
              <View key={i} style={styles.stepLabel}>
                <Text
                  style={[
                    styles.stepLabelText,
                    stepValue === value && styles.stepLabelActive,
                  ]}
                >
                  {stepLabel}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Specialized slider for proficiency (1-5)
interface ProficiencySliderProps {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
  label?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

const PROFICIENCY_LABELS = ['Novice', 'Learning', 'Competent', 'Skilled', 'Expert'];

export function ProficiencySlider({
  value,
  onChange,
  label,
  disabled = false,
  style,
}: ProficiencySliderProps) {
  return (
    <Slider
      value={value}
      onChange={(v) => onChange(v as 1 | 2 | 3 | 4 | 5)}
      min={1}
      max={5}
      step={1}
      label={label}
      showSteps
      stepLabels={PROFICIENCY_LABELS}
      formatValue={(v) => PROFICIENCY_LABELS[v - 1]}
      disabled={disabled}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.label,
    color: colors.text,
    textTransform: 'none',
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    ...typography.body,
    color: colors.navy,
    fontWeight: '600',
  },
  track: {
    height: 8,
    backgroundColor: colors.gray[200],
    borderRadius: 4,
    position: 'relative',
    justifyContent: 'center',
  },
  trackDisabled: {
    backgroundColor: colors.gray[100],
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.amber,
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    marginLeft: -12,
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbDisabled: {
    backgroundColor: colors.gray[400],
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  stepLabel: {
    flex: 1,
    alignItems: 'center',
  },
  stepLabelText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.navy,
    fontWeight: '600',
  },
});

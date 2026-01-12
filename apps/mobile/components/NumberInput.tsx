import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ViewStyle,
} from 'react-native';
import { colors, layout, spacing, typography } from '@/theme';

interface NumberInputProps {
  /** Current value */
  value: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Input label */
  label?: string;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Unit suffix (e.g., "pcs", "hrs") */
  unit?: string;
  /** Disable input */
  disabled?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function NumberInput({
  value,
  onChange,
  label,
  min = 0,
  max = Infinity,
  step = 1,
  helperText,
  error,
  unit,
  disabled = false,
  style,
}: NumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const increment = () => {
    if (!disabled && value + step <= max) {
      onChange(value + step);
    }
  };

  const decrement = () => {
    if (!disabled && value - step >= min) {
      onChange(value - step);
    }
  };

  const handleTextChange = (text: string) => {
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    } else if (text === '') {
      onChange(min);
    }
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          error && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
      >
        <Pressable
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={decrement}
          disabled={disabled || value <= min}
        >
          <Text style={[styles.buttonText, (disabled || value <= min) && styles.buttonTextDisabled]}>
            −
          </Text>
        </Pressable>

        <View style={styles.valueContainer}>
          <TextInput
            style={styles.input}
            value={String(value)}
            onChangeText={handleTextChange}
            keyboardType="number-pad"
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!disabled}
            selectTextOnFocus
          />
          {unit && <Text style={styles.unit}>{unit}</Text>}
        </View>

        <Pressable
          style={[styles.button, disabled && styles.buttonDisabled]}
          onPress={increment}
          disabled={disabled || value >= max}
        >
          <Text style={[styles.buttonText, (disabled || value >= max) && styles.buttonTextDisabled]}>
            +
          </Text>
        </Pressable>
      </View>
      {(helperText || error) && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.text,
    textTransform: 'none',
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.inputBorderRadius,
    minHeight: layout.inputMinHeight,
  },
  inputFocused: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  inputError: {
    borderColor: colors.status.error,
  },
  inputDisabled: {
    backgroundColor: colors.gray[100],
  },
  button: {
    width: 48,
    height: '100%',
    minHeight: layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '500',
    color: colors.navy,
  },
  buttonTextDisabled: {
    color: colors.textMuted,
  },
  valueContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  input: {
    ...typography.monoLarge,
    color: colors.text,
    textAlign: 'center',
    minWidth: 60,
  },
  unit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.status.error,
  },
});

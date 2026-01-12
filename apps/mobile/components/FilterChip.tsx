import { StyleSheet, Text, Pressable, View, ViewStyle, ScrollView } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface FilterChipProps {
  /** Chip label */
  label: string;
  /** Whether chip is selected */
  selected?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Show count badge */
  count?: number;
  /** Chip icon */
  icon?: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function FilterChip({
  label,
  selected = false,
  onPress,
  count,
  icon,
  disabled = false,
  style,
}: FilterChipProps) {
  return (
    <Pressable
      style={[
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text
        style={[
          styles.label,
          selected && styles.labelSelected,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
      {count !== undefined && count > 0 && (
        <View style={[styles.badge, selected && styles.badgeSelected]}>
          <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Convenience component for a row of filter chips
interface FilterChipGroupProps<T extends string> {
  /** Available options */
  options: { value: T; label: string; count?: number }[];
  /** Currently selected values */
  selected: T[];
  /** Change handler */
  onChange: (selected: T[]) => void;
  /** Allow multiple selection */
  multiple?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function FilterChipGroup<T extends string>({
  options,
  selected,
  onChange,
  multiple = true,
  style,
}: FilterChipGroupProps<T>) {
  const handlePress = (value: T) => {
    if (multiple) {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      if (selected.includes(value)) {
        onChange([]);
      } else {
        onChange([value]);
      }
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.group, style]}
    >
      {options.map((option) => (
        <FilterChip
          key={option.value}
          label={option.label}
          count={option.count}
          selected={selected.includes(option.value)}
          onPress={() => handlePress(option.value)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.gray[100],
    gap: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.navy,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '500',
  },
  labelSelected: {
    color: colors.white,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeSelected: {
    backgroundColor: colors.amber,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
  badgeTextSelected: {
    color: colors.charcoal,
  },
  group: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});

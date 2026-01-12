import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  FlatList,
  ViewStyle,
} from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { colors, layout, spacing, typography } from '@/theme';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
}

interface SelectProps<T = string> {
  /** Currently selected value */
  value: T | null;
  /** Change handler */
  onChange: (value: T) => void;
  /** Available options */
  options: SelectOption<T>[];
  /** Placeholder when no selection */
  placeholder?: string;
  /** Input label */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Disable select */
  disabled?: boolean;
  /** Container style */
  style?: ViewStyle;
}

export function Select<T = string>({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  label,
  helperText,
  error,
  disabled = false,
  style,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (option: SelectOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable
        style={[
          styles.selectButton,
          isOpen && styles.selectButtonOpen,
          error && styles.selectButtonError,
          disabled && styles.selectButtonDisabled,
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        <Text
          style={[
            styles.selectText,
            !selectedOption && styles.placeholderText,
          ]}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>

      {(helperText || error) && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {error || helperText}
        </Text>
      )}

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          <View style={styles.dropdown}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{label || 'Select'}</Text>
              <Pressable onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.option,
                    item.value === value && styles.optionSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.value === value && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.description && (
                    <Text style={styles.optionDescription}>
                      {item.description}
                    </Text>
                  )}
                </Pressable>
              )}
              style={styles.optionsList}
            />
          </View>
        </Pressable>
      </Modal>
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
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.inputBorderRadius,
    minHeight: layout.inputMinHeight,
    paddingHorizontal: layout.inputPadding,
  },
  selectButtonOpen: {
    borderColor: colors.navy,
    borderWidth: 2,
  },
  selectButtonError: {
    borderColor: colors.status.error,
  },
  selectButtonDisabled: {
    backgroundColor: colors.gray[100],
  },
  selectText: {
    ...typography.body,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textMuted,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.status.error,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dropdown: {
    backgroundColor: colors.white,
    borderRadius: layout.cardBorderRadius,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownTitle: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    padding: spacing.xs,
  },
  optionsList: {
    flexGrow: 0,
  },
  option: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionSelected: {
    backgroundColor: colors.gray[50],
  },
  optionText: {
    ...typography.body,
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.navy,
    fontWeight: '600',
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

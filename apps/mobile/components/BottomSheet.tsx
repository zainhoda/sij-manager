import { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  ViewStyle,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors, spacing, typography, layout } from '@/theme';

interface BottomSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** Close handler */
  onClose: () => void;
  /** Sheet title */
  title?: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Height as percentage of screen (0-1) */
  height?: number;
  /** Show close button in header */
  showCloseButton?: boolean;
  /** Show drag handle */
  showHandle?: boolean;
  /** Close when tapping backdrop */
  closeOnBackdrop?: boolean;
  /** Footer content (fixed at bottom) */
  footer?: React.ReactNode;
  /** Container style for content area */
  contentStyle?: ViewStyle;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  height = 0.5,
  showCloseButton = true,
  showHandle = true,
  closeOnBackdrop = true,
  footer,
  contentStyle,
}: BottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const sheetHeight = SCREEN_HEIGHT * height;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: sheetHeight,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim, sheetHeight]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Animated.View
          style={[styles.backdrop, { opacity: fadeAnim }]}
        >
          <Pressable
            style={styles.backdropPressable}
            onPress={closeOnBackdrop ? onClose : undefined}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { height: sheetHeight, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {showHandle && (
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          )}

          {(title || showCloseButton) && (
            <View style={styles.header}>
              {title && <Text style={styles.title}>{title}</Text>}
              {showCloseButton && (
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <X size={20} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          )}

          <ScrollView
            style={styles.content}
            contentContainerStyle={[styles.contentContainer, contentStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer && (
            <View style={styles.footer}>
              {footer}
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Convenience component for action sheets with options
interface ActionSheetOption {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'destructive';
  icon?: React.ReactNode;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  message,
  options,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const handleOptionPress = (option: ActionSheetOption) => {
    onClose();
    option.onPress();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={0.4}
      showCloseButton={false}
    >
      <View style={actionStyles.container}>
        {title && <Text style={actionStyles.title}>{title}</Text>}
        {message && <Text style={actionStyles.message}>{message}</Text>}

        <View style={actionStyles.options}>
          {options.map((option, index) => (
            <Pressable
              key={index}
              style={actionStyles.option}
              onPress={() => handleOptionPress(option)}
            >
              {option.icon && <View style={actionStyles.optionIcon}>{option.icon}</View>}
              <Text
                style={[
                  actionStyles.optionLabel,
                  option.variant === 'destructive' && actionStyles.destructive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={actionStyles.cancelButton} onPress={onClose}>
          <Text style={actionStyles.cancelLabel}>{cancelLabel}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.gray[300],
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});

const actionStyles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  options: {
    gap: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.gray[50],
    borderRadius: layout.buttonBorderRadius,
  },
  optionIcon: {
    marginRight: spacing.sm,
  },
  optionLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  destructive: {
    color: colors.status.error,
  },
  cancelButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelLabel: {
    ...typography.button,
    color: colors.textSecondary,
  },
});

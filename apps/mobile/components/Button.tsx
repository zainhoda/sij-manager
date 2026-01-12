import {
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { colors, layout, typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';
type ButtonSize = 'default' | 'small';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  /** Button text */
  title: string;
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Icon component to render before text */
  icon?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
  /** Additional style */
  style?: ViewStyle;
}

export function Button({
  title,
  variant = 'primary',
  size = 'default',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        size === 'small' && styles.small,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.white : colors.navy}
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text
            style={[
              styles.text,
              styles[`${variant}Text` as keyof typeof styles],
              size === 'small' && styles.smallText,
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: layout.buttonBorderRadius,
    minHeight: layout.buttonMinHeight,
    paddingHorizontal: layout.buttonPaddingHorizontal,
    paddingVertical: layout.buttonPadding,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  small: {
    minHeight: 36,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fullWidth: {
    width: '100%',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 4,
  },

  // Variants
  primary: {
    backgroundColor: colors.navy,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.navy,
  },
  accent: {
    backgroundColor: colors.amber,
  },
  ghost: {
    backgroundColor: 'transparent',
  },

  // Text styles
  text: {
    ...typography.button,
  },
  smallText: {
    ...typography.buttonSmall,
  },
  primaryText: {
    color: colors.white,
  },
  secondaryText: {
    color: colors.navy,
  },
  accentText: {
    color: colors.charcoal,
  },
  ghostText: {
    color: colors.navy,
  },
});

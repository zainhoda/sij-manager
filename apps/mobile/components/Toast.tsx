import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Check, X, AlertTriangle, Info } from 'lucide-react-native';
import { colors, spacing, typography, layout } from '@/theme';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastProps extends ToastConfig {
  visible: boolean;
  onHide: () => void;
}

const typeConfig: Record<ToastType, { Icon: typeof Check; backgroundColor: string; borderColor: string }> = {
  success: {
    Icon: Check,
    backgroundColor: colors.status.successLight,
    borderColor: colors.status.success,
  },
  error: {
    Icon: X,
    backgroundColor: colors.status.errorLight,
    borderColor: colors.status.error,
  },
  warning: {
    Icon: AlertTriangle,
    backgroundColor: colors.status.warningLight,
    borderColor: colors.status.warning,
  },
  info: {
    Icon: Info,
    backgroundColor: colors.status.infoLight,
    borderColor: colors.status.info,
  },
};

export function Toast({
  message,
  type = 'info',
  duration = 3000,
  action,
  visible,
  onHide,
}: ToastProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (duration > 0) {
        const timer = setTimeout(() => {
          hideToast();
        }, duration);
        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  const config = typeConfig[type];

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderLeftColor: config.borderColor,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: config.borderColor }]}>
        <config.Icon size={14} color={colors.white} strokeWidth={2.5} />
      </View>

      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>

      {action && (
        <Pressable onPress={action.onPress} style={styles.action}>
          <Text style={[styles.actionText, { color: config.borderColor }]}>
            {action.label}
          </Text>
        </Pressable>
      )}

      <Pressable onPress={hideToast} style={styles.closeButton}>
        <X size={14} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// Toast Context for app-wide toast management
interface ToastContextValue {
  show: (config: ToastConfig) => void;
  success: (message: string, options?: Partial<ToastConfig>) => void;
  error: (message: string, options?: Partial<ToastConfig>) => void;
  warning: (message: string, options?: Partial<ToastConfig>) => void;
  info: (message: string, options?: Partial<ToastConfig>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback((config: ToastConfig) => {
    setToast(config);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    setTimeout(() => setToast(null), 200);
  }, []);

  const success = useCallback((message: string, options?: Partial<ToastConfig>) => {
    show({ message, type: 'success', ...options });
  }, [show]);

  const error = useCallback((message: string, options?: Partial<ToastConfig>) => {
    show({ message, type: 'error', ...options });
  }, [show]);

  const warning = useCallback((message: string, options?: Partial<ToastConfig>) => {
    show({ message, type: 'warning', ...options });
  }, [show]);

  const info = useCallback((message: string, options?: Partial<ToastConfig>) => {
    show({ message, type: 'info', ...options });
  }, [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info }}>
      {children}
      {toast && (
        <View style={styles.toastWrapper}>
          <Toast {...toast} visible={visible} onHide={hide} />
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: 50, // Account for status bar
    paddingHorizontal: spacing.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: layout.cardBorderRadius,
    borderLeftWidth: 4,
    shadowColor: colors.charcoal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: spacing.sm,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
  },
  action: {
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  closeButton: {
    padding: spacing.xs,
  },
});

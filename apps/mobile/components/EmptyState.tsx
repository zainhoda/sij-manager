import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Calendar, Users, Package, Search } from 'lucide-react-native';
import { colors, spacing, typography } from '@/theme';
import { Button } from './Button';

interface EmptyStateProps {
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Icon or illustration */
  icon?: React.ReactNode;
  /** Primary action */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Secondary action */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Size variant */
  size?: 'small' | 'default' | 'large';
  /** Container style */
  style?: ViewStyle;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  size = 'default',
  style,
}: EmptyStateProps) {
  const sizeStyles = {
    small: {
      container: styles.containerSmall,
      title: styles.titleSmall,
      description: styles.descriptionSmall,
    },
    default: {
      container: styles.container,
      title: styles.title,
      description: styles.description,
    },
    large: {
      container: styles.containerLarge,
      title: styles.titleLarge,
      description: styles.descriptionLarge,
    },
  };

  return (
    <View style={[sizeStyles[size].container, style]}>
      {icon && (
        <View style={styles.iconContainer}>
          {icon}
        </View>
      )}

      <Text style={sizeStyles[size].title}>{title}</Text>

      {description && (
        <Text style={sizeStyles[size].description}>{description}</Text>
      )}

      {(action || secondaryAction) && (
        <View style={styles.actions}>
          {action && (
            <Button
              title={action.label}
              onPress={action.onPress}
              variant="primary"
              size={size === 'small' ? 'small' : 'default'}
            />
          )}
          {secondaryAction && (
            <Button
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="ghost"
              size={size === 'small' ? 'small' : 'default'}
            />
          )}
        </View>
      )}
    </View>
  );
}

// Pre-built empty states for common scenarios
export function NoScheduleEmpty({ onCreateOrder }: { onCreateOrder?: () => void }) {
  return (
    <EmptyState
      title="No schedule yet"
      description="Create an order to generate a production schedule"
      icon={<Calendar size={48} color={colors.textMuted} strokeWidth={1.5} />}
      action={onCreateOrder ? { label: 'Create Order', onPress: onCreateOrder } : undefined}
    />
  );
}

export function NoWorkersEmpty({ onAddWorker }: { onAddWorker?: () => void }) {
  return (
    <EmptyState
      title="No workers added"
      description="Add workers to assign them to production steps"
      icon={<Users size={48} color={colors.textMuted} strokeWidth={1.5} />}
      action={onAddWorker ? { label: 'Add Worker', onPress: onAddWorker } : undefined}
    />
  );
}

export function NoOrdersEmpty({ onCreateOrder }: { onCreateOrder?: () => void }) {
  return (
    <EmptyState
      title="No orders"
      description="Create your first order to get started"
      icon={<Package size={48} color={colors.textMuted} strokeWidth={1.5} />}
      action={onCreateOrder ? { label: 'Create Order', onPress: onCreateOrder } : undefined}
    />
  );
}

export function NoResultsEmpty({ query, onClear }: { query?: string; onClear?: () => void }) {
  return (
    <EmptyState
      title="No results found"
      description={query ? `No matches for "${query}"` : 'Try adjusting your filters'}
      icon={<Search size={40} color={colors.textMuted} strokeWidth={1.5} />}
      action={onClear ? { label: 'Clear Filters', onPress: onClear } : undefined}
      size="small"
    />
  );
}

export function NoProductsEmpty() {
  return (
    <EmptyState
      title="No products"
      description="Products will appear here once they're added to the system"
      icon={<Package size={48} color={colors.textMuted} strokeWidth={1.5} />}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  containerSmall: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  containerLarge: {
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  iconContainer: {
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  titleSmall: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  titleLarge: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  descriptionSmall: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
  descriptionLarge: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

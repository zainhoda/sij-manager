import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';
import { OrderWithProgress } from '@/hooks/useDashboardData';

interface OrderStatusListProps {
  orders: OrderWithProgress[];
}

const STATUS_COLORS = {
  on_track: colors.status.success,
  at_risk: colors.status.warning,
  behind: colors.status.error,
  completed: colors.status.info,
};

const STATUS_LABELS = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  behind: 'Behind',
  completed: 'Complete',
};

export function OrderStatusList({ orders }: OrderStatusListProps) {
  const formatDueDate = (order: OrderWithProgress) => {
    if (order.status === 'completed') return 'Completed';
    if (order.daysRemaining < 0) return `${Math.abs(order.daysRemaining)} days overdue`;
    if (order.daysRemaining === 0) return 'Due today';
    if (order.daysRemaining === 1) return 'Due tomorrow';
    return `Due in ${order.daysRemaining} days`;
  };

  if (orders.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>ORDERS</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active orders</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ORDERS</Text>
      <View style={styles.ordersList}>
        {orders.map((order) => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderName} numberOfLines={1}>
                {order.productName} #{order.id}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[order.status] }]} />
                <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}>
                  {STATUS_LABELS[order.status]}
                </Text>
              </View>
            </View>

            <Text style={styles.dueDate}>{formatDueDate(order)}</Text>

            <View style={styles.progressRow}>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(order.progressPercent, 100)}%`,
                      backgroundColor: STATUS_COLORS[order.status],
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{order.progressPercent}%</Text>
            </View>

            <Text style={styles.quantity}>
              {order.completedQuantity.toLocaleString()} / {order.quantity.toLocaleString()} units
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[800],
    borderRadius: 16,
    padding: 28,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[400],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  ordersList: {
    gap: 16,
  },
  orderCard: {
    backgroundColor: colors.gray[700],
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.white,
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dueDate: {
    fontSize: 18,
    color: colors.gray[300],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  progressBarTrack: {
    flex: 1,
    height: 16,
    backgroundColor: colors.gray[600],
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
    minWidth: 60,
    textAlign: 'right',
  },
  quantity: {
    fontSize: 16,
    color: colors.gray[400],
    fontFamily: 'monospace',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    color: colors.gray[500],
  },
});

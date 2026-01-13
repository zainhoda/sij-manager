import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { View, Text } from '@/components/Themed';
import { Card, Button, NoOrdersEmpty } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { getOrders, Order, generateSchedule } from '@/api/client';

const STATUS_COLORS: Record<string, string> = {
  pending: colors.status.warning,
  scheduled: colors.status.info,
  in_progress: colors.navy,
  completed: colors.status.success,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setError(null);
      const data = await getOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const handleGenerateSchedule = async (orderId: number) => {
    try {
      setGeneratingId(orderId);
      await generateSchedule(orderId);
      await fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setGeneratingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchOrders} variant="secondary" />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <NoOrdersEmpty />
        <Link href="/orders/new" asChild>
          <Button title="Create Order" variant="primary" style={styles.createButton} />
        </Link>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <Link href="/orders/new" asChild>
          <Pressable style={styles.addButton}>
            <FontAwesome name="plus" size={16} color={colors.white} />
          </Pressable>
        </Link>
      </View>

      {orders.map((order) => (
        <Card key={order.id} style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.productName}>{order.product_name}</Text>
              <Text style={styles.quantity}>{order.quantity} units</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: STATUS_COLORS[order.status] + '20' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_COLORS[order.status] },
                ]}
              />
              <Text
                style={[styles.statusText, { color: STATUS_COLORS[order.status] }]}
              >
                {STATUS_LABELS[order.status]}
              </Text>
            </View>
          </View>

          <View style={styles.orderDetails}>
            <View style={styles.detailRow}>
              <FontAwesome name="calendar" size={14} color={colors.textSecondary} />
              <Text style={styles.detailText}>Due: {formatDate(order.due_date)}</Text>
            </View>
            <View style={styles.detailRow}>
              <FontAwesome name="clock-o" size={14} color={colors.textSecondary} />
              <Text style={styles.detailText}>
                Created: {formatDate(order.created_at)}
              </Text>
            </View>
          </View>

          {order.status === 'pending' && (
            <Button
              title="Generate Schedule"
              variant="accent"
              size="small"
              loading={generatingId === order.id}
              onPress={() => handleGenerateSchedule(order.id)}
              style={styles.generateButton}
            />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.status.error,
    textAlign: 'center',
  },
  createButton: {
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.navy,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  productName: {
    ...typography.h3,
    color: colors.text,
  },
  quantity: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  orderDetails: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  generateButton: {
    marginTop: spacing.md,
  },
});

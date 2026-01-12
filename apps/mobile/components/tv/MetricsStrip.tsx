import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';
import { DashboardMetrics } from '@/hooks/useDashboardData';

interface MetricsStripProps {
  metrics: DashboardMetrics;
}

export function MetricsStrip({ metrics }: MetricsStripProps) {
  const { efficiency, piecesToday, ordersOnTrack, totalOrders } = metrics;

  const getEfficiencyColor = () => {
    if (efficiency >= 95) return colors.status.success;
    if (efficiency >= 80) return colors.status.warning;
    return colors.status.error;
  };

  return (
    <View style={styles.container}>
      <View style={styles.metric}>
        <Text style={styles.label}>Efficiency</Text>
        <Text style={[styles.value, { color: getEfficiencyColor() }]}>{efficiency}%</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.metric}>
        <Text style={styles.label}>Pieces Today</Text>
        <Text style={styles.value}>{piecesToday.toLocaleString()}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.metric}>
        <Text style={styles.label}>Orders On Track</Text>
        <Text style={styles.value}>
          {ordersOnTrack} / {totalOrders}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
    paddingVertical: 20,
    paddingHorizontal: 40,
    gap: 60,
    borderTopWidth: 1,
    borderTopColor: colors.gray[700],
  },
  metric: {
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 16,
    color: colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.white,
    fontFamily: 'monospace',
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: colors.gray[600],
  },
});

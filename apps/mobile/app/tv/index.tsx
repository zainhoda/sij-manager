import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { colors } from '@/theme';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  TVHeader,
  DailyProgressCard,
  OrderStatusList,
  StationStatusGrid,
  MetricsStrip,
} from '@/components/tv';

export default function TVDashboard() {
  const { dailyProgress, orders, stations, metrics, lastRefresh, isLoading, error } = useDashboardData(30000);

  if (isLoading && !dailyProgress.totalEntries) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.amber} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Unable to load dashboard</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <Text style={styles.errorHint}>Check that the server is running and try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TVHeader lastRefresh={lastRefresh} isRefreshing={isLoading} />

      <View style={styles.content}>
        {/* Left Column - 60% */}
        <View style={styles.leftColumn}>
          <DailyProgressCard progress={dailyProgress} />
          <OrderStatusList orders={orders} />
        </View>

        {/* Right Column - 40% */}
        <View style={styles.rightColumn}>
          <StationStatusGrid stations={stations} />
        </View>
      </View>

      <MetricsStrip metrics={metrics} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[900],
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    padding: 24,
    gap: 24,
  },
  leftColumn: {
    flex: 6,
    gap: 24,
  },
  rightColumn: {
    flex: 4,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.gray[900],
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  loadingText: {
    fontSize: 24,
    color: colors.gray[400],
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.gray[900],
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  errorTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.status.error,
  },
  errorMessage: {
    fontSize: 20,
    color: colors.gray[400],
  },
  errorHint: {
    fontSize: 18,
    color: colors.gray[500],
    marginTop: 20,
  },
});

import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '@/theme';
import { useEquipmentTabletData } from '@/hooks/useEquipmentTabletData';
import {
  EquipmentHeader,
  CurrentTaskCard,
  NextTaskCard,
  TodayProgressCard,
} from '@/components/equipment-tablet';

export default function EquipmentTabletScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const equipmentId = id ? parseInt(id, 10) : null;

  const {
    equipment,
    currentTask,
    nextTask,
    todayProgress,
    lastRefresh,
    isLoading,
    error,
  } = useEquipmentTabletData(equipmentId, 30000);

  if (isLoading && !equipment) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.amber} />
        <Text style={styles.loadingText}>Loading equipment...</Text>
      </View>
    );
  }

  if (error || !equipment) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Unable to load equipment</Text>
        <Text style={styles.errorMessage}>
          {error?.message || 'Equipment not found'}
        </Text>
        <Text style={styles.errorHint}>
          Check that the equipment ID is valid and the server is running.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <EquipmentHeader
        equipment={equipment}
        lastRefresh={lastRefresh}
        isRefreshing={isLoading}
      />

      <View style={styles.content}>
        {/* Left Column - Current Task and Next Task */}
        <View style={styles.leftColumn}>
          <CurrentTaskCard task={currentTask} />
          <NextTaskCard task={nextTask} />
        </View>

        {/* Right Column - Today's Progress */}
        <View style={styles.rightColumn}>
          <TodayProgressCard progress={todayProgress} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[900],
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
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 18,
    color: colors.gray[500],
    marginTop: 20,
    textAlign: 'center',
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
});

import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

interface TodayProgressCardProps {
  progress: {
    totalPlanned: number;
    totalCompleted: number;
    entriesCompleted: number;
    totalEntries: number;
    percentage: number;
  };
}

export function TodayProgressCard({ progress }: TodayProgressCardProps) {
  const { totalPlanned, totalCompleted, entriesCompleted, totalEntries, percentage } = progress;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TODAY'S PROGRESS</Text>

      <View style={styles.mainStats}>
        <Text style={styles.percentage}>{percentage}%</Text>
        <Text style={styles.pieces}>
          {totalCompleted.toLocaleString()} / {totalPlanned.toLocaleString()} pieces
        </Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${Math.min(percentage, 100)}%` }]} />
        </View>
      </View>

      <View style={styles.tasksRow}>
        <Text style={styles.tasksLabel}>Tasks completed</Text>
        <Text style={styles.tasksValue}>
          {entriesCompleted} / {totalEntries}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[800],
    borderRadius: 16,
    padding: 28,
    gap: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[400],
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mainStats: {
    alignItems: 'center',
    gap: 8,
  },
  percentage: {
    fontSize: 72,
    fontWeight: '700',
    color: colors.white,
    fontFamily: 'monospace',
  },
  pieces: {
    fontSize: 24,
    color: colors.gray[300],
    fontFamily: 'monospace',
  },
  progressBarContainer: {
    paddingVertical: 8,
  },
  progressBarTrack: {
    height: 24,
    backgroundColor: colors.gray[700],
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.amber,
    borderRadius: 12,
  },
  tasksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tasksLabel: {
    fontSize: 20,
    color: colors.gray[400],
  },
  tasksValue: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
  },
});

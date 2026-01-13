import { StyleSheet, Text, View } from 'react-native';
import { colors, getCategoryColor } from '@/theme';
import { ScheduleEntry } from '@/api/client';

interface CurrentTaskCardProps {
  task: ScheduleEntry | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  CUTTING: 'Cutting',
  SILKSCREEN: 'Silkscreen',
  PREP: 'Prep',
  SEWING: 'Sewing',
  INSPECTION: 'Inspection',
};

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getTimeRemaining(endTime: string): string {
  const now = new Date();
  const [hours, minutes] = endTime.split(':').map(Number);
  const end = new Date();
  end.setHours(hours, minutes, 0, 0);
  
  if (end < now) return 'Overdue';
  
  const diff = end.getTime() - now.getTime();
  const hoursRemaining = Math.floor(diff / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hoursRemaining > 0) {
    return `${hoursRemaining}h ${minutesRemaining}m remaining`;
  }
  return `${minutesRemaining}m remaining`;
}

export function CurrentTaskCard({ task }: CurrentTaskCardProps) {
  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CURRENT TASK</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No active task</Text>
          <Text style={styles.emptySubtext}>Equipment is available</Text>
        </View>
      </View>
    );
  }

  const categoryColor = getCategoryColor(task.category);
  const categoryLabel = CATEGORY_LABELS[task.category.toUpperCase()] || task.category;
  const planned = task.planned_output;
  const actual = task.total_actual_output || task.actual_output || 0;
  const percentage = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const workers = task.assignments?.map((a) => a.worker_name).join(', ') || task.worker_name || 'Unassigned';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CURRENT TASK</Text>
      
      <View style={styles.taskHeader}>
        <View style={styles.categoryRow}>
          <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
          <Text style={styles.categoryName}>{categoryLabel}</Text>
        </View>
        <Text style={styles.timeRemaining}>{getTimeRemaining(task.end_time)}</Text>
      </View>

      <Text style={styles.taskName}>{task.step_name}</Text>
      
      {task.product_name && (
        <Text style={styles.productName}>{task.product_name}</Text>
      )}

      <View style={styles.workersRow}>
        <Text style={styles.workersLabel}>Assigned:</Text>
        <Text style={styles.workersValue}>{workers}</Text>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: categoryColor,
              },
            ]}
          />
        </View>
        <Text style={styles.progressPercent}>{percentage}%</Text>
      </View>

      <View style={styles.piecesRow}>
        <Text style={styles.piecesLabel}>Pieces:</Text>
        <Text style={styles.piecesValue}>
          {actual.toLocaleString()} / {planned.toLocaleString()}
        </Text>
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>Time:</Text>
        <Text style={styles.timeValue}>
          {formatTime(task.start_time)} - {formatTime(task.end_time)}
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
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[400],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.gray[500],
  },
  emptySubtext: {
    fontSize: 20,
    color: colors.gray[600],
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  categoryName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.white,
  },
  timeRemaining: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.amber,
    fontFamily: 'monospace',
  },
  taskName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.white,
    marginTop: 4,
  },
  productName: {
    fontSize: 24,
    color: colors.gray[300],
    marginTop: -4,
  },
  workersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  workersLabel: {
    fontSize: 18,
    color: colors.gray[400],
  },
  workersValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.white,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  progressBarTrack: {
    flex: 1,
    height: 24,
    backgroundColor: colors.gray[700],
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 12,
  },
  progressPercent: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
    minWidth: 60,
    textAlign: 'right',
  },
  piecesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  piecesLabel: {
    fontSize: 20,
    color: colors.gray[400],
  },
  piecesValue: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 20,
    color: colors.gray[400],
  },
  timeValue: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.gray[300],
    fontFamily: 'monospace',
  },
});

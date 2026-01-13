import { StyleSheet, Text, View } from 'react-native';
import { colors, getCategoryColor } from '@/theme';
import { ScheduleEntry } from '@/api/client';

interface NextTaskCardProps {
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

function formatDate(date: string): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(d);
  taskDate.setHours(0, 0, 0, 0);
  
  if (taskDate.getTime() === today.getTime()) {
    return 'Today';
  }
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (taskDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NextTaskCard({ task }: NextTaskCardProps) {
  if (!task) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>NEXT TASK</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No upcoming tasks</Text>
        </View>
      </View>
    );
  }

  const categoryColor = getCategoryColor(task.category);
  const categoryLabel = CATEGORY_LABELS[task.category.toUpperCase()] || task.category;
  const dateLabel = formatDate(task.date);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NEXT TASK</Text>
      
      <View style={styles.taskHeader}>
        <View style={styles.categoryRow}>
          <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
          <Text style={styles.categoryName}>{categoryLabel}</Text>
        </View>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
      </View>

      <Text style={styles.taskName}>{task.step_name}</Text>
      
      {task.product_name && (
        <Text style={styles.productName}>{task.product_name}</Text>
      )}

      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>Start time:</Text>
        <Text style={styles.timeValue}>{formatTime(task.start_time)}</Text>
      </View>

      <View style={styles.piecesRow}>
        <Text style={styles.piecesLabel}>Planned:</Text>
        <Text style={styles.piecesValue}>{task.planned_output.toLocaleString()} pieces</Text>
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
  },
  emptyText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.gray[500],
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
  dateLabel: {
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
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
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
});

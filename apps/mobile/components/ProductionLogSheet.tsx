import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { Play, CheckCircle, Clock } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { NumberInput } from './NumberInput';
import { CategoryBadge } from './CategoryBadge';
import { colors, spacing, typography, CategoryType } from '@/theme';
import {
  ScheduleEntry,
  startScheduleEntry,
  completeScheduleEntry,
  updateScheduleEntry,
} from '@/api/client';

interface ProductionLogSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  onUpdated: () => void;
}

function mapCategoryToType(category: string): CategoryType {
  const mapping: Record<string, CategoryType> = {
    CUTTING: 'cutting',
    SILKSCREEN: 'silkscreen',
    PREP: 'prep',
    SEWING: 'sewing',
    INSPECTION: 'inspection',
  };
  return mapping[category] || 'sewing';
}

function formatTime(time: string | null): string {
  if (!time) return '--:--';
  return time;
}

export function ProductionLogSheet({
  visible,
  onClose,
  entry,
  onUpdated,
}: ProductionLogSheetProps) {
  const [actualOutput, setActualOutput] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entry) {
      setActualOutput(entry.actual_output || 0);
    }
  }, [entry]);

  if (!entry) return null;

  const isNotStarted = entry.status === 'not_started';
  const isInProgress = entry.status === 'in_progress';
  const isCompleted = entry.status === 'completed';

  const handleStart = async () => {
    setLoading(true);
    try {
      await startScheduleEntry(entry.id);
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to start task');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (actualOutput <= 0) {
      Alert.alert('Error', 'Please enter the actual output');
      return;
    }

    setLoading(true);
    try {
      await completeScheduleEntry(entry.id, { actual_output: actualOutput });
      onUpdated();
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to complete task');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOutput = async () => {
    setLoading(true);
    try {
      await updateScheduleEntry(entry.id, { actual_output: actualOutput });
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to update output');
    } finally {
      setLoading(false);
    }
  };

  // Calculate efficiency if completed
  const efficiency =
    isCompleted && entry.actual_start_time && entry.actual_end_time && entry.time_per_piece_seconds
      ? calculateEfficiency(
          entry.actual_start_time,
          entry.actual_end_time,
          entry.actual_output,
          entry.time_per_piece_seconds
        )
      : null;

  const footer = (
    <View style={styles.footer}>
      {isNotStarted && (
        <Button
          title="Start Work"
          icon={<Play size={18} color={colors.white} />}
          onPress={handleStart}
          loading={loading}
          fullWidth
        />
      )}
      {isInProgress && (
        <View style={styles.footerButtons}>
          <Button
            title="Update"
            variant="secondary"
            onPress={handleUpdateOutput}
            loading={loading}
            style={styles.footerButton}
          />
          <Button
            title="Complete"
            icon={<CheckCircle size={18} color={colors.white} />}
            onPress={handleComplete}
            loading={loading}
            style={styles.footerButton}
          />
        </View>
      )}
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Production Log"
      height={0.65}
      footer={!isCompleted ? footer : undefined}
    >
      <View style={styles.content}>
        {/* Header info */}
        <View style={styles.header}>
          <CategoryBadge category={mapCategoryToType(entry.category)} size="default" />
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isCompleted
                    ? colors.status.success
                    : isInProgress
                    ? colors.status.warning
                    : colors.gray[400],
                },
              ]}
            />
            <Text style={styles.statusText}>
              {isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started'}
            </Text>
          </View>
        </View>

        <Text style={styles.stepName}>{entry.step_name}</Text>

        {/* Scheduled times */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>Start</Text>
              <Text style={styles.timeValue}>{entry.start_time}</Text>
            </View>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>End</Text>
              <Text style={styles.timeValue}>{entry.end_time}</Text>
            </View>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>Planned Output</Text>
              <Text style={styles.timeValue}>{entry.planned_output} pcs</Text>
            </View>
          </View>
        </View>

        {/* Actual times */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actual</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeItem}>
              <Clock size={16} color={colors.textSecondary} />
              <Text style={styles.timeLabel}>Started</Text>
              <Text style={styles.timeValue}>{formatTime(entry.actual_start_time)}</Text>
            </View>
            <View style={styles.timeItem}>
              <Clock size={16} color={colors.textSecondary} />
              <Text style={styles.timeLabel}>Ended</Text>
              <Text style={styles.timeValue}>{formatTime(entry.actual_end_time)}</Text>
            </View>
          </View>
        </View>

        {/* Output entry */}
        {(isInProgress || isCompleted) && (
          <View style={styles.section}>
            <NumberInput
              label="Actual Output"
              value={actualOutput}
              onChange={setActualOutput}
              min={0}
              max={entry.planned_output * 2}
              unit="pcs"
              disabled={isCompleted}
              helperText={`Planned: ${entry.planned_output} pcs`}
            />
          </View>
        )}

        {/* Efficiency stats */}
        {efficiency !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {efficiency.efficiency}%
                </Text>
                <Text style={styles.statLabel}>Efficiency</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {efficiency.actualPiecesPerHour}
                </Text>
                <Text style={styles.statLabel}>pcs/hr</Text>
              </View>
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        efficiency.variance >= 0 ? colors.status.success : colors.status.error,
                    },
                  ]}
                >
                  {efficiency.variance >= 0 ? '+' : ''}{efficiency.variance}
                </Text>
                <Text style={styles.statLabel}>vs Planned</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

function calculateEfficiency(
  startTime: string,
  endTime: string,
  actualOutput: number,
  timePerPieceSeconds: number
) {
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const startMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMinutes = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);
  const actualMinutes = endMinutes - startMinutes;

  if (actualMinutes <= 0) return null;

  const expectedSeconds = actualOutput * timePerPieceSeconds;
  const expectedMinutes = expectedSeconds / 60;
  const efficiency = Math.round((expectedMinutes / actualMinutes) * 100);
  const actualPiecesPerHour = Math.round((actualOutput / actualMinutes) * 60 * 10) / 10;

  // Calculate planned output for the actual time worked
  const plannedForTime = Math.floor((actualMinutes * 60) / timePerPieceSeconds);
  const variance = actualOutput - plannedForTime;

  return {
    efficiency,
    actualPiecesPerHour,
    variance,
  };
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepName: {
    ...typography.h2,
    color: colors.text,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timeValue: {
    ...typography.monoLarge,
    color: colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    padding: spacing.md,
    borderRadius: 8,
  },
  statValue: {
    ...typography.h2,
    color: colors.navy,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    gap: spacing.sm,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});

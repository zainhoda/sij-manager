import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView, Pressable, Modal, FlatList } from 'react-native';
import { Play, CheckCircle, Clock, UserPlus, X, User, Trash2 } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { NumberInput } from './NumberInput';
import { CategoryBadge } from './CategoryBadge';
import { WorkerBadge } from './WorkerBadge';
import { colors, spacing, typography, CategoryType } from '@/theme';
import {
  ScheduleEntry,
  TaskWorkerAssignment,
  startAssignment,
  completeAssignment,
  updateAssignment,
  addWorkerToTask,
  removeWorkerFromTask,
  getWorkers,
  Worker,
  // Legacy functions for backwards compatibility
  startScheduleEntry,
  completeScheduleEntry,
  updateScheduleEntry,
} from '@/api/client';

interface ProductionLogSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: ScheduleEntry | null;
  onUpdated: () => void;
  isSupervisor?: boolean;
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

// Worker assignment row component
function AssignmentRow({
  assignment,
  timePerPieceSeconds,
  onStart,
  onComplete,
  onRemove,
  loading,
  isSupervisor,
}: {
  assignment: TaskWorkerAssignment;
  timePerPieceSeconds?: number;
  onStart: () => void;
  onComplete: (output: number) => void;
  onRemove: () => void;
  loading: boolean;
  isSupervisor?: boolean;
}) {
  const [output, setOutput] = useState(assignment.actual_output || 0);
  const isNotStarted = assignment.status === 'not_started';
  const isInProgress = assignment.status === 'in_progress';
  const isCompleted = assignment.status === 'completed';

  useEffect(() => {
    setOutput(assignment.actual_output || 0);
  }, [assignment.actual_output]);

  return (
    <View style={styles.assignmentRow}>
      <View style={styles.assignmentHeader}>
        <View style={styles.workerInfo}>
          <WorkerBadge name={assignment.worker_name} size="small" />
          <Text style={styles.workerName}>{assignment.worker_name}</Text>
        </View>
        <View style={styles.assignmentActions}>
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
          <Text style={styles.statusTextSmall}>
            {isCompleted ? 'Done' : isInProgress ? 'Working' : 'Waiting'}
          </Text>
          {isSupervisor && isNotStarted && (
            <Pressable onPress={onRemove} style={styles.removeButton}>
              <Trash2 size={16} color={colors.status.error} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Time tracking */}
      <View style={styles.assignmentTimes}>
        <View style={styles.timeCell}>
          <Text style={styles.timeLabelSmall}>Started</Text>
          <Text style={styles.timeValueSmall}>{formatTime(assignment.actual_start_time)}</Text>
        </View>
        <View style={styles.timeCell}>
          <Text style={styles.timeLabelSmall}>Ended</Text>
          <Text style={styles.timeValueSmall}>{formatTime(assignment.actual_end_time)}</Text>
        </View>
        <View style={styles.timeCell}>
          <Text style={styles.timeLabelSmall}>Output</Text>
          <Text style={styles.timeValueSmall}>{assignment.actual_output} pcs</Text>
        </View>
      </View>

      {/* Actions */}
      {isNotStarted && (
        <Button
          title="Start Work"
          icon={<Play size={14} color={colors.white} />}
          onPress={onStart}
          loading={loading}
          size="small"
          fullWidth
        />
      )}
      {isInProgress && (
        <View style={styles.inProgressActions}>
          <NumberInput
            value={output}
            onChange={setOutput}
            min={0}
            unit="pcs"
            size="small"
          />
          <Button
            title="Complete"
            icon={<CheckCircle size={14} color={colors.white} />}
            onPress={() => onComplete(output)}
            loading={loading}
            size="small"
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

// Worker picker modal
function WorkerPickerModal({
  visible,
  onClose,
  onSelect,
  assignedWorkerIds,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (workerId: number) => void;
  assignedWorkerIds: number[];
}) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadWorkers();
    }
  }, [visible]);

  const loadWorkers = async () => {
    setLoading(true);
    try {
      const data = await getWorkers();
      // Filter to active workers not already assigned
      const available = data.filter(
        w => w.status === 'active' && !assignedWorkerIds.includes(w.id)
      );
      setWorkers(available);
    } catch (error) {
      console.error('Failed to load workers:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Worker to Task</Text>
            <Pressable onPress={onClose} style={styles.modalClose}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          {loading ? (
            <Text style={styles.modalLoading}>Loading workers...</Text>
          ) : workers.length === 0 ? (
            <Text style={styles.modalEmpty}>No available workers</Text>
          ) : (
            <FlatList
              data={workers}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.workerOption}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <WorkerBadge name={item.name} size="small" />
                  <View style={styles.workerOptionInfo}>
                    <Text style={styles.workerOptionName}>{item.name}</Text>
                    <Text style={styles.workerOptionSkill}>{item.skill_category}</Text>
                  </View>
                </Pressable>
              )}
              style={styles.workerList}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export function ProductionLogSheet({
  visible,
  onClose,
  entry,
  onUpdated,
  isSupervisor = false,
}: ProductionLogSheetProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [showWorkerPicker, setShowWorkerPicker] = useState(false);

  // Legacy state for entries without assignments
  const [legacyOutput, setLegacyOutput] = useState(0);
  const [legacyLoading, setLegacyLoading] = useState(false);

  useEffect(() => {
    if (entry) {
      setLegacyOutput(entry.actual_output || 0);
    }
  }, [entry]);

  if (!entry) return null;

  const assignments = entry.assignments || [];
  const hasAssignments = assignments.length > 0;

  // Use computed status if available, otherwise fallback to legacy
  const taskStatus = entry.computed_status || entry.status;
  const totalActualOutput = entry.total_actual_output ?? entry.actual_output;

  const isNotStarted = taskStatus === 'not_started';
  const isInProgress = taskStatus === 'in_progress';
  const isCompleted = taskStatus === 'completed';

  // Progress percentage
  const progressPercent = entry.planned_output > 0
    ? Math.min(100, Math.round((totalActualOutput / entry.planned_output) * 100))
    : 0;

  // === Assignment-based handlers ===
  const handleStartAssignment = async (assignmentId: number) => {
    setLoading(assignmentId);
    try {
      await startAssignment(assignmentId);
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to start work');
    } finally {
      setLoading(null);
    }
  };

  const handleCompleteAssignment = async (assignmentId: number, output: number) => {
    if (output <= 0) {
      Alert.alert('Error', 'Please enter the actual output');
      return;
    }

    setLoading(assignmentId);
    try {
      await completeAssignment(assignmentId, { actual_output: output });
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to complete work');
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveWorker = async (workerId: number) => {
    Alert.alert(
      'Remove Worker',
      'Are you sure you want to remove this worker from the task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeWorkerFromTask(entry.id, workerId);
              onUpdated();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove worker');
            }
          },
        },
      ]
    );
  };

  const handleAddWorker = async (workerId: number) => {
    try {
      await addWorkerToTask(entry.id, workerId);
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to add worker to task');
    }
  };

  // === Legacy handlers (for entries without assignments) ===
  const handleLegacyStart = async () => {
    setLegacyLoading(true);
    try {
      await startScheduleEntry(entry.id);
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to start task');
    } finally {
      setLegacyLoading(false);
    }
  };

  const handleLegacyComplete = async () => {
    if (legacyOutput <= 0) {
      Alert.alert('Error', 'Please enter the actual output');
      return;
    }

    setLegacyLoading(true);
    try {
      await completeScheduleEntry(entry.id, { actual_output: legacyOutput });
      onUpdated();
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to complete task');
    } finally {
      setLegacyLoading(false);
    }
  };

  const handleLegacyUpdate = async () => {
    setLegacyLoading(true);
    try {
      await updateScheduleEntry(entry.id, { actual_output: legacyOutput });
      onUpdated();
    } catch (error) {
      Alert.alert('Error', 'Failed to update output');
    } finally {
      setLegacyLoading(false);
    }
  };

  // Footer for legacy mode
  const legacyFooter = !hasAssignments && !isCompleted && (
    <View style={styles.footer}>
      {isNotStarted && (
        <Button
          title="Start Work"
          icon={<Play size={18} color={colors.white} />}
          onPress={handleLegacyStart}
          loading={legacyLoading}
          fullWidth
        />
      )}
      {isInProgress && (
        <View style={styles.footerButtons}>
          <Button
            title="Update"
            variant="secondary"
            onPress={handleLegacyUpdate}
            loading={legacyLoading}
            style={styles.footerButton}
          />
          <Button
            title="Complete"
            icon={<CheckCircle size={18} color={colors.white} />}
            onPress={handleLegacyComplete}
            loading={legacyLoading}
            style={styles.footerButton}
          />
        </View>
      )}
    </View>
  );

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Production Log"
        height={hasAssignments ? 0.85 : 0.65}
        footer={legacyFooter || undefined}
      >
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressValue}>
                {totalActualOutput} / {entry.planned_output} pcs ({progressPercent}%)
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: progressPercent >= 100 ? colors.status.success : colors.primary,
                  },
                ]}
              />
            </View>
          </View>

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
                <Text style={styles.timeLabel}>Target</Text>
                <Text style={styles.timeValue}>{entry.planned_output} pcs</Text>
              </View>
            </View>
          </View>

          {/* Worker Assignments Section */}
          {hasAssignments ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Assigned Workers ({assignments.length})
                </Text>
                {isSupervisor && (
                  <Pressable
                    style={styles.addWorkerButton}
                    onPress={() => setShowWorkerPicker(true)}
                  >
                    <UserPlus size={16} color={colors.primary} />
                    <Text style={styles.addWorkerText}>Add</Text>
                  </Pressable>
                )}
              </View>

              {assignments.map(assignment => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  timePerPieceSeconds={entry.time_per_piece_seconds}
                  onStart={() => handleStartAssignment(assignment.id)}
                  onComplete={(output) => handleCompleteAssignment(assignment.id, output)}
                  onRemove={() => handleRemoveWorker(assignment.worker_id)}
                  loading={loading === assignment.id}
                  isSupervisor={isSupervisor}
                />
              ))}
            </View>
          ) : (
            /* Legacy: single worker mode */
            <>
              {entry.worker_name && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Assigned Worker</Text>
                  <View style={styles.workerInfo}>
                    <WorkerBadge name={entry.worker_name} size="small" />
                    <Text style={styles.workerName}>{entry.worker_name}</Text>
                  </View>
                </View>
              )}

              {/* Actual times (legacy) */}
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

              {/* Output entry (legacy) */}
              {(isInProgress || isCompleted) && (
                <View style={styles.section}>
                  <NumberInput
                    label="Actual Output"
                    value={legacyOutput}
                    onChange={setLegacyOutput}
                    min={0}
                    max={entry.planned_output * 2}
                    unit="pcs"
                    disabled={isCompleted}
                    helperText={`Planned: ${entry.planned_output} pcs`}
                  />
                </View>
              )}
            </>
          )}

          {/* Add spacing at bottom */}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </BottomSheet>

      {/* Worker picker modal */}
      <WorkerPickerModal
        visible={showWorkerPicker}
        onClose={() => setShowWorkerPicker(false)}
        onSelect={handleAddWorker}
        assignedWorkerIds={assignments.map(a => a.worker_id)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
  statusTextSmall: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  stepName: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.md,
  },
  progressSection: {
    marginBottom: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  progressValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.gray[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
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
  workerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  workerName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  // Assignment row styles
  assignmentRow: {
    backgroundColor: colors.gray[50],
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignmentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeButton: {
    padding: spacing.xs,
  },
  assignmentTimes: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeCell: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabelSmall: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
  },
  timeValueSmall: {
    ...typography.body,
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  inProgressActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Add worker button
  addWorkerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  addWorkerText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  // Footer
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  modalClose: {
    padding: spacing.xs,
  },
  modalLoading: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
  },
  modalEmpty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
  },
  workerList: {
    padding: spacing.md,
  },
  workerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  workerOptionInfo: {
    flex: 1,
  },
  workerOptionName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  workerOptionSkill: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

import { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { AlertTriangle, CheckCircle, UserPlus, Clock } from 'lucide-react-native';

import { View, Text } from '@/components/Themed';
import {
  Button,
  Card,
  SpreadsheetTable,
  QuickAddWorkerModal,
  useToast,
} from '@/components';
import { colors, spacing, typography } from '@/theme';
import {
  generateReplan,
  commitReplan,
  type ReplanResult,
  type DraftScheduleEntry,
} from '@/api/client';

export default function ReplanScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replanData, setReplanData] = useState<ReplanResult | null>(null);
  const [draftEntries, setDraftEntries] = useState<DraftScheduleEntry[]>([]);
  const [acceptedOvertime, setAcceptedOvertime] = useState<Set<string>>(new Set());
  const [newWorkers, setNewWorkers] = useState<{ name: string; skill_category: 'SEWING' | 'OTHER' }[]>([]);
  const [showWorkerModal, setShowWorkerModal] = useState(false);

  useEffect(() => {
    loadReplanData();
  }, [scheduleId]);

  const loadReplanData = async () => {
    if (!scheduleId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await generateReplan(parseInt(scheduleId, 10));
      setReplanData(data);
      setDraftEntries(data.draftEntries);
      // Auto-accept overtime if deadline can't be met
      if (!data.canMeetDeadline) {
        setAcceptedOvertime(new Set(data.overtimeSuggestions.map((e) => e.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate replan');
    } finally {
      setLoading(false);
    }
  };

  const handleRowChange = (index: number, entry: DraftScheduleEntry) => {
    const updated = [...draftEntries];
    updated[index] = entry;
    setDraftEntries(updated);
  };

  const handleRowDelete = (index: number) => {
    setDraftEntries(draftEntries.filter((_, i) => i !== index));
  };

  const handleOvertimeToggle = (entryId: string, accepted: boolean) => {
    const updated = new Set(acceptedOvertime);
    if (accepted) {
      updated.add(entryId);
    } else {
      updated.delete(entryId);
    }
    setAcceptedOvertime(updated);
  };

  const handleAddWorker = (worker: { name: string; skill_category: 'SEWING' | 'OTHER' }) => {
    setNewWorkers([...newWorkers, worker]);
    toast.success(`Added ${worker.name} to temporary workers`);
  };

  const handleSave = async () => {
    if (!scheduleId || !replanData) return;

    try {
      setSaving(true);

      // Combine draft entries with accepted overtime
      const overtimeEntries = replanData.overtimeSuggestions.filter((e) =>
        acceptedOvertime.has(e.id)
      );
      const allEntries = [...draftEntries, ...overtimeEntries];

      await commitReplan(parseInt(scheduleId, 10), {
        entries: allEntries,
        newWorkers: newWorkers.length > 0 ? newWorkers : undefined,
      });

      toast.success('Schedule updated successfully');
      router.back();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save changes'
      );
    } finally {
      setSaving(false);
    }
  };

  // Calculate if deadline can be met with current selections
  const canMeetDeadlineWithOvertime = () => {
    if (!replanData) return false;
    if (replanData.canMeetDeadline) return true;

    // Check if enough overtime is accepted
    const acceptedOvertimeHours = replanData.overtimeSuggestions
      .filter((e) => acceptedOvertime.has(e.id))
      .reduce((sum, e) => {
        const start = parseInt(e.start_time.split(':')[0]!, 10) * 60 +
          parseInt(e.start_time.split(':')[1]!, 10);
        const end = parseInt(e.end_time.split(':')[0]!, 10) * 60 +
          parseInt(e.end_time.split(':')[1]!, 10);
        return sum + (end - start) / 60;
      }, 0);

    return acceptedOvertimeHours >= replanData.overtimeHoursNeeded;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Generating replan...</Text>
      </View>
    );
  }

  if (error || !replanData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'No data available'}</Text>
        <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  const allWorkers = [
    ...replanData.availableWorkers,
    ...newWorkers.map((w, i) => ({
      id: -(i + 1), // Negative IDs for temp workers
      name: w.name,
      skill_category: w.skill_category,
    })),
  ];

  const deadlineMet = canMeetDeadlineWithOvertime();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Re-plan Schedule',
          headerBackTitle: 'Cancel',
        }}
      />

      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Header Info */}
          <Card style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.headerInfo}>
                <Text style={styles.productName}>{replanData.productName}</Text>
                <Text style={styles.dueDate}>Due: {replanData.dueDate}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  deadlineMet ? styles.statusSuccess : styles.statusWarning,
                ]}
              >
                {deadlineMet ? (
                  <CheckCircle size={16} color={colors.status.success} />
                ) : (
                  <AlertTriangle size={16} color={colors.status.warning} />
                )}
                <Text
                  style={[
                    styles.statusText,
                    deadlineMet ? styles.statusTextSuccess : styles.statusTextWarning,
                  ]}
                >
                  {deadlineMet ? 'On Track' : 'At Risk'}
                </Text>
              </View>
            </View>
          </Card>

          {/* Stats */}
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Completed</Text>
              <Text style={styles.statValue}>{replanData.completedOutput}</Text>
              <Text style={styles.statUnit}>units</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue}>{replanData.remainingOutput}</Text>
              <Text style={styles.statUnit}>units</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statLabel}>Hours Needed</Text>
              <Text style={styles.statValue}>{replanData.regularHoursNeeded.toFixed(1)}</Text>
              <Text style={styles.statUnit}>regular</Text>
            </Card>
          </View>

          {/* Draft Entries Table */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule Entries</Text>
            <SpreadsheetTable
              data={draftEntries}
              workers={allWorkers}
              onRowChange={handleRowChange}
              onRowDelete={handleRowDelete}
            />
          </View>

          {/* Overtime Suggestions */}
          {replanData.overtimeSuggestions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Clock size={18} color={colors.status.warning} />
                <Text style={styles.sectionTitle}>Overtime Suggestions</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                {replanData.overtimeHoursNeeded.toFixed(1)} hours of overtime needed to meet deadline
              </Text>

              {replanData.overtimeSuggestions.map((entry) => (
                <Card
                  key={entry.id}
                  style={[
                    styles.overtimeCard,
                    acceptedOvertime.has(entry.id) && styles.overtimeCardAccepted,
                  ]}
                >
                  <View style={styles.overtimeRow}>
                    <View style={styles.overtimeInfo}>
                      <Text style={styles.overtimeDate}>{entry.date}</Text>
                      <Text style={styles.overtimeTime}>
                        {entry.start_time} - {entry.end_time}
                      </Text>
                      <Text style={styles.overtimeStep}>{entry.step_name}</Text>
                    </View>
                    <Switch
                      value={acceptedOvertime.has(entry.id)}
                      onValueChange={(value) => handleOvertimeToggle(entry.id, value)}
                      trackColor={{
                        false: colors.gray[300],
                        true: colors.status.warning,
                      }}
                      thumbColor={colors.white}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}

          {/* Temporary Workers */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <UserPlus size={18} color={colors.navy} />
              <Text style={styles.sectionTitle}>Temporary Workers</Text>
            </View>

            {newWorkers.length > 0 && (
              <View style={styles.workerList}>
                {newWorkers.map((worker, index) => (
                  <Card key={index} style={styles.workerCard}>
                    <Text style={styles.workerName}>{worker.name}</Text>
                    <Text style={styles.workerSkill}>{worker.skill_category}</Text>
                  </Card>
                ))}
              </View>
            )}

            <Pressable
              style={styles.addWorkerButton}
              onPress={() => setShowWorkerModal(true)}
            >
              <UserPlus size={16} color={colors.navy} />
              <Text style={styles.addWorkerText}>Add Temporary Worker</Text>
            </Pressable>
          </View>

          {/* Warning Banner */}
          {!deadlineMet && (
            <Card style={styles.warningBanner}>
              <AlertTriangle size={20} color={colors.status.warning} />
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>Deadline at Risk</Text>
                <Text style={styles.warningText}>
                  Accept more overtime or add workers to meet the deadline.
                  You can still save - the supervisor will need to resolve this.
                </Text>
              </View>
            </Card>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="secondary"
            style={styles.footerButton}
          />
          <Button
            title={saving ? 'Saving...' : 'Save Changes'}
            onPress={handleSave}
            variant="primary"
            style={styles.footerButton}
            disabled={saving}
          />
        </View>
      </View>

      <QuickAddWorkerModal
        visible={showWorkerModal}
        onClose={() => setShowWorkerModal(false)}
        onAdd={handleAddWorker}
      />
    </>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerCard: {
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  productName: {
    ...typography.h3,
    color: colors.text,
  },
  dueDate: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  statusSuccess: {
    backgroundColor: colors.status.successLight,
  },
  statusWarning: {
    backgroundColor: colors.status.warningLight,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  statusTextSuccess: {
    color: colors.status.success,
  },
  statusTextWarning: {
    color: colors.status.warning,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statValue: {
    ...typography.h2,
    color: colors.navy,
  },
  statUnit: {
    ...typography.caption,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  overtimeCard: {
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.status.warning,
  },
  overtimeCardAccepted: {
    backgroundColor: colors.status.warningLight,
  },
  overtimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overtimeInfo: {
    flex: 1,
  },
  overtimeDate: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  overtimeTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overtimeStep: {
    ...typography.caption,
    color: colors.textMuted,
  },
  workerList: {
    gap: spacing.xs,
  },
  workerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  workerName: {
    ...typography.body,
    color: colors.text,
  },
  workerSkill: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addWorkerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.gray[100],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addWorkerText: {
    ...typography.body,
    color: colors.navy,
    fontWeight: '500',
  },
  warningBanner: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.status.warningLight,
    borderColor: colors.status.warning,
    borderWidth: 1,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.status.warning,
  },
  warningText: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerButton: {
    flex: 1,
  },
});

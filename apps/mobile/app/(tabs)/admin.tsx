import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  View as RNView,
  TextInput as RNTextInput,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect, Link } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

// Conditionally import native modules (not available on web)
let FileSystem: typeof import('expo-file-system') | null = null;
let Sharing: typeof import('expo-sharing') | null = null;

if (Platform.OS !== 'web') {
  try {
    FileSystem = require('expo-file-system');
    Sharing = require('expo-sharing');
  } catch (e) {
    console.warn('expo-file-system or expo-sharing not available');
  }
}

import { View, Text } from '@/components/Themed';
import { Button, CategoryBadge } from '@/components';
import { colors, spacing, typography, CategoryType } from '@/theme';
import { getAllScheduleEntries, updateScheduleEntry, ScheduleEntry } from '@/api/client';

interface AdminScheduleEntry extends ScheduleEntry {
  product_name?: string;
  order_quantity?: number;
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If the value contains comma, newline, or quote, wrap it in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertToCSV(entries: AdminScheduleEntry[]): string {
  // CSV Headers
  const headers = [
    'ID',
    'Schedule ID',
    'Product Name',
    'Step Name',
    'Category',
    'Date',
    'Start Time',
    'End Time',
    'Planned Output',
    'Actual Start Time',
    'Actual End Time',
    'Actual Output',
    'Status',
    'Worker ID',
    'Notes',
  ];

  // Create CSV rows
  const rows = entries.map((entry) => [
    entry.id,
    entry.schedule_id,
    entry.product_name || '',
    entry.step_name || '',
    entry.category || '',
    entry.date,
    entry.start_time,
    entry.end_time,
    entry.planned_output,
    entry.actual_start_time || '',
    entry.actual_end_time || '',
    entry.actual_output || 0,
    entry.status || 'not_started',
    entry.worker_id || '',
    entry.notes || '',
  ]);

  // Combine headers and rows
  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvRows.join('\n');
}

async function downloadCSV(csvContent: string, filename: string) {
  if (Platform.OS === 'web') {
    // Web: Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    // Native: Save to file system and share
    if (!FileSystem || !Sharing) {
      Alert.alert('Error', 'File system access not available');
      return;
    }

    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Schedule Entries',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      Alert.alert('Error', 'Failed to export CSV file');
    }
  }
}

export default function AdminScreen() {
  const [entries, setEntries] = useState<AdminScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<AdminScheduleEntry>>({});

  const fetchEntries = async () => {
    try {
      setError(null);
      const data = await getAllScheduleEntries();
      setEntries(data as AdminScheduleEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchEntries();
  };

  const startEditing = (entry: AdminScheduleEntry) => {
    setEditingId(entry.id);
    setEditValues({
      start_time: entry.start_time,
      end_time: entry.end_time,
      date: entry.date,
      planned_output: entry.planned_output,
      actual_start_time: entry.actual_start_time || '',
      actual_end_time: entry.actual_end_time || '',
      actual_output: entry.actual_output,
      status: entry.status,
      notes: entry.notes || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (entryId: number) => {
    try {
      await updateScheduleEntry(entryId, {
        start_time: editValues.start_time,
        end_time: editValues.end_time,
        date: editValues.date,
        planned_output: editValues.planned_output,
        actual_start_time: editValues.actual_start_time || undefined,
        actual_end_time: editValues.actual_end_time || undefined,
        actual_output: editValues.actual_output,
        status: editValues.status,
        notes: editValues.notes || undefined,
      });
      setEditingId(null);
      setEditValues({});
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update entry');
    }
  };

  const handleExportCSV = async () => {
    try {
      const csvContent = convertToCSV(entries);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `schedule-entries-${timestamp}.csv`;
      await downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('Error exporting CSV:', err);
      Alert.alert('Error', 'Failed to export CSV file');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={styles.loadingText}>Loading entries...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={fetchEntries} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Admin - Schedule Entries</Text>
          <RNView style={styles.headerActions}>
            <Link href="/tv" asChild>
              <Pressable style={styles.tvButton}>
                <FontAwesome name="television" size={18} color={colors.white} />
              </Pressable>
            </Link>
            <Pressable onPress={handleExportCSV} style={styles.exportButton}>
              <FontAwesome name="download" size={18} color={colors.navy} />
            </Pressable>
            <Pressable onPress={onRefresh} style={styles.refreshButton}>
              <FontAwesome
                name="refresh"
                size={18}
                color={refreshing ? colors.amber : colors.navy}
              />
            </Pressable>
          </RNView>
        </View>
        <Text style={styles.headerSubtitle}>
          {entries.length} entries • Tap a row to edit • Swipe horizontally to scroll
        </Text>
      </View>

      <ScrollView
        horizontal
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsHorizontalScrollIndicator={true}
        bounces={true}
      >
        <RNView style={styles.table}>
          {/* Table Header */}
          <RNView style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.headerCell, styles.cellId]}>ID</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellProduct]}>Product</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellStep]}>Step</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellCategory]}>Category</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellDate]}>Date</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellTime]}>Start</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellTime]}>End</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellOutput]}>Planned</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellOutput]}>Actual</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellStatus]}>Status</Text>
            <Text style={[styles.cell, styles.headerCell, styles.cellActions]}>Actions</Text>
          </RNView>

          {/* Table Rows */}
          {entries.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <Pressable
                key={entry.id}
                style={[styles.row, isEditing && styles.rowEditing]}
                onPress={() => !isEditing && startEditing(entry)}
              >
                <Text style={[styles.cell, styles.cellId]}>{entry.id}</Text>
                <Text style={[styles.cell, styles.cellProduct]} numberOfLines={1}>
                  {entry.product_name || 'N/A'}
                </Text>
                <Text style={[styles.cell, styles.cellStep]} numberOfLines={1}>
                  {entry.step_name || 'N/A'}
                </Text>
                <RNView style={[styles.cell, styles.cellCategory]}>
                  {entry.category && (
                    <CategoryBadge
                      category={mapCategoryToType(entry.category)}
                      variant="subtle"
                      size="small"
                    />
                  )}
                </RNView>
                {isEditing ? (
                  <RNTextInput
                    style={[styles.cell, styles.cellDate, styles.input]}
                    value={editValues.date}
                    onChangeText={(text) => setEditValues({ ...editValues, date: text })}
                    placeholder="YYYY-MM-DD"
                  />
                ) : (
                  <Text style={[styles.cell, styles.cellDate]}>
                    {formatDate(entry.date)}
                  </Text>
                )}
                {isEditing ? (
                  <RNTextInput
                    style={[styles.cell, styles.cellTime, styles.input]}
                    value={editValues.start_time}
                    onChangeText={(text) => setEditValues({ ...editValues, start_time: text })}
                    placeholder="HH:MM"
                  />
                ) : (
                  <Text style={[styles.cell, styles.cellTime]}>{entry.start_time}</Text>
                )}
                {isEditing ? (
                  <RNTextInput
                    style={[styles.cell, styles.cellTime, styles.input]}
                    value={editValues.end_time}
                    onChangeText={(text) => setEditValues({ ...editValues, end_time: text })}
                    placeholder="HH:MM"
                  />
                ) : (
                  <Text style={[styles.cell, styles.cellTime]}>{entry.end_time}</Text>
                )}
                {isEditing ? (
                  <RNTextInput
                    style={[styles.cell, styles.cellOutput, styles.input]}
                    value={editValues.planned_output?.toString()}
                    onChangeText={(text) =>
                      setEditValues({ ...editValues, planned_output: parseInt(text) || 0 })
                    }
                    keyboardType="numeric"
                    placeholder="0"
                  />
                ) : (
                  <Text style={[styles.cell, styles.cellOutput]}>{entry.planned_output}</Text>
                )}
                {isEditing ? (
                  <RNTextInput
                    style={[styles.cell, styles.cellOutput, styles.input]}
                    value={editValues.actual_output?.toString()}
                    onChangeText={(text) =>
                      setEditValues({ ...editValues, actual_output: parseInt(text) || 0 })
                    }
                    keyboardType="numeric"
                    placeholder="0"
                  />
                ) : (
                  <Text style={[styles.cell, styles.cellOutput]}>
                    {entry.actual_output || '-'}
                  </Text>
                )}
                <Text style={[styles.cell, styles.cellStatus]}>
                  {entry.status || 'not_started'}
                </Text>
                {isEditing ? (
                  <RNView style={[styles.cell, styles.cellActions, styles.actionsContainer]}>
                    <Pressable
                      style={[styles.actionButton, styles.saveButton]}
                      onPress={() => saveEdit(entry.id)}
                    >
                      <FontAwesome name="check" size={14} color={colors.white} />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.cancelButton]}
                      onPress={cancelEditing}
                    >
                      <FontAwesome name="times" size={14} color={colors.text} />
                    </Pressable>
                  </RNView>
                ) : (
                  <RNView style={[styles.cell, styles.cellActions]}>
                    <FontAwesome name="pencil" size={12} color={colors.textSecondary} />
                  </RNView>
                )}
              </Pressable>
            );
          })}
        </RNView>
      </ScrollView>
    </View>
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
  header: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.sm,
  },
  table: {
    backgroundColor: colors.white,
    borderRadius: 8,
    overflow: 'hidden',
    minWidth: 1200,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  tvButton: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  exportButton: {
    padding: spacing.xs,
  },
  refreshButton: {
    padding: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  rowEditing: {
    backgroundColor: colors.status.infoLight,
  },
  headerRow: {
    backgroundColor: colors.navy,
    borderBottomWidth: 2,
    borderBottomColor: colors.navy,
  },
  cell: {
    padding: spacing.sm,
    ...typography.bodySmall,
    color: colors.text,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  headerCell: {
    ...typography.label,
    color: colors.white,
    fontWeight: '600',
    fontSize: 11,
  },
  cellId: {
    width: 50,
    textAlign: 'center',
  },
  cellProduct: {
    width: 120,
  },
  cellStep: {
    width: 150,
  },
  cellCategory: {
    width: 100,
    justifyContent: 'center',
  },
  cellDate: {
    width: 100,
  },
  cellTime: {
    width: 70,
    fontFamily: 'monospace',
  },
  cellOutput: {
    width: 70,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  cellStatus: {
    width: 100,
    textAlign: 'center',
  },
  cellActions: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.navy,
    borderRadius: 4,
    padding: spacing.xs,
    ...typography.bodySmall,
    fontFamily: 'monospace',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderRightWidth: 0,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: colors.status.success,
  },
  cancelButton: {
    backgroundColor: colors.gray[200],
  },
});

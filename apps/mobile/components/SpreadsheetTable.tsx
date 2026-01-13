import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput as RNTextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Trash2, ChevronDown, X } from 'lucide-react-native';
import { colors, spacing, typography, layout } from '@/theme';
import type { DraftScheduleEntry } from '@/api/client';

interface WorkerOption {
  id: number;
  name: string;
  skill_category: string;
}

interface SpreadsheetTableProps {
  data: DraftScheduleEntry[];
  workers: WorkerOption[];
  onRowChange: (index: number, entry: DraftScheduleEntry) => void;
  onRowDelete?: (index: number) => void;
}

// Column widths
const COLUMN_WIDTHS = {
  date: 100,
  startTime: 70,
  endTime: 70,
  step: 140,
  worker: 130,
  output: 70,
  actions: 50,
};

const TOTAL_WIDTH = Object.values(COLUMN_WIDTHS).reduce((a, b) => a + b, 0);

export function SpreadsheetTable({
  data,
  workers,
  onRowChange,
  onRowDelete,
}: SpreadsheetTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    field: keyof DraftScheduleEntry;
  } | null>(null);
  const [workerModalIndex, setWorkerModalIndex] = useState<number | null>(null);

  const handleCellPress = (rowIndex: number, field: keyof DraftScheduleEntry) => {
    if (field === 'worker_id') {
      setWorkerModalIndex(rowIndex);
    } else if (['start_time', 'end_time', 'planned_output', 'date'].includes(field)) {
      setEditingCell({ rowIndex, field });
    }
  };

  const handleCellChange = (value: string) => {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const entry = data[rowIndex];
    if (!entry) return;

    const updatedEntry = { ...entry };
    if (field === 'planned_output') {
      updatedEntry.planned_output = parseInt(value, 10) || 0;
    } else {
      (updatedEntry as any)[field] = value;
    }
    onRowChange(rowIndex, updatedEntry);
  };

  const handleWorkerSelect = (workerId: number | null, workerName: string | null) => {
    if (workerModalIndex === null) return;
    const entry = data[workerModalIndex];
    if (!entry) return;

    const updatedEntry = {
      ...entry,
      worker_id: workerId,
      worker_name: workerName,
    };
    onRowChange(workerModalIndex, updatedEntry);
    setWorkerModalIndex(null);
  };

  const renderCell = (
    entry: DraftScheduleEntry,
    field: keyof DraftScheduleEntry,
    rowIndex: number,
    width: number
  ) => {
    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === field;
    let displayValue = '';
    let isEditable = true;

    switch (field) {
      case 'date':
        displayValue = entry.date;
        break;
      case 'start_time':
        displayValue = entry.start_time;
        break;
      case 'end_time':
        displayValue = entry.end_time;
        break;
      case 'step_name':
        displayValue = entry.step_name;
        isEditable = false;
        break;
      case 'worker_id':
        displayValue = entry.worker_name || 'Unassigned';
        break;
      case 'planned_output':
        displayValue = entry.planned_output.toString();
        break;
      default:
        displayValue = String(entry[field] ?? '');
    }

    if (isEditing && isEditable) {
      return (
        <View style={[styles.cell, { width }]}>
          <RNTextInput
            style={styles.cellInput}
            value={displayValue}
            onChangeText={handleCellChange}
            onBlur={() => setEditingCell(null)}
            autoFocus
            keyboardType={field === 'planned_output' ? 'numeric' : 'default'}
            selectTextOnFocus
          />
        </View>
      );
    }

    return (
      <Pressable
        style={[
          styles.cell,
          { width },
          !isEditable && styles.cellReadonly,
          field === 'worker_id' && styles.cellDropdown,
        ]}
        onPress={() => isEditable && handleCellPress(rowIndex, field)}
      >
        <Text
          style={[
            styles.cellText,
            !entry.worker_id && field === 'worker_id' && styles.cellTextMuted,
          ]}
          numberOfLines={1}
        >
          {displayValue}
        </Text>
        {field === 'worker_id' && (
          <ChevronDown size={12} color={colors.textSecondary} />
        )}
      </Pressable>
    );
  };

  const renderRow = (entry: DraftScheduleEntry, index: number) => {
    const isOvertime = entry.is_overtime;

    return (
      <View
        key={entry.id}
        style={[styles.row, isOvertime && styles.rowOvertime]}
      >
        {renderCell(entry, 'date', index, COLUMN_WIDTHS.date)}
        {renderCell(entry, 'start_time', index, COLUMN_WIDTHS.startTime)}
        {renderCell(entry, 'end_time', index, COLUMN_WIDTHS.endTime)}
        {renderCell(entry, 'step_name', index, COLUMN_WIDTHS.step)}
        {renderCell(entry, 'worker_id', index, COLUMN_WIDTHS.worker)}
        {renderCell(entry, 'planned_output', index, COLUMN_WIDTHS.output)}
        {onRowDelete && (
          <Pressable
            style={[styles.cell, styles.cellAction, { width: COLUMN_WIDTHS.actions }]}
            onPress={() => onRowDelete(index)}
          >
            <Trash2 size={16} color={colors.status.error} />
          </Pressable>
        )}
      </View>
    );
  };

  // Filter workers by skill category for current row
  const getFilteredWorkers = (rowIndex: number) => {
    const entry = data[rowIndex];
    if (!entry) return workers;
    return workers.filter(
      (w) => w.skill_category === entry.required_skill_category || w.skill_category === 'OTHER'
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: TOTAL_WIDTH }}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.date }]}>
              <Text style={styles.headerText}>Date</Text>
            </View>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.startTime }]}>
              <Text style={styles.headerText}>Start</Text>
            </View>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.endTime }]}>
              <Text style={styles.headerText}>End</Text>
            </View>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.step }]}>
              <Text style={styles.headerText}>Step</Text>
            </View>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.worker }]}>
              <Text style={styles.headerText}>Worker</Text>
            </View>
            <View style={[styles.headerCell, { width: COLUMN_WIDTHS.output }]}>
              <Text style={styles.headerText}>Output</Text>
            </View>
            {onRowDelete && (
              <View style={[styles.headerCell, { width: COLUMN_WIDTHS.actions }]}>
                <Text style={styles.headerText}></Text>
              </View>
            )}
          </View>

          {/* Data rows */}
          <ScrollView style={styles.dataContainer}>
            {data.map((entry, index) => renderRow(entry, index))}
            {data.length === 0 && (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No entries</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Worker selection modal */}
      <Modal
        visible={workerModalIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setWorkerModalIndex(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setWorkerModalIndex(null)}>
          <View style={styles.dropdown}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Select Worker</Text>
              <Pressable onPress={() => setWorkerModalIndex(null)} style={styles.closeButton}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <FlatList
              data={[
                { id: 0, name: 'Unassigned', skill_category: '' },
                ...(workerModalIndex !== null ? getFilteredWorkers(workerModalIndex) : []),
              ]}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() =>
                    handleWorkerSelect(
                      item.id === 0 ? null : item.id,
                      item.id === 0 ? null : item.name
                    )
                  }
                >
                  <Text style={styles.optionText}>{item.name}</Text>
                  {item.skill_category && (
                    <Text style={styles.optionSubtext}>{item.skill_category}</Text>
                  )}
                </Pressable>
              )}
              style={styles.optionsList}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: layout.cardBorderRadius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.gray[100],
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  headerCell: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  headerText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'uppercase',
  },
  dataContainer: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowOvertime: {
    backgroundColor: colors.status.warningLight,
  },
  cell: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
    minHeight: 44,
  },
  cellReadonly: {
    backgroundColor: colors.gray[50],
  },
  cellDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cellAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    ...typography.body,
    fontSize: 13,
    color: colors.text,
  },
  cellTextMuted: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  cellInput: {
    ...typography.body,
    fontSize: 13,
    color: colors.text,
    padding: 0,
    margin: 0,
    backgroundColor: colors.status.infoLight,
    borderRadius: 2,
    paddingHorizontal: 4,
  },
  emptyRow: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dropdown: {
    backgroundColor: colors.white,
    borderRadius: layout.cardBorderRadius,
    maxHeight: '60%',
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownTitle: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    padding: spacing.xs,
  },
  optionsList: {
    flexGrow: 0,
  },
  option: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionText: {
    ...typography.body,
    color: colors.text,
  },
  optionSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

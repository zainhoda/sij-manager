import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";

export interface ColumnMeta {
  /** The database table this column belongs to (for updates) */
  table?: string;
  /** The key in the row that contains the foreign key for this column's table */
  foreignKey?: string;
  /** API endpoint override (defaults to /api/{table}/{foreignKeyValue}) */
  endpoint?: string;
}

export interface Column<T> {
  key: keyof T;
  header: string;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  editable?: boolean;
  /** Metadata for determining how to update this column */
  meta?: ColumnMeta;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  renderEdit?: (
    value: T[keyof T],
    onChange: (value: T[keyof T]) => void,
    onCommit: () => void,
    onCancel: () => void,
    row: T
  ) => React.ReactNode;
}

export interface CellChangeContext<T> {
  rowId: number | string;
  key: keyof T;
  value: T[keyof T];
  row: T;
  column: Column<T>;
}

export interface DataGridProps<T extends { id: number | string }> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  /** Called when a cell value changes. Receives full context including column metadata. */
  onCellChange?: (context: CellChangeContext<T>) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  height?: number | string;
}

type SortDirection = "asc" | "desc" | null;

interface EditingCell {
  rowId: number | string;
  columnKey: string;
}

export function DataGrid<T extends { id: number | string }>({
  data,
  columns,
  onRowClick,
  onCellChange,
  searchable = true,
  searchPlaceholder = "Search...",
  height = "calc(100vh - 200px)",
}: DataGridProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [selectedCell, setSelectedCell] = useState<EditingCell | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  // Filter data by search
  const filteredData = useMemo(() => {
    if (!search) return data;
    const searchLower = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const value = row[col.key];
        if (value == null) return false;
        return String(value).toLowerCase().includes(searchLower);
      })
    );
  }, [data, search, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortDirection]);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortKey(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const getSortClass = (key: keyof T) => {
    if (sortKey !== key) return "sortable";
    return `sortable sort-${sortDirection}`;
  };

  const startEditing = (rowId: number | string, columnKey: keyof T, currentValue: any) => {
    setEditingCell({ rowId, columnKey: String(columnKey) });
    setEditValue(currentValue);
  };

  const commitEdit = useCallback(() => {
    if (editingCell && onCellChange) {
      const row = data.find((r) => r.id === editingCell.rowId);
      const column = columns.find((c) => String(c.key) === editingCell.columnKey);
      if (row && column) {
        onCellChange({
          rowId: editingCell.rowId,
          key: editingCell.columnKey as keyof T,
          value: editValue,
          row,
          column,
        });
      }
    }
    setEditingCell(null);
    setEditValue(null);
  }, [editingCell, editValue, onCellChange, data, columns]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue(null);
  }, []);

  const handleCellClick = (row: T, col: Column<T>, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCell({ rowId: row.id, columnKey: String(col.key) });

    if (col.editable !== false && onCellChange) {
      startEditing(row.id, col.key, row[col.key]);
    }
  };

  const handleCellDoubleClick = (row: T, col: Column<T>, e: React.MouseEvent) => {
    e.stopPropagation();
    if (col.editable !== false && onCellChange) {
      startEditing(row.id, col.key, row[col.key]);
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingCell) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        } else if (e.key === "Tab") {
          e.preventDefault();
          commitEdit();
          // Move to next editable cell
          const currentColIndex = columns.findIndex(
            (c) => String(c.key) === editingCell.columnKey
          );
          const currentRowIndex = sortedData.findIndex(
            (r) => r.id === editingCell.rowId
          );

          if (e.shiftKey) {
            // Move backwards
            for (let i = currentColIndex - 1; i >= 0; i--) {
              if (columns[i]!.editable !== false) {
                startEditing(
                  sortedData[currentRowIndex]!.id,
                  columns[i]!.key,
                  sortedData[currentRowIndex]![columns[i]!.key]
                );
                return;
              }
            }
            // Move to previous row, last editable column
            if (currentRowIndex > 0) {
              for (let i = columns.length - 1; i >= 0; i--) {
                if (columns[i]!.editable !== false) {
                  startEditing(
                    sortedData[currentRowIndex - 1]!.id,
                    columns[i]!.key,
                    sortedData[currentRowIndex - 1]![columns[i]!.key]
                  );
                  return;
                }
              }
            }
          } else {
            // Move forwards
            for (let i = currentColIndex + 1; i < columns.length; i++) {
              if (columns[i]!.editable !== false) {
                startEditing(
                  sortedData[currentRowIndex]!.id,
                  columns[i]!.key,
                  sortedData[currentRowIndex]![columns[i]!.key]
                );
                return;
              }
            }
            // Move to next row, first editable column
            if (currentRowIndex < sortedData.length - 1) {
              for (let i = 0; i < columns.length; i++) {
                if (columns[i]!.editable !== false) {
                  startEditing(
                    sortedData[currentRowIndex + 1]!.id,
                    columns[i]!.key,
                    sortedData[currentRowIndex + 1]![columns[i]!.key]
                  );
                  return;
                }
              }
            }
          }
        }
      }
    },
    [editingCell, columns, sortedData, commitEdit, cancelEdit]
  );

  const isEditing = (rowId: number | string, columnKey: keyof T) => {
    return (
      editingCell?.rowId === rowId && editingCell?.columnKey === String(columnKey)
    );
  };

  const isSelected = (rowId: number | string, columnKey: keyof T) => {
    return (
      selectedCell?.rowId === rowId && selectedCell?.columnKey === String(columnKey)
    );
  };

  const renderCell = (row: T, col: Column<T>) => {
    const value = row[col.key];

    if (isEditing(row.id, col.key)) {
      if (col.renderEdit) {
        return col.renderEdit(
          editValue,
          setEditValue,
          commitEdit,
          cancelEdit,
          row
        );
      }

      return (
        <input
          type="text"
          className="cell-edit-input"
          value={editValue ?? ""}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          autoFocus
        />
      );
    }

    if (col.render) {
      return col.render(value, row);
    }

    return String(value ?? "");
  };

  return (
    <div className="spreadsheet-container" onKeyDown={handleKeyDown}>
      {searchable && (
        <div className="spreadsheet-toolbar">
          <input
            type="text"
            className="spreadsheet-search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="spreadsheet-count">
            {filteredData.length} {filteredData.length === 1 ? "row" : "rows"}
          </span>
        </div>
      )}
      <div className="spreadsheet-wrapper" style={{ height }} ref={tableRef}>
        <table className="spreadsheet">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={col.sortable !== false ? getSortClass(col.key) : ""}
                  style={{
                    width: col.width,
                    minWidth: col.minWidth || 80,
                  }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="spreadsheet-empty"
                >
                  No data found
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? "clickable" : ""}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={`
                        ${isSelected(row.id, col.key) ? "selected" : ""}
                        ${isEditing(row.id, col.key) ? "editing" : ""}
                        ${col.editable !== false && onCellChange ? "editable" : ""}
                      `}
                      onClick={(e) => handleCellClick(row, col, e)}
                      onDoubleClick={(e) => handleCellDoubleClick(row, col, e)}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataGrid;

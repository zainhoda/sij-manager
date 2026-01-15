/**
 * Import parsers for cold start spreadsheet uploads
 */

// Parsed Equipment-Worker Matrix types
export interface ParsedEquipment {
  name: string;           // Work Code
  description: string;    // Work Type
  stationCount: number | null;  // null if 100 (virtual equipment)
  workCategoryName: string;     // Extracted from Work Type (e.g., "Cutting" from "Cutting - Manual")
}

export interface ParsedWorker {
  name: string;
  columnIndex: number;
}

export interface ParsedCertification {
  workerName: string;
  equipmentName: string;
}

export interface ParsedEquipmentMatrix {
  equipment: ParsedEquipment[];
  workers: ParsedWorker[];
  certifications: ParsedCertification[];
  workCategories: Set<string>;
}

// Dependency with type
export interface ParsedDependency {
  stepCode: string;
  type: 'start' | 'finish';
}

// Parsed Product Steps types
export interface ParsedProductStep {
  stepCode: string;           // ID column
  category: string;           // Category column (work category name)
  componentName: string;      // Component column
  taskName: string;           // Task column
  timePerPieceSeconds: number;
  equipmentCode: string;      // Equipment code column
  dependencies: ParsedDependency[];  // Parsed from Dependency column with type
  rowNumber: number;          // For error reporting
}

export interface ParsedProductSteps {
  components: Set<string>;
  steps: ParsedProductStep[];
  workCategories: Set<string>;
}

/**
 * Parse CSV/TSV content into rows and columns
 */
export function parseDelimited(content: string, delimiter: 'tsv' | 'csv' = 'tsv'): string[][] {
  const sep = delimiter === 'tsv' ? '\t' : ',';
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

  return lines.map(line => {
    // Handle quoted values for CSV
    if (delimiter === 'csv') {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === sep && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    }

    // Simple split for TSV
    return line.split(sep).map(cell => cell.trim());
  });
}

/**
 * Extract work category from Work Type description
 * e.g., "Cutting - Manual" -> "CUTTING"
 *       "Sewing - Team Lead" -> "SEWING"
 */
export function extractWorkCategory(workType: string): string {
  if (!workType) return 'OTHER';

  // Extract the first word before any separator
  const match = workType.match(/^([A-Za-z]+)/);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return 'OTHER';
}

/**
 * Parse Equipment-Worker Matrix spreadsheet
 *
 * Expected format:
 * Equipment Count | Work Code | Work Type | Worker1 | Worker2 | ...
 * 100            | CTL       | Cutting - Team Lead | Y | | ...
 * 1              | CMA       | Cutting - Manual    | Y | Y | ...
 */
export function parseEquipmentMatrix(content: string, format: 'tsv' | 'csv' = 'tsv'): ParsedEquipmentMatrix {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Equipment matrix must have at least a header row and one data row');
  }

  const headerRow = rows[0]!;

  // Find column indices
  const equipmentCountIdx = headerRow.findIndex(h =>
    h.toLowerCase().includes('equipment') && h.toLowerCase().includes('count')
  );
  const workCodeIdx = headerRow.findIndex(h =>
    h.toLowerCase().includes('work') && h.toLowerCase().includes('code')
  );
  const workTypeIdx = headerRow.findIndex(h =>
    h.toLowerCase().includes('work') && h.toLowerCase().includes('type')
  );

  if (workCodeIdx === -1) {
    throw new Error('Could not find "Work Code" column in header');
  }

  // Worker columns start after Work Type (or Work Code if no Work Type)
  const workerStartIdx = Math.max(workTypeIdx, workCodeIdx) + 1;

  // Extract worker names from header
  const workers: ParsedWorker[] = [];
  for (let i = workerStartIdx; i < headerRow.length; i++) {
    const name = headerRow[i];
    if (name && name.trim()) {
      workers.push({ name: name.trim(), columnIndex: i });
    }
  }

  const equipment: ParsedEquipment[] = [];
  const certifications: ParsedCertification[] = [];
  const workCategories = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    // Skip empty rows or comment rows
    const workCode = row[workCodeIdx]?.trim();
    if (!workCode) continue;

    // Skip rows that look like comments (no work code, just text in first column)
    if (equipmentCountIdx >= 0 && !row[equipmentCountIdx]?.trim() && !workCode) {
      continue;
    }

    // Parse equipment count
    let stationCount: number | null = null;
    if (equipmentCountIdx >= 0) {
      const countStr = row[equipmentCountIdx]?.trim();
      if (countStr) {
        const count = parseInt(countStr, 10);
        if (!isNaN(count)) {
          // 100 means equipment is not needed (virtual)
          stationCount = count === 100 ? null : count;
        }
      }
    }

    const workType = workTypeIdx >= 0 ? row[workTypeIdx]?.trim() || '' : '';
    const categoryName = extractWorkCategory(workType);
    workCategories.add(categoryName);

    equipment.push({
      name: workCode,
      description: workType,
      stationCount,
      workCategoryName: categoryName,
    });

    // Check certifications for each worker
    for (const worker of workers) {
      const cellValue = row[worker.columnIndex]?.trim().toUpperCase();
      if (cellValue === 'Y' || cellValue === 'YES' || cellValue === 'X' || cellValue === '1') {
        certifications.push({
          workerName: worker.name,
          equipmentName: workCode,
        });
      }
    }
  }

  return {
    equipment,
    workers,
    certifications,
    workCategories,
  };
}

/**
 * Parse Product Steps spreadsheet
 *
 * Expected format:
 * Dependency | ID | Category | Component | Task | Time (sec/piece) | Equipment code
 *           | A1A | SEWING   | Small Velcro Pocket | Hem short edges | 20 | STS
 * A1A       | A1B | SEWING   | Small Velcro Pocket | Sew hook Velcro | 25 | STS
 */
export function parseProductSteps(content: string, format: 'tsv' | 'csv' = 'tsv'): ParsedProductSteps {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Product steps must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase());

  // Find column indices (flexible matching)
  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const dependencyIdx = findColumn(['dependency', 'depends', 'prereq']);
  const idIdx = findColumn(['id', 'code', 'step']);
  const categoryIdx = findColumn(['category', 'type']);
  const componentIdx = findColumn(['component', 'part']);
  const taskIdx = findColumn(['task', 'name', 'description']);
  const timeIdx = findColumn(['time', 'sec', 'duration']);
  const equipmentIdx = findColumn(['equipment', 'machine', 'station']);

  if (idIdx === -1) {
    throw new Error('Could not find "ID" column in header');
  }
  if (categoryIdx === -1) {
    throw new Error('Could not find "Category" column in header');
  }
  if (timeIdx === -1) {
    throw new Error('Could not find "Time" column in header');
  }

  const steps: ParsedProductStep[] = [];
  const components = new Set<string>();
  const workCategories = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    // Get step ID
    const stepCode = row[idIdx]?.trim();
    if (!stepCode) continue; // Skip rows without ID

    // Parse dependencies (comma-separated, with optional :start or :finish suffix)
    // Format: "A1A" (defaults to finish), "A1A:start", "A1A:finish"
    const dependencies: ParsedDependency[] = [];
    if (dependencyIdx >= 0) {
      const depStr = row[dependencyIdx]?.trim();
      if (depStr) {
        const depParts = depStr.split(',').map(d => d.trim()).filter(d => d);
        for (const dep of depParts) {
          const [stepCode, typeStr] = dep.split(':').map(s => s.trim());
          if (stepCode) {
            const type = typeStr?.toLowerCase() === 'start' ? 'start' : 'finish';
            dependencies.push({ stepCode, type });
          }
        }
      }
    }

    // Get category
    const categoryCell = row[categoryIdx];
    const category = categoryCell?.trim().toUpperCase() || 'OTHER';
    workCategories.add(category);

    // Get component
    const componentCell = componentIdx >= 0 ? row[componentIdx] : undefined;
    const componentName = componentCell?.trim() || '';
    if (componentName) {
      components.add(componentName);
    }

    // Get task name
    const taskCell = taskIdx >= 0 ? row[taskIdx] : undefined;
    const taskName = taskCell?.trim() || stepCode;

    // Parse time
    let timePerPieceSeconds = 0;
    const timeCell = timeIdx >= 0 ? row[timeIdx] : undefined;
    if (timeCell) {
      const timeStr = timeCell.trim();
      if (timeStr) {
        const time = parseFloat(timeStr);
        if (!isNaN(time)) {
          timePerPieceSeconds = Math.round(time);
        }
      }
    }

    // Get equipment code
    const equipmentCell = equipmentIdx >= 0 ? row[equipmentIdx] : undefined;
    const equipmentCode = equipmentCell?.trim() || '';

    steps.push({
      stepCode,
      category,
      componentName,
      taskName,
      timePerPieceSeconds,
      equipmentCode,
      dependencies,
      rowNumber: rowIdx + 1, // 1-indexed for user display
    });
  }

  return {
    components,
    steps,
    workCategories,
  };
}

// Parsed Production Data types
export interface ParsedProductionRow {
  orderId: number;
  stepCode: string;
  workerName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:MM or HH:MM:SS
  endTime: string;        // HH:MM or HH:MM:SS
  units: number;
  rowNumber: number;      // For error reporting
}

export interface ParsedProductionData {
  rows: ParsedProductionRow[];
  orderIds: Set<number>;
  stepCodes: Set<string>;
  workerNames: Set<string>;
}

/**
 * Parse time string to HH:MM:SS format
 * Accepts: "7:00", "07:00", "7:00:00", "07:00:00"
 */
function normalizeTime(timeStr: string): string {
  const trimmed = timeStr.trim();
  const parts = trimmed.split(':');

  if (parts.length === 2) {
    // HH:MM format - add seconds
    const [h, m] = parts;
    return `${h!.padStart(2, '0')}:${m!.padStart(2, '0')}:00`;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [h, m, s] = parts;
    return `${h!.padStart(2, '0')}:${m!.padStart(2, '0')}:${s!.padStart(2, '0')}`;
  }

  return trimmed;
}

/**
 * Validate time format
 */
function isValidTime(timeStr: string): boolean {
  const normalized = normalizeTime(timeStr);
  return /^\d{2}:\d{2}:\d{2}$/.test(normalized);
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Parse Production Data spreadsheet
 *
 * Expected format:
 * order_id | step_code | worker_name | date | start_time | end_time | units
 * 5        | CUT-01    | Maria Garcia | 2025-01-10 | 07:00 | 11:00 | 120
 */
export function parseProductionData(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedProductionData {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Production data must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  // Find column indices (flexible matching)
  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const orderIdIdx = findColumn(['orderid', 'order']);
  const stepCodeIdx = findColumn(['stepcode', 'step']);
  const workerNameIdx = findColumn(['workername', 'worker', 'name']);
  const dateIdx = findColumn(['date']);
  const startTimeIdx = findColumn(['starttime', 'start']);
  const endTimeIdx = findColumn(['endtime', 'end', 'finish']);
  const unitsIdx = findColumn(['units', 'output', 'quantity', 'pieces']);

  // Validate required columns
  const missing: string[] = [];
  if (orderIdIdx === -1) missing.push('order_id');
  if (stepCodeIdx === -1) missing.push('step_code');
  if (workerNameIdx === -1) missing.push('worker_name');
  if (dateIdx === -1) missing.push('date');
  if (startTimeIdx === -1) missing.push('start_time');
  if (endTimeIdx === -1) missing.push('end_time');
  if (unitsIdx === -1) missing.push('units');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const parsedRows: ParsedProductionRow[] = [];
  const orderIds = new Set<number>();
  const stepCodes = new Set<string>();
  const workerNames = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    // Skip empty rows
    const hasContent = row.some(cell => cell && cell.trim());
    if (!hasContent) continue;

    const rowNumber = rowIdx + 1; // 1-indexed for user display

    // Parse order_id
    const orderIdStr = row[orderIdIdx]?.trim();
    if (!orderIdStr) {
      throw new Error(`Row ${rowNumber}: Missing order_id`);
    }
    const orderId = parseInt(orderIdStr, 10);
    if (isNaN(orderId)) {
      throw new Error(`Row ${rowNumber}: Invalid order_id "${orderIdStr}" - must be a number`);
    }

    // Parse step_code
    const stepCode = row[stepCodeIdx]?.trim();
    if (!stepCode) {
      throw new Error(`Row ${rowNumber}: Missing step_code`);
    }

    // Parse worker_name
    const workerName = row[workerNameIdx]?.trim();
    if (!workerName) {
      throw new Error(`Row ${rowNumber}: Missing worker_name`);
    }

    // Parse date
    const date = row[dateIdx]?.trim();
    if (!date) {
      throw new Error(`Row ${rowNumber}: Missing date`);
    }
    if (!isValidDate(date)) {
      throw new Error(`Row ${rowNumber}: Invalid date format "${date}" - expected YYYY-MM-DD`);
    }

    // Parse start_time
    const startTime = row[startTimeIdx]?.trim();
    if (!startTime) {
      throw new Error(`Row ${rowNumber}: Missing start_time`);
    }
    if (!isValidTime(startTime)) {
      throw new Error(`Row ${rowNumber}: Invalid start_time format "${startTime}" - expected HH:MM or HH:MM:SS`);
    }

    // Parse end_time
    const endTime = row[endTimeIdx]?.trim();
    if (!endTime) {
      throw new Error(`Row ${rowNumber}: Missing end_time`);
    }
    if (!isValidTime(endTime)) {
      throw new Error(`Row ${rowNumber}: Invalid end_time format "${endTime}" - expected HH:MM or HH:MM:SS`);
    }

    // Parse units
    const unitsStr = row[unitsIdx]?.trim();
    if (!unitsStr) {
      throw new Error(`Row ${rowNumber}: Missing units`);
    }
    const units = parseInt(unitsStr, 10);
    if (isNaN(units) || units < 0) {
      throw new Error(`Row ${rowNumber}: Invalid units "${unitsStr}" - must be a non-negative number`);
    }

    orderIds.add(orderId);
    stepCodes.add(stepCode);
    workerNames.add(workerName);

    parsedRows.push({
      orderId,
      stepCode,
      workerName,
      date,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
      units,
      rowNumber,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No valid data rows found');
  }

  return {
    rows: parsedRows,
    orderIds,
    stepCodes,
    workerNames,
  };
}

/**
 * Import parsers for cold start spreadsheet uploads
 */

// Parsed Equipment-Worker Matrix types
export interface ParsedEquipment {
  name: string;           // Work Code
  description: string;    // Work Type
  stationCount: number | null;  // null if 100 (virtual equipment)
  workCategoryName: string;     // Extracted from Work Type (e.g., "Cutting" from "Cutting - Manual")
  hourlyCost: number;           // Equipment cost per hour
}

export interface ParsedWorker {
  name: string;
  columnIndex: number;
  costPerHour: number;          // Worker cost per hour (from _COST row)
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

// Parsed Products CSV types (with versions and steps)
export interface ParsedProductVersion {
  productName: string;
  versionName: string;
  versionNumber: number;
  isDefault: boolean;
  steps: ParsedProductStepWithVersion[];
}

export interface ParsedProductStepWithVersion {
  stepCode: string;
  externalId: string;           // External system ID for materials supply
  category: string;
  componentName: string;
  taskName: string;
  timePerPieceSeconds: number;
  equipmentCode: string;
  dependencies: ParsedDependency[];
  rowNumber: number;
}

export interface ParsedProducts {
  products: Map<string, Map<number, ParsedProductVersion>>; // productName -> versionNumber -> version
  components: Set<string>;
  workCategories: Set<string>;
  equipmentCodes: Set<string>;
}

// Parsed Orders CSV types
export interface ParsedOrder {
  productName: string;
  quantity: number;
  dueDate: string;              // YYYY-MM-DD
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  rowNumber: number;
}

export interface ParsedOrders {
  orders: ParsedOrder[];
  productNames: Set<string>;
}

// Parsed Production History types (v2 - uses product_name + due_date + version_name)
export interface ParsedProductionRowV2 {
  productName: string;
  dueDate: string;              // YYYY-MM-DD (identifies the order)
  versionName: string;          // Required - which version was used
  stepCode: string;
  workerName: string;
  workDate: string;             // YYYY-MM-DD
  startTime: string;            // HH:MM:SS
  endTime: string;              // HH:MM:SS
  units: number;
  rowNumber: number;
}

export interface ParsedProductionDataV2 {
  rows: ParsedProductionRowV2[];
  orderKeys: Set<string>;       // "productName:dueDate" composite keys
  stepCodes: Set<string>;
  workerNames: Set<string>;
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
 * Parse Equipment-Worker Matrix spreadsheet
 *
 * Expected format:
 * equipment_code | work_category | work_type | station_count | hourly_cost | Worker1 | Worker2 | ...
 * _COST          |               | Worker Cost Per Hour | 0 | 0 | 25.50 | 22.00 | ...
 * STS            | Sewing        | Single Needle | 3 | 5.00 | Y | Y | ...
 * CTL            | Cutting       | Team Lead | 100 | 0 | Y | | ...
 *
 * work_category: Explicit work category (e.g., "Sewing", "Cutting", "Inspection")
 * work_type: Description/subtype of the work (e.g., "Single Needle", "Team Lead")
 */
export function parseEquipmentMatrix(content: string, format: 'tsv' | 'csv' = 'tsv'): ParsedEquipmentMatrix {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Equipment matrix must have at least a header row and one data row');
  }

  const headerRow = rows[0]!;
  const headerLower = headerRow.map(h => h.toLowerCase());

  // Find column indices
  let equipmentCodeIdx = headerLower.findIndex(h => h.includes('equipment_code') || h.includes('equipmentcode'));
  let workCategoryIdx = headerLower.findIndex(h => h.includes('work_category') || h.includes('workcategory'));
  let stationCountIdx = headerLower.findIndex(h => h.includes('station_count') || h.includes('stationcount'));
  let hourlyCostIdx = headerLower.findIndex(h => h.includes('hourly_cost') || h.includes('hourlycost'));
  let workTypeIdx = headerLower.findIndex(h => h.includes('work_type') || h.includes('worktype'));

  // Fallback to legacy column names
  if (equipmentCodeIdx === -1) {
    equipmentCodeIdx = headerLower.findIndex(h => h.includes('work') && h.includes('code'));
  }
  if (stationCountIdx === -1) {
    stationCountIdx = headerLower.findIndex(h => h.includes('equipment') && h.includes('count'));
  }

  if (equipmentCodeIdx === -1) {
    throw new Error('Could not find "equipment_code" or "Work Code" column in header');
  }

  if (workCategoryIdx === -1) {
    throw new Error('Missing required column: work_category');
  }

  // Worker columns start after the last metadata column
  const lastMetaCol = Math.max(equipmentCodeIdx, workCategoryIdx, stationCountIdx, hourlyCostIdx, workTypeIdx);
  const workerStartIdx = lastMetaCol + 1;

  // Extract worker names from header (initially without costs)
  const workerCosts = new Map<string, number>();
  const workerColumns: { name: string; columnIndex: number }[] = [];
  for (let i = workerStartIdx; i < headerRow.length; i++) {
    const name = headerRow[i];
    if (name && name.trim()) {
      workerColumns.push({ name: name.trim(), columnIndex: i });
      workerCosts.set(name.trim(), 0); // Default cost
    }
  }

  const equipment: ParsedEquipment[] = [];
  const certifications: ParsedCertification[] = [];
  const workCategories = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    const code = row[equipmentCodeIdx]?.trim();
    if (!code) continue;

    // Handle special _COST row for worker costs
    if (code.toUpperCase() === '_COST') {
      for (const workerCol of workerColumns) {
        const costStr = row[workerCol.columnIndex]?.trim();
        if (costStr) {
          const cost = parseFloat(costStr);
          if (!isNaN(cost)) {
            workerCosts.set(workerCol.name, cost);
          }
        }
      }
      continue; // Don't add _COST as equipment
    }

    // Parse station count
    let stationCount: number | null = null;
    if (stationCountIdx >= 0) {
      const countStr = row[stationCountIdx]?.trim();
      if (countStr) {
        const count = parseInt(countStr, 10);
        if (!isNaN(count)) {
          // 100 means equipment is not needed (virtual)
          stationCount = count === 100 ? null : count;
        }
      }
    }

    // Parse hourly cost
    let hourlyCost = 0;
    if (hourlyCostIdx >= 0) {
      const costStr = row[hourlyCostIdx]?.trim();
      if (costStr) {
        const cost = parseFloat(costStr);
        if (!isNaN(cost)) {
          hourlyCost = cost;
        }
      }
    }

    // Get explicit work category (required)
    const workCategory = row[workCategoryIdx]?.trim() || '';
    const categoryName = workCategory.toUpperCase() || 'OTHER';
    workCategories.add(categoryName);

    // Get work type description (optional)
    const workType = workTypeIdx >= 0 ? row[workTypeIdx]?.trim() || '' : '';

    equipment.push({
      name: code,
      description: workType,
      stationCount,
      workCategoryName: categoryName,
      hourlyCost,
    });

    // Check certifications for each worker
    for (const workerCol of workerColumns) {
      const cellValue = row[workerCol.columnIndex]?.trim().toUpperCase();
      if (cellValue === 'Y' || cellValue === 'YES' || cellValue === 'X' || cellValue === '1') {
        certifications.push({
          workerName: workerCol.name,
          equipmentName: code,
        });
      }
    }
  }

  // Build workers array with costs
  const workers: ParsedWorker[] = workerColumns.map(wc => ({
    name: wc.name,
    columnIndex: wc.columnIndex,
    costPerHour: workerCosts.get(wc.name) || 0,
  }));

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

/**
 * Parse Products CSV spreadsheet (with versions and steps)
 *
 * Expected format:
 * product_name,version_name,version_number,is_default,step_code,external_id,category,component,task_name,time_seconds,equipment_code,dependencies
 * Tactical Vest,v1.0 Standard,1,Y,A1A,MAT-001,SEWING,Small Velcro Pocket,Hem short edges,20,STS,
 * Tactical Vest,v1.0 Standard,1,Y,A1B,MAT-002,SEWING,Small Velcro Pocket,Sew hook Velcro,25,STS,A1A
 */
export function parseProducts(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedProducts {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Products CSV must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  // Find column indices (flexible matching)
  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const productNameIdx = findColumn(['productname']);
  const versionNameIdx = findColumn(['versionname']);
  const versionNumberIdx = findColumn(['versionnumber']);
  const isDefaultIdx = findColumn(['isdefault', 'default']);
  const stepCodeIdx = findColumn(['stepcode']);
  const externalIdIdx = findColumn(['externalid', 'external']);
  const categoryIdx = findColumn(['category']);
  const componentIdx = findColumn(['component']);
  const taskNameIdx = findColumn(['taskname', 'task']);
  const timeIdx = findColumn(['timeseconds', 'time']);
  const equipmentCodeIdx = findColumn(['equipmentcode', 'equipment']);
  const dependenciesIdx = findColumn(['dependencies', 'dependency']);

  // Validate required columns
  const missing: string[] = [];
  if (productNameIdx === -1) missing.push('product_name');
  if (versionNameIdx === -1) missing.push('version_name');
  if (versionNumberIdx === -1) missing.push('version_number');
  if (stepCodeIdx === -1) missing.push('step_code');
  if (categoryIdx === -1) missing.push('category');
  if (taskNameIdx === -1) missing.push('task_name');
  if (timeIdx === -1) missing.push('time_seconds');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  // Map: productName -> versionNumber -> ParsedProductVersion
  const products = new Map<string, Map<number, ParsedProductVersion>>();
  const components = new Set<string>();
  const workCategories = new Set<string>();
  const equipmentCodes = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    // Skip empty rows
    const hasContent = row.some(cell => cell && cell.trim());
    if (!hasContent) continue;

    const rowNumber = rowIdx + 1; // 1-indexed for user display

    // Parse product name
    const productName = row[productNameIdx]?.trim();
    if (!productName) {
      throw new Error(`Row ${rowNumber}: Missing product_name`);
    }

    // Parse version info
    const versionName = row[versionNameIdx]?.trim();
    if (!versionName) {
      throw new Error(`Row ${rowNumber}: Missing version_name`);
    }

    const versionNumberStr = row[versionNumberIdx]?.trim();
    if (!versionNumberStr) {
      throw new Error(`Row ${rowNumber}: Missing version_number`);
    }
    const versionNumber = parseInt(versionNumberStr, 10);
    if (isNaN(versionNumber) || versionNumber <= 0) {
      throw new Error(`Row ${rowNumber}: Invalid version_number "${versionNumberStr}" - must be a positive integer`);
    }

    // Parse is_default
    const isDefaultStr = isDefaultIdx >= 0 ? row[isDefaultIdx]?.trim().toUpperCase() : '';
    const isDefault = isDefaultStr === 'Y' || isDefaultStr === 'YES' || isDefaultStr === '1' || isDefaultStr === 'TRUE';

    // Parse step_code
    const stepCode = row[stepCodeIdx]?.trim();
    if (!stepCode) {
      throw new Error(`Row ${rowNumber}: Missing step_code`);
    }

    // Parse external_id (optional)
    const externalId = externalIdIdx >= 0 ? row[externalIdIdx]?.trim() || '' : '';

    // Parse category
    const category = row[categoryIdx]?.trim().toUpperCase() || 'OTHER';
    workCategories.add(category);

    // Parse component (optional)
    const componentName = componentIdx >= 0 ? row[componentIdx]?.trim() || '' : '';
    if (componentName) {
      components.add(componentName);
    }

    // Parse task name
    const taskName = row[taskNameIdx]?.trim();
    if (!taskName) {
      throw new Error(`Row ${rowNumber}: Missing task_name`);
    }

    // Parse time
    const timeStr = row[timeIdx]?.trim();
    if (!timeStr) {
      throw new Error(`Row ${rowNumber}: Missing time_seconds`);
    }
    const timePerPieceSeconds = parseInt(timeStr, 10);
    if (isNaN(timePerPieceSeconds) || timePerPieceSeconds <= 0) {
      throw new Error(`Row ${rowNumber}: Invalid time_seconds "${timeStr}" - must be a positive integer`);
    }

    // Parse equipment code (optional)
    const equipmentCode = equipmentCodeIdx >= 0 ? row[equipmentCodeIdx]?.trim() || '' : '';
    if (equipmentCode) {
      equipmentCodes.add(equipmentCode);
    }

    // Parse dependencies
    const dependencies: ParsedDependency[] = [];
    if (dependenciesIdx >= 0) {
      const depStr = row[dependenciesIdx]?.trim();
      if (depStr) {
        const depParts = depStr.split(',').map(d => d.trim()).filter(d => d);
        for (const dep of depParts) {
          const [depStepCode, typeStr] = dep.split(':').map(s => s.trim());
          if (depStepCode) {
            const type = typeStr?.toLowerCase() === 'start' ? 'start' : 'finish';
            dependencies.push({ stepCode: depStepCode, type });
          }
        }
      }
    }

    // Get or create product version structure
    if (!products.has(productName)) {
      products.set(productName, new Map());
    }
    const productVersions = products.get(productName)!;

    if (!productVersions.has(versionNumber)) {
      productVersions.set(versionNumber, {
        productName,
        versionName,
        versionNumber,
        isDefault,
        steps: [],
      });
    }

    const version = productVersions.get(versionNumber)!;

    // Update isDefault if any row marks it as default
    if (isDefault) {
      version.isDefault = true;
    }

    // Add step to version
    version.steps.push({
      stepCode,
      externalId,
      category,
      componentName,
      taskName,
      timePerPieceSeconds,
      equipmentCode,
      dependencies,
      rowNumber,
    });
  }

  if (products.size === 0) {
    throw new Error('No valid product data found');
  }

  return {
    products,
    components,
    workCategories,
    equipmentCodes,
  };
}

/**
 * Parse Orders CSV spreadsheet
 *
 * Expected format:
 * product_name,quantity,due_date,status
 * Tactical Vest,500,2025-02-15,completed
 * Medical Kit Pouch,100,2025-02-20,pending
 */
export function parseOrders(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedOrders {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Orders CSV must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  // Find column indices (flexible matching)
  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const productNameIdx = findColumn(['productname']);
  const quantityIdx = findColumn(['quantity', 'qty']);
  const dueDateIdx = findColumn(['duedate', 'due']);
  const statusIdx = findColumn(['status']);

  // Validate required columns
  const missing: string[] = [];
  if (productNameIdx === -1) missing.push('product_name');
  if (quantityIdx === -1) missing.push('quantity');
  if (dueDateIdx === -1) missing.push('due_date');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const orders: ParsedOrder[] = [];
  const productNames = new Set<string>();

  // Valid statuses
  const validStatuses = new Set(['pending', 'scheduled', 'in_progress', 'completed']);

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    // Skip empty rows
    const hasContent = row.some(cell => cell && cell.trim());
    if (!hasContent) continue;

    const rowNumber = rowIdx + 1; // 1-indexed for user display

    // Parse product name
    const productName = row[productNameIdx]?.trim();
    if (!productName) {
      throw new Error(`Row ${rowNumber}: Missing product_name`);
    }
    productNames.add(productName);

    // Parse quantity
    const quantityStr = row[quantityIdx]?.trim();
    if (!quantityStr) {
      throw new Error(`Row ${rowNumber}: Missing quantity`);
    }
    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error(`Row ${rowNumber}: Invalid quantity "${quantityStr}" - must be a positive integer`);
    }

    // Parse due_date
    const dueDate = row[dueDateIdx]?.trim();
    if (!dueDate) {
      throw new Error(`Row ${rowNumber}: Missing due_date`);
    }
    if (!isValidDate(dueDate)) {
      throw new Error(`Row ${rowNumber}: Invalid due_date format "${dueDate}" - expected YYYY-MM-DD`);
    }

    // Parse status (optional, defaults to 'pending')
    let status: 'pending' | 'scheduled' | 'in_progress' | 'completed' = 'pending';
    if (statusIdx >= 0) {
      const statusStr = row[statusIdx]?.trim().toLowerCase();
      if (statusStr) {
        if (!validStatuses.has(statusStr)) {
          throw new Error(`Row ${rowNumber}: Invalid status "${statusStr}" - must be one of: pending, scheduled, in_progress, completed`);
        }
        status = statusStr as typeof status;
      }
    }

    orders.push({
      productName,
      quantity,
      dueDate,
      status,
      rowNumber,
    });
  }

  if (orders.length === 0) {
    throw new Error('No valid order data found');
  }

  return {
    orders,
    productNames,
  };
}

/**
 * Parse Production History CSV spreadsheet (v2 - uses product_name + due_date + version_name)
 *
 * Expected format:
 * product_name,due_date,version_name,step_code,worker_name,work_date,start_time,end_time,units_produced
 * Tactical Vest,2025-01-10,v1.0 Standard,A1A,Maria Garcia,2025-01-05,07:00,11:00,120
 */
export function parseProductionDataV2(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedProductionDataV2 {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Production history CSV must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  // Find column indices (flexible matching)
  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const productNameIdx = findColumn(['productname']);
  const dueDateIdx = findColumn(['duedate']);
  const versionNameIdx = findColumn(['versionname', 'version']);
  const stepCodeIdx = findColumn(['stepcode']);
  const workerNameIdx = findColumn(['workername', 'worker']);
  const workDateIdx = findColumn(['work_date', 'workdate']);
  const startTimeIdx = findColumn(['starttime', 'start']);
  const endTimeIdx = findColumn(['endtime', 'end']);
  const unitsIdx = findColumn(['unitsproduced', 'units', 'output']);

  // Validate required columns
  const missing: string[] = [];
  if (productNameIdx === -1) missing.push('product_name');
  if (dueDateIdx === -1) missing.push('due_date');
  if (versionNameIdx === -1) missing.push('version_name');
  if (stepCodeIdx === -1) missing.push('step_code');
  if (workerNameIdx === -1) missing.push('worker_name');
  if (workDateIdx === -1) missing.push('work_date');
  if (startTimeIdx === -1) missing.push('start_time');
  if (endTimeIdx === -1) missing.push('end_time');
  if (unitsIdx === -1) missing.push('units_produced');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const parsedRows: ParsedProductionRowV2[] = [];
  const orderKeys = new Set<string>();
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

    // Parse product_name
    const productName = row[productNameIdx]?.trim();
    if (!productName) {
      throw new Error(`Row ${rowNumber}: Missing product_name`);
    }

    // Parse due_date (identifies the order)
    const dueDate = row[dueDateIdx]?.trim();
    if (!dueDate) {
      throw new Error(`Row ${rowNumber}: Missing due_date`);
    }
    if (!isValidDate(dueDate)) {
      throw new Error(`Row ${rowNumber}: Invalid due_date format "${dueDate}" - expected YYYY-MM-DD`);
    }

    // Parse version_name (required - which version was used)
    const versionName = row[versionNameIdx]?.trim();
    if (!versionName) {
      throw new Error(`Row ${rowNumber}: Missing version_name - version is required for production history`);
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

    // Parse work_date
    const workDate = row[workDateIdx]?.trim();
    if (!workDate) {
      throw new Error(`Row ${rowNumber}: Missing work_date`);
    }
    if (!isValidDate(workDate)) {
      throw new Error(`Row ${rowNumber}: Invalid work_date format "${workDate}" - expected YYYY-MM-DD`);
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
      throw new Error(`Row ${rowNumber}: Missing units_produced`);
    }
    const units = parseInt(unitsStr, 10);
    if (isNaN(units) || units < 0) {
      throw new Error(`Row ${rowNumber}: Invalid units_produced "${unitsStr}" - must be a non-negative number`);
    }

    // Add to tracking sets
    const orderKey = `${productName}:${dueDate}`;
    orderKeys.add(orderKey);
    stepCodes.add(stepCode);
    workerNames.add(workerName);

    parsedRows.push({
      productName,
      dueDate,
      versionName,
      stepCode,
      workerName,
      workDate,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
      units,
      rowNumber,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No valid production history data found');
  }

  return {
    rows: parsedRows,
    orderKeys,
    stepCodes,
    workerNames,
  };
}

// ============================================================================
// FISHBOWL-AWARE IMPORT PARSERS
// ============================================================================

// Parsed Product Steps with Fishbowl BOM reference
export interface ParsedProductStepFB {
  fishbowlBomNum: string;         // Fishbowl BOM number (required)
  versionName: string;            // e.g., "v1.0 Standard"
  versionNumber: number;          // e.g., 1
  isDefault: boolean;
  stepCode: string;
  category: string;
  componentName: string;
  taskName: string;
  timePerPieceSeconds: number;
  equipmentCode: string;
  dependencies: ParsedDependency[];
  rowNumber: number;
}

export interface ParsedProductStepsFB {
  // Grouped by BOM num -> version number
  bomVersions: Map<string, Map<number, {
    versionName: string;
    versionNumber: number;
    isDefault: boolean;
    steps: ParsedProductStepFB[];
  }>>;
  fishbowlBomNums: Set<string>;
  components: Set<string>;
  workCategories: Set<string>;
  equipmentCodes: Set<string>;
}

/**
 * Parse Product Steps CSV with Fishbowl BOM reference
 *
 * Expected format:
 * fishbowl_bom_num,version_name,version_number,is_default,step_code,category,component,task_name,time_seconds,equipment_code,dependencies
 * 0707-ROLL-BLACK,v1.0 Standard,1,Y,A1A,SEWING,Small Velcro Pocket,Hem short edges,20,STS,
 * 0707-ROLL-BLACK,v1.0 Standard,1,Y,A1B,SEWING,Small Velcro Pocket,Sew hook Velcro,25,STS,A1A
 */
export function parseProductStepsFB(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedProductStepsFB {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Product steps CSV must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const bomNumIdx = findColumn(['fishbowlbomnum', 'bomnum', 'bom']);
  const versionNameIdx = findColumn(['versionname']);
  const versionNumberIdx = findColumn(['versionnumber']);
  const isDefaultIdx = findColumn(['isdefault', 'default']);
  const stepCodeIdx = findColumn(['stepcode']);
  const categoryIdx = findColumn(['category']);
  const componentIdx = findColumn(['component']);
  const taskNameIdx = findColumn(['taskname', 'task']);
  const timeIdx = findColumn(['timeseconds', 'time']);
  const equipmentCodeIdx = findColumn(['equipmentcode', 'equipment']);
  const dependenciesIdx = findColumn(['dependencies', 'dependency']);

  // Validate required columns
  const missing: string[] = [];
  if (bomNumIdx === -1) missing.push('fishbowl_bom_num');
  if (versionNameIdx === -1) missing.push('version_name');
  if (versionNumberIdx === -1) missing.push('version_number');
  if (stepCodeIdx === -1) missing.push('step_code');
  if (categoryIdx === -1) missing.push('category');
  if (taskNameIdx === -1) missing.push('task_name');
  if (timeIdx === -1) missing.push('time_seconds');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const bomVersions = new Map<string, Map<number, {
    versionName: string;
    versionNumber: number;
    isDefault: boolean;
    steps: ParsedProductStepFB[];
  }>>();
  const fishbowlBomNums = new Set<string>();
  const components = new Set<string>();
  const workCategories = new Set<string>();
  const equipmentCodes = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    const hasContent = row.some(cell => cell && cell.trim());
    if (!hasContent) continue;

    const rowNumber = rowIdx + 1;

    // Parse fishbowl_bom_num
    const fishbowlBomNum = row[bomNumIdx]?.trim();
    if (!fishbowlBomNum) {
      throw new Error(`Row ${rowNumber}: Missing fishbowl_bom_num`);
    }
    fishbowlBomNums.add(fishbowlBomNum);

    // Parse version info
    const versionName = row[versionNameIdx]?.trim();
    if (!versionName) {
      throw new Error(`Row ${rowNumber}: Missing version_name`);
    }

    const versionNumberStr = row[versionNumberIdx]?.trim();
    if (!versionNumberStr) {
      throw new Error(`Row ${rowNumber}: Missing version_number`);
    }
    const versionNumber = parseInt(versionNumberStr, 10);
    if (isNaN(versionNumber) || versionNumber <= 0) {
      throw new Error(`Row ${rowNumber}: Invalid version_number "${versionNumberStr}" - must be a positive integer`);
    }

    const isDefaultStr = isDefaultIdx >= 0 ? row[isDefaultIdx]?.trim().toUpperCase() : '';
    const isDefault = isDefaultStr === 'Y' || isDefaultStr === 'YES' || isDefaultStr === '1' || isDefaultStr === 'TRUE';

    // Parse step_code
    const stepCode = row[stepCodeIdx]?.trim();
    if (!stepCode) {
      throw new Error(`Row ${rowNumber}: Missing step_code`);
    }

    // Parse category
    const category = row[categoryIdx]?.trim().toUpperCase() || 'OTHER';
    workCategories.add(category);

    // Parse component (optional)
    const componentName = componentIdx >= 0 ? row[componentIdx]?.trim() || '' : '';
    if (componentName) {
      components.add(componentName);
    }

    // Parse task name
    const taskName = row[taskNameIdx]?.trim();
    if (!taskName) {
      throw new Error(`Row ${rowNumber}: Missing task_name`);
    }

    // Parse time
    const timeStr = row[timeIdx]?.trim();
    if (!timeStr) {
      throw new Error(`Row ${rowNumber}: Missing time_seconds`);
    }
    const timePerPieceSeconds = parseInt(timeStr, 10);
    if (isNaN(timePerPieceSeconds) || timePerPieceSeconds <= 0) {
      throw new Error(`Row ${rowNumber}: Invalid time_seconds "${timeStr}" - must be a positive integer`);
    }

    // Parse equipment code (optional)
    const equipmentCode = equipmentCodeIdx >= 0 ? row[equipmentCodeIdx]?.trim() || '' : '';
    if (equipmentCode) {
      equipmentCodes.add(equipmentCode);
    }

    // Parse dependencies
    const dependencies: ParsedDependency[] = [];
    if (dependenciesIdx >= 0) {
      const depStr = row[dependenciesIdx]?.trim();
      if (depStr) {
        const depParts = depStr.split(',').map(d => d.trim()).filter(d => d);
        for (const dep of depParts) {
          const [depStepCode, typeStr] = dep.split(':').map(s => s.trim());
          if (depStepCode) {
            const type = typeStr?.toLowerCase() === 'start' ? 'start' : 'finish';
            dependencies.push({ stepCode: depStepCode, type });
          }
        }
      }
    }

    // Get or create BOM version structure
    if (!bomVersions.has(fishbowlBomNum)) {
      bomVersions.set(fishbowlBomNum, new Map());
    }
    const versions = bomVersions.get(fishbowlBomNum)!;

    if (!versions.has(versionNumber)) {
      versions.set(versionNumber, {
        versionName,
        versionNumber,
        isDefault,
        steps: [],
      });
    }

    const version = versions.get(versionNumber)!;
    if (isDefault) {
      version.isDefault = true;
    }

    version.steps.push({
      fishbowlBomNum,
      versionName,
      versionNumber,
      isDefault,
      stepCode,
      category,
      componentName,
      taskName,
      timePerPieceSeconds,
      equipmentCode,
      dependencies,
      rowNumber,
    });
  }

  if (bomVersions.size === 0) {
    throw new Error('No valid product steps data found');
  }

  return {
    bomVersions,
    fishbowlBomNums,
    components,
    workCategories,
    equipmentCodes,
  };
}

// Parsed Production History with Fishbowl references
export interface ParsedProductionRowFB {
  fishbowlBomNum: string;         // Fishbowl BOM number (identifies product)
  fishbowlSoNum: string | null;   // Fishbowl SO number (optional, for linking)
  fishbowlWoNum: string | null;   // Fishbowl WO number (optional, for linking)
  versionName: string;
  stepCode: string;
  workerName: string;
  workDate: string;               // YYYY-MM-DD
  startTime: string;              // HH:MM:SS
  endTime: string;                // HH:MM:SS
  units: number;
  rowNumber: number;
}

export interface ParsedProductionDataFB {
  rows: ParsedProductionRowFB[];
  fishbowlBomNums: Set<string>;
  fishbowlSoNums: Set<string>;
  fishbowlWoNums: Set<string>;
  stepCodes: Set<string>;
  workerNames: Set<string>;
}

/**
 * Parse Production History CSV with Fishbowl references
 *
 * Expected format:
 * fishbowl_bom_num,fishbowl_so_num,fishbowl_wo_num,version_name,step_code,worker_name,work_date,start_time,end_time,units_produced
 * 0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,A1A,Maria Garcia,2025-01-05,07:00,11:00,120
 */
export function parseProductionDataFB(content: string, format: 'tsv' | 'csv' = 'csv'): ParsedProductionDataFB {
  const rows = parseDelimited(content, format);

  if (rows.length < 2) {
    throw new Error('Production history CSV must have at least a header row and one data row');
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));

  const findColumn = (keywords: string[]): number => {
    return headerRow.findIndex(h =>
      keywords.some(k => h.includes(k))
    );
  };

  const bomNumIdx = findColumn(['fishbowlbomnum', 'bomnum', 'bom']);
  const soNumIdx = findColumn(['fishbowlsonum', 'sonum', 'salesorder']);
  const woNumIdx = findColumn(['fishbowlwonum', 'wonum', 'workorder']);
  const versionNameIdx = findColumn(['versionname', 'version']);
  const stepCodeIdx = findColumn(['stepcode']);
  const workerNameIdx = findColumn(['workername', 'worker']);
  const workDateIdx = findColumn(['workdate']);
  const startTimeIdx = findColumn(['starttime', 'start']);
  const endTimeIdx = findColumn(['endtime', 'end']);
  const unitsIdx = findColumn(['unitsproduced', 'units', 'output']);

  // Validate required columns
  const missing: string[] = [];
  if (bomNumIdx === -1) missing.push('fishbowl_bom_num');
  if (versionNameIdx === -1) missing.push('version_name');
  if (stepCodeIdx === -1) missing.push('step_code');
  if (workerNameIdx === -1) missing.push('worker_name');
  if (workDateIdx === -1) missing.push('work_date');
  if (startTimeIdx === -1) missing.push('start_time');
  if (endTimeIdx === -1) missing.push('end_time');
  if (unitsIdx === -1) missing.push('units_produced');

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  const parsedRows: ParsedProductionRowFB[] = [];
  const fishbowlBomNums = new Set<string>();
  const fishbowlSoNums = new Set<string>();
  const fishbowlWoNums = new Set<string>();
  const stepCodes = new Set<string>();
  const workerNames = new Set<string>();

  // Process data rows
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row) continue;

    const hasContent = row.some(cell => cell && cell.trim());
    if (!hasContent) continue;

    const rowNumber = rowIdx + 1;

    // Parse fishbowl_bom_num (required)
    const fishbowlBomNum = row[bomNumIdx]?.trim();
    if (!fishbowlBomNum) {
      throw new Error(`Row ${rowNumber}: Missing fishbowl_bom_num`);
    }
    fishbowlBomNums.add(fishbowlBomNum);

    // Parse fishbowl_so_num (optional)
    const fishbowlSoNum = soNumIdx >= 0 ? row[soNumIdx]?.trim() || null : null;
    if (fishbowlSoNum) {
      fishbowlSoNums.add(fishbowlSoNum);
    }

    // Parse fishbowl_wo_num (optional)
    const fishbowlWoNum = woNumIdx >= 0 ? row[woNumIdx]?.trim() || null : null;
    if (fishbowlWoNum) {
      fishbowlWoNums.add(fishbowlWoNum);
    }

    // Parse version_name
    const versionName = row[versionNameIdx]?.trim();
    if (!versionName) {
      throw new Error(`Row ${rowNumber}: Missing version_name`);
    }

    // Parse step_code
    const stepCode = row[stepCodeIdx]?.trim();
    if (!stepCode) {
      throw new Error(`Row ${rowNumber}: Missing step_code`);
    }
    stepCodes.add(stepCode);

    // Parse worker_name
    const workerName = row[workerNameIdx]?.trim();
    if (!workerName) {
      throw new Error(`Row ${rowNumber}: Missing worker_name`);
    }
    workerNames.add(workerName);

    // Parse work_date
    const workDate = row[workDateIdx]?.trim();
    if (!workDate) {
      throw new Error(`Row ${rowNumber}: Missing work_date`);
    }
    if (!isValidDate(workDate)) {
      throw new Error(`Row ${rowNumber}: Invalid work_date format "${workDate}" - expected YYYY-MM-DD`);
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
      throw new Error(`Row ${rowNumber}: Missing units_produced`);
    }
    const units = parseInt(unitsStr, 10);
    if (isNaN(units) || units < 0) {
      throw new Error(`Row ${rowNumber}: Invalid units_produced "${unitsStr}" - must be a non-negative number`);
    }

    parsedRows.push({
      fishbowlBomNum,
      fishbowlSoNum,
      fishbowlWoNum,
      versionName,
      stepCode,
      workerName,
      workDate,
      startTime: normalizeTime(startTime),
      endTime: normalizeTime(endTime),
      units,
      rowNumber,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No valid production history data found');
  }

  return {
    rows: parsedRows,
    fishbowlBomNums,
    fishbowlSoNums,
    fishbowlWoNums,
    stepCodes,
    workerNames,
  };
}

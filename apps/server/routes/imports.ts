/**
 * Import routes for CSV bulk uploads
 * Supports NEW schema: bom_steps, demand_entries, production_history
 * Plus existing: equipment, workers, work_categories, certifications
 */

import { db } from "../db";

// Preview token storage (in-memory with TTL)
interface PreviewData {
  type: 'equipment-matrix' | 'bom-steps' | 'demand' | 'production-history';
  data: any;
  validation: any;
  createdAt: number;
}

const previewStore = new Map<string, PreviewData>();
const PREVIEW_TTL = 30 * 60 * 1000; // 30 minutes

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of previewStore) {
    if (now - data.createdAt > PREVIEW_TTL) {
      previewStore.delete(token);
    }
  }
}

function generateToken(): string {
  return crypto.randomUUID();
}

function parseCSV(content: string): string[][] {
  const lines = content.trim().split('\n');
  return lines.map(line => {
    // Handle quoted values with commas
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function parseTSV(content: string): string[][] {
  const lines = content.trim().split('\n');
  return lines.map(line => line.split('\t').map(cell => cell.trim()));
}

function parseSpreadsheet(content: string): string[][] {
  // Auto-detect delimiter
  const firstLine = content.split('\n')[0] || '';
  if (firstLine.includes('\t')) {
    return parseTSV(content);
  }
  return parseCSV(content);
}

export async function handleImports(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // Cleanup on each request
  cleanupExpiredTokens();

  // ============================================================
  // Equipment Matrix Import (workers, equipment, certifications)
  // ============================================================

  if (url.pathname === "/api/imports/equipment-matrix/preview" && request.method === "POST") {
    return handleEquipmentMatrixPreview(request);
  }

  if (url.pathname === "/api/imports/equipment-matrix/confirm" && request.method === "POST") {
    return handleEquipmentMatrixConfirm(request);
  }

  // ============================================================
  // BOM Steps Import
  // ============================================================

  if (url.pathname === "/api/imports/bom-steps/preview" && request.method === "POST") {
    return handleBOMStepsPreview(request);
  }

  if (url.pathname === "/api/imports/bom-steps/confirm" && request.method === "POST") {
    return handleBOMStepsConfirm(request);
  }

  // ============================================================
  // Demand Import
  // ============================================================

  if (url.pathname === "/api/imports/demand/preview" && request.method === "POST") {
    return handleDemandPreview(request);
  }

  if (url.pathname === "/api/imports/demand/confirm" && request.method === "POST") {
    return handleDemandConfirm(request);
  }

  // ============================================================
  // Production History Import
  // ============================================================

  if (url.pathname === "/api/imports/production-history/preview" && request.method === "POST") {
    return handleProductionHistoryPreview(request);
  }

  if (url.pathname === "/api/imports/production-history/confirm" && request.method === "POST") {
    return handleProductionHistoryConfirm(request);
  }

  return null;
}

// ============================================================
// Equipment Matrix Import
// ============================================================

interface ParsedEquipmentMatrix {
  workCategories: string[];
  equipment: { name: string; description: string; stationCount: number; workCategoryName: string; hourlyCost: number }[];
  workers: { name: string; costPerHour: number }[];
  certifications: { workerName: string; equipmentName: string }[];
}

async function handleEquipmentMatrixPreview(request: Request): Promise<Response> {
  let content: string;

  // Support both FormData (file upload) and JSON (paste content)
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { content?: string; format?: string };
    if (!body.content) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }
    content = body.content;
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    content = await file.text();
  } else {
    return Response.json({ error: "Invalid content type. Use application/json or multipart/form-data" }, { status: 400 });
  }

  const rows = parseSpreadsheet(content);

  if (rows.length < 2) {
    return Response.json({ error: "File must have at least a header row and one data row" }, { status: 400 });
  }

  const headerRow = rows[0]!;
  const dataRows = rows.slice(1);

  // Parse the matrix format:
  // First column: worker names (or empty for equipment rows)
  // First row: equipment names
  // Cells: X or checkmark = certified

  const equipment: ParsedEquipmentMatrix['equipment'] = [];
  const workers: ParsedEquipmentMatrix['workers'] = [];
  const certifications: ParsedEquipmentMatrix['certifications'] = [];
  const workCategories = new Set<string>();

  // Extract equipment from header (skip first column which is for worker names)
  for (let i = 1; i < headerRow.length; i++) {
    const equipName = headerRow[i]!.trim();
    if (equipName) {
      equipment.push({
        name: equipName,
        description: '',
        stationCount: 1,
        workCategoryName: 'General',
        hourlyCost: 0
      });
      workCategories.add('General');
    }
  }

  // Extract workers and certifications from data rows
  for (const row of dataRows) {
    const workerName = row[0]?.trim();
    if (!workerName) continue;

    workers.push({ name: workerName, costPerHour: 25 }); // Default rate

    // Check certifications
    for (let i = 1; i < row.length && i <= equipment.length; i++) {
      const cell = row[i]?.trim().toLowerCase();
      if (cell === 'x' || cell === '✓' || cell === 'yes' || cell === '1') {
        certifications.push({
          workerName,
          equipmentName: equipment[i - 1]!.name
        });
      }
    }
  }

  const parsed: ParsedEquipmentMatrix = {
    workCategories: [...workCategories],
    equipment,
    workers,
    certifications
  };

  // Generate preview token
  const token = generateToken();
  previewStore.set(token, {
    type: 'equipment-matrix',
    data: parsed,
    validation: { valid: true, errors: [], warnings: [] },
    createdAt: Date.now()
  });

  return Response.json({
    token,
    preview: {
      workCategories: parsed.workCategories.length,
      equipment: parsed.equipment.length,
      workers: parsed.workers.length,
      certifications: parsed.certifications.length,
      sampleWorkers: parsed.workers.slice(0, 5).map(w => w.name),
      sampleEquipment: parsed.equipment.slice(0, 5).map(e => e.name)
    }
  });
}

async function handleEquipmentMatrixConfirm(request: Request): Promise<Response> {
  const body = await request.json() as { token: string };
  const preview = previewStore.get(body.token);

  if (!preview || preview.type !== 'equipment-matrix') {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  previewStore.delete(body.token);
  const parsed = preview.data as ParsedEquipmentMatrix;

  // Get existing data
  const [existingEquipment, existingWorkers, existingCategories] = await Promise.all([
    db.execute("SELECT name FROM equipment"),
    db.execute("SELECT name FROM workers"),
    db.execute("SELECT name FROM work_categories")
  ]);

  const existingEquipmentNames = new Set((existingEquipment.rows as any[]).map(r => r.name));
  const existingWorkerNames = new Set((existingWorkers.rows as any[]).map(r => r.name));
  const existingCategoryNames = new Set((existingCategories.rows as any[]).map(r => r.name));

  let workCategoriesCreated = 0;
  let equipmentCreated = 0;
  let workersCreated = 0;
  let certificationsCreated = 0;

  // Insert work categories
  for (const name of parsed.workCategories) {
    if (!existingCategoryNames.has(name)) {
      await db.execute({ sql: "INSERT INTO work_categories (name) VALUES (?)", args: [name] });
      workCategoriesCreated++;
    }
  }

  // Get category IDs
  const categoryResult = await db.execute("SELECT id, name FROM work_categories");
  const categoryIds = new Map((categoryResult.rows as any[]).map(r => [r.name, r.id]));

  // Insert equipment
  for (const equip of parsed.equipment) {
    if (!existingEquipmentNames.has(equip.name)) {
      await db.execute({
        sql: "INSERT INTO equipment (name, description, station_count, work_category_id, hourly_cost) VALUES (?, ?, ?, ?, ?)",
        args: [equip.name, equip.description, equip.stationCount, categoryIds.get(equip.workCategoryName) || null, equip.hourlyCost]
      });
      equipmentCreated++;
    }
  }

  // Insert workers
  for (const worker of parsed.workers) {
    if (!existingWorkerNames.has(worker.name)) {
      await db.execute({
        sql: "INSERT INTO workers (name, status, cost_per_hour) VALUES (?, 'active', ?)",
        args: [worker.name, worker.costPerHour]
      });
      workersCreated++;
    }
  }

  // Get IDs for certifications
  const equipResult = await db.execute("SELECT id, name FROM equipment");
  const workerResult = await db.execute("SELECT id, name FROM workers");
  const equipIds = new Map((equipResult.rows as any[]).map(r => [r.name, r.id]));
  const workerIds = new Map((workerResult.rows as any[]).map(r => [r.name, r.id]));

  // Insert certifications
  for (const cert of parsed.certifications) {
    const workerId = workerIds.get(cert.workerName);
    const equipmentId = equipIds.get(cert.equipmentName);
    if (workerId && equipmentId) {
      const existing = await db.execute({
        sql: "SELECT id FROM equipment_certifications WHERE worker_id = ? AND equipment_id = ?",
        args: [workerId, equipmentId]
      });
      if (existing.rows.length === 0) {
        await db.execute({
          sql: "INSERT INTO equipment_certifications (worker_id, equipment_id) VALUES (?, ?)",
          args: [workerId, equipmentId]
        });
        certificationsCreated++;
      }
    }
  }

  return Response.json({
    success: true,
    created: { workCategoriesCreated, equipmentCreated, workersCreated, certificationsCreated }
  });
}

// ============================================================
// BOM Steps Import
// ============================================================

interface ParsedBOMStep {
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  name: string;
  step_code: string | null;
  details: string | null;
  time_per_piece_seconds: number;
  sequence: number;
  work_category: string | null;
  equipment: string | null;
  component: string | null;
}

async function handleBOMStepsPreview(request: Request): Promise<Response> {
  let content: string;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { content?: string };
    if (!body.content) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }
    content = body.content;
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    content = await file.text();
  } else {
    return Response.json({ error: "Invalid content type" }, { status: 400 });
  }

  const rows = parseSpreadsheet(content);

  if (rows.length < 2) {
    return Response.json({ error: "File must have at least a header row and one data row" }, { status: 400 });
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);

  // Required columns: fishbowl_bom_id, fishbowl_bom_num, name, time_per_piece_seconds, sequence
  const requiredCols = ['fishbowl_bom_id', 'fishbowl_bom_num', 'name', 'time_per_piece_seconds', 'sequence'];
  const missingCols = requiredCols.filter(col => !headerRow.includes(col));

  if (missingCols.length > 0) {
    return Response.json({
      error: `Missing required columns: ${missingCols.join(', ')}. Required: fishbowl_bom_id, fishbowl_bom_num, name, time_per_piece_seconds, sequence`
    }, { status: 400 });
  }

  const getCol = (row: string[], col: string) => {
    const idx = headerRow.indexOf(col);
    return idx >= 0 ? row[idx]?.trim() || null : null;
  };

  const steps: ParsedBOMStep[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNum = i + 2; // 1-indexed + header

    const bomId = parseInt(getCol(row, 'fishbowl_bom_id') || '');
    const bomNum = getCol(row, 'fishbowl_bom_num');
    const name = getCol(row, 'name');
    const time = parseInt(getCol(row, 'time_per_piece_seconds') || '');
    const seq = parseInt(getCol(row, 'sequence') || '');

    if (isNaN(bomId)) {
      errors.push(`Row ${rowNum}: Invalid fishbowl_bom_id`);
      continue;
    }
    if (!bomNum) {
      errors.push(`Row ${rowNum}: Missing fishbowl_bom_num`);
      continue;
    }
    if (!name) {
      errors.push(`Row ${rowNum}: Missing name`);
      continue;
    }
    if (isNaN(time)) {
      errors.push(`Row ${rowNum}: Invalid time_per_piece_seconds`);
      continue;
    }
    if (isNaN(seq)) {
      errors.push(`Row ${rowNum}: Invalid sequence`);
      continue;
    }

    steps.push({
      fishbowl_bom_id: bomId,
      fishbowl_bom_num: bomNum,
      name,
      step_code: getCol(row, 'step_code'),
      details: getCol(row, 'details'),
      time_per_piece_seconds: time,
      sequence: seq,
      work_category: getCol(row, 'work_category'),
      equipment: getCol(row, 'equipment'),
      component: getCol(row, 'component')
    });
  }

  const token = generateToken();
  previewStore.set(token, {
    type: 'bom-steps',
    data: steps,
    validation: { valid: errors.length === 0, errors },
    createdAt: Date.now()
  });

  // Group by BOM for preview
  const bomCounts = new Map<string, number>();
  for (const step of steps) {
    bomCounts.set(step.fishbowl_bom_num, (bomCounts.get(step.fishbowl_bom_num) || 0) + 1);
  }

  return Response.json({
    token,
    preview: {
      totalSteps: steps.length,
      totalBOMs: bomCounts.size,
      bomBreakdown: [...bomCounts.entries()].slice(0, 10).map(([bom, count]) => ({ bom, steps: count })),
      errors: errors.slice(0, 10),
      hasErrors: errors.length > 0
    }
  });
}

async function handleBOMStepsConfirm(request: Request): Promise<Response> {
  const body = await request.json() as { token: string };
  const preview = previewStore.get(body.token);

  if (!preview || preview.type !== 'bom-steps') {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  previewStore.delete(body.token);
  const steps = preview.data as ParsedBOMStep[];

  // Get existing lookup data
  const [workCatResult, equipResult, compResult] = await Promise.all([
    db.execute("SELECT id, name FROM work_categories"),
    db.execute("SELECT id, name FROM equipment"),
    db.execute("SELECT id, name FROM components")
  ]);

  const workCatIds = new Map((workCatResult.rows as any[]).map(r => [r.name.toLowerCase(), r.id]));
  const equipIds = new Map((equipResult.rows as any[]).map(r => [r.name.toLowerCase(), r.id]));
  const compIds = new Map((compResult.rows as any[]).map(r => [r.name.toLowerCase(), r.id]));

  let stepsCreated = 0;

  for (const step of steps) {
    await db.execute({
      sql: `INSERT INTO bom_steps (
        fishbowl_bom_id, fishbowl_bom_num, name, step_code, details,
        time_per_piece_seconds, sequence, work_category_id, equipment_id, component_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        step.fishbowl_bom_id,
        step.fishbowl_bom_num,
        step.name,
        step.step_code,
        step.details,
        step.time_per_piece_seconds,
        step.sequence,
        step.work_category ? workCatIds.get(step.work_category.toLowerCase()) || null : null,
        step.equipment ? equipIds.get(step.equipment.toLowerCase()) || null : null,
        step.component ? compIds.get(step.component.toLowerCase()) || null : null
      ]
    });
    stepsCreated++;
  }

  return Response.json({ success: true, created: { stepsCreated } });
}

// ============================================================
// Demand Import
// ============================================================

interface ParsedDemand {
  source: string;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  quantity: number;
  due_date: string;
  target_completion_date: string | null;
  priority: number | null;
  customer_name: string | null;
  notes: string | null;
  fishbowl_so_id: number | null;
  fishbowl_so_num: string | null;
}

async function handleDemandPreview(request: Request): Promise<Response> {
  let content: string;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { content?: string };
    if (!body.content) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }
    content = body.content;
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    content = await file.text();
  } else {
    return Response.json({ error: "Invalid content type" }, { status: 400 });
  }

  const rows = parseSpreadsheet(content);

  if (rows.length < 2) {
    return Response.json({ error: "File must have at least a header row and one data row" }, { status: 400 });
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);

  // Required columns
  const requiredCols = ['fishbowl_bom_id', 'fishbowl_bom_num', 'quantity', 'due_date'];
  const missingCols = requiredCols.filter(col => !headerRow.includes(col));

  if (missingCols.length > 0) {
    return Response.json({
      error: `Missing required columns: ${missingCols.join(', ')}`
    }, { status: 400 });
  }

  const getCol = (row: string[], col: string) => {
    const idx = headerRow.indexOf(col);
    return idx >= 0 ? row[idx]?.trim() || null : null;
  };

  const demands: ParsedDemand[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNum = i + 2;

    const bomId = parseInt(getCol(row, 'fishbowl_bom_id') || '');
    const bomNum = getCol(row, 'fishbowl_bom_num');
    const quantity = parseInt(getCol(row, 'quantity') || '');
    const dueDate = getCol(row, 'due_date');

    if (isNaN(bomId)) {
      errors.push(`Row ${rowNum}: Invalid fishbowl_bom_id`);
      continue;
    }
    if (!bomNum) {
      errors.push(`Row ${rowNum}: Missing fishbowl_bom_num`);
      continue;
    }
    if (isNaN(quantity) || quantity <= 0) {
      errors.push(`Row ${rowNum}: Invalid quantity`);
      continue;
    }
    if (!dueDate) {
      errors.push(`Row ${rowNum}: Missing due_date`);
      continue;
    }

    demands.push({
      source: getCol(row, 'source') || 'manual',
      fishbowl_bom_id: bomId,
      fishbowl_bom_num: bomNum,
      quantity,
      due_date: dueDate,
      target_completion_date: getCol(row, 'target_completion_date'),
      priority: getCol(row, 'priority') ? parseInt(getCol(row, 'priority')!) : null,
      customer_name: getCol(row, 'customer_name'),
      notes: getCol(row, 'notes'),
      fishbowl_so_id: getCol(row, 'fishbowl_so_id') ? parseInt(getCol(row, 'fishbowl_so_id')!) : null,
      fishbowl_so_num: getCol(row, 'fishbowl_so_num')
    });
  }

  const token = generateToken();
  previewStore.set(token, {
    type: 'demand',
    data: demands,
    validation: { valid: errors.length === 0, errors },
    createdAt: Date.now()
  });

  return Response.json({
    token,
    preview: {
      totalDemands: demands.length,
      totalQuantity: demands.reduce((sum, d) => sum + d.quantity, 0),
      customers: [...new Set(demands.map(d => d.customer_name).filter(Boolean))].slice(0, 5),
      errors: errors.slice(0, 10),
      hasErrors: errors.length > 0
    }
  });
}

async function handleDemandConfirm(request: Request): Promise<Response> {
  const body = await request.json() as { token: string };
  const preview = previewStore.get(body.token);

  if (!preview || preview.type !== 'demand') {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  previewStore.delete(body.token);
  const demands = preview.data as ParsedDemand[];

  let demandsCreated = 0;

  for (const demand of demands) {
    await db.execute({
      sql: `INSERT INTO demand_entries (
        source, fishbowl_bom_id, fishbowl_bom_num, quantity, due_date,
        target_completion_date, priority, customer_name, notes,
        fishbowl_so_id, fishbowl_so_num, status, quantity_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
      args: [
        demand.source,
        demand.fishbowl_bom_id,
        demand.fishbowl_bom_num,
        demand.quantity,
        demand.due_date,
        demand.target_completion_date || demand.due_date,
        demand.priority || 50,
        demand.customer_name,
        demand.notes,
        demand.fishbowl_so_id,
        demand.fishbowl_so_num
      ]
    });
    demandsCreated++;
  }

  return Response.json({ success: true, created: { demandsCreated } });
}

// ============================================================
// Production History Import
// ============================================================

interface ParsedProductionHistory {
  fishbowl_bom_id: number | null;
  fishbowl_bom_num: string;
  bom_step_id: number | null;
  step_name: string;
  worker_id: number | null;
  worker_name: string;
  date: string;
  start_time: string;
  end_time: string;
  units_produced: number;
  demand_entry_id: number | null;
}

async function handleProductionHistoryPreview(request: Request): Promise<Response> {
  let content: string;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { content?: string };
    if (!body.content) {
      return Response.json({ error: "No content provided" }, { status: 400 });
    }
    content = body.content;
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    content = await file.text();
  } else {
    return Response.json({ error: "Invalid content type" }, { status: 400 });
  }

  const rows = parseSpreadsheet(content);

  if (rows.length < 2) {
    return Response.json({ error: "File must have at least a header row and one data row" }, { status: 400 });
  }

  const headerRow = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const dataRows = rows.slice(1);

  // Required columns
  const requiredCols = ['fishbowl_bom_num', 'step_name', 'worker_name', 'date', 'start_time', 'end_time', 'units_produced'];
  const missingCols = requiredCols.filter(col => !headerRow.includes(col));

  if (missingCols.length > 0) {
    return Response.json({
      error: `Missing required columns: ${missingCols.join(', ')}`
    }, { status: 400 });
  }

  const getCol = (row: string[], col: string) => {
    const idx = headerRow.indexOf(col);
    return idx >= 0 ? row[idx]?.trim() || null : null;
  };

  const records: ParsedProductionHistory[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNum = i + 2;

    const bomNum = getCol(row, 'fishbowl_bom_num');
    const stepName = getCol(row, 'step_name');
    const workerName = getCol(row, 'worker_name');
    const date = getCol(row, 'date');
    const startTime = getCol(row, 'start_time');
    const endTime = getCol(row, 'end_time');
    const units = parseInt(getCol(row, 'units_produced') || '');

    if (!bomNum) {
      errors.push(`Row ${rowNum}: Missing fishbowl_bom_num`);
      continue;
    }
    if (!stepName) {
      errors.push(`Row ${rowNum}: Missing step_name`);
      continue;
    }
    if (!workerName) {
      errors.push(`Row ${rowNum}: Missing worker_name`);
      continue;
    }
    if (!date) {
      errors.push(`Row ${rowNum}: Missing date`);
      continue;
    }
    if (!startTime || !endTime) {
      errors.push(`Row ${rowNum}: Missing start_time or end_time`);
      continue;
    }
    if (isNaN(units) || units < 0) {
      errors.push(`Row ${rowNum}: Invalid units_produced`);
      continue;
    }

    records.push({
      fishbowl_bom_id: getCol(row, 'fishbowl_bom_id') ? parseInt(getCol(row, 'fishbowl_bom_id')!) : null,
      fishbowl_bom_num: bomNum,
      bom_step_id: getCol(row, 'bom_step_id') ? parseInt(getCol(row, 'bom_step_id')!) : null,
      step_name: stepName,
      worker_id: getCol(row, 'worker_id') ? parseInt(getCol(row, 'worker_id')!) : null,
      worker_name: workerName,
      date,
      start_time: startTime,
      end_time: endTime,
      units_produced: units,
      demand_entry_id: getCol(row, 'demand_entry_id') ? parseInt(getCol(row, 'demand_entry_id')!) : null
    });
  }

  const token = generateToken();
  previewStore.set(token, {
    type: 'production-history',
    data: records,
    validation: { valid: errors.length === 0, errors },
    createdAt: Date.now()
  });

  return Response.json({
    token,
    preview: {
      totalRecords: records.length,
      totalUnits: records.reduce((sum, r) => sum + r.units_produced, 0),
      uniqueWorkers: [...new Set(records.map(r => r.worker_name))].length,
      uniqueBOMs: [...new Set(records.map(r => r.fishbowl_bom_num))].length,
      dateRange: records.length > 0 ? {
        earliest: records.reduce((min, r) => r.date < min ? r.date : min, records[0]!.date),
        latest: records.reduce((max, r) => r.date > max ? r.date : max, records[0]!.date)
      } : null,
      errors: errors.slice(0, 10),
      hasErrors: errors.length > 0
    }
  });
}

async function handleProductionHistoryConfirm(request: Request): Promise<Response> {
  const body = await request.json() as { token: string };
  const preview = previewStore.get(body.token);

  if (!preview || preview.type !== 'production-history') {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  previewStore.delete(body.token);
  const records = preview.data as ParsedProductionHistory[];

  // Get lookups for IDs
  const [workersResult, stepsResult] = await Promise.all([
    db.execute("SELECT id, name FROM workers"),
    db.execute("SELECT id, name, fishbowl_bom_id, time_per_piece_seconds FROM bom_steps")
  ]);

  const workerIds = new Map((workersResult.rows as any[]).map(r => [r.name.toLowerCase(), r.id]));
  const stepsByName = new Map((stepsResult.rows as any[]).map(r => [
    `${r.name.toLowerCase()}`,
    { id: r.id, bomId: r.fishbowl_bom_id, timePerPiece: r.time_per_piece_seconds }
  ]));

  let recordsCreated = 0;

  for (const record of records) {
    // Calculate actual seconds from start/end time
    const startParts = record.start_time.split(':').map(Number);
    const endParts = record.end_time.split(':').map(Number);
    const startMinutes = (startParts[0] || 0) * 60 + (startParts[1] || 0);
    const endMinutes = (endParts[0] || 0) * 60 + (endParts[1] || 0);
    const actualSeconds = (endMinutes - startMinutes) * 60;

    // Try to find step info
    const stepInfo = stepsByName.get(record.step_name.toLowerCase());
    const expectedSeconds = stepInfo ? stepInfo.timePerPiece * record.units_produced : 0;
    const efficiencyPercent = actualSeconds > 0 ? (expectedSeconds / actualSeconds) * 100 : 0;

    // Try to find worker ID
    const workerId = record.worker_id || workerIds.get(record.worker_name.toLowerCase()) || null;

    await db.execute({
      sql: `INSERT INTO production_history (
        demand_entry_id, fishbowl_bom_id, fishbowl_bom_num,
        bom_step_id, step_name, worker_id, worker_name,
        date, start_time, end_time, units_produced, planned_units,
        actual_seconds, expected_seconds, efficiency_percent,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      args: [
        record.demand_entry_id,
        record.fishbowl_bom_id || (stepInfo?.bomId || null),
        record.fishbowl_bom_num,
        record.bom_step_id || (stepInfo?.id || null),
        record.step_name,
        workerId,
        record.worker_name,
        record.date,
        record.start_time,
        record.end_time,
        record.units_produced,
        record.units_produced, // planned = actual for imports
        actualSeconds,
        expectedSeconds,
        efficiencyPercent
      ]
    });
    recordsCreated++;
  }

  return Response.json({ success: true, created: { recordsCreated } });
}

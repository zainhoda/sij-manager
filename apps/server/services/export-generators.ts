/**
 * Export generators for CSV exports that match import formats
 */
import { db } from "../db";

// CSV utility functions

/**
 * Escape a field for CSV format
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double internal quotes
 */
function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of fields to a CSV row
 */
function toCSVRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCSVField).join(",");
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  // Handle ISO datetime strings
  if (dateStr.includes("T")) {
    return dateStr.split("T")[0]!;
  }
  return dateStr;
}

/**
 * Format time to HH:MM:SS from ISO datetime or time string
 */
function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  // Handle ISO datetime strings like "2025-01-05T07:00:00"
  if (timeStr.includes("T")) {
    const timePart = timeStr.split("T")[1];
    if (timePart) {
      // Take just HH:MM:SS, strip any timezone info
      return timePart.split(/[Z+-]/)[0]!.substring(0, 8);
    }
  }
  // Already a time string
  return timeStr;
}

/**
 * Generate Equipment-Worker Matrix CSV
 *
 * Format:
 * equipment_code,work_category,work_type,station_count,hourly_cost,Worker1,Worker2,...
 * _COST,,,0,0,25.50,22.00,...
 * STS,SEWING,Single Needle,3,5.00,Y,Y,...
 */
export async function generateEquipmentMatrixCSV(): Promise<string> {
  // Get all workers ordered by name
  const workersResult = await db.execute(`
    SELECT id, name, cost_per_hour
    FROM workers
    ORDER BY name
  `);
  const workers = workersResult.rows as unknown as { id: number; name: string; cost_per_hour: number }[];

  // Get all equipment with work category
  const equipmentResult = await db.execute(`
    SELECT e.id, e.name, e.description, e.station_count, e.hourly_cost, wc.name as work_category
    FROM equipment e
    LEFT JOIN work_categories wc ON e.work_category_id = wc.id
    ORDER BY wc.name, e.name
  `);
  const equipment = equipmentResult.rows as unknown as {
    id: number;
    name: string;
    description: string | null;
    station_count: number | null;
    hourly_cost: number;
    work_category: string | null;
  }[];

  // Get all certifications
  const certsResult = await db.execute(`
    SELECT worker_id, equipment_id
    FROM equipment_certifications
  `);
  const certifications = certsResult.rows as unknown as { worker_id: number; equipment_id: number }[];

  // Build certification lookup: Map<equipmentId, Set<workerId>>
  const certLookup = new Map<number, Set<number>>();
  for (const cert of certifications) {
    if (!certLookup.has(cert.equipment_id)) {
      certLookup.set(cert.equipment_id, new Set());
    }
    certLookup.get(cert.equipment_id)!.add(cert.worker_id);
  }

  const lines: string[] = [];

  // Header row: fixed columns + worker names
  const headerFields = ["equipment_code", "work_category", "work_type", "station_count", "hourly_cost"];
  for (const worker of workers) {
    headerFields.push(worker.name);
  }
  lines.push(toCSVRow(headerFields));

  // _COST row for worker hourly costs
  const costFields: (string | number)[] = ["_COST", "", "", 0, 0];
  for (const worker of workers) {
    costFields.push(worker.cost_per_hour || 0);
  }
  lines.push(toCSVRow(costFields));

  // Equipment rows
  for (const equip of equipment) {
    const equipCerts = certLookup.get(equip.id) || new Set();
    // station_count: null in DB means virtual equipment (100 in import)
    const stationCount = equip.station_count === null ? 100 : equip.station_count;

    const rowFields: (string | number)[] = [
      equip.name,
      equip.work_category || "",
      equip.description || "",
      stationCount,
      equip.hourly_cost || 0,
    ];

    // Add Y/N for each worker certification
    for (const worker of workers) {
      rowFields.push(equipCerts.has(worker.id) ? "Y" : "");
    }

    lines.push(toCSVRow(rowFields));
  }

  return lines.join("\n");
}

/**
 * Generate BOMs CSV (replaces old Products CSV)
 *
 * Format:
 * bom_num,config_name,version_number,is_default,step_code,category,component,task_name,time_seconds,equipment_code,dependencies
 */
export async function generateProductsCSV(): Promise<string> {
  // Get all BOM step configurations
  const configsResult = await db.execute(`
    SELECT
      bsc.id as config_id,
      bsc.fishbowl_bom_id,
      bsc.fishbowl_bom_num as bom_num,
      bsc.config_name,
      bsc.version_number,
      bsc.is_default
    FROM bom_step_configurations bsc
    ORDER BY bsc.fishbowl_bom_num, bsc.version_number
  `);
  const configs = configsResult.rows as unknown as {
    config_id: number;
    fishbowl_bom_id: number;
    bom_num: string;
    config_name: string;
    version_number: number;
    is_default: number;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow([
    "bom_num", "config_name", "version_number", "is_default",
    "step_code", "category", "component", "task_name",
    "time_seconds", "equipment_code", "dependencies"
  ]));

  // Process each configuration
  for (const config of configs) {
    // Get steps for this config via bom_config_steps
    const stepsResult = await db.execute({
      sql: `
        SELECT
          bs.id as step_id,
          bs.step_code,
          bs.name as task_name,
          wc.name as category,
          bs.time_per_piece_seconds,
          c.name as component_name,
          e.name as equipment_code,
          bcs.sequence
        FROM bom_config_steps bcs
        JOIN bom_steps bs ON bcs.bom_step_id = bs.id
        LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
        LEFT JOIN components c ON bs.component_id = c.id
        LEFT JOIN equipment e ON bs.equipment_id = e.id
        WHERE bcs.config_id = ?
        ORDER BY bcs.sequence
      `,
      args: [config.config_id]
    });
    const steps = stepsResult.rows as unknown as {
      step_id: number;
      step_code: string | null;
      task_name: string;
      category: string | null;
      time_per_piece_seconds: number;
      component_name: string | null;
      equipment_code: string | null;
      sequence: number;
    }[];

    // Get all dependencies for steps in this config
    const stepIds = steps.map(s => s.step_id);
    let dependenciesMap = new Map<number, { step_code: string; type: string }[]>();

    if (stepIds.length > 0) {
      const placeholders = stepIds.map(() => "?").join(",");
      const depsResult = await db.execute({
        sql: `
          SELECT sd.step_id, sd.dependency_type, bs.step_code
          FROM bom_step_dependencies sd
          JOIN bom_steps bs ON sd.depends_on_step_id = bs.id
          WHERE sd.step_id IN (${placeholders})
        `,
        args: stepIds
      });
      const deps = depsResult.rows as unknown as { step_id: number; dependency_type: string; step_code: string | null }[];

      for (const dep of deps) {
        if (!dependenciesMap.has(dep.step_id)) {
          dependenciesMap.set(dep.step_id, []);
        }
        dependenciesMap.get(dep.step_id)!.push({
          step_code: dep.step_code || "",
          type: dep.dependency_type
        });
      }
    }

    // Output each step as a row
    for (const step of steps) {
      const deps = dependenciesMap.get(step.step_id) || [];
      const depsStr = deps.map(d =>
        d.type === "start" ? `${d.step_code}:start` : d.step_code
      ).join(",");

      lines.push(toCSVRow([
        config.bom_num,
        config.config_name,
        config.version_number,
        config.is_default ? "Y" : "",
        step.step_code || "",
        step.category || "",
        step.component_name || "",
        step.task_name,
        step.time_per_piece_seconds,
        step.equipment_code || "",
        depsStr
      ]));
    }
  }

  return lines.join("\n");
}

/**
 * Generate Demand Entries CSV (replaces old Orders CSV)
 *
 * Format:
 * bom_num,quantity,due_date,status,source,customer_name
 */
export async function generateOrdersCSV(): Promise<string> {
  const entriesResult = await db.execute(`
    SELECT
      fishbowl_bom_num,
      quantity,
      due_date,
      status,
      source,
      customer_name
    FROM demand_entries
    ORDER BY due_date, fishbowl_bom_num
  `);
  const entries = entriesResult.rows as unknown as {
    fishbowl_bom_num: string;
    quantity: number;
    due_date: string;
    status: string;
    source: string;
    customer_name: string | null;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow(["bom_num", "quantity", "due_date", "status", "source", "customer_name"]));

  // Demand entries
  for (const entry of entries) {
    lines.push(toCSVRow([
      entry.fishbowl_bom_num,
      entry.quantity,
      formatDate(entry.due_date),
      entry.status || "pending",
      entry.source,
      entry.customer_name || ""
    ]));
  }

  return lines.join("\n");
}

/**
 * Generate Production History CSV
 *
 * Format:
 * bom_num,step_name,worker_name,work_date,start_time,end_time,units_produced,actual_seconds,efficiency_percent
 */
export async function generateProductionHistoryCSV(): Promise<string> {
  const result = await db.execute(`
    SELECT
      fishbowl_bom_num,
      step_name,
      worker_name,
      date as work_date,
      start_time,
      end_time,
      units_produced,
      actual_seconds,
      efficiency_percent
    FROM production_history
    WHERE units_produced > 0
    ORDER BY date, start_time
  `);
  const rows = result.rows as unknown as {
    fishbowl_bom_num: string;
    step_name: string;
    worker_name: string;
    work_date: string;
    start_time: string;
    end_time: string;
    units_produced: number;
    actual_seconds: number;
    efficiency_percent: number | null;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow([
    "bom_num", "step_name", "worker_name",
    "work_date", "start_time", "end_time", "units_produced", "actual_seconds", "efficiency_percent"
  ]));

  // Data rows
  for (const row of rows) {
    lines.push(toCSVRow([
      row.fishbowl_bom_num,
      row.step_name,
      row.worker_name,
      formatDate(row.work_date),
      formatTime(row.start_time),
      formatTime(row.end_time),
      row.units_produced,
      row.actual_seconds,
      row.efficiency_percent ?? ""
    ]));
  }

  return lines.join("\n");
}

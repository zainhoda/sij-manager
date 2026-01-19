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
 * Generate Products CSV
 *
 * Format:
 * product_name,version_name,version_number,is_default,step_code,external_id,category,component,task_name,time_seconds,equipment_code,dependencies
 */
export async function generateProductsCSV(): Promise<string> {
  // Get all products with their build versions
  const versionsResult = await db.execute(`
    SELECT
      p.id as product_id,
      p.name as product_name,
      bv.id as version_id,
      bv.version_name,
      bv.version_number,
      bv.is_default
    FROM products p
    JOIN product_build_versions bv ON bv.product_id = p.id
    ORDER BY p.name, bv.version_number
  `);
  const versions = versionsResult.rows as unknown as {
    product_id: number;
    product_name: string;
    version_id: number;
    version_name: string;
    version_number: number;
    is_default: number;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow([
    "product_name", "version_name", "version_number", "is_default",
    "step_code", "external_id", "category", "component", "task_name",
    "time_seconds", "equipment_code", "dependencies"
  ]));

  // Process each version
  for (const version of versions) {
    // Get steps for this version via build_version_steps
    const stepsResult = await db.execute({
      sql: `
        SELECT
          ps.id as step_id,
          ps.step_code,
          ps.name as task_name,
          ps.category,
          ps.time_per_piece_seconds,
          c.name as component_name,
          e.name as equipment_code,
          bvs.sequence
        FROM build_version_steps bvs
        JOIN product_steps ps ON bvs.product_step_id = ps.id
        LEFT JOIN components c ON ps.component_id = c.id
        LEFT JOIN equipment e ON ps.equipment_id = e.id
        WHERE bvs.build_version_id = ?
        ORDER BY bvs.sequence
      `,
      args: [version.version_id]
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

    // Get all dependencies for steps in this version
    const stepIds = steps.map(s => s.step_id);
    let dependenciesMap = new Map<number, { step_code: string; type: string }[]>();

    if (stepIds.length > 0) {
      const placeholders = stepIds.map(() => "?").join(",");
      const depsResult = await db.execute({
        sql: `
          SELECT sd.step_id, sd.dependency_type, ps.step_code
          FROM step_dependencies sd
          JOIN product_steps ps ON sd.depends_on_step_id = ps.id
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
      // Format dependencies: "STEP_CODE" for finish type, "STEP_CODE:start" for start type
      const depsStr = deps.map(d =>
        d.type === "start" ? `${d.step_code}:start` : d.step_code
      ).join(",");

      lines.push(toCSVRow([
        version.product_name,
        version.version_name,
        version.version_number,
        version.is_default ? "Y" : "",
        step.step_code || "",
        "", // external_id - not stored in schema
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
 * Generate Orders CSV
 *
 * Format:
 * product_name,quantity,due_date,status
 */
export async function generateOrdersCSV(): Promise<string> {
  const ordersResult = await db.execute(`
    SELECT o.quantity, o.due_date, o.status, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    ORDER BY o.due_date, p.name
  `);
  const orders = ordersResult.rows as unknown as {
    quantity: number;
    due_date: string;
    status: string;
    product_name: string;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow(["product_name", "quantity", "due_date", "status"]));

  // Orders
  for (const order of orders) {
    lines.push(toCSVRow([
      order.product_name,
      order.quantity,
      formatDate(order.due_date),
      order.status || "pending"
    ]));
  }

  return lines.join("\n");
}

/**
 * Generate Production History V2 CSV
 *
 * Format:
 * product_name,due_date,version_name,step_code,worker_name,work_date,start_time,end_time,units_produced
 */
export async function generateProductionHistoryCSV(): Promise<string> {
  const result = await db.execute(`
    SELECT
      p.name as product_name,
      o.due_date,
      bv.version_name,
      ps.step_code,
      w.name as worker_name,
      se.date as work_date,
      twa.actual_start_time,
      twa.actual_end_time,
      twa.actual_output as units_produced
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN schedules s ON se.schedule_id = s.id
    JOIN orders o ON s.order_id = o.id
    JOIN products p ON o.product_id = p.id
    JOIN product_build_versions bv ON s.build_version_id = bv.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    JOIN workers w ON twa.worker_id = w.id
    WHERE twa.actual_output > 0
      AND twa.actual_start_time IS NOT NULL
      AND twa.actual_end_time IS NOT NULL
    ORDER BY se.date, twa.actual_start_time
  `);
  const rows = result.rows as unknown as {
    product_name: string;
    due_date: string;
    version_name: string;
    step_code: string | null;
    worker_name: string;
    work_date: string;
    actual_start_time: string;
    actual_end_time: string;
    units_produced: number;
  }[];

  const lines: string[] = [];

  // Header
  lines.push(toCSVRow([
    "product_name", "due_date", "version_name", "step_code", "worker_name",
    "work_date", "start_time", "end_time", "units_produced"
  ]));

  // Data rows
  for (const row of rows) {
    lines.push(toCSVRow([
      row.product_name,
      formatDate(row.due_date),
      row.version_name,
      row.step_code || "",
      row.worker_name,
      formatDate(row.work_date),
      formatTime(row.actual_start_time),
      formatTime(row.actual_end_time),
      row.units_produced
    ]));
  }

  return lines.join("\n");
}

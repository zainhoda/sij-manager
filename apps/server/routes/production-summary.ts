import { db } from "../db";

interface DailyBreakdown {
  date: string;
  units: number;
  tasks: number;
  workers: string[];
  hours: number;
  laborCost: number;
  equipmentCost: number;
  cost: number;
  plannedUnits: number;
  efficiency: number;
}

interface ProductSummary {
  productId: number;
  productName: string;
  totalUnits: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  plannedUnits: number;
  efficiency: number;
}

interface OrderSummary {
  orderId: number;
  productName: string;
  orderQuantity: number;
  unitsComplete: number;
  unitsInProgress: number;
  unitsNotStarted: number;
  progressPercent: number;
  tasksCompleted: number;
  totalHours: number;
  estimatedHoursRemaining: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
}

interface StepSummary {
  stepId: number;
  stepName: string;
  productName: string;
  sequence: number;
  totalUnits: number;
  tasksCompleted: number;
  workerCount: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  efficiency: number;
}

interface Filters {
  startDate: string | null;
  endDate: string | null;
  productIds: number[];
  orderIds: number[];
  workerIds: number[];
  stepIds: number[];
}

function parseFilters(url: URL): Filters {
  const date = url.searchParams.get("date");
  let startDate = url.searchParams.get("start_date");
  let endDate = url.searchParams.get("end_date");

  // If single date provided, use it for both start and end
  if (date && !startDate && !endDate) {
    startDate = date;
    endDate = date;
  }

  // Parse array filters (comma-separated)
  const parseIds = (param: string | null): number[] => {
    if (!param) return [];
    return param.split(",").map(Number).filter(n => !isNaN(n));
  };

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    productIds: parseIds(url.searchParams.get("product_ids")),
    orderIds: parseIds(url.searchParams.get("order_ids")),
    workerIds: parseIds(url.searchParams.get("worker_ids")),
    stepIds: parseIds(url.searchParams.get("step_ids")),
  };
}

function buildFilterClause(filters: Filters, tableAliases: { se?: string; twa?: string; ps?: string; o?: string; p?: string } = {}): { clause: string; args: (string | number | null)[] } {
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  const se = tableAliases.se || "se";
  const twa = tableAliases.twa || "twa";
  const ps = tableAliases.ps || "ps";
  const o = tableAliases.o || "o";
  const p = tableAliases.p || "p";

  if (filters.startDate && filters.endDate) {
    conditions.push(`${se}.date BETWEEN ? AND ?`);
    args.push(filters.startDate, filters.endDate);
  }

  if (filters.productIds.length > 0) {
    conditions.push(`${p}.id IN (${filters.productIds.map(() => "?").join(",")})`);
    args.push(...filters.productIds);
  }

  if (filters.orderIds.length > 0) {
    conditions.push(`${o}.id IN (${filters.orderIds.map(() => "?").join(",")})`);
    args.push(...filters.orderIds);
  }

  if (filters.workerIds.length > 0) {
    conditions.push(`${twa}.worker_id IN (${filters.workerIds.map(() => "?").join(",")})`);
    args.push(...filters.workerIds);
  }

  if (filters.stepIds.length > 0) {
    conditions.push(`${ps}.id IN (${filters.stepIds.map(() => "?").join(",")})`);
    args.push(...filters.stepIds);
  }

  return {
    clause: conditions.length > 0 ? conditions.join(" AND ") : "1=1",
    args,
  };
}

export async function handleProductionSummary(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/production-summary
  if (url.pathname === "/api/production-summary" && request.method === "GET") {
    const groupBy = url.searchParams.get("group_by") || "overall";
    const filters = parseFilters(url);

    switch (groupBy) {
      case "overall":
        return getOverallSummary(filters);
      case "day":
        return getDaySummary(filters);
      case "worker":
        return getWorkerSummary(filters);
      case "product":
        return getProductSummary(filters);
      case "order":
        return getOrderSummary(filters);
      case "step":
        return getStepSummary(filters);
      default:
        return Response.json({ error: "Invalid group_by value" }, { status: 400 });
    }
  }

  return null;
}

async function getOverallSummary(filters: Filters): Promise<Response> {
  // Build filter clause - need to join through schedules and orders to filter by product/order
  const needsOrderJoin = filters.productIds.length > 0 || filters.orderIds.length > 0;
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  // Get daily breakdown with workers aggregated
  const dailyResult = await db.execute({
    sql: `
      SELECT
        se.date,
        COALESCE(SUM(twa.actual_output), 0) as units_produced,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as hours_worked,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_output > 0
          THEN ps.time_per_piece_seconds * twa.actual_output / 3600.0
          ELSE 0 END
        ), 0) as expected_hours
      FROM schedule_entries se
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      ${needsOrderJoin ? `
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ` : ""}
      WHERE ${filterClause}
      GROUP BY se.date
      ORDER BY se.date DESC
    `,
    args: filterArgs
  });

  // Get workers per day
  const workersResult = await db.execute({
    sql: `
      SELECT DISTINCT
        se.date,
        w.name as worker_name
      FROM schedule_entries se
      JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      ${needsOrderJoin ? `
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ` : ""}
      WHERE twa.status IN ('in_progress', 'completed') AND ${filterClause}
      ORDER BY se.date DESC, w.name
    `,
    args: filterArgs
  });

  // Group workers by date
  const workersByDate: Record<string, string[]> = {};
  for (const row of workersResult.rows) {
    const r = row as unknown as { date: string; worker_name: string };
    if (!workersByDate[r.date]) {
      workersByDate[r.date] = [];
    }
    workersByDate[r.date]!.push(r.worker_name);
  }

  // Build daily breakdown
  const dailyBreakdown: DailyBreakdown[] = (dailyResult.rows as unknown as {
    date: string;
    units_produced: number;
    tasks_completed: number;
    hours_worked: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    date: row.date,
    units: row.units_produced,
    tasks: row.tasks_completed,
    workers: workersByDate[row.date] || [],
    hours: Math.round(row.hours_worked * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    cost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    plannedUnits: 0, // Deprecated - keeping for interface compatibility
    // Efficiency = expected_time / actual_time * 100 (higher = faster than expected)
    efficiency: row.hours_worked > 0 ? Math.round((row.expected_hours / row.hours_worked) * 100) : 0
  }));

  // Calculate totals
  const totals = dailyBreakdown.reduce((acc, day) => ({
    totalUnits: acc.totalUnits + day.units,
    tasksCompleted: acc.tasksCompleted + day.tasks,
    totalHoursWorked: acc.totalHoursWorked + day.hours,
    laborCost: acc.laborCost + day.laborCost,
    equipmentCost: acc.equipmentCost + day.equipmentCost,
    totalCost: acc.totalCost + day.cost,
    plannedUnits: acc.plannedUnits + day.plannedUnits
  }), {
    totalUnits: 0,
    tasksCompleted: 0,
    totalHoursWorked: 0,
    laborCost: 0,
    equipmentCost: 0,
    totalCost: 0,
    plannedUnits: 0
  });

  // Get unique workers for period
  const allWorkers = [...new Set(dailyBreakdown.flatMap(d => d.workers))];

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    summary: {
      totalUnits: totals.totalUnits,
      tasksCompleted: totals.tasksCompleted,
      workersActive: allWorkers.length,
      totalHoursWorked: Math.round(totals.totalHoursWorked * 100) / 100,
      laborCost: Math.round(totals.laborCost * 100) / 100,
      equipmentCost: Math.round(totals.equipmentCost * 100) / 100,
      totalCost: Math.round(totals.totalCost * 100) / 100,
      avgEfficiency: totals.plannedUnits > 0 ? Math.round((totals.totalUnits / totals.plannedUnits) * 100) : 0
    },
    dailyBreakdown
  });
}

async function getDaySummary(filters: Filters): Promise<Response> {
  const needsOrderJoin = filters.productIds.length > 0 || filters.orderIds.length > 0;
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        se.date,
        COALESCE(SUM(twa.actual_output), 0) as units_produced,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COUNT(DISTINCT twa.worker_id) as worker_count,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as hours_worked,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_output > 0
          THEN ps.time_per_piece_seconds * twa.actual_output / 3600.0
          ELSE 0 END
        ), 0) as expected_hours
      FROM schedule_entries se
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      ${needsOrderJoin ? `
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ` : ""}
      WHERE ${filterClause}
      GROUP BY se.date
      ORDER BY se.date DESC
    `,
    args: filterArgs
  });

  const days = (result.rows as unknown as {
    date: string;
    units_produced: number;
    tasks_completed: number;
    worker_count: number;
    hours_worked: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    date: row.date,
    units: row.units_produced,
    tasks: row.tasks_completed,
    workerCount: row.worker_count,
    hours: Math.round(row.hours_worked * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    plannedUnits: 0,
    efficiency: row.hours_worked > 0 ? Math.round((row.expected_hours / row.hours_worked) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    days
  });
}

async function getWorkerSummary(filters: Filters): Promise<Response> {
  const needsOrderJoin = filters.productIds.length > 0 || filters.orderIds.length > 0;
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        w.id as worker_id,
        w.name as worker_name,
        COALESCE(SUM(twa.actual_output), 0) as total_units,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_output > 0
          THEN ps.time_per_piece_seconds * twa.actual_output / 3600.0
          ELSE 0 END
        ), 0) as expected_hours
      FROM schedule_entries se
      JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      ${needsOrderJoin ? `
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ` : ""}
      WHERE ${filterClause}
      GROUP BY w.id, w.name
      ORDER BY total_units DESC
    `,
    args: filterArgs
  });

  const workers = (result.rows as unknown as {
    worker_id: number;
    worker_name: string;
    total_units: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    workerId: row.worker_id,
    workerName: row.worker_name,
    totalUnits: row.total_units,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    avgEfficiency: row.total_hours > 0 ? Math.round((row.expected_hours / row.total_hours) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    workers
  });
}

async function getProductSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        p.id as product_id,
        p.name as product_name,
        COALESCE(SUM(twa.actual_output), 0) as total_units,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_output > 0
          THEN ps.time_per_piece_seconds * twa.actual_output / 3600.0
          ELSE 0 END
        ), 0) as expected_hours
      FROM schedule_entries se
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE ${filterClause}
      GROUP BY p.id, p.name
      ORDER BY total_units DESC
    `,
    args: filterArgs
  });

  const products: ProductSummary[] = (result.rows as unknown as {
    product_id: number;
    product_name: string;
    total_units: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    totalUnits: row.total_units,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    plannedUnits: 0, // Deprecated
    efficiency: row.total_hours > 0 ? Math.round((row.expected_hours / row.total_hours) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    products
  });
}

async function getOrderSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  // First, get the absolute last step sequence and total estimated time for each order's build version
  const stepsResult = await db.execute(`
    SELECT
      o.id as order_id,
      o.quantity as order_quantity,
      s.build_version_id,
      MAX(bvs.sequence) as last_step_seq,
      SUM(ps.time_per_piece_seconds) as total_time_per_unit_seconds
    FROM orders o
    JOIN schedules s ON s.order_id = o.id
    JOIN build_version_steps bvs ON bvs.build_version_id = s.build_version_id
    JOIN product_steps ps ON bvs.product_step_id = ps.id
    GROUP BY o.id, s.build_version_id
  `);

  const orderMeta = new Map<number, { lastSeq: number; totalEstimatedHours: number }>();
  for (const row of stepsResult.rows as unknown as {
    order_id: number;
    order_quantity: number;
    last_step_seq: number;
    total_time_per_unit_seconds: number;
  }[]) {
    // Total estimated = (sum of all step times per unit) × quantity, converted to hours
    const totalEstimatedHours = (row.total_time_per_unit_seconds * row.order_quantity) / 3600;
    orderMeta.set(row.order_id, {
      lastSeq: row.last_step_seq,
      totalEstimatedHours
    });
  }

  // Get per-step output for each order, grouped by step sequence
  const result = await db.execute({
    sql: `
      SELECT
        o.id as order_id,
        p.name as product_name,
        o.quantity as order_quantity,
        bvs.sequence as step_sequence,
        COALESCE(SUM(twa.actual_output), 0) as step_output,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost
      FROM schedule_entries se
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      JOIN build_version_steps bvs ON bvs.product_step_id = se.product_step_id
        AND bvs.build_version_id = s.build_version_id
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE ${filterClause}
      GROUP BY o.id, p.name, o.quantity, bvs.sequence
      ORDER BY o.id, bvs.sequence
    `,
    args: filterArgs
  });

  // Group rows by order_id and calculate metrics
  const orderMap = new Map<number, {
    productName: string;
    orderQuantity: number;
    stepOutputs: Map<number, number>; // sequence -> output
    tasksCompleted: number;
    totalHours: number;
    laborCost: number;
    equipmentCost: number;
  }>();

  for (const row of result.rows as unknown as {
    order_id: number;
    product_name: string;
    order_quantity: number;
    step_sequence: number;
    step_output: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
  }[]) {
    if (!orderMap.has(row.order_id)) {
      orderMap.set(row.order_id, {
        productName: row.product_name,
        orderQuantity: row.order_quantity,
        stepOutputs: new Map(),
        tasksCompleted: 0,
        totalHours: 0,
        laborCost: 0,
        equipmentCost: 0,
      });
    }
    const order = orderMap.get(row.order_id)!;
    order.stepOutputs.set(row.step_sequence, row.step_output);
    order.tasksCompleted += row.tasks_completed;
    order.totalHours += row.total_hours;
    order.laborCost += row.labor_cost;
    order.equipmentCost += row.equipment_cost;
  }

  // Convert to OrderSummary array with proper completion metrics
  const orders: OrderSummary[] = [];
  for (const [orderId, data] of orderMap) {
    const meta = orderMeta.get(orderId);
    const lastSeq = meta?.lastSeq ?? 1;
    const totalEstimatedHours = meta?.totalEstimatedHours ?? 0;

    // Get sequences that have data, sorted
    const sequencesWithData = [...data.stepOutputs.keys()].sort((a, b) => a - b);

    // Started = first step that has production data (not absolute first, since some steps like "Cut Fabric" aren't tracked)
    const firstStepOutput = sequencesWithData.length > 0 ? (data.stepOutputs.get(sequencesWithData[0]!) ?? 0) : 0;

    // Complete = absolute last step (must finish all steps to be complete)
    const lastStepOutput = data.stepOutputs.get(lastSeq) ?? 0;

    const unitsComplete = lastStepOutput;
    const unitsStarted = firstStepOutput;
    const unitsInProgress = Math.max(0, unitsStarted - unitsComplete);
    const unitsNotStarted = Math.max(0, data.orderQuantity - unitsStarted);

    // Progress based on hours: worked vs total estimated
    const estimatedHoursRemaining = Math.max(0, totalEstimatedHours - data.totalHours);
    const progressPercent = totalEstimatedHours > 0
      ? Math.round((data.totalHours / totalEstimatedHours) * 100)
      : 0;

    orders.push({
      orderId,
      productName: data.productName,
      orderQuantity: data.orderQuantity,
      unitsComplete,
      unitsInProgress,
      unitsNotStarted,
      progressPercent,
      tasksCompleted: data.tasksCompleted,
      totalHours: Math.round(data.totalHours * 100) / 100,
      estimatedHoursRemaining: Math.round(estimatedHoursRemaining * 100) / 100,
      laborCost: Math.round(data.laborCost * 100) / 100,
      equipmentCost: Math.round(data.equipmentCost * 100) / 100,
      totalCost: Math.round((data.laborCost + data.equipmentCost) * 100) / 100,
    });
  }

  // Sort by progress (incomplete first)
  orders.sort((a, b) => a.progressPercent - b.progressPercent);

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    orders
  });
}

async function getStepSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ps.id as step_id,
        ps.name as step_name,
        p.name as product_name,
        ps.sequence,
        COALESCE(SUM(twa.actual_output), 0) as total_units,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COUNT(DISTINCT twa.worker_id) as worker_count,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN ((julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END) * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_output > 0
          THEN ps.time_per_piece_seconds * twa.actual_output / 3600.0
          ELSE 0 END
        ), 0) as expected_hours
      FROM schedule_entries se
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE ${filterClause}
      GROUP BY ps.id, ps.name, p.name, ps.sequence
      ORDER BY p.name, ps.sequence
    `,
    args: filterArgs
  });

  const steps: StepSummary[] = (result.rows as unknown as {
    step_id: number;
    step_name: string;
    product_name: string;
    sequence: number;
    total_units: number;
    tasks_completed: number;
    worker_count: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    stepId: row.step_id,
    stepName: row.step_name,
    productName: row.product_name,
    sequence: row.sequence,
    totalUnits: row.total_units,
    tasksCompleted: row.tasks_completed,
    workerCount: row.worker_count,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    efficiency: row.total_hours > 0 ? Math.round((row.expected_hours / row.total_hours) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    steps
  });
}

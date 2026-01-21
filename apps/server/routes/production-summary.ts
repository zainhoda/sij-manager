/**
 * Production Summary API - Analytics & Reporting
 * Uses NEW schema: production_history, demand_entries, bom_steps, worker_step_performance
 */
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
  efficiency: number;
}

interface WorkerSummary {
  workerId: number;
  workerName: string;
  totalUnits: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  avgEfficiency: number;
}

interface BOMSummary {
  fishbowlBomId: number;
  fishbowlBomNum: string;
  totalUnits: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  efficiency: number;
}

interface DemandSummary {
  demandId: number;
  fishbowlBomNum: string;
  customerName: string | null;
  demandQuantity: number;
  quantityCompleted: number;
  progressPercent: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
}

interface StepSummary {
  bomStepId: number;
  stepName: string;
  fishbowlBomNum: string;
  totalUnits: number;
  tasksCompleted: number;
  workerCount: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  efficiency: number;
  estimatedSecondsPerPiece: number;
  actualSecondsPerPiece: number | null;
  topPerformers: { workerId: number; workerName: string; output: number; efficiency: number }[];
}

interface Filters {
  startDate: string | null;
  endDate: string | null;
  bomIds: number[];
  demandIds: number[];
  workerIds: number[];
  stepIds: number[];
}

function parseFilters(url: URL): Filters {
  const date = url.searchParams.get("date");
  let startDate = url.searchParams.get("start_date");
  let endDate = url.searchParams.get("end_date");

  if (date && !startDate && !endDate) {
    startDate = date;
    endDate = date;
  }

  const parseIds = (param: string | null): number[] => {
    if (!param) return [];
    return param.split(",").map(Number).filter(n => !isNaN(n));
  };

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    bomIds: parseIds(url.searchParams.get("bom_ids")),
    demandIds: parseIds(url.searchParams.get("demand_ids")),
    workerIds: parseIds(url.searchParams.get("worker_ids")),
    stepIds: parseIds(url.searchParams.get("step_ids")),
  };
}

function buildFilterClause(filters: Filters): { clause: string; args: (string | number)[] } {
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (filters.startDate && filters.endDate) {
    conditions.push("ph.date BETWEEN ? AND ?");
    args.push(filters.startDate, filters.endDate);
  }

  if (filters.bomIds.length > 0) {
    conditions.push(`ph.fishbowl_bom_id IN (${filters.bomIds.map(() => "?").join(",")})`);
    args.push(...filters.bomIds);
  }

  if (filters.demandIds.length > 0) {
    conditions.push(`ph.demand_entry_id IN (${filters.demandIds.map(() => "?").join(",")})`);
    args.push(...filters.demandIds);
  }

  if (filters.workerIds.length > 0) {
    conditions.push(`ph.worker_id IN (${filters.workerIds.map(() => "?").join(",")})`);
    args.push(...filters.workerIds);
  }

  if (filters.stepIds.length > 0) {
    conditions.push(`ph.bom_step_id IN (${filters.stepIds.map(() => "?").join(",")})`);
    args.push(...filters.stepIds);
  }

  return {
    clause: conditions.length > 0 ? conditions.join(" AND ") : "1=1",
    args,
  };
}

export async function handleProductionSummary(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/production-history - raw production data for validation
  if (url.pathname === "/api/production-history" && request.method === "GET") {
    return getProductionHistory(url);
  }

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
      case "bom":
      case "product": // alias for backward compatibility
        return getBOMSummary(filters);
      case "demand":
      case "order": // alias for backward compatibility
        return getDemandSummary(filters);
      case "step":
        return getStepSummary(filters);
      default:
        return Response.json({ error: "Invalid group_by value" }, { status: 400 });
    }
  }

  return null;
}

async function getOverallSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  // Get daily breakdown
  const dailyResult = await db.execute({
    sql: `
      SELECT
        ph.date,
        COALESCE(SUM(ph.units_produced), 0) as units_produced,
        COUNT(*) as tasks_completed,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as hours_worked,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.equipment_cost), 0) as equipment_cost,
        COALESCE(SUM(ph.expected_seconds / 3600.0), 0) as expected_hours
      FROM production_history ph
      WHERE ${filterClause}
      GROUP BY ph.date
      ORDER BY ph.date DESC
    `,
    args: filterArgs
  });

  // Get workers per day
  const workersResult = await db.execute({
    sql: `
      SELECT DISTINCT
        ph.date,
        ph.worker_name
      FROM production_history ph
      WHERE ${filterClause}
      ORDER BY ph.date DESC, ph.worker_name
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
  const dailyBreakdownWithExpected = (dailyResult.rows as unknown as {
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
    efficiency: row.hours_worked > 0 ? Math.round((row.expected_hours / row.hours_worked) * 100) : 0,
    expectedHours: row.expected_hours
  }));

  // Calculate totals
  const totals = dailyBreakdownWithExpected.reduce((acc, day) => ({
    totalUnits: acc.totalUnits + day.units,
    tasksCompleted: acc.tasksCompleted + day.tasks,
    totalHoursWorked: acc.totalHoursWorked + day.hours,
    totalExpectedHours: acc.totalExpectedHours + day.expectedHours,
    laborCost: acc.laborCost + day.laborCost,
    equipmentCost: acc.equipmentCost + day.equipmentCost,
    totalCost: acc.totalCost + day.cost
  }), {
    totalUnits: 0,
    tasksCompleted: 0,
    totalHoursWorked: 0,
    totalExpectedHours: 0,
    laborCost: 0,
    equipmentCost: 0,
    totalCost: 0
  });

  // Strip expectedHours from response
  const dailyBreakdown: DailyBreakdown[] = dailyBreakdownWithExpected.map(({ expectedHours, ...day }) => day);
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
      avgEfficiency: totals.totalHoursWorked > 0 ? Math.round((totals.totalExpectedHours / totals.totalHoursWorked) * 100) : 0
    },
    dailyBreakdown
  });
}

async function getDaySummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ph.date,
        COALESCE(SUM(ph.units_produced), 0) as units_produced,
        COUNT(*) as tasks_completed,
        COUNT(DISTINCT ph.worker_id) as worker_count,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as hours_worked,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.equipment_cost), 0) as equipment_cost,
        COALESCE(SUM(ph.expected_seconds / 3600.0), 0) as expected_hours
      FROM production_history ph
      WHERE ${filterClause}
      GROUP BY ph.date
      ORDER BY ph.date DESC
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
    efficiency: row.hours_worked > 0 ? Math.round((row.expected_hours / row.hours_worked) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    days
  });
}

async function getWorkerSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ph.worker_id,
        ph.worker_name,
        COALESCE(SUM(ph.units_produced), 0) as total_units,
        COUNT(*) as tasks_completed,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as total_hours,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.expected_seconds / 3600.0), 0) as expected_hours
      FROM production_history ph
      WHERE ${filterClause}
      GROUP BY ph.worker_id, ph.worker_name
      ORDER BY total_units DESC
    `,
    args: filterArgs
  });

  const workers: WorkerSummary[] = (result.rows as unknown as {
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

async function getBOMSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ph.fishbowl_bom_id,
        ph.fishbowl_bom_num,
        COALESCE(SUM(ph.units_produced), 0) as total_units,
        COUNT(*) as tasks_completed,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as total_hours,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.equipment_cost), 0) as equipment_cost,
        COALESCE(SUM(ph.expected_seconds / 3600.0), 0) as expected_hours
      FROM production_history ph
      WHERE ${filterClause}
      GROUP BY ph.fishbowl_bom_id, ph.fishbowl_bom_num
      ORDER BY total_units DESC
    `,
    args: filterArgs
  });

  const boms: BOMSummary[] = (result.rows as unknown as {
    fishbowl_bom_id: number;
    fishbowl_bom_num: string;
    total_units: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => ({
    fishbowlBomId: row.fishbowl_bom_id,
    fishbowlBomNum: row.fishbowl_bom_num,
    totalUnits: row.total_units,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    efficiency: row.total_hours > 0 ? Math.round((row.expected_hours / row.total_hours) * 100) : 0
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    // Use both names for compatibility
    boms,
    products: boms // alias
  });
}

async function getDemandSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ph.demand_entry_id,
        de.fishbowl_bom_num,
        de.customer_name,
        de.quantity as demand_quantity,
        de.quantity_completed,
        COUNT(*) as tasks_completed,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as total_hours,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.equipment_cost), 0) as equipment_cost
      FROM production_history ph
      JOIN demand_entries de ON ph.demand_entry_id = de.id
      WHERE ${filterClause}
      GROUP BY ph.demand_entry_id, de.fishbowl_bom_num, de.customer_name, de.quantity, de.quantity_completed
      ORDER BY de.quantity_completed DESC
    `,
    args: filterArgs
  });

  const demands: DemandSummary[] = (result.rows as unknown as {
    demand_entry_id: number;
    fishbowl_bom_num: string;
    customer_name: string | null;
    demand_quantity: number;
    quantity_completed: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
  }[]).map(row => ({
    demandId: row.demand_entry_id,
    fishbowlBomNum: row.fishbowl_bom_num,
    customerName: row.customer_name,
    demandQuantity: row.demand_quantity,
    quantityCompleted: row.quantity_completed,
    progressPercent: row.demand_quantity > 0 ? Math.round((row.quantity_completed / row.demand_quantity) * 100) : 0,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
  }));

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    // Use both names for compatibility
    demands,
    orders: demands // alias
  });
}

async function getStepSummary(filters: Filters): Promise<Response> {
  const { clause: filterClause, args: filterArgs } = buildFilterClause(filters);

  const result = await db.execute({
    sql: `
      SELECT
        ph.bom_step_id,
        ph.step_name,
        ph.fishbowl_bom_num,
        bs.time_per_piece_seconds,
        COALESCE(SUM(ph.units_produced), 0) as total_units,
        COUNT(*) as tasks_completed,
        COUNT(DISTINCT ph.worker_id) as worker_count,
        COALESCE(SUM(ph.actual_seconds / 3600.0), 0) as total_hours,
        COALESCE(SUM(ph.labor_cost), 0) as labor_cost,
        COALESCE(SUM(ph.equipment_cost), 0) as equipment_cost,
        COALESCE(SUM(ph.expected_seconds / 3600.0), 0) as expected_hours
      FROM production_history ph
      LEFT JOIN bom_steps bs ON ph.bom_step_id = bs.id
      WHERE ${filterClause}
      GROUP BY ph.bom_step_id, ph.step_name, ph.fishbowl_bom_num, bs.time_per_piece_seconds
      ORDER BY ph.fishbowl_bom_num, total_units DESC
    `,
    args: filterArgs
  });

  // Get step IDs for top performers query
  const stepIds = (result.rows as unknown as { bom_step_id: number }[]).map(r => r.bom_step_id);

  // Get top performers per step
  const performersResult = stepIds.length > 0 ? await db.execute({
    sql: `
      SELECT
        ph.bom_step_id,
        ph.worker_id,
        ph.worker_name,
        SUM(ph.units_produced) as output,
        SUM(ph.actual_seconds) as total_seconds,
        SUM(ph.expected_seconds) as expected_seconds
      FROM production_history ph
      WHERE ph.bom_step_id IN (${stepIds.map(() => "?").join(",")})
      GROUP BY ph.bom_step_id, ph.worker_id, ph.worker_name
      ORDER BY ph.bom_step_id, output DESC
    `,
    args: stepIds
  }) : { rows: [] };

  // Group performers by step (top 3)
  const performersByStep = new Map<number, { workerId: number; workerName: string; output: number; efficiency: number }[]>();
  for (const row of performersResult.rows as unknown as {
    bom_step_id: number;
    worker_id: number;
    worker_name: string;
    output: number;
    total_seconds: number;
    expected_seconds: number;
  }[]) {
    if (!performersByStep.has(row.bom_step_id)) {
      performersByStep.set(row.bom_step_id, []);
    }
    const stepPerformers = performersByStep.get(row.bom_step_id)!;
    if (stepPerformers.length < 3) {
      const efficiency = row.total_seconds > 0 && row.expected_seconds > 0
        ? Math.round((row.expected_seconds / row.total_seconds) * 100)
        : 0;
      stepPerformers.push({
        workerId: row.worker_id,
        workerName: row.worker_name,
        output: row.output,
        efficiency,
      });
    }
  }

  const steps: StepSummary[] = (result.rows as unknown as {
    bom_step_id: number;
    step_name: string;
    fishbowl_bom_num: string;
    time_per_piece_seconds: number | null;
    total_units: number;
    tasks_completed: number;
    worker_count: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
    expected_hours: number;
  }[]).map(row => {
    const totalSeconds = row.total_hours * 3600;
    const actualSecondsPerPiece = row.total_units > 0 ? totalSeconds / row.total_units : null;

    return {
      bomStepId: row.bom_step_id,
      stepName: row.step_name,
      fishbowlBomNum: row.fishbowl_bom_num,
      totalUnits: row.total_units,
      tasksCompleted: row.tasks_completed,
      workerCount: row.worker_count,
      totalHours: Math.round(row.total_hours * 100) / 100,
      laborCost: Math.round(row.labor_cost * 100) / 100,
      equipmentCost: Math.round(row.equipment_cost * 100) / 100,
      totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
      efficiency: row.total_hours > 0 ? Math.round((row.expected_hours / row.total_hours) * 100) : 0,
      estimatedSecondsPerPiece: row.time_per_piece_seconds || 0,
      actualSecondsPerPiece: actualSecondsPerPiece ? Math.round(actualSecondsPerPiece * 10) / 10 : null,
      topPerformers: performersByStep.get(row.bom_step_id) || [],
    };
  });

  return Response.json({
    period: { start: filters.startDate, end: filters.endDate },
    steps
  });
}

async function getProductionHistory(url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get("limit") || "500");
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  let dateFilter = "";
  const args: (string | number)[] = [];

  if (startDate && endDate) {
    dateFilter = "WHERE ph.date BETWEEN ? AND ?";
    args.push(startDate, endDate);
  } else if (startDate) {
    dateFilter = "WHERE ph.date >= ?";
    args.push(startDate);
  } else if (endDate) {
    dateFilter = "WHERE ph.date <= ?";
    args.push(endDate);
  }

  args.push(limit);

  const result = await db.execute({
    sql: `
      SELECT
        ph.id,
        ph.fishbowl_bom_num,
        ph.demand_entry_id,
        de.due_date as demand_due_date,
        ph.step_name,
        ph.worker_name,
        ph.date as work_date,
        ph.start_time,
        ph.end_time,
        ph.units_produced,
        ph.actual_seconds,
        ph.expected_seconds,
        ph.efficiency_percent
      FROM production_history ph
      LEFT JOIN demand_entries de ON ph.demand_entry_id = de.id
      ${dateFilter}
      ORDER BY ph.date DESC, ph.start_time DESC
      LIMIT ?
    `,
    args,
  });

  const entries = (result.rows as unknown as {
    id: number;
    fishbowl_bom_num: string;
    demand_entry_id: number | null;
    demand_due_date: string | null;
    step_name: string;
    worker_name: string;
    work_date: string;
    start_time: string;
    end_time: string;
    units_produced: number;
    actual_seconds: number;
    expected_seconds: number;
    efficiency_percent: number;
  }[]).map(row => ({
    id: row.id,
    productName: row.fishbowl_bom_num, // alias for compatibility
    fishbowlBomNum: row.fishbowl_bom_num,
    demandId: row.demand_entry_id,
    orderId: row.demand_entry_id, // alias for compatibility
    demandDueDate: row.demand_due_date,
    orderDueDate: row.demand_due_date, // alias for compatibility
    stepName: row.step_name,
    workerName: row.worker_name,
    workDate: row.work_date,
    startTime: row.start_time,
    endTime: row.end_time,
    unitsProduced: row.units_produced,
    actualSeconds: row.actual_seconds,
    expectedSeconds: row.expected_seconds,
    efficiencyPercent: row.efficiency_percent,
  }));

  return Response.json({ entries });
}

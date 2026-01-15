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
  unitsProduced: number;
  progressPercent: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
}

export async function handleProductionSummary(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/production-summary
  if (url.pathname === "/api/production-summary" && request.method === "GET") {
    const groupBy = url.searchParams.get("group_by") || "overall";
    const date = url.searchParams.get("date");
    let startDate = url.searchParams.get("start_date");
    let endDate = url.searchParams.get("end_date");

    // If single date provided, use it for both start and end
    if (date && !startDate && !endDate) {
      startDate = date;
      endDate = date;
    }

    // Default to today if no dates provided
    if (!startDate || !endDate) {
      const today = new Date().toISOString().split("T")[0]!;
      startDate = startDate || today;
      endDate = endDate || today;
    }

    const start = startDate;
    const end = endDate;

    switch (groupBy) {
      case "overall":
        return getOverallSummary(start, end);
      case "product":
        return getProductSummary(start, end);
      case "order":
        return getOrderSummary(start, end);
      default:
        return Response.json({ error: "Invalid group_by value" }, { status: 400 });
    }
  }

  return null;
}

async function getOverallSummary(startDate: string, endDate: string): Promise<Response> {
  // Get daily breakdown with workers aggregated
  const dailyResult = await db.execute({
    sql: `
      SELECT
        se.date,
        COALESCE(SUM(twa.actual_output), 0) as units_produced,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(se.planned_output), 0) as planned_output,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        ), 0) as hours_worked,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost
      FROM schedule_entries se
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE se.date BETWEEN ? AND ?
      GROUP BY se.date
      ORDER BY se.date DESC
    `,
    args: [startDate, endDate]
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
      WHERE se.date BETWEEN ? AND ?
        AND twa.status IN ('in_progress', 'completed')
      ORDER BY se.date DESC, w.name
    `,
    args: [startDate, endDate]
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
    planned_output: number;
    hours_worked: number;
    labor_cost: number;
    equipment_cost: number;
  }[]).map(row => ({
    date: row.date,
    units: row.units_produced,
    tasks: row.tasks_completed,
    workers: workersByDate[row.date] || [],
    hours: Math.round(row.hours_worked * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    cost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    plannedUnits: row.planned_output,
    efficiency: row.planned_output > 0 ? Math.round((row.units_produced / row.planned_output) * 100) : 0
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
    period: { start: startDate, end: endDate },
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

async function getProductSummary(startDate: string, endDate: string): Promise<Response> {
  const result = await db.execute({
    sql: `
      SELECT
        p.id as product_id,
        p.name as product_name,
        COALESCE(SUM(twa.actual_output), 0) as total_units,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(se.planned_output), 0) as planned_output,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost
      FROM schedule_entries se
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE se.date BETWEEN ? AND ?
      GROUP BY p.id, p.name
      ORDER BY total_units DESC
    `,
    args: [startDate, endDate]
  });

  const products: ProductSummary[] = (result.rows as unknown as {
    product_id: number;
    product_name: string;
    total_units: number;
    tasks_completed: number;
    planned_output: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
  }[]).map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    totalUnits: row.total_units,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100,
    plannedUnits: row.planned_output,
    efficiency: row.planned_output > 0 ? Math.round((row.total_units / row.planned_output) * 100) : 0
  }));

  return Response.json({
    period: { start: startDate, end: endDate },
    products
  });
}

async function getOrderSummary(startDate: string, endDate: string): Promise<Response> {
  const result = await db.execute({
    sql: `
      SELECT
        o.id as order_id,
        p.name as product_name,
        o.quantity as order_quantity,
        COALESCE(SUM(twa.actual_output), 0) as units_produced,
        COUNT(DISTINCT CASE WHEN twa.status = 'completed' THEN twa.id END) as tasks_completed,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        ), 0) as total_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * w.cost_per_hour
          ELSE 0 END
        ), 0) as labor_cost,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL AND ps.equipment_id IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * e.hourly_cost
          ELSE 0 END
        ), 0) as equipment_cost
      FROM schedule_entries se
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      LEFT JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN product_steps ps ON se.product_step_id = ps.id
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE se.date BETWEEN ? AND ?
      GROUP BY o.id, p.name, o.quantity
      ORDER BY units_produced DESC
    `,
    args: [startDate, endDate]
  });

  const orders: OrderSummary[] = (result.rows as unknown as {
    order_id: number;
    product_name: string;
    order_quantity: number;
    units_produced: number;
    tasks_completed: number;
    total_hours: number;
    labor_cost: number;
    equipment_cost: number;
  }[]).map(row => ({
    orderId: row.order_id,
    productName: row.product_name,
    orderQuantity: row.order_quantity,
    unitsProduced: row.units_produced,
    progressPercent: row.order_quantity > 0 ? Math.round((row.units_produced / row.order_quantity) * 100) : 0,
    tasksCompleted: row.tasks_completed,
    totalHours: Math.round(row.total_hours * 100) / 100,
    laborCost: Math.round(row.labor_cost * 100) / 100,
    equipmentCost: Math.round(row.equipment_cost * 100) / 100,
    totalCost: Math.round((row.labor_cost + row.equipment_cost) * 100) / 100
  }));

  return Response.json({
    period: { start: startDate, end: endDate },
    orders
  });
}

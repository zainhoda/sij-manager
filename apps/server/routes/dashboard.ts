/**
 * Dashboard API - aggregated metrics for the hero dashboard
 * Uses NEW schema: demand_entries, plan_tasks, task_assignments, production_history
 */
import { db } from "../db";

interface DashboardDemand {
  id: number;
  fishbowlBomNum: string;
  productName: string;  // Alias for fishbowlBomNum for frontend compatibility
  quantity: number;
  quantityCompleted: number;
  dueDate: string;
  startDate: string | null;
  estimatedCompletionDate: string | null;
  status: string;
  progressPercent: number;
  daysUntilDue: number;
  isOnTrack: boolean;
  customerName: string | null;
  color: string | null;
}

interface TopWorker {
  id: number;
  name: string;
  unitsToday: number;
  efficiency: number;
}

interface DailyProduction {
  date: string;
  units: number;
  dayName: string;
}

interface DashboardData {
  // Hero KPIs (using old names for frontend compatibility)
  activeOrders: number;
  ordersDueThisWeek: number;
  unitsToday: number;
  unitsYesterday: number;
  avgEfficiency: number;
  workersActiveToday: number;
  totalWorkers: number;

  // Order/Demand progress (using old name for frontend compatibility)
  orders: DashboardDemand[];

  // Top performers
  topWorkers: TopWorker[];

  // Chart data
  dailyProduction: DailyProduction[];

  // Period info for auto-switching
  period: "today" | "yesterday";
  actualUnitsToday: number;

  // Metadata
  lastUpdated: string;
}

export async function handleDashboard(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    try {
      const period = url.searchParams.get("period") as "today" | "yesterday" | null;
      const data = await getDashboardData(period || "today");
      return Response.json(data);
    } catch (error) {
      console.error("Dashboard API error:", error);
      return Response.json({ error: "Failed to load dashboard data" }, { status: 500 });
    }
  }

  return null;
}

async function getDashboardData(period: "today" | "yesterday" = "today"): Promise<DashboardData> {
  const today = new Date().toISOString().split("T")[0]!;

  // Find the last day with production data (before today)
  const lastDataDayResult = await db.execute({
    sql: `
      SELECT date
      FROM production_history
      WHERE date < ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 1
    `,
    args: [today]
  });
  const lastBusinessDay = lastDataDayResult.rows.length > 0
    ? (lastDataDayResult.rows[0] as unknown as { date: string }).date
    : new Date(Date.now() - 86400000).toISOString().split("T")[0]!;

  const targetDate = period === "yesterday" ? lastBusinessDay : today;
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]!;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]!;

  // Get active demand count
  const activeDemandResult = await db.execute(`
    SELECT COUNT(*) as count FROM demand_entries WHERE status IN ('pending', 'planned', 'in_progress')
  `);
  const activeDemand = (activeDemandResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get demand due this week
  const demandDueResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM demand_entries WHERE status NOT IN ('completed', 'cancelled') AND due_date <= ?`,
    args: [weekFromNow]
  });
  const demandDueThisWeek = (demandDueResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get units produced for target period (from production_history)
  const unitsTodayResult = await db.execute({
    sql: `
      SELECT COALESCE(SUM(units_produced), 0) as units
      FROM production_history
      WHERE date = ?
    `,
    args: [targetDate]
  });
  const unitsToday = (unitsTodayResult.rows[0] as unknown as { units: number })?.units ?? 0;

  // Get units for comparison period
  let comparisonDate: string;
  if (period === "yesterday") {
    const comparisonResult = await db.execute({
      sql: `
        SELECT date
        FROM production_history
        WHERE date < ?
        GROUP BY date
        ORDER BY date DESC
        LIMIT 1
      `,
      args: [lastBusinessDay]
    });
    comparisonDate = comparisonResult.rows.length > 0
      ? (comparisonResult.rows[0] as unknown as { date: string }).date
      : lastBusinessDay;
  } else {
    comparisonDate = lastBusinessDay;
  }
  const unitsYesterdayResult = await db.execute({
    sql: `
      SELECT COALESCE(SUM(units_produced), 0) as units
      FROM production_history
      WHERE date = ?
    `,
    args: [comparisonDate]
  });
  const unitsYesterday = (unitsYesterdayResult.rows[0] as unknown as { units: number })?.units ?? 0;

  // Get average efficiency (last 7 days from production_history)
  const efficiencyResult = await db.execute({
    sql: `
      SELECT
        COALESCE(SUM(expected_seconds), 0) as expected_seconds,
        COALESCE(SUM(actual_seconds), 0) as actual_seconds
      FROM production_history
      WHERE date >= ?
    `,
    args: [sevenDaysAgo]
  });
  const effRow = efficiencyResult.rows[0] as unknown as { expected_seconds: number; actual_seconds: number };
  const avgEfficiency = effRow?.actual_seconds > 0
    ? Math.round((effRow.expected_seconds / effRow.actual_seconds) * 100)
    : 0;

  // Get workers active for target period
  const workersActiveTodayResult = await db.execute({
    sql: `
      SELECT COUNT(DISTINCT worker_id) as count
      FROM production_history
      WHERE date = ?
    `,
    args: [targetDate]
  });
  const workersActiveToday = (workersActiveTodayResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get total workers
  const totalWorkersResult = await db.execute(`
    SELECT COUNT(*) as count FROM workers WHERE status = 'active'
  `);
  const totalWorkers = (totalWorkersResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get demand progress (top 10 active)
  const demandsResult = await db.execute(`
    SELECT
      id,
      fishbowl_bom_num,
      quantity,
      quantity_completed,
      due_date,
      status,
      customer_name,
      color
    FROM demand_entries
    WHERE status IN ('pending', 'planned', 'in_progress')
    ORDER BY due_date ASC
    LIMIT 10
  `);

  const demands: DashboardDemand[] = (demandsResult.rows as unknown as {
    id: number;
    fishbowl_bom_num: string;
    quantity: number;
    quantity_completed: number;
    due_date: string;
    status: string;
    customer_name: string | null;
    color: string | null;
  }[]).map(row => {
    const dueDate = new Date(row.due_date);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
    const progressPercent = row.quantity > 0
      ? Math.round((row.quantity_completed / row.quantity) * 100)
      : 0;

    // Determine if on track: complete or enough time remaining for remaining work
    const remainingPercent = 100 - progressPercent;
    const isOnTrack = progressPercent >= 100 || daysUntilDue >= Math.ceil(remainingPercent / 20); // ~20% per day heuristic

    // Estimate completion based on current progress rate (simplified)
    let estimatedCompletionDate: string | null = null;
    if (progressPercent > 0 && progressPercent < 100) {
      const daysPerPercent = 1 / 20; // ~5 days for 100%
      const daysRemaining = remainingPercent * daysPerPercent;
      const estDate = new Date(now.getTime() + daysRemaining * 86400000);
      estimatedCompletionDate = estDate.toISOString().split("T")[0]!;
    } else if (progressPercent >= 100) {
      estimatedCompletionDate = now.toISOString().split("T")[0]!;
    }

    return {
      id: row.id,
      fishbowlBomNum: row.fishbowl_bom_num,
      productName: row.fishbowl_bom_num,  // Use BOM num as product name
      quantity: row.quantity,
      quantityCompleted: row.quantity_completed,
      dueDate: row.due_date,
      startDate: null,  // Not tracked in demand_entries
      estimatedCompletionDate,
      status: row.status,
      progressPercent,
      daysUntilDue,
      isOnTrack,
      customerName: row.customer_name,
      color: row.color,
    };
  });

  // Get top workers for target period (from production_history)
  const topWorkersResult = await db.execute({
    sql: `
      SELECT
        worker_id,
        worker_name,
        SUM(units_produced) as units_today,
        SUM(expected_seconds) as expected_seconds,
        SUM(actual_seconds) as actual_seconds
      FROM production_history
      WHERE date = ?
      GROUP BY worker_id, worker_name
      ORDER BY units_today DESC
      LIMIT 5
    `,
    args: [targetDate]
  });

  const topWorkers: TopWorker[] = (topWorkersResult.rows as unknown as {
    worker_id: number;
    worker_name: string;
    units_today: number;
    expected_seconds: number;
    actual_seconds: number;
  }[]).map(row => ({
    id: row.worker_id,
    name: row.worker_name,
    unitsToday: row.units_today,
    efficiency: row.actual_seconds > 0 ? Math.round((row.expected_seconds / row.actual_seconds) * 100) : 0
  }));

  // Get daily production for last 7 days
  const dailyResult = await db.execute({
    sql: `
      SELECT
        date,
        COALESCE(SUM(units_produced), 0) as units
      FROM production_history
      WHERE date >= ?
      GROUP BY date
      ORDER BY date ASC
    `,
    args: [sevenDaysAgo]
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyProduction: DailyProduction[] = (dailyResult.rows as unknown as {
    date: string;
    units: number;
  }[]).map(row => {
    const [year, month, day] = row.date.split('-').map(Number);
    const dateObj = new Date(year!, month! - 1, day!);
    return {
      date: row.date,
      units: row.units,
      dayName: dayNames[dateObj.getDay()]!
    };
  });

  // Get actual today's units (for auto-detect logic in frontend)
  let actualUnitsToday = unitsToday;
  if (period === "yesterday") {
    const actualTodayResult = await db.execute({
      sql: `
        SELECT COALESCE(SUM(units_produced), 0) as units
        FROM production_history
        WHERE date = ?
      `,
      args: [today]
    });
    actualUnitsToday = (actualTodayResult.rows[0] as unknown as { units: number })?.units ?? 0;
  }

  return {
    activeOrders: activeDemand,
    ordersDueThisWeek: demandDueThisWeek,
    unitsToday,
    unitsYesterday,
    avgEfficiency,
    workersActiveToday,
    totalWorkers,
    orders: demands,
    topWorkers,
    dailyProduction,
    period,
    actualUnitsToday,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Dashboard API - aggregated metrics for the hero dashboard
 */
import { db } from "../db";

interface DashboardOrder {
  id: number;
  productName: string;
  quantity: number;
  dueDate: string;
  status: string;
  progressPercent: number;
  daysUntilDue: number;
  startDate: string | null;
  estimatedCompletionDate: string | null;
  isOnTrack: boolean;
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
  // Hero KPIs
  activeOrders: number;
  ordersDueThisWeek: number;
  unitsToday: number;
  unitsYesterday: number;
  avgEfficiency: number;
  workersActiveToday: number;
  totalWorkers: number;

  // Order progress
  orders: DashboardOrder[];

  // Top performers
  topWorkers: TopWorker[];

  // Chart data
  dailyProduction: DailyProduction[];

  // Period info for auto-switching
  period: "today" | "yesterday";
  actualUnitsToday: number; // Always today's units, used for auto-detect

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

  // Find the last business day with data (most recent date before today with production)
  const lastDataDayResult = await db.execute({
    sql: `
      SELECT se.date
      FROM schedule_entries se
      JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      WHERE se.date < ? AND twa.actual_output > 0
      GROUP BY se.date
      ORDER BY se.date DESC
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

  // Get active orders count
  const activeOrdersResult = await db.execute(`
    SELECT COUNT(*) as count FROM orders WHERE status IN ('pending', 'scheduled', 'in_progress')
  `);
  const activeOrders = (activeOrdersResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get orders due this week
  const ordersDueResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM orders WHERE status != 'completed' AND due_date <= ?`,
    args: [weekFromNow]
  });
  const ordersDueThisWeek = (ordersDueResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get units produced for target period
  const unitsTodayResult = await db.execute({
    sql: `
      SELECT COALESCE(SUM(twa.actual_output), 0) as units
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE se.date = ?
    `,
    args: [targetDate]
  });
  const unitsToday = (unitsTodayResult.rows[0] as unknown as { units: number })?.units ?? 0;

  // Get units produced for comparison period (day before target with data)
  let comparisonDate: string;
  if (period === "yesterday") {
    // Find the day before lastBusinessDay that has data
    const comparisonResult = await db.execute({
      sql: `
        SELECT se.date
        FROM schedule_entries se
        JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
        WHERE se.date < ? AND twa.actual_output > 0
        GROUP BY se.date
        ORDER BY se.date DESC
        LIMIT 1
      `,
      args: [lastBusinessDay]
    });
    comparisonDate = comparisonResult.rows.length > 0
      ? (comparisonResult.rows[0] as unknown as { date: string }).date
      : lastBusinessDay;
  } else {
    // For today, compare to last business day
    comparisonDate = lastBusinessDay;
  }
  const unitsYesterdayResult = await db.execute({
    sql: `
      SELECT COALESCE(SUM(twa.actual_output), 0) as units
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE se.date = ?
    `,
    args: [comparisonDate]
  });
  const unitsYesterday = (unitsYesterdayResult.rows[0] as unknown as { units: number })?.units ?? 0;

  // Get average efficiency (last 7 days)
  const efficiencyResult = await db.execute({
    sql: `
      SELECT
        COALESCE(SUM(ps.time_per_piece_seconds * twa.actual_output / 3600.0), 0) as expected_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        ), 0) as actual_hours
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.date >= ? AND twa.actual_output > 0
    `,
    args: [sevenDaysAgo]
  });
  const effRow = efficiencyResult.rows[0] as unknown as { expected_hours: number; actual_hours: number };
  const avgEfficiency = effRow?.actual_hours > 0
    ? Math.round((effRow.expected_hours / effRow.actual_hours) * 100)
    : 0;

  // Get workers active for target period
  const workersActiveTodayResult = await db.execute({
    sql: `
      SELECT COUNT(DISTINCT twa.worker_id) as count
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE se.date = ? AND twa.actual_output > 0
    `,
    args: [targetDate]
  });
  const workersActiveToday = (workersActiveTodayResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get total workers
  const totalWorkersResult = await db.execute(`
    SELECT COUNT(*) as count FROM workers WHERE status = 'active'
  `);
  const totalWorkers = (totalWorkersResult.rows[0] as unknown as { count: number })?.count ?? 0;

  // Get order progress for active orders using step completions percentage
  // (same calculation as Production Summary "vs. Act. Eff.")
  const ordersResult = await db.execute(`
    SELECT
      o.id,
      p.name as product_name,
      o.quantity,
      o.due_date,
      o.status,
      -- Total step completions (actual_output across all steps)
      COALESCE(
        (SELECT SUM(twa.actual_output)
         FROM task_worker_assignments twa
         JOIN schedule_entries se ON twa.schedule_entry_id = se.id
         JOIN schedules s ON se.schedule_id = s.id
         WHERE s.order_id = o.id
        ), 0
      ) as total_step_completions,
      -- Number of steps in the build version
      COALESCE(
        (SELECT COUNT(DISTINCT bvs.product_step_id)
         FROM schedules s
         JOIN build_version_steps bvs ON bvs.build_version_id = s.build_version_id
         WHERE s.order_id = o.id
        ), 1
      ) as num_steps,
      -- Start date (first date when actual work was logged)
      (SELECT MIN(se.date)
       FROM schedule_entries se
       JOIN schedules s ON se.schedule_id = s.id
       JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
       WHERE s.order_id = o.id AND twa.actual_output > 0
      ) as start_date,
      -- Total hours worked on this order
      COALESCE(
        (SELECT SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        )
        FROM task_worker_assignments twa
        JOIN schedule_entries se ON twa.schedule_entry_id = se.id
        JOIN schedules s ON se.schedule_id = s.id
        WHERE s.order_id = o.id
        ), 0
      ) as total_hours
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status IN ('pending', 'scheduled', 'in_progress')
    ORDER BY o.due_date ASC
    LIMIT 10
  `);

  const orders: DashboardOrder[] = (ordersResult.rows as unknown as {
    id: number;
    product_name: string;
    quantity: number;
    due_date: string;
    status: string;
    total_step_completions: number;
    num_steps: number;
    start_date: string | null;
    total_hours: number;
  }[]).map(row => {
    const dueDate = new Date(row.due_date);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);

    // Progress = step completions / total step completions needed
    const totalStepCompletionsNeeded = row.quantity * row.num_steps;
    const progressPercent = totalStepCompletionsNeeded > 0
      ? Math.round((row.total_step_completions / totalStepCompletionsNeeded) * 100)
      : 0;

    // Calculate estimated completion date based on actual pace
    let estimatedCompletionDate: string | null = null;
    if (row.total_step_completions > 0 && row.total_hours > 0) {
      const hoursPerCompletion = row.total_hours / row.total_step_completions;
      const remainingCompletions = totalStepCompletionsNeeded - row.total_step_completions;
      const remainingHours = remainingCompletions * hoursPerCompletion;
      // Assume ~8 working hours per day
      const remainingDays = Math.ceil(remainingHours / 8);
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + remainingDays);
      estimatedCompletionDate = estDate.toISOString().split('T')[0]!;
    }

    const isOnTrack = estimatedCompletionDate
      ? new Date(estimatedCompletionDate) <= dueDate
      : true; // No data yet, assume on track

    return {
      id: row.id,
      productName: row.product_name,
      quantity: row.quantity,
      dueDate: row.due_date,
      status: row.status,
      progressPercent,
      daysUntilDue,
      startDate: row.start_date,
      estimatedCompletionDate,
      isOnTrack
    };
  });

  // Get top workers for target period
  const topWorkersResult = await db.execute({
    sql: `
      SELECT
        w.id,
        w.name,
        COALESCE(SUM(twa.actual_output), 0) as units_today,
        COALESCE(SUM(ps.time_per_piece_seconds * twa.actual_output / 3600.0), 0) as expected_hours,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
          ELSE 0 END
        ), 0) as actual_hours
      FROM workers w
      JOIN task_worker_assignments twa ON twa.worker_id = w.id
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.date = ? AND twa.actual_output > 0
      GROUP BY w.id, w.name
      ORDER BY units_today DESC
      LIMIT 5
    `,
    args: [targetDate]
  });

  const topWorkers: TopWorker[] = (topWorkersResult.rows as unknown as {
    id: number;
    name: string;
    units_today: number;
    expected_hours: number;
    actual_hours: number;
  }[]).map(row => ({
    id: row.id,
    name: row.name,
    unitsToday: row.units_today,
    efficiency: row.actual_hours > 0 ? Math.round((row.expected_hours / row.actual_hours) * 100) : 0
  }));

  // Get daily production for last 7 days
  const dailyResult = await db.execute({
    sql: `
      SELECT
        se.date,
        COALESCE(SUM(twa.actual_output), 0) as units
      FROM schedule_entries se
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      WHERE se.date >= ?
      GROUP BY se.date
      ORDER BY se.date ASC
    `,
    args: [sevenDaysAgo]
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyProduction: DailyProduction[] = (dailyResult.rows as unknown as {
    date: string;
    units: number;
  }[]).map(row => {
    // Parse date as local time to get correct day name
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
        SELECT COALESCE(SUM(twa.actual_output), 0) as units
        FROM task_worker_assignments twa
        JOIN schedule_entries se ON twa.schedule_entry_id = se.id
        WHERE se.date = ?
      `,
      args: [today]
    });
    actualUnitsToday = (actualTodayResult.rows[0] as unknown as { units: number })?.units ?? 0;
  }

  return {
    activeOrders,
    ordersDueThisWeek,
    unitsToday,
    unitsYesterday,
    avgEfficiency,
    workersActiveToday,
    totalWorkers,
    orders,
    topWorkers,
    dailyProduction,
    period,
    actualUnitsToday,
    lastUpdated: new Date().toISOString()
  };
}

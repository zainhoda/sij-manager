import { db } from "../db";
import type { SchedulingScenario, ScenarioSchedule, Order, Worker } from "../db/schema";

interface WorkerPoolOverride {
  workerId: number;
  available: boolean;
  hoursPerDay?: number;
}

interface DeadlineRisk {
  orderId: number;
  productName: string;
  dueDate: string;
  requiredHours: number;
  availableHours: number;
  canMeet: boolean;
  shortfallHours: number;
}

interface OvertimeProjection {
  date: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}

interface CapacityAnalysis {
  totalAvailableHours: number;
  totalRequiredHours: number;
  utilizationPercent: number;
  weeklyBreakdown: {
    weekStart: string;
    availableHours: number;
    requiredHours: number;
  }[];
}

// Calculate work hours required for an order
async function calculateOrderHours(orderId: number): Promise<number> {
  const orderResult = await db.execute({
    sql: `
    SELECT o.quantity, ps.time_per_piece_seconds
    FROM orders o
    JOIN products p ON o.product_id = p.id
    JOIN product_steps ps ON ps.product_id = p.id
    WHERE o.id = ?
  `,
    args: [orderId]
  });
  const order = orderResult.rows as unknown as { quantity: number; time_per_piece_seconds: number }[];

  let totalSeconds = 0;
  for (const step of order) {
    totalSeconds += step.quantity * step.time_per_piece_seconds;
  }

  return totalSeconds / 3600; // Convert to hours
}

// Get available work capacity (hours) for a date range
async function getAvailableCapacity(
  startDate: string,
  endDate: string,
  workerOverrides?: WorkerPoolOverride[]
): Promise<number> {
  // Get active workers
  const workersResult = await db.execute("SELECT id FROM workers WHERE status = 'active'");
  let workers = workersResult.rows as unknown as { id: number }[];

  // Apply overrides
  if (workerOverrides) {
    const overrideMap = new Map(workerOverrides.map((o) => [o.workerId, o]));
    workers = workers.filter((w) => {
      const override = overrideMap.get(w.id);
      return override ? override.available : true;
    });
  }

  // Count workdays between dates (excluding weekends)
  const start = new Date(startDate);
  const end = new Date(endDate);
  let workdays = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      workdays++;
    }
  }

  // 8 hours per worker per workday
  return workers.length * workdays * 8;
}

// Get deadline risks for pending orders
export async function getDeadlineRisks(): Promise<DeadlineRisk[]> {
  const ordersResult = await db.execute(`
    SELECT o.id, o.due_date, o.quantity, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status IN ('pending', 'scheduled', 'in_progress')
    ORDER BY o.due_date
  `);
  const orders = ordersResult.rows as unknown as { id: number; due_date: string; quantity: number; product_name: string }[];

  const today = new Date().toISOString().split('T')[0]!;
  const risks: DeadlineRisk[] = [];

  for (const order of orders) {
    const requiredHours = await calculateOrderHours(order.id);
    const availableHours = await getAvailableCapacity(today, order.due_date);

    const canMeet = availableHours >= requiredHours;
    const shortfallHours = canMeet ? 0 : requiredHours - availableHours;

    risks.push({
      orderId: order.id,
      productName: order.product_name,
      dueDate: order.due_date,
      requiredHours: Math.round(requiredHours * 10) / 10,
      availableHours: Math.round(availableHours * 10) / 10,
      canMeet,
      shortfallHours: Math.round(shortfallHours * 10) / 10,
    });
  }

  return risks;
}

// Get overtime projections based on schedule entries
export async function getOvertimeProjections(): Promise<OvertimeProjection[]> {
  // Get scheduled entries grouped by date
  const entriesResult = await db.execute(`
    SELECT
      date,
      start_time,
      end_time
    FROM schedule_entries
    WHERE date >= date('now')
    ORDER BY date
  `);
  const entries = entriesResult.rows as unknown as { date: string; start_time: string; end_time: string }[];

  // Group by date and calculate hours
  const byDate: Record<string, number> = {};

  for (const entry of entries) {
    const start = parseInt(entry.start_time.split(':')[0]!) * 60 + parseInt(entry.start_time.split(':')[1]!);
    const end = parseInt(entry.end_time.split(':')[0]!) * 60 + parseInt(entry.end_time.split(':')[1]!);
    const hours = (end - start) / 60;

    if (!byDate[entry.date]) {
      byDate[entry.date] = 0;
    }
    byDate[entry.date]! += hours;
  }

  const projections: OvertimeProjection[] = [];
  const regularHoursPerDay = 8;

  for (const [date, totalHours] of Object.entries(byDate)) {
    const overtime = Math.max(0, totalHours - regularHoursPerDay);
    projections.push({
      date,
      regularHours: Math.min(totalHours, regularHoursPerDay),
      overtimeHours: Math.round(overtime * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
    });
  }

  return projections;
}

// Get capacity analysis
export async function getCapacityAnalysis(weeks: number = 8): Promise<CapacityAnalysis> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + weeks * 7);

  const totalAvailableHours = await getAvailableCapacity(
    today.toISOString().split('T')[0]!,
    endDate.toISOString().split('T')[0]!
  );

  // Calculate required hours from all pending orders
  const ordersResult = await db.execute(
    "SELECT id FROM orders WHERE status IN ('pending', 'scheduled', 'in_progress')"
  );
  const orders = ordersResult.rows as unknown as { id: number }[];

  let totalRequiredHours = 0;
  for (const order of orders) {
    totalRequiredHours += await calculateOrderHours(order.id);
  }

  // Weekly breakdown
  const weeklyBreakdown: CapacityAnalysis['weeklyBreakdown'] = [];
  let currentWeekStart = new Date(today);
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1); // Monday

  for (let i = 0; i < weeks; i++) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekAvailable = await getAvailableCapacity(
      currentWeekStart.toISOString().split('T')[0]!,
      weekEnd.toISOString().split('T')[0]!
    );

    // Get scheduled hours for this week
    const scheduledHoursResult = await db.execute({
      sql: `
      SELECT SUM(
        (CAST(substr(end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(end_time, 4, 2) AS INTEGER)) -
        (CAST(substr(start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(start_time, 4, 2) AS INTEGER))
      ) / 60.0 as total_hours
      FROM schedule_entries
      WHERE date >= ? AND date <= ?
    `,
      args: [
        currentWeekStart.toISOString().split('T')[0]!,
        weekEnd.toISOString().split('T')[0]!
      ]
    });
    const scheduledHours = scheduledHoursResult.rows[0] as unknown as { total_hours: number | null };

    weeklyBreakdown.push({
      weekStart: currentWeekStart.toISOString().split('T')[0]!,
      availableHours: Math.round(weekAvailable),
      requiredHours: Math.round(scheduledHours.total_hours || 0),
    });

    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  return {
    totalAvailableHours: Math.round(totalAvailableHours),
    totalRequiredHours: Math.round(totalRequiredHours),
    utilizationPercent: totalAvailableHours > 0
      ? Math.round((totalRequiredHours / totalAvailableHours) * 100)
      : 0,
    weeklyBreakdown,
  };
}

// Create a what-if scenario
export async function createScenario(
  name: string,
  description: string | null,
  workerPoolOverrides: WorkerPoolOverride[]
): Promise<SchedulingScenario> {
  const workerPool = JSON.stringify(workerPoolOverrides);

  const result = await db.execute({
    sql: "INSERT INTO scheduling_scenarios (name, description, worker_pool) VALUES (?, ?, ?)",
    args: [name, description, workerPool]
  });

  const scenarioResult = await db.execute({
    sql: "SELECT * FROM scheduling_scenarios WHERE id = ?",
    args: [result.lastInsertRowid!]
  });
  return scenarioResult.rows[0] as unknown as SchedulingScenario;
}

// Get all scenarios with parsed worker pools
export async function getScenarios(): Promise<(SchedulingScenario & { workerPoolParsed: WorkerPoolOverride[] })[]> {
  const scenariosResult = await db.execute("SELECT * FROM scheduling_scenarios ORDER BY created_at DESC");
  const scenarios = scenariosResult.rows as unknown as SchedulingScenario[];
  return scenarios.map((s) => ({
    ...s,
    workerPoolParsed: JSON.parse(s.worker_pool) as WorkerPoolOverride[],
  }));
}

// Get scenario by ID with parsed worker pool
export async function getScenario(scenarioId: number): Promise<(SchedulingScenario & { workerPoolParsed: WorkerPoolOverride[] }) | null> {
  const scenarioResult = await db.execute({
    sql: "SELECT * FROM scheduling_scenarios WHERE id = ?",
    args: [scenarioId]
  });
  const scenario = scenarioResult.rows[0] as unknown as SchedulingScenario | undefined;

  if (!scenario) return null;

  return {
    ...scenario,
    workerPoolParsed: JSON.parse(scenario.worker_pool) as WorkerPoolOverride[],
  };
}

// Generate schedule for a scenario (calculate deadline risks with scenario overrides)
export async function generateScenarioSchedule(scenarioId: number): Promise<{
  scenario: SchedulingScenario;
  deadlineRisks: DeadlineRisk[];
  capacityAnalysis: CapacityAnalysis;
} | null> {
  const scenario = await getScenario(scenarioId);
  if (!scenario) return null;

  const workerOverrides = scenario.workerPoolParsed;

  // Recalculate deadline risks with scenario worker pool
  const ordersResult = await db.execute(`
    SELECT o.id, o.due_date, o.quantity, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status IN ('pending', 'scheduled', 'in_progress')
    ORDER BY o.due_date
  `);
  const orders = ordersResult.rows as unknown as { id: number; due_date: string; quantity: number; product_name: string }[];

  const today = new Date().toISOString().split('T')[0]!;
  const deadlineRisks: DeadlineRisk[] = [];

  for (const order of orders) {
    const requiredHours = await calculateOrderHours(order.id);
    const availableHours = await getAvailableCapacity(today, order.due_date, workerOverrides);

    const canMeet = availableHours >= requiredHours;
    const shortfallHours = canMeet ? 0 : requiredHours - availableHours;

    deadlineRisks.push({
      orderId: order.id,
      productName: order.product_name,
      dueDate: order.due_date,
      requiredHours: Math.round(requiredHours * 10) / 10,
      availableHours: Math.round(availableHours * 10) / 10,
      canMeet,
      shortfallHours: Math.round(shortfallHours * 10) / 10,
    });
  }

  // Capacity analysis with scenario
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 56); // 8 weeks

  const totalAvailableHours = await getAvailableCapacity(today, endDate.toISOString().split('T')[0]!, workerOverrides);

  let totalRequiredHours = 0;
  for (const order of orders) {
    totalRequiredHours += await calculateOrderHours(order.id);
  }

  // Calculate weekly breakdown for scenario
  const weeklyBreakdown: CapacityAnalysis['weeklyBreakdown'] = [];
  let currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1); // Monday

  for (let i = 0; i < 8; i++) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekAvailable = await getAvailableCapacity(
      currentWeekStart.toISOString().split('T')[0]!,
      weekEnd.toISOString().split('T')[0]!,
      workerOverrides
    );

    // Get scheduled hours for this week
    const scheduledHoursResult = await db.execute({
      sql: `
      SELECT SUM(
        (CAST(substr(end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(end_time, 4, 2) AS INTEGER)) -
        (CAST(substr(start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(start_time, 4, 2) AS INTEGER))
      ) / 60.0 as total_hours
      FROM schedule_entries
      WHERE date >= ? AND date <= ?
    `,
      args: [
        currentWeekStart.toISOString().split('T')[0]!,
        weekEnd.toISOString().split('T')[0]!
      ]
    });
    const scheduledHours = scheduledHoursResult.rows[0] as unknown as { total_hours: number | null };

    weeklyBreakdown.push({
      weekStart: currentWeekStart.toISOString().split('T')[0]!,
      availableHours: Math.round(weekAvailable),
      requiredHours: Math.round(scheduledHours.total_hours || 0),
    });

    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  const capacityAnalysis: CapacityAnalysis = {
    totalAvailableHours: Math.round(totalAvailableHours),
    totalRequiredHours: Math.round(totalRequiredHours),
    utilizationPercent: totalAvailableHours > 0
      ? Math.round((totalRequiredHours / totalAvailableHours) * 100)
      : 0,
    weeklyBreakdown,
  };

  return {
    scenario,
    deadlineRisks,
    capacityAnalysis,
  };
}

// Delete a scenario
export async function deleteScenario(scenarioId: number): Promise<boolean> {
  const scenarioResult = await db.execute({
    sql: "SELECT id FROM scheduling_scenarios WHERE id = ?",
    args: [scenarioId]
  });
  const scenario = scenarioResult.rows[0];
  if (!scenario) return false;

  await db.execute({
    sql: "DELETE FROM scenario_schedules WHERE scenario_id = ?",
    args: [scenarioId]
  });
  await db.execute({
    sql: "DELETE FROM scheduling_scenarios WHERE id = ?",
    args: [scenarioId]
  });

  return true;
}

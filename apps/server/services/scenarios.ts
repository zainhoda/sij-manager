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
function calculateOrderHours(orderId: number): number {
  const order = db.query(`
    SELECT o.quantity, ps.time_per_piece_seconds
    FROM orders o
    JOIN products p ON o.product_id = p.id
    JOIN product_steps ps ON ps.product_id = p.id
    WHERE o.id = ?
  `).all(orderId) as { quantity: number; time_per_piece_seconds: number }[];

  let totalSeconds = 0;
  for (const step of order) {
    totalSeconds += step.quantity * step.time_per_piece_seconds;
  }

  return totalSeconds / 3600; // Convert to hours
}

// Get available work capacity (hours) for a date range
function getAvailableCapacity(
  startDate: string,
  endDate: string,
  workerOverrides?: WorkerPoolOverride[]
): number {
  // Get active workers
  let workers = db.query(
    "SELECT id FROM workers WHERE status = 'active'"
  ).all() as { id: number }[];

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
export function getDeadlineRisks(): DeadlineRisk[] {
  const orders = db.query(`
    SELECT o.id, o.due_date, o.quantity, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status IN ('pending', 'scheduled', 'in_progress')
    ORDER BY o.due_date
  `).all() as { id: number; due_date: string; quantity: number; product_name: string }[];

  const today = new Date().toISOString().split('T')[0]!;
  const risks: DeadlineRisk[] = [];

  for (const order of orders) {
    const requiredHours = calculateOrderHours(order.id);
    const availableHours = getAvailableCapacity(today, order.due_date);

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
export function getOvertimeProjections(): OvertimeProjection[] {
  // Get scheduled entries grouped by date
  const entries = db.query(`
    SELECT
      date,
      start_time,
      end_time
    FROM schedule_entries
    WHERE date >= date('now')
    ORDER BY date
  `).all() as { date: string; start_time: string; end_time: string }[];

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
export function getCapacityAnalysis(weeks: number = 8): CapacityAnalysis {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + weeks * 7);

  const totalAvailableHours = getAvailableCapacity(
    today.toISOString().split('T')[0]!,
    endDate.toISOString().split('T')[0]!
  );

  // Calculate required hours from all pending orders
  const orders = db.query(
    "SELECT id FROM orders WHERE status IN ('pending', 'scheduled', 'in_progress')"
  ).all() as { id: number }[];

  let totalRequiredHours = 0;
  for (const order of orders) {
    totalRequiredHours += calculateOrderHours(order.id);
  }

  // Weekly breakdown
  const weeklyBreakdown: CapacityAnalysis['weeklyBreakdown'] = [];
  let currentWeekStart = new Date(today);
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1); // Monday

  for (let i = 0; i < weeks; i++) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekAvailable = getAvailableCapacity(
      currentWeekStart.toISOString().split('T')[0]!,
      weekEnd.toISOString().split('T')[0]!
    );

    // Get scheduled hours for this week
    const scheduledHours = db.query(`
      SELECT SUM(
        (CAST(substr(end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(end_time, 4, 2) AS INTEGER)) -
        (CAST(substr(start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(start_time, 4, 2) AS INTEGER))
      ) / 60.0 as total_hours
      FROM schedule_entries
      WHERE date >= ? AND date <= ?
    `).get(
      currentWeekStart.toISOString().split('T')[0],
      weekEnd.toISOString().split('T')[0]
    ) as { total_hours: number | null };

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
export function createScenario(
  name: string,
  description: string | null,
  workerPoolOverrides: WorkerPoolOverride[]
): SchedulingScenario {
  const workerPool = JSON.stringify(workerPoolOverrides);

  const result = db.run(
    "INSERT INTO scheduling_scenarios (name, description, worker_pool) VALUES (?, ?, ?)",
    [name, description, workerPool]
  );

  return db.query("SELECT * FROM scheduling_scenarios WHERE id = ?").get(result.lastInsertRowid) as SchedulingScenario;
}

// Get all scenarios with parsed worker pools
export function getScenarios(): (SchedulingScenario & { workerPoolParsed: WorkerPoolOverride[] })[] {
  const scenarios = db.query("SELECT * FROM scheduling_scenarios ORDER BY created_at DESC").all() as SchedulingScenario[];
  return scenarios.map((s) => ({
    ...s,
    workerPoolParsed: JSON.parse(s.worker_pool) as WorkerPoolOverride[],
  }));
}

// Get scenario by ID with parsed worker pool
export function getScenario(scenarioId: number): (SchedulingScenario & { workerPoolParsed: WorkerPoolOverride[] }) | null {
  const scenario = db.query("SELECT * FROM scheduling_scenarios WHERE id = ?").get(scenarioId) as SchedulingScenario | null;

  if (!scenario) return null;

  return {
    ...scenario,
    workerPoolParsed: JSON.parse(scenario.worker_pool) as WorkerPoolOverride[],
  };
}

// Generate schedule for a scenario (calculate deadline risks with scenario overrides)
export function generateScenarioSchedule(scenarioId: number): {
  scenario: SchedulingScenario;
  deadlineRisks: DeadlineRisk[];
  capacityAnalysis: CapacityAnalysis;
} | null {
  const scenario = getScenario(scenarioId);
  if (!scenario) return null;

  const workerOverrides = scenario.workerPoolParsed;

  // Recalculate deadline risks with scenario worker pool
  const orders = db.query(`
    SELECT o.id, o.due_date, o.quantity, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    WHERE o.status IN ('pending', 'scheduled', 'in_progress')
    ORDER BY o.due_date
  `).all() as { id: number; due_date: string; quantity: number; product_name: string }[];

  const today = new Date().toISOString().split('T')[0]!;
  const deadlineRisks: DeadlineRisk[] = [];

  for (const order of orders) {
    const requiredHours = calculateOrderHours(order.id);
    const availableHours = getAvailableCapacity(today, order.due_date, workerOverrides);

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

  const totalAvailableHours = getAvailableCapacity(today, endDate.toISOString().split('T')[0]!, workerOverrides);

  let totalRequiredHours = 0;
  for (const order of orders) {
    totalRequiredHours += calculateOrderHours(order.id);
  }

  // Calculate weekly breakdown for scenario
  const weeklyBreakdown: CapacityAnalysis['weeklyBreakdown'] = [];
  let currentWeekStart = new Date();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1); // Monday

  for (let i = 0; i < 8; i++) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekAvailable = getAvailableCapacity(
      currentWeekStart.toISOString().split('T')[0]!,
      weekEnd.toISOString().split('T')[0]!,
      workerOverrides
    );

    // Get scheduled hours for this week
    const scheduledHours = db.query(`
      SELECT SUM(
        (CAST(substr(end_time, 1, 2) AS INTEGER) * 60 + CAST(substr(end_time, 4, 2) AS INTEGER)) -
        (CAST(substr(start_time, 1, 2) AS INTEGER) * 60 + CAST(substr(start_time, 4, 2) AS INTEGER))
      ) / 60.0 as total_hours
      FROM schedule_entries
      WHERE date >= ? AND date <= ?
    `).get(
      currentWeekStart.toISOString().split('T')[0],
      weekEnd.toISOString().split('T')[0]
    ) as { total_hours: number | null };

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
export function deleteScenario(scenarioId: number): boolean {
  const scenario = db.query("SELECT id FROM scheduling_scenarios WHERE id = ?").get(scenarioId);
  if (!scenario) return false;

  db.run("DELETE FROM scenario_schedules WHERE scenario_id = ?", [scenarioId]);
  db.run("DELETE FROM scheduling_scenarios WHERE id = ?", [scenarioId]);

  return true;
}

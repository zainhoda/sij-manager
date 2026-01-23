import { db } from "../db";

// Proficiency multipliers - defined locally (no longer imported)
// These map proficiency levels (1-5) to speed multipliers
export const PROFICIENCY_MULTIPLIERS: Record<number, number> = {
  1: 0.7,   // 70% speed - beginner
  2: 0.85,  // 85% speed - learning
  3: 1.0,   // 100% speed - proficient (baseline)
  4: 1.15,  // 115% speed - advanced
  5: 1.3,   // 130% speed - expert
};

// Derive proficiency level from efficiency percentage
export function deriveProficiencyLevel(efficiencyPercent: number): number {
  if (efficiencyPercent >= 130) return 5;
  if (efficiencyPercent >= 115) return 4;
  if (efficiencyPercent >= 85) return 3;
  if (efficiencyPercent >= 70) return 2;
  return 1;
}

interface StepProductivity {
  stepId: number;
  stepName: string;
  category: string;
  totalUnits: number;
  totalMinutes: number;
  averageEfficiency: number;
  entryCount: number;
  currentProficiency: number;
}

interface ProductivitySummary {
  workerId: number;
  workerName: string;
  totalHoursWorked: number;
  totalUnitsProduced: number;
  averageEfficiency: number;
  stepBreakdown: StepProductivity[];
}

interface ProductivityDataPoint {
  date: string;
  efficiency: number;
  unitsProduced: number;
}

interface ProficiencyHistoryEntry {
  date: string;
  bomStepId: number;
  stepName: string;
  productName: string;
  efficiencyPercent: number;
  derivedLevel: number;
}

// Get worker productivity summary using production_history + bom_steps + worker_step_performance
export async function getWorkerProductivity(workerId: number): Promise<ProductivitySummary | null> {
  const workerResult = await db.execute({
    sql: "SELECT id, name FROM workers WHERE id = ?",
    args: [workerId]
  });
  const worker = workerResult.rows[0] as unknown as { id: number; name: string } | undefined;

  if (!worker) return null;

  // Get productivity from production_history grouped by step
  const entriesResult = await db.execute({
    sql: `
    SELECT
      ph.bom_step_id as step_id,
      ph.step_name,
      wc.name as category,
      SUM(ph.units_produced) as total_units,
      SUM(ph.actual_seconds) / 60.0 as total_minutes,
      SUM(ph.expected_seconds) / 60.0 as expected_minutes,
      COUNT(*) as entry_count
    FROM production_history ph
    JOIN bom_steps bs ON ph.bom_step_id = bs.id
    LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
    WHERE ph.worker_id = ?
    GROUP BY ph.bom_step_id, ph.step_name, wc.name
  `,
    args: [workerId]
  });

  const entries = entriesResult.rows as unknown as {
    step_id: number;
    step_name: string;
    category: string | null;
    total_units: number;
    total_minutes: number;
    expected_minutes: number | null;
    entry_count: number;
  }[];

  if (entries.length === 0) {
    return {
      workerId,
      workerName: worker.name,
      totalHoursWorked: 0,
      totalUnitsProduced: 0,
      averageEfficiency: 0,
      stepBreakdown: [],
    };
  }

  // Calculate step breakdown with efficiency and derived proficiency
  const stepBreakdown: StepProductivity[] = [];
  let totalMinutesWorked = 0;
  let totalUnits = 0;
  let totalExpectedMinutes = 0;

  for (const entry of entries) {
    const efficiency = entry.total_minutes > 0 && entry.expected_minutes
      ? (entry.expected_minutes / entry.total_minutes) * 100
      : 0;

    // Get proficiency from worker_step_performance (derived from avg_efficiency_percent)
    const perfResult = await db.execute({
      sql: "SELECT avg_efficiency_percent FROM worker_step_performance WHERE worker_id = ? AND bom_step_id = ?",
      args: [workerId, entry.step_id]
    });
    const perf = perfResult.rows[0] as unknown as { avg_efficiency_percent: number | null } | undefined;
    const avgEfficiency = perf?.avg_efficiency_percent ?? efficiency;
    const derivedProficiency = deriveProficiencyLevel(avgEfficiency);

    stepBreakdown.push({
      stepId: entry.step_id,
      stepName: entry.step_name,
      category: entry.category ?? 'Other',
      totalUnits: entry.total_units,
      totalMinutes: Math.round(entry.total_minutes),
      averageEfficiency: Math.round(efficiency),
      entryCount: entry.entry_count,
      currentProficiency: derivedProficiency,
    });

    totalMinutesWorked += entry.total_minutes;
    totalUnits += entry.total_units;
    totalExpectedMinutes += entry.expected_minutes ?? 0;
  }

  // Overall efficiency
  const averageEfficiency = totalMinutesWorked > 0 && totalExpectedMinutes > 0
    ? (totalExpectedMinutes / totalMinutesWorked) * 100
    : 0;

  return {
    workerId,
    workerName: worker.name,
    totalHoursWorked: Math.round(totalMinutesWorked / 60 * 10) / 10,
    totalUnitsProduced: totalUnits,
    averageEfficiency: Math.round(averageEfficiency),
    stepBreakdown,
  };
}

// Get worker productivity history (data points over time) from production_history
export async function getWorkerProductivityHistory(workerId: number, days: number = 30): Promise<ProductivityDataPoint[]> {
  const result = await db.execute({
    sql: `
    SELECT
      date,
      SUM(units_produced) as units,
      CASE
        WHEN SUM(actual_seconds) > 0 THEN SUM(expected_seconds) * 100.0 / SUM(actual_seconds)
        ELSE 0
      END as efficiency
    FROM production_history
    WHERE worker_id = ?
    AND date >= date('now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date
  `,
    args: [workerId, days]
  });

  const rows = result.rows as unknown as {
    date: string;
    units: number;
    efficiency: number | null;
  }[];

  return rows.map(row => ({
    date: row.date,
    efficiency: Math.round(row.efficiency ?? 0),
    unitsProduced: row.units,
  }));
}

// Get proficiency history for a worker - derived from production_history
export async function getWorkerProficiencyHistory(workerId: number): Promise<ProficiencyHistoryEntry[]> {
  const result = await db.execute({
    sql: `
    SELECT
      date,
      bom_step_id,
      step_name,
      fishbowl_bom_num as product_name,
      efficiency_percent,
      CASE
        WHEN efficiency_percent >= 130 THEN 5
        WHEN efficiency_percent >= 115 THEN 4
        WHEN efficiency_percent >= 85 THEN 3
        WHEN efficiency_percent >= 70 THEN 2
        ELSE 1
      END as derived_level
    FROM production_history
    WHERE worker_id = ?
    AND efficiency_percent IS NOT NULL
    ORDER BY date DESC
    LIMIT 50
  `,
    args: [workerId]
  });

  const rows = result.rows as unknown as {
    date: string;
    bom_step_id: number;
    step_name: string;
    product_name: string;
    efficiency_percent: number;
    derived_level: number;
  }[];

  return rows.map(row => ({
    date: row.date,
    bomStepId: row.bom_step_id,
    stepName: row.step_name,
    productName: row.product_name,
    efficiencyPercent: row.efficiency_percent,
    derivedLevel: row.derived_level,
  }));
}

// Assignment Analytics Interfaces
export interface AssignmentOutputHistoryEntry {
  id: number;
  output: number;
  recorded_at: string;
}

export interface AssignmentTimeMetrics {
  assignmentId: number;
  totalUpdates: number;
  beginningAvgTimePerPiece: number | null;
  middleAvgTimePerPiece: number | null;
  endAvgTimePerPiece: number | null;
  overallAvgTimePerPiece: number | null;
  speedupPercentage: number | null;
  currentOutput: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface AssignmentAnalytics {
  assignmentId: number;
  planTaskId: number;
  workerId: number;
  workerName: string;
  stepName: string;
  category: string;
  timePerPieceSeconds: number;
  plannedOutput: number;
  currentOutput: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
  outputHistory: AssignmentOutputHistoryEntry[];
  timeMetrics: AssignmentTimeMetrics | null;
}

// Get assignment output history - returns empty (no assignment_output_history table)
export async function getAssignmentOutputHistory(_assignmentId: number): Promise<AssignmentOutputHistoryEntry[]> {
  // assignment_output_history table no longer exists
  // Return empty array - speedup tracking not yet implemented
  return [];
}

// Calculate time-per-piece metrics for an assignment
// Returns null metrics gracefully since we don't have granular output history
export async function getAssignmentTimeMetrics(assignmentId: number): Promise<AssignmentTimeMetrics | null> {
  // Get assignment info from task_assignments + plan_tasks + bom_steps
  const assignmentResult = await db.execute({
    sql: `
    SELECT
      ta.id,
      ta.actual_start_time,
      ta.actual_end_time,
      ta.actual_output,
      ta.status,
      bs.time_per_piece_seconds
    FROM task_assignments ta
    JOIN plan_tasks pt ON ta.plan_task_id = pt.id
    JOIN bom_steps bs ON pt.bom_step_id = bs.id
    WHERE ta.id = ?
  `,
    args: [assignmentId]
  });

  const assignment = assignmentResult.rows[0] as unknown as {
    id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    time_per_piece_seconds: number;
  } | undefined;

  if (!assignment) return null;

  // No granular output history available, return null metrics
  return {
    assignmentId,
    totalUpdates: 0,
    beginningAvgTimePerPiece: null,
    middleAvgTimePerPiece: null,
    endAvgTimePerPiece: null,
    overallAvgTimePerPiece: null,
    speedupPercentage: null,
    currentOutput: assignment.actual_output,
    startTime: assignment.actual_start_time,
    endTime: assignment.actual_end_time,
    status: assignment.status,
  };
}

// Get single assignment analytics using task_assignments + plan_tasks + bom_steps
export async function getAssignmentAnalytics(assignmentId: number): Promise<AssignmentAnalytics | null> {
  const assignmentResult = await db.execute({
    sql: `
    SELECT
      ta.id as assignment_id,
      ta.plan_task_id,
      ta.worker_id,
      ta.actual_start_time,
      ta.actual_end_time,
      ta.actual_output,
      ta.status,
      w.name as worker_name,
      bs.name as step_name,
      wc.name as category,
      bs.time_per_piece_seconds,
      pt.planned_output
    FROM task_assignments ta
    JOIN workers w ON ta.worker_id = w.id
    JOIN plan_tasks pt ON ta.plan_task_id = pt.id
    JOIN bom_steps bs ON pt.bom_step_id = bs.id
    LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
    WHERE ta.id = ?
  `,
    args: [assignmentId]
  });

  const assignment = assignmentResult.rows[0] as unknown as {
    assignment_id: number;
    plan_task_id: number;
    worker_id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    worker_name: string;
    step_name: string;
    category: string | null;
    time_per_piece_seconds: number;
    planned_output: number;
  } | undefined;

  if (!assignment) return null;

  const outputHistory = await getAssignmentOutputHistory(assignment.assignment_id);
  const timeMetrics = await getAssignmentTimeMetrics(assignment.assignment_id);

  return {
    assignmentId: assignment.assignment_id,
    planTaskId: assignment.plan_task_id,
    workerId: assignment.worker_id,
    workerName: assignment.worker_name,
    stepName: assignment.step_name,
    category: assignment.category ?? 'Other',
    timePerPieceSeconds: assignment.time_per_piece_seconds,
    plannedOutput: assignment.planned_output,
    currentOutput: assignment.actual_output,
    startTime: assignment.actual_start_time,
    endTime: assignment.actual_end_time,
    status: assignment.status,
    outputHistory,
    timeMetrics,
  };
}

// Get all assignment analytics for a worker using task_assignments + plan_tasks + bom_steps
export async function getWorkerAssignmentAnalytics(workerId: number): Promise<AssignmentAnalytics[]> {
  const assignmentsResult = await db.execute({
    sql: `
    SELECT
      ta.id as assignment_id,
      ta.plan_task_id,
      ta.worker_id,
      ta.actual_start_time,
      ta.actual_end_time,
      ta.actual_output,
      ta.status,
      w.name as worker_name,
      bs.name as step_name,
      wc.name as category,
      bs.time_per_piece_seconds,
      pt.planned_output
    FROM task_assignments ta
    JOIN workers w ON ta.worker_id = w.id
    JOIN plan_tasks pt ON ta.plan_task_id = pt.id
    JOIN bom_steps bs ON pt.bom_step_id = bs.id
    LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
    WHERE ta.worker_id = ?
    AND ta.status IN ('in_progress', 'completed')
    ORDER BY ta.assigned_at DESC
    LIMIT 50
  `,
    args: [workerId]
  });

  const assignments = assignmentsResult.rows as unknown as {
    assignment_id: number;
    plan_task_id: number;
    worker_id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    worker_name: string;
    step_name: string;
    category: string | null;
    time_per_piece_seconds: number;
    planned_output: number;
  }[];

  const results: AssignmentAnalytics[] = [];

  for (const assignment of assignments) {
    const outputHistory = await getAssignmentOutputHistory(assignment.assignment_id);
    const timeMetrics = await getAssignmentTimeMetrics(assignment.assignment_id);

    results.push({
      assignmentId: assignment.assignment_id,
      planTaskId: assignment.plan_task_id,
      workerId: assignment.worker_id,
      workerName: assignment.worker_name,
      stepName: assignment.step_name,
      category: assignment.category ?? 'Other',
      timePerPieceSeconds: assignment.time_per_piece_seconds,
      plannedOutput: assignment.planned_output,
      currentOutput: assignment.actual_output,
      startTime: assignment.actual_start_time,
      endTime: assignment.actual_end_time,
      status: assignment.status,
      outputHistory,
      timeMetrics,
    });
  }

  return results;
}

// Get derived proficiency level for a worker-step combination
// Uses worker_step_performance.avg_efficiency_percent
export async function getWorkerStepProficiency(workerId: number, bomStepId: number): Promise<number> {
  const result = await db.execute({
    sql: "SELECT avg_efficiency_percent FROM worker_step_performance WHERE worker_id = ? AND bom_step_id = ?",
    args: [workerId, bomStepId]
  });

  const perf = result.rows[0] as unknown as { avg_efficiency_percent: number | null } | undefined;

  if (!perf || perf.avg_efficiency_percent === null) {
    return 3; // Default to proficient level
  }

  return deriveProficiencyLevel(perf.avg_efficiency_percent);
}

// Update worker_step_performance aggregates from production_history
export async function updateWorkerStepPerformance(workerId: number, bomStepId: number): Promise<void> {
  // Get aggregated metrics from production_history
  const metricsResult = await db.execute({
    sql: `
    SELECT
      SUM(units_produced) as total_units,
      SUM(actual_seconds) as total_actual,
      SUM(expected_seconds) as total_expected,
      COUNT(*) as sample_count,
      AVG(efficiency_percent) as avg_efficiency
    FROM production_history
    WHERE worker_id = ? AND bom_step_id = ?
  `,
    args: [workerId, bomStepId]
  });

  const metrics = metricsResult.rows[0] as unknown as {
    total_units: number | null;
    total_actual: number | null;
    total_expected: number | null;
    sample_count: number;
    avg_efficiency: number | null;
  };

  if (!metrics || metrics.sample_count === 0) return;

  // Get recent efficiency (last 10 entries) for trend calculation
  const recentResult = await db.execute({
    sql: `
    SELECT AVG(efficiency_percent) as recent_efficiency
    FROM (
      SELECT efficiency_percent
      FROM production_history
      WHERE worker_id = ? AND bom_step_id = ?
      ORDER BY date DESC, recorded_at DESC
      LIMIT 10
    )
  `,
    args: [workerId, bomStepId]
  });

  const recent = recentResult.rows[0] as unknown as { recent_efficiency: number | null };

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' | null = null;
  if (metrics.avg_efficiency !== null && recent?.recent_efficiency !== null) {
    const diff = recent.recent_efficiency - metrics.avg_efficiency;
    if (diff > 5) trend = 'improving';
    else if (diff < -5) trend = 'declining';
    else trend = 'stable';
  }

  // Upsert worker_step_performance
  await db.execute({
    sql: `
    INSERT INTO worker_step_performance (
      worker_id, bom_step_id, total_units_produced, total_actual_seconds,
      total_expected_seconds, avg_efficiency_percent, sample_count,
      recent_efficiency_percent, trend, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (worker_id, bom_step_id) DO UPDATE SET
      total_units_produced = excluded.total_units_produced,
      total_actual_seconds = excluded.total_actual_seconds,
      total_expected_seconds = excluded.total_expected_seconds,
      avg_efficiency_percent = excluded.avg_efficiency_percent,
      sample_count = excluded.sample_count,
      recent_efficiency_percent = excluded.recent_efficiency_percent,
      trend = excluded.trend,
      last_updated = CURRENT_TIMESTAMP
  `,
    args: [
      workerId,
      bomStepId,
      metrics.total_units ?? 0,
      metrics.total_actual ?? 0,
      metrics.total_expected ?? 0,
      metrics.avg_efficiency,
      metrics.sample_count,
      recent?.recent_efficiency ?? null,
      trend,
    ]
  });
}

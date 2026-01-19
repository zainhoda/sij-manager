import { db } from "../db";
import type { ScheduleEntry, WorkerProficiency, ProficiencyHistory } from "../db/schema";
import { PROFICIENCY_MULTIPLIERS } from "../routes/proficiencies";

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

interface ProficiencyAdjustment {
  workerId: number;
  productStepId: number;
  currentLevel: number;
  newLevel: number;
  reason: 'auto_increase' | 'auto_decrease';
  avgEfficiency: number;
  sampleSize: number;
}

// Get worker productivity summary
export async function getWorkerProductivity(workerId: number): Promise<ProductivitySummary | null> {
  const workerResult = await db.execute({
    sql: "SELECT id, name FROM workers WHERE id = ?",
    args: [workerId]
  });
  const worker = workerResult.rows[0] as unknown as { id: number; name: string } | undefined;
  
  if (!worker) return null;

  // Get completed entries with time calculations
  const entriesResult = await db.execute({
    sql: `
    SELECT
      se.id,
      se.product_step_id,
      se.actual_start_time,
      se.actual_end_time,
      se.actual_output,
      se.planned_output,
      ps.name as step_name,
      ps.category,
      ps.time_per_piece_seconds
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE se.worker_id = ?
    AND se.status = 'completed'
    AND se.actual_start_time IS NOT NULL
    AND se.actual_end_time IS NOT NULL
    ORDER BY se.date DESC
  `,
    args: [workerId]
  });
  
  const entries = entriesResult.rows as unknown as {
    id: number;
    product_step_id: number;
    actual_start_time: string;
    actual_end_time: string;
    actual_output: number;
    planned_output: number;
    step_name: string;
    category: string;
    time_per_piece_seconds: number;
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

  // Calculate metrics by step
  const stepMetrics: Record<number, {
    stepId: number;
    stepName: string;
    category: string;
    totalUnits: number;
    totalMinutes: number;
    expectedMinutes: number;
    entryCount: number;
  }> = {};

  let totalMinutesWorked = 0;
  let totalUnits = 0;
  let totalExpectedMinutes = 0;

  for (const entry of entries) {
    const startTime = new Date(`2000-01-01T${entry.actual_start_time}`);
    const endTime = new Date(`2000-01-01T${entry.actual_end_time}`);
    const actualMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

    const expectedMinutes = (entry.actual_output * entry.time_per_piece_seconds) / 60;

    totalMinutesWorked += actualMinutes;
    totalUnits += entry.actual_output;
    totalExpectedMinutes += expectedMinutes;

    if (!stepMetrics[entry.product_step_id]) {
      stepMetrics[entry.product_step_id] = {
        stepId: entry.product_step_id,
        stepName: entry.step_name,
        category: entry.category,
        totalUnits: 0,
        totalMinutes: 0,
        expectedMinutes: 0,
        entryCount: 0,
      };
    }

    stepMetrics[entry.product_step_id]!.totalUnits += entry.actual_output;
    stepMetrics[entry.product_step_id]!.totalMinutes += actualMinutes;
    stepMetrics[entry.product_step_id]!.expectedMinutes += expectedMinutes;
    stepMetrics[entry.product_step_id]!.entryCount += 1;
  }

  // Calculate step breakdown with efficiency and proficiency
  const stepBreakdown: StepProductivity[] = [];
  
  for (const step of Object.values(stepMetrics)) {
    const efficiency = step.totalMinutes > 0
      ? (step.expectedMinutes / step.totalMinutes) * 100
      : 0;

    // Get current proficiency
    const profResult = await db.execute({
      sql: "SELECT level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
      args: [workerId, step.stepId]
    });
    const proficiency = profResult.rows[0] as unknown as { level: number } | undefined;

    stepBreakdown.push({
      stepId: step.stepId,
      stepName: step.stepName,
      category: step.category,
      totalUnits: step.totalUnits,
      totalMinutes: Math.round(step.totalMinutes),
      averageEfficiency: Math.round(efficiency),
      entryCount: step.entryCount,
      currentProficiency: proficiency?.level ?? 3,
    });
  }

  // Overall efficiency
  const averageEfficiency = totalMinutesWorked > 0
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

// Get worker productivity history (data points over time)
export async function getWorkerProductivityHistory(workerId: number, days: number = 30): Promise<ProductivityDataPoint[]> {
  const entriesResult = await db.execute({
    sql: `
    SELECT
      se.date,
      se.actual_start_time,
      se.actual_end_time,
      se.actual_output,
      ps.time_per_piece_seconds
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE se.worker_id = ?
    AND se.status = 'completed'
    AND se.actual_start_time IS NOT NULL
    AND se.actual_end_time IS NOT NULL
    AND se.date >= date('now', '-' || ? || ' days')
    ORDER BY se.date
  `,
    args: [workerId, days]
  });
  
  const entries = entriesResult.rows as unknown as {
    date: string;
    actual_start_time: string;
    actual_end_time: string;
    actual_output: number;
    time_per_piece_seconds: number;
  }[];

  // Group by date
  const byDate: Record<string, { totalMinutes: number; expectedMinutes: number; units: number }> = {};

  for (const entry of entries) {
    const startTime = new Date(`2000-01-01T${entry.actual_start_time}`);
    const endTime = new Date(`2000-01-01T${entry.actual_end_time}`);
    const actualMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    const expectedMinutes = (entry.actual_output * entry.time_per_piece_seconds) / 60;

    if (!byDate[entry.date]) {
      byDate[entry.date] = { totalMinutes: 0, expectedMinutes: 0, units: 0 };
    }
    byDate[entry.date]!.totalMinutes += actualMinutes;
    byDate[entry.date]!.expectedMinutes += expectedMinutes;
    byDate[entry.date]!.units += entry.actual_output;
  }

  return Object.entries(byDate).map(([date, data]) => ({
    date,
    efficiency: data.totalMinutes > 0 ? Math.round((data.expectedMinutes / data.totalMinutes) * 100) : 0,
    unitsProduced: data.units,
  }));
}

// Get proficiency change history for a worker
export async function getWorkerProficiencyHistory(workerId: number): Promise<ProficiencyHistory[]> {
  const result = await db.execute({
    sql: `
    SELECT ph.*, ps.name as step_name, p.name as product_name
    FROM proficiency_history ph
    JOIN product_steps ps ON ph.product_step_id = ps.id
    JOIN products p ON ps.product_id = p.id
    WHERE ph.worker_id = ?
    ORDER BY ph.created_at DESC
    LIMIT 50
  `,
    args: [workerId]
  });
  return result.rows as unknown as (ProficiencyHistory & { step_name: string; product_name: string })[];
}

// Calculate automatic proficiency adjustments based on performance
export async function calculateAutoAdjustments(): Promise<ProficiencyAdjustment[]> {
  const adjustments: ProficiencyAdjustment[] = [];

  // Get all worker-step pairs with completed entries in the last 30 days
  const pairsResult = await db.execute(`
    SELECT DISTINCT worker_id, product_step_id
    FROM schedule_entries
    WHERE status = 'completed'
    AND worker_id IS NOT NULL
    AND actual_start_time IS NOT NULL
    AND actual_end_time IS NOT NULL
    AND date >= date('now', '-30 days')
  `);
  
  const workerStepPairs = pairsResult.rows as unknown as { worker_id: number; product_step_id: number }[];

  for (const pair of workerStepPairs) {
    // Get recent entries for this worker-step pair
    const entriesResult = await db.execute({
      sql: `
      SELECT
        se.actual_start_time,
        se.actual_end_time,
        se.actual_output,
        ps.time_per_piece_seconds
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.worker_id = ?
      AND se.product_step_id = ?
      AND se.status = 'completed'
      AND se.actual_start_time IS NOT NULL
      AND se.actual_end_time IS NOT NULL
      AND se.date >= date('now', '-30 days')
      ORDER BY se.date DESC
      LIMIT 10
    `,
      args: [pair.worker_id, pair.product_step_id]
    });
    
    const entries = entriesResult.rows as unknown as {
      actual_start_time: string;
      actual_end_time: string;
      actual_output: number;
      time_per_piece_seconds: number;
    }[];

    // Need at least 5 samples
    if (entries.length < 5) continue;

    // Calculate average efficiency
    let totalEfficiency = 0;
    for (const entry of entries) {
      const startTime = new Date(`2000-01-01T${entry.actual_start_time}`);
      const endTime = new Date(`2000-01-01T${entry.actual_end_time}`);
      const actualMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
      const expectedMinutes = (entry.actual_output * entry.time_per_piece_seconds) / 60;

      if (actualMinutes > 0) {
        totalEfficiency += (expectedMinutes / actualMinutes) * 100;
      }
    }

    const avgEfficiency = totalEfficiency / entries.length;

    // Get current proficiency
    const profResult = await db.execute({
      sql: "SELECT level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
      args: [pair.worker_id, pair.product_step_id]
    });
    const currentProf = profResult.rows[0] as unknown as { level: number } | undefined;

    const currentLevel = currentProf?.level ?? 3;

    // Check if adjustment is needed
    // Increase if consistently > 120% efficiency (working 20% faster than expected)
    if (avgEfficiency > 120 && currentLevel < 5) {
      adjustments.push({
        workerId: pair.worker_id,
        productStepId: pair.product_step_id,
        currentLevel,
        newLevel: Math.min(5, currentLevel + 1) as 1 | 2 | 3 | 4 | 5,
        reason: 'auto_increase',
        avgEfficiency: Math.round(avgEfficiency),
        sampleSize: entries.length,
      });
    }
    // Decrease if consistently < 80% efficiency (working 20% slower than expected)
    else if (avgEfficiency < 80 && currentLevel > 1) {
      adjustments.push({
        workerId: pair.worker_id,
        productStepId: pair.product_step_id,
        currentLevel,
        newLevel: Math.max(1, currentLevel - 1) as 1 | 2 | 3 | 4 | 5,
        reason: 'auto_decrease',
        avgEfficiency: Math.round(avgEfficiency),
        sampleSize: entries.length,
      });
    }
  }

  return adjustments;
}

// Apply a proficiency adjustment
export async function applyProficiencyAdjustment(adjustment: ProficiencyAdjustment): Promise<void> {
  // Check if proficiency record exists
  const existingResult = await db.execute({
    sql: "SELECT id FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
    args: [adjustment.workerId, adjustment.productStepId]
  });
  const existing = existingResult.rows[0] as unknown as { id: number } | undefined;

  if (existing) {
    await db.execute({
      sql: "UPDATE worker_proficiencies SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [adjustment.newLevel, existing.id]
    });
  } else {
    await db.execute({
      sql: "INSERT INTO worker_proficiencies (worker_id, product_step_id, level) VALUES (?, ?, ?)",
      args: [adjustment.workerId, adjustment.productStepId, adjustment.newLevel]
    });
  }

  // Record in history
  const triggerData = JSON.stringify({
    avgEfficiency: adjustment.avgEfficiency,
    sampleSize: adjustment.sampleSize,
  });

  await db.execute({
    sql: `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason, trigger_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      adjustment.workerId,
      adjustment.productStepId,
      adjustment.currentLevel,
      adjustment.newLevel,
      adjustment.reason,
      triggerData,
    ]
  });
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
  beginningAvgTimePerPiece: number | null; // seconds per piece (first 25% of updates)
  middleAvgTimePerPiece: number | null; // seconds per piece (middle 50% of updates)
  endAvgTimePerPiece: number | null; // seconds per piece (last 25% of updates)
  overallAvgTimePerPiece: number | null; // seconds per piece (all updates)
  speedupPercentage: number | null; // how much faster at end vs beginning (%)
  currentOutput: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface AssignmentAnalytics {
  assignmentId: number;
  scheduleEntryId: number;
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

// Get assignment output history
export async function getAssignmentOutputHistory(assignmentId: number): Promise<AssignmentOutputHistoryEntry[]> {
  const result = await db.execute({
    sql: `
    SELECT 
      aoh.id,
      aoh.output,
      aoh.recorded_at
    FROM assignment_output_history aoh
    WHERE aoh.assignment_id = ?
    ORDER BY aoh.recorded_at ASC
  `,
    args: [assignmentId]
  });
  return result.rows as unknown as AssignmentOutputHistoryEntry[];
}

// Calculate time-per-piece metrics for an assignment
export async function getAssignmentTimeMetrics(assignmentId: number): Promise<AssignmentTimeMetrics | null> {
  // Get assignment info
  const assignmentResult = await db.execute({
    sql: `
    SELECT 
      twa.id,
      twa.actual_start_time,
      twa.actual_end_time,
      twa.actual_output,
      twa.status,
      ps.time_per_piece_seconds
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE twa.id = ?
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

  // Get output history
  const history = await getAssignmentOutputHistory(assignmentId);
  
  if (history.length < 2) {
    // Not enough data for metrics
    return {
      assignmentId,
      totalUpdates: history.length,
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

  // Calculate time per piece for each interval
  const timePerPieceIntervals: number[] = [];
  
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!;
    const curr = history[i]!;

    const prevTime = new Date(prev.recorded_at).getTime();
    const currTime = new Date(curr.recorded_at).getTime();
    const timeDiffSeconds = (currTime - prevTime) / 1000;
    const outputDiff = curr.output - prev.output;
    
    if (outputDiff > 0 && timeDiffSeconds > 0) {
      const timePerPiece = timeDiffSeconds / outputDiff;
      timePerPieceIntervals.push(timePerPiece);
    }
  }

  if (timePerPieceIntervals.length === 0) {
    return {
      assignmentId,
      totalUpdates: history.length,
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

  // Calculate stage averages
  const totalIntervals = timePerPieceIntervals.length;
  const beginningCount = Math.max(1, Math.floor(totalIntervals * 0.25));
  const middleStart = beginningCount;
  const middleCount = Math.max(1, Math.floor(totalIntervals * 0.5));
  const endStart = middleStart + middleCount;
  const endCount = totalIntervals - endStart;

  const beginningIntervals = timePerPieceIntervals.slice(0, beginningCount);
  const middleIntervals = timePerPieceIntervals.slice(middleStart, middleStart + middleCount);
  const endIntervals = timePerPieceIntervals.slice(endStart);

  const beginningAvg = beginningIntervals.length > 0
    ? beginningIntervals.reduce((a, b) => a + b, 0) / beginningIntervals.length
    : null;
  
  const middleAvg = middleIntervals.length > 0
    ? middleIntervals.reduce((a, b) => a + b, 0) / middleIntervals.length
    : null;
  
  const endAvg = endIntervals.length > 0
    ? endIntervals.reduce((a, b) => a + b, 0) / endIntervals.length
    : null;
  
  const overallAvg = timePerPieceIntervals.reduce((a, b) => a + b, 0) / timePerPieceIntervals.length;

  // Calculate speedup percentage (how much faster at end vs beginning)
  const speedupPercentage = (beginningAvg !== null && endAvg !== null && beginningAvg > 0)
    ? ((beginningAvg - endAvg) / beginningAvg) * 100
    : null;

  return {
    assignmentId,
    totalUpdates: history.length,
    beginningAvgTimePerPiece: beginningAvg ? Math.round(beginningAvg * 10) / 10 : null,
    middleAvgTimePerPiece: middleAvg ? Math.round(middleAvg * 10) / 10 : null,
    endAvgTimePerPiece: endAvg ? Math.round(endAvg * 10) / 10 : null,
    overallAvgTimePerPiece: Math.round(overallAvg * 10) / 10,
    speedupPercentage: speedupPercentage ? Math.round(speedupPercentage * 10) / 10 : null,
    currentOutput: assignment.actual_output,
    startTime: assignment.actual_start_time,
    endTime: assignment.actual_end_time,
    status: assignment.status,
  };
}

// Get single assignment analytics
export async function getAssignmentAnalytics(assignmentId: number): Promise<AssignmentAnalytics | null> {
  const assignmentResult = await db.execute({
    sql: `
    SELECT 
      twa.id as assignment_id,
      twa.schedule_entry_id,
      twa.worker_id,
      twa.actual_start_time,
      twa.actual_end_time,
      twa.actual_output,
      twa.status,
      w.name as worker_name,
      ps.name as step_name,
      ps.category,
      ps.time_per_piece_seconds,
      se.planned_output
    FROM task_worker_assignments twa
    JOIN workers w ON twa.worker_id = w.id
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE twa.id = ?
  `,
    args: [assignmentId]
  });
  
  const assignment = assignmentResult.rows[0] as unknown as {
    assignment_id: number;
    schedule_entry_id: number;
    worker_id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    worker_name: string;
    step_name: string;
    category: string;
    time_per_piece_seconds: number;
    planned_output: number;
  } | undefined;

  if (!assignment) return null;

  const outputHistory = await getAssignmentOutputHistory(assignment.assignment_id);
  const timeMetrics = await getAssignmentTimeMetrics(assignment.assignment_id);

  return {
    assignmentId: assignment.assignment_id,
    scheduleEntryId: assignment.schedule_entry_id,
    workerId: assignment.worker_id,
    workerName: assignment.worker_name,
    stepName: assignment.step_name,
    category: assignment.category,
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

// Get all assignment analytics for a worker
export async function getWorkerAssignmentAnalytics(workerId: number): Promise<AssignmentAnalytics[]> {
  const assignmentsResult = await db.execute({
    sql: `
    SELECT 
      twa.id as assignment_id,
      twa.schedule_entry_id,
      twa.worker_id,
      twa.actual_start_time,
      twa.actual_end_time,
      twa.actual_output,
      twa.status,
      w.name as worker_name,
      ps.name as step_name,
      ps.category,
      ps.time_per_piece_seconds,
      se.planned_output
    FROM task_worker_assignments twa
    JOIN workers w ON twa.worker_id = w.id
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE twa.worker_id = ?
    AND twa.status IN ('in_progress', 'completed')
    ORDER BY twa.assigned_at DESC
    LIMIT 50
  `,
    args: [workerId]
  });
  
  const assignments = assignmentsResult.rows as unknown as {
    assignment_id: number;
    schedule_entry_id: number;
    worker_id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    worker_name: string;
    step_name: string;
    category: string;
    time_per_piece_seconds: number;
    planned_output: number;
  }[];

  const results: AssignmentAnalytics[] = [];
  
  for (const assignment of assignments) {
    const outputHistory = await getAssignmentOutputHistory(assignment.assignment_id);
    const timeMetrics = await getAssignmentTimeMetrics(assignment.assignment_id);

    results.push({
      assignmentId: assignment.assignment_id,
      scheduleEntryId: assignment.schedule_entry_id,
      workerId: assignment.worker_id,
      workerName: assignment.worker_name,
      stepName: assignment.step_name,
      category: assignment.category,
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

// Build Version Analytics
export interface BuildVersionMetricsSummary {
  buildVersionId: number;
  versionName: string;
  productName: string;
  totalUnitsProduced: number;
  totalTimeSeconds: number;
  avgTimePerUnitSeconds: number | null;
  totalCost: number;
  sampleCount: number;
  orderCount: number;
}

// Get metrics for a build version
// Note: Version is now tracked on schedules, not orders
export async function getBuildVersionMetrics(buildVersionId: number): Promise<BuildVersionMetricsSummary | null> {
  // Get build version info
  const versionResult = await db.execute({
    sql: `
    SELECT bv.id, bv.version_name, p.name as product_name
    FROM product_build_versions bv
    JOIN products p ON bv.product_id = p.id
    WHERE bv.id = ?
  `,
    args: [buildVersionId]
  });
  const version = versionResult.rows[0] as unknown as {
    id: number;
    version_name: string;
    product_name: string;
  } | undefined;

  if (!version) return null;

  // Get schedules (and their orders) using this build version
  const schedulesResult = await db.execute({
    sql: `
    SELECT DISTINCT s.order_id, o.quantity
    FROM schedules s
    JOIN orders o ON s.order_id = o.id
    WHERE s.build_version_id = ?
  `,
    args: [buildVersionId]
  });
  const orders = schedulesResult.rows as unknown as { order_id: number; quantity: number }[];

  // Calculate total units produced from completed schedule entries
  const metricsResult = await db.execute({
    sql: `
    SELECT
      SUM(twa.actual_output) as total_units,
      COUNT(DISTINCT se.id) as sample_count
    FROM schedules s
    JOIN schedule_entries se ON se.schedule_id = s.id
    JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
    WHERE s.build_version_id = ?
    AND twa.status = 'completed'
  `,
    args: [buildVersionId]
  });
  const metrics = metricsResult.rows[0] as unknown as {
    total_units: number | null;
    sample_count: number;
  };

  // Calculate total time from actual work times
  const timeResult = await db.execute({
    sql: `
    SELECT
      SUM(
        CASE
          WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 86400
          ELSE 0
        END
      ) as total_seconds
    FROM schedules s
    JOIN schedule_entries se ON se.schedule_id = s.id
    JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
    WHERE s.build_version_id = ?
    AND twa.status = 'completed'
  `,
    args: [buildVersionId]
  });
  const timeMetrics = timeResult.rows[0] as unknown as { total_seconds: number | null };

  const totalUnits = metrics.total_units || 0;
  const totalSeconds = Math.round(timeMetrics.total_seconds || 0);
  const avgTimePerUnit = totalUnits > 0 ? totalSeconds / totalUnits : null;

  return {
    buildVersionId: version.id,
    versionName: version.version_name,
    productName: version.product_name,
    totalUnitsProduced: totalUnits,
    totalTimeSeconds: totalSeconds,
    avgTimePerUnitSeconds: avgTimePerUnit ? Math.round(avgTimePerUnit * 10) / 10 : null,
    totalCost: 0, // TODO: Calculate from cost data
    sampleCount: metrics.sample_count || 0,
    orderCount: orders.length,
  };
}

// Compare metrics between build versions
export async function compareBuildVersionMetrics(
  versionIds: number[]
): Promise<BuildVersionMetricsSummary[]> {
  const results: BuildVersionMetricsSummary[] = [];

  for (const versionId of versionIds) {
    const metrics = await getBuildVersionMetrics(versionId);
    if (metrics) {
      results.push(metrics);
    }
  }

  return results;
}

// Update aggregated metrics in build_version_metrics table
export async function updateBuildVersionAggregatedMetrics(buildVersionId: number): Promise<void> {
  const metrics = await getBuildVersionMetrics(buildVersionId);
  if (!metrics) return;

  // Check if record exists
  const existingResult = await db.execute({
    sql: "SELECT id FROM build_version_metrics WHERE build_version_id = ?",
    args: [buildVersionId]
  });

  if (existingResult.rows.length > 0) {
    await db.execute({
      sql: `
      UPDATE build_version_metrics
      SET total_units_produced = ?,
          total_time_seconds = ?,
          avg_time_per_unit_seconds = ?,
          total_cost = ?,
          sample_count = ?,
          last_updated = CURRENT_TIMESTAMP
      WHERE build_version_id = ?
    `,
      args: [
        metrics.totalUnitsProduced,
        metrics.totalTimeSeconds,
        metrics.avgTimePerUnitSeconds,
        metrics.totalCost,
        metrics.sampleCount,
        buildVersionId,
      ]
    });
  } else {
    await db.execute({
      sql: `
      INSERT INTO build_version_metrics
        (build_version_id, total_units_produced, total_time_seconds, avg_time_per_unit_seconds, total_cost, sample_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      args: [
        buildVersionId,
        metrics.totalUnitsProduced,
        metrics.totalTimeSeconds,
        metrics.avgTimePerUnitSeconds,
        metrics.totalCost,
        metrics.sampleCount,
      ]
    });
  }
}

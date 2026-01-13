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
export function getWorkerProductivity(workerId: number): ProductivitySummary | null {
  const worker = db.query("SELECT id, name FROM workers WHERE id = ?").get(workerId) as { id: number; name: string } | null;
  if (!worker) return null;

  // Get completed entries with time calculations
  const entries = db.query(`
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
  `).all(workerId) as {
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
  const stepBreakdown: StepProductivity[] = Object.values(stepMetrics).map((step) => {
    const efficiency = step.totalMinutes > 0
      ? (step.expectedMinutes / step.totalMinutes) * 100
      : 0;

    // Get current proficiency
    const proficiency = db.query(
      "SELECT level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?"
    ).get(workerId, step.stepId) as { level: number } | null;

    return {
      stepId: step.stepId,
      stepName: step.stepName,
      category: step.category,
      totalUnits: step.totalUnits,
      totalMinutes: Math.round(step.totalMinutes),
      averageEfficiency: Math.round(efficiency),
      entryCount: step.entryCount,
      currentProficiency: proficiency?.level ?? 3,
    };
  });

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
export function getWorkerProductivityHistory(workerId: number, days: number = 30): ProductivityDataPoint[] {
  const entries = db.query(`
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
  `).all(workerId, days) as {
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
export function getWorkerProficiencyHistory(workerId: number): ProficiencyHistory[] {
  return db.query(`
    SELECT ph.*, ps.name as step_name, p.name as product_name
    FROM proficiency_history ph
    JOIN product_steps ps ON ph.product_step_id = ps.id
    JOIN products p ON ps.product_id = p.id
    WHERE ph.worker_id = ?
    ORDER BY ph.created_at DESC
    LIMIT 50
  `).all(workerId) as (ProficiencyHistory & { step_name: string; product_name: string })[];
}

// Calculate automatic proficiency adjustments based on performance
export function calculateAutoAdjustments(): ProficiencyAdjustment[] {
  const adjustments: ProficiencyAdjustment[] = [];

  // Get all worker-step pairs with completed entries in the last 30 days
  const workerStepPairs = db.query(`
    SELECT DISTINCT worker_id, product_step_id
    FROM schedule_entries
    WHERE status = 'completed'
    AND worker_id IS NOT NULL
    AND actual_start_time IS NOT NULL
    AND actual_end_time IS NOT NULL
    AND date >= date('now', '-30 days')
  `).all() as { worker_id: number; product_step_id: number }[];

  for (const pair of workerStepPairs) {
    // Get recent entries for this worker-step pair
    const entries = db.query(`
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
    `).all(pair.worker_id, pair.product_step_id) as {
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
    const currentProf = db.query(
      "SELECT level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?"
    ).get(pair.worker_id, pair.product_step_id) as { level: number } | null;

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
export function applyProficiencyAdjustment(adjustment: ProficiencyAdjustment): void {
  // Check if proficiency record exists
  const existing = db.query(
    "SELECT id FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?"
  ).get(adjustment.workerId, adjustment.productStepId) as { id: number } | null;

  if (existing) {
    db.run(
      "UPDATE worker_proficiencies SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [adjustment.newLevel, existing.id]
    );
  } else {
    db.run(
      "INSERT INTO worker_proficiencies (worker_id, product_step_id, level) VALUES (?, ?, ?)",
      [adjustment.workerId, adjustment.productStepId, adjustment.newLevel]
    );
  }

  // Record in history
  const triggerData = JSON.stringify({
    avgEfficiency: adjustment.avgEfficiency,
    sampleSize: adjustment.sampleSize,
  });

  db.run(
    `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason, trigger_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      adjustment.workerId,
      adjustment.productStepId,
      adjustment.currentLevel,
      adjustment.newLevel,
      adjustment.reason,
      triggerData,
    ]
  );
}

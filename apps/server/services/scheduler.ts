import { db } from "../db";
import type { Order, ProductStep, Schedule, ScheduleEntry, Worker, TaskWorkerAssignment } from "../db/schema";
import { getWorkerProficiencyLevel, PROFICIENCY_MULTIPLIERS } from "../routes/proficiencies";
import { getBuildVersionSteps, getDefaultBuildVersion } from "./build-version-manager";

// Work day configuration
export const WORK_DAY = {
  morningStart: "07:00",
  lunchStart: "11:00",
  lunchEnd: "11:30",
  dayEnd: "15:30",
  // Total work minutes per day: 4 hours morning + 4 hours afternoon = 8 hours = 480 minutes
  totalMinutes: 480,
};

// Multi-worker assignment configuration
export const MULTI_WORKER_CONFIG = {
  // Assign multiple workers if task duration exceeds this threshold (in minutes)
  durationThresholdMinutes: 120, // 2 hours
  // Maximum workers to assign per task
  maxWorkersPerTask: 3,
  // Assign extra workers if deadline is within this many days
  urgentDeadlineDays: 3,
};

export interface StepDependency {
  stepId: number;
  type: 'start' | 'finish';
}

export interface StepWithDependencies extends ProductStep {
  dependencies: StepDependency[];
}

interface ScheduleBlock {
  stepId: number;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
}

interface WorkerAssignment {
  workerId: number;
  workerName: string;
  score: number;
  proficiencyLevel: number;
}

// Find qualified workers for a schedule entry (returns multiple workers sorted by score)
export async function findQualifiedWorkers(
  step: StepWithDependencies,
  date: string,
  startTime: string,
  endTime: string,
  maxWorkers: number = MULTI_WORKER_CONFIG.maxWorkersPerTask
): Promise<WorkerAssignment[]> {
  // Get all active workers with matching skill category
  const candidateWorkersResult = await db.execute({
    sql: `
    SELECT * FROM workers
    WHERE status = 'active'
    AND skill_category = ?
  `,
    args: [step.required_skill_category]
  });
  const candidateWorkers = candidateWorkersResult.rows as unknown as Worker[];

  if (candidateWorkers.length === 0) {
    return [];
  }

  // If step requires equipment, filter to workers certified for it
  let qualifiedWorkers = candidateWorkers;
  if (step.equipment_id) {
    const filteredWorkers: Worker[] = [];
    for (const worker of candidateWorkers) {
      const certificationResult = await db.execute({
        sql: `
        SELECT id FROM equipment_certifications
        WHERE worker_id = ? AND equipment_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `,
        args: [worker.id, step.equipment_id]
      });
      if (certificationResult.rows.length > 0) {
        filteredWorkers.push(worker);
      }
    }
    qualifiedWorkers = filteredWorkers;

    if (qualifiedWorkers.length === 0) {
      return [];
    }
  }

  // Filter to workers available during the time slot
  // Check both legacy schedule_entries.worker_id and new task_worker_assignments
  const availableWorkers: Worker[] = [];
  for (const worker of qualifiedWorkers) {
    // Check legacy schedule_entries overlap
    const legacyOverlapResult = await db.execute({
      sql: `
      SELECT id FROM schedule_entries
      WHERE worker_id = ?
      AND date = ?
      AND NOT (end_time <= ? OR start_time >= ?)
    `,
      args: [worker.id, date, startTime, endTime]
    });
    const legacyOverlap = legacyOverlapResult.rows[0];

    // Check new task_worker_assignments overlap
    const assignmentOverlapResult = await db.execute({
      sql: `
      SELECT twa.id FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE twa.worker_id = ?
      AND se.date = ?
      AND NOT (se.end_time <= ? OR se.start_time >= ?)
    `,
      args: [worker.id, date, startTime, endTime]
    });
    const assignmentOverlap = assignmentOverlapResult.rows[0];

    if (!legacyOverlap && !assignmentOverlap) {
      availableWorkers.push(worker);
    }
  }

  if (availableWorkers.length === 0) {
    return [];
  }

  // Score remaining candidates by proficiency (higher is better) and workload (lower is better)
  const scoredWorkers = await Promise.all(availableWorkers.map(async worker => {
    // Count legacy assignments
    const legacyWorkloadResult = await db.execute({
      sql: `
      SELECT COUNT(*) as count FROM schedule_entries
      WHERE worker_id = ? AND date = ?
    `,
      args: [worker.id, date]
    });
    const legacyWorkload = legacyWorkloadResult.rows[0] as unknown as { count: number };

    // Count new assignments
    const newWorkloadResult = await db.execute({
      sql: `
      SELECT COUNT(*) as count FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE twa.worker_id = ? AND se.date = ?
    `,
      args: [worker.id, date]
    });
    const newWorkload = newWorkloadResult.rows[0] as unknown as { count: number };

    const totalWorkload = legacyWorkload.count + newWorkload.count;

    // Get proficiency level for this worker-step combination
    const proficiencyLevel = await getWorkerProficiencyLevel(worker.id, step.id);

    // Score: higher proficiency is better, lower workload is better
    // Proficiency weight: 10 points per level (so level 5 = 50, level 1 = 10)
    // Workload penalty: -5 per existing assignment
    const score = (proficiencyLevel * 10) - (totalWorkload * 5);

    return {
      workerId: worker.id,
      workerName: worker.name,
      score,
      proficiencyLevel,
    };
  }));

  // Sort by score (highest first for best candidates)
  scoredWorkers.sort((a, b) => b.score - a.score);

  // Return top N workers
  return scoredWorkers.slice(0, maxWorkers);
}

// Legacy function for backwards compatibility - returns single best worker
export async function findQualifiedWorker(
  step: StepWithDependencies,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ workerId: number; workerName: string } | null> {
  const workers = await findQualifiedWorkers(step, date, startTime, endTime, 1);
  return workers.length > 0 ? { workerId: workers[0]!.workerId, workerName: workers[0]!.workerName } : null;
}

// Determine how many workers to assign based on task characteristics
function calculateWorkersNeeded(
  taskDurationMinutes: number,
  daysUntilDeadline: number
): number {
  let workersNeeded = 1;

  // Large task: add workers
  if (taskDurationMinutes >= MULTI_WORKER_CONFIG.durationThresholdMinutes) {
    workersNeeded = Math.min(
      Math.ceil(taskDurationMinutes / MULTI_WORKER_CONFIG.durationThresholdMinutes),
      MULTI_WORKER_CONFIG.maxWorkersPerTask
    );
  }

  // Urgent deadline: try to add one more worker
  if (daysUntilDeadline <= MULTI_WORKER_CONFIG.urgentDeadlineDays) {
    workersNeeded = Math.min(workersNeeded + 1, MULTI_WORKER_CONFIG.maxWorkersPerTask);
  }

  return workersNeeded;
}

// Convert time string to minutes since midnight
export function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const mins = parts[1] ?? 0;
  return hours * 60 + mins;
}

// Convert minutes since midnight to time string
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// Get available work minutes for a given time slot, accounting for lunch
export function getWorkMinutes(startMinutes: number, endMinutes: number): number {
  const lunchStart = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEnd = timeToMinutes(WORK_DAY.lunchEnd);

  // If the slot is entirely before or after lunch
  if (endMinutes <= lunchStart || startMinutes >= lunchEnd) {
    return endMinutes - startMinutes;
  }

  // If the slot spans lunch, subtract lunch duration
  let minutes = endMinutes - startMinutes;
  if (startMinutes < lunchStart && endMinutes > lunchEnd) {
    minutes -= (lunchEnd - lunchStart);
  } else if (startMinutes < lunchStart && endMinutes > lunchStart) {
    minutes = lunchStart - startMinutes;
  } else if (startMinutes >= lunchStart && startMinutes < lunchEnd) {
    minutes = endMinutes - lunchEnd;
  }

  return Math.max(0, minutes);
}

// Advance time by given minutes, skipping lunch
export function advanceTime(startMinutes: number, minutesToAdd: number): number {
  const lunchStart = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEnd = timeToMinutes(WORK_DAY.lunchEnd);
  const dayEnd = timeToMinutes(WORK_DAY.dayEnd);

  let current = startMinutes;
  let remaining = minutesToAdd;

  while (remaining > 0) {
    // If we hit lunch, skip to after lunch
    if (current >= lunchStart && current < lunchEnd) {
      current = lunchEnd;
    }

    // If we hit end of day, we've exceeded the day
    if (current >= dayEnd) {
      return dayEnd;
    }

    // Calculate how much time until next break (lunch or end of day)
    let untilBreak: number;
    if (current < lunchStart) {
      untilBreak = lunchStart - current;
    } else {
      untilBreak = dayEnd - current;
    }

    const canAdd = Math.min(remaining, untilBreak);
    current += canAdd;
    remaining -= canAdd;
  }

  return current;
}

// Check if all dependencies are satisfied before the given date/time
// - 'finish' dependencies require the step to be completed
// - 'start' dependencies only require the step to have started
function dependenciesSatisfied(
  stepId: number,
  startedSteps: Map<number, string>,   // stepId -> start date
  completedSteps: Map<number, string>, // stepId -> completion date
  stepsMap: Map<number, StepWithDependencies>,
  currentDate: string
): boolean {
  const step = stepsMap.get(stepId);
  if (!step || step.dependencies.length === 0) return true;

  for (const dep of step.dependencies) {
    if (dep.type === 'start') {
      // For 'start' dependencies, check if the dependency has started
      const startDate = startedSteps.get(dep.stepId);
      if (!startDate || startDate > currentDate) {
        return false;
      }
    } else {
      // For 'finish' dependencies (default), check if the dependency is completed
      const completionDate = completedSteps.get(dep.stepId);
      if (!completionDate || completionDate > currentDate) {
        return false;
      }
    }
  }
  return true;
}

export interface GenerateScheduleOptions {
  buildVersionId?: number;
}

export async function generateSchedule(orderId: number, options?: GenerateScheduleOptions): Promise<Schedule | null> {
  // Get order
  const orderResult = await db.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [orderId]
  });
  const order = orderResult.rows[0] as unknown as Order | undefined;
  if (!order) return null;

  // Calculate days until deadline
  const dueDate = new Date(order.due_date);
  const today = new Date();
  const daysUntilDeadline = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Determine which build version to use:
  // 1. If explicitly provided in options, use that
  // 2. Otherwise, use the product's default build version
  // 3. Fall back to all product steps (legacy behavior)
  let steps: ProductStep[];
  let buildVersionId: number | null = null;

  if (options?.buildVersionId) {
    // Use the explicitly provided build version
    buildVersionId = options.buildVersionId;
    const buildVersionSteps = await getBuildVersionSteps(buildVersionId);
    steps = buildVersionSteps.map(s => ({ ...s, sequence: s.build_sequence }));
  } else {
    // Try to get the default build version
    const defaultVersion = await getDefaultBuildVersion(order.product_id);
    if (defaultVersion) {
      buildVersionId = defaultVersion.id;
      const buildVersionSteps = await getBuildVersionSteps(defaultVersion.id);
      steps = buildVersionSteps.map(s => ({ ...s, sequence: s.build_sequence }));
    } else {
      // Fall back to all product steps (legacy behavior)
      const stepsResult = await db.execute({
        sql: `
        SELECT * FROM product_steps
        WHERE product_id = ?
        ORDER BY sequence
      `,
        args: [order.product_id]
      });
      steps = stepsResult.rows as unknown as ProductStep[];
    }
  }

  // Build steps map with dependencies
  const stepsMap = new Map<number, StepWithDependencies>();
  for (const step of steps) {
    const depsResult = await db.execute({
      sql: `
      SELECT depends_on_step_id, dependency_type FROM step_dependencies WHERE step_id = ?
    `,
      args: [step.id]
    });
    const deps = depsResult.rows as unknown as { depends_on_step_id: number; dependency_type: string | null }[];

    stepsMap.set(step.id, {
      ...step,
      dependencies: deps.map(d => ({
        stepId: d.depends_on_step_id,
        type: (d.dependency_type as 'start' | 'finish') || 'finish',
      })),
    });
  }

  // Calculate week start (Monday of current week or next Monday if today is weekend)
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 6 ? 2 : (1 - dayOfWeek + 7) % 7 || 7);
  const weekStart = new Date(today);
  if (dayOfWeek !== 1) {
    weekStart.setDate(today.getDate() + daysUntilMonday);
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekStartStr = weekStart.toISOString().split("T")[0]!;

  // Create schedule record with build version
  const scheduleResult = await db.execute({
    sql: "INSERT INTO schedules (order_id, week_start_date, build_version_id) VALUES (?, ?, ?)",
    args: [orderId, weekStartStr, buildVersionId]
  });
  const scheduleId = Number(scheduleResult.lastInsertRowid);

  // Track started and completed steps with their dates
  const startedSteps = new Map<number, string>();   // stepId -> start date
  const completedSteps = new Map<number, string>(); // stepId -> completion date
  const pendingSteps = new Set(stepsMap.keys());

  // Current scheduling position
  let currentDate = new Date(weekStart);
  let currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);

  // Process steps in dependency order
  while (pendingSteps.size > 0) {
    const currentDateStr = currentDate.toISOString().split("T")[0]!;

    // Find steps that can be started (all dependencies complete)
    let foundStep = false;

    for (const stepId of pendingSteps) {
      if (!dependenciesSatisfied(stepId, startedSteps, completedSteps, stepsMap, currentDateStr)) {
        continue;
      }

      const step = stepsMap.get(stepId)!;

      // Mark step as started on the current date
      if (!startedSteps.has(stepId)) {
        startedSteps.set(stepId, currentDateStr);
      }

      // Calculate total time needed for this step
      const totalSecondsNeeded = step.time_per_piece_seconds * order.quantity;
      const totalMinutesNeeded = Math.ceil(totalSecondsNeeded / 60);
      let remainingMinutes = totalMinutesNeeded;
      let outputScheduled = 0;

      // Determine how many workers to assign
      const workersNeeded = calculateWorkersNeeded(totalMinutesNeeded, daysUntilDeadline);

      // Schedule this step across days as needed
      while (remainingMinutes > 0) {
        const dateStr = currentDate.toISOString().split("T")[0]!;

        // Calculate available time in current day
        const availableMinutes = getWorkMinutes(currentTimeMinutes, dayEndMinutes);

        if (availableMinutes <= 0) {
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
          // Skip weekends
          while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
            currentDate.setDate(currentDate.getDate() + 1);
          }
          currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
          continue;
        }

        const minutesToUse = Math.min(remainingMinutes, availableMinutes);
        const endTimeMinutes = advanceTime(currentTimeMinutes, minutesToUse);

        // Calculate output for this block
        const secondsInBlock = minutesToUse * 60;
        const outputInBlock = Math.floor(secondsInBlock / step.time_per_piece_seconds);
        outputScheduled += outputInBlock;

        // Find qualified workers for this time slot
        const startTimeStr = minutesToTime(currentTimeMinutes);
        const endTimeStr = minutesToTime(endTimeMinutes);
        const qualifiedWorkers = await findQualifiedWorkers(step, dateStr, startTimeStr, endTimeStr, workersNeeded);

        // Create schedule entry (without worker_id - using new assignments table)
        const entryResult = await db.execute({
          sql: `INSERT INTO schedule_entries (schedule_id, product_step_id, date, start_time, end_time, planned_output)
           VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            scheduleId,
            stepId,
            dateStr,
            startTimeStr,
            endTimeStr,
            outputInBlock,
          ]
        });
        const entryId = Number(entryResult.lastInsertRowid);

        // Create worker assignments
        for (const worker of qualifiedWorkers) {
          await db.execute({
            sql: "INSERT INTO task_worker_assignments (schedule_entry_id, worker_id) VALUES (?, ?)",
            args: [entryId, worker.workerId]
          });
        }

        remainingMinutes -= minutesToUse;
        currentTimeMinutes = endTimeMinutes;

        // If we've reached end of day, move to next day
        if (currentTimeMinutes >= dayEndMinutes) {
          currentDate.setDate(currentDate.getDate() + 1);
          // Skip weekends
          while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
            currentDate.setDate(currentDate.getDate() + 1);
          }
          currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
        }
      }

      // Mark step as complete
      completedSteps.set(stepId, currentDate.toISOString().split("T")[0]!);
      pendingSteps.delete(stepId);
      foundStep = true;
      break; // Start fresh looking for next available step
    }

    if (!foundStep && pendingSteps.size > 0) {
      // All remaining steps have unmet dependencies, move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      // Skip weekends
      while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
    }
  }

  // Update order status
  await db.execute({
    sql: "UPDATE orders SET status = 'scheduled' WHERE id = ?",
    args: [orderId]
  });

  const finalScheduleResult = await db.execute({
    sql: "SELECT * FROM schedules WHERE id = ?",
    args: [scheduleId]
  });
  return finalScheduleResult.rows[0] as unknown as Schedule;
}

// Helper to get assignments for an entry
async function getAssignmentsForEntry(entryId: number) {
  const result = await db.execute({
    sql: `
    SELECT
      twa.*,
      w.name as worker_name
    FROM task_worker_assignments twa
    JOIN workers w ON twa.worker_id = w.id
    WHERE twa.schedule_entry_id = ?
    ORDER BY twa.assigned_at
  `,
    args: [entryId]
  });
  return result.rows as unknown as (TaskWorkerAssignment & { worker_name: string })[];
}

// Helper to compute task status from assignments
function computeTaskStatus(assignments: { status: string }[]): 'not_started' | 'in_progress' | 'completed' {
  if (assignments.length === 0) {
    return 'not_started';
  }

  const allCompleted = assignments.every(a => a.status === 'completed');
  if (allCompleted) {
    return 'completed';
  }

  const anyStarted = assignments.some(a => a.status === 'in_progress' || a.status === 'completed');
  if (anyStarted) {
    return 'in_progress';
  }

  return 'not_started';
}

// Get schedule with all entries and assignments
export async function getScheduleWithEntries(scheduleId: number) {
  const scheduleResult = await db.execute({
    sql: `
    SELECT s.*, o.color as order_color
    FROM schedules s
    JOIN orders o ON s.order_id = o.id
    WHERE s.id = ?
  `,
    args: [scheduleId]
  });
  const schedule = scheduleResult.rows[0] as unknown as (Schedule & { order_color: string | null }) | undefined;
  if (!schedule) return null;

  const entriesResult = await db.execute({
    sql: `
    SELECT
      se.*,
      ps.name as step_name,
      ps.category,
      ps.required_skill_category,
      ps.equipment_id,
      e.name as equipment_name,
      o.color as order_color
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    LEFT JOIN equipment e ON ps.equipment_id = e.id
    JOIN schedules s ON se.schedule_id = s.id
    JOIN orders o ON s.order_id = o.id
    WHERE se.schedule_id = ?
    ORDER BY se.date, se.start_time
  `,
    args: [scheduleId]
  });
  const entries = entriesResult.rows as unknown as (ScheduleEntry & {
    step_name: string;
    category: string;
    required_skill_category: string;
    equipment_id: number | null;
    equipment_name: string | null;
    order_color: string | null;
  })[];

  // Enrich entries with assignments
  const enrichedEntries = await Promise.all(entries.map(async entry => {
    const assignments = await getAssignmentsForEntry(entry.id);
    // Use max (not sum) because multiple workers work on the same units, not separate units
    const totalActualOutput = assignments.length > 0
      ? Math.max(...assignments.map(a => a.actual_output))
      : 0;

    return {
      ...entry,
      computed_status: computeTaskStatus(assignments),
      total_actual_output: totalActualOutput,
      assignments,
      // Legacy: build worker_name from assignments for backwards compatibility
      worker_name: assignments.length > 0
        ? assignments.map(a => a.worker_name).join(', ')
        : null,
    };
  }));

  // Group entries by date
  const entriesByDate: Record<string, typeof enrichedEntries> = {};
  for (const entry of enrichedEntries) {
    if (!entriesByDate[entry.date]) {
      entriesByDate[entry.date] = [];
    }
    entriesByDate[entry.date]!.push(entry);
  }

  return {
    ...schedule,
    entries: enrichedEntries,
    entriesByDate,
  };
}

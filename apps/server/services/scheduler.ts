import { db } from "../db";
import type { Order, ProductStep, Schedule, ScheduleEntry, Worker, TaskWorkerAssignment } from "../db/schema";
import { getWorkerProficiencyLevel, PROFICIENCY_MULTIPLIERS } from "../routes/proficiencies";

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

export interface StepWithDependencies extends ProductStep {
  dependencies: number[];
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
export function findQualifiedWorkers(
  step: StepWithDependencies,
  date: string,
  startTime: string,
  endTime: string,
  maxWorkers: number = MULTI_WORKER_CONFIG.maxWorkersPerTask
): WorkerAssignment[] {
  // Get all active workers with matching skill category
  const candidateWorkers = db.query(`
    SELECT * FROM workers
    WHERE status = 'active'
    AND skill_category = ?
  `).all(step.required_skill_category) as Worker[];

  if (candidateWorkers.length === 0) {
    return [];
  }

  // If step requires equipment, filter to workers certified for it
  let qualifiedWorkers = candidateWorkers;
  if (step.equipment_id) {
    qualifiedWorkers = candidateWorkers.filter(worker => {
      const certification = db.query(`
        SELECT id FROM equipment_certifications
        WHERE worker_id = ? AND equipment_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get(worker.id, step.equipment_id);
      return certification !== null;
    });

    if (qualifiedWorkers.length === 0) {
      return [];
    }
  }

  // Filter to workers available during the time slot
  // Check both legacy schedule_entries.worker_id and new task_worker_assignments
  const availableWorkers = qualifiedWorkers.filter(worker => {
    // Check legacy schedule_entries overlap
    const legacyOverlap = db.query(`
      SELECT id FROM schedule_entries
      WHERE worker_id = ?
      AND date = ?
      AND NOT (end_time <= ? OR start_time >= ?)
    `).get(worker.id, date, startTime, endTime);

    // Check new task_worker_assignments overlap
    const assignmentOverlap = db.query(`
      SELECT twa.id FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE twa.worker_id = ?
      AND se.date = ?
      AND NOT (se.end_time <= ? OR se.start_time >= ?)
    `).get(worker.id, date, startTime, endTime);

    return legacyOverlap === null && assignmentOverlap === null;
  });

  if (availableWorkers.length === 0) {
    return [];
  }

  // Score remaining candidates by proficiency (higher is better) and workload (lower is better)
  const scoredWorkers = availableWorkers.map(worker => {
    // Count legacy assignments
    const legacyWorkload = db.query(`
      SELECT COUNT(*) as count FROM schedule_entries
      WHERE worker_id = ? AND date = ?
    `).get(worker.id, date) as { count: number };

    // Count new assignments
    const newWorkload = db.query(`
      SELECT COUNT(*) as count FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      WHERE twa.worker_id = ? AND se.date = ?
    `).get(worker.id, date) as { count: number };

    const totalWorkload = legacyWorkload.count + newWorkload.count;

    // Get proficiency level for this worker-step combination
    const proficiencyLevel = getWorkerProficiencyLevel(worker.id, step.id);

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
  });

  // Sort by score (highest first for best candidates)
  scoredWorkers.sort((a, b) => b.score - a.score);

  // Return top N workers
  return scoredWorkers.slice(0, maxWorkers);
}

// Legacy function for backwards compatibility - returns single best worker
export function findQualifiedWorker(
  step: StepWithDependencies,
  date: string,
  startTime: string,
  endTime: string
): { workerId: number; workerName: string } | null {
  const workers = findQualifiedWorkers(step, date, startTime, endTime, 1);
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

// Check if all dependencies are completed before the given date/time
function dependenciesComplete(
  stepId: number,
  completedSteps: Map<number, string>, // stepId -> completion date
  stepsMap: Map<number, StepWithDependencies>,
  currentDate: string
): boolean {
  const step = stepsMap.get(stepId);
  if (!step || step.dependencies.length === 0) return true;

  for (const depId of step.dependencies) {
    const completionDate = completedSteps.get(depId);
    if (!completionDate || completionDate > currentDate) {
      return false;
    }
  }
  return true;
}

export function generateSchedule(orderId: number): Schedule | null {
  // Get order
  const order = db.query("SELECT * FROM orders WHERE id = ?").get(orderId) as Order | null;
  if (!order) return null;

  // Calculate days until deadline
  const dueDate = new Date(order.due_date);
  const today = new Date();
  const daysUntilDeadline = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Get product steps with dependencies
  const steps = db.query(`
    SELECT * FROM product_steps
    WHERE product_id = ?
    ORDER BY sequence
  `).all(order.product_id) as ProductStep[];

  // Build steps map with dependencies
  const stepsMap = new Map<number, StepWithDependencies>();
  for (const step of steps) {
    const deps = db.query(`
      SELECT depends_on_step_id FROM step_dependencies WHERE step_id = ?
    `).all(step.id) as { depends_on_step_id: number }[];

    stepsMap.set(step.id, {
      ...step,
      dependencies: deps.map(d => d.depends_on_step_id),
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

  // Create schedule record
  const scheduleResult = db.run(
    "INSERT INTO schedules (order_id, week_start_date) VALUES (?, ?)",
    [orderId, weekStartStr]
  );
  const scheduleId = Number(scheduleResult.lastInsertRowid);

  // Track completed steps and their completion dates
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
      if (!dependenciesComplete(stepId, completedSteps, stepsMap, currentDateStr)) {
        continue;
      }

      const step = stepsMap.get(stepId)!;

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
        const qualifiedWorkers = findQualifiedWorkers(step, dateStr, startTimeStr, endTimeStr, workersNeeded);

        // Create schedule entry (without worker_id - using new assignments table)
        const entryResult = db.run(
          `INSERT INTO schedule_entries (schedule_id, product_step_id, date, start_time, end_time, planned_output)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            scheduleId,
            stepId,
            dateStr,
            startTimeStr,
            endTimeStr,
            outputInBlock,
          ]
        );
        const entryId = Number(entryResult.lastInsertRowid);

        // Create worker assignments
        for (const worker of qualifiedWorkers) {
          db.run(
            "INSERT INTO task_worker_assignments (schedule_entry_id, worker_id) VALUES (?, ?)",
            [entryId, worker.workerId]
          );
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
  db.run("UPDATE orders SET status = 'scheduled' WHERE id = ?", [orderId]);

  return db.query("SELECT * FROM schedules WHERE id = ?").get(scheduleId) as Schedule;
}

// Helper to get assignments for an entry
function getAssignmentsForEntry(entryId: number) {
  return db.query(`
    SELECT
      twa.*,
      w.name as worker_name
    FROM task_worker_assignments twa
    JOIN workers w ON twa.worker_id = w.id
    WHERE twa.schedule_entry_id = ?
    ORDER BY twa.assigned_at
  `).all(entryId) as (TaskWorkerAssignment & { worker_name: string })[];
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
export function getScheduleWithEntries(scheduleId: number) {
  const schedule = db.query(`
    SELECT s.*, o.color as order_color
    FROM schedules s
    JOIN orders o ON s.order_id = o.id
    WHERE s.id = ?
  `).get(scheduleId) as (Schedule & { order_color: string | null }) | null;
  if (!schedule) return null;

  const entries = db.query(`
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
  `).all(scheduleId) as (ScheduleEntry & {
    step_name: string;
    category: string;
    required_skill_category: string;
    equipment_id: number | null;
    equipment_name: string | null;
    order_color: string | null;
  })[];

  // Enrich entries with assignments
  const enrichedEntries = entries.map(entry => {
    const assignments = getAssignmentsForEntry(entry.id);
    const totalActualOutput = assignments.reduce((sum, a) => sum + a.actual_output, 0);

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
  });

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

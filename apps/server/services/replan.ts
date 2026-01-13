import { db } from "../db";
import type { Order, ProductStep, Schedule, ScheduleEntry, Worker } from "../db/schema";
import {
  WORK_DAY,
  timeToMinutes,
  minutesToTime,
  advanceTime,
  getWorkMinutes,
  findQualifiedWorker,
} from "./scheduler";
import type { StepWithDependencies } from "./scheduler";

// Overtime configuration
const OVERTIME = {
  eveningStart: "15:30",
  eveningEnd: "18:00",
  maxMinutesPerDay: 150, // 2.5 hours
};

// Types for draft schedule (not persisted until commit)
export interface DraftScheduleEntry {
  id: string; // temp UUID
  product_step_id: number;
  worker_id: number | null;
  worker_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  step_name: string;
  category: string;
  required_skill_category: "SEWING" | "OTHER";
  is_overtime: boolean;
  is_auto_suggested: boolean;
}

export interface ReplanResult {
  scheduleId: number;
  orderId: number;
  productName: string;
  dueDate: string;
  totalOutput: number;
  completedOutput: number;
  remainingOutput: number;
  canMeetDeadline: boolean;
  regularHoursNeeded: number;
  overtimeHoursNeeded: number;
  draftEntries: DraftScheduleEntry[];
  overtimeSuggestions: DraftScheduleEntry[];
  availableWorkers: { id: number; name: string; skill_category: string }[];
}

export interface CommitReplanRequest {
  entries: DraftScheduleEntry[];
  newWorkers?: { name: string; skill_category: "SEWING" | "OTHER" }[];
}

// Get next work day (skip weekends)
function getNextWorkDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

// Get the starting point for replanning (current time or next available slot)
function getReplanStartPoint(): { date: string; time: string } {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);
  const morningStartMinutes = timeToMinutes(WORK_DAY.morningStart);
  const lunchStartMinutes = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEndMinutes = timeToMinutes(WORK_DAY.lunchEnd);

  // Skip weekends
  if (now.getDay() === 0 || now.getDay() === 6) {
    const nextWorkDay = getNextWorkDay(now);
    return { date: formatDate(nextWorkDay), time: WORK_DAY.morningStart };
  }

  // If after work day end, start next work day
  if (currentMinutes >= dayEndMinutes) {
    const nextWorkDay = getNextWorkDay(now);
    return { date: formatDate(nextWorkDay), time: WORK_DAY.morningStart };
  }

  // If before work day start, start at morning
  if (currentMinutes < morningStartMinutes) {
    return { date: formatDate(now), time: WORK_DAY.morningStart };
  }

  // During lunch, start after lunch
  if (currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
    return { date: formatDate(now), time: WORK_DAY.lunchEnd };
  }

  // Round up to next 15-minute slot
  const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
  return { date: formatDate(now), time: minutesToTime(roundedMinutes) };
}

// Generate a UUID for draft entries
function generateId(): string {
  return crypto.randomUUID();
}

// Calculate work days between two dates (excluding weekends)
function getWorkDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export async function generateReplanDraft(scheduleId: number): Promise<ReplanResult | null> {
  // Get schedule
  const scheduleResult = await db.execute({
    sql: "SELECT * FROM schedules WHERE id = ?",
    args: [scheduleId]
  });
  const schedule = scheduleResult.rows[0] as unknown as Schedule | undefined;
  if (!schedule) return null;

  // Get order
  const orderResult = await db.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [schedule.order_id]
  });
  const order = orderResult.rows[0] as unknown as Order | undefined;
  if (!order) return null;

  // Get product name
  const productResult = await db.execute({
    sql: "SELECT name FROM products WHERE id = ?",
    args: [order.product_id]
  });
  const product = productResult.rows[0] as unknown as { name: string } | undefined;

  // Get all schedule entries for this schedule
  const entriesResult = await db.execute({
    sql: `
    SELECT se.*, ps.name as step_name, ps.category, ps.required_skill_category,
           ps.time_per_piece_seconds, ps.sequence, ps.equipment_id,
           w.name as worker_name
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    LEFT JOIN workers w ON se.worker_id = w.id
    WHERE se.schedule_id = ?
    ORDER BY se.date, se.start_time
  `,
    args: [scheduleId]
  });
  const entries = entriesResult.rows as unknown as (ScheduleEntry & {
    step_name: string;
    category: string;
    required_skill_category: "SEWING" | "OTHER";
    time_per_piece_seconds: number;
    sequence: number;
    equipment_id: number | null;
    worker_name: string | null;
  })[];

  // Calculate completed output (sum of actual_output from completed entries)
  const completedOutput = entries
    .filter((e) => e.status === "completed")
    .reduce((sum, e) => sum + (e.actual_output || 0), 0);

  const totalOutput = order.quantity;
  const remainingOutput = totalOutput - completedOutput;

  // Get product steps with their info for scheduling
  const stepsResult = await db.execute({
    sql: `
    SELECT ps.*,
           (SELECT GROUP_CONCAT(depends_on_step_id) FROM step_dependencies WHERE step_id = ps.id) as deps
    FROM product_steps ps
    WHERE ps.product_id = ?
    ORDER BY ps.sequence
  `,
    args: [order.product_id]
  });
  const steps = stepsResult.rows as unknown as (ProductStep & { deps: string | null })[];

  // Build steps map
  const stepsMap = new Map<number, StepWithDependencies>();
  for (const step of steps) {
    stepsMap.set(step.id, {
      ...step,
      dependencies: step.deps ? step.deps.split(",").map(Number) : [],
    });
  }

  // Get all available workers
  const workersResult = await db.execute("SELECT id, name, skill_category FROM workers WHERE status = 'active'");
  const workers = workersResult.rows as unknown as { id: number; name: string; skill_category: string }[];

  // Get starting point
  const startPoint = getReplanStartPoint();
  let currentDate = new Date(startPoint.date);
  let currentTimeMinutes = timeToMinutes(startPoint.time);
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);

  // Calculate remaining work by step (for incomplete entries)
  const remainingByStep = new Map<number, number>();
  for (const entry of entries) {
    if (entry.status !== "completed") {
      const current = remainingByStep.get(entry.product_step_id) || 0;
      remainingByStep.set(entry.product_step_id, current + entry.planned_output);
    }
  }

  // If nothing remains, return empty result
  if (remainingByStep.size === 0 && remainingOutput <= 0) {
    return {
      scheduleId,
      orderId: order.id,
      productName: product?.name || `Product #${order.product_id}`,
      dueDate: order.due_date,
      totalOutput,
      completedOutput,
      remainingOutput: 0,
      canMeetDeadline: true,
      regularHoursNeeded: 0,
      overtimeHoursNeeded: 0,
      draftEntries: [],
      overtimeSuggestions: [],
      availableWorkers: workers,
    };
  }

  const draftEntries: DraftScheduleEntry[] = [];
  let regularMinutesUsed = 0;

  // Process steps in sequence order
  const sortedSteps = Array.from(stepsMap.values()).sort(
    (a, b) => a.sequence - b.sequence
  );

  for (const step of sortedSteps) {
    const remainingForStep = remainingByStep.get(step.id);
    if (!remainingForStep || remainingForStep <= 0) continue;

    // Calculate time needed for remaining output
    const secondsNeeded = step.time_per_piece_seconds * remainingForStep;
    let remainingMinutes = Math.ceil(secondsNeeded / 60);

    while (remainingMinutes > 0) {
      const dateStr = formatDate(currentDate);

      // Calculate available time in current day (regular hours)
      const availableMinutes = getWorkMinutes(currentTimeMinutes, dayEndMinutes);

      if (availableMinutes <= 0) {
        // Move to next day
        currentDate = getNextWorkDay(currentDate);
        currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
        continue;
      }

      const minutesToUse = Math.min(remainingMinutes, availableMinutes);
      const endTimeMinutes = advanceTime(currentTimeMinutes, minutesToUse);

      // Calculate output for this block
      const secondsInBlock = minutesToUse * 60;
      const outputInBlock = Math.floor(secondsInBlock / step.time_per_piece_seconds);

      // Find qualified worker
      const startTimeStr = minutesToTime(currentTimeMinutes);
      const endTimeStr = minutesToTime(endTimeMinutes);
      const workerAssignment = await findQualifiedWorker(
        step as StepWithDependencies,
        dateStr,
        startTimeStr,
        endTimeStr
      );

      draftEntries.push({
        id: generateId(),
        product_step_id: step.id,
        worker_id: workerAssignment?.workerId ?? null,
        worker_name: workerAssignment?.workerName ?? null,
        date: dateStr,
        start_time: startTimeStr,
        end_time: endTimeStr,
        planned_output: outputInBlock,
        step_name: step.name,
        category: step.category,
        required_skill_category: step.required_skill_category as "SEWING" | "OTHER",
        is_overtime: false,
        is_auto_suggested: false,
      });

      regularMinutesUsed += minutesToUse;
      remainingMinutes -= minutesToUse;
      currentTimeMinutes = endTimeMinutes;

      // If we've reached end of day, move to next day
      if (currentTimeMinutes >= dayEndMinutes) {
        currentDate = getNextWorkDay(currentDate);
        currentTimeMinutes = timeToMinutes(WORK_DAY.morningStart);
      }
    }
  }

  // Calculate if deadline can be met
  const dueDate = new Date(order.due_date);
  const lastEntryDate =
    draftEntries.length > 0
      ? new Date(draftEntries[draftEntries.length - 1]!.date)
      : new Date(startPoint.date);

  const canMeetDeadline = lastEntryDate <= dueDate;
  const regularHoursNeeded = regularMinutesUsed / 60;

  // Generate overtime suggestions if deadline at risk
  const overtimeSuggestions: DraftScheduleEntry[] = [];
  let overtimeMinutesNeeded = 0;

  if (!canMeetDeadline) {
    // Calculate how many work days we're over
    const daysOver = getWorkDaysBetween(dueDate, lastEntryDate);
    const minutesOver = daysOver * WORK_DAY.totalMinutes;

    // Generate overtime slots to make up the difference
    let overtimeDate = new Date(startPoint.date);
    let overtimeMinutesGenerated = 0;
    const maxOvertimeTotal = minutesOver + 120; // Extra buffer

    while (
      overtimeMinutesGenerated < maxOvertimeTotal &&
      overtimeDate <= dueDate
    ) {
      // Skip weekends
      if (overtimeDate.getDay() === 0 || overtimeDate.getDay() === 6) {
        overtimeDate = getNextWorkDay(overtimeDate);
        continue;
      }

      const dateStr = formatDate(overtimeDate);
      const overtimeStart = OVERTIME.eveningStart;
      const minutesAvailable = Math.min(
        OVERTIME.maxMinutesPerDay,
        maxOvertimeTotal - overtimeMinutesGenerated
      );

      if (minutesAvailable <= 0) break;

      const overtimeEndMinutes =
        timeToMinutes(overtimeStart) + minutesAvailable;
      const overtimeEnd = minutesToTime(
        Math.min(overtimeEndMinutes, timeToMinutes(OVERTIME.eveningEnd))
      );

      // Find a step that still needs work (use first incomplete step)
      const stepForOvertime = sortedSteps.find((s) => remainingByStep.has(s.id));
      if (!stepForOvertime) break;

      // Calculate output for overtime block
      const actualOvertimeMinutes =
        timeToMinutes(overtimeEnd) - timeToMinutes(overtimeStart);
      const outputInBlock = Math.floor(
        (actualOvertimeMinutes * 60) / stepForOvertime.time_per_piece_seconds
      );

      // Find qualified worker for overtime
      const workerAssignment = await findQualifiedWorker(
        stepForOvertime as StepWithDependencies,
        dateStr,
        overtimeStart,
        overtimeEnd
      );

      overtimeSuggestions.push({
        id: generateId(),
        product_step_id: stepForOvertime.id,
        worker_id: workerAssignment?.workerId ?? null,
        worker_name: workerAssignment?.workerName ?? null,
        date: dateStr,
        start_time: overtimeStart,
        end_time: overtimeEnd,
        planned_output: outputInBlock,
        step_name: stepForOvertime.name,
        category: stepForOvertime.category,
        required_skill_category: stepForOvertime.required_skill_category as
          | "SEWING"
          | "OTHER",
        is_overtime: true,
        is_auto_suggested: true,
      });

      overtimeMinutesGenerated += actualOvertimeMinutes;
      overtimeDate.setDate(overtimeDate.getDate() + 1);
    }

    overtimeMinutesNeeded = overtimeMinutesGenerated;
  }

  return {
    scheduleId,
    orderId: order.id,
    productName: product?.name || `Product #${order.product_id}`,
    dueDate: order.due_date,
    totalOutput,
    completedOutput,
    remainingOutput,
    canMeetDeadline,
    regularHoursNeeded,
    overtimeHoursNeeded: overtimeMinutesNeeded / 60,
    draftEntries,
    overtimeSuggestions,
    availableWorkers: workers,
  };
}

export async function commitReplan(
  scheduleId: number,
  request: CommitReplanRequest
): Promise<Schedule | null> {
  const { entries, newWorkers } = request;

  // Verify schedule exists
  const scheduleResult = await db.execute({
    sql: "SELECT * FROM schedules WHERE id = ?",
    args: [scheduleId]
  });
  const schedule = scheduleResult.rows[0] as unknown as Schedule | undefined;
  if (!schedule) return null;

  // Create any new workers
  const createdWorkerIds = new Map<string, number>();
  if (newWorkers && newWorkers.length > 0) {
    for (const worker of newWorkers) {
      const result = await db.execute({
        sql: "INSERT INTO workers (name, skill_category, status) VALUES (?, ?, 'active')",
        args: [worker.name, worker.skill_category]
      });
      // Track by name for assignment
      createdWorkerIds.set(worker.name, Number(result.lastInsertRowid));
    }
  }

  // Delete existing incomplete entries
  await db.execute({
    sql: "DELETE FROM schedule_entries WHERE schedule_id = ? AND status != 'completed'",
    args: [scheduleId]
  });

  // Insert new entries
  for (const entry of entries) {
    // Check if worker_id needs to be resolved from newly created worker
    let workerId = entry.worker_id;
    if (!workerId && entry.worker_name && createdWorkerIds.has(entry.worker_name)) {
      workerId = createdWorkerIds.get(entry.worker_name)!;
    }

    await db.execute({
      sql: `INSERT INTO schedule_entries
       (schedule_id, product_step_id, worker_id, date, start_time, end_time, planned_output, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'not_started')`,
      args: [
        scheduleId,
        entry.product_step_id,
        workerId,
        entry.date,
        entry.start_time,
        entry.end_time,
        entry.planned_output,
      ]
    });
  }

  const finalScheduleResult = await db.execute({
    sql: "SELECT * FROM schedules WHERE id = ?",
    args: [scheduleId]
  });
  return finalScheduleResult.rows[0] as unknown as Schedule;
}

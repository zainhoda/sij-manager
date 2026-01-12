import { db } from "../db";
import type { Order, ProductStep, Schedule, ScheduleEntry } from "../db/schema";

// Work day configuration
const WORK_DAY = {
  morningStart: "07:00",
  lunchStart: "11:00",
  lunchEnd: "11:30",
  dayEnd: "15:30",
  // Total work minutes per day: 4 hours morning + 4 hours afternoon = 8 hours = 480 minutes
  totalMinutes: 480,
};

interface StepWithDependencies extends ProductStep {
  dependencies: number[];
}

interface ScheduleBlock {
  stepId: number;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
}

// Convert time string to minutes since midnight
function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const mins = parts[1] ?? 0;
  return hours * 60 + mins;
}

// Convert minutes since midnight to time string
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// Get available work minutes for a given time slot, accounting for lunch
function getWorkMinutes(startMinutes: number, endMinutes: number): number {
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
function advanceTime(startMinutes: number, minutesToAdd: number): number {
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
  const today = new Date();
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
      let remainingMinutes = Math.ceil(totalSecondsNeeded / 60);
      let outputScheduled = 0;

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

        // Create schedule entry
        db.run(
          `INSERT INTO schedule_entries (schedule_id, product_step_id, date, start_time, end_time, planned_output)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            scheduleId,
            stepId,
            dateStr,
            minutesToTime(currentTimeMinutes),
            minutesToTime(endTimeMinutes),
            outputInBlock,
          ]
        );

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

// Get schedule with all entries
export function getScheduleWithEntries(scheduleId: number) {
  const schedule = db.query("SELECT * FROM schedules WHERE id = ?").get(scheduleId) as Schedule | null;
  if (!schedule) return null;

  const entries = db.query(`
    SELECT
      se.*,
      ps.name as step_name,
      ps.category,
      ps.required_skill_category
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE se.schedule_id = ?
    ORDER BY se.date, se.start_time
  `).all(scheduleId) as (ScheduleEntry & {
    step_name: string;
    category: string;
    required_skill_category: string;
  })[];

  // Group entries by date
  const entriesByDate: Record<string, typeof entries> = {};
  for (const entry of entries) {
    if (!entriesByDate[entry.date]) {
      entriesByDate[entry.date] = [];
    }
    entriesByDate[entry.date]!.push(entry);
  }

  return {
    ...schedule,
    entries,
    entriesByDate,
  };
}

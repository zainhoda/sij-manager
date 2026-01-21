/**
 * Scenario Generator Service
 * Implements different planning strategies: meet_deadlines, minimize_cost, balanced
 */

import type { DemandEntry, BOMStep, Worker } from "../../db/schema";
import {
  WORK_DAY,
  timeToMinutes,
  minutesToTime,
  addDays,
  isWeekend,
  getNextWorkday,
} from "./planner";

export interface ScenarioInput {
  planningRunId: number;
  startDate: string;
  endDate: string;
  demandEntries: DemandEntry[];
  bomStepsMap: Map<number, BOMStep[]>;
  workers: Worker[];
  equipment: { id: number; name: string; station_count: number; hourly_cost: number }[];
  workerCertifications: Map<number, Set<number>>; // workerId -> Set<equipmentId>
}

export interface ScenarioResult {
  name: string;
  strategy: "meet_deadlines" | "minimize_cost" | "balanced" | "custom";
  allowOvertime: boolean;
  overtimeLimitHoursPerDay: number;
  workerPool: number[];
  efficiencyFactor: number;
  metrics: {
    totalLaborHours: number;
    totalOvertimeHours: number;
    totalLaborCost: number;
    totalEquipmentCost: number;
    deadlinesMet: number;
    deadlinesMissed: number;
    latestCompletionDate: string;
  };
  schedule: ScheduleTask[];
  demandProjections: DemandProjection[];
  warnings: string[];
}

export interface ScheduleTask {
  demandEntryId: number;
  bomStepId: number;
  stepName: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  workerIds: number[];
}

export interface DemandProjection {
  demandEntryId: number;
  adjustedTargetDate: string | null;
  assignedPriority: number;
  projectedCompletionDate: string;
  canMeetTarget: boolean;
}

// Work slot tracking
interface WorkSlot {
  workerId: number;
  date: string;
  startMinutes: number;
  endMinutes: number;
}

// Worker schedule state
interface WorkerDay {
  regularMinutesUsed: number;
  overtimeMinutesUsed: number;
  slots: { start: number; end: number }[];
}

type WorkerSchedule = Map<number, Map<string, WorkerDay>>; // workerId -> date -> WorkerDay

/**
 * Generate Meet Deadlines Scenario
 * Allows unlimited overtime, prioritizes strict deadline adherence
 */
export async function generateMeetDeadlinesScenario(
  input: ScenarioInput
): Promise<ScenarioResult> {
  return generateScenario(input, {
    name: "Meet All Deadlines",
    strategy: "meet_deadlines",
    allowOvertime: true,
    overtimeLimitHoursPerDay: 4, // Up to 4 hours OT per day
    efficiencyFactor: 100,
    priorityWeight: 1.5, // Prioritize by deadline
  });
}

/**
 * Generate Minimize Cost Scenario
 * No overtime, may miss some deadlines
 */
export async function generateMinimizeCostScenario(
  input: ScenarioInput
): Promise<ScenarioResult> {
  return generateScenario(input, {
    name: "Minimize Labor Cost",
    strategy: "minimize_cost",
    allowOvertime: false,
    overtimeLimitHoursPerDay: 0,
    efficiencyFactor: 100,
    priorityWeight: 1.0, // Equal priority weighting
  });
}

/**
 * Generate Balanced Scenario
 * Limited overtime (2 hours/day), balance cost vs deadlines
 */
export async function generateBalancedScenario(
  input: ScenarioInput
): Promise<ScenarioResult> {
  return generateScenario(input, {
    name: "Balanced Approach",
    strategy: "balanced",
    allowOvertime: true,
    overtimeLimitHoursPerDay: 2,
    efficiencyFactor: 100,
    priorityWeight: 1.2, // Slightly favor deadlines
  });
}

interface ScenarioConfig {
  name: string;
  strategy: ScenarioResult["strategy"];
  allowOvertime: boolean;
  overtimeLimitHoursPerDay: number;
  efficiencyFactor: number;
  priorityWeight: number;
}

/**
 * Core scenario generation logic
 */
async function generateScenario(
  input: ScenarioInput,
  config: ScenarioConfig
): Promise<ScenarioResult> {
  const schedule: ScheduleTask[] = [];
  const demandProjections: DemandProjection[] = [];
  const warnings: string[] = [];

  // Initialize worker schedules
  const workerSchedule: WorkerSchedule = new Map();
  for (const worker of input.workers) {
    workerSchedule.set(worker.id, new Map());
  }

  // Sort demand by priority and due date
  const sortedDemand = [...input.demandEntries].sort((a, b) => {
    // Higher priority first
    const priorityDiff = (b.priority - a.priority) * config.priorityWeight;
    // Earlier due date first
    const dateDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    return priorityDiff + dateDiff / (1000 * 60 * 60 * 24);
  });

  // Metrics tracking
  let totalLaborMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalLaborCost = 0;
  let totalEquipmentCost = 0;
  let deadlinesMet = 0;
  let deadlinesMissed = 0;
  let latestCompletionDate = input.startDate;

  const dayStartMinutes = timeToMinutes(WORK_DAY.morningStart);
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);
  const lunchStartMinutes = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEndMinutes = timeToMinutes(WORK_DAY.lunchEnd);
  const regularMinutesPerDay = WORK_DAY.totalMinutes;
  const maxOvertimeMinutes = config.overtimeLimitHoursPerDay * 60;

  // Process each demand entry
  for (const demand of sortedDemand) {
    const steps = input.bomStepsMap.get(demand.fishbowl_bom_id) || [];

    if (steps.length === 0) {
      warnings.push(`No BOM steps found for demand ${demand.id} (BOM ${demand.fishbowl_bom_num})`);
      demandProjections.push({
        demandEntryId: demand.id,
        adjustedTargetDate: null,
        assignedPriority: demand.priority,
        projectedCompletionDate: demand.target_completion_date,
        canMeetTarget: false,
      });
      continue;
    }

    let currentDate = getNextWorkday(input.startDate);
    let demandCompletionDate = currentDate;

    // Schedule each step sequentially
    for (const step of steps) {
      const totalSecondsNeeded = step.time_per_piece_seconds * demand.quantity;
      const totalMinutesNeeded = Math.ceil(totalSecondsNeeded / 60);
      let remainingMinutes = totalMinutesNeeded;

      // Find qualified workers for this step
      const qualifiedWorkers = getQualifiedWorkers(
        input.workers,
        step,
        input.workerCertifications
      );

      if (qualifiedWorkers.length === 0) {
        warnings.push(
          `No qualified workers for step "${step.name}" in demand ${demand.id}`
        );
        continue;
      }

      // Schedule work blocks until step is complete
      while (remainingMinutes > 0) {
        // Find next available slot
        const slot = findNextAvailableSlot(
          qualifiedWorkers,
          workerSchedule,
          currentDate,
          input.endDate,
          config.allowOvertime,
          maxOvertimeMinutes
        );

        if (!slot) {
          warnings.push(
            `Could not schedule all work for step "${step.name}" in demand ${demand.id}`
          );
          break;
        }

        // Calculate work duration for this slot
        const slotDuration = slot.endMinutes - slot.startMinutes;
        const workMinutes = Math.min(remainingMinutes, slotDuration);
        const actualEndMinutes = slot.startMinutes + workMinutes;

        // Calculate output for this block
        const secondsInBlock = workMinutes * 60;
        const outputInBlock = Math.floor(secondsInBlock / step.time_per_piece_seconds);

        // Get the worker for this slot
        const worker = input.workers.find((w) => w.id === slot.workerId)!;

        // Create schedule task
        schedule.push({
          demandEntryId: demand.id,
          bomStepId: step.id,
          stepName: step.name,
          date: slot.date,
          startTime: minutesToTime(slot.startMinutes),
          endTime: minutesToTime(actualEndMinutes),
          plannedOutput: outputInBlock,
          workerIds: [slot.workerId],
        });

        // Update worker schedule
        updateWorkerSchedule(
          workerSchedule,
          slot.workerId,
          slot.date,
          slot.startMinutes,
          actualEndMinutes,
          config.allowOvertime,
          dayEndMinutes
        );

        // Track metrics
        const isOvertime = slot.startMinutes >= dayEndMinutes;
        if (isOvertime) {
          totalOvertimeMinutes += workMinutes;
        } else {
          totalLaborMinutes += workMinutes;
        }
        totalLaborCost += (workMinutes / 60) * worker.cost_per_hour;

        // Equipment cost
        if (step.equipment_id) {
          const equip = input.equipment.find((e) => e.id === step.equipment_id);
          if (equip) {
            totalEquipmentCost += (workMinutes / 60) * equip.hourly_cost;
          }
        }

        remainingMinutes -= workMinutes;
        currentDate = slot.date;

        // Track completion date
        if (slot.date > demandCompletionDate) {
          demandCompletionDate = slot.date;
        }
      }
    }

    // Track latest completion
    if (demandCompletionDate > latestCompletionDate) {
      latestCompletionDate = demandCompletionDate;
    }

    // Check if deadline met
    const canMeetTarget = demandCompletionDate <= demand.target_completion_date;
    if (canMeetTarget) {
      deadlinesMet++;
    } else {
      deadlinesMissed++;
    }

    demandProjections.push({
      demandEntryId: demand.id,
      adjustedTargetDate: canMeetTarget ? null : demandCompletionDate,
      assignedPriority: demand.priority,
      projectedCompletionDate: demandCompletionDate,
      canMeetTarget,
    });
  }

  return {
    name: config.name,
    strategy: config.strategy,
    allowOvertime: config.allowOvertime,
    overtimeLimitHoursPerDay: config.overtimeLimitHoursPerDay,
    workerPool: input.workers.map((w) => w.id),
    efficiencyFactor: config.efficiencyFactor,
    metrics: {
      totalLaborHours: totalLaborMinutes / 60,
      totalOvertimeHours: totalOvertimeMinutes / 60,
      totalLaborCost,
      totalEquipmentCost,
      deadlinesMet,
      deadlinesMissed,
      latestCompletionDate,
    },
    schedule,
    demandProjections,
    warnings,
  };
}

/**
 * Get workers qualified for a step (matching skill category and equipment certification)
 */
function getQualifiedWorkers(
  workers: Worker[],
  step: BOMStep,
  certifications: Map<number, Set<number>>
): Worker[] {
  return workers.filter((worker) => {
    // Check equipment certification if required
    if (step.equipment_id) {
      const workerCerts = certifications.get(worker.id);
      if (!workerCerts || !workerCerts.has(step.equipment_id)) {
        return false;
      }
    }

    // Check work category match if specified
    if (step.work_category_id && worker.work_category_id !== step.work_category_id) {
      return false;
    }

    return true;
  });
}

/**
 * Find the next available work slot for any qualified worker
 */
function findNextAvailableSlot(
  qualifiedWorkers: Worker[],
  workerSchedule: WorkerSchedule,
  startDate: string,
  endDate: string,
  allowOvertime: boolean,
  maxOvertimeMinutes: number
): WorkSlot | null {
  const dayStartMinutes = timeToMinutes(WORK_DAY.morningStart);
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);
  const lunchStartMinutes = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEndMinutes = timeToMinutes(WORK_DAY.lunchEnd);

  let currentDate = startDate;

  // Search up to 60 days ahead
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    currentDate = getNextWorkday(addDays(startDate, dayOffset));

    if (currentDate > endDate) {
      return null; // Beyond planning horizon
    }

    // Try each worker
    for (const worker of qualifiedWorkers) {
      const daySchedule = getWorkerDay(workerSchedule, worker.id, currentDate);

      // Find gaps in the day
      const availableSlots = findAvailableSlots(
        daySchedule,
        dayStartMinutes,
        dayEndMinutes,
        lunchStartMinutes,
        lunchEndMinutes,
        allowOvertime,
        maxOvertimeMinutes
      );

      if (availableSlots.length > 0) {
        const slot = availableSlots[0]!;
        return {
          workerId: worker.id,
          date: currentDate,
          startMinutes: slot.start,
          endMinutes: slot.end,
        };
      }
    }
  }

  return null;
}

/**
 * Get or create worker day schedule
 */
function getWorkerDay(
  workerSchedule: WorkerSchedule,
  workerId: number,
  date: string
): WorkerDay {
  let workerDays = workerSchedule.get(workerId);
  if (!workerDays) {
    workerDays = new Map();
    workerSchedule.set(workerId, workerDays);
  }

  let daySchedule = workerDays.get(date);
  if (!daySchedule) {
    daySchedule = {
      regularMinutesUsed: 0,
      overtimeMinutesUsed: 0,
      slots: [],
    };
    workerDays.set(date, daySchedule);
  }

  return daySchedule;
}

/**
 * Find available time slots in a worker's day
 */
function findAvailableSlots(
  daySchedule: WorkerDay,
  dayStart: number,
  dayEnd: number,
  lunchStart: number,
  lunchEnd: number,
  allowOvertime: boolean,
  maxOvertimeMinutes: number
): { start: number; end: number }[] {
  const availableSlots: { start: number; end: number }[] = [];

  // Sort existing slots
  const sortedSlots = [...daySchedule.slots].sort((a, b) => a.start - b.start);

  // Work periods: morning (dayStart to lunchStart), afternoon (lunchEnd to dayEnd)
  const periods = [
    { start: dayStart, end: lunchStart },
    { start: lunchEnd, end: dayEnd },
  ];

  // Add overtime period if allowed
  if (allowOvertime && daySchedule.overtimeMinutesUsed < maxOvertimeMinutes) {
    const remainingOT = maxOvertimeMinutes - daySchedule.overtimeMinutesUsed;
    periods.push({ start: dayEnd, end: dayEnd + remainingOT });
  }

  for (const period of periods) {
    let periodStart = period.start;

    for (const slot of sortedSlots) {
      if (slot.end <= period.start) continue;
      if (slot.start >= period.end) break;

      // Gap before this slot
      if (periodStart < slot.start && periodStart < period.end) {
        availableSlots.push({
          start: periodStart,
          end: Math.min(slot.start, period.end),
        });
      }

      periodStart = Math.max(periodStart, slot.end);
    }

    // Gap after all slots
    if (periodStart < period.end) {
      availableSlots.push({
        start: periodStart,
        end: period.end,
      });
    }
  }

  // Filter out slots that are too small (< 15 minutes)
  return availableSlots.filter((s) => s.end - s.start >= 15);
}

/**
 * Update worker schedule with new work block
 */
function updateWorkerSchedule(
  workerSchedule: WorkerSchedule,
  workerId: number,
  date: string,
  startMinutes: number,
  endMinutes: number,
  allowOvertime: boolean,
  regularDayEnd: number
): void {
  const daySchedule = getWorkerDay(workerSchedule, workerId, date);

  // Add the slot
  daySchedule.slots.push({ start: startMinutes, end: endMinutes });

  // Track regular vs overtime
  const duration = endMinutes - startMinutes;
  if (startMinutes >= regularDayEnd) {
    daySchedule.overtimeMinutesUsed += duration;
  } else if (endMinutes > regularDayEnd) {
    const regularPart = regularDayEnd - startMinutes;
    const overtimePart = endMinutes - regularDayEnd;
    daySchedule.regularMinutesUsed += regularPart;
    daySchedule.overtimeMinutesUsed += overtimePart;
  } else {
    daySchedule.regularMinutesUsed += duration;
  }
}

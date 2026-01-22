/**
 * Scenario Generator Service
 * Implements different planning strategies: meet_deadlines, minimize_cost, balanced
 */

import type { DemandEntry, Worker, BOMStep } from "../../db/schema";
import {
  WORK_DAY,
  timeToMinutes,
  minutesToTime,
  addDays,
  isWeekend,
  getNextWorkday,
  type PlanningPreferences,
  type BOMStepWithDeps,
} from "./planner";

export interface ScenarioInput {
  planningRunId: number;
  startDate: string;
  endDate: string;
  demandEntries: DemandEntry[];
  bomStepsMap: Map<number, BOMStepWithDeps[]>;
  workers: Worker[];
  equipment: { id: number; name: string; station_count: number; hourly_cost: number }[];
  workerCertifications: Map<number, Set<number>>; // workerId -> Set<equipmentId>
  preferences?: PlanningPreferences;
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

export interface ScheduleTaskConstraint {
  type: 'dependency' | 'certification' | 'work_category' | 'availability' | 'batch';
  description: string;
}

export interface ScheduleTask {
  demandEntryId: number;
  batchNumber: number;
  batchQuantity: number;
  bomStepId: number;
  stepName: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  workerIds: number[];
  assignmentReason: string;
  constraints: ScheduleTaskConstraint[];
}

export interface DemandProjection {
  demandEntryId: number;
  adjustedTargetDate: string | null;
  assignedPriority: number;
  projectedCompletionDate: string;
  canMeetTarget: boolean;
}

// Batch tracking
interface Batch {
  batchNumber: number;
  quantity: number;
}

// Step state for dependency tracking
interface StepBatchState {
  started: boolean;
  startedDate: string | null;
  startedMinutes: number;
  completed: boolean;
  completedDate: string | null;
  completedMinutes: number;
}

// Work slot tracking
interface WorkSlot {
  workerId: number;
  date: string;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Calculate batches for a demand entry based on preferences
 */
function calculateBatches(
  demand: DemandEntry,
  preferences?: PlanningPreferences
): Batch[] {
  const total = demand.quantity;

  // Get batch sizes from per-demand preferences (default to full quantity = no batching)
  const demandPrefs = preferences?.batching?.perDemand?.[demand.id];
  const minSize = demandPrefs?.minBatchSize ?? total;
  const maxSize = demandPrefs?.maxBatchSize ?? total;

  // Default: use max batch size to minimize number of batches
  const batchSize = Math.min(maxSize, total);
  const batches: Batch[] = [];

  let remaining = total;
  let batchNum = 1;

  while (remaining > 0) {
    const thisSize = Math.min(batchSize, remaining);

    // Don't create tiny batches below min (add to last batch instead)
    if (thisSize < minSize && batches.length > 0) {
      batches[batches.length - 1]!.quantity += thisSize;
      remaining = 0;
    } else {
      batches.push({ batchNumber: batchNum++, quantity: thisSize });
      remaining -= thisSize;
    }
  }

  return batches;
}

/**
 * Get the earliest time a step can start based on dependency completion times
 * @param step The step to check
 * @param batchNumber The batch number
 * @param stepBatchStates Map of "stepId:batchNumber" -> state
 * @returns The earliest start time, or null if no dependencies constrain the start
 */
function getEarliestStartTime(
  step: BOMStepWithDeps,
  batchNumber: number,
  stepBatchStates: Map<string, StepBatchState>
): { date: string; minutes: number } | null {
  let latestDate: string | null = null;
  let latestMinutes = 0;

  // Check BOM step dependencies (finish-to-start within same batch)
  for (const dep of step.dependencies) {
    if (dep.type === 'finish') {
      const key = `${dep.dependsOnStepId}:${batchNumber}`;
      const state = stepBatchStates.get(key);
      if (state?.completedDate) {
        if (!latestDate || state.completedDate > latestDate ||
            (state.completedDate === latestDate && state.completedMinutes > latestMinutes)) {
          latestDate = state.completedDate;
          latestMinutes = state.completedMinutes;
        }
      }
    }
  }

  // Check previous batch of same step must complete first
  if (batchNumber > 1) {
    const prevKey = `${step.id}:${batchNumber - 1}`;
    const prevState = stepBatchStates.get(prevKey);
    if (prevState?.completedDate) {
      if (!latestDate || prevState.completedDate > latestDate ||
          (prevState.completedDate === latestDate && prevState.completedMinutes > latestMinutes)) {
        latestDate = prevState.completedDate;
        latestMinutes = prevState.completedMinutes;
      }
    }
  }

  return latestDate ? { date: latestDate, minutes: latestMinutes } : null;
}

/**
 * Check if a step's dependencies are satisfied for a given batch
 * @param step The step to check
 * @param batchNumber The batch number
 * @param stepBatchStates Map of "stepId:batchNumber" -> state
 * @param allSteps All steps for this demand (for looking up dependency names)
 */
function dependenciesSatisfied(
  step: BOMStepWithDeps,
  batchNumber: number,
  stepBatchStates: Map<string, StepBatchState>,
  allSteps: BOMStepWithDeps[]
): boolean {
  // Check BOM step dependencies (within same batch)
  for (const dep of step.dependencies) {
    const key = `${dep.dependsOnStepId}:${batchNumber}`;
    const depState = stepBatchStates.get(key);

    if (!depState) return false;

    if (dep.type === 'start') {
      if (!depState.started) return false;
    } else {
      if (!depState.completed) return false;
    }
  }

  // Check batch dependency: previous batch of same step must be completed
  if (batchNumber > 1) {
    const prevBatchKey = `${step.id}:${batchNumber - 1}`;
    const prevBatchState = stepBatchStates.get(prevBatchKey);
    if (!prevBatchState || !prevBatchState.completed) {
      return false;
    }
  }

  return true;
}

/**
 * Build assignment reasoning for a scheduled task
 */
function buildAssignmentReason(
  step: BOMStepWithDeps,
  batchNumber: number,
  worker: Worker,
  qualifiedWorkers: Worker[],
  allSteps: BOMStepWithDeps[],
  equipment: { id: number; name: string }[]
): { reason: string; constraints: ScheduleTaskConstraint[] } {
  const constraints: ScheduleTaskConstraint[] = [];

  // Add dependency constraints
  for (const dep of step.dependencies) {
    const depStep = allSteps.find((s) => s.id === dep.dependsOnStepId);
    constraints.push({
      type: 'dependency',
      description: dep.type === 'start'
        ? `Can start once "${depStep?.name || 'unknown step'}" begins`
        : `Must wait for "${depStep?.name || 'unknown step'}" to complete`,
    });
  }

  // Add batch dependency if not first batch
  if (batchNumber > 1) {
    constraints.push({
      type: 'batch',
      description: `Must wait for batch ${batchNumber - 1} of this step to complete`,
    });
  }

  // Add certification constraint if equipment required
  if (step.equipment_id) {
    const equip = equipment.find((e) => e.id === step.equipment_id);
    constraints.push({
      type: 'certification',
      description: `Requires certification for ${equip?.name || 'equipment'}`,
    });
  }

  // Add work category constraint
  if (step.work_category_id) {
    constraints.push({
      type: 'work_category',
      description: `Requires matching work category`,
    });
  }

  // Add availability note if limited options
  if (qualifiedWorkers.length === 1) {
    constraints.push({
      type: 'availability',
      description: `Only qualified worker available`,
    });
  } else if (qualifiedWorkers.length > 1) {
    constraints.push({
      type: 'availability',
      description: `Selected from ${qualifiedWorkers.length} qualified workers`,
    });
  }

  // Build human-readable summary
  const reason = constraints.map((c) => c.description).join('; ');

  return { reason, constraints };
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

  // Validate dependencies exist for all multi-step BOMs
  for (const demand of sortedDemand) {
    const steps = input.bomStepsMap.get(demand.fishbowl_bom_id) || [];

    if (steps.length === 0) {
      throw new Error(
        `No BOM steps defined for BOM ${demand.fishbowl_bom_num}. ` +
        `Please define BOM steps before planning.`
      );
    }

    // Check that at least some dependencies exist (except for single-step BOMs)
    if (steps.length > 1) {
      const stepsWithDeps = steps.filter((s) => s.dependencies.length > 0);
      if (stepsWithDeps.length === 0) {
        throw new Error(
          `No dependencies defined for BOM ${demand.fishbowl_bom_num} which has ${steps.length} steps. ` +
          `Please define step dependencies before planning.`
        );
      }
    }
  }

  // Process each demand entry with batch processing and dependency-aware scheduling
  for (const demand of sortedDemand) {
    const steps = input.bomStepsMap.get(demand.fishbowl_bom_id) || [];

    // Calculate batches for this demand
    const batches = calculateBatches(demand, input.preferences);

    // Track state for each step-batch combination
    // Key: "stepId:batchNumber"
    const stepBatchStates = new Map<string, StepBatchState>();

    // Initialize all step-batch combinations as pending
    interface PendingWork {
      step: BOMStepWithDeps;
      batch: Batch;
      remainingMinutes: number;
      totalMinutes: number;
    }
    const pendingWork: PendingWork[] = [];

    for (const batch of batches) {
      for (const step of steps) {
        const totalSecondsNeeded = step.time_per_piece_seconds * batch.quantity;
        const totalMinutesNeeded = Math.ceil(totalSecondsNeeded / 60);

        pendingWork.push({
          step,
          batch,
          remainingMinutes: totalMinutesNeeded,
          totalMinutes: totalMinutesNeeded,
        });

        // Initialize state
        const key = `${step.id}:${batch.batchNumber}`;
        stepBatchStates.set(key, {
          started: false,
          startedDate: null,
          startedMinutes: 0,
          completed: false,
          completedDate: null,
          completedMinutes: 0,
        });
      }
    }

    let currentDate = getNextWorkday(input.startDate);
    let demandCompletionDate = currentDate;
    let iterationCount = 0;
    const maxIterations = 10000; // Safety limit

    // Process work until all complete
    while (pendingWork.some((w) => w.remainingMinutes > 0) && iterationCount < maxIterations) {
      iterationCount++;

      // Find work items whose dependencies are satisfied
      const readyWork = pendingWork.filter((w) => {
        if (w.remainingMinutes <= 0) return false;

        const key = `${w.step.id}:${w.batch.batchNumber}`;
        const state = stepBatchStates.get(key)!;

        // If already started, continue it
        if (state.started && !state.completed) return true;

        // Check if dependencies are satisfied
        return dependenciesSatisfied(w.step, w.batch.batchNumber, stepBatchStates, steps);
      });

      if (readyWork.length === 0) {
        // Check if we're stuck (circular dependency or bug)
        const remaining = pendingWork.filter((w) => w.remainingMinutes > 0);
        if (remaining.length > 0) {
          throw new Error(
            `Could not schedule remaining work for BOM ${demand.fishbowl_bom_num}. ` +
            `Possible circular dependency. Stuck on ${remaining.length} step-batch combinations.`
          );
        }
        break;
      }

      // Try to schedule each ready work item
      for (const work of readyWork) {
        const { step, batch } = work;
        const key = `${step.id}:${batch.batchNumber}`;
        const state = stepBatchStates.get(key)!;

        // Find qualified workers for this step
        const qualifiedWorkers = getQualifiedWorkers(
          input.workers,
          step,
          input.workerCertifications
        );

        if (qualifiedWorkers.length === 0) {
          warnings.push(
            `No qualified workers for step "${step.name}" batch ${batch.batchNumber} in demand ${demand.id}`
          );
          work.remainingMinutes = 0; // Skip this work
          state.completed = true;
          state.completedDate = currentDate;
          continue;
        }

        // Calculate earliest start time based on dependency completion times
        const earliestStartTime = getEarliestStartTime(step, batch.batchNumber, stepBatchStates);

        // Find next available slot (respecting dependency completion times)
        const slot = findNextAvailableSlot(
          qualifiedWorkers,
          workerSchedule,
          currentDate,
          input.endDate,
          config.allowOvertime,
          maxOvertimeMinutes,
          earliestStartTime
        );

        if (!slot) {
          // No slot available, try next iteration (time may advance)
          continue;
        }

        // Mark as started if not already
        if (!state.started) {
          state.started = true;
          state.startedDate = slot.date;
          state.startedMinutes = slot.startMinutes;
        }

        // Calculate work duration for this slot
        const slotDuration = slot.endMinutes - slot.startMinutes;
        const workMinutes = Math.min(work.remainingMinutes, slotDuration);
        const actualEndMinutes = slot.startMinutes + workMinutes;

        // Calculate output for this block
        const secondsInBlock = workMinutes * 60;
        const outputInBlock = Math.floor(secondsInBlock / step.time_per_piece_seconds);

        // Get the worker for this slot
        const worker = input.workers.find((w) => w.id === slot.workerId)!;

        // Build assignment reasoning
        const { reason, constraints } = buildAssignmentReason(
          step,
          batch.batchNumber,
          worker,
          qualifiedWorkers,
          steps,
          input.equipment
        );

        // Create schedule task
        schedule.push({
          demandEntryId: demand.id,
          batchNumber: batch.batchNumber,
          batchQuantity: batch.quantity,
          bomStepId: step.id,
          stepName: step.name,
          date: slot.date,
          startTime: minutesToTime(slot.startMinutes),
          endTime: minutesToTime(actualEndMinutes),
          plannedOutput: outputInBlock,
          workerIds: [slot.workerId],
          assignmentReason: reason,
          constraints,
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

        work.remainingMinutes -= workMinutes;
        currentDate = slot.date;

        // Track completion date
        if (slot.date > demandCompletionDate) {
          demandCompletionDate = slot.date;
        }

        // Mark as completed if done
        if (work.remainingMinutes <= 0) {
          state.completed = true;
          state.completedDate = slot.date;
          state.completedMinutes = actualEndMinutes;
        }
      }
    }

    if (iterationCount >= maxIterations) {
      warnings.push(`Max iterations reached for demand ${demand.id} - schedule may be incomplete`);
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
  step: BOMStepWithDeps,
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

    // Work category is descriptive only - not used for filtering

    return true;
  });
}

/**
 * Find the next available work slot for any qualified worker
 * @param earliestStartTime If provided, only return slots that start at or after this time
 */
function findNextAvailableSlot(
  qualifiedWorkers: Worker[],
  workerSchedule: WorkerSchedule,
  startDate: string,
  endDate: string,
  allowOvertime: boolean,
  maxOvertimeMinutes: number,
  earliestStartTime: { date: string; minutes: number } | null = null
): WorkSlot | null {
  const dayStartMinutes = timeToMinutes(WORK_DAY.morningStart);
  const dayEndMinutes = timeToMinutes(WORK_DAY.dayEnd);
  const lunchStartMinutes = timeToMinutes(WORK_DAY.lunchStart);
  const lunchEndMinutes = timeToMinutes(WORK_DAY.lunchEnd);

  // If we have an earliest start time, start searching from that date
  const effectiveStartDate = earliestStartTime && earliestStartTime.date > startDate
    ? earliestStartTime.date
    : startDate;

  let currentDate = effectiveStartDate;

  // Search up to 60 days ahead
  for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
    currentDate = getNextWorkday(addDays(effectiveStartDate, dayOffset));

    if (currentDate > endDate) {
      return null; // Beyond planning horizon
    }

    // Determine the minimum start time for this date
    let minStartMinutes = dayStartMinutes;
    if (earliestStartTime && currentDate === earliestStartTime.date) {
      minStartMinutes = earliestStartTime.minutes;
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

      // Filter and adjust slots based on minimum start time
      for (const slot of availableSlots) {
        // Skip slots that end before or at the minimum start time
        if (slot.end <= minStartMinutes) {
          continue;
        }

        // Adjust slot start if it's before the minimum
        const adjustedStart = Math.max(slot.start, minStartMinutes);
        const adjustedDuration = slot.end - adjustedStart;

        // Skip if the adjusted slot is too small (< 15 minutes)
        if (adjustedDuration < 15) {
          continue;
        }

        return {
          workerId: worker.id,
          date: currentDate,
          startMinutes: adjustedStart,
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

/**
 * Global Planner Service
 * Creates planning runs with multiple scenarios for global demand pool
 */

import type { Client } from "@libsql/client";
import type {
  PlanningRun,
  PlanningScenario,
  DemandEntry,
  BOMStep,
  Worker,
} from "../../db/schema";
import { getDemandEntries } from "../demand/demand-pool";
import {
  generateMeetDeadlinesScenario,
  generateMinimizeCostScenario,
  generateBalancedScenario,
  type ScenarioInput,
  type ScenarioResult,
  type ScheduleTask as GeneratedScheduleTask,
} from "./scenario-generator";
import {
  validateSchedule,
  type ValidationResult,
  type ValidationContext,
} from "./schedule-validator";

// ============================================================
// Planning Preferences
// ============================================================

export interface PlanningPreferences {
  // Batch configuration per demand entry
  batching?: {
    perDemand?: {
      [demandEntryId: number]: {
        minBatchSize?: number;
        maxBatchSize?: number;
      };
    };
  };

  // Worker preferences
  workerPreferences?: {
    perStep?: {
      [bomStepId: number]: {
        preferredWorkerIds?: number[];  // Try these workers first
        excludedWorkerIds?: number[];   // Never assign these workers
      };
    };
  };
}

// ============================================================
// BOM Step with Dependencies
// ============================================================

export interface BOMStepDependency {
  dependsOnStepId: number;
  type: 'start' | 'finish';
}

export interface BOMStepWithDeps extends BOMStep {
  dependencies: BOMStepDependency[];
}

// Work day configuration
export const WORK_DAY = {
  morningStart: "07:00",
  lunchStart: "11:00",
  lunchEnd: "11:30",
  dayEnd: "15:30",
  totalMinutes: 480, // 8 hours
};

export interface CreatePlanningRunInput {
  name: string;
  description?: string;
  planning_start_date: string;
  planning_end_date: string;
  demand_entry_ids?: number[]; // If not provided, include all pending demand
  created_by?: string;
  preferences?: PlanningPreferences;
}

export interface PlanningRunWithScenarios extends PlanningRun {
  scenarios: PlanningScenario[];
  demand_entries: DemandEntry[];
}

/**
 * Create a new planning run and generate scenarios
 */
export async function createPlanningRun(
  db: Client,
  input: CreatePlanningRunInput
): Promise<PlanningRunWithScenarios> {
  const now = new Date().toISOString();
  const preferences = input.preferences || {};
  const preferencesJson = JSON.stringify(preferences);

  // Create the planning run
  const runResult = await db.execute({
    sql: `
      INSERT INTO planning_runs (
        name, description, planning_start_date, planning_end_date,
        preferences_json, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
      RETURNING *
    `,
    args: [
      input.name,
      input.description || null,
      input.planning_start_date,
      input.planning_end_date,
      preferencesJson,
      input.created_by || null,
      now,
    ],
  });

  const planningRun = runResult.rows[0] as unknown as PlanningRun;

  // Get demand entries to include
  let demandEntries: DemandEntry[];
  if (input.demand_entry_ids && input.demand_entry_ids.length > 0) {
    // Specific entries
    const placeholders = input.demand_entry_ids.map(() => "?").join(", ");
    const result = await db.execute({
      sql: `SELECT * FROM demand_entries WHERE id IN (${placeholders})`,
      args: input.demand_entry_ids,
    });
    demandEntries = result.rows as unknown as DemandEntry[];
  } else {
    // All pending/in_progress demand
    const { entries } = await getDemandEntries(db, {
      status: ["pending", "in_progress"],
    });
    demandEntries = entries;
  }

  // Get resources
  const resources = await getAvailableResources(db);

  // Get BOM steps for all demand entries
  const bomStepsMap = await getBOMStepsForDemand(db, demandEntries);

  // Build scenario input
  const scenarioInput: ScenarioInput = {
    planningRunId: planningRun.id,
    startDate: input.planning_start_date,
    endDate: input.planning_end_date,
    demandEntries,
    bomStepsMap,
    workers: resources.workers,
    equipment: resources.equipment,
    workerCertifications: resources.certifications,
    preferences,
  };

  // Generate all three scenarios
  const scenarios: PlanningScenario[] = [];

  // 1. Meet Deadlines scenario
  const meetDeadlinesResult = await generateMeetDeadlinesScenario(scenarioInput);
  const meetDeadlinesScenario = await saveScenario(db, planningRun.id, meetDeadlinesResult);
  scenarios.push(meetDeadlinesScenario);

  // 2. Minimize Cost scenario
  const minimizeCostResult = await generateMinimizeCostScenario(scenarioInput);
  const minimizeCostScenario = await saveScenario(db, planningRun.id, minimizeCostResult);
  scenarios.push(minimizeCostScenario);

  // 3. Balanced scenario
  const balancedResult = await generateBalancedScenario(scenarioInput);
  const balancedScenario = await saveScenario(db, planningRun.id, balancedResult);
  scenarios.push(balancedScenario);

  // Update run status
  await db.execute({
    sql: "UPDATE planning_runs SET status = 'pending' WHERE id = ?",
    args: [planningRun.id],
  });

  return {
    ...planningRun,
    status: "pending",
    scenarios,
    demand_entries: demandEntries,
  };
}

/**
 * Save a generated scenario to the database
 */
async function saveScenario(
  db: Client,
  planningRunId: number,
  result: ScenarioResult
): Promise<PlanningScenario> {
  const now = new Date().toISOString();

  const scenarioResult = await db.execute({
    sql: `
      INSERT INTO planning_scenarios (
        planning_run_id, name, strategy,
        allow_overtime, overtime_limit_hours_per_day,
        worker_pool_json, efficiency_factor,
        total_labor_hours, total_overtime_hours,
        total_labor_cost, total_equipment_cost,
        deadlines_met, deadlines_missed, latest_completion_date,
        schedule_json, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    args: [
      planningRunId,
      result.name,
      result.strategy,
      result.allowOvertime ? 1 : 0,
      result.overtimeLimitHoursPerDay,
      JSON.stringify(result.workerPool || []),
      result.efficiencyFactor,
      result.metrics.totalLaborHours,
      result.metrics.totalOvertimeHours,
      result.metrics.totalLaborCost,
      result.metrics.totalEquipmentCost,
      result.metrics.deadlinesMet,
      result.metrics.deadlinesMissed,
      result.metrics.latestCompletionDate,
      JSON.stringify(result.schedule),
      JSON.stringify(result.warnings),
      now,
    ],
  });

  const scenario = scenarioResult.rows[0] as unknown as PlanningScenario;

  // Save scenario-demand entries with projections
  for (const projection of result.demandProjections) {
    await db.execute({
      sql: `
        INSERT INTO scenario_demand_entries (
          scenario_id, demand_entry_id,
          adjusted_target_date, assigned_priority,
          projected_completion_date, can_meet_target
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        scenario.id,
        projection.demandEntryId,
        projection.adjustedTargetDate || null,
        projection.assignedPriority,
        projection.projectedCompletionDate,
        projection.canMeetTarget ? 1 : 0,
      ],
    });
  }

  return scenario;
}

/**
 * Accept a scenario and create plan tasks
 */
export async function acceptScenario(
  db: Client,
  planningRunId: number,
  scenarioId: number,
  acceptedBy?: string
): Promise<{ success: boolean; tasksCreated: number }> {
  const now = new Date().toISOString();

  // Get the scenario
  const scenarioResult = await db.execute({
    sql: "SELECT * FROM planning_scenarios WHERE id = ? AND planning_run_id = ?",
    args: [scenarioId, planningRunId],
  });

  if (scenarioResult.rows.length === 0) {
    throw new Error("Scenario not found");
  }

  const scenario = scenarioResult.rows[0] as unknown as PlanningScenario;

  // Parse the schedule
  const schedule = JSON.parse(scenario.schedule_json || "[]") as ScheduleTask[];

  // Create plan tasks
  let tasksCreated = 0;
  for (const task of schedule) {
    const taskResult = await db.execute({
      sql: `
        INSERT INTO plan_tasks (
          planning_run_id, demand_entry_id, bom_step_id,
          scheduled_date, start_time, end_time, planned_output,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'not_started', ?)
        RETURNING id
      `,
      args: [
        planningRunId,
        task.demandEntryId,
        task.bomStepId,
        task.date,
        task.startTime,
        task.endTime,
        task.plannedOutput,
        now,
      ],
    });

    const taskId = taskResult.rows[0]!.id as number;

    // Create worker assignments
    for (const workerId of task.workerIds) {
      await db.execute({
        sql: `
          INSERT INTO task_assignments (plan_task_id, worker_id, assigned_at)
          VALUES (?, ?, ?)
        `,
        args: [taskId, workerId, now],
      });
    }

    tasksCreated++;
  }

  // Update demand entries to planned status
  const demandResult = await db.execute({
    sql: "SELECT DISTINCT demand_entry_id FROM scenario_demand_entries WHERE scenario_id = ?",
    args: [scenarioId],
  });

  for (const row of demandResult.rows) {
    const demandEntryId = (row as unknown as { demand_entry_id: number }).demand_entry_id;
    await db.execute({
      sql: "UPDATE demand_entries SET status = 'planned', updated_at = ? WHERE id = ? AND status = 'pending'",
      args: [now, demandEntryId],
    });
  }

  // Update planning run
  await db.execute({
    sql: `
      UPDATE planning_runs
      SET status = 'accepted', accepted_scenario_id = ?, accepted_by = ?, accepted_at = ?
      WHERE id = ?
    `,
    args: [scenarioId, acceptedBy || null, now, planningRunId],
  });

  return { success: true, tasksCreated };
}

/**
 * Get a planning run with all scenarios
 */
export async function getPlanningRun(
  db: Client,
  id: number
): Promise<PlanningRunWithScenarios | null> {
  const runResult = await db.execute({
    sql: "SELECT * FROM planning_runs WHERE id = ?",
    args: [id],
  });

  if (runResult.rows.length === 0) return null;

  const planningRun = runResult.rows[0] as unknown as PlanningRun;

  // Get scenarios
  const scenariosResult = await db.execute({
    sql: "SELECT * FROM planning_scenarios WHERE planning_run_id = ? ORDER BY created_at",
    args: [id],
  });
  const scenarios = scenariosResult.rows as unknown as PlanningScenario[];

  // Get demand entries via scenario_demand_entries
  const demandResult = await db.execute({
    sql: `
      SELECT DISTINCT d.* FROM demand_entries d
      JOIN scenario_demand_entries sde ON d.id = sde.demand_entry_id
      JOIN planning_scenarios ps ON sde.scenario_id = ps.id
      WHERE ps.planning_run_id = ?
    `,
    args: [id],
  });
  const demandEntries = demandResult.rows as unknown as DemandEntry[];

  return {
    ...planningRun,
    scenarios,
    demand_entries: demandEntries,
  };
}

/**
 * Get all planning runs
 */
export async function getPlanningRuns(
  db: Client,
  options: { status?: PlanningRun["status"]; limit?: number } = {}
): Promise<PlanningRun[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

  const result = await db.execute({
    sql: `SELECT * FROM planning_runs ${whereClause} ORDER BY created_at DESC ${limitClause}`,
    args: params,
  });

  return result.rows as unknown as PlanningRun[];
}

/**
 * Get the currently active (accepted) planning run
 */
export async function getActivePlanningRun(
  db: Client
): Promise<PlanningRunWithScenarios | null> {
  const result = await db.execute(
    "SELECT id FROM planning_runs WHERE status = 'accepted' ORDER BY accepted_at DESC LIMIT 1"
  );

  if (result.rows.length === 0) return null;

  return getPlanningRun(db, result.rows[0]!.id as number);
}

/**
 * Archive a planning run
 */
export async function archivePlanningRun(
  db: Client,
  id: number
): Promise<boolean> {
  const result = await db.execute({
    sql: "UPDATE planning_runs SET status = 'archived' WHERE id = ?",
    args: [id],
  });
  return result.rowsAffected > 0;
}

/**
 * Delete a planning run and all associated data
 */
export async function deletePlanningRun(
  db: Client,
  id: number
): Promise<boolean> {
  // Check if run exists
  const runResult = await db.execute({
    sql: "SELECT id FROM planning_runs WHERE id = ?",
    args: [id],
  });

  if (runResult.rows.length === 0) {
    return false;
  }

  // Delete plan tasks first (task_assignments will cascade)
  await db.execute({
    sql: "DELETE FROM plan_tasks WHERE planning_run_id = ?",
    args: [id],
  });

  // Delete the planning run (scenarios and scenario_demand_entries will cascade)
  await db.execute({
    sql: "DELETE FROM planning_runs WHERE id = ?",
    args: [id],
  });

  return true;
}

// ============================================================
// Schedule Preview and Editing
// ============================================================

export interface ScheduleWithContext {
  scenario: PlanningScenario;
  schedule: GeneratedScheduleTask[];
  workers: { id: number; name: string; status: string; workCategoryId: number | null }[];
  demandEntries: { id: number; bomNum: string; customerName: string | null; quantity: number; dueDate: string }[];
  bomSteps: { id: number; name: string; equipmentId: number | null; workCategoryId: number | null }[];
  certifications: { workerId: number; equipmentId: number }[];
}

/**
 * Get a scenario's schedule with all context needed for preview/editing
 */
export async function getScenarioScheduleWithContext(
  db: Client,
  scenarioId: number
): Promise<ScheduleWithContext | null> {
  // Get the scenario
  const scenarioResult = await db.execute({
    sql: "SELECT * FROM planning_scenarios WHERE id = ?",
    args: [scenarioId],
  });

  if (scenarioResult.rows.length === 0) return null;

  const scenario = scenarioResult.rows[0] as unknown as PlanningScenario;
  const schedule = JSON.parse(scenario.schedule_json || "[]") as GeneratedScheduleTask[];

  // Get workers
  const workersResult = await db.execute("SELECT id, name, status, work_category_id FROM workers");
  const workers = (workersResult.rows as unknown as { id: number; name: string; status: string; work_category_id: number | null }[])
    .map(w => ({ id: w.id, name: w.name, status: w.status, workCategoryId: w.work_category_id }));

  // Get demand entries for this scenario
  const demandResult = await db.execute({
    sql: `
      SELECT d.id, d.fishbowl_bom_num, d.customer_name, d.quantity, d.due_date
      FROM demand_entries d
      JOIN scenario_demand_entries sde ON d.id = sde.demand_entry_id
      WHERE sde.scenario_id = ?
    `,
    args: [scenarioId],
  });
  const demandEntries = (demandResult.rows as unknown as { id: number; fishbowl_bom_num: string; customer_name: string | null; quantity: number; due_date: string }[])
    .map(d => ({ id: d.id, bomNum: d.fishbowl_bom_num, customerName: d.customer_name, quantity: d.quantity, dueDate: d.due_date }));

  // Get BOM steps
  const stepIds = [...new Set(schedule.map(t => t.bomStepId))];
  let bomSteps: { id: number; name: string; equipmentId: number | null; workCategoryId: number | null }[] = [];
  if (stepIds.length > 0) {
    const placeholders = stepIds.map(() => "?").join(", ");
    const stepsResult = await db.execute({
      sql: `SELECT id, name, equipment_id, work_category_id FROM bom_steps WHERE id IN (${placeholders})`,
      args: stepIds,
    });
    bomSteps = (stepsResult.rows as unknown as { id: number; name: string; equipment_id: number | null; work_category_id: number | null }[])
      .map(s => ({ id: s.id, name: s.name, equipmentId: s.equipment_id, workCategoryId: s.work_category_id }));
  }

  // Get certifications
  const certsResult = await db.execute(`
    SELECT worker_id, equipment_id FROM equipment_certifications
    WHERE expires_at IS NULL OR expires_at > datetime('now')
  `);
  const certifications = (certsResult.rows as unknown as { worker_id: number; equipment_id: number }[])
    .map(c => ({ workerId: c.worker_id, equipmentId: c.equipment_id }));

  return {
    scenario,
    schedule,
    workers,
    demandEntries,
    bomSteps,
    certifications,
  };
}

/**
 * Validate a schedule against workers and constraints
 */
export async function validateScenarioSchedule(
  db: Client,
  scenarioId: number,
  schedule: GeneratedScheduleTask[]
): Promise<ValidationResult> {
  // Get all workers
  const workersResult = await db.execute("SELECT * FROM workers");
  const workers = workersResult.rows as unknown as Worker[];

  // Get BOM steps
  const stepIds = [...new Set(schedule.map(t => t.bomStepId))];
  const bomSteps = new Map<number, BOMStep>();
  if (stepIds.length > 0) {
    const placeholders = stepIds.map(() => "?").join(", ");
    const stepsResult = await db.execute({
      sql: `SELECT * FROM bom_steps WHERE id IN (${placeholders})`,
      args: stepIds,
    });
    for (const row of stepsResult.rows) {
      const step = row as unknown as BOMStep;
      bomSteps.set(step.id, step);
    }
  }

  // Get certifications
  const certsResult = await db.execute(`
    SELECT worker_id, equipment_id FROM equipment_certifications
    WHERE expires_at IS NULL OR expires_at > datetime('now')
  `);
  const certifications = new Map<number, Set<number>>();
  for (const row of certsResult.rows) {
    const workerId = row.worker_id as number;
    const equipmentId = row.equipment_id as number;
    if (!certifications.has(workerId)) {
      certifications.set(workerId, new Set());
    }
    certifications.get(workerId)!.add(equipmentId);
  }

  // Build work categories map
  const workCategories = new Map<number, number>();
  for (const worker of workers) {
    if (worker.work_category_id) {
      workCategories.set(worker.id, worker.work_category_id);
    }
  }

  const context: ValidationContext = {
    workers,
    bomSteps,
    certifications,
    workCategories,
  };

  return validateSchedule(schedule, context);
}

export interface ForkScenarioInput {
  name?: string;
  schedule: GeneratedScheduleTask[];
}

/**
 * Fork a scenario with an edited schedule, creating a new "custom" scenario
 */
export async function forkScenario(
  db: Client,
  parentScenarioId: number,
  input: ForkScenarioInput
): Promise<PlanningScenario> {
  const now = new Date().toISOString();

  // Get the parent scenario
  const parentResult = await db.execute({
    sql: "SELECT * FROM planning_scenarios WHERE id = ?",
    args: [parentScenarioId],
  });

  if (parentResult.rows.length === 0) {
    throw new Error("Parent scenario not found");
  }

  const parent = parentResult.rows[0] as unknown as PlanningScenario;

  // Validate the schedule
  const validationResult = await validateScenarioSchedule(db, parentScenarioId, input.schedule);
  if (!validationResult.valid) {
    const errorMessages = validationResult.errors.map(e => e.message).join("; ");
    throw new Error(`Invalid schedule: ${errorMessages}`);
  }

  // Recalculate metrics from the new schedule
  const metrics = await recalculateMetrics(db, input.schedule);

  // Calculate demand projections
  const demandProjections = calculateDemandProjections(input.schedule, parent.planning_run_id);

  // Create the new scenario name
  const scenarioName = input.name || `Custom (from ${parent.name})`;

  // Insert the new scenario
  const scenarioResult = await db.execute({
    sql: `
      INSERT INTO planning_scenarios (
        planning_run_id, name, strategy,
        allow_overtime, overtime_limit_hours_per_day,
        worker_pool_json, efficiency_factor,
        total_labor_hours, total_overtime_hours,
        total_labor_cost, total_equipment_cost,
        deadlines_met, deadlines_missed, latest_completion_date,
        schedule_json, warnings_json, parent_scenario_id, created_at
      ) VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    args: [
      parent.planning_run_id,
      scenarioName,
      parent.allow_overtime,
      parent.overtime_limit_hours_per_day,
      parent.worker_pool_json,
      parent.efficiency_factor,
      metrics.totalLaborHours,
      metrics.totalOvertimeHours,
      metrics.totalLaborCost,
      metrics.totalEquipmentCost,
      metrics.deadlinesMet,
      metrics.deadlinesMissed,
      metrics.latestCompletionDate,
      JSON.stringify(input.schedule),
      JSON.stringify(validationResult.warnings.map(w => w.message)),
      parentScenarioId,
      now,
    ],
  });

  const scenario = scenarioResult.rows[0] as unknown as PlanningScenario;

  // Copy scenario_demand_entries from parent and update projections
  const parentDemandResult = await db.execute({
    sql: "SELECT * FROM scenario_demand_entries WHERE scenario_id = ?",
    args: [parentScenarioId],
  });

  for (const row of parentDemandResult.rows) {
    const parentEntry = row as unknown as { demand_entry_id: number; adjusted_target_date: string | null; assigned_priority: number };
    const projection = demandProjections.get(parentEntry.demand_entry_id);

    await db.execute({
      sql: `
        INSERT INTO scenario_demand_entries (
          scenario_id, demand_entry_id,
          adjusted_target_date, assigned_priority,
          projected_completion_date, can_meet_target
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        scenario.id,
        parentEntry.demand_entry_id,
        parentEntry.adjusted_target_date,
        parentEntry.assigned_priority,
        projection?.projectedCompletionDate || null,
        projection?.canMeetTarget ? 1 : 0,
      ],
    });
  }

  return scenario;
}

interface ScheduleMetrics {
  totalLaborHours: number;
  totalOvertimeHours: number;
  totalLaborCost: number;
  totalEquipmentCost: number;
  deadlinesMet: number;
  deadlinesMissed: number;
  latestCompletionDate: string;
}

/**
 * Recalculate metrics from a schedule
 */
async function recalculateMetrics(
  db: Client,
  schedule: GeneratedScheduleTask[]
): Promise<ScheduleMetrics> {
  // Get worker costs
  const workersResult = await db.execute("SELECT id, cost_per_hour FROM workers");
  const workerCosts = new Map<number, number>();
  for (const row of workersResult.rows) {
    workerCosts.set(row.id as number, (row.cost_per_hour as number) || 0);
  }

  // Get equipment costs
  const equipmentResult = await db.execute("SELECT id, hourly_cost FROM equipment");
  const equipmentCosts = new Map<number, number>();
  for (const row of equipmentResult.rows) {
    equipmentCosts.set(row.id as number, (row.hourly_cost as number) || 0);
  }

  // Get step equipment mapping
  const stepsResult = await db.execute("SELECT id, equipment_id FROM bom_steps");
  const stepEquipment = new Map<number, number | null>();
  for (const row of stepsResult.rows) {
    stepEquipment.set(row.id as number, row.equipment_id as number | null);
  }

  let totalLaborHours = 0;
  let totalOvertimeHours = 0;
  let totalLaborCost = 0;
  let totalEquipmentCost = 0;
  let latestDate = "";

  // Track worker hours per day for overtime calculation
  const workerDayHours = new Map<string, number>(); // "workerId:date" -> hours

  for (const task of schedule) {
    const startMinutes = timeToMinutes(task.startTime);
    const endMinutes = timeToMinutes(task.endTime);
    const durationHours = (endMinutes - startMinutes) / 60;

    // Track latest date
    if (task.date > latestDate) {
      latestDate = task.date;
    }

    for (const workerId of task.workerIds) {
      // Labor cost
      const hourlyRate = workerCosts.get(workerId) || 0;
      totalLaborCost += hourlyRate * durationHours;
      totalLaborHours += durationHours;

      // Track worker hours for overtime
      const key = `${workerId}:${task.date}`;
      const currentHours = workerDayHours.get(key) || 0;
      workerDayHours.set(key, currentHours + durationHours);
    }

    // Equipment cost
    const equipmentId = stepEquipment.get(task.bomStepId);
    if (equipmentId) {
      const equipHourlyCost = equipmentCosts.get(equipmentId) || 0;
      totalEquipmentCost += equipHourlyCost * durationHours;
    }
  }

  // Calculate overtime (hours > 8 per day per worker)
  for (const hours of workerDayHours.values()) {
    if (hours > 8) {
      totalOvertimeHours += hours - 8;
    }
  }

  // Get demand entries to calculate deadlines
  const demandIds = [...new Set(schedule.map(t => t.demandEntryId))];
  let deadlinesMet = 0;
  let deadlinesMissed = 0;

  if (demandIds.length > 0) {
    const placeholders = demandIds.map(() => "?").join(", ");
    const demandResult = await db.execute({
      sql: `SELECT id, due_date FROM demand_entries WHERE id IN (${placeholders})`,
      args: demandIds,
    });

    for (const row of demandResult.rows) {
      const demandId = row.id as number;
      const dueDate = row.due_date as string;

      // Find the latest task for this demand
      const demandTasks = schedule.filter(t => t.demandEntryId === demandId);
      const latestTaskDate = demandTasks.reduce((latest, t) => t.date > latest ? t.date : latest, "");

      if (latestTaskDate <= dueDate) {
        deadlinesMet++;
      } else {
        deadlinesMissed++;
      }
    }
  }

  return {
    totalLaborHours,
    totalOvertimeHours,
    totalLaborCost,
    totalEquipmentCost,
    deadlinesMet,
    deadlinesMissed,
    latestCompletionDate: latestDate,
  };
}

/**
 * Calculate demand projections from a schedule
 */
function calculateDemandProjections(
  schedule: GeneratedScheduleTask[],
  _planningRunId: number
): Map<number, { projectedCompletionDate: string; canMeetTarget: boolean }> {
  const projections = new Map<number, { projectedCompletionDate: string; canMeetTarget: boolean }>();

  // Group tasks by demand entry and find latest completion date
  const demandLatestDate = new Map<number, string>();
  for (const task of schedule) {
    const current = demandLatestDate.get(task.demandEntryId) || "";
    if (task.date > current) {
      demandLatestDate.set(task.demandEntryId, task.date);
    }
  }

  for (const [demandId, completionDate] of demandLatestDate.entries()) {
    projections.set(demandId, {
      projectedCompletionDate: completionDate,
      canMeetTarget: true, // Will be updated when comparing to due date
    });
  }

  return projections;
}

// ============================================================
// Helper functions
// ============================================================

interface ScheduleTask {
  demandEntryId: number;
  bomStepId: number;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  workerIds: number[];
}

interface AvailableResources {
  workers: Worker[];
  equipment: { id: number; name: string; station_count: number; hourly_cost: number }[];
  certifications: Map<number, Set<number>>; // workerId -> Set<equipmentId>
}

async function getAvailableResources(db: Client): Promise<AvailableResources> {
  // Get active workers
  const workersResult = await db.execute(
    "SELECT * FROM workers WHERE status = 'active'"
  );
  const workers = workersResult.rows as unknown as Worker[];

  // Get available equipment
  const equipmentResult = await db.execute(
    "SELECT id, name, station_count, hourly_cost FROM equipment WHERE status = 'available'"
  );
  const equipment = equipmentResult.rows as unknown as {
    id: number;
    name: string;
    station_count: number;
    hourly_cost: number;
  }[];

  // Get certifications
  const certsResult = await db.execute(`
    SELECT worker_id, equipment_id FROM equipment_certifications
    WHERE expires_at IS NULL OR expires_at > datetime('now')
  `);

  const certifications = new Map<number, Set<number>>();
  for (const row of certsResult.rows) {
    const workerId = row.worker_id as number;
    const equipmentId = row.equipment_id as number;
    if (!certifications.has(workerId)) {
      certifications.set(workerId, new Set());
    }
    certifications.get(workerId)!.add(equipmentId);
  }

  return { workers, equipment, certifications };
}

async function getBOMStepsForDemand(
  db: Client,
  demandEntries: DemandEntry[]
): Promise<Map<number, BOMStepWithDeps[]>> {
  const bomStepsMap = new Map<number, BOMStepWithDeps[]>();
  const bomIds = [...new Set(demandEntries.map((d) => d.fishbowl_bom_id))];

  for (const bomId of bomIds) {
    const stepsResult = await db.execute({
      sql: "SELECT * FROM bom_steps WHERE fishbowl_bom_id = ? ORDER BY sequence",
      args: [bomId],
    });
    const steps = stepsResult.rows as unknown as BOMStep[];

    // Fetch dependencies for each step
    const stepsWithDeps: BOMStepWithDeps[] = [];
    for (const step of steps) {
      const depsResult = await db.execute({
        sql: `
          SELECT depends_on_step_id, dependency_type
          FROM bom_step_dependencies
          WHERE step_id = ?
        `,
        args: [step.id],
      });

      const dependencies: BOMStepDependency[] = (depsResult.rows as unknown as {
        depends_on_step_id: number;
        dependency_type: string;
      }[]).map((row) => ({
        dependsOnStepId: row.depends_on_step_id,
        type: (row.dependency_type as 'start' | 'finish') || 'finish',
      }));

      stepsWithDeps.push({
        ...step,
        dependencies,
      });
    }

    bomStepsMap.set(bomId, stepsWithDeps);
  }

  return bomStepsMap;
}

// Time utilities
export function timeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const mins = parts[1] ?? 0;
  return hours * 60 + mins;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0]!;
}

export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function getNextWorkday(dateStr: string): string {
  let date = dateStr;
  while (isWeekend(date)) {
    date = addDays(date, 1);
  }
  return date;
}

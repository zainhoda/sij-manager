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
} from "./scenario-generator";

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

  // Create the planning run
  const runResult = await db.execute({
    sql: `
      INSERT INTO planning_runs (
        name, description, planning_start_date, planning_end_date,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?)
      RETURNING *
    `,
    args: [
      input.name,
      input.description || null,
      input.planning_start_date,
      input.planning_end_date,
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
): Promise<Map<number, BOMStep[]>> {
  const bomStepsMap = new Map<number, BOMStep[]>();
  const bomIds = [...new Set(demandEntries.map((d) => d.fishbowl_bom_id))];

  for (const bomId of bomIds) {
    const stepsResult = await db.execute({
      sql: "SELECT * FROM bom_steps WHERE fishbowl_bom_id = ? ORDER BY sequence",
      args: [bomId],
    });
    bomStepsMap.set(bomId, stepsResult.rows as unknown as BOMStep[]);
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

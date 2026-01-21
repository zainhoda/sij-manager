/**
 * Planning API Routes
 * Manages planning runs, scenarios, and acceptance
 */

import { db } from "../db";
import {
  createPlanningRun,
  getPlanningRun,
  getPlanningRuns,
  getActivePlanningRun,
  acceptScenario,
  archivePlanningRun,
} from "../services/planning/planner";
import type { PlanningScenario } from "../db/schema";

export async function handlePlanning(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/planning/runs
  if (url.pathname === "/api/planning/runs" && request.method === "GET") {
    const status = url.searchParams.get("status") as any;
    const limit = url.searchParams.get("limit");

    const runs = await getPlanningRuns(db, {
      status,
      limit: limit ? parseInt(limit) : undefined,
    });

    return Response.json({ runs });
  }

  // POST /api/planning/runs
  if (url.pathname === "/api/planning/runs" && request.method === "POST") {
    const body = await request.json() as any;

    if (!body.name || !body.planning_start_date || !body.planning_end_date) {
      return Response.json(
        { error: "Missing required fields: name, planning_start_date, planning_end_date" },
        { status: 400 }
      );
    }

    try {
      const run = await createPlanningRun(db, {
        name: body.name,
        description: body.description,
        planning_start_date: body.planning_start_date,
        planning_end_date: body.planning_end_date,
        demand_entry_ids: body.demand_entry_ids,
        created_by: body.created_by,
      });

      return Response.json({ run }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create planning run";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // GET /api/planning/runs/active
  if (url.pathname === "/api/planning/runs/active" && request.method === "GET") {
    const run = await getActivePlanningRun(db);
    return Response.json({ run });
  }

  // GET /api/planning/runs/:id
  const runsIdMatch = url.pathname.match(/^\/api\/planning\/runs\/(\d+)$/);
  if (runsIdMatch && request.method === "GET") {
    const id = parseInt(runsIdMatch[1]!);
    const run = await getPlanningRun(db, id);

    if (!run) {
      return Response.json({ error: "Planning run not found" }, { status: 404 });
    }

    return Response.json({ run });
  }

  // POST /api/planning/runs/:id/accept/:scenarioId
  const acceptMatch = url.pathname.match(/^\/api\/planning\/runs\/(\d+)\/accept\/(\d+)$/);
  if (acceptMatch && request.method === "POST") {
    const runId = parseInt(acceptMatch[1]!);
    const scenarioId = parseInt(acceptMatch[2]!);
    const body = await request.json().catch(() => ({})) as any;

    try {
      const result = await acceptScenario(db, runId, scenarioId, body.accepted_by);
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept scenario";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // POST /api/planning/runs/:id/archive
  const archiveMatch = url.pathname.match(/^\/api\/planning\/runs\/(\d+)\/archive$/);
  if (archiveMatch && request.method === "POST") {
    const id = parseInt(archiveMatch[1]!);
    const archived = await archivePlanningRun(db, id);

    if (!archived) {
      return Response.json({ error: "Planning run not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // GET /api/planning/scenarios/:id
  const scenarioMatch = url.pathname.match(/^\/api\/planning\/scenarios\/(\d+)$/);
  if (scenarioMatch && request.method === "GET") {
    const id = parseInt(scenarioMatch[1]!);

    const result = await db.execute({
      sql: "SELECT * FROM planning_scenarios WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Scenario not found" }, { status: 404 });
    }

    const scenario = result.rows[0] as unknown as PlanningScenario;

    // Get demand projections
    const projectionsResult = await db.execute({
      sql: `
        SELECT
          sde.*,
          de.fishbowl_bom_num,
          de.fishbowl_so_num,
          de.customer_name,
          de.quantity,
          de.due_date
        FROM scenario_demand_entries sde
        JOIN demand_entries de ON sde.demand_entry_id = de.id
        WHERE sde.scenario_id = ?
      `,
      args: [id],
    });

    return Response.json({
      scenario,
      projections: projectionsResult.rows,
      schedule: scenario.schedule_json ? JSON.parse(scenario.schedule_json) : [],
      warnings: scenario.warnings_json ? JSON.parse(scenario.warnings_json) : [],
    });
  }

  // GET /api/planning/compare/:runId
  const compareMatch = url.pathname.match(/^\/api\/planning\/compare\/(\d+)$/);
  if (compareMatch && request.method === "GET") {
    const runId = parseInt(compareMatch[1]!);

    const run = await getPlanningRun(db, runId);
    if (!run) {
      return Response.json({ error: "Planning run not found" }, { status: 404 });
    }

    // Build comparison data
    const comparison = run.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      strategy: s.strategy,
      metrics: {
        totalLaborHours: s.total_labor_hours,
        totalOvertimeHours: s.total_overtime_hours,
        totalLaborCost: s.total_labor_cost,
        totalEquipmentCost: s.total_equipment_cost,
        totalCost: (s.total_labor_cost || 0) + (s.total_equipment_cost || 0),
        deadlinesMet: s.deadlines_met,
        deadlinesMissed: s.deadlines_missed,
        latestCompletionDate: s.latest_completion_date,
      },
      allowOvertime: !!s.allow_overtime,
      overtimeLimitHoursPerDay: s.overtime_limit_hours_per_day,
    }));

    return Response.json({
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        planning_start_date: run.planning_start_date,
        planning_end_date: run.planning_end_date,
        accepted_scenario_id: run.accepted_scenario_id,
      },
      scenarios: comparison,
    });
  }

  return null;
}

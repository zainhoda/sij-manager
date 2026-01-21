/**
 * Plan Tasks API Routes
 * Manages execution tracking for plan tasks
 */

import { db } from "../db";
import type { PlanTask, TaskAssignment } from "../db/schema";

export async function handleTasks(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/tasks
  if (url.pathname === "/api/tasks" && request.method === "GET") {
    const runId = url.searchParams.get("run_id");
    const demandId = url.searchParams.get("demand_id");
    const date = url.searchParams.get("date");
    const status = url.searchParams.get("status");
    const workerId = url.searchParams.get("worker_id");

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (runId) {
      conditions.push("pt.planning_run_id = ?");
      params.push(parseInt(runId));
    }

    if (demandId) {
      conditions.push("pt.demand_entry_id = ?");
      params.push(parseInt(demandId));
    }

    if (date) {
      conditions.push("pt.scheduled_date = ?");
      params.push(date);
    }

    if (status) {
      const statuses = status.split(",");
      const placeholders = statuses.map(() => "?").join(", ");
      conditions.push(`pt.status IN (${placeholders})`);
      params.push(...statuses);
    }

    if (workerId) {
      conditions.push("ta.worker_id = ?");
      params.push(parseInt(workerId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await db.execute({
      sql: `
        SELECT DISTINCT
          pt.*,
          bs.name as step_name,
          de.fishbowl_bom_num,
          de.quantity as demand_quantity,
          de.customer_name
        FROM plan_tasks pt
        JOIN bom_steps bs ON pt.bom_step_id = bs.id
        JOIN demand_entries de ON pt.demand_entry_id = de.id
        ${workerId ? "JOIN task_assignments ta ON pt.id = ta.plan_task_id" : ""}
        ${whereClause}
        ORDER BY pt.scheduled_date, pt.start_time
      `,
      args: params,
    });

    // Get assignments for each task
    const tasksWithAssignments = [];
    for (const row of result.rows) {
      const task = row as any;
      const assignmentsResult = await db.execute({
        sql: `
          SELECT ta.*, w.name as worker_name
          FROM task_assignments ta
          JOIN workers w ON ta.worker_id = w.id
          WHERE ta.plan_task_id = ?
        `,
        args: [task.id],
      });
      tasksWithAssignments.push({
        ...task,
        assignments: assignmentsResult.rows,
      });
    }

    return Response.json({ tasks: tasksWithAssignments });
  }

  // GET /api/tasks/today
  if (url.pathname === "/api/tasks/today" && request.method === "GET") {
    const workerId = url.searchParams.get("worker_id");
    const today = new Date().toISOString().split("T")[0]!;

    const conditions = ["pt.scheduled_date = ?"];
    const params: (string | number)[] = [today];

    if (workerId) {
      conditions.push("ta.worker_id = ?");
      params.push(parseInt(workerId));
    }

    const result = await db.execute({
      sql: `
        SELECT DISTINCT
          pt.*,
          bs.name as step_name,
          de.fishbowl_bom_num,
          de.quantity as demand_quantity,
          de.customer_name,
          de.color
        FROM plan_tasks pt
        JOIN bom_steps bs ON pt.bom_step_id = bs.id
        JOIN demand_entries de ON pt.demand_entry_id = de.id
        ${workerId ? "JOIN task_assignments ta ON pt.id = ta.plan_task_id" : ""}
        WHERE ${conditions.join(" AND ")}
        ORDER BY pt.start_time
      `,
      args: params,
    });

    // Get assignments
    const tasksWithAssignments = [];
    for (const row of result.rows) {
      const task = row as any;
      const assignmentsResult = await db.execute({
        sql: `
          SELECT ta.*, w.name as worker_name
          FROM task_assignments ta
          JOIN workers w ON ta.worker_id = w.id
          WHERE ta.plan_task_id = ?
        `,
        args: [task.id],
      });
      tasksWithAssignments.push({
        ...task,
        assignments: assignmentsResult.rows,
      });
    }

    return Response.json({ date: today, tasks: tasksWithAssignments });
  }

  // GET /api/tasks/assignments/:workerId
  const assignmentsMatch = url.pathname.match(/^\/api\/tasks\/assignments\/(\d+)$/);
  if (assignmentsMatch && request.method === "GET") {
    const workerId = parseInt(assignmentsMatch[1]!);
    const date = url.searchParams.get("date");
    const status = url.searchParams.get("status");

    const conditions = ["ta.worker_id = ?"];
    const params: (string | number)[] = [workerId];

    if (date) {
      conditions.push("pt.scheduled_date = ?");
      params.push(date);
    }

    if (status) {
      conditions.push("ta.status = ?");
      params.push(status);
    }

    const result = await db.execute({
      sql: `
        SELECT
          ta.*,
          pt.scheduled_date,
          pt.start_time,
          pt.end_time,
          pt.planned_output,
          pt.status as task_status,
          bs.name as step_name,
          de.fishbowl_bom_num,
          de.customer_name,
          de.color
        FROM task_assignments ta
        JOIN plan_tasks pt ON ta.plan_task_id = pt.id
        JOIN bom_steps bs ON pt.bom_step_id = bs.id
        JOIN demand_entries de ON pt.demand_entry_id = de.id
        WHERE ${conditions.join(" AND ")}
        ORDER BY pt.scheduled_date, pt.start_time
      `,
      args: params,
    });

    return Response.json({ assignments: result.rows });
  }

  // PATCH /api/tasks/assignments/:id
  if (assignmentsMatch && request.method === "PATCH") {
    const id = parseInt(assignmentsMatch[1]!);
    const body = await request.json() as any;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }

    if (body.actual_start_time !== undefined) {
      updates.push("actual_start_time = ?");
      params.push(body.actual_start_time);
    }

    if (body.actual_end_time !== undefined) {
      updates.push("actual_end_time = ?");
      params.push(body.actual_end_time);
    }

    if (body.actual_output !== undefined) {
      updates.push("actual_output = ?");
      params.push(body.actual_output);
    }

    if (body.notes !== undefined) {
      updates.push("notes = ?");
      params.push(body.notes);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(id);

    const result = await db.execute({
      sql: `UPDATE task_assignments SET ${updates.join(", ")} WHERE id = ? RETURNING *`,
      args: params,
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  }

  // GET /api/tasks/:id
  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskIdMatch && request.method === "GET") {
    const id = parseInt(taskIdMatch[1]!);

    const result = await db.execute({
      sql: `
        SELECT
          pt.*,
          bs.name as step_name,
          bs.time_per_piece_seconds,
          de.fishbowl_bom_num,
          de.fishbowl_so_num,
          de.quantity as demand_quantity,
          de.customer_name,
          de.color
        FROM plan_tasks pt
        JOIN bom_steps bs ON pt.bom_step_id = bs.id
        JOIN demand_entries de ON pt.demand_entry_id = de.id
        WHERE pt.id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const task = result.rows[0] as any;

    const assignmentsResult = await db.execute({
      sql: `
        SELECT ta.*, w.name as worker_name
        FROM task_assignments ta
        JOIN workers w ON ta.worker_id = w.id
        WHERE ta.plan_task_id = ?
      `,
      args: [id],
    });

    return Response.json({
      ...task,
      assignments: assignmentsResult.rows,
    });
  }

  // PATCH /api/tasks/:id
  if (taskIdMatch && request.method === "PATCH") {
    const id = parseInt(taskIdMatch[1]!);
    const body = await request.json() as any;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }

    if (body.actual_start_time !== undefined) {
      updates.push("actual_start_time = ?");
      params.push(body.actual_start_time);
    }

    if (body.actual_end_time !== undefined) {
      updates.push("actual_end_time = ?");
      params.push(body.actual_end_time);
    }

    if (body.actual_output !== undefined) {
      updates.push("actual_output = ?");
      params.push(body.actual_output);
    }

    if (body.notes !== undefined) {
      updates.push("notes = ?");
      params.push(body.notes);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(id);

    const result = await db.execute({
      sql: `UPDATE plan_tasks SET ${updates.join(", ")} WHERE id = ? RETURNING *`,
      args: params,
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  }

  // POST /api/tasks/:id/start
  const startMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/start$/);
  if (startMatch && request.method === "POST") {
    const id = parseInt(startMatch[1]!);
    const now = new Date().toISOString();

    const result = await db.execute({
      sql: `
        UPDATE plan_tasks
        SET status = 'in_progress', actual_start_time = ?
        WHERE id = ? AND status = 'not_started'
        RETURNING *
      `,
      args: [now, id],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Task not found or already started" }, { status: 400 });
    }

    const task = result.rows[0] as any;
    await db.execute({
      sql: `
        UPDATE demand_entries
        SET status = 'in_progress', updated_at = ?
        WHERE id = ? AND status = 'planned'
      `,
      args: [now, task.demand_entry_id],
    });

    return Response.json(result.rows[0]);
  }

  // POST /api/tasks/:id/complete
  const completeMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    const id = parseInt(completeMatch[1]!);
    const body = await request.json() as any;
    const now = new Date().toISOString();

    if (body.actual_output === undefined) {
      return Response.json({ error: "actual_output is required" }, { status: 400 });
    }

    // Update task
    const taskResult = await db.execute({
      sql: `
        UPDATE plan_tasks
        SET status = 'completed', actual_end_time = ?, actual_output = ?
        WHERE id = ? AND status IN ('not_started', 'in_progress')
        RETURNING *
      `,
      args: [body.actual_end_time || now, body.actual_output, id],
    });

    if (taskResult.rows.length === 0) {
      return Response.json({ error: "Task not found or already completed" }, { status: 400 });
    }

    const task = taskResult.rows[0] as any;

    // Get task details for production history
    const detailsResult = await db.execute({
      sql: `
        SELECT
          pt.*,
          bs.name as step_name,
          bs.time_per_piece_seconds,
          de.fishbowl_bom_id,
          de.fishbowl_bom_num
        FROM plan_tasks pt
        JOIN bom_steps bs ON pt.bom_step_id = bs.id
        JOIN demand_entries de ON pt.demand_entry_id = de.id
        WHERE pt.id = ?
      `,
      args: [id],
    });
    const details = detailsResult.rows[0] as any;

    // Get assignments
    const assignmentsResult = await db.execute({
      sql: `
        SELECT ta.*, w.name as worker_name
        FROM task_assignments ta
        JOIN workers w ON ta.worker_id = w.id
        WHERE ta.plan_task_id = ?
      `,
      args: [id],
    });

    // Calculate metrics
    const startTime = task.actual_start_time || task.start_time;
    const endTime = body.actual_end_time || now;
    const actualSeconds = calculateDurationSeconds(startTime, endTime);
    const expectedSeconds = details.time_per_piece_seconds * body.actual_output;
    const efficiencyPercent = expectedSeconds > 0 ? (expectedSeconds / actualSeconds) * 100 : 0;

    // Record production history for each worker
    for (const assignment of assignmentsResult.rows) {
      const a = assignment as any;

      // Update assignment
      await db.execute({
        sql: `
          UPDATE task_assignments
          SET status = 'completed', actual_output = ?, actual_end_time = ?
          WHERE id = ?
        `,
        args: [body.actual_output, endTime, a.id],
      });

      // Create production history record
      await db.execute({
        sql: `
          INSERT INTO production_history (
            demand_entry_id, fishbowl_bom_id, fishbowl_bom_num,
            bom_step_id, step_name, worker_id, worker_name,
            date, start_time, end_time, units_produced, planned_units,
            actual_seconds, expected_seconds, efficiency_percent,
            plan_task_id, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          task.demand_entry_id,
          details.fishbowl_bom_id,
          details.fishbowl_bom_num,
          task.bom_step_id,
          details.step_name,
          a.worker_id,
          a.worker_name,
          task.scheduled_date,
          startTime,
          endTime,
          body.actual_output,
          task.planned_output,
          actualSeconds,
          expectedSeconds,
          efficiencyPercent,
          id,
          now,
        ],
      });

      // Update worker step performance
      await updateWorkerStepPerformance(a.worker_id, task.bom_step_id);
    }

    // Update demand entry completion count
    await db.execute({
      sql: `
        UPDATE demand_entries
        SET quantity_completed = quantity_completed + ?, updated_at = ?
        WHERE id = ?
      `,
      args: [body.actual_output, now, task.demand_entry_id],
    });

    // Check if demand is fully complete
    const demandResult = await db.execute({
      sql: "SELECT quantity, quantity_completed FROM demand_entries WHERE id = ?",
      args: [task.demand_entry_id],
    });
    const demand = demandResult.rows[0] as any;
    if (demand.quantity_completed >= demand.quantity) {
      await db.execute({
        sql: "UPDATE demand_entries SET status = 'completed', updated_at = ? WHERE id = ?",
        args: [now, task.demand_entry_id],
      });
    }

    return Response.json({ success: true, task: taskResult.rows[0] });
  }

  return null;
}

// Helper functions

function calculateDurationSeconds(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

async function updateWorkerStepPerformance(workerId: number, bomStepId: number): Promise<void> {
  const historyResult = await db.execute({
    sql: `
      SELECT actual_seconds, expected_seconds, units_produced
      FROM production_history
      WHERE worker_id = ? AND bom_step_id = ?
      ORDER BY recorded_at DESC
      LIMIT 20
    `,
    args: [workerId, bomStepId],
  });

  if (historyResult.rows.length === 0) return;

  const rows = historyResult.rows as unknown as {
    actual_seconds: number;
    expected_seconds: number;
    units_produced: number;
  }[];

  const totalUnits = rows.reduce((sum, r) => sum + r.units_produced, 0);
  const totalActual = rows.reduce((sum, r) => sum + r.actual_seconds, 0);
  const totalExpected = rows.reduce((sum, r) => sum + r.expected_seconds, 0);
  const avgEfficiency = totalExpected > 0 ? (totalExpected / totalActual) * 100 : 0;

  const recent = rows.slice(0, 5);
  const recentActual = recent.reduce((sum, r) => sum + r.actual_seconds, 0);
  const recentExpected = recent.reduce((sum, r) => sum + r.expected_seconds, 0);
  const recentEfficiency = recentExpected > 0 ? (recentExpected / recentActual) * 100 : 0;

  let trend: string;
  if (recent.length < 3) {
    trend = "stable";
  } else if (recentEfficiency > avgEfficiency * 1.05) {
    trend = "improving";
  } else if (recentEfficiency < avgEfficiency * 0.95) {
    trend = "declining";
  } else {
    trend = "stable";
  }

  await db.execute({
    sql: `
      INSERT INTO worker_step_performance (
        worker_id, bom_step_id,
        total_units_produced, total_actual_seconds, total_expected_seconds,
        avg_efficiency_percent, sample_count,
        recent_efficiency_percent, trend, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (worker_id, bom_step_id) DO UPDATE SET
        total_units_produced = excluded.total_units_produced,
        total_actual_seconds = excluded.total_actual_seconds,
        total_expected_seconds = excluded.total_expected_seconds,
        avg_efficiency_percent = excluded.avg_efficiency_percent,
        sample_count = excluded.sample_count,
        recent_efficiency_percent = excluded.recent_efficiency_percent,
        trend = excluded.trend,
        last_updated = CURRENT_TIMESTAMP
    `,
    args: [
      workerId,
      bomStepId,
      totalUnits,
      totalActual,
      totalExpected,
      avgEfficiency,
      rows.length,
      recentEfficiency,
      trend,
    ],
  });
}

import { db } from "../db";
import type { Schedule, ScheduleEntry } from "../db/schema";
import { generateSchedule, getScheduleWithEntries } from "../services/scheduler";
import { generateReplanDraft, commitReplan, type CommitReplanRequest } from "../services/replan";
import { getScheduleCostSummary, calculateEstimatedEntryCost, calculateActualEntryCost } from "../services/cost-calculator";

export async function handleSchedules(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/schedules - list all schedules with entries
  if (url.pathname === "/api/schedules" && request.method === "GET") {
    const schedulesResult = await db.execute(`
      SELECT s.*, o.quantity, o.due_date, o.color as order_color, p.name as product_name
      FROM schedules s
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ORDER BY s.created_at DESC
    `);
    const schedules = schedulesResult.rows as unknown as (Schedule & { quantity: number; due_date: string; product_name: string; order_color: string | null })[];

    // Fetch entries for each schedule and group by date
    const schedulesWithEntries = await Promise.all(schedules.map(async (schedule) => {
      const entriesResult = await db.execute({
        sql: `
        SELECT
          se.*,
          ps.name as step_name,
          ps.category,
          ps.required_skill_category,
          o.color as order_color
        FROM schedule_entries se
        JOIN product_steps ps ON se.product_step_id = ps.id
        JOIN schedules s ON se.schedule_id = s.id
        JOIN orders o ON s.order_id = o.id
        WHERE se.schedule_id = ?
        ORDER BY se.date, se.start_time
      `,
        args: [schedule.id]
      });
      const entries = entriesResult.rows as unknown as (ScheduleEntry & {
        step_name: string;
        category: string;
        required_skill_category: string;
        order_color: string | null;
      })[];

      // Group entries by date
      const entriesByDate: Record<string, typeof entries> = {};
      for (const entry of entries) {
        if (!entriesByDate[entry.date]) {
          entriesByDate[entry.date] = [];
        }
        entriesByDate[entry.date]!.push(entry);
      }

      // Get cost summary for this schedule
      const costSummary = await getScheduleCostSummary(schedule.id);

      // Calculate actual output from task_worker_assignments (using max per entry, not sum)
      const outputResult = await db.execute({
        sql: `
          SELECT se.id as entry_id, MAX(twa.actual_output) as entry_output
          FROM schedule_entries se
          LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
          WHERE se.schedule_id = ?
          GROUP BY se.id
        `,
        args: [schedule.id]
      });
      const actualOutput = (outputResult.rows as unknown as { entry_id: number; entry_output: number | null }[])
        .reduce((sum, row) => sum + (row.entry_output ?? 0), 0);

      return {
        ...schedule,
        entries,
        entriesByDate,
        actualOutput,
        estimatedCost: costSummary?.estimatedTotalCost ?? 0,
        actualCost: costSummary?.actualTotalCost ?? 0,
        costVariance: costSummary?.variance ?? 0,
      };
    }));

    return Response.json(schedulesWithEntries);
  }

  // POST /api/schedules/generate - generate schedule for order
  if (url.pathname === "/api/schedules/generate" && request.method === "POST") {
    return handleGenerateSchedule(request);
  }

  // GET /api/schedules/:id/costs - get detailed cost breakdown
  const costsMatch = url.pathname.match(/^\/api\/schedules\/(\d+)\/costs$/);
  if (costsMatch && request.method === "GET") {
    const scheduleId = parseInt(costsMatch[1]!);
    const costSummary = await getScheduleCostSummary(scheduleId);
    if (!costSummary) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json(costSummary);
  }

  // GET /api/schedules/:id - get schedule with entries
  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/(\d+)$/);
  if (scheduleMatch && request.method === "GET") {
    const scheduleId = parseInt(scheduleMatch[1]!);
    const schedule = await getScheduleWithEntries(scheduleId);
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Add cost summary to schedule response
    const costSummary = await getScheduleCostSummary(scheduleId);

    return Response.json({
      ...schedule,
      costSummary: costSummary ? {
        estimatedLaborCost: costSummary.estimatedLaborCost,
        estimatedEquipmentCost: costSummary.estimatedEquipmentCost,
        estimatedTotalCost: costSummary.estimatedTotalCost,
        actualLaborCost: costSummary.actualLaborCost,
        actualEquipmentCost: costSummary.actualEquipmentCost,
        actualTotalCost: costSummary.actualTotalCost,
        variance: costSummary.variance,
        variancePercentage: costSummary.variancePercentage,
      } : null,
    });
  }

  // DELETE /api/schedules/:id - delete schedule
  if (scheduleMatch && request.method === "DELETE") {
    const scheduleId = parseInt(scheduleMatch[1]!);

    // Get order ID to reset status
    const scheduleResult = await db.execute({
      sql: "SELECT order_id FROM schedules WHERE id = ?",
      args: [scheduleId]
    });
    const schedule = scheduleResult.rows[0] as unknown as { order_id: number } | undefined;
    
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Delete entries first (foreign key constraint)
    await db.execute({
      sql: "DELETE FROM schedule_entries WHERE schedule_id = ?",
      args: [scheduleId]
    });
    await db.execute({
      sql: "DELETE FROM schedules WHERE id = ?",
      args: [scheduleId]
    });

    // Reset order status
    await db.execute({
      sql: "UPDATE orders SET status = 'pending' WHERE id = ?",
      args: [schedule.order_id]
    });

    return Response.json({ success: true });
  }

  // POST /api/schedules/:id/replan - generate replan draft
  const replanMatch = url.pathname.match(/^\/api\/schedules\/(\d+)\/replan$/);
  if (replanMatch && request.method === "POST") {
    const scheduleId = parseInt(replanMatch[1]!);
    const result = await generateReplanDraft(scheduleId);
    if (!result) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json(result);
  }

  // POST /api/schedules/:id/replan/commit - commit replan
  const replanCommitMatch = url.pathname.match(/^\/api\/schedules\/(\d+)\/replan\/commit$/);
  if (replanCommitMatch && request.method === "POST") {
    try {
      const scheduleId = parseInt(replanCommitMatch[1]!);
      const body = await request.json() as CommitReplanRequest;

      if (!body.entries || !Array.isArray(body.entries)) {
        return Response.json({ error: "Missing required field: entries" }, { status: 400 });
      }

      const schedule = await commitReplan(scheduleId, body);
      if (!schedule) {
        return Response.json({ error: "Schedule not found" }, { status: 404 });
      }

      const scheduleWithEntries = await getScheduleWithEntries(schedule.id);
      return Response.json(scheduleWithEntries);
    } catch (error) {
      console.error("Error committing replan:", error);
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  return null;
}

async function handleGenerateSchedule(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { order_id: number };

    if (!body.order_id) {
      return Response.json({ error: "Missing required field: order_id" }, { status: 400 });
    }

    // Check if order already has a schedule
    const existingScheduleResult = await db.execute({
      sql: "SELECT id FROM schedules WHERE order_id = ?",
      args: [body.order_id]
    });
    const existingSchedule = existingScheduleResult.rows[0];

    if (existingSchedule) {
      return Response.json(
        { error: "Order already has a schedule. Delete it first to regenerate." },
        { status: 409 }
      );
    }

    const schedule = await generateSchedule(body.order_id);
    if (!schedule) {
      return Response.json({ error: "Failed to generate schedule. Order not found." }, { status: 404 });
    }

    const scheduleWithEntries = await getScheduleWithEntries(schedule.id);
    return Response.json(scheduleWithEntries, { status: 201 });
  } catch (error) {
    console.error("Error generating schedule:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

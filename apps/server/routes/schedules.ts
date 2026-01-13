import { db } from "../db";
import type { Schedule, ScheduleEntry } from "../db/schema";
import { generateSchedule, getScheduleWithEntries } from "../services/scheduler";
import { generateReplanDraft, commitReplan, type CommitReplanRequest } from "../services/replan";

export async function handleSchedules(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/schedules - list all schedules with entries
  if (url.pathname === "/api/schedules" && request.method === "GET") {
    const schedules = db.query(`
      SELECT s.*, o.quantity, o.due_date, o.color as order_color, p.name as product_name
      FROM schedules s
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ORDER BY s.created_at DESC
    `).all() as (Schedule & { quantity: number; due_date: string; product_name: string; order_color: string | null })[];

    // Fetch entries for each schedule and group by date
    const schedulesWithEntries = schedules.map((schedule) => {
      const entries = db.query(`
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
      `).all(schedule.id) as (ScheduleEntry & {
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

      return {
        ...schedule,
        entries,
        entriesByDate,
      };
    });

    return Response.json(schedulesWithEntries);
  }

  // POST /api/schedules/generate - generate schedule for order
  if (url.pathname === "/api/schedules/generate" && request.method === "POST") {
    return handleGenerateSchedule(request);
  }

  // GET /api/schedules/:id - get schedule with entries
  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/(\d+)$/);
  if (scheduleMatch && request.method === "GET") {
    const scheduleId = parseInt(scheduleMatch[1]!);
    const schedule = getScheduleWithEntries(scheduleId);
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }
    return Response.json(schedule);
  }

  // DELETE /api/schedules/:id - delete schedule
  if (scheduleMatch && request.method === "DELETE") {
    const scheduleId = parseInt(scheduleMatch[1]!);

    // Get order ID to reset status
    const schedule = db.query("SELECT order_id FROM schedules WHERE id = ?").get(scheduleId) as { order_id: number } | null;
    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Delete entries first (foreign key constraint)
    db.run("DELETE FROM schedule_entries WHERE schedule_id = ?", [scheduleId]);
    db.run("DELETE FROM schedules WHERE id = ?", [scheduleId]);

    // Reset order status
    db.run("UPDATE orders SET status = 'pending' WHERE id = ?", [schedule.order_id]);

    return Response.json({ success: true });
  }

  // POST /api/schedules/:id/replan - generate replan draft
  const replanMatch = url.pathname.match(/^\/api\/schedules\/(\d+)\/replan$/);
  if (replanMatch && request.method === "POST") {
    const scheduleId = parseInt(replanMatch[1]!);
    const result = generateReplanDraft(scheduleId);
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

      const schedule = commitReplan(scheduleId, body);
      if (!schedule) {
        return Response.json({ error: "Schedule not found" }, { status: 404 });
      }

      const scheduleWithEntries = getScheduleWithEntries(schedule.id);
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
    const existingSchedule = db.query(
      "SELECT id FROM schedules WHERE order_id = ?"
    ).get(body.order_id) as { id: number } | null;

    if (existingSchedule) {
      return Response.json(
        { error: "Order already has a schedule. Delete it first to regenerate." },
        { status: 409 }
      );
    }

    const schedule = generateSchedule(body.order_id);
    if (!schedule) {
      return Response.json({ error: "Failed to generate schedule. Order not found." }, { status: 404 });
    }

    const scheduleWithEntries = getScheduleWithEntries(schedule.id);
    return Response.json(scheduleWithEntries, { status: 201 });
  } catch (error) {
    console.error("Error generating schedule:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

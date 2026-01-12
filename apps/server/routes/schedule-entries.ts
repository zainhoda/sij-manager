import { db } from "../db";
import type { ScheduleEntry } from "../db/schema";

export async function handleScheduleEntries(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/schedule-entries - get all entries (for admin view)
  if (url.pathname === "/api/schedule-entries" && request.method === "GET") {
    const entries = db.query(`
      SELECT
        se.*,
        ps.name as step_name,
        ps.category,
        ps.time_per_piece_seconds,
        ps.required_skill_category,
        s.order_id,
        o.product_id,
        p.name as product_name,
        o.quantity as order_quantity
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      JOIN schedules s ON se.schedule_id = s.id
      JOIN orders o ON s.order_id = o.id
      JOIN products p ON o.product_id = p.id
      ORDER BY se.date, se.start_time
    `).all() as (ScheduleEntry & {
      step_name: string;
      category: string;
      time_per_piece_seconds: number;
      required_skill_category: string;
      order_id: number;
      product_id: number;
      product_name: string;
      order_quantity: number;
    })[];
    return Response.json(entries);
  }

  // GET /api/schedule-entries/:id - get single entry
  const entryMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)$/);
  if (entryMatch && request.method === "GET") {
    const entryId = parseInt(entryMatch[1]!);
    const entry = db.query(`
      SELECT
        se.*,
        ps.name as step_name,
        ps.category,
        ps.time_per_piece_seconds,
        ps.required_skill_category
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.id = ?
    `).get(entryId) as (ScheduleEntry & {
      step_name: string;
      category: string;
      time_per_piece_seconds: number;
      required_skill_category: string;
    }) | null;

    if (!entry) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }
    return Response.json(entry);
  }

  // PATCH /api/schedule-entries/:id - update actual times and output
  if (entryMatch && request.method === "PATCH") {
    return handleUpdateEntry(parseInt(entryMatch[1]!), request);
  }

  // POST /api/schedule-entries/:id/start - start work on entry
  const startMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/start$/);
  if (startMatch && request.method === "POST") {
    const entryId = parseInt(startMatch[1]!);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const result = db.run(
      "UPDATE schedule_entries SET actual_start_time = ?, status = 'in_progress' WHERE id = ?",
      [timeStr, entryId]
    );

    if (result.changes === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const entry = db.query("SELECT * FROM schedule_entries WHERE id = ?").get(entryId) as ScheduleEntry;
    return Response.json(entry);
  }

  // POST /api/schedule-entries/:id/complete - complete work on entry
  const completeMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    return handleCompleteEntry(parseInt(completeMatch[1]!), request);
  }

  return null;
}

async function handleUpdateEntry(entryId: number, request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      start_time?: string;
      end_time?: string;
      date?: string;
      actual_start_time?: string;
      actual_end_time?: string;
      actual_output?: number;
      planned_output?: number;
      status?: 'not_started' | 'in_progress' | 'completed';
      notes?: string;
      worker_id?: number;
    };

    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.start_time !== undefined) {
      updates.push("start_time = ?");
      values.push(body.start_time);
    }
    if (body.end_time !== undefined) {
      updates.push("end_time = ?");
      values.push(body.end_time);
    }
    if (body.date !== undefined) {
      updates.push("date = ?");
      values.push(body.date);
    }
    if (body.planned_output !== undefined) {
      updates.push("planned_output = ?");
      values.push(body.planned_output);
    }
    if (body.actual_start_time !== undefined) {
      updates.push("actual_start_time = ?");
      values.push(body.actual_start_time);
    }
    if (body.actual_end_time !== undefined) {
      updates.push("actual_end_time = ?");
      values.push(body.actual_end_time);
    }
    if (body.actual_output !== undefined) {
      updates.push("actual_output = ?");
      values.push(body.actual_output);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      values.push(body.status);
    }
    if (body.notes !== undefined) {
      updates.push("notes = ?");
      values.push(body.notes);
    }
    if (body.worker_id !== undefined) {
      updates.push("worker_id = ?");
      values.push(body.worker_id);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(entryId);
    const result = db.run(
      `UPDATE schedule_entries SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (result.changes === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const entry = db.query("SELECT * FROM schedule_entries WHERE id = ?").get(entryId) as ScheduleEntry;
    return Response.json(entry);
  } catch (error) {
    console.error("Error updating schedule entry:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleCompleteEntry(entryId: number, request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      actual_output: number;
      notes?: string;
    };

    if (body.actual_output === undefined) {
      return Response.json({ error: "actual_output is required" }, { status: 400 });
    }

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const result = db.run(
      `UPDATE schedule_entries
       SET actual_end_time = ?, actual_output = ?, status = 'completed', notes = COALESCE(?, notes)
       WHERE id = ?`,
      [timeStr, body.actual_output, body.notes ?? null, entryId]
    );

    if (result.changes === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const entry = db.query("SELECT * FROM schedule_entries WHERE id = ?").get(entryId) as ScheduleEntry;
    return Response.json(entry);
  } catch (error) {
    console.error("Error completing schedule entry:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// Get productivity stats for a schedule entry
export function getEntryProductivity(entryId: number) {
  const entry = db.query(`
    SELECT
      se.*,
      ps.time_per_piece_seconds
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE se.id = ?
  `).get(entryId) as (ScheduleEntry & { time_per_piece_seconds: number }) | null;

  if (!entry || !entry.actual_start_time || !entry.actual_end_time) {
    return null;
  }

  // Calculate actual time worked in minutes
  const startParts = entry.actual_start_time.split(":").map(Number);
  const endParts = entry.actual_end_time.split(":").map(Number);
  const startMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMinutes = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);
  const actualMinutes = endMinutes - startMinutes;

  // Calculate expected time for actual output
  const expectedSeconds = entry.actual_output * entry.time_per_piece_seconds;
  const expectedMinutes = expectedSeconds / 60;

  // Calculate efficiency (100% = on standard, >100% = faster than standard)
  const efficiency = actualMinutes > 0 ? (expectedMinutes / actualMinutes) * 100 : 0;

  // Calculate pieces per hour
  const actualPiecesPerHour = actualMinutes > 0 ? (entry.actual_output / actualMinutes) * 60 : 0;
  const standardPiecesPerHour = (3600 / entry.time_per_piece_seconds);

  return {
    entryId,
    plannedOutput: entry.planned_output,
    actualOutput: entry.actual_output,
    actualMinutes,
    expectedMinutes,
    efficiency: Math.round(efficiency),
    actualPiecesPerHour: Math.round(actualPiecesPerHour * 10) / 10,
    standardPiecesPerHour: Math.round(standardPiecesPerHour * 10) / 10,
    variance: entry.actual_output - entry.planned_output,
  };
}

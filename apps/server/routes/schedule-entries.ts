import { db } from "../db";
import type { ScheduleEntry, TaskWorkerAssignment } from "../db/schema";

// Extended types for API responses
interface AssignmentWithWorker extends TaskWorkerAssignment {
  worker_name: string;
}

interface ScheduleEntryWithAssignments extends ScheduleEntry {
  step_name: string;
  category: string;
  time_per_piece_seconds: number;
  required_skill_category: string;
  // Computed from assignments
  computed_status: 'not_started' | 'in_progress' | 'completed';
  total_actual_output: number;
  assignments: AssignmentWithWorker[];
}

// Helper to get assignments for an entry
async function getAssignmentsForEntry(entryId: number): Promise<AssignmentWithWorker[]> {
  const result = await db.execute({
    sql: `
    SELECT
      twa.*,
      w.name as worker_name
    FROM task_worker_assignments twa
    JOIN workers w ON twa.worker_id = w.id
    WHERE twa.schedule_entry_id = ?
    ORDER BY twa.assigned_at
  `,
    args: [entryId]
  });
  return result.rows as unknown as AssignmentWithWorker[];
}

// Helper to compute task status from assignments
function computeTaskStatus(assignments: AssignmentWithWorker[]): 'not_started' | 'in_progress' | 'completed' {
  if (assignments.length === 0) {
    return 'not_started';
  }

  const allCompleted = assignments.every(a => a.status === 'completed');
  if (allCompleted) {
    return 'completed';
  }

  const anyStarted = assignments.some(a => a.status === 'in_progress' || a.status === 'completed');
  if (anyStarted) {
    return 'in_progress';
  }

  return 'not_started';
}

// Helper to compute total actual output from assignments
function computeTotalActualOutput(assignments: AssignmentWithWorker[]): number {
  return assignments.reduce((sum, a) => sum + a.actual_output, 0);
}

export async function handleScheduleEntries(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/schedule-entries - get all entries (for admin view)
  if (url.pathname === "/api/schedule-entries" && request.method === "GET") {
    const result = await db.execute(`
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
    `);
    const entries = result.rows as unknown as (ScheduleEntry & {
      step_name: string;
      category: string;
      time_per_piece_seconds: number;
      required_skill_category: string;
      order_id: number;
      product_id: number;
      product_name: string;
      order_quantity: number;
    })[];

    // Enrich each entry with assignments
    const enrichedEntries = await Promise.all(entries.map(async entry => {
      const assignments = await getAssignmentsForEntry(entry.id);
      return {
        ...entry,
        computed_status: computeTaskStatus(assignments),
        total_actual_output: computeTotalActualOutput(assignments),
        assignments,
      };
    }));

    return Response.json(enrichedEntries);
  }

  // GET /api/schedule-entries/:id - get single entry with assignments
  const entryMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)$/);
  if (entryMatch && request.method === "GET") {
    const entryId = parseInt(entryMatch[1]!);
    const result = await db.execute({
      sql: `
      SELECT
        se.*,
        ps.name as step_name,
        ps.category,
        ps.time_per_piece_seconds,
        ps.required_skill_category
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.id = ?
    `,
      args: [entryId]
    });
    const entry = result.rows[0] as unknown as (ScheduleEntry & {
      step_name: string;
      category: string;
      time_per_piece_seconds: number;
      required_skill_category: string;
    }) | undefined;

    if (!entry) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const assignments = await getAssignmentsForEntry(entryId);
    const enrichedEntry: ScheduleEntryWithAssignments = {
      ...entry,
      computed_status: computeTaskStatus(assignments),
      total_actual_output: computeTotalActualOutput(assignments),
      assignments,
    };

    return Response.json(enrichedEntry);
  }

  // PATCH /api/schedule-entries/:id - update entry (scheduled times, planned output)
  if (entryMatch && request.method === "PATCH") {
    return handleUpdateEntry(parseInt(entryMatch[1]!), request);
  }

  // === Assignment Management Endpoints ===

  // GET /api/schedule-entries/:id/assignments - list assignments for task
  const assignmentsMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/assignments$/);
  if (assignmentsMatch && request.method === "GET") {
    const entryId = parseInt(assignmentsMatch[1]!);
    const assignments = await getAssignmentsForEntry(entryId);
    return Response.json(assignments);
  }

  // POST /api/schedule-entries/:id/assignments - add worker to task
  if (assignmentsMatch && request.method === "POST") {
    return handleAddAssignment(parseInt(assignmentsMatch[1]!), request);
  }

  // DELETE /api/schedule-entries/:entryId/assignments/:workerId - remove worker from task
  const removeAssignmentMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/assignments\/(\d+)$/);
  if (removeAssignmentMatch && request.method === "DELETE") {
    const entryId = parseInt(removeAssignmentMatch[1]!);
    const workerId = parseInt(removeAssignmentMatch[2]!);

    const result = await db.execute({
      sql: "DELETE FROM task_worker_assignments WHERE schedule_entry_id = ? AND worker_id = ?",
      args: [entryId, workerId]
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // === Per-Assignment Time Tracking Endpoints ===

  // POST /api/assignments/:id/start - worker starts their assignment
  const assignmentStartMatch = url.pathname.match(/^\/api\/assignments\/(\d+)\/start$/);
  if (assignmentStartMatch && request.method === "POST") {
    const assignmentId = parseInt(assignmentStartMatch[1]!);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // Record initial output (0) in history when work starts
    await db.execute({
      sql: `INSERT INTO assignment_output_history (assignment_id, output, recorded_at)
       VALUES (?, 0, datetime('now'))`,
      args: [assignmentId]
    });

    const result = await db.execute({
      sql: "UPDATE task_worker_assignments SET actual_start_time = ?, status = 'in_progress' WHERE id = ?",
      args: [timeStr, assignmentId]
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignmentResult = await db.execute({
      sql: `
      SELECT twa.*, w.name as worker_name
      FROM task_worker_assignments twa
      JOIN workers w ON twa.worker_id = w.id
      WHERE twa.id = ?
    `,
      args: [assignmentId]
    });
    const assignment = assignmentResult.rows[0] as unknown as AssignmentWithWorker;

    return Response.json(assignment);
  }

  // POST /api/assignments/:id/complete - worker completes their assignment
  const assignmentCompleteMatch = url.pathname.match(/^\/api\/assignments\/(\d+)\/complete$/);
  if (assignmentCompleteMatch && request.method === "POST") {
    return handleCompleteAssignment(parseInt(assignmentCompleteMatch[1]!), request);
  }

  // GET /api/assignments/:id/output-history - get output history for analytics
  const assignmentHistoryMatch = url.pathname.match(/^\/api\/assignments\/(\d+)\/output-history$/);
  if (assignmentHistoryMatch && request.method === "GET") {
    const assignmentId = parseInt(assignmentHistoryMatch[1]!);
    
    const historyResult = await db.execute({
      sql: `
      SELECT 
        aoh.id,
        aoh.output,
        aoh.recorded_at,
        twa.actual_start_time
      FROM assignment_output_history aoh
      JOIN task_worker_assignments twa ON aoh.assignment_id = twa.id
      WHERE aoh.assignment_id = ?
      ORDER BY aoh.recorded_at ASC
    `,
      args: [assignmentId]
    });
    
    const history = historyResult.rows as unknown as {
      id: number;
      output: number;
      recorded_at: string;
      actual_start_time: string | null;
    }[];

    return Response.json(history);
  }

  // PATCH /api/assignments/:id - update assignment (output, notes)
  const assignmentUpdateMatch = url.pathname.match(/^\/api\/assignments\/(\d+)$/);
  if (assignmentUpdateMatch && request.method === "PATCH") {
    return handleUpdateAssignment(parseInt(assignmentUpdateMatch[1]!), request);
  }

  // === Legacy endpoints (deprecated but kept for backwards compatibility) ===

  // POST /api/schedule-entries/:id/start - DEPRECATED: use /api/assignments/:id/start
  const startMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/start$/);
  if (startMatch && request.method === "POST") {
    const entryId = parseInt(startMatch[1]!);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // Legacy behavior: update the deprecated fields on schedule_entries
    const result = await db.execute({
      sql: "UPDATE schedule_entries SET actual_start_time = ?, status = 'in_progress' WHERE id = ?",
      args: [timeStr, entryId]
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const entryResult = await db.execute({
      sql: "SELECT * FROM schedule_entries WHERE id = ?",
      args: [entryId]
    });
    const entry = entryResult.rows[0] as unknown as ScheduleEntry;
    return Response.json(entry);
  }

  // POST /api/schedule-entries/:id/complete - DEPRECATED: use /api/assignments/:id/complete
  const completeMatch = url.pathname.match(/^\/api\/schedule-entries\/(\d+)\/complete$/);
  if (completeMatch && request.method === "POST") {
    return handleCompleteEntryLegacy(parseInt(completeMatch[1]!), request);
  }

  return null;
}

async function handleAddAssignment(entryId: number, request: Request): Promise<Response> {
  try {
    const body = await request.json() as { worker_id: number };

    if (!body.worker_id) {
      return Response.json({ error: "worker_id is required" }, { status: 400 });
    }

    // Check entry exists
    const entryResult = await db.execute({
      sql: "SELECT id FROM schedule_entries WHERE id = ?",
      args: [entryId]
    });
    const entry = entryResult.rows[0];
    if (!entry) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    // Check worker exists
    const workerResult = await db.execute({
      sql: "SELECT id FROM workers WHERE id = ?",
      args: [body.worker_id]
    });
    const worker = workerResult.rows[0];
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    // Insert assignment
    try {
      await db.execute({
        sql: "INSERT INTO task_worker_assignments (schedule_entry_id, worker_id) VALUES (?, ?)",
        args: [entryId, body.worker_id]
      });
    } catch (e: any) {
      if (e.message?.includes("UNIQUE constraint")) {
        return Response.json({ error: "Worker already assigned to this task" }, { status: 409 });
      }
      throw e;
    }

    const assignments = await getAssignmentsForEntry(entryId);
    return Response.json(assignments, { status: 201 });
  } catch (error) {
    console.error("Error adding assignment:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleCompleteAssignment(assignmentId: number, request: Request): Promise<Response> {
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

    // Record final output in history (non-destructive)
    await db.execute({
      sql: `INSERT INTO assignment_output_history (assignment_id, output, recorded_at)
       VALUES (?, ?, datetime('now'))`,
      args: [assignmentId, body.actual_output]
    });

    const result = await db.execute({
      sql: `UPDATE task_worker_assignments
       SET actual_end_time = ?, actual_output = ?, status = 'completed', notes = COALESCE(?, notes)
       WHERE id = ?`,
      args: [timeStr, body.actual_output, body.notes ?? null, assignmentId]
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignmentResult = await db.execute({
      sql: `
      SELECT twa.*, w.name as worker_name
      FROM task_worker_assignments twa
      JOIN workers w ON twa.worker_id = w.id
      WHERE twa.id = ?
    `,
      args: [assignmentId]
    });
    const assignment = assignmentResult.rows[0] as unknown as AssignmentWithWorker;

    return Response.json(assignment);
  } catch (error) {
    console.error("Error completing assignment:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateAssignment(assignmentId: number, request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      actual_output?: number;
      notes?: string;
      status?: 'not_started' | 'in_progress' | 'completed';
      actual_start_time?: string;
      actual_end_time?: string;
    };

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    // If actual_output is being updated, record it in history (non-destructive)
    if (body.actual_output !== undefined) {
      updates.push("actual_output = ?");
      values.push(body.actual_output);
      
      // Insert history record with timestamp
      await db.execute({
        sql: `INSERT INTO assignment_output_history (assignment_id, output, recorded_at)
         VALUES (?, ?, datetime('now'))`,
        args: [assignmentId, body.actual_output]
      });
    }
    if (body.notes !== undefined) {
      updates.push("notes = ?");
      values.push(body.notes);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      values.push(body.status);
    }
    if (body.actual_start_time !== undefined) {
      updates.push("actual_start_time = ?");
      values.push(body.actual_start_time);
    }
    if (body.actual_end_time !== undefined) {
      updates.push("actual_end_time = ?");
      values.push(body.actual_end_time);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(assignmentId);
    const result = await db.execute({
      sql: `UPDATE task_worker_assignments SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignmentResult = await db.execute({
      sql: `
      SELECT twa.*, w.name as worker_name
      FROM task_worker_assignments twa
      JOIN workers w ON twa.worker_id = w.id
      WHERE twa.id = ?
    `,
      args: [assignmentId]
    });
    const assignment = assignmentResult.rows[0] as unknown as AssignmentWithWorker;

    return Response.json(assignment);
  } catch (error) {
    console.error("Error updating assignment:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateEntry(entryId: number, request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      start_time?: string;
      end_time?: string;
      date?: string;
      planned_output?: number;
      // Legacy fields - kept for backwards compatibility
      actual_start_time?: string;
      actual_end_time?: string;
      actual_output?: number;
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
    // Legacy field support
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
    const result = await db.execute({
      sql: `UPDATE schedule_entries SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    // Return enriched entry
    const entryResult = await db.execute({
      sql: `
      SELECT
        se.*,
        ps.name as step_name,
        ps.category,
        ps.time_per_piece_seconds,
        ps.required_skill_category
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.id = ?
    `,
      args: [entryId]
    });
    const entry = entryResult.rows[0] as unknown as (ScheduleEntry & {
      step_name: string;
      category: string;
      time_per_piece_seconds: number;
      required_skill_category: string;
    });

    const assignments = await getAssignmentsForEntry(entryId);
    return Response.json({
      ...entry,
      computed_status: computeTaskStatus(assignments),
      total_actual_output: computeTotalActualOutput(assignments),
      assignments,
    });
  } catch (error) {
    console.error("Error updating schedule entry:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// Legacy handler - DEPRECATED
async function handleCompleteEntryLegacy(entryId: number, request: Request): Promise<Response> {
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

    const result = await db.execute({
      sql: `UPDATE schedule_entries
       SET actual_end_time = ?, actual_output = ?, status = 'completed', notes = COALESCE(?, notes)
       WHERE id = ?`,
      args: [timeStr, body.actual_output, body.notes ?? null, entryId]
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Schedule entry not found" }, { status: 404 });
    }

    const entryResult = await db.execute({
      sql: "SELECT * FROM schedule_entries WHERE id = ?",
      args: [entryId]
    });
    const entry = entryResult.rows[0] as unknown as ScheduleEntry;
    return Response.json(entry);
  } catch (error) {
    console.error("Error completing schedule entry:", error);
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// Get productivity stats for an assignment
export async function getAssignmentProductivity(assignmentId: number) {
  const dataResult = await db.execute({
    sql: `
    SELECT
      twa.*,
      ps.time_per_piece_seconds
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE twa.id = ?
  `,
    args: [assignmentId]
  });
  const data = dataResult.rows[0] as unknown as (TaskWorkerAssignment & { time_per_piece_seconds: number }) | undefined;

  if (!data || !data.actual_start_time || !data.actual_end_time) {
    return null;
  }

  // Calculate actual time worked in minutes
  const startParts = data.actual_start_time.split(":").map(Number);
  const endParts = data.actual_end_time.split(":").map(Number);
  const startMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMinutes = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);
  const actualMinutes = endMinutes - startMinutes;

  // Calculate expected time for actual output
  const expectedSeconds = data.actual_output * data.time_per_piece_seconds;
  const expectedMinutes = expectedSeconds / 60;

  // Calculate efficiency (100% = on standard, >100% = faster than standard)
  const efficiency = actualMinutes > 0 ? (expectedMinutes / actualMinutes) * 100 : 0;

  // Calculate pieces per hour
  const actualPiecesPerHour = actualMinutes > 0 ? (data.actual_output / actualMinutes) * 60 : 0;
  const standardPiecesPerHour = (3600 / data.time_per_piece_seconds);

  return {
    assignmentId,
    workerId: data.worker_id,
    actualOutput: data.actual_output,
    actualMinutes,
    expectedMinutes,
    efficiency: Math.round(efficiency),
    actualPiecesPerHour: Math.round(actualPiecesPerHour * 10) / 10,
    standardPiecesPerHour: Math.round(standardPiecesPerHour * 10) / 10,
  };
}

// Legacy function - DEPRECATED: use getAssignmentProductivity instead
export async function getEntryProductivity(entryId: number) {
  const entryResult = await db.execute({
    sql: `
    SELECT
      se.*,
      ps.time_per_piece_seconds
    FROM schedule_entries se
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE se.id = ?
  `,
    args: [entryId]
  });
  const entry = entryResult.rows[0] as unknown as (ScheduleEntry & { time_per_piece_seconds: number }) | undefined;

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

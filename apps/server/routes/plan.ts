import { db } from "../db";
import type { ScheduleDraft } from "../db/schema";
import { generateSchedule, findQualifiedWorkers, WORK_DAY } from "../services/scheduler";

// Types
interface DraftEntry {
  id: string;  // temporary UUID for draft
  product_step_id: number;
  step_name: string;
  step_code: string | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  worker_ids: number[];
  worker_names: string[];
  qualified_worker_ids: number[];  // workers qualified for this step
}

interface DayProjection {
  date: string;
  cumulativeUnits: number;
  percentComplete: number;
  entries: number;
}

interface PlanPreviewRequest {
  efficiency: number;        // 1-200, default 100
  workerIds: number[];       // Empty = all available
  startDate: string;         // YYYY-MM-DD
  allowOvertime: boolean;
}

interface PlanPreviewResponse {
  orderId: number;
  productName: string;
  orderQuantity: number;
  dueDate: string;
  buildVersionId: number | null;

  // Projection
  projectedEndDate: string;
  projectedEndTime: string;
  isOnTrack: boolean;
  daysOverUnder: number;

  // Hours
  idealHours: number;
  adjustedHours: number;

  // Costs
  laborCost: number;
  equipmentCost: number;
  totalCost: number;

  // Timeline
  timeline: DayProjection[];

  // Editable entries
  entries: DraftEntry[];

  // Available workers for assignment
  availableWorkers: { id: number; name: string; skill_category: string }[];
}

export async function handlePlan(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // POST /api/orders/:id/plan/preview - generate plan preview
  const previewMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/plan\/preview$/);
  if (previewMatch && request.method === "POST") {
    const orderId = parseInt(previewMatch[1]!);
    return handlePlanPreview(orderId, request);
  }

  // POST /api/orders/:id/plan/save - save draft
  const saveMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/plan\/save$/);
  if (saveMatch && request.method === "POST") {
    const orderId = parseInt(saveMatch[1]!);
    return handleSaveDraft(orderId, request);
  }

  // GET /api/orders/:id/plan/draft - get existing draft
  const draftMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/plan\/draft$/);
  if (draftMatch && request.method === "GET") {
    const orderId = parseInt(draftMatch[1]!);
    return handleGetDraft(orderId);
  }

  // POST /api/orders/:id/plan/commit - commit plan to schedule
  const commitMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/plan\/commit$/);
  if (commitMatch && request.method === "POST") {
    const orderId = parseInt(commitMatch[1]!);
    return handleCommitPlan(orderId, request);
  }

  // DELETE /api/orders/:id/plan/draft - delete draft
  const deleteDraftMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/plan\/draft$/);
  if (deleteDraftMatch && request.method === "DELETE") {
    const orderId = parseInt(deleteDraftMatch[1]!);
    return handleDeleteDraft(orderId);
  }

  return null;
}

async function handlePlanPreview(orderId: number, request: Request): Promise<Response> {
  const body = await request.json() as Partial<PlanPreviewRequest>;
  const efficiency = body.efficiency ?? 100;
  const workerIds = body.workerIds ?? [];
  const startDate = body.startDate ?? new Date().toISOString().split("T")[0]!;
  const allowOvertime = body.allowOvertime ?? false;

  // Get order details
  const orderResult = await db.execute({
    sql: `
      SELECT o.*, p.name as product_name, p.id as product_id
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `,
    args: [orderId]
  });

  if (orderResult.rows.length === 0) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const order = orderResult.rows[0] as unknown as {
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    due_date: string;
    build_version_id: number | null;
  };

  // Get build version steps
  const buildVersionId = order.build_version_id;
  let stepsQuery: string;
  let stepsArgs: (number | null)[];

  if (buildVersionId) {
    stepsQuery = `
      SELECT ps.*, bvs.sequence
      FROM product_steps ps
      JOIN build_version_steps bvs ON bvs.product_step_id = ps.id
      WHERE bvs.build_version_id = ?
      ORDER BY bvs.sequence
    `;
    stepsArgs = [buildVersionId];
  } else {
    stepsQuery = `
      SELECT ps.*, ps.sequence
      FROM product_steps ps
      WHERE ps.product_id = ?
      ORDER BY ps.sequence
    `;
    stepsArgs = [order.product_id];
  }

  const stepsResult = await db.execute({ sql: stepsQuery, args: stepsArgs });
  const steps = stepsResult.rows as unknown as {
    id: number;
    name: string;
    step_code: string | null;
    sequence: number;
    time_per_piece_seconds: number;
    required_skill_category: string | null;
    equipment_id: number | null;
  }[];

  // Get available workers (filtered if workerIds provided)
  let workersQuery = `
    SELECT id, name, skill_category, cost_per_hour
    FROM workers
    WHERE status = 'active'
  `;
  if (workerIds.length > 0) {
    workersQuery += ` AND id IN (${workerIds.map(() => "?").join(",")})`;
  }
  const workersResult = await db.execute({
    sql: workersQuery,
    args: workerIds.length > 0 ? workerIds : []
  });
  const availableWorkers = workersResult.rows as unknown as {
    id: number;
    name: string;
    skill_category: string;
    cost_per_hour: number;
  }[];

  // Get worker proficiencies for all steps (derived from worker_step_performance)
  const stepIds = steps.map(s => s.id);
  const proficienciesResult = stepIds.length > 0 ? await db.execute({
    sql: `
      SELECT
        worker_id,
        bom_step_id as product_step_id,
        CASE
          WHEN avg_efficiency_percent >= 130 THEN 5
          WHEN avg_efficiency_percent >= 115 THEN 4
          WHEN avg_efficiency_percent >= 85 THEN 3
          WHEN avg_efficiency_percent >= 70 THEN 2
          ELSE 1
        END as level
      FROM worker_step_performance
      WHERE bom_step_id IN (${stepIds.map(() => "?").join(",")})
    `,
    args: stepIds
  }) : { rows: [] };
  const proficiencies = proficienciesResult.rows as unknown as {
    worker_id: number;
    product_step_id: number;
    level: number;
  }[];

  // Get equipment certifications
  const equipmentIds = steps.filter(s => s.equipment_id).map(s => s.equipment_id!);
  let equipmentCerts: { worker_id: number; equipment_id: number }[] = [];
  if (equipmentIds.length > 0) {
    const certsResult = await db.execute({
      sql: `
        SELECT worker_id, equipment_id
        FROM equipment_certifications
        WHERE equipment_id IN (${equipmentIds.map(() => "?").join(",")})
      `,
      args: equipmentIds
    });
    equipmentCerts = certsResult.rows as unknown as { worker_id: number; equipment_id: number }[];
  }

  // Helper to find qualified workers for a step (returns sorted list + best worker)
  const getQualifiedWorkers = (step: typeof steps[0]) => {
    let candidates = availableWorkers;

    // Filter by equipment certification if step requires equipment
    if (step.equipment_id) {
      const certifiedWorkerIds = equipmentCerts
        .filter(c => c.equipment_id === step.equipment_id)
        .map(c => c.worker_id);
      if (certifiedWorkerIds.length > 0) {
        candidates = candidates.filter(w => certifiedWorkerIds.includes(w.id));
      }
    }

    // Filter by skill category if required
    if (step.required_skill_category) {
      const skillMatched = candidates.filter(w => w.skill_category === step.required_skill_category);
      if (skillMatched.length > 0) {
        candidates = skillMatched;
      }
    }

    // Sort by proficiency level (higher is better)
    const stepProficiencies = proficiencies.filter(p => p.product_step_id === step.id);
    candidates = [...candidates].sort((a, b) => {
      const aProf = stepProficiencies.find(p => p.worker_id === a.id)?.level ?? 0;
      const bProf = stepProficiencies.find(p => p.worker_id === b.id)?.level ?? 0;
      return bProf - aProf; // Higher proficiency first
    });

    return {
      qualifiedWorkerIds: candidates.map(w => w.id),
      bestWorker: candidates[0] ?? availableWorkers[0],
    };
  };

  // Calculate ideal hours
  const totalIdealSeconds = steps.reduce((sum, step) =>
    sum + (step.time_per_piece_seconds * order.quantity), 0);
  const idealHours = totalIdealSeconds / 3600;

  // Adjust for efficiency (efficiency < 100 means slower, takes more time)
  const adjustedHours = idealHours / (efficiency / 100);

  // Generate draft entries
  const entries: DraftEntry[] = [];
  let currentDate = new Date(startDate);

  // Skip to next weekday if starting on weekend
  while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  let currentTime = WORK_DAY.morningStart;
  const workMinutesPerDay = WORK_DAY.totalMinutes;

  // Process each step in sequence
  for (const step of steps) {
    const adjustedSecondsPerPiece = step.time_per_piece_seconds / (efficiency / 100);
    const totalMinutesNeeded = (adjustedSecondsPerPiece * order.quantity) / 60;

    let remainingMinutes = totalMinutesNeeded;
    let remainingUnits = order.quantity;

    while (remainingMinutes > 0) {
      // Calculate available minutes today
      const currentMinutes = timeToMinutes(currentTime);
      let availableMinutes = 0;

      if (currentMinutes < timeToMinutes(WORK_DAY.lunchStart)) {
        // Morning: available until lunch
        availableMinutes = timeToMinutes(WORK_DAY.lunchStart) - currentMinutes;
      } else if (currentMinutes >= timeToMinutes(WORK_DAY.lunchEnd)) {
        // Afternoon: available until end of day
        availableMinutes = timeToMinutes(WORK_DAY.dayEnd) - currentMinutes;
      } else {
        // During lunch, skip to after lunch
        currentTime = WORK_DAY.lunchEnd;
        continue;
      }

      // Add overtime if allowed and needed
      if (allowOvertime && currentMinutes >= timeToMinutes(WORK_DAY.dayEnd)) {
        availableMinutes = 150; // 2.5 hours overtime max
      }

      if (availableMinutes <= 0) {
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        currentTime = WORK_DAY.morningStart;
        continue;
      }

      const workMinutes = Math.min(availableMinutes, remainingMinutes);
      const unitsThisBlock = Math.ceil((workMinutes / totalMinutesNeeded) * order.quantity);
      const actualUnits = Math.min(unitsThisBlock, remainingUnits);

      const endMinutes = timeToMinutes(currentTime) + workMinutes;
      const endTime = minutesToTime(Math.min(endMinutes, timeToMinutes(allowOvertime ? "18:00" : WORK_DAY.dayEnd)));

      // Find best worker for this step (considers proficiency + equipment certification)
      const { qualifiedWorkerIds, bestWorker } = getQualifiedWorkers(step);

      entries.push({
        id: crypto.randomUUID(),
        product_step_id: step.id,
        step_name: step.name,
        step_code: step.step_code,
        date: currentDate.toISOString().split("T")[0]!,
        start_time: currentTime,
        end_time: endTime,
        planned_output: actualUnits,
        worker_ids: bestWorker ? [bestWorker.id] : [],
        worker_names: bestWorker ? [bestWorker.name] : [],
        qualified_worker_ids: qualifiedWorkerIds,
      });

      remainingMinutes -= workMinutes;
      remainingUnits -= actualUnits;
      currentTime = endTime;

      // Handle lunch break
      if (currentTime === WORK_DAY.lunchStart) {
        currentTime = WORK_DAY.lunchEnd;
      }

      // Handle end of day
      if (timeToMinutes(currentTime) >= timeToMinutes(WORK_DAY.dayEnd)) {
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        currentTime = WORK_DAY.morningStart;
      }
    }
  }

  // Calculate timeline (cumulative units by day)
  const timeline: DayProjection[] = [];
  const entriesByDate = new Map<string, DraftEntry[]>();
  for (const entry of entries) {
    const existing = entriesByDate.get(entry.date) ?? [];
    existing.push(entry);
    entriesByDate.set(entry.date, existing);
  }

  let cumulativeUnits = 0;
  const sortedDates = [...entriesByDate.keys()].sort();
  for (const date of sortedDates) {
    const dayEntries = entriesByDate.get(date)!;
    // Only count output from the last step (finished units)
    const lastStepId = steps[steps.length - 1]?.id;
    const lastStepEntries = dayEntries.filter(e => e.product_step_id === lastStepId);
    const dayOutput = lastStepEntries.reduce((sum, e) => sum + e.planned_output, 0);
    cumulativeUnits += dayOutput;

    timeline.push({
      date,
      cumulativeUnits,
      percentComplete: Math.round((cumulativeUnits / order.quantity) * 100),
      entries: dayEntries.length,
    });
  }

  // Determine projected end
  const lastEntry = entries[entries.length - 1];
  const projectedEndDate = lastEntry?.date ?? startDate;
  const projectedEndTime = lastEntry?.end_time ?? WORK_DAY.dayEnd;

  // Check if on track
  const dueDateTime = new Date(order.due_date + "T" + WORK_DAY.dayEnd + ":00");
  const projectedDateTime = new Date(projectedEndDate + "T" + projectedEndTime + ":00");
  const isOnTrack = projectedDateTime <= dueDateTime;
  const diffMs = projectedDateTime.getTime() - dueDateTime.getTime();
  const daysOverUnder = isNaN(diffMs) ? 0 : Math.round(diffMs / (1000 * 60 * 60 * 24));

  // Calculate costs
  const avgWorkerCost = availableWorkers.length > 0
    ? availableWorkers.reduce((sum, w) => sum + w.cost_per_hour, 0) / availableWorkers.length
    : 15; // default
  const laborCost = adjustedHours * avgWorkerCost;

  // Get equipment costs
  const equipmentResult = await db.execute(`
    SELECT COALESCE(SUM(hourly_cost), 0) as total_hourly
    FROM equipment
    WHERE id IN (${steps.filter(s => s.equipment_id).map(s => s.equipment_id).join(",") || "0"})
  `);
  const equipmentHourlyCost = (equipmentResult.rows[0] as unknown as { total_hourly: number })?.total_hourly ?? 0;
  const equipmentCost = adjustedHours * equipmentHourlyCost / steps.length; // Rough estimate

  const response: PlanPreviewResponse = {
    orderId,
    productName: order.product_name,
    orderQuantity: order.quantity,
    dueDate: order.due_date,
    buildVersionId,
    projectedEndDate,
    projectedEndTime,
    isOnTrack,
    daysOverUnder,
    idealHours: Math.round(idealHours * 100) / 100,
    adjustedHours: Math.round(adjustedHours * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    equipmentCost: Math.round(equipmentCost * 100) / 100,
    totalCost: Math.round((laborCost + equipmentCost) * 100) / 100,
    timeline,
    entries,
    availableWorkers: availableWorkers.map(w => ({
      id: w.id,
      name: w.name,
      skill_category: w.skill_category,
    })),
  };

  return Response.json(response);
}

async function handleSaveDraft(orderId: number, request: Request): Promise<Response> {
  const body = await request.json() as {
    efficiency: number;
    workerIds: number[];
    startDate: string;
    allowOvertime: boolean;
    entries: DraftEntry[];
    projection: {
      projectedEndDate: string;
      projectedEndTime: string;
      isOnTrack: boolean;
      idealHours: number;
      adjustedHours: number;
      laborCost: number;
      equipmentCost: number;
    };
  };

  // Check if draft already exists for this order
  const existingResult = await db.execute({
    sql: "SELECT id FROM schedule_drafts WHERE order_id = ?",
    args: [orderId]
  });

  const entriesJson = JSON.stringify(body.entries);
  const workerIdsJson = JSON.stringify(body.workerIds);

  if (existingResult.rows.length > 0) {
    // Update existing draft
    await db.execute({
      sql: `
        UPDATE schedule_drafts SET
          efficiency = ?,
          worker_ids = ?,
          start_date = ?,
          allow_overtime = ?,
          projected_end_date = ?,
          projected_end_time = ?,
          is_on_track = ?,
          ideal_hours = ?,
          adjusted_hours = ?,
          labor_cost = ?,
          equipment_cost = ?,
          entries_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
      `,
      args: [
        body.efficiency,
        workerIdsJson,
        body.startDate,
        body.allowOvertime ? 1 : 0,
        body.projection.projectedEndDate,
        body.projection.projectedEndTime,
        body.projection.isOnTrack ? 1 : 0,
        body.projection.idealHours,
        body.projection.adjustedHours,
        body.projection.laborCost,
        body.projection.equipmentCost,
        entriesJson,
        orderId
      ]
    });
  } else {
    // Insert new draft
    await db.execute({
      sql: `
        INSERT INTO schedule_drafts (
          order_id, efficiency, worker_ids, start_date, allow_overtime,
          projected_end_date, projected_end_time, is_on_track,
          ideal_hours, adjusted_hours, labor_cost, equipment_cost, entries_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        orderId,
        body.efficiency,
        workerIdsJson,
        body.startDate,
        body.allowOvertime ? 1 : 0,
        body.projection.projectedEndDate,
        body.projection.projectedEndTime,
        body.projection.isOnTrack ? 1 : 0,
        body.projection.idealHours,
        body.projection.adjustedHours,
        body.projection.laborCost,
        body.projection.equipmentCost,
        entriesJson
      ]
    });
  }

  return Response.json({ success: true });
}

async function handleGetDraft(orderId: number): Promise<Response> {
  const result = await db.execute({
    sql: "SELECT * FROM schedule_drafts WHERE order_id = ?",
    args: [orderId]
  });

  if (result.rows.length === 0) {
    return Response.json({ draft: null });
  }

  const draft = result.rows[0] as unknown as ScheduleDraft;
  return Response.json({
    draft: {
      ...draft,
      worker_ids: draft.worker_ids ? JSON.parse(draft.worker_ids) : [],
      entries: JSON.parse(draft.entries_json),
    }
  });
}

async function handleDeleteDraft(orderId: number): Promise<Response> {
  await db.execute({
    sql: "DELETE FROM schedule_drafts WHERE order_id = ?",
    args: [orderId]
  });
  return Response.json({ success: true });
}

async function handleCommitPlan(orderId: number, request: Request): Promise<Response> {
  const body = await request.json() as {
    entries: DraftEntry[];
    buildVersionId?: number;
  };

  // Get order details
  const orderResult = await db.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [orderId]
  });

  if (orderResult.rows.length === 0) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const order = orderResult.rows[0] as unknown as {
    id: number;
    product_id: number;
    build_version_id: number | null;
  };

  // Get week start date from first entry
  const firstEntry = body.entries[0];
  if (!firstEntry) {
    return Response.json({ error: "No entries to commit" }, { status: 400 });
  }

  const firstDate = new Date(firstEntry.date);
  const dayOfWeek = firstDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStartDate = new Date(firstDate);
  weekStartDate.setDate(firstDate.getDate() + mondayOffset);

  // Create schedule
  const buildVersionId = body.buildVersionId ?? order.build_version_id;
  const scheduleResult = await db.execute({
    sql: `
      INSERT INTO schedules (order_id, week_start_date, build_version_id)
      VALUES (?, ?, ?)
    `,
    args: [orderId, weekStartDate.toISOString().split("T")[0]!, buildVersionId ?? null]
  });

  const scheduleId = Number(scheduleResult.lastInsertRowid);

  // Create schedule entries and worker assignments
  for (const entry of body.entries) {
    const entryResult = await db.execute({
      sql: `
        INSERT INTO schedule_entries (
          schedule_id, product_step_id, date, start_time, end_time,
          planned_output, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'not_started')
      `,
      args: [
        scheduleId,
        entry.product_step_id,
        entry.date,
        entry.start_time,
        entry.end_time,
        entry.planned_output
      ]
    });

    const entryId = Number(entryResult.lastInsertRowid);

    // Create worker assignments
    for (const workerId of entry.worker_ids) {
      await db.execute({
        sql: `
          INSERT INTO task_worker_assignments (schedule_entry_id, worker_id, status)
          VALUES (?, ?, 'pending')
        `,
        args: [entryId, workerId]
      });
    }
  }

  // Update order status
  await db.execute({
    sql: "UPDATE orders SET status = 'scheduled' WHERE id = ?",
    args: [orderId]
  });

  // Delete draft if exists
  await db.execute({
    sql: "DELETE FROM schedule_drafts WHERE order_id = ?",
    args: [orderId]
  });

  return Response.json({ success: true, scheduleId });
}

// Helper functions
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return Math.round(hours! * 60 + minutes!);
}

function minutesToTime(minutes: number): string {
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

import { db } from "../db";
import type { Order, Product } from "../db/schema";

// Color palette for distinguishing orders
const ORDER_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

async function getNextOrderColor(): Promise<string> {
  const result = await db.execute("SELECT DISTINCT color FROM orders WHERE color IS NOT NULL");
  const usedColors = result.rows as unknown as { color: string }[];
  const usedSet = new Set(usedColors.map(c => c.color));

  // Find first unused color
  const unusedColor = ORDER_COLORS.find(c => !usedSet.has(c));
  if (unusedColor) {
    return unusedColor;
  }

  // All colors used, cycle through based on count
  const countResult = await db.execute(`
    SELECT color, COUNT(*) as count
    FROM orders
    WHERE color IS NOT NULL
    GROUP BY color
    ORDER BY count ASC
  `);
  const colorCounts = countResult.rows as unknown as { color: string; count: number }[];

  // Return the least used color, or random if all equal
  if (colorCounts.length > 0) {
    return colorCounts[0]!.color;
  }

  return ORDER_COLORS[Math.floor(Math.random() * ORDER_COLORS.length)]!;
}

export async function handleOrders(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/orders - list all orders
  if (url.pathname === "/api/orders" && request.method === "GET") {
    const result = await db.execute(`
      SELECT o.*, p.name as product_name, s.id as schedule_id
      FROM orders o
      JOIN products p ON o.product_id = p.id
      LEFT JOIN schedules s ON s.order_id = o.id
      ORDER BY o.due_date
    `);
    const orders = result.rows;
    return Response.json(orders);
  }

  // POST /api/orders - create new order
  if (url.pathname === "/api/orders" && request.method === "POST") {
    return handleCreateOrder(request);
  }

  // GET /api/orders/:id/detail - comprehensive order detail with insights
  const orderDetailMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/detail$/);
  if (orderDetailMatch && request.method === "GET") {
    const orderId = parseInt(orderDetailMatch[1]!);
    return handleOrderDetail(orderId);
  }

  // GET /api/orders/:id - get single order
  const orderMatch = url.pathname.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch && request.method === "GET") {
    const orderId = parseInt(orderMatch[1]!);
    const result = await db.execute({
      sql: `
      SELECT o.*, p.name as product_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `,
      args: [orderId]
    });
    const order = result.rows[0];

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }
    return Response.json(order);
  }

  // PATCH /api/orders/:id - update order status
  if (orderMatch && request.method === "PATCH") {
    return handleUpdateOrder(request, parseInt(orderMatch[1]!));
  }

  // DELETE /api/orders/:id - delete order
  if (orderMatch && request.method === "DELETE") {
    return handleDeleteOrder(parseInt(orderMatch[1]!));
  }

  return null;
}

async function handleCreateOrder(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      product_id: number;
      quantity: number;
      due_date: string;
    };

    if (!body.product_id || !body.quantity || !body.due_date) {
      return Response.json(
        { error: "Missing required fields: product_id, quantity, due_date" },
        { status: 400 }
      );
    }

    // Verify product exists
    const productResult = await db.execute({
      sql: "SELECT id FROM products WHERE id = ?",
      args: [body.product_id]
    });
    const product = productResult.rows[0];
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    // Auto-assign a color for visual distinction
    const color = await getNextOrderColor();

    const result = await db.execute({
      sql: "INSERT INTO orders (product_id, quantity, due_date, color) VALUES (?, ?, ?, ?)",
      args: [body.product_id, body.quantity, body.due_date, color]
    });

    const newOrderResult = await db.execute({
      sql: `
        SELECT o.*, p.name as product_name
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.id = ?
      `,
      args: [result.lastInsertRowid!]
    });
    const order = newOrderResult.rows[0];
    return Response.json(order, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateOrder(request: Request, orderId: number): Promise<Response> {
  try {
    const body = await request.json() as {
      status?: string;
      quantity?: number;
      due_date?: string;
      color?: string | null;
      product_id?: number;
    };

    const updates: string[] = [];
    const values: any[] = [];

    if (body.status) {
      if (!['pending', 'scheduled', 'in_progress', 'completed'].includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    if (body.quantity !== undefined) {
      if (body.quantity < 1) {
        return Response.json({ error: "Quantity must be at least 1" }, { status: 400 });
      }
      updates.push("quantity = ?");
      values.push(body.quantity);
    }

    if (body.due_date !== undefined) {
      updates.push("due_date = ?");
      values.push(body.due_date);
    }

    if ('color' in body) {
      updates.push("color = ?");
      values.push(body.color);
    }

    if (body.product_id !== undefined) {
      // Verify product exists
      const productResult = await db.execute({
        sql: "SELECT id FROM products WHERE id = ?",
        args: [body.product_id]
      });
      if (productResult.rows.length === 0) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }
      updates.push("product_id = ?");
      values.push(body.product_id);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(orderId);
    await db.execute({
      sql: `UPDATE orders SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    // Return updated order with product_name and schedule_id
    const orderResult = await db.execute({
      sql: `
        SELECT o.*, p.name as product_name, s.id as schedule_id
        FROM orders o
        JOIN products p ON o.product_id = p.id
        LEFT JOIN schedules s ON s.order_id = o.id
        WHERE o.id = ?
      `,
      args: [orderId]
    });
    const order = orderResult.rows[0];

    if (!order) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    return Response.json(order);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleDeleteOrder(orderId: number): Promise<Response> {
  // Check if order exists
  const orderResult = await db.execute({
    sql: "SELECT id FROM orders WHERE id = ?",
    args: [orderId]
  });

  if (orderResult.rows.length === 0) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  // Delete in order: task_worker_assignments → schedule_entries → schedules → order
  // (Foreign keys with ON DELETE CASCADE should handle most of this, but being explicit)

  // Get schedule IDs for this order
  const schedulesResult = await db.execute({
    sql: "SELECT id FROM schedules WHERE order_id = ?",
    args: [orderId]
  });
  const scheduleIds = (schedulesResult.rows as unknown as { id: number }[]).map(r => r.id);

  if (scheduleIds.length > 0) {
    // Get schedule entry IDs
    const entriesResult = await db.execute({
      sql: `SELECT id FROM schedule_entries WHERE schedule_id IN (${scheduleIds.map(() => '?').join(',')})`,
      args: scheduleIds
    });
    const entryIds = (entriesResult.rows as unknown as { id: number }[]).map(r => r.id);

    if (entryIds.length > 0) {
      // Delete task worker assignments
      await db.execute({
        sql: `DELETE FROM task_worker_assignments WHERE schedule_entry_id IN (${entryIds.map(() => '?').join(',')})`,
        args: entryIds
      });

      // Delete schedule entries
      await db.execute({
        sql: `DELETE FROM schedule_entries WHERE id IN (${entryIds.map(() => '?').join(',')})`,
        args: entryIds
      });
    }

    // Delete schedules
    await db.execute({
      sql: `DELETE FROM schedules WHERE id IN (${scheduleIds.map(() => '?').join(',')})`,
      args: scheduleIds
    });
  }

  // Delete the order
  await db.execute({
    sql: "DELETE FROM orders WHERE id = ?",
    args: [orderId]
  });

  return Response.json({ success: true, message: "Order deleted" });
}

// Proficiency multipliers for expected time calculations
const PROFICIENCY_MULTIPLIERS: Record<number, number> = {
  1: 1.5,   // Novice - 50% slower
  2: 1.25,  // Learning - 25% slower
  3: 1.0,   // Standard - baseline
  4: 0.85,  // Proficient - 15% faster
  5: 0.7,   // Expert - 30% faster
};

interface OrderDetailStep {
  stepId: number;
  stepName: string;
  sequence: number;
  completedUnits: number;
  totalUnits: number;
  progressPercent: number;
  expectedSecondsPerPiece: number;
  actualSecondsPerPiece: number | null;
  efficiency: number | null;
  hoursWorked: number;
  hoursRemaining: number;
  isBottleneck: boolean;
  workers: {
    workerId: number;
    workerName: string;
    proficiencyLevel: number | null;
    unitsProduced: number;
    hoursWorked: number;
    efficiency: number | null;
  }[];
}

interface InsightFactor {
  type: 'bottleneck_step' | 'fast_step' | 'worker_efficiency' | 'hours_deficit';
  impact: 'positive' | 'negative' | 'neutral';
  severity: number;
  title: string;
  description: string;
  stepId?: number;
  workerId?: number;
}

async function handleOrderDetail(orderId: number): Promise<Response> {
  // Get basic order info
  const orderResult = await db.execute({
    sql: `
      SELECT o.*, p.name as product_name,
        (SELECT MIN(se.date)
         FROM schedule_entries se
         JOIN schedules s ON se.schedule_id = s.id
         JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
         WHERE s.order_id = o.id AND twa.actual_output > 0
        ) as start_date
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.id = ?
    `,
    args: [orderId]
  });

  if (orderResult.rows.length === 0) {
    return Response.json({ error: "Order not found" }, { status: 404 });
  }

  const orderRow = orderResult.rows[0] as unknown as {
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    due_date: string;
    status: string;
    color: string | null;
    created_at: string;
    start_date: string | null;
  };

  // Get build version ID for this order
  const scheduleResult = await db.execute({
    sql: `SELECT id, build_version_id FROM schedules WHERE order_id = ? LIMIT 1`,
    args: [orderId]
  });

  if (scheduleResult.rows.length === 0) {
    // Order has no schedule yet
    return Response.json({
      order: {
        id: orderRow.id,
        productName: orderRow.product_name,
        quantity: orderRow.quantity,
        dueDate: orderRow.due_date,
        status: orderRow.status,
        startDate: null,
      },
      summary: {
        estimatedCompletionDate: null,
        daysUntilDue: Math.ceil((new Date(orderRow.due_date).getTime() - Date.now()) / 86400000),
        isOnTrack: true,
        daysAheadOrBehind: 0,
        overallEfficiency: null,
        totalHoursWorked: 0,
        totalHoursNeeded: 0,
      },
      insights: {
        overallStatus: 'on_track' as const,
        factors: [],
        suggestions: ['Schedule this order to begin tracking progress'],
      },
      steps: [],
    });
  }

  const buildVersionId = (scheduleResult.rows[0] as unknown as { build_version_id: number }).build_version_id;

  // Get all steps for this build version with their metrics for this order
  const stepsResult = await db.execute({
    sql: `
      SELECT
        ps.id as step_id,
        ps.name as step_name,
        bvs.sequence,
        ps.time_per_piece_seconds,
        COALESCE(SUM(twa.actual_output), 0) as completed_units,
        COALESCE(SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ), 0) as hours_worked
      FROM build_version_steps bvs
      JOIN product_steps ps ON bvs.product_step_id = ps.id
      LEFT JOIN schedule_entries se ON se.product_step_id = ps.id
        AND se.schedule_id IN (SELECT id FROM schedules WHERE order_id = ?)
      LEFT JOIN task_worker_assignments twa ON twa.schedule_entry_id = se.id
      WHERE bvs.build_version_id = ?
      GROUP BY ps.id, ps.name, bvs.sequence, ps.time_per_piece_seconds
      ORDER BY bvs.sequence
    `,
    args: [orderId, buildVersionId]
  });

  // Get worker performance per step for this order
  const workersResult = await db.execute({
    sql: `
      SELECT
        ps.id as step_id,
        w.id as worker_id,
        w.name as worker_name,
        wp.level as proficiency_level,
        SUM(twa.actual_output) as units_produced,
        SUM(
          CASE WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
          THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            - CASE WHEN time(twa.actual_start_time) < '12:00' AND time(twa.actual_end_time) > '11:30' THEN 0.5 ELSE 0 END
          ELSE 0 END
        ) as hours_worked,
        ps.time_per_piece_seconds
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      JOIN schedules s ON se.schedule_id = s.id
      JOIN product_steps ps ON se.product_step_id = ps.id
      JOIN workers w ON twa.worker_id = w.id
      LEFT JOIN worker_proficiencies wp ON wp.worker_id = w.id AND wp.product_step_id = ps.id
      WHERE s.order_id = ? AND twa.actual_output > 0
      GROUP BY ps.id, w.id, w.name, wp.level, ps.time_per_piece_seconds
      ORDER BY ps.id, units_produced DESC
    `,
    args: [orderId]
  });

  // Build worker map by step
  const workersByStep = new Map<number, {
    workerId: number;
    workerName: string;
    proficiencyLevel: number | null;
    unitsProduced: number;
    hoursWorked: number;
    efficiency: number | null;
    expectedEfficiency: number;
  }[]>();

  for (const row of workersResult.rows as unknown as {
    step_id: number;
    worker_id: number;
    worker_name: string;
    proficiency_level: number | null;
    units_produced: number;
    hours_worked: number;
    time_per_piece_seconds: number;
  }[]) {
    if (!workersByStep.has(row.step_id)) {
      workersByStep.set(row.step_id, []);
    }

    // Calculate worker efficiency
    const actualSeconds = row.hours_worked * 3600;
    const expectedSeconds = row.time_per_piece_seconds * row.units_produced;
    const efficiency = actualSeconds > 0 && row.units_produced > 0
      ? Math.round((expectedSeconds / actualSeconds) * 100)
      : null;

    // Calculate expected efficiency based on proficiency
    const profMultiplier = PROFICIENCY_MULTIPLIERS[row.proficiency_level ?? 3] ?? 1.0;
    const expectedEfficiency = Math.round(100 / profMultiplier);

    workersByStep.get(row.step_id)!.push({
      workerId: row.worker_id,
      workerName: row.worker_name,
      proficiencyLevel: row.proficiency_level,
      unitsProduced: row.units_produced,
      hoursWorked: Math.round(row.hours_worked * 100) / 100,
      efficiency,
      expectedEfficiency,
    });
  }

  // Build steps array and calculate metrics
  const steps: OrderDetailStep[] = [];
  let totalHoursWorked = 0;
  let totalExpectedHours = 0;
  let lowestEfficiency = Infinity;
  let bottleneckStepId: number | null = null;

  for (const row of stepsResult.rows as unknown as {
    step_id: number;
    step_name: string;
    sequence: number;
    time_per_piece_seconds: number;
    completed_units: number;
    hours_worked: number;
  }[]) {
    const completedUnits = row.completed_units;
    const progressPercent = Math.round((completedUnits / orderRow.quantity) * 100);
    const hoursWorked = row.hours_worked;
    totalHoursWorked += hoursWorked;

    // Calculate actual seconds per piece
    const actualSecondsPerPiece = completedUnits > 0
      ? (hoursWorked * 3600) / completedUnits
      : null;

    // Calculate efficiency
    const expectedHours = (row.time_per_piece_seconds * completedUnits) / 3600;
    totalExpectedHours += expectedHours;
    const efficiency = hoursWorked > 0 && completedUnits > 0
      ? Math.round((expectedHours / hoursWorked) * 100)
      : null;

    // Track bottleneck (lowest efficiency among steps with work done)
    if (efficiency !== null && efficiency < lowestEfficiency && completedUnits < orderRow.quantity) {
      lowestEfficiency = efficiency;
      bottleneckStepId = row.step_id;
    }

    // Calculate hours remaining for this step
    const remainingUnits = orderRow.quantity - completedUnits;
    const avgSecondsPerUnit = actualSecondsPerPiece ?? row.time_per_piece_seconds;
    const hoursRemaining = (remainingUnits * avgSecondsPerUnit) / 3600;

    steps.push({
      stepId: row.step_id,
      stepName: row.step_name,
      sequence: row.sequence,
      completedUnits,
      totalUnits: orderRow.quantity,
      progressPercent,
      expectedSecondsPerPiece: row.time_per_piece_seconds,
      actualSecondsPerPiece: actualSecondsPerPiece ? Math.round(actualSecondsPerPiece * 10) / 10 : null,
      efficiency,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      hoursRemaining: Math.round(hoursRemaining * 100) / 100,
      isBottleneck: false, // Will set after finding bottleneck
      workers: (workersByStep.get(row.step_id) || []).map(w => ({
        workerId: w.workerId,
        workerName: w.workerName,
        proficiencyLevel: w.proficiencyLevel,
        unitsProduced: w.unitsProduced,
        hoursWorked: w.hoursWorked,
        efficiency: w.efficiency,
      })),
    });
  }

  // Mark bottleneck step
  if (bottleneckStepId !== null) {
    const bottleneckStep = steps.find(s => s.stepId === bottleneckStepId);
    if (bottleneckStep) {
      bottleneckStep.isBottleneck = true;
    }
  }

  // Calculate overall metrics
  const overallEfficiency = totalHoursWorked > 0
    ? Math.round((totalExpectedHours / totalHoursWorked) * 100)
    : null;

  // Calculate estimated completion and hours needed
  const totalStepCompletions = steps.reduce((sum, s) => sum + s.completedUnits, 0);
  const totalStepCompletionsNeeded = orderRow.quantity * steps.length;
  const remainingCompletions = totalStepCompletionsNeeded - totalStepCompletions;

  let estimatedCompletionDate: string | null = null;
  let totalHoursNeeded = 0;

  if (totalStepCompletions > 0 && totalHoursWorked > 0) {
    const hoursPerCompletion = totalHoursWorked / totalStepCompletions;
    totalHoursNeeded = remainingCompletions * hoursPerCompletion;
    const remainingDays = Math.ceil(totalHoursNeeded / 8);
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + remainingDays);
    estimatedCompletionDate = estDate.toISOString().split('T')[0]!;
  }

  const dueDate = new Date(orderRow.due_date);
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
  const isOnTrack = estimatedCompletionDate
    ? new Date(estimatedCompletionDate) <= dueDate
    : true;

  let daysAheadOrBehind = 0;
  if (estimatedCompletionDate) {
    const estDate = new Date(estimatedCompletionDate);
    daysAheadOrBehind = Math.ceil((dueDate.getTime() - estDate.getTime()) / 86400000);
  }

  // Generate insights
  const factors: InsightFactor[] = [];
  const suggestions: string[] = [];

  // Determine overall status
  let overallStatus: 'ahead' | 'on_track' | 'behind' | 'at_risk' = 'on_track';
  if (daysAheadOrBehind < -3) {
    overallStatus = 'behind';
  } else if (daysAheadOrBehind < 0) {
    overallStatus = 'at_risk';
  } else if (daysAheadOrBehind > 3) {
    overallStatus = 'ahead';
  }

  // 1. Bottleneck step insight
  if (bottleneckStepId !== null) {
    const bottleneckStep = steps.find(s => s.stepId === bottleneckStepId);
    if (bottleneckStep && bottleneckStep.efficiency !== null && bottleneckStep.efficiency < 100) {
      const slowdownPercent = 100 - bottleneckStep.efficiency;
      factors.push({
        type: 'bottleneck_step',
        impact: 'negative',
        severity: Math.min(10, Math.ceil(slowdownPercent / 10)),
        title: `"${bottleneckStep.stepName}" is ${slowdownPercent}% slower than expected`,
        description: `${bottleneckStep.efficiency}% efficiency - taking ${(100 / bottleneckStep.efficiency).toFixed(1)}x longer than planned`,
        stepId: bottleneckStepId,
      });
      suggestions.push(`Assign higher proficiency workers to "${bottleneckStep.stepName}"`);
    }
  }

  // 2. Fast step insight (highest efficiency > 110%)
  const fastSteps = steps.filter(s => s.efficiency !== null && s.efficiency > 110);
  if (fastSteps.length > 0) {
    const fastestStep = fastSteps.reduce((best, s) =>
      (s.efficiency ?? 0) > (best.efficiency ?? 0) ? s : best
    );
    factors.push({
      type: 'fast_step',
      impact: 'positive',
      severity: Math.min(10, Math.ceil(((fastestStep.efficiency ?? 100) - 100) / 10)),
      title: `"${fastestStep.stepName}" is ${(fastestStep.efficiency ?? 100) - 100}% faster than expected`,
      description: `${fastestStep.efficiency}% efficiency - workers are outperforming expectations`,
      stepId: fastestStep.stepId,
    });
  }

  // 3. Worker efficiency insight - find underperforming workers
  const underperformingWorkers: { worker: typeof workersByStep extends Map<number, (infer T)[]> ? T : never; stepName: string }[] = [];
  for (const step of steps) {
    const workers = workersByStep.get(step.stepId) || [];
    for (const worker of workers) {
      if (worker.efficiency !== null && worker.efficiency < worker.expectedEfficiency * 0.8) {
        underperformingWorkers.push({ worker, stepName: step.stepName });
      }
    }
  }

  if (underperformingWorkers.length > 0) {
    const workerDescriptions = underperformingWorkers
      .slice(0, 3)
      .map(({ worker, stepName }) =>
        `${worker.workerName}: ${worker.efficiency}% efficiency on ${stepName} (expected ${worker.expectedEfficiency}% at L${worker.proficiencyLevel ?? 3})`
      );

    factors.push({
      type: 'worker_efficiency',
      impact: 'negative',
      severity: Math.min(10, underperformingWorkers.length * 2),
      title: `${underperformingWorkers.length} worker${underperformingWorkers.length > 1 ? 's' : ''} performing below expected levels`,
      description: workerDescriptions.join('\n'),
    });
  }

  // 4. Hours deficit insight
  if (totalHoursNeeded > 0 && daysAheadOrBehind < 0) {
    const hoursDeficit = Math.abs(daysAheadOrBehind) * 8; // Rough estimate
    factors.push({
      type: 'hours_deficit',
      impact: 'negative',
      severity: Math.min(10, Math.ceil(Math.abs(daysAheadOrBehind) / 2)),
      title: `${Math.round(totalHoursNeeded)} hours of work remaining`,
      description: `${Math.round(totalHoursWorked)} hrs worked | ${Math.round(totalHoursNeeded)} hrs needed to complete\n${Math.abs(daysAheadOrBehind)} days behind pace`,
    });
    suggestions.push(`Add ~${Math.round(hoursDeficit)} hours of overtime to get back on track`);
  }

  // Sort factors by severity (highest first)
  factors.sort((a, b) => b.severity - a.severity);

  return Response.json({
    order: {
      id: orderRow.id,
      productName: orderRow.product_name,
      quantity: orderRow.quantity,
      dueDate: orderRow.due_date,
      status: orderRow.status,
      startDate: orderRow.start_date,
    },
    summary: {
      estimatedCompletionDate,
      daysUntilDue,
      isOnTrack,
      daysAheadOrBehind,
      overallEfficiency,
      totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
      totalHoursNeeded: Math.round(totalHoursNeeded * 100) / 100,
    },
    insights: {
      overallStatus,
      factors,
      suggestions,
    },
    steps,
  });
}

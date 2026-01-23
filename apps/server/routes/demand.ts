/**
 * Demand Pool API Routes
 * Manages the global demand pool
 */

import { db } from "../db";
import {
  getDemandEntries,
  getDemandEntry,
  createDemandEntry,
  createDemandEntriesBatch,
  updateDemandEntry,
  deleteDemandEntry,
  getDemandSummary,
  getPlanableDemand,
} from "../services/demand/demand-pool";
import {
  syncSalesOrdersToDemand,
  syncWorkOrdersToDemand,
  syncSOToDemand,
  getSyncHistory,
} from "../services/demand/demand-sync";
import { getSOItems, getFishbowlSO } from "../services/fishbowl/order-service";

export async function handleDemand(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/demand - list demand entries
  if (url.pathname === "/api/demand" && request.method === "GET") {
    const status = url.searchParams.get("status");
    const bomId = url.searchParams.get("bom_id");
    const soId = url.searchParams.get("so_id");
    const dueBefore = url.searchParams.get("due_before");
    const dueAfter = url.searchParams.get("due_after");
    const search = url.searchParams.get("search");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const orderBy = url.searchParams.get("order_by") as "due_date" | "priority" | "created_at" | undefined;
    const orderDir = url.searchParams.get("order_dir") as "asc" | "desc" | undefined;

    const { entries, total } = await getDemandEntries(db, {
      status: status ? (status.split(",") as any[]) : undefined,
      fishbowl_bom_id: bomId ? parseInt(bomId) : undefined,
      fishbowl_so_id: soId ? parseInt(soId) : undefined,
      due_before: dueBefore || undefined,
      due_after: dueAfter || undefined,
      search: search || undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      order_by: orderBy,
      order_dir: orderDir,
    });

    return Response.json({ entries, total });
  }

  // POST /api/demand - create new demand entry
  if (url.pathname === "/api/demand" && request.method === "POST") {
    const body = await request.json() as any;

    if (!body.fishbowl_bom_id || !body.fishbowl_bom_num || !body.quantity || !body.due_date) {
      return Response.json(
        { error: "Missing required fields: fishbowl_bom_id, fishbowl_bom_num, quantity, due_date" },
        { status: 400 }
      );
    }

    const entry = await createDemandEntry(db, {
      source: "manual",
      fishbowl_bom_id: body.fishbowl_bom_id,
      fishbowl_bom_num: body.fishbowl_bom_num,
      quantity: body.quantity,
      due_date: body.due_date,
      target_completion_date: body.target_completion_date,
      priority: body.priority,
      customer_name: body.customer_name,
      notes: body.notes,
      color: body.color,
      production_hold_until: body.production_hold_until,
      production_hold_reason: body.production_hold_reason,
    });

    return Response.json(entry, { status: 201 });
  }

  // GET /api/demand/summary
  if (url.pathname === "/api/demand/summary" && request.method === "GET") {
    const summary = await getDemandSummary(db);
    return Response.json(summary);
  }

  // GET /api/demand/planable
  if (url.pathname === "/api/demand/planable" && request.method === "GET") {
    const entries = await getPlanableDemand(db);
    return Response.json({ entries });
  }

  // GET /api/demand/sync-history
  if (url.pathname === "/api/demand/sync-history" && request.method === "GET") {
    const limit = url.searchParams.get("limit");
    const history = await getSyncHistory(db, limit ? parseInt(limit) : undefined);
    return Response.json({ history });
  }

  // POST /api/demand/batch
  if (url.pathname === "/api/demand/batch" && request.method === "POST") {
    const body = await request.json() as any;

    if (!Array.isArray(body.entries)) {
      return Response.json({ error: "Expected entries array" }, { status: 400 });
    }

    const entries = await createDemandEntriesBatch(db, body.entries);
    return Response.json({ entries, count: entries.length }, { status: 201 });
  }

  // POST /api/demand/sync/sales-orders
  if (url.pathname === "/api/demand/sync/sales-orders" && request.method === "POST") {
    const body = await request.json().catch(() => ({})) as any;

    const result = await syncSalesOrdersToDemand(db, {
      openOnly: body.open_only ?? true,
      customerId: body.customer_id,
      dateFrom: body.date_from,
      unfullfilledOnly: body.unfullfilled_only ?? true,
    });

    return Response.json(result);
  }

  // POST /api/demand/sync/work-orders
  if (url.pathname === "/api/demand/sync/work-orders" && request.method === "POST") {
    const body = await request.json().catch(() => ({})) as any;

    const result = await syncWorkOrdersToDemand(db, {
      status: body.status,
      dateFrom: body.date_from,
    });

    return Response.json(result);
  }

  // POST /api/demand/sync/sales-order/:soId - sync a single SO by ID (fetches details automatically)
  const syncSalesOrderMatch = url.pathname.match(/^\/api\/demand\/sync\/sales-order\/(\d+)$/);
  if (syncSalesOrderMatch && request.method === "POST") {
    const soId = parseInt(syncSalesOrderMatch[1]!);

    try {
      // Fetch SO details from Fishbowl
      const so = await getFishbowlSO(soId);
      if (!so) {
        return Response.json({ error: "Sales order not found" }, { status: 404 });
      }

      const items = await getSOItems(soId);
      const result = await syncSOToDemand(db, soId, so.num, items, so.customerName || undefined);

      return Response.json(result);
    } catch (error) {
      console.error("Failed to sync SO:", error);
      return Response.json({ error: "Failed to sync sales order", errors: [String(error)] }, { status: 500 });
    }
  }

  // POST /api/demand/sync/so/:soId (legacy - requires so_num in body)
  const syncSoMatch = url.pathname.match(/^\/api\/demand\/sync\/so\/(\d+)$/);
  if (syncSoMatch && request.method === "POST") {
    const soId = parseInt(syncSoMatch[1]!);
    const body = await request.json() as any;

    if (!body.so_num) {
      return Response.json({ error: "Missing so_num" }, { status: 400 });
    }

    const items = await getSOItems(soId);
    const result = await syncSOToDemand(db, soId, body.so_num, items, body.customer_name);

    return Response.json(result);
  }

  // GET /api/orders/:id/detail - detailed order view with production history
  const orderDetailMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/detail$/);
  if (orderDetailMatch && request.method === "GET") {
    const orderId = parseInt(orderDetailMatch[1]!);
    const entry = await getDemandEntry(db, orderId);

    if (!entry) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    // Get production history for this BOM
    const historyResult = await db.execute({
      sql: `
        SELECT
          step_name,
          worker_id,
          worker_name,
          SUM(units_produced) as total_units,
          SUM(actual_seconds) as total_seconds,
          SUM(expected_seconds) as total_expected,
          AVG(efficiency_percent) as avg_efficiency
        FROM production_history
        WHERE fishbowl_bom_num = ?
        GROUP BY step_name, worker_id, worker_name
        ORDER BY step_name, total_units DESC
      `,
      args: [entry.fishbowl_bom_num]
    });
    const history = historyResult.rows as any[];

    // Aggregate by step
    const stepMap = new Map<string, {
      stepName: string;
      completedUnits: number;
      totalSeconds: number;
      totalExpected: number;
      workers: { workerId: number; workerName: string; unitsProduced: number; hoursWorked: number; efficiency: number | null }[];
    }>();

    for (const row of history) {
      const existing = stepMap.get(row.step_name) || {
        stepName: row.step_name,
        completedUnits: 0,
        totalSeconds: 0,
        totalExpected: 0,
        workers: [],
      };
      existing.completedUnits += Number(row.total_units) || 0;
      existing.totalSeconds += Number(row.total_seconds) || 0;
      existing.totalExpected += Number(row.total_expected) || 0;
      existing.workers.push({
        workerId: row.worker_id,
        workerName: row.worker_name,
        unitsProduced: Number(row.total_units) || 0,
        hoursWorked: (Number(row.total_seconds) || 0) / 3600,
        efficiency: row.avg_efficiency ? Math.round(Number(row.avg_efficiency)) : null,
      });
      stepMap.set(row.step_name, existing);
    }

    const steps = Array.from(stepMap.values()).map((step, idx) => {
      const avgSecondsPerPiece = step.completedUnits > 0 ? step.totalSeconds / step.completedUnits : null;
      const expectedSecondsPerPiece = step.completedUnits > 0 ? step.totalExpected / step.completedUnits : 60;
      const efficiency = avgSecondsPerPiece && expectedSecondsPerPiece ? Math.round((expectedSecondsPerPiece / avgSecondsPerPiece) * 100) : null;

      return {
        stepId: idx + 1,
        stepName: step.stepName,
        sequence: idx + 1,
        completedUnits: step.completedUnits,
        totalUnits: entry.quantity,
        progressPercent: Math.min(100, Math.round((step.completedUnits / entry.quantity) * 100)),
        expectedSecondsPerPiece: Math.round(expectedSecondsPerPiece),
        actualSecondsPerPiece: avgSecondsPerPiece ? Math.round(avgSecondsPerPiece) : null,
        efficiency,
        hoursWorked: step.totalSeconds / 3600,
        hoursRemaining: Math.max(0, ((entry.quantity - step.completedUnits) * expectedSecondsPerPiece) / 3600),
        isBottleneck: efficiency !== null && efficiency < 80,
        workers: step.workers.map(w => ({
          ...w,
          proficiencyLevel: w.efficiency ? Math.min(5, Math.max(1, Math.round(w.efficiency / 25))) : null,
        })),
      };
    });

    // Calculate summary
    const totalHoursWorked = steps.reduce((sum, s) => sum + s.hoursWorked, 0);
    const totalHoursRemaining = steps.reduce((sum, s) => sum + s.hoursRemaining, 0);
    const avgEfficiency = steps.length > 0
      ? Math.round(steps.filter(s => s.efficiency).reduce((sum, s) => sum + (s.efficiency || 0), 0) / steps.filter(s => s.efficiency).length)
      : null;

    const today = new Date();
    const dueDate = new Date(entry.due_date);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Estimate completion based on current pace
    const progressPercent = entry.quantity > 0 ? (entry.quantity_completed / entry.quantity) * 100 : 0;
    const isOnTrack = progressPercent >= 90 || daysUntilDue > 3;

    return Response.json({
      order: {
        id: entry.id,
        productName: entry.fishbowl_bom_num,
        quantity: entry.quantity,
        dueDate: entry.due_date,
        status: entry.status,
        startDate: entry.created_at,
      },
      summary: {
        estimatedCompletionDate: entry.due_date,
        daysUntilDue,
        isOnTrack,
        daysAheadOrBehind: isOnTrack ? 1 : -1,
        overallEfficiency: avgEfficiency,
        totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
        totalHoursNeeded: Math.round((totalHoursWorked + totalHoursRemaining) * 10) / 10,
      },
      insights: {
        overallStatus: isOnTrack ? 'on_track' : 'behind',
        factors: steps.filter(s => s.isBottleneck).map(s => ({
          type: 'bottleneck_step' as const,
          impact: 'negative' as const,
          severity: 2,
          title: `${s.stepName} running slow`,
          description: `Efficiency at ${s.efficiency}%`,
          stepId: s.stepId,
        })),
        suggestions: progressPercent < 100 ? ['Continue production to meet deadline'] : ['Order nearly complete'],
      },
      steps,
    });
  }

  // GET /api/demand/:id
  const demandIdMatch = url.pathname.match(/^\/api\/demand\/(\d+)$/);
  if (demandIdMatch && request.method === "GET") {
    const id = parseInt(demandIdMatch[1]!);
    const entry = await getDemandEntry(db, id);

    if (!entry) {
      return Response.json({ error: "Demand entry not found" }, { status: 404 });
    }

    return Response.json(entry);
  }

  // PATCH /api/demand/:id
  if (demandIdMatch && request.method === "PATCH") {
    const id = parseInt(demandIdMatch[1]!);
    const body = await request.json() as any;

    const entry = await updateDemandEntry(db, id, {
      quantity: body.quantity,
      due_date: body.due_date,
      target_completion_date: body.target_completion_date,
      priority: body.priority,
      customer_name: body.customer_name,
      notes: body.notes,
      status: body.status,
      quantity_completed: body.quantity_completed,
      step_config_id: body.step_config_id,
      color: body.color,
      production_hold_until: body.production_hold_until,
      production_hold_reason: body.production_hold_reason,
    });

    if (!entry) {
      return Response.json({ error: "Demand entry not found" }, { status: 404 });
    }

    return Response.json(entry);
  }

  // DELETE /api/demand/:id
  if (demandIdMatch && request.method === "DELETE") {
    const id = parseInt(demandIdMatch[1]!);
    const deleted = await deleteDemandEntry(db, id);

    if (!deleted) {
      return Response.json({ error: "Demand entry not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  return null;
}

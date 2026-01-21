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

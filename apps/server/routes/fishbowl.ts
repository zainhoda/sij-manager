/**
 * Fishbowl Integration API Routes
 * Provides endpoints to browse and link Fishbowl data
 */

import { db, isFishbowlConfigured, testFishbowlConnection } from "../db";
import {
  getFishbowlBOMs,
  getFishbowlBOMWithItems,
  getFishbowlBOMByNum,
  getBOMInstructions,
  syncBOMsToCache,
  getBOMSyncStatus,
  countFishbowlBOMs,
  getFishbowlSalesOrders,
  getFishbowlSOWithItems,
  getFishbowlSOByNum,
  getFishbowlWorkOrders,
  getFishbowlWO,
  getFishbowlWOByNum,
  getOrderChain,
  getOnHandForBOM,
  clearInventoryCache,
} from "../services/fishbowl";

export async function handleFishbowl(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // Check if Fishbowl is configured
  if (!url.pathname.startsWith("/api/fishbowl")) {
    return null;
  }

  // GET /api/fishbowl/status - Check Fishbowl connection status
  if (url.pathname === "/api/fishbowl/status" && request.method === "GET") {
    const configured = isFishbowlConfigured();
    if (!configured) {
      return Response.json({
        configured: false,
        connected: false,
        message: "Fishbowl connection not configured. Set FISHBOWL_* environment variables.",
      });
    }

    const status = await testFishbowlConnection();
    return Response.json({
      configured: true,
      ...status,
    });
  }

  // All other routes require Fishbowl to be configured
  if (!isFishbowlConfigured()) {
    return Response.json(
      { error: "Fishbowl connection not configured" },
      { status: 503 }
    );
  }

  // ============== BOM Routes ==============

  // GET /api/fishbowl/boms - List BOMs
  if (url.pathname === "/api/fishbowl/boms" && request.method === "GET") {
    const search = url.searchParams.get("search") || undefined;
    const active = url.searchParams.get("active");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const [boms, total] = await Promise.all([
      getFishbowlBOMs({
        search,
        active: active === "true" ? true : active === "false" ? false : undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      }),
      countFishbowlBOMs({
        search,
        active: active === "true" ? true : active === "false" ? false : undefined,
      }),
    ]);

    return Response.json({ boms, total });
  }

  // GET /api/fishbowl/boms/:id - Get single BOM with items
  const bomIdMatch = url.pathname.match(/^\/api\/fishbowl\/boms\/(\d+)$/);
  if (bomIdMatch && request.method === "GET") {
    const bomId = parseInt(bomIdMatch[1]!);
    const result = await getFishbowlBOMWithItems(bomId);

    if (!result) {
      return Response.json({ error: "BOM not found" }, { status: 404 });
    }

    // Check if this BOM has step configurations defined
    const stepConfigs = await db.execute({
      sql: "SELECT id, config_name, is_default FROM bom_step_configurations WHERE fishbowl_bom_id = ?",
      args: [bomId],
    });

    return Response.json({
      ...result,
      stepConfigurations: stepConfigs.rows,
    });
  }

  // GET /api/fishbowl/boms/:id/instructions - Get BOM work instructions
  const bomInstructionsMatch = url.pathname.match(/^\/api\/fishbowl\/boms\/(\d+)\/instructions$/);
  if (bomInstructionsMatch && request.method === "GET") {
    const bomId = parseInt(bomInstructionsMatch[1]!);
    const instructions = await getBOMInstructions(bomId);
    return Response.json({ instructions });
  }

  // GET /api/fishbowl/boms/:bomNum/inventory - Get on-hand inventory for a BOM
  const bomInventoryMatch = url.pathname.match(/^\/api\/fishbowl\/boms\/([^/]+)\/inventory$/);
  if (bomInventoryMatch && request.method === "GET") {
    const bomNum = decodeURIComponent(bomInventoryMatch[1]!);
    const inventory = await getOnHandForBOM(bomNum);
    return Response.json({
      bomNum,
      onHandQty: inventory.onHandQty,
      cartonQty: inventory.cartonQty,
    });
  }

  // POST /api/fishbowl/inventory/refresh - Clear inventory cache
  if (url.pathname === "/api/fishbowl/inventory/refresh" && request.method === "POST") {
    clearInventoryCache();
    return Response.json({ success: true, message: "Inventory cache cleared" });
  }

  // ============== Sales Order Routes ==============

  // GET /api/fishbowl/sales-orders - List Sales Orders
  // By default, only returns SOs with at least one manufacturable item (has BOM)
  if (url.pathname === "/api/fishbowl/sales-orders" && request.method === "GET") {
    const status = url.searchParams.get("status") as "open" | "in_progress" | "fulfilled" | "all" | null;
    const customerId = url.searchParams.get("customerId");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const hasBOM = url.searchParams.get("hasBOM"); // defaults to true

    const orders = await getFishbowlSalesOrders({
      status: status || "open",
      customerId: customerId ? parseInt(customerId) : undefined,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
      hasBOM: hasBOM === "false" ? false : true, // default to true
    });

    return Response.json({ orders, filtered: hasBOM !== "false" });
  }

  // GET /api/fishbowl/sales-orders/:id - Get single SO with items
  const soIdMatch = url.pathname.match(/^\/api\/fishbowl\/sales-orders\/(\d+)$/);
  if (soIdMatch && request.method === "GET") {
    const soId = parseInt(soIdMatch[1]!);
    const result = await getFishbowlSOWithItems(soId);

    if (!result) {
      return Response.json({ error: "Sales Order not found" }, { status: 404 });
    }

    // Check if any items are already imported as demand entries
    const importedOrders = await db.execute({
      sql: "SELECT id, quantity, due_date, status, fishbowl_so_id FROM demand_entries WHERE fishbowl_so_id = ? AND source = 'fishbowl_so'",
      args: [soId],
    });

    return Response.json({
      ...result,
      importedOrders: importedOrders.rows,
    });
  }

  // POST /api/fishbowl/sales-orders/:id/import - Import SO as demand entry
  const soImportMatch = url.pathname.match(/^\/api\/fishbowl\/sales-orders\/(\d+)\/import$/);
  if (soImportMatch && request.method === "POST") {
    const soId = parseInt(soImportMatch[1]!);
    const body = await request.json() as {
      fishbowlBomId: number;
      fishbowlBomNum: string;
      quantity?: number;
      dueDate: string;
      stepConfigId?: number;
    };

    // Validate required fields
    if (!body.fishbowlBomId || !body.fishbowlBomNum) {
      return Response.json({ error: "fishbowlBomId and fishbowlBomNum are required" }, { status: 400 });
    }

    // Get the SO
    const soResult = await getFishbowlSOWithItems(soId);
    if (!soResult) {
      return Response.json({ error: "Sales Order not found" }, { status: 404 });
    }

    // Get default step config for this BOM if not provided
    let stepConfigId = body.stepConfigId;
    if (!stepConfigId) {
      const stepConfig = await db.execute({
        sql: "SELECT id FROM bom_step_configurations WHERE fishbowl_bom_id = ? AND is_default = 1",
        args: [body.fishbowlBomId],
      });
      stepConfigId = stepConfig.rows[0] ? (stepConfig.rows[0] as unknown as { id: number }).id : undefined;
    }

    const quantity = body.quantity || soResult.items[0]?.qtyOrdered || 1;
    const dueDate = body.dueDate;

    // Create demand entry
    const result = await db.execute({
      sql: `INSERT INTO demand_entries (
              source, fishbowl_so_id, fishbowl_so_num,
              fishbowl_bom_id, fishbowl_bom_num, step_config_id,
              quantity, due_date, target_completion_date, status
            )
            VALUES ('fishbowl_so', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      args: [
        soId,
        soResult.so.num,
        body.fishbowlBomId,
        body.fishbowlBomNum,
        stepConfigId || null,
        quantity,
        dueDate,
        dueDate,
      ],
    });

    const orderId = Number(result.lastInsertRowid);

    // Get created demand entry
    const order = await db.execute({
      sql: "SELECT * FROM demand_entries WHERE id = ?",
      args: [orderId],
    });

    return Response.json({
      success: true,
      order: order.rows[0],
      so: soResult.so,
    });
  }

  // ============== Work Order Routes ==============

  // GET /api/fishbowl/work-orders - List Work Orders
  if (url.pathname === "/api/fishbowl/work-orders" && request.method === "GET") {
    const moId = url.searchParams.get("moId");
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const orders = await getFishbowlWorkOrders({
      moId: moId ? parseInt(moId) : undefined,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
    });

    return Response.json({ orders });
  }

  // GET /api/fishbowl/work-orders/:id - Get single WO
  const woIdMatch = url.pathname.match(/^\/api\/fishbowl\/work-orders\/(\d+)$/);
  if (woIdMatch && request.method === "GET") {
    const woId = parseInt(woIdMatch[1]!);
    const wo = await getFishbowlWO(woId);

    if (!wo) {
      return Response.json({ error: "Work Order not found" }, { status: 404 });
    }

    // Check if linked to a sij-manager demand entry
    const linkedOrder = await db.execute({
      sql: "SELECT id, fishbowl_bom_id, quantity, status FROM demand_entries WHERE fishbowl_wo_id = ? AND source = 'fishbowl_wo'",
      args: [woId],
    });

    return Response.json({
      wo,
      linkedOrder: linkedOrder.rows[0] || null,
    });
  }

  // POST /api/fishbowl/work-orders/:id/link - Link WO to existing order
  const woLinkMatch = url.pathname.match(/^\/api\/fishbowl\/work-orders\/(\d+)\/link$/);
  if (woLinkMatch && request.method === "POST") {
    const woId = parseInt(woLinkMatch[1]!);
    const body = await request.json() as { orderId: number };

    // Get the WO
    const wo = await getFishbowlWO(woId);
    if (!wo) {
      return Response.json({ error: "Work Order not found" }, { status: 404 });
    }

    // Validate demand entry exists
    const order = await db.execute({
      sql: "SELECT id, fishbowl_wo_id FROM demand_entries WHERE id = ?",
      args: [body.orderId],
    });
    if (order.rows.length === 0) {
      return Response.json({ error: "Demand entry not found" }, { status: 404 });
    }

    const existingOrder = order.rows[0] as unknown as { id: number; fishbowl_wo_id: number | null };
    if (existingOrder.fishbowl_wo_id) {
      return Response.json(
        { error: "Demand entry already linked to a Work Order" },
        { status: 409 }
      );
    }

    // Update demand entry with WO link
    await db.execute({
      sql: `UPDATE demand_entries
            SET fishbowl_wo_id = ?, fishbowl_wo_num = ?, quantity = ?
            WHERE id = ?`,
      args: [woId, wo.num, wo.qtyTarget, body.orderId],
    });

    // Get updated demand entry
    const updatedOrder = await db.execute({
      sql: "SELECT * FROM demand_entries WHERE id = ?",
      args: [body.orderId],
    });

    return Response.json({
      success: true,
      order: updatedOrder.rows[0],
      wo,
    });
  }

  // GET /api/fishbowl/order-chain/:soId - Get full SO -> MO -> WO chain
  const chainMatch = url.pathname.match(/^\/api\/fishbowl\/order-chain\/(\d+)$/);
  if (chainMatch && request.method === "GET") {
    const soId = parseInt(chainMatch[1]!);
    const chain = await getOrderChain(soId);
    return Response.json(chain);
  }

  // ============== Sync Routes ==============

  // POST /api/fishbowl/sync - Trigger BOM sync
  if (url.pathname === "/api/fishbowl/sync" && request.method === "POST") {
    const body = await request.json() as { fullSync?: boolean; bomIds?: number[] };

    const result = await syncBOMsToCache({
      fullSync: body.fullSync,
      bomIds: body.bomIds,
    });

    return Response.json(result);
  }

  // GET /api/fishbowl/sync/status - Get sync status
  if (url.pathname === "/api/fishbowl/sync/status" && request.method === "GET") {
    const status = await getBOMSyncStatus();
    return Response.json(status);
  }

  return null;
}

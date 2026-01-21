/**
 * Demand Sync Service
 * Syncs demand from Fishbowl Sales Orders and Work Orders into the demand pool
 */

import type { Client } from "@libsql/client";
import { isFishbowlConfigured } from "../../db/fishbowl";
import {
  getFishbowlSalesOrders,
  getSOItems,
  getFishbowlWorkOrders,
} from "../fishbowl/order-service";
import { getBOMForProductNum, getBOMForWorkOrder } from "../fishbowl/bom-service";
import {
  createDemandEntry,
  isDemandExistsForSOItem,
  isDemandExistsForWO,
  type CreateDemandInput,
} from "./demand-pool";
import type { FishbowlSOItem } from "../fishbowl/types";

export interface SyncResult {
  success: boolean;
  source: "fishbowl_so" | "fishbowl_wo";
  entriesCreated: number;
  entriesSkipped: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

export interface SOSyncOptions {
  // Only sync open/in-progress orders
  openOnly?: boolean;
  // Only sync orders from specific customer
  customerId?: number;
  // Only sync orders created after this date
  dateFrom?: string;
  // Only sync orders with remaining quantity
  unfullfilledOnly?: boolean;
}

export interface WOSyncOptions {
  // Only sync work orders with specific status
  status?: number;
  // Only sync WOs created after this date
  dateFrom?: string;
}


/**
 * Sync Sales Orders from Fishbowl into the demand pool
 */
export async function syncSalesOrdersToDemand(
  db: Client,
  options: SOSyncOptions = {}
): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let entriesCreated = 0;
  let entriesSkipped = 0;

  if (!isFishbowlConfigured()) {
    return {
      success: false,
      source: "fishbowl_so",
      entriesCreated: 0,
      entriesSkipped: 0,
      errors: ["Fishbowl connection not configured"],
      startedAt,
      completedAt: new Date(),
    };
  }

  try {
    // Fetch sales orders from Fishbowl
    const salesOrders = await getFishbowlSalesOrders({
      status: options.openOnly ? "open" : "all",
      customerId: options.customerId,
      dateFrom: options.dateFrom,
      limit: 500,
    });

    for (const so of salesOrders) {
      try {
        // Get SO items
        const items = await getSOItems(so.id);

        for (const item of items) {
          // Skip if no quantity to fulfill
          if (options.unfullfilledOnly && item.qtyToFulfill <= 0) {
            entriesSkipped++;
            continue;
          }

          // Check if already synced
          const exists = await isDemandExistsForSOItem(db, so.id, item.id);
          if (exists) {
            entriesSkipped++;
            continue;
          }

          // Find the BOM for this product
          const productNum = item.productNum || `PRODUCT-${item.productId}`;
          const bom = await getBOMForProductNum(productNum);

          if (!bom) {
            // No BOM means this item is outsourced/purchased, not manufactured in-house
            // This is expected behavior, not an error
            entriesSkipped++;
            continue;
          }

          // Create demand entry - prefer line item due date, fall back to SO issued date
          const itemDueDate = item.dateScheduledFulfillment
            ? new Date(item.dateScheduledFulfillment).toISOString().split("T")[0]!
            : so.dateIssued
              ? new Date(so.dateIssued).toISOString().split("T")[0]!
              : new Date().toISOString().split("T")[0]!;

          const demandInput: CreateDemandInput = {
            source: "fishbowl_so",
            fishbowl_so_id: so.id,
            fishbowl_so_num: so.num,
            fishbowl_so_item_id: item.id,
            fishbowl_bom_id: bom.id,
            fishbowl_bom_num: bom.num,
            quantity: Math.ceil(item.qtyToFulfill),
            due_date: itemDueDate,
            customer_name: so.customerName || undefined,
            notes: item.description || undefined,
            priority: 3, // Default priority (1=urgent, 3=normal, 5=low)
          };

          await createDemandEntry(db, demandInput);
          entriesCreated++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`SO ${so.num}: ${message}`);
      }
    }

    // Log sync
    await logSync(db, "fishbowl_so", entriesCreated, errors);

    return {
      success: errors.length === 0,
      source: "fishbowl_so",
      entriesCreated,
      entriesSkipped,
      errors,
      startedAt,
      completedAt: new Date(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      success: false,
      source: "fishbowl_so",
      entriesCreated,
      entriesSkipped,
      errors,
      startedAt,
      completedAt: new Date(),
    };
  }
}

/**
 * Sync Work Orders from Fishbowl into the demand pool
 */
export async function syncWorkOrdersToDemand(
  db: Client,
  options: WOSyncOptions = {}
): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let entriesCreated = 0;
  let entriesSkipped = 0;

  if (!isFishbowlConfigured()) {
    return {
      success: false,
      source: "fishbowl_wo",
      entriesCreated: 0,
      entriesSkipped: 0,
      errors: ["Fishbowl connection not configured"],
      startedAt,
      completedAt: new Date(),
    };
  }

  try {
    // Fetch work orders from Fishbowl
    const workOrders = await getFishbowlWorkOrders({
      status: options.status,
      dateFrom: options.dateFrom,
      limit: 500,
    });

    for (const wo of workOrders) {
      try {
        // Check if already synced
        const exists = await isDemandExistsForWO(db, wo.id);
        if (exists) {
          entriesSkipped++;
          continue;
        }

        // WO already has a quantity target
        if (wo.qtyTarget <= 0) {
          entriesSkipped++;
          continue;
        }

        // Get BOM from the WO's linked MO item
        // Chain: WO -> moItemId -> MOItem -> bomId -> BOM (or partId -> Part -> BOM)
        const bom = await getBOMForWorkOrder(wo.id);

        if (!bom) {
          // No BOM means this WO doesn't have manufacturing steps defined
          entriesSkipped++;
          continue;
        }

        const demandInput: CreateDemandInput = {
          source: "fishbowl_wo",
          fishbowl_wo_id: wo.id,
          fishbowl_wo_num: wo.num,
          fishbowl_bom_id: bom.id,
          fishbowl_bom_num: bom.num,
          quantity: wo.qtyTarget,
          due_date: wo.dateScheduled
            ? new Date(wo.dateScheduled).toISOString().split("T")[0]!
            : new Date().toISOString().split("T")[0]!,
          priority: 3,
        };

        await createDemandEntry(db, demandInput);
        entriesCreated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`WO ${wo.num}: ${message}`);
      }
    }

    // Log sync
    await logSync(db, "fishbowl_wo", entriesCreated, errors);

    return {
      success: errors.length === 0,
      source: "fishbowl_wo",
      entriesCreated,
      entriesSkipped,
      errors,
      startedAt,
      completedAt: new Date(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      success: false,
      source: "fishbowl_wo",
      entriesCreated,
      entriesSkipped,
      errors,
      startedAt,
      completedAt: new Date(),
    };
  }
}

/**
 * Sync a specific Sales Order into demand
 */
export async function syncSOToDemand(
  db: Client,
  soId: number,
  soNum: string,
  items: FishbowlSOItem[],
  customerName?: string
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    // Skip if no quantity to fulfill
    if (item.qtyToFulfill <= 0) {
      skipped++;
      continue;
    }

    // Check if already synced
    const exists = await isDemandExistsForSOItem(db, soId, item.id);
    if (exists) {
      skipped++;
      continue;
    }

    // Find the BOM for this product
    const productNum = item.productNum || `PRODUCT-${item.productId}`;
    const bom = await getBOMForProductNum(productNum);

    if (!bom) {
      // No BOM means this item is outsourced/purchased, not manufactured in-house
      // This is expected behavior, not an error
      skipped++;
      continue;
    }

    // Prefer line item due date, fall back to today
    const itemDueDate = item.dateScheduledFulfillment
      ? new Date(item.dateScheduledFulfillment).toISOString().split("T")[0]!
      : new Date().toISOString().split("T")[0]!;

    const demandInput: CreateDemandInput = {
      source: "fishbowl_so",
      fishbowl_so_id: soId,
      fishbowl_so_num: soNum,
      fishbowl_so_item_id: item.id,
      fishbowl_bom_id: bom.id,
      fishbowl_bom_num: bom.num,
      quantity: Math.ceil(item.qtyToFulfill),
      due_date: itemDueDate,
      customer_name: customerName,
      notes: item.description || undefined,
      priority: 3,
    };

    await createDemandEntry(db, demandInput);
    created++;
  }

  return { created, skipped, errors };
}

/**
 * Log sync to fishbowl_sync_log
 */
async function logSync(
  db: Client,
  entityType: string,
  recordsSynced: number,
  errors: string[]
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO fishbowl_sync_log (entity_type, action, records_synced, started_at, completed_at, error)
      VALUES (?, 'sync_to_demand', ?, ?, ?, ?)
    `,
    args: [
      entityType,
      recordsSynced,
      now,
      now,
      errors.length > 0 ? errors.join("; ") : null,
    ],
  });
}

/**
 * Get sync history
 */
export async function getSyncHistory(
  db: Client,
  limit: number = 20
): Promise<
  {
    id: number;
    entity_type: string;
    action: string;
    records_synced: number;
    started_at: string;
    completed_at: string;
    error: string | null;
  }[]
> {
  const result = await db.execute({
    sql: `
      SELECT * FROM fishbowl_sync_log
      WHERE action = 'sync_to_demand'
      ORDER BY started_at DESC
      LIMIT ?
    `,
    args: [limit],
  });
  return result.rows as unknown as {
    id: number;
    entity_type: string;
    action: string;
    records_synced: number;
    started_at: string;
    completed_at: string;
    error: string | null;
  }[];
}

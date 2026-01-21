/**
 * Fishbowl BOM (Bill of Materials) Service
 * Queries BOMs from Fishbowl MySQL database
 */

import type { RowDataPacket } from "mysql2/promise";
import { getFishbowl, isFishbowlConfigured } from "../../db/fishbowl";
import { db } from "../../db";
import type {
  FishbowlBOM,
  FishbowlBOMItem,
  FishbowlBOMInstruction,
  BOMQueryOptions,
  SyncResult,
} from "./types";

/**
 * Get list of BOMs from Fishbowl
 */
export async function getFishbowlBOMs(
  options: BOMQueryOptions = {}
): Promise<FishbowlBOM[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.active !== undefined) {
    conditions.push("b.activeFlag = ?");
    params.push(options.active ? 1 : 0);
  }

  if (options.search) {
    conditions.push("(b.num LIKE ? OR b.description LIKE ?)");
    params.push(`%${options.search}%`, `%${options.search}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";
  const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      b.id,
      b.num,
      b.description,
      b.revision,
      b.activeFlag,
      b.dateCreated,
      b.dateLastModified,
      b.configurable,
      b.estimatedDuration
    FROM bom b
    ${whereClause}
    ORDER BY b.num
    ${limitClause} ${offsetClause}`,
    params
  );

  return rows.map(mapRowToBOM);
}

/**
 * Get a single BOM by ID
 */
export async function getFishbowlBOM(
  bomId: number
): Promise<FishbowlBOM | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      b.id,
      b.num,
      b.description,
      b.revision,
      b.activeFlag,
      b.dateCreated,
      b.dateLastModified,
      b.configurable,
      b.estimatedDuration
    FROM bom b
    WHERE b.id = ?`,
    [bomId]
  );

  if (rows.length === 0) return null;
  return mapRowToBOM(rows[0]!);
}

/**
 * Get a BOM by its number
 */
export async function getFishbowlBOMByNum(
  bomNum: string
): Promise<FishbowlBOM | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      b.id,
      b.num,
      b.description,
      b.revision,
      b.activeFlag,
      b.dateCreated,
      b.dateLastModified,
      b.configurable,
      b.estimatedDuration
    FROM bom b
    WHERE b.num = ?`,
    [bomNum]
  );

  if (rows.length === 0) return null;
  return mapRowToBOM(rows[0]!);
}

/**
 * Get BOM items (components) for a BOM
 */
export async function getBOMItems(bomId: number): Promise<FishbowlBOMItem[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      bi.id,
      bi.bomId,
      bi.partId,
      bi.quantity,
      bi.typeId,
      bi.description,
      bi.sortIdConfig,
      p.num as partNum,
      p.description as partDescription
    FROM bomitem bi
    LEFT JOIN part p ON bi.partId = p.id
    WHERE bi.bomId = ?
    ORDER BY bi.sortIdConfig, bi.id`,
    [bomId]
  );

  return rows.map((row) => ({
    id: row.id as number,
    bomId: row.bomId as number,
    partId: row.partId as number,
    quantity: Number(row.quantity),
    typeId: row.typeId as number,
    description: row.description as string | null,
    sortOrder: row.sortIdConfig as number,
    partNum: row.partNum as string | undefined,
    partDescription: row.partDescription as string | undefined,
  }));
}

/**
 * Get BOM work instructions (bominstructionitem)
 * These are the actual labor steps for manufacturing
 */
export async function getBOMInstructions(bomId: number): Promise<FishbowlBOMInstruction[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      id,
      bomId,
      name,
      description,
      details,
      sortOrder,
      url
    FROM bominstructionitem
    WHERE bomId = ?
    ORDER BY sortOrder`,
    [bomId]
  );

  return rows.map((row) => ({
    id: row.id as number,
    bomId: row.bomId as number,
    name: row.name as string,
    description: row.description as string | null,
    details: row.details as string | null,
    sortOrder: row.sortOrder as number,
    url: row.url as string | null,
  }));
}

/**
 * Get BOM with its items
 */
export async function getFishbowlBOMWithItems(bomId: number): Promise<{
  bom: FishbowlBOM;
  items: FishbowlBOMItem[];
} | null> {
  const bom = await getFishbowlBOM(bomId);
  if (!bom) return null;

  const items = await getBOMItems(bomId);
  return { bom, items };
}

/**
 * Count total BOMs
 */
export async function countFishbowlBOMs(
  options: Pick<BOMQueryOptions, "active" | "search"> = {}
): Promise<number> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.active !== undefined) {
    conditions.push("activeFlag = ?");
    params.push(options.active ? 1 : 0);
  }

  if (options.search) {
    conditions.push("(num LIKE ? OR description LIKE ?)");
    params.push(`%${options.search}%`, `%${options.search}%`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM bom ${whereClause}`,
    params
  );

  return rows[0]?.count as number;
}

/**
 * Sync BOMs to local Turso cache
 */
export async function syncBOMsToCache(
  options: { bomIds?: number[]; fullSync?: boolean } = {}
): Promise<SyncResult> {
  const startedAt = new Date();
  const errors: string[] = [];
  let recordsSynced = 0;

  try {
    if (!isFishbowlConfigured()) {
      throw new Error("Fishbowl connection not configured");
    }

    // Log sync start
    await db.execute({
      sql: `INSERT INTO fishbowl_sync_log (entity_type, action, started_at)
            VALUES ('bom', ?, ?)`,
      args: [options.fullSync ? "full_sync" : "sync", startedAt.toISOString()],
    });

    // Get BOMs to sync
    let boms: FishbowlBOM[];
    if (options.bomIds && options.bomIds.length > 0) {
      // Sync specific BOMs
      boms = [];
      for (const bomId of options.bomIds) {
        const bom = await getFishbowlBOM(bomId);
        if (bom) boms.push(bom);
      }
    } else if (options.fullSync) {
      // Full sync - get all active BOMs
      boms = await getFishbowlBOMs({ active: true });
    } else {
      // Default - sync active BOMs
      boms = await getFishbowlBOMs({ active: true, limit: 500 });
    }

    // Clear cache if full sync
    if (options.fullSync) {
      await db.execute("DELETE FROM fishbowl_bomitem_cache");
      await db.execute("DELETE FROM fishbowl_bom_cache");
    }

    // Upsert BOMs to cache
    for (const bom of boms) {
      try {
        await db.execute({
          sql: `INSERT OR REPLACE INTO fishbowl_bom_cache
                (id, num, description, revision, active_flag, cached_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [
            bom.id,
            bom.num,
            bom.description,
            bom.revision,
            bom.activeFlag ? 1 : 0,
          ],
        });

        // Sync BOM items
        const items = await getBOMItems(bom.id);

        // Delete existing items for this BOM
        await db.execute({
          sql: "DELETE FROM fishbowl_bomitem_cache WHERE bom_id = ?",
          args: [bom.id],
        });

        // Insert new items
        for (const item of items) {
          await db.execute({
            sql: `INSERT INTO fishbowl_bomitem_cache
                  (id, bom_id, part_id, part_num, part_description, quantity, type_id, cached_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            args: [
              item.id,
              item.bomId,
              item.partId,
              item.partNum || null,
              item.partDescription || null,
              item.quantity,
              item.typeId,
            ],
          });
        }

        recordsSynced++;
      } catch (err) {
        errors.push(
          `Failed to sync BOM ${bom.num}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const completedAt = new Date();

    // Update sync log
    await db.execute({
      sql: `UPDATE fishbowl_sync_log
            SET completed_at = ?, records_synced = ?, error = ?
            WHERE entity_type = 'bom' AND started_at = ?`,
      args: [
        completedAt.toISOString(),
        recordsSynced,
        errors.length > 0 ? errors.join("; ") : null,
        startedAt.toISOString(),
      ],
    });

    return {
      success: errors.length === 0,
      recordsSynced,
      errors,
      startedAt,
      completedAt,
    };
  } catch (err) {
    const completedAt = new Date();
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(errorMessage);

    return {
      success: false,
      recordsSynced,
      errors,
      startedAt,
      completedAt,
    };
  }
}

/**
 * Get cached BOMs from Turso
 */
export async function getCachedBOMs(): Promise<
  { id: number; num: string; description: string | null; revision: string | null }[]
> {
  const result = await db.execute(
    "SELECT id, num, description, revision FROM fishbowl_bom_cache ORDER BY num"
  );
  return result.rows as unknown as {
    id: number;
    num: string;
    description: string | null;
    revision: string | null;
  }[];
}

/**
 * Get sync status
 */
export async function getBOMSyncStatus(): Promise<{
  lastSync: string | null;
  cachedCount: number;
  lastError: string | null;
}> {
  const [lastSyncResult, countResult] = await Promise.all([
    db.execute(
      `SELECT completed_at, error FROM fishbowl_sync_log
       WHERE entity_type = 'bom' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 1`
    ),
    db.execute("SELECT COUNT(*) as count FROM fishbowl_bom_cache"),
  ]);

  const lastSyncRow = lastSyncResult.rows[0] as unknown as {
    completed_at: string;
    error: string | null;
  } | undefined;
  const countRow = countResult.rows[0] as unknown as { count: number };

  return {
    lastSync: lastSyncRow?.completed_at || null,
    cachedCount: countRow.count,
    lastError: lastSyncRow?.error || null,
  };
}

/**
 * Find BOM for a Work Order
 * Chain: WO -> moItemId -> MOItem -> bomId -> BOM
 */
export async function getBOMForWorkOrder(
  woId: number
): Promise<{ id: number; num: string } | null> {
  if (!isFishbowlConfigured()) {
    return null;
  }

  const pool = getFishbowl();

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT b.id, b.num
     FROM wo w
     JOIN moitem mi ON w.moItemId = mi.id
     JOIN bom b ON mi.bomId = b.id
     WHERE w.id = ?`,
    [woId]
  );

  if (rows.length > 0) {
    return { id: rows[0]!.id as number, num: rows[0]!.num as string };
  }

  return null;
}

/**
 * Find BOM for a product number
 * This looks up: Product -> Part -> BOM
 */
export async function getBOMForProductNum(
  productNum: string
): Promise<{ id: number; num: string } | null> {
  if (!isFishbowlConfigured()) {
    return null;
  }

  const pool = getFishbowl();

  // First try: Look up product -> part -> bom
  const [productRows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id, p.num, p.partId, pt.num as partNum
     FROM product p
     LEFT JOIN part pt ON p.partId = pt.id
     WHERE p.num = ?`,
    [productNum]
  );

  if (productRows.length > 0 && productRows[0]!.partNum) {
    // Found a product, look for BOM matching the part number
    const partNum = productRows[0]!.partNum as string;
    const bom = await getFishbowlBOMByNum(partNum);
    if (bom) {
      return { id: bom.id, num: bom.num };
    }
  }

  // Second try: Maybe the product number IS the BOM number
  const bomDirect = await getFishbowlBOMByNum(productNum);
  if (bomDirect) {
    return { id: bomDirect.id, num: bomDirect.num };
  }

  // Third try: Search BOMs with the product number (partial match)
  const boms = await getFishbowlBOMs({ search: productNum, active: true, limit: 1 });
  if (boms.length > 0) {
    const bom = boms[0]!;
    return { id: bom.id, num: bom.num };
  }

  return null;
}

// Helper to map MySQL row to FishbowlBOM
function mapRowToBOM(row: RowDataPacket): FishbowlBOM {
  return {
    id: row.id as number,
    num: row.num as string,
    description: row.description as string | null,
    revision: row.revision as string | null,
    activeFlag: Boolean(row.activeFlag),
    dateCreated: row.dateCreated as Date,
    dateLastModified: row.dateLastModified as Date,
    configurable: Boolean(row.configurable),
    estimatedDuration: row.estimatedDuration as number | null,
  };
}

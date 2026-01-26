/**
 * Fishbowl Inventory Service
 * Queries on-hand inventory from Fishbowl's tag table
 *
 * BOM number matches Part number, so: bom.num -> part.num -> tag.qty
 */

import type { RowDataPacket } from "mysql2/promise";
import { getFishbowl, isFishbowlConfigured } from "../../db/fishbowl";

// In-memory cache with TTL
interface CacheEntry {
  qty: number;
  cartonQty: number;
  timestamp: number;
}

export interface InventoryInfo {
  onHandQty: number;      // Total pieces on hand
  cartonQty: number;      // Pieces per carton (1 if sold individually)
}

const inventoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get on-hand inventory for a single BOM number
 * BOM numbers match part numbers in Fishbowl
 */
export async function getOnHandForBOM(bomNum: string): Promise<InventoryInfo> {
  const result = await getInventoryForBOMs([bomNum]);
  return result.get(bomNum) ?? { onHandQty: 0, cartonQty: 1 };
}

/**
 * Get on-hand inventory for multiple BOM numbers in a single query
 * Returns a Map of bomNum -> InventoryInfo (on-hand qty in pieces + carton size)
 */
export async function getInventoryForBOMs(bomNums: string[]): Promise<Map<string, InventoryInfo>> {
  if (!isFishbowlConfigured()) {
    // Return empty map if not configured
    return new Map();
  }

  if (bomNums.length === 0) {
    return new Map();
  }

  const result = new Map<string, InventoryInfo>();
  const now = Date.now();
  const uncachedNums: string[] = [];

  // Check cache first
  for (const num of bomNums) {
    const cached = inventoryCache.get(num);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      result.set(num, { onHandQty: cached.qty, cartonQty: cached.cartonQty });
    } else {
      uncachedNums.push(num);
    }
  }

  // If all were cached, return early
  if (uncachedNums.length === 0) {
    return result;
  }

  try {
    const pool = getFishbowl();

    // Create placeholders for the IN clause
    const placeholders = uncachedNums.map(() => "?").join(", ");

    // Query the tag table for on-hand inventory
    // Sum all tag quantities for each part number
    // Convert from part's UOM to pieces using uomconversion table
    // The multiply field tells us how many pieces per UOM (e.g., C75 -> pc has multiply=75)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         p.num as partNum,
         COALESCE(SUM(t.qty), 0) as qtyInUom,
         COALESCE(uc.multiply, 1) as multiplier
       FROM part p
       LEFT JOIN tag t ON t.partId = p.id
       LEFT JOIN uom u ON p.uomId = u.id
       LEFT JOIN uomconversion uc ON uc.fromUomId = u.id
         AND uc.toUomId = (SELECT id FROM uom WHERE code = 'pc' LIMIT 1)
       WHERE p.num IN (${placeholders})
       GROUP BY p.num, uc.multiply`,
      uncachedNums
    );

    // Process results and update cache
    for (const row of rows) {
      const partNum = row.partNum as string;
      const qtyInUom = Number(row.qtyInUom) || 0;
      const multiplier = Number(row.multiplier) || 1;
      // Convert to pieces and round to whole number (floor to be conservative)
      const qty = Math.floor(qtyInUom * multiplier);
      const cartonQty = Math.round(multiplier); // Carton size (pieces per carton)
      result.set(partNum, { onHandQty: qty, cartonQty });
      inventoryCache.set(partNum, { qty, cartonQty, timestamp: now });
    }

    // For any BOM numbers not found in results, set to 0
    for (const num of uncachedNums) {
      if (!result.has(num)) {
        result.set(num, { onHandQty: 0, cartonQty: 1 });
        inventoryCache.set(num, { qty: 0, cartonQty: 1, timestamp: now });
      }
    }
  } catch (error) {
    console.error("Failed to fetch inventory from Fishbowl:", error);
    // Return what we have from cache, set uncached to defaults
    for (const num of uncachedNums) {
      if (!result.has(num)) {
        result.set(num, { onHandQty: 0, cartonQty: 1 });
      }
    }
  }

  return result;
}

/**
 * Clear the inventory cache
 * Called when user clicks "Refresh Inventory" button
 */
export function clearInventoryCache(): void {
  inventoryCache.clear();
}

/**
 * Clear cache for specific BOM numbers
 */
export function clearInventoryCacheFor(bomNums: string[]): void {
  for (const num of bomNums) {
    inventoryCache.delete(num);
  }
}

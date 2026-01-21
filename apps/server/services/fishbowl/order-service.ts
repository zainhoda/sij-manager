/**
 * Fishbowl Order Service
 * Queries Sales Orders (SO), Manufacturing Orders (MO), and Work Orders (WO) from Fishbowl
 */

import type { RowDataPacket } from "mysql2/promise";
import { getFishbowl, isFishbowlConfigured } from "../../db/fishbowl";
import type {
  FishbowlSO,
  FishbowlSOItem,
  FishbowlMO,
  FishbowlMOItem,
  FishbowlWO,
  FishbowlWOItem,
  SOQueryOptions,
  WOQueryOptions,
  OrderChain,
  SO_STATUS,
} from "./types";

// ============== Sales Orders ==============

/**
 * Get list of Sales Orders from Fishbowl
 */
export async function getFishbowlSalesOrders(
  options: SOQueryOptions = {}
): Promise<FishbowlSO[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Filter by status
  if (options.status) {
    switch (options.status) {
      case "open":
        conditions.push("s.statusId IN (20, 25)"); // Issued, In Progress
        break;
      case "in_progress":
        conditions.push("s.statusId = 25");
        break;
      case "fulfilled":
        conditions.push("s.statusId = 60");
        break;
      // 'all' - no filter
    }
  }

  if (options.customerId) {
    conditions.push("s.customerId = ?");
    params.push(options.customerId);
  }

  if (options.dateFrom) {
    conditions.push("s.dateCreated >= ?");
    params.push(options.dateFrom);
  }

  if (options.dateTo) {
    conditions.push("s.dateCreated <= ?");
    params.push(options.dateTo);
  }

  // Filter to only SOs with at least one item that has a matching BOM
  let hasBOMJoin = "";
  if (options.hasBOM) {
    hasBOMJoin = `
      JOIN (
        SELECT DISTINCT si.soId
        FROM soitem si
        JOIN product prod ON si.productId = prod.id
        JOIN part p ON prod.partId = p.id
        JOIN bom b ON b.num = p.num AND b.activeFlag = 1
        WHERE si.qtyToFulfill > 0
      ) bom_items ON bom_items.soId = s.id
    `;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 100";
  const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      s.id,
      s.num,
      s.customerId,
      s.statusId,
      s.dateCreated,
      s.dateIssued,
      s.dateCompleted,
      s.totalPrice,
      s.subTotal,
      c.name as customerName,
      ss.name as statusName
    FROM so s
    ${hasBOMJoin}
    LEFT JOIN customer c ON s.customerId = c.id
    LEFT JOIN sostatus ss ON s.statusId = ss.id
    ${whereClause}
    ORDER BY s.dateCreated DESC
    ${limitClause} ${offsetClause}`,
    params
  );

  return rows.map(mapRowToSO);
}

/**
 * Get a single Sales Order by ID
 */
export async function getFishbowlSO(soId: number): Promise<FishbowlSO | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      s.id,
      s.num,
      s.customerId,
      s.statusId,
      s.dateCreated,
      s.dateIssued,
      s.dateCompleted,
      s.totalPrice,
      s.subTotal,
      c.name as customerName,
      ss.name as statusName
    FROM so s
    LEFT JOIN customer c ON s.customerId = c.id
    LEFT JOIN sostatus ss ON s.statusId = ss.id
    WHERE s.id = ?`,
    [soId]
  );

  if (rows.length === 0) return null;
  return mapRowToSO(rows[0]!);
}

/**
 * Get a Sales Order by its number
 */
export async function getFishbowlSOByNum(
  soNum: string
): Promise<FishbowlSO | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      s.id,
      s.num,
      s.customerId,
      s.statusId,
      s.dateCreated,
      s.dateIssued,
      s.dateCompleted,
      s.totalPrice,
      s.subTotal,
      c.name as customerName,
      ss.name as statusName
    FROM so s
    LEFT JOIN customer c ON s.customerId = c.id
    LEFT JOIN sostatus ss ON s.statusId = ss.id
    WHERE s.num = ?`,
    [soNum]
  );

  if (rows.length === 0) return null;
  return mapRowToSO(rows[0]!);
}

/**
 * Get line items for a Sales Order
 */
export async function getSOItems(soId: number): Promise<FishbowlSOItem[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      si.id,
      si.soId,
      si.soLineItem,
      si.productId,
      si.qtyOrdered,
      si.qtyFulfilled,
      si.qtyPicked,
      si.qtyToFulfill,
      si.unitPrice,
      si.totalPrice,
      si.statusId,
      si.description,
      si.dateScheduledFulfillment,
      p.num as productNum,
      p.description as productDescription
    FROM soitem si
    LEFT JOIN product p ON si.productId = p.id
    WHERE si.soId = ?
    ORDER BY si.soLineItem`,
    [soId]
  );

  return rows.map((row) => ({
    id: row.id as number,
    soId: row.soId as number,
    soLineItem: row.soLineItem as number,
    productId: row.productId as number,
    qtyOrdered: Number(row.qtyOrdered),
    qtyFulfilled: Number(row.qtyFulfilled),
    qtyPicked: Number(row.qtyPicked),
    qtyToFulfill: Number(row.qtyToFulfill),
    unitPrice: Number(row.unitPrice),
    totalPrice: Number(row.totalPrice),
    statusId: row.statusId as number,
    description: row.description as string | null,
    dateScheduledFulfillment: row.dateScheduledFulfillment as Date | null,
    productNum: row.productNum as string | undefined,
    productDescription: row.productDescription as string | undefined,
  }));
}

/**
 * Get SO with items
 */
export async function getFishbowlSOWithItems(soId: number): Promise<{
  so: FishbowlSO;
  items: FishbowlSOItem[];
} | null> {
  const so = await getFishbowlSO(soId);
  if (!so) return null;

  const items = await getSOItems(soId);
  return { so, items };
}

// ============== Manufacturing Orders ==============

/**
 * Get Manufacturing Orders
 */
export async function getFishbowlMOs(options: {
  soId?: number;
  status?: number;
  limit?: number;
} = {}): Promise<FishbowlMO[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const conditions: string[] = [];
  const params: (number)[] = [];

  if (options.soId) {
    conditions.push("m.soId = ?");
    params.push(options.soId);
  }

  if (options.status) {
    conditions.push("m.statusId = ?");
    params.push(options.status);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 100";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      m.id,
      m.num,
      m.soId,
      m.statusId,
      m.dateCreated,
      m.dateIssued,
      m.dateScheduled,
      m.dateCompleted
    FROM mo m
    ${whereClause}
    ORDER BY m.dateCreated DESC
    ${limitClause}`,
    params
  );

  return rows.map((row) => ({
    id: row.id as number,
    num: row.num as string,
    soId: row.soId as number | null,
    statusId: row.statusId as number,
    dateCreated: row.dateCreated as Date,
    dateIssued: row.dateIssued as Date | null,
    dateScheduled: row.dateScheduled as Date | null,
    dateCompleted: row.dateCompleted as Date | null,
  }));
}

/**
 * Get MO items
 */
export async function getMOItems(moId: number): Promise<FishbowlMOItem[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      mi.id,
      mi.moId,
      mi.partId,
      mi.bomId,
      mi.qtyToFulfill,
      mi.qtyFulfilled,
      mi.statusId,
      mi.description,
      p.num as partNum
    FROM moitem mi
    LEFT JOIN part p ON mi.partId = p.id
    WHERE mi.moId = ?
    ORDER BY mi.id`,
    [moId]
  );

  return rows.map((row) => ({
    id: row.id as number,
    moId: row.moId as number,
    partId: row.partId as number,
    bomId: row.bomId as number | null,
    qtyToFulfill: Number(row.qtyToFulfill),
    qtyFulfilled: Number(row.qtyFulfilled),
    statusId: row.statusId as number,
    description: row.description as string | null,
    partNum: row.partNum as string | undefined,
  }));
}

// ============== Work Orders ==============

/**
 * Get Work Orders from Fishbowl
 */
export async function getFishbowlWorkOrders(
  options: WOQueryOptions = {}
): Promise<FishbowlWO[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.status) {
    conditions.push("w.statusId = ?");
    params.push(options.status);
  }

  if (options.moId) {
    conditions.push("mi.moId = ?");
    params.push(options.moId);
  }

  if (options.dateFrom) {
    conditions.push("w.dateCreated >= ?");
    params.push(options.dateFrom);
  }

  if (options.dateTo) {
    conditions.push("w.dateCreated <= ?");
    params.push(options.dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "LIMIT 100";
  const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      w.id,
      w.num,
      w.moItemId,
      w.statusId,
      w.qtyOrdered,
      w.qtyTarget,
      w.qtyScrapped,
      w.dateCreated,
      w.dateScheduled,
      w.dateStarted,
      w.dateFinished,
      w.locationId
    FROM wo w
    LEFT JOIN moitem mi ON w.moItemId = mi.id
    ${whereClause}
    ORDER BY w.dateCreated DESC
    ${limitClause} ${offsetClause}`,
    params
  );

  return rows.map(mapRowToWO);
}

/**
 * Get a single Work Order by ID
 */
export async function getFishbowlWO(woId: number): Promise<FishbowlWO | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      w.id,
      w.num,
      w.moItemId,
      w.statusId,
      w.qtyOrdered,
      w.qtyTarget,
      w.qtyScrapped,
      w.dateCreated,
      w.dateScheduled,
      w.dateStarted,
      w.dateFinished,
      w.locationId
    FROM wo w
    WHERE w.id = ?`,
    [woId]
  );

  if (rows.length === 0) return null;
  return mapRowToWO(rows[0]!);
}

/**
 * Get a Work Order by its number
 */
export async function getFishbowlWOByNum(
  woNum: string
): Promise<FishbowlWO | null> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      w.id,
      w.num,
      w.moItemId,
      w.statusId,
      w.qtyOrdered,
      w.qtyTarget,
      w.qtyScrapped,
      w.dateCreated,
      w.dateScheduled,
      w.dateStarted,
      w.dateFinished,
      w.locationId
    FROM wo w
    WHERE w.num = ?`,
    [woNum]
  );

  if (rows.length === 0) return null;
  return mapRowToWO(rows[0]!);
}

/**
 * Get WO items
 */
export async function getWOItems(woId: number): Promise<FishbowlWOItem[]> {
  if (!isFishbowlConfigured()) {
    throw new Error("Fishbowl connection not configured");
  }

  const pool = getFishbowl();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      wi.id,
      wi.woId,
      wi.partId,
      wi.qtyTarget,
      wi.qtyUsed,
      wi.qtyScrapped,
      wi.typeId,
      p.num as partNum,
      p.description as partDescription
    FROM woitem wi
    LEFT JOIN part p ON wi.partId = p.id
    WHERE wi.woId = ?
    ORDER BY wi.id`,
    [woId]
  );

  return rows.map((row) => ({
    id: row.id as number,
    woId: row.woId as number,
    partId: row.partId as number,
    qtyTarget: Number(row.qtyTarget),
    qtyUsed: Number(row.qtyUsed),
    qtyScrapped: Number(row.qtyScrapped),
    typeId: row.typeId as number,
    partNum: row.partNum as string | undefined,
    partDescription: row.partDescription as string | undefined,
  }));
}

// ============== Order Chain ==============

/**
 * Get the full order chain: SO -> MO -> WO
 */
export async function getOrderChain(soId: number): Promise<OrderChain> {
  const so = await getFishbowlSO(soId);
  const soItems = so ? await getSOItems(soId) : [];

  // Get MOs linked to this SO
  const mos = await getFishbowlMOs({ soId });

  // Get MO items
  const moItems: FishbowlMOItem[] = [];
  for (const mo of mos) {
    const items = await getMOItems(mo.id);
    moItems.push(...items);
  }

  // Get WOs linked to MO items
  const wos: FishbowlWO[] = [];
  for (const moItem of moItems) {
    const woList = await getFishbowlWorkOrders({ moId: moItem.moId });
    wos.push(...woList);
  }

  return {
    so,
    soItems,
    mos,
    moItems,
    wos,
  };
}

// ============== Helpers ==============

function mapRowToSO(row: RowDataPacket): FishbowlSO {
  return {
    id: row.id as number,
    num: row.num as string,
    customerId: row.customerId as number,
    statusId: row.statusId as number,
    dateCreated: row.dateCreated as Date,
    dateIssued: row.dateIssued as Date | null,
    dateCompleted: row.dateCompleted as Date | null,
    totalPrice: Number(row.totalPrice),
    subTotal: Number(row.subTotal),
    customerName: row.customerName as string | undefined,
    statusName: row.statusName as string | undefined,
  };
}

function mapRowToWO(row: RowDataPacket): FishbowlWO {
  return {
    id: row.id as number,
    num: row.num as string,
    moItemId: row.moItemId as number,
    statusId: row.statusId as number,
    qtyOrdered: row.qtyOrdered as number,
    qtyTarget: row.qtyTarget as number,
    qtyScrapped: row.qtyScrapped as number,
    dateCreated: row.dateCreated as Date,
    dateScheduled: row.dateScheduled as Date | null,
    dateStarted: row.dateStarted as Date | null,
    dateFinished: row.dateFinished as Date | null,
    locationId: row.locationId as number | null,
  };
}

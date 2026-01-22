/**
 * Demand Pool Service
 * CRUD operations for the global demand pool
 */

import type { Client } from "@libsql/client";
import type { DemandEntry } from "../../db/schema";

export interface CreateDemandInput {
  source: "fishbowl_so" | "fishbowl_wo" | "manual";
  fishbowl_so_id?: number;
  fishbowl_so_num?: string;
  fishbowl_so_item_id?: number;
  fishbowl_wo_id?: number;
  fishbowl_wo_num?: string;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  step_config_id?: number;
  quantity: number;
  due_date: string;
  target_completion_date?: string;
  priority?: number;
  customer_name?: string;
  notes?: string;
  color?: string;
  production_hold_until?: string;
  production_hold_reason?: string;
}

export interface UpdateDemandInput {
  quantity?: number;
  due_date?: string;
  target_completion_date?: string;
  priority?: number;
  customer_name?: string;
  notes?: string;
  status?: DemandEntry["status"];
  quantity_completed?: number;
  step_config_id?: number;
  color?: string;
  production_hold_until?: string | null;
  production_hold_reason?: string | null;
}

export interface DemandQueryOptions {
  status?: DemandEntry["status"] | DemandEntry["status"][];
  fishbowl_bom_id?: number;
  fishbowl_so_id?: number;
  due_before?: string;
  due_after?: string;
  priority_min?: number;
  search?: string;
  limit?: number;
  offset?: number;
  order_by?: "due_date" | "priority" | "created_at";
  order_dir?: "asc" | "desc";
}

export interface DemandWithBOMInfo extends DemandEntry {
  bom_description?: string;
  total_steps?: number;
  total_time_seconds?: number;
}

/**
 * Get all demand entries with optional filtering
 */
export async function getDemandEntries(
  db: Client,
  options: DemandQueryOptions = {}
): Promise<{ entries: DemandWithBOMInfo[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.status) {
    if (Array.isArray(options.status)) {
      const placeholders = options.status.map(() => "?").join(", ");
      conditions.push(`d.status IN (${placeholders})`);
      params.push(...options.status);
    } else {
      conditions.push("d.status = ?");
      params.push(options.status);
    }
  }

  if (options.fishbowl_bom_id) {
    conditions.push("d.fishbowl_bom_id = ?");
    params.push(options.fishbowl_bom_id);
  }

  if (options.fishbowl_so_id) {
    conditions.push("d.fishbowl_so_id = ?");
    params.push(options.fishbowl_so_id);
  }

  if (options.due_before) {
    conditions.push("d.due_date <= ?");
    params.push(options.due_before);
  }

  if (options.due_after) {
    conditions.push("d.due_date >= ?");
    params.push(options.due_after);
  }

  if (options.priority_min !== undefined) {
    conditions.push("d.priority >= ?");
    params.push(options.priority_min);
  }

  if (options.search) {
    conditions.push(
      "(d.fishbowl_bom_num LIKE ? OR d.fishbowl_so_num LIKE ? OR d.customer_name LIKE ? OR d.notes LIKE ?)"
    );
    const searchPattern = `%${options.search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get total count
  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM demand_entries d ${whereClause}`,
    args: params,
  });
  const total = (countResult.rows[0]?.total as number) || 0;

  // Build order clause
  const orderColumn = options.order_by || "due_date";
  const orderDir = options.order_dir || "asc";
  const orderClause = `ORDER BY d.${orderColumn} ${orderDir.toUpperCase()}`;

  // Build limit/offset
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";
  const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

  const result = await db.execute({
    sql: `
      SELECT
        d.*,
        bc.description as bom_description,
        (SELECT COUNT(*) FROM bom_steps bs WHERE bs.fishbowl_bom_id = d.fishbowl_bom_id) as total_steps,
        (SELECT SUM(bs.time_per_piece_seconds) FROM bom_steps bs WHERE bs.fishbowl_bom_id = d.fishbowl_bom_id) as total_time_seconds
      FROM demand_entries d
      LEFT JOIN fishbowl_bom_cache bc ON d.fishbowl_bom_id = bc.id
      ${whereClause}
      ${orderClause}
      ${limitClause} ${offsetClause}
    `,
    args: params,
  });

  return {
    entries: result.rows as unknown as DemandWithBOMInfo[],
    total,
  };
}

/**
 * Get a single demand entry by ID
 */
export async function getDemandEntry(
  db: Client,
  id: number
): Promise<DemandWithBOMInfo | null> {
  const result = await db.execute({
    sql: `
      SELECT
        d.*,
        bc.description as bom_description,
        (SELECT COUNT(*) FROM bom_steps bs WHERE bs.fishbowl_bom_id = d.fishbowl_bom_id) as total_steps,
        (SELECT SUM(bs.time_per_piece_seconds) FROM bom_steps bs WHERE bs.fishbowl_bom_id = d.fishbowl_bom_id) as total_time_seconds
      FROM demand_entries d
      LEFT JOIN fishbowl_bom_cache bc ON d.fishbowl_bom_id = bc.id
      WHERE d.id = ?
    `,
    args: [id],
  });

  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as DemandWithBOMInfo;
}

/**
 * Create a new demand entry
 */
export async function createDemandEntry(
  db: Client,
  input: CreateDemandInput
): Promise<DemandEntry> {
  const targetDate = input.target_completion_date || input.due_date;
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `
      INSERT INTO demand_entries (
        source,
        fishbowl_so_id,
        fishbowl_so_num,
        fishbowl_so_item_id,
        fishbowl_wo_id,
        fishbowl_wo_num,
        fishbowl_bom_id,
        fishbowl_bom_num,
        step_config_id,
        quantity,
        due_date,
        target_completion_date,
        priority,
        customer_name,
        notes,
        color,
        production_hold_until,
        production_hold_reason,
        status,
        quantity_completed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
      RETURNING *
    `,
    args: [
      input.source,
      input.fishbowl_so_id || null,
      input.fishbowl_so_num || null,
      input.fishbowl_so_item_id || null,
      input.fishbowl_wo_id || null,
      input.fishbowl_wo_num || null,
      input.fishbowl_bom_id,
      input.fishbowl_bom_num,
      input.step_config_id || null,
      input.quantity,
      input.due_date,
      targetDate,
      input.priority || 3,
      input.customer_name || null,
      input.notes || null,
      input.color || null,
      input.production_hold_until || null,
      input.production_hold_reason || null,
      now,
      now,
    ],
  });

  return result.rows[0] as unknown as DemandEntry;
}

/**
 * Create multiple demand entries in a batch
 */
export async function createDemandEntriesBatch(
  db: Client,
  inputs: CreateDemandInput[]
): Promise<DemandEntry[]> {
  const results: DemandEntry[] = [];

  for (const input of inputs) {
    const entry = await createDemandEntry(db, input);
    results.push(entry);
  }

  return results;
}

/**
 * Update a demand entry
 */
export async function updateDemandEntry(
  db: Client,
  id: number,
  input: UpdateDemandInput
): Promise<DemandEntry | null> {
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.quantity !== undefined) {
    updates.push("quantity = ?");
    params.push(input.quantity);
  }

  if (input.due_date !== undefined) {
    updates.push("due_date = ?");
    params.push(input.due_date);
  }

  if (input.target_completion_date !== undefined) {
    updates.push("target_completion_date = ?");
    params.push(input.target_completion_date);
  }

  if (input.priority !== undefined) {
    updates.push("priority = ?");
    params.push(input.priority);
  }

  if (input.customer_name !== undefined) {
    updates.push("customer_name = ?");
    params.push(input.customer_name);
  }

  if (input.notes !== undefined) {
    updates.push("notes = ?");
    params.push(input.notes);
  }

  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }

  if (input.quantity_completed !== undefined) {
    updates.push("quantity_completed = ?");
    params.push(input.quantity_completed);
  }

  if (input.step_config_id !== undefined) {
    updates.push("step_config_id = ?");
    params.push(input.step_config_id);
  }

  if (input.color !== undefined) {
    updates.push("color = ?");
    params.push(input.color);
  }

  if (input.production_hold_until !== undefined) {
    updates.push("production_hold_until = ?");
    params.push(input.production_hold_until);
  }

  if (input.production_hold_reason !== undefined) {
    updates.push("production_hold_reason = ?");
    params.push(input.production_hold_reason);
  }

  if (updates.length === 0) {
    return getDemandEntry(db, id);
  }

  updates.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  const result = await db.execute({
    sql: `
      UPDATE demand_entries
      SET ${updates.join(", ")}
      WHERE id = ?
      RETURNING *
    `,
    args: params,
  });

  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as DemandEntry;
}

/**
 * Delete a demand entry
 */
export async function deleteDemandEntry(db: Client, id: number): Promise<boolean> {
  const result = await db.execute({
    sql: "DELETE FROM demand_entries WHERE id = ?",
    args: [id],
  });
  return result.rowsAffected > 0;
}

/**
 * Get demand entries that can be planned (pending or in_progress)
 */
export async function getPlanableDemand(db: Client): Promise<DemandWithBOMInfo[]> {
  const { entries } = await getDemandEntries(db, {
    status: ["pending", "in_progress"],
    order_by: "due_date",
    order_dir: "asc",
  });
  return entries;
}

/**
 * Get demand summary statistics
 */
export async function getDemandSummary(db: Client): Promise<{
  total: number;
  pending: number;
  planned: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_this_week: number;
}> {
  const today = new Date().toISOString().split("T")[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const result = await db.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND due_date < '${today}' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND due_date <= '${weekFromNow}' THEN 1 ELSE 0 END) as due_this_week
    FROM demand_entries
  `);

  const row = result.rows[0] as Record<string, number>;
  return {
    total: row.total || 0,
    pending: row.pending || 0,
    planned: row.planned || 0,
    in_progress: row.in_progress || 0,
    completed: row.completed || 0,
    overdue: row.overdue || 0,
    due_this_week: row.due_this_week || 0,
  };
}

/**
 * Check if a Fishbowl SO item is already in the demand pool
 */
export async function isDemandExistsForSOItem(
  db: Client,
  soId: number,
  soItemId: number
): Promise<boolean> {
  const result = await db.execute({
    sql: `
      SELECT id FROM demand_entries
      WHERE fishbowl_so_id = ? AND fishbowl_so_item_id = ?
      LIMIT 1
    `,
    args: [soId, soItemId],
  });
  return result.rows.length > 0;
}

/**
 * Check if a Fishbowl WO is already in the demand pool
 */
export async function isDemandExistsForWO(
  db: Client,
  woId: number
): Promise<boolean> {
  const result = await db.execute({
    sql: `
      SELECT id FROM demand_entries
      WHERE fishbowl_wo_id = ?
      LIMIT 1
    `,
    args: [woId],
  });
  return result.rows.length > 0;
}

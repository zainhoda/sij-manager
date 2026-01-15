import { db } from "../db";
import type { ProductBuildVersion, BuildVersionStep, ProductStep } from "../db/schema";

export interface BuildVersionWithSteps extends ProductBuildVersion {
  steps: (ProductStep & { build_sequence: number })[];
}

/**
 * Get all build versions for a product
 */
export async function getBuildVersions(productId: number): Promise<ProductBuildVersion[]> {
  const result = await db.execute({
    sql: `SELECT * FROM product_build_versions WHERE product_id = ? ORDER BY version_number DESC`,
    args: [productId]
  });
  return result.rows as unknown as ProductBuildVersion[];
}

/**
 * Get a single build version by ID
 */
export async function getBuildVersion(buildVersionId: number): Promise<ProductBuildVersion | null> {
  const result = await db.execute({
    sql: `SELECT * FROM product_build_versions WHERE id = ?`,
    args: [buildVersionId]
  });
  return (result.rows[0] as unknown as ProductBuildVersion) || null;
}

/**
 * Get a build version with all its steps (ordered by sequence)
 */
export async function getBuildVersionWithSteps(buildVersionId: number): Promise<BuildVersionWithSteps | null> {
  const version = await getBuildVersion(buildVersionId);
  if (!version) return null;

  const steps = await getBuildVersionSteps(buildVersionId);
  return { ...version, steps };
}

/**
 * Get steps for a build version (ordered by sequence)
 */
export async function getBuildVersionSteps(buildVersionId: number): Promise<(ProductStep & { build_sequence: number })[]> {
  const result = await db.execute({
    sql: `
      SELECT ps.*, bvs.sequence as build_sequence
      FROM build_version_steps bvs
      JOIN product_steps ps ON ps.id = bvs.product_step_id
      WHERE bvs.build_version_id = ?
      ORDER BY bvs.sequence
    `,
    args: [buildVersionId]
  });
  return result.rows as unknown as (ProductStep & { build_sequence: number })[];
}

/**
 * Get the default build version for a product
 */
export async function getDefaultBuildVersion(productId: number): Promise<ProductBuildVersion | null> {
  const result = await db.execute({
    sql: `SELECT * FROM product_build_versions WHERE product_id = ? AND is_default = 1`,
    args: [productId]
  });
  return (result.rows[0] as unknown as ProductBuildVersion) || null;
}

/**
 * Create a new build version for a product
 * @param cloneFromId - Optional: clone steps from another build version
 */
export async function createBuildVersion(
  productId: number,
  versionName: string,
  description: string | null = null,
  cloneFromId?: number
): Promise<ProductBuildVersion> {
  // Get next version number
  const maxVersionResult = await db.execute({
    sql: `SELECT MAX(version_number) as max_version FROM product_build_versions WHERE product_id = ?`,
    args: [productId]
  });
  const maxVersion = (maxVersionResult.rows[0] as { max_version: number | null })?.max_version || 0;
  const nextVersionNumber = maxVersion + 1;

  // Create the build version
  const result = await db.execute({
    sql: `INSERT INTO product_build_versions (product_id, version_name, version_number, description, status, is_default)
          VALUES (?, ?, ?, ?, 'draft', 0)`,
    args: [productId, versionName, nextVersionNumber, description]
  });
  const newVersionId = Number(result.lastInsertRowid);

  // If cloning from another version, copy its steps
  if (cloneFromId) {
    await db.execute({
      sql: `INSERT INTO build_version_steps (build_version_id, product_step_id, sequence)
            SELECT ?, product_step_id, sequence FROM build_version_steps WHERE build_version_id = ?`,
      args: [newVersionId, cloneFromId]
    });
  }

  return (await getBuildVersion(newVersionId))!;
}

/**
 * Clone a build version to create a new one
 */
export async function cloneBuildVersion(
  buildVersionId: number,
  newName: string,
  description: string | null = null
): Promise<ProductBuildVersion> {
  const original = await getBuildVersion(buildVersionId);
  if (!original) {
    throw new Error(`Build version ${buildVersionId} not found`);
  }
  return createBuildVersion(original.product_id, newName, description, buildVersionId);
}

/**
 * Update build version metadata
 */
export async function updateBuildVersion(
  buildVersionId: number,
  updates: { version_name?: string; description?: string; status?: 'draft' | 'active' | 'deprecated' }
): Promise<ProductBuildVersion | null> {
  const fields: string[] = [];
  const args: (string | number)[] = [];

  if (updates.version_name !== undefined) {
    fields.push("version_name = ?");
    args.push(updates.version_name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    args.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    args.push(updates.status);
  }

  if (fields.length === 0) return getBuildVersion(buildVersionId);

  args.push(buildVersionId);
  await db.execute({
    sql: `UPDATE product_build_versions SET ${fields.join(", ")} WHERE id = ?`,
    args
  });

  return getBuildVersion(buildVersionId);
}

/**
 * Set a build version as the default for its product
 */
export async function setDefaultBuildVersion(buildVersionId: number): Promise<void> {
  const version = await getBuildVersion(buildVersionId);
  if (!version) {
    throw new Error(`Build version ${buildVersionId} not found`);
  }

  // Clear existing default
  await db.execute({
    sql: `UPDATE product_build_versions SET is_default = 0 WHERE product_id = ?`,
    args: [version.product_id]
  });

  // Set new default
  await db.execute({
    sql: `UPDATE product_build_versions SET is_default = 1 WHERE id = ?`,
    args: [buildVersionId]
  });
}

/**
 * Add a step to a build version
 */
export async function addStepToBuildVersion(
  buildVersionId: number,
  productStepId: number,
  sequence?: number
): Promise<BuildVersionStep> {
  // Validate the build version exists
  const version = await getBuildVersion(buildVersionId);
  if (!version) {
    throw new Error(`Build version ${buildVersionId} not found`);
  }

  // Validate the step belongs to the same product
  const stepResult = await db.execute({
    sql: `SELECT product_id FROM product_steps WHERE id = ?`,
    args: [productStepId]
  });
  const step = stepResult.rows[0] as { product_id: number } | undefined;
  if (!step) {
    throw new Error(`Step ${productStepId} not found`);
  }
  if (step.product_id !== version.product_id) {
    throw new Error(`Step ${productStepId} does not belong to product ${version.product_id}`);
  }

  // Get max sequence if not provided
  if (sequence === undefined) {
    const maxSeqResult = await db.execute({
      sql: `SELECT MAX(sequence) as max_seq FROM build_version_steps WHERE build_version_id = ?`,
      args: [buildVersionId]
    });
    const maxSeq = (maxSeqResult.rows[0] as { max_seq: number | null })?.max_seq || 0;
    sequence = maxSeq + 1;
  }

  const result = await db.execute({
    sql: `INSERT INTO build_version_steps (build_version_id, product_step_id, sequence)
          VALUES (?, ?, ?)`,
    args: [buildVersionId, productStepId, sequence]
  });

  return {
    id: Number(result.lastInsertRowid),
    build_version_id: buildVersionId,
    product_step_id: productStepId,
    sequence
  };
}

/**
 * Remove a step from a build version
 */
export async function removeStepFromBuildVersion(
  buildVersionId: number,
  productStepId: number
): Promise<boolean> {
  const result = await db.execute({
    sql: `DELETE FROM build_version_steps WHERE build_version_id = ? AND product_step_id = ?`,
    args: [buildVersionId, productStepId]
  });
  return result.rowsAffected > 0;
}

/**
 * Reorder steps in a build version
 */
export async function reorderBuildVersionSteps(
  buildVersionId: number,
  stepSequences: { productStepId: number; sequence: number }[]
): Promise<void> {
  for (const { productStepId, sequence } of stepSequences) {
    await db.execute({
      sql: `UPDATE build_version_steps SET sequence = ? WHERE build_version_id = ? AND product_step_id = ?`,
      args: [sequence, buildVersionId, productStepId]
    });
  }
}

/**
 * Delete a build version (only if not used by any schedules)
 * Note: Version is now tracked on schedules, not orders
 */
export async function deleteBuildVersion(buildVersionId: number): Promise<boolean> {
  const version = await getBuildVersion(buildVersionId);
  if (!version) return false;

  // Check if any schedules use this version
  const schedulesResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM schedules WHERE build_version_id = ?`,
    args: [buildVersionId]
  });
  const scheduleCount = (schedulesResult.rows[0] as { count: number }).count;
  if (scheduleCount > 0) {
    throw new Error(`Cannot delete build version: ${scheduleCount} schedules are using it`);
  }

  // Check if it's the default
  if (version.is_default) {
    throw new Error("Cannot delete the default build version");
  }

  // Delete the build version (build_version_steps will cascade delete)
  await db.execute({
    sql: `DELETE FROM product_build_versions WHERE id = ?`,
    args: [buildVersionId]
  });

  return true;
}

/**
 * Get steps that are in the product library but not in the build version
 */
export async function getAvailableStepsForBuildVersion(buildVersionId: number): Promise<ProductStep[]> {
  const version = await getBuildVersion(buildVersionId);
  if (!version) return [];

  const result = await db.execute({
    sql: `
      SELECT ps.* FROM product_steps ps
      WHERE ps.product_id = ?
      AND ps.id NOT IN (
        SELECT product_step_id FROM build_version_steps WHERE build_version_id = ?
      )
      ORDER BY ps.sequence
    `,
    args: [version.product_id, buildVersionId]
  });
  return result.rows as unknown as ProductStep[];
}

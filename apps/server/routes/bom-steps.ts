/**
 * BOM Steps API Routes
 * Manages labor steps linked to Fishbowl BOMs
 */

import { db } from "../db";
import type { BOMStep, BOMStepConfiguration } from "../db/schema";

export async function handleBOMSteps(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/bom-steps/counts - get step counts per BOM
  if (url.pathname === "/api/bom-steps/counts" && request.method === "GET") {
    const result = await db.execute(`
      SELECT fishbowl_bom_id, fishbowl_bom_num, COUNT(*) as step_count,
             SUM(time_per_piece_seconds) as total_time_seconds
      FROM bom_steps
      GROUP BY fishbowl_bom_id, fishbowl_bom_num
    `);
    return Response.json({ counts: result.rows });
  }

  // GET /api/bom-steps - list all steps
  if (url.pathname === "/api/bom-steps" && request.method === "GET") {
    const bomId = url.searchParams.get("bom_id");

    let result;
    if (bomId) {
      result = await db.execute({
        sql: `
          SELECT bs.*, wc.name as work_category_name, e.name as equipment_name, c.name as component_name
          FROM bom_steps bs
          LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
          LEFT JOIN equipment e ON bs.equipment_id = e.id
          LEFT JOIN components c ON bs.component_id = c.id
          WHERE bs.fishbowl_bom_id = ?
          ORDER BY bs.sequence
        `,
        args: [parseInt(bomId)],
      });
    } else {
      result = await db.execute(`
        SELECT bs.*, wc.name as work_category_name, e.name as equipment_name, c.name as component_name
        FROM bom_steps bs
        LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
        LEFT JOIN equipment e ON bs.equipment_id = e.id
        LEFT JOIN components c ON bs.component_id = c.id
        ORDER BY bs.fishbowl_bom_num, bs.sequence
      `);
    }

    return Response.json({ steps: result.rows });
  }

  // POST /api/bom-steps - create a new step
  if (url.pathname === "/api/bom-steps" && request.method === "POST") {
    const body = await request.json() as any;

    if (!body.fishbowl_bom_id || !body.fishbowl_bom_num || !body.name || body.time_per_piece_seconds === undefined || body.sequence === undefined) {
      return Response.json(
        { error: "Missing required fields: fishbowl_bom_id, fishbowl_bom_num, name, time_per_piece_seconds, sequence" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `
        INSERT INTO bom_steps (
          fishbowl_bom_id, fishbowl_bom_num, name, step_code, details,
          time_per_piece_seconds, sequence, work_category_id, equipment_id, component_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
      args: [
        body.fishbowl_bom_id,
        body.fishbowl_bom_num,
        body.name,
        body.step_code || null,
        body.details || null,
        body.time_per_piece_seconds,
        body.sequence,
        body.work_category_id || null,
        body.equipment_id || null,
        body.component_id || null,
      ],
    });

    return Response.json(result.rows[0], { status: 201 });
  }

  // POST /api/bom-steps/batch - create multiple steps at once
  if (url.pathname === "/api/bom-steps/batch" && request.method === "POST") {
    const body = await request.json() as any;

    if (!Array.isArray(body.steps)) {
      return Response.json({ error: "Expected steps array" }, { status: 400 });
    }

    const results = [];
    for (const step of body.steps) {
      const result = await db.execute({
        sql: `
          INSERT INTO bom_steps (
            fishbowl_bom_id, fishbowl_bom_num, name, step_code, details,
            time_per_piece_seconds, sequence, work_category_id, equipment_id, component_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `,
        args: [
          step.fishbowl_bom_id,
          step.fishbowl_bom_num,
          step.name,
          step.step_code || null,
          step.details || null,
          step.time_per_piece_seconds,
          step.sequence,
          step.work_category_id || null,
          step.equipment_id || null,
          step.component_id || null,
        ],
      });
      results.push(result.rows[0]);
    }

    return Response.json({ steps: results, count: results.length }, { status: 201 });
  }

  // GET /api/bom-steps/:id
  const stepIdMatch = url.pathname.match(/^\/api\/bom-steps\/(\d+)$/);
  if (stepIdMatch && request.method === "GET") {
    const id = parseInt(stepIdMatch[1]!);
    const result = await db.execute({
      sql: `
        SELECT bs.*, wc.name as work_category_name, e.name as equipment_name, c.name as component_name
        FROM bom_steps bs
        LEFT JOIN work_categories wc ON bs.work_category_id = wc.id
        LEFT JOIN equipment e ON bs.equipment_id = e.id
        LEFT JOIN components c ON bs.component_id = c.id
        WHERE bs.id = ?
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  }

  // PATCH /api/bom-steps/:id
  if (stepIdMatch && request.method === "PATCH") {
    const id = parseInt(stepIdMatch[1]!);
    const body = await request.json() as any;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      params.push(body.name);
    }
    if (body.step_code !== undefined) {
      updates.push("step_code = ?");
      params.push(body.step_code);
    }
    if (body.details !== undefined) {
      updates.push("details = ?");
      params.push(body.details);
    }
    if (body.time_per_piece_seconds !== undefined) {
      updates.push("time_per_piece_seconds = ?");
      params.push(body.time_per_piece_seconds);
    }
    if (body.sequence !== undefined) {
      updates.push("sequence = ?");
      params.push(body.sequence);
    }
    if (body.work_category_id !== undefined) {
      updates.push("work_category_id = ?");
      params.push(body.work_category_id);
    }
    if (body.equipment_id !== undefined) {
      updates.push("equipment_id = ?");
      params.push(body.equipment_id);
    }
    if (body.component_id !== undefined) {
      updates.push("component_id = ?");
      params.push(body.component_id);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(id);

    const result = await db.execute({
      sql: `UPDATE bom_steps SET ${updates.join(", ")} WHERE id = ? RETURNING *`,
      args: params,
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  }

  // DELETE /api/bom-steps/:id
  if (stepIdMatch && request.method === "DELETE") {
    const id = parseInt(stepIdMatch[1]!);
    const result = await db.execute({
      sql: "DELETE FROM bom_steps WHERE id = ?",
      args: [id],
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // ============================================================
  // Step Dependencies
  // ============================================================

  // GET /api/bom-steps/:id/dependencies
  const depsMatch = url.pathname.match(/^\/api\/bom-steps\/(\d+)\/dependencies$/);
  if (depsMatch && request.method === "GET") {
    const stepId = parseInt(depsMatch[1]!);
    const result = await db.execute({
      sql: `
        SELECT d.*, bs.name as depends_on_step_name
        FROM bom_step_dependencies d
        JOIN bom_steps bs ON d.depends_on_step_id = bs.id
        WHERE d.step_id = ?
      `,
      args: [stepId],
    });
    return Response.json({ dependencies: result.rows });
  }

  // POST /api/bom-steps/:id/dependencies
  if (depsMatch && request.method === "POST") {
    const stepId = parseInt(depsMatch[1]!);
    const body = await request.json() as any;

    if (!body.depends_on_step_id) {
      return Response.json({ error: "Missing depends_on_step_id" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO bom_step_dependencies (step_id, depends_on_step_id, dependency_type, lag_seconds)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `,
      args: [
        stepId,
        body.depends_on_step_id,
        body.dependency_type || "finish",
        body.lag_seconds || 0,
      ],
    });

    return Response.json(result.rows[0], { status: 201 });
  }

  // DELETE /api/bom-steps/:id/dependencies/:depId
  const deleteDepMatch = url.pathname.match(/^\/api\/bom-steps\/(\d+)\/dependencies\/(\d+)$/);
  if (deleteDepMatch && request.method === "DELETE") {
    const depId = parseInt(deleteDepMatch[2]!);
    const result = await db.execute({
      sql: "DELETE FROM bom_step_dependencies WHERE id = ?",
      args: [depId],
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Dependency not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // ============================================================
  // Step Configurations (versions)
  // ============================================================

  // GET /api/bom-step-configs
  if (url.pathname === "/api/bom-step-configs" && request.method === "GET") {
    const bomId = url.searchParams.get("bom_id");

    let result;
    if (bomId) {
      result = await db.execute({
        sql: `
          SELECT * FROM bom_step_configurations
          WHERE fishbowl_bom_id = ?
          ORDER BY version_number DESC
        `,
        args: [parseInt(bomId)],
      });
    } else {
      result = await db.execute(`
        SELECT * FROM bom_step_configurations
        ORDER BY fishbowl_bom_num, version_number DESC
      `);
    }

    return Response.json({ configs: result.rows });
  }

  // POST /api/bom-step-configs
  if (url.pathname === "/api/bom-step-configs" && request.method === "POST") {
    const body = await request.json() as any;

    if (!body.fishbowl_bom_id || !body.fishbowl_bom_num || !body.config_name || body.version_number === undefined) {
      return Response.json(
        { error: "Missing required fields: fishbowl_bom_id, fishbowl_bom_num, config_name, version_number" },
        { status: 400 }
      );
    }

    // If setting as default, clear other defaults
    if (body.is_default) {
      await db.execute({
        sql: "UPDATE bom_step_configurations SET is_default = 0 WHERE fishbowl_bom_id = ?",
        args: [body.fishbowl_bom_id],
      });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO bom_step_configurations (
          fishbowl_bom_id, fishbowl_bom_num, config_name, version_number,
          description, status, is_default, total_time_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
      args: [
        body.fishbowl_bom_id,
        body.fishbowl_bom_num,
        body.config_name,
        body.version_number,
        body.description || null,
        body.status || "active",
        body.is_default ? 1 : 0,
        body.total_time_seconds || null,
      ],
    });

    return Response.json(result.rows[0], { status: 201 });
  }

  // GET /api/bom-step-configs/:id
  const configIdMatch = url.pathname.match(/^\/api\/bom-step-configs\/(\d+)$/);
  if (configIdMatch && request.method === "GET") {
    const id = parseInt(configIdMatch[1]!);
    const result = await db.execute({
      sql: "SELECT * FROM bom_step_configurations WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Configuration not found" }, { status: 404 });
    }

    // Get associated steps
    const stepsResult = await db.execute({
      sql: `
        SELECT bcs.*, bs.name, bs.step_code, bs.time_per_piece_seconds
        FROM bom_config_steps bcs
        JOIN bom_steps bs ON bcs.bom_step_id = bs.id
        WHERE bcs.config_id = ?
        ORDER BY bcs.sequence
      `,
      args: [id],
    });

    return Response.json({
      ...result.rows[0],
      steps: stepsResult.rows,
    });
  }

  // PATCH /api/bom-step-configs/:id
  if (configIdMatch && request.method === "PATCH") {
    const id = parseInt(configIdMatch[1]!);
    const body = await request.json() as any;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.config_name !== undefined) {
      updates.push("config_name = ?");
      params.push(body.config_name);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      params.push(body.description);
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      params.push(body.status);
    }
    if (body.is_default !== undefined) {
      // Clear other defaults first
      const configResult = await db.execute({
        sql: "SELECT fishbowl_bom_id FROM bom_step_configurations WHERE id = ?",
        args: [id],
      });
      if (configResult.rows.length > 0 && body.is_default) {
        const bomId = (configResult.rows[0] as any).fishbowl_bom_id;
        await db.execute({
          sql: "UPDATE bom_step_configurations SET is_default = 0 WHERE fishbowl_bom_id = ?",
          args: [bomId],
        });
      }
      updates.push("is_default = ?");
      params.push(body.is_default ? 1 : 0);
    }
    if (body.total_time_seconds !== undefined) {
      updates.push("total_time_seconds = ?");
      params.push(body.total_time_seconds);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No updates provided" }, { status: 400 });
    }

    params.push(id);

    const result = await db.execute({
      sql: `UPDATE bom_step_configurations SET ${updates.join(", ")} WHERE id = ? RETURNING *`,
      args: params,
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "Configuration not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  }

  // DELETE /api/bom-step-configs/:id
  if (configIdMatch && request.method === "DELETE") {
    const id = parseInt(configIdMatch[1]!);
    const result = await db.execute({
      sql: "DELETE FROM bom_step_configurations WHERE id = ?",
      args: [id],
    });

    if (result.rowsAffected === 0) {
      return Response.json({ error: "Configuration not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // POST /api/bom-step-configs/:id/steps - add steps to config
  const configStepsMatch = url.pathname.match(/^\/api\/bom-step-configs\/(\d+)\/steps$/);
  if (configStepsMatch && request.method === "POST") {
    const configId = parseInt(configStepsMatch[1]!);
    const body = await request.json() as any;

    if (!body.bom_step_id || body.sequence === undefined) {
      return Response.json({ error: "Missing bom_step_id or sequence" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO bom_config_steps (config_id, bom_step_id, sequence)
        VALUES (?, ?, ?)
        RETURNING *
      `,
      args: [configId, body.bom_step_id, body.sequence],
    });

    return Response.json(result.rows[0], { status: 201 });
  }

  return null;
}

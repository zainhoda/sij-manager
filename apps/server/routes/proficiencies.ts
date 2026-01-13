import { db } from "../db";
import type { WorkerProficiency, ProductStep } from "../db/schema";

interface ProficiencyWithStep extends WorkerProficiency {
  step_name: string;
  product_name: string;
  category: string;
}

export async function handleProficiencies(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/workers/:id/proficiencies - get all proficiencies for a worker
  const workerProfMatch = url.pathname.match(/^\/api\/workers\/(\d+)\/proficiencies$/);
  if (workerProfMatch && request.method === "GET") {
    const workerId = parseInt(workerProfMatch[1]!);
    return getWorkerProficiencies(workerId);
  }

  // GET /api/proficiencies - list all proficiencies (admin view)
  if (url.pathname === "/api/proficiencies" && request.method === "GET") {
    const result = await db.execute(`
      SELECT wp.*, ps.name as step_name, ps.category, p.name as product_name
      FROM worker_proficiencies wp
      JOIN product_steps ps ON wp.product_step_id = ps.id
      JOIN products p ON ps.product_id = p.id
      ORDER BY wp.worker_id, p.name, ps.sequence
    `);
    const proficiencies = result.rows as unknown as ProficiencyWithStep[];
    return Response.json(proficiencies);
  }

  // POST /api/proficiencies - create or update proficiency
  if (url.pathname === "/api/proficiencies" && request.method === "POST") {
    return handleCreateOrUpdateProficiency(request);
  }

  // PATCH /api/proficiencies/:id - update proficiency level
  const patchMatch = url.pathname.match(/^\/api\/proficiencies\/(\d+)$/);
  if (patchMatch && request.method === "PATCH") {
    return handleUpdateProficiency(request, parseInt(patchMatch[1]!));
  }

  // DELETE /api/proficiencies/:id - remove proficiency override
  if (patchMatch && request.method === "DELETE") {
    return handleDeleteProficiency(parseInt(patchMatch[1]!));
  }

  return null;
}

async function getWorkerProficiencies(workerId: number): Promise<Response> {
  // Check if worker exists
  const workerResult = await db.execute({
    sql: "SELECT id FROM workers WHERE id = ?",
    args: [workerId]
  });
  const worker = workerResult.rows[0];
  if (!worker) {
    return Response.json({ error: "Worker not found" }, { status: 404 });
  }

  // Get all product steps with their proficiency levels (or default 3)
  const profResult = await db.execute({
    sql: `
    SELECT
      ps.id as product_step_id,
      ps.name as step_name,
      ps.category,
      ps.sequence,
      p.id as product_id,
      p.name as product_name,
      COALESCE(wp.id, 0) as id,
      COALESCE(wp.level, 3) as level,
      wp.created_at,
      wp.updated_at
    FROM product_steps ps
    JOIN products p ON ps.product_id = p.id
    LEFT JOIN worker_proficiencies wp ON wp.product_step_id = ps.id AND wp.worker_id = ?
    ORDER BY p.name, ps.sequence
  `,
    args: [workerId]
  });
  
  const proficiencies = profResult.rows as unknown as {
    product_step_id: number;
    step_name: string;
    category: string;
    sequence: number;
    product_id: number;
    product_name: string;
    id: number;
    level: number;
    created_at: string | null;
    updated_at: string | null;
  }[];

  // Group by product for easier UI rendering
  const byProduct: Record<string, {
    product_id: number;
    product_name: string;
    steps: typeof proficiencies;
  }> = {};

  for (const prof of proficiencies) {
    if (!byProduct[prof.product_name]) {
      byProduct[prof.product_name] = {
        product_id: prof.product_id,
        product_name: prof.product_name,
        steps: [],
      };
    }
    byProduct[prof.product_name]!.steps.push(prof);
  }

  return Response.json({
    worker_id: workerId,
    proficiencies,
    by_product: Object.values(byProduct),
  });
}

async function handleCreateOrUpdateProficiency(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      worker_id: number;
      product_step_id: number;
      level: number;
    };

    if (!body.worker_id || !body.product_step_id || body.level === undefined) {
      return Response.json(
        { error: "Missing required fields: worker_id, product_step_id, level" },
        { status: 400 }
      );
    }

    if (body.level < 1 || body.level > 5) {
      return Response.json(
        { error: "Level must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Verify worker exists
    const workerResult = await db.execute({
      sql: "SELECT id FROM workers WHERE id = ?",
      args: [body.worker_id]
    });
    const worker = workerResult.rows[0];
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    // Verify product step exists
    const stepResult = await db.execute({
      sql: "SELECT id FROM product_steps WHERE id = ?",
      args: [body.product_step_id]
    });
    const step = stepResult.rows[0];
    if (!step) {
      return Response.json({ error: "Product step not found" }, { status: 404 });
    }

    // Check if proficiency already exists
    const existingResult = await db.execute({
      sql: "SELECT * FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
      args: [body.worker_id, body.product_step_id]
    });
    const existing = existingResult.rows[0] as unknown as WorkerProficiency | undefined;

    if (existing) {
      // Record history if level changed
      if (existing.level !== body.level) {
        await db.execute({
          sql: `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason)
           VALUES (?, ?, ?, ?, 'manual')`,
          args: [body.worker_id, body.product_step_id, existing.level, body.level]
        });
      }

      // Update existing
      await db.execute({
        sql: `UPDATE worker_proficiencies SET level = ?, updated_at = CURRENT_TIMESTAMP
         WHERE worker_id = ? AND product_step_id = ?`,
        args: [body.level, body.worker_id, body.product_step_id]
      });

      const updatedResult = await db.execute({
        sql: "SELECT * FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
        args: [body.worker_id, body.product_step_id]
      });
      const updated = updatedResult.rows[0] as unknown as WorkerProficiency;

      return Response.json(updated);
    } else {
      // Record history for new proficiency if not default level
      if (body.level !== 3) {
        await db.execute({
          sql: `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason)
           VALUES (?, ?, 3, ?, 'manual')`,
          args: [body.worker_id, body.product_step_id, body.level]
        });
      }

      // Insert new
      const result = await db.execute({
        sql: `INSERT INTO worker_proficiencies (worker_id, product_step_id, level)
         VALUES (?, ?, ?)`,
        args: [body.worker_id, body.product_step_id, body.level]
      });

      const createdResult = await db.execute({
        sql: "SELECT * FROM worker_proficiencies WHERE id = ?",
        args: [result.lastInsertRowid]
      });
      const created = createdResult.rows[0] as unknown as WorkerProficiency;

      return Response.json(created, { status: 201 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateProficiency(request: Request, proficiencyId: number): Promise<Response> {
  try {
    const existingResult = await db.execute({
      sql: "SELECT * FROM worker_proficiencies WHERE id = ?",
      args: [proficiencyId]
    });
    const existing = existingResult.rows[0] as unknown as WorkerProficiency | undefined;

    if (!existing) {
      return Response.json({ error: "Proficiency not found" }, { status: 404 });
    }

    const body = await request.json() as { level: number };

    if (body.level === undefined || body.level < 1 || body.level > 5) {
      return Response.json(
        { error: "Level must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Record history if level changed
    if (existing.level !== body.level) {
      await db.execute({
        sql: `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason)
         VALUES (?, ?, ?, ?, 'manual')`,
        args: [existing.worker_id, existing.product_step_id, existing.level, body.level]
      });
    }

    await db.execute({
      sql: `UPDATE worker_proficiencies SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [body.level, proficiencyId]
    });

    const updatedResult = await db.execute({
      sql: "SELECT * FROM worker_proficiencies WHERE id = ?",
      args: [proficiencyId]
    });
    const updated = updatedResult.rows[0] as unknown as WorkerProficiency;

    return Response.json(updated);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleDeleteProficiency(proficiencyId: number): Promise<Response> {
  const existingResult = await db.execute({
    sql: "SELECT * FROM worker_proficiencies WHERE id = ?",
    args: [proficiencyId]
  });
  const existing = existingResult.rows[0] as unknown as WorkerProficiency | undefined;

  if (!existing) {
    return Response.json({ error: "Proficiency not found" }, { status: 404 });
  }

  // Record history for deletion (reverting to default)
  await db.execute({
    sql: `INSERT INTO proficiency_history (worker_id, product_step_id, old_level, new_level, reason)
     VALUES (?, ?, ?, 3, 'manual')`,
    args: [existing.worker_id, existing.product_step_id, existing.level]
  });

  await db.execute({
    sql: "DELETE FROM worker_proficiencies WHERE id = ?",
    args: [proficiencyId]
  });

  return Response.json({ success: true });
}

// Helper function to get proficiency level for a worker-step pair
export async function getWorkerProficiencyLevel(workerId: number, productStepId: number): Promise<number> {
  const result = await db.execute({
    sql: "SELECT level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
    args: [workerId, productStepId]
  });
  const prof = result.rows[0] as unknown as { level: number } | undefined;

  return prof?.level ?? 3; // Default to level 3 (standard)
}

// Proficiency multipliers for time calculation
export const PROFICIENCY_MULTIPLIERS: Record<number, number> = {
  1: 1.5,   // 50% slower
  2: 1.25,  // 25% slower
  3: 1.0,   // Standard
  4: 0.85,  // 15% faster
  5: 0.7,   // 30% faster
};

// Get time multiplier for a worker-step combination
export async function getProficiencyMultiplier(workerId: number, productStepId: number): Promise<number> {
  const level = await getWorkerProficiencyLevel(workerId, productStepId);
  return PROFICIENCY_MULTIPLIERS[level] ?? 1.0;
}

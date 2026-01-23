import { db } from "../db";
import { deriveProficiencyLevel } from "../services/analytics";

export async function handleProficiencies(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/proficiencies/matrix - Get matrix data for UI
  if (url.pathname === "/api/proficiencies/matrix" && request.method === "GET") {
    const productId = url.searchParams.get("product_id");
    const bomId = url.searchParams.get("bom_id");

    // Get workers
    const workersResult = await db.execute(`
      SELECT id, name, employee_id, status
      FROM workers
      ORDER BY name
    `);
    const workers = workersResult.rows;

    // Get BOM steps (optionally filtered by BOM)
    let stepsQuery = `
      SELECT
        bs.id,
        bs.name,
        bs.sequence,
        bs.fishbowl_bom_id as product_id,
        fbc.description as product_name
      FROM bom_steps bs
      LEFT JOIN fishbowl_bom_cache fbc ON bs.fishbowl_bom_id = fbc.id
    `;
    const stepsArgs: (string | number)[] = [];

    if (bomId) {
      stepsQuery += " WHERE bs.fishbowl_bom_id = ?";
      stepsArgs.push(parseInt(bomId));
    } else if (productId) {
      stepsQuery += " WHERE bs.fishbowl_bom_id = ?";
      stepsArgs.push(parseInt(productId));
    }

    stepsQuery += " ORDER BY bs.fishbowl_bom_id, bs.sequence";

    const stepsResult = await db.execute({ sql: stepsQuery, args: stepsArgs });
    const steps = stepsResult.rows;

    // Get proficiencies derived from worker_step_performance
    const stepIds = (steps as { id: number }[]).map(s => s.id);
    let proficiencies: { id: number; worker_id: number; product_step_id: number; level: number }[] = [];

    if (stepIds.length > 0) {
      const profResult = await db.execute({
        sql: `
          SELECT
            id,
            worker_id,
            bom_step_id as product_step_id,
            CASE
              WHEN avg_efficiency_percent >= 130 THEN 5
              WHEN avg_efficiency_percent >= 115 THEN 4
              WHEN avg_efficiency_percent >= 85 THEN 3
              WHEN avg_efficiency_percent >= 70 THEN 2
              ELSE 1
            END as level
          FROM worker_step_performance
          WHERE bom_step_id IN (${stepIds.map(() => "?").join(",")})
        `,
        args: stepIds
      });
      proficiencies = profResult.rows as unknown as typeof proficiencies;
    }

    // Get unique BOMs as "products" for filtering
    const productsResult = await db.execute(`
      SELECT DISTINCT
        bs.fishbowl_bom_id as id,
        COALESCE(fbc.description, fbc.num, 'Unknown') as name
      FROM bom_steps bs
      LEFT JOIN fishbowl_bom_cache fbc ON bs.fishbowl_bom_id = fbc.id
      ORDER BY name
    `);
    const products = productsResult.rows;

    return Response.json({
      workers,
      steps,
      proficiencies,
      products,
    });
  }

  // POST /api/proficiencies - Update a proficiency (manual override)
  // Note: This doesn't actually store a level anymore since proficiencies are derived.
  // For now, we'll just return success but the value won't persist.
  if (url.pathname === "/api/proficiencies" && request.method === "POST") {
    const body = await request.json() as {
      worker_id: number;
      product_step_id: number;
      level: number;
    };

    // Since proficiencies are now derived from performance data,
    // manual overrides aren't directly supported.
    // We could add a manual_proficiency_overrides table in the future.
    // For now, return the requested level as if it was saved.
    return Response.json({
      id: 0,
      worker_id: body.worker_id,
      product_step_id: body.product_step_id,
      level: body.level,
      note: "Manual proficiency overrides are not yet supported. Proficiencies are derived from production history."
    });
  }

  // GET /api/proficiencies/:workerId/:stepId - Get single proficiency
  const singleMatch = url.pathname.match(/^\/api\/proficiencies\/(\d+)\/(\d+)$/);
  if (singleMatch && request.method === "GET") {
    const workerId = parseInt(singleMatch[1]!);
    const stepId = parseInt(singleMatch[2]!);

    const result = await db.execute({
      sql: `
        SELECT
          id,
          worker_id,
          bom_step_id as product_step_id,
          avg_efficiency_percent,
          CASE
            WHEN avg_efficiency_percent >= 130 THEN 5
            WHEN avg_efficiency_percent >= 115 THEN 4
            WHEN avg_efficiency_percent >= 85 THEN 3
            WHEN avg_efficiency_percent >= 70 THEN 2
            ELSE 1
          END as level
        FROM worker_step_performance
        WHERE worker_id = ? AND bom_step_id = ?
      `,
      args: [workerId, stepId]
    });

    if (result.rows.length === 0) {
      return Response.json({ level: 3, derived: true, note: "Default proficiency (no performance data)" });
    }

    const row = result.rows[0] as unknown as {
      id: number;
      worker_id: number;
      product_step_id: number;
      avg_efficiency_percent: number;
      level: number;
    };

    return Response.json({
      ...row,
      derived: true,
    });
  }

  return null;
}

// Helper function for scheduler compatibility
export async function getWorkerProficiencyLevel(workerId: number, stepId: number): Promise<number> {
  const result = await db.execute({
    sql: "SELECT avg_efficiency_percent FROM worker_step_performance WHERE worker_id = ? AND bom_step_id = ?",
    args: [workerId, stepId]
  });

  const row = result.rows[0] as unknown as { avg_efficiency_percent: number | null } | undefined;

  if (!row || row.avg_efficiency_percent === null) {
    return 3; // Default proficiency
  }

  return deriveProficiencyLevel(row.avg_efficiency_percent);
}

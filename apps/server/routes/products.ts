import { db } from "../db";
import type { Product, ProductStep } from "../db/schema";

export async function handleProducts(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/products - list all products
  if (url.pathname === "/api/products" && request.method === "GET") {
    const result = await db.execute("SELECT * FROM products ORDER BY name");
    const products = result.rows as unknown as Product[];
    return Response.json(products);
  }

  // GET /api/products/:id - get single product
  const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch && request.method === "GET") {
    const productId = parseInt(productMatch[1]!);
    const result = await db.execute({
      sql: "SELECT * FROM products WHERE id = ?",
      args: [productId]
    });
    const product = result.rows[0] as unknown as Product | undefined;
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    return Response.json(product);
  }

  // GET /api/products/:id/steps - get product steps with dependencies
  const stepsMatch = url.pathname.match(/^\/api\/products\/(\d+)\/steps$/);
  if (stepsMatch && request.method === "GET") {
    const productId = parseInt(stepsMatch[1]!);

    // Get all steps for the product with equipment name joined
    const stepsResult = await db.execute({
      sql: `
      SELECT
        ps.*,
        e.name as equipment_name
      FROM product_steps ps
      LEFT JOIN equipment e ON ps.equipment_id = e.id
      WHERE ps.product_id = ?
      ORDER BY ps.sequence
    `,
      args: [productId]
    });
    const steps = stepsResult.rows as unknown as (ProductStep & { equipment_name: string | null })[];

    // Get dependencies for each step with dependency type
    const stepsWithDeps = await Promise.all(steps.map(async step => {
      const depsResult = await db.execute({
        sql: `
        SELECT sd.depends_on_step_id, sd.dependency_type
        FROM step_dependencies sd
        WHERE sd.step_id = ?
      `,
        args: [step.id]
      });
      const dependencies = depsResult.rows as unknown as Array<{ depends_on_step_id: number; dependency_type: string }>;

      return {
        ...step,
        // Include both simple array of IDs for backwards compatibility and detailed deps
        dependencies: dependencies.map(d => d.depends_on_step_id),
        dependencyDetails: dependencies.map(d => ({
          stepId: d.depends_on_step_id,
          type: d.dependency_type || 'finish',
        })),
      };
    }));

    return Response.json(stepsWithDeps);
  }

  // PUT /api/product-steps/:id/dependencies - replace all dependencies for a step
  // Body can be: { dependsOn: [1, 2] } for simple IDs (defaults to 'finish')
  // or: { dependencies: [{ stepId: 1, type: 'start' }, { stepId: 2, type: 'finish' }] } for typed deps
  const depsMatch = url.pathname.match(/^\/api\/product-steps\/(\d+)\/dependencies$/);
  if (depsMatch && request.method === "PUT") {
    const stepId = parseInt(depsMatch[1]!);
    const body = await request.json() as {
      dependsOn?: number[];
      dependencies?: Array<{ stepId: number; type: 'start' | 'finish' }>;
    };

    // Validate step exists
    const existing = await db.execute({
      sql: "SELECT id, product_id FROM product_steps WHERE id = ?",
      args: [stepId]
    });
    if (existing.rows.length === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }

    const productId = (existing.rows[0] as unknown as { product_id: number }).product_id;

    // Normalize dependencies to array of { stepId, type }
    const normalizedDeps: Array<{ stepId: number; type: 'start' | 'finish' }> = [];
    if (body.dependencies && body.dependencies.length > 0) {
      normalizedDeps.push(...body.dependencies);
    } else if (body.dependsOn && body.dependsOn.length > 0) {
      // Backwards compatible: simple IDs default to 'finish' type
      normalizedDeps.push(...body.dependsOn.map(id => ({ stepId: id, type: 'finish' as const })));
    }

    // Validate all dependency IDs exist and belong to the same product
    if (normalizedDeps.length > 0) {
      const depIds = normalizedDeps.map(d => d.stepId);
      const placeholders = depIds.map(() => "?").join(",");
      const validSteps = await db.execute({
        sql: `SELECT id FROM product_steps WHERE id IN (${placeholders}) AND product_id = ?`,
        args: [...depIds, productId]
      });
      if (validSteps.rows.length !== depIds.length) {
        return Response.json({ error: "Invalid dependency IDs" }, { status: 400 });
      }
    }

    // Delete existing dependencies
    await db.execute({
      sql: "DELETE FROM step_dependencies WHERE step_id = ?",
      args: [stepId]
    });

    // Insert new dependencies with type
    for (const dep of normalizedDeps) {
      await db.execute({
        sql: "INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type) VALUES (?, ?, ?)",
        args: [stepId, dep.stepId, dep.type]
      });
    }

    // Return updated dependencies with types
    const deps = await db.execute({
      sql: "SELECT depends_on_step_id, dependency_type FROM step_dependencies WHERE step_id = ?",
      args: [stepId]
    });

    return Response.json({
      stepId,
      dependencies: deps.rows.map((r: any) => r.depends_on_step_id),
      dependencyDetails: deps.rows.map((r: any) => ({
        stepId: r.depends_on_step_id,
        type: r.dependency_type || 'finish',
      })),
    });
  }

  // POST /api/products/:id/steps - create a new product step
  const createStepMatch = url.pathname.match(/^\/api\/products\/(\d+)\/steps$/);
  if (createStepMatch && request.method === "POST") {
    const productId = parseInt(createStepMatch[1]!);
    const body = await request.json() as Partial<ProductStep>;

    // Validate product exists
    const productExists = await db.execute({
      sql: "SELECT id FROM products WHERE id = ?",
      args: [productId]
    });
    if (productExists.rows.length === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    // Validate required fields
    if (!body.step_code || body.step_code.trim() === "") {
      return Response.json({ error: "Step code is required" }, { status: 400 });
    }
    if (!body.name || body.name.trim() === "") {
      return Response.json({ error: "Step name is required" }, { status: 400 });
    }

    // Validate step_code is unique within product
    const duplicateCheck = await db.execute({
      sql: "SELECT id FROM product_steps WHERE product_id = ? AND step_code = ?",
      args: [productId, body.step_code.trim()]
    });
    if (duplicateCheck.rows.length > 0) {
      return Response.json({ error: "Step code must be unique within the product" }, { status: 400 });
    }

    // Get next sequence number
    const maxSeq = await db.execute({
      sql: "SELECT MAX(sequence) as max_seq FROM product_steps WHERE product_id = ?",
      args: [productId]
    });
    const nextSequence = ((maxSeq.rows[0] as unknown as { max_seq: number | null })?.max_seq || 0) + 1;

    // Insert new step
    const result = await db.execute({
      sql: `INSERT INTO product_steps (product_id, step_code, name, category, time_per_piece_seconds, sequence, equipment_id, required_skill_category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        productId,
        body.step_code.trim(),
        body.name.trim(),
        body.category || null,
        body.time_per_piece_seconds || 60,
        body.sequence || nextSequence,
        body.equipment_id || null,
        "OTHER" // Default skill category
      ]
    });

    // Return the created step with equipment name
    const newStep = await db.execute({
      sql: `SELECT ps.*, e.name as equipment_name
            FROM product_steps ps
            LEFT JOIN equipment e ON ps.equipment_id = e.id
            WHERE ps.id = ?`,
      args: [result.lastInsertRowid!]
    });

    return Response.json(newStep.rows[0], { status: 201 });
  }

  // DELETE /api/product-steps/:id - delete a product step
  const deleteStepMatch = url.pathname.match(/^\/api\/product-steps\/(\d+)$/);
  if (deleteStepMatch && request.method === "DELETE") {
    const stepId = parseInt(deleteStepMatch[1]!);

    // Check step exists
    const existing = await db.execute({
      sql: "SELECT id FROM product_steps WHERE id = ?",
      args: [stepId]
    });
    if (existing.rows.length === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }

    // Delete dependencies first (where this step is a dependency)
    await db.execute({
      sql: "DELETE FROM step_dependencies WHERE step_id = ? OR depends_on_step_id = ?",
      args: [stepId, stepId]
    });

    // Delete the step
    await db.execute({
      sql: "DELETE FROM product_steps WHERE id = ?",
      args: [stepId]
    });

    return Response.json({ success: true, deletedId: stepId });
  }

  // PATCH /api/product-steps/:id - update a product step
  const stepPatchMatch = url.pathname.match(/^\/api\/product-steps\/(\d+)$/);
  if (stepPatchMatch && request.method === "PATCH") {
    const stepId = parseInt(stepPatchMatch[1]!);
    const body = await request.json() as Partial<ProductStep>;

    // Validate step exists and get product_id
    const existing = await db.execute({
      sql: "SELECT id, product_id FROM product_steps WHERE id = ?",
      args: [stepId]
    });
    if (existing.rows.length === 0) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }
    const productId = (existing.rows[0] as unknown as { product_id: number }).product_id;

    // Validate step_code if being updated
    if ("step_code" in body) {
      const newStepCode = body.step_code;

      // step_code is required (cannot be null or empty)
      if (!newStepCode || newStepCode.trim() === "") {
        return Response.json({ error: "Step code is required" }, { status: 400 });
      }

      // step_code must be unique within the product
      const duplicateCheck = await db.execute({
        sql: "SELECT id FROM product_steps WHERE product_id = ? AND step_code = ? AND id != ?",
        args: [productId, newStepCode.trim(), stepId]
      });
      if (duplicateCheck.rows.length > 0) {
        return Response.json({ error: "Step code must be unique within the product" }, { status: 400 });
      }

      // Trim the step_code
      body.step_code = newStepCode.trim();
    }

    // Build dynamic update query
    const allowedFields = ["name", "category", "time_per_piece_seconds", "sequence", "step_code", "equipment_id"];
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        args.push((body as Record<string, unknown>)[field] as string | number | null);
      }
    }

    if (updates.length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    args.push(stepId);
    await db.execute({
      sql: `UPDATE product_steps SET ${updates.join(", ")} WHERE id = ?`,
      args
    });

    // Return updated step with equipment name
    const result = await db.execute({
      sql: `
        SELECT ps.*, e.name as equipment_name
        FROM product_steps ps
        LEFT JOIN equipment e ON ps.equipment_id = e.id
        WHERE ps.id = ?
      `,
      args: [stepId]
    });

    return Response.json(result.rows[0]);
  }

  return null;
}

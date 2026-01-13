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

    // Get all steps for the product
    const stepsResult = await db.execute({
      sql: `
      SELECT * FROM product_steps
      WHERE product_id = ?
      ORDER BY sequence
    `,
      args: [productId]
    });
    const steps = stepsResult.rows as unknown as ProductStep[];

    // Get dependencies for each step
    const stepsWithDeps = await Promise.all(steps.map(async step => {
      const depsResult = await db.execute({
        sql: `
        SELECT ps.* FROM product_steps ps
        JOIN step_dependencies sd ON ps.id = sd.depends_on_step_id
        WHERE sd.step_id = ?
      `,
        args: [step.id]
      });
      const dependencies = depsResult.rows as unknown as ProductStep[];

      return {
        ...step,
        dependencies: dependencies.map(d => d.id),
      };
    }));

    return Response.json(stepsWithDeps);
  }

  return null;
}

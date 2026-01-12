import { db } from "../db";
import type { Product, ProductStep } from "../db/schema";

export function handleProducts(request: Request): Response | null {
  const url = new URL(request.url);

  // GET /api/products - list all products
  if (url.pathname === "/api/products" && request.method === "GET") {
    const products = db.query("SELECT * FROM products ORDER BY name").all() as Product[];
    return Response.json(products);
  }

  // GET /api/products/:id - get single product
  const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch && request.method === "GET") {
    const productId = parseInt(productMatch[1]!);
    const product = db.query("SELECT * FROM products WHERE id = ?").get(productId) as Product | null;
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
    const steps = db.query(`
      SELECT * FROM product_steps
      WHERE product_id = ?
      ORDER BY sequence
    `).all(productId) as ProductStep[];

    // Get dependencies for each step
    const stepsWithDeps = steps.map(step => {
      const dependencies = db.query(`
        SELECT ps.* FROM product_steps ps
        JOIN step_dependencies sd ON ps.id = sd.depends_on_step_id
        WHERE sd.step_id = ?
      `).all(step.id) as ProductStep[];

      return {
        ...step,
        dependencies: dependencies.map(d => d.id),
      };
    });

    return Response.json(stepsWithDeps);
  }

  return null;
}

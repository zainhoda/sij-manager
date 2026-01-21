import { db } from "../db";

export async function handleWorkCategories(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/work-categories - list all work categories
  if (url.pathname === "/api/work-categories" && request.method === "GET") {
    const result = await db.execute("SELECT * FROM work_categories ORDER BY name");
    return Response.json({ categories: result.rows });
  }

  // POST /api/work-categories - create a new work category
  if (url.pathname === "/api/work-categories" && request.method === "POST") {
    const body = await request.json() as { name: string; description?: string };

    if (!body.name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    // Check if already exists
    const existing = await db.execute({
      sql: "SELECT id FROM work_categories WHERE name = ?",
      args: [body.name],
    });
    if (existing.rows.length > 0) {
      return Response.json({ error: "Category already exists", id: existing.rows[0] }, { status: 409 });
    }

    const result = await db.execute({
      sql: "INSERT INTO work_categories (name, description) VALUES (?, ?) RETURNING *",
      args: [body.name, body.description || null],
    });

    return Response.json(result.rows[0], { status: 201 });
  }

  // POST /api/work-categories/seed-from-fishbowl - create categories matching Fishbowl instruction names
  if (url.pathname === "/api/work-categories/seed-from-fishbowl" && request.method === "POST") {
    const categories = [
      { name: "Sewing Dept.", description: "Sewing operations" },
      { name: "Cutting Dept.", description: "Cutting operations" },
      { name: "Screening Dept.", description: "Screen printing / silk screening" },
      { name: "Inspection", description: "Quality inspection" },
      { name: "Packing", description: "Packaging and shipping prep" },
      { name: "Prep", description: "Preparation work" },
      { name: "Finishing Dept.", description: "Final finishing operations" },
      { name: "Assembly", description: "Assembly operations" },
    ];

    const created = [];
    const skipped = [];

    for (const cat of categories) {
      const existing = await db.execute({
        sql: "SELECT id FROM work_categories WHERE name = ?",
        args: [cat.name],
      });

      if (existing.rows.length > 0) {
        skipped.push(cat.name);
      } else {
        await db.execute({
          sql: "INSERT INTO work_categories (name, description) VALUES (?, ?)",
          args: [cat.name, cat.description],
        });
        created.push(cat.name);
      }
    }

    return Response.json({ created, skipped });
  }

  return null;
}

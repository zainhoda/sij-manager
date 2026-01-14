import { db } from "../db";

export async function handleWorkCategories(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/work-categories - list all work categories
  if (url.pathname === "/api/work-categories" && request.method === "GET") {
    const result = await db.execute("SELECT * FROM work_categories ORDER BY name");
    return Response.json(result.rows);
  }

  return null;
}

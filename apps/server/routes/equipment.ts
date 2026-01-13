import { db } from "../db";
import type { Equipment } from "../db/schema";
import type { SQLQueryBindings } from "bun:sqlite";

export async function handleEquipment(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/equipment - list all equipment
  if (url.pathname === "/api/equipment" && request.method === "GET") {
    const equipment = db.query("SELECT * FROM equipment ORDER BY name").all() as Equipment[];
    return Response.json(equipment);
  }

  // POST /api/equipment - create new equipment
  if (url.pathname === "/api/equipment" && request.method === "POST") {
    return handleCreateEquipment(request);
  }

  // GET /api/equipment/:id - get single equipment
  const equipmentMatch = url.pathname.match(/^\/api\/equipment\/(\d+)$/);
  if (equipmentMatch && request.method === "GET") {
    const equipmentId = parseInt(equipmentMatch[1]!);
    const equipment = db.query("SELECT * FROM equipment WHERE id = ?").get(equipmentId) as Equipment | null;
    if (!equipment) {
      return Response.json({ error: "Equipment not found" }, { status: 404 });
    }
    return Response.json(equipment);
  }

  // PATCH /api/equipment/:id - update equipment
  if (equipmentMatch && request.method === "PATCH") {
    return handleUpdateEquipment(request, parseInt(equipmentMatch[1]!));
  }

  // DELETE /api/equipment/:id - delete equipment
  if (equipmentMatch && request.method === "DELETE") {
    return handleDeleteEquipment(parseInt(equipmentMatch[1]!));
  }

  // GET /api/equipment/:id/certified-workers - get workers certified for this equipment
  const certifiedWorkersMatch = url.pathname.match(/^\/api\/equipment\/(\d+)\/certified-workers$/);
  if (certifiedWorkersMatch && request.method === "GET") {
    const equipmentId = parseInt(certifiedWorkersMatch[1]!);
    const workers = db.query(`
      SELECT w.*, ec.certified_at, ec.expires_at
      FROM workers w
      JOIN equipment_certifications ec ON w.id = ec.worker_id
      WHERE ec.equipment_id = ?
      ORDER BY w.name
    `).all(equipmentId);
    return Response.json(workers);
  }

  return null;
}

async function handleCreateEquipment(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { name: string; description?: string };

    if (!body.name) {
      return Response.json({ error: "Missing required field: name" }, { status: 400 });
    }

    // Check if name already exists
    const existing = db.query("SELECT id FROM equipment WHERE name = ?").get(body.name);
    if (existing) {
      return Response.json({ error: "Equipment with this name already exists" }, { status: 409 });
    }

    const result = db.run(
      "INSERT INTO equipment (name, description) VALUES (?, ?)",
      [body.name, body.description || null]
    );

    const equipment = db.query("SELECT * FROM equipment WHERE id = ?").get(result.lastInsertRowid) as Equipment;
    return Response.json(equipment, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateEquipment(request: Request, equipmentId: number): Promise<Response> {
  try {
    const body = await request.json() as { name?: string; description?: string; status?: string };

    const updates: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (body.name !== undefined) {
      // Check if name already exists (for another equipment)
      const existing = db.query("SELECT id FROM equipment WHERE name = ? AND id != ?").get(body.name, equipmentId);
      if (existing) {
        return Response.json({ error: "Equipment with this name already exists" }, { status: 409 });
      }
      updates.push("name = ?");
      values.push(body.name);
    }

    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }

    if (body.status !== undefined) {
      if (!['available', 'in_use', 'maintenance', 'retired'].includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(equipmentId);
    db.run(`UPDATE equipment SET ${updates.join(", ")} WHERE id = ?`, values);

    const equipment = db.query("SELECT * FROM equipment WHERE id = ?").get(equipmentId) as Equipment | null;
    if (!equipment) {
      return Response.json({ error: "Equipment not found" }, { status: 404 });
    }

    return Response.json(equipment);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

function handleDeleteEquipment(equipmentId: number): Response {
  const equipment = db.query("SELECT * FROM equipment WHERE id = ?").get(equipmentId) as Equipment | null;
  if (!equipment) {
    return Response.json({ error: "Equipment not found" }, { status: 404 });
  }

  // Check if equipment is in use by any product steps
  const inUse = db.query("SELECT id FROM product_steps WHERE equipment_id = ?").get(equipmentId);
  if (inUse) {
    return Response.json({ error: "Cannot delete equipment that is assigned to product steps" }, { status: 409 });
  }

  db.run("DELETE FROM equipment WHERE id = ?", [equipmentId]);
  return Response.json({ success: true });
}

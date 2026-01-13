import { db } from "../db";
import type { Equipment } from "../db/schema";

export async function handleEquipment(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/equipment - list all equipment
  if (url.pathname === "/api/equipment" && request.method === "GET") {
    const result = await db.execute("SELECT * FROM equipment ORDER BY name");
    const equipment = result.rows as unknown as Equipment[];
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
    const result = await db.execute({
      sql: "SELECT * FROM equipment WHERE id = ?",
      args: [equipmentId]
    });
    const equipment = result.rows[0] as unknown as Equipment | undefined;
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
    const result = await db.execute({
      sql: `
      SELECT w.*, ec.certified_at, ec.expires_at
      FROM workers w
      JOIN equipment_certifications ec ON w.id = ec.worker_id
      WHERE ec.equipment_id = ?
      ORDER BY w.name
    `,
      args: [equipmentId]
    });
    const workers = result.rows;
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
    const existingResult = await db.execute({
      sql: "SELECT id FROM equipment WHERE name = ?",
      args: [body.name]
    });
    if (existingResult.rows.length > 0) {
      return Response.json({ error: "Equipment with this name already exists" }, { status: 409 });
    }

    const result = await db.execute({
      sql: "INSERT INTO equipment (name, description) VALUES (?, ?)",
      args: [body.name, body.description || null]
    });

    const newEquipmentResult = await db.execute({
      sql: "SELECT * FROM equipment WHERE id = ?",
      args: [result.lastInsertRowid]
    });
    const equipment = newEquipmentResult.rows[0] as unknown as Equipment;
    return Response.json(equipment, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateEquipment(request: Request, equipmentId: number): Promise<Response> {
  try {
    const body = await request.json() as { name?: string; description?: string; status?: string };

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      // Check if name already exists (for another equipment)
      const existingResult = await db.execute({
        sql: "SELECT id FROM equipment WHERE name = ? AND id != ?",
        args: [body.name, equipmentId]
      });
      if (existingResult.rows.length > 0) {
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
    await db.execute({
      sql: `UPDATE equipment SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    const equipmentResult = await db.execute({
      sql: "SELECT * FROM equipment WHERE id = ?",
      args: [equipmentId]
    });
    const equipment = equipmentResult.rows[0] as unknown as Equipment | undefined;
    
    if (!equipment) {
      return Response.json({ error: "Equipment not found" }, { status: 404 });
    }

    return Response.json(equipment);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleDeleteEquipment(equipmentId: number): Promise<Response> {
  const equipmentResult = await db.execute({
    sql: "SELECT * FROM equipment WHERE id = ?",
    args: [equipmentId]
  });
  const equipment = equipmentResult.rows[0];
  
  if (!equipment) {
    return Response.json({ error: "Equipment not found" }, { status: 404 });
  }

  // Check if equipment is in use by any product steps
  const inUseResult = await db.execute({
    sql: "SELECT id FROM product_steps WHERE equipment_id = ?",
    args: [equipmentId]
  });
  
  if (inUseResult.rows.length > 0) {
    return Response.json({ error: "Cannot delete equipment that is assigned to product steps" }, { status: 409 });
  }

  await db.execute({
    sql: "DELETE FROM equipment WHERE id = ?",
    args: [equipmentId]
  });
  return Response.json({ success: true });
}

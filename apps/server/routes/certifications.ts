import { db } from "../db";
import type { EquipmentCertification, Worker, Equipment } from "../db/schema";

export async function handleCertifications(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/certifications - list all certifications
  if (url.pathname === "/api/certifications" && request.method === "GET") {
    const result = await db.execute(`
      SELECT ec.*, w.name as worker_name, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN workers w ON ec.worker_id = w.id
      JOIN equipment e ON ec.equipment_id = e.id
      ORDER BY w.name, e.name
    `);
    const certifications = result.rows;
    return Response.json(certifications);
  }

  // POST /api/certifications - grant certification
  if (url.pathname === "/api/certifications" && request.method === "POST") {
    return handleGrantCertification(request);
  }

  // DELETE /api/certifications/:id - revoke certification
  const certMatch = url.pathname.match(/^\/api\/certifications\/(\d+)$/);
  if (certMatch && request.method === "DELETE") {
    return handleRevokeCertification(parseInt(certMatch[1]!));
  }

  return null;
}

async function handleGrantCertification(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      worker_id: number;
      equipment_id: number;
      expires_at?: string;
    };

    if (!body.worker_id || !body.equipment_id) {
      return Response.json(
        { error: "Missing required fields: worker_id, equipment_id" },
        { status: 400 }
      );
    }

    // Verify worker exists
    const workerResult = await db.execute({
      sql: "SELECT id FROM workers WHERE id = ?",
      args: [body.worker_id]
    });
    const worker = workerResult.rows[0] as unknown as Worker | undefined;
    
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    // Verify equipment exists
    const equipmentResult = await db.execute({
      sql: "SELECT id FROM equipment WHERE id = ?",
      args: [body.equipment_id]
    });
    const equipment = equipmentResult.rows[0] as unknown as Equipment | undefined;
    
    if (!equipment) {
      return Response.json({ error: "Equipment not found" }, { status: 404 });
    }

    // Check if certification already exists
    const existingResult = await db.execute({
      sql: "SELECT id FROM equipment_certifications WHERE worker_id = ? AND equipment_id = ?",
      args: [body.worker_id, body.equipment_id]
    });
    const existing = existingResult.rows[0];
    
    if (existing) {
      return Response.json({ error: "Worker already has this certification" }, { status: 409 });
    }

    const result = await db.execute({
      sql: "INSERT INTO equipment_certifications (worker_id, equipment_id, expires_at) VALUES (?, ?, ?)",
      args: [body.worker_id, body.equipment_id, body.expires_at || null]
    });

    const certResult = await db.execute({
      sql: `
      SELECT ec.*, w.name as worker_name, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN workers w ON ec.worker_id = w.id
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.id = ?
    `,
      args: [result.lastInsertRowid]
    });
    const certification = certResult.rows[0];

    return Response.json(certification, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleRevokeCertification(certificationId: number): Promise<Response> {
  const certResult = await db.execute({
    sql: "SELECT * FROM equipment_certifications WHERE id = ?",
    args: [certificationId]
  });
  const certification = certResult.rows[0] as unknown as EquipmentCertification | undefined;

  if (!certification) {
    return Response.json({ error: "Certification not found" }, { status: 404 });
  }

  await db.execute({
    sql: "DELETE FROM equipment_certifications WHERE id = ?",
    args: [certificationId]
  });
  return Response.json({ success: true });
}

import { db } from "../db";
import type { EquipmentCertification, Worker, Equipment } from "../db/schema";

export async function handleCertifications(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/certifications - list all certifications
  if (url.pathname === "/api/certifications" && request.method === "GET") {
    const certifications = db.query(`
      SELECT ec.*, w.name as worker_name, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN workers w ON ec.worker_id = w.id
      JOIN equipment e ON ec.equipment_id = e.id
      ORDER BY w.name, e.name
    `).all();
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
    const worker = db.query("SELECT id FROM workers WHERE id = ?").get(body.worker_id) as Worker | null;
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    // Verify equipment exists
    const equipment = db.query("SELECT id FROM equipment WHERE id = ?").get(body.equipment_id) as Equipment | null;
    if (!equipment) {
      return Response.json({ error: "Equipment not found" }, { status: 404 });
    }

    // Check if certification already exists
    const existing = db.query(
      "SELECT id FROM equipment_certifications WHERE worker_id = ? AND equipment_id = ?"
    ).get(body.worker_id, body.equipment_id);
    if (existing) {
      return Response.json({ error: "Worker already has this certification" }, { status: 409 });
    }

    const result = db.run(
      "INSERT INTO equipment_certifications (worker_id, equipment_id, expires_at) VALUES (?, ?, ?)",
      [body.worker_id, body.equipment_id, body.expires_at || null]
    );

    const certification = db.query(`
      SELECT ec.*, w.name as worker_name, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN workers w ON ec.worker_id = w.id
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.id = ?
    `).get(result.lastInsertRowid);

    return Response.json(certification, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

function handleRevokeCertification(certificationId: number): Response {
  const certification = db.query(
    "SELECT * FROM equipment_certifications WHERE id = ?"
  ).get(certificationId) as EquipmentCertification | null;

  if (!certification) {
    return Response.json({ error: "Certification not found" }, { status: 404 });
  }

  db.run("DELETE FROM equipment_certifications WHERE id = ?", [certificationId]);
  return Response.json({ success: true });
}

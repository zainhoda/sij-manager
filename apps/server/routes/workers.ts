import { db } from "../db";
import type { Worker, EquipmentCertification, Equipment } from "../db/schema";
import type { SQLQueryBindings } from "bun:sqlite";

interface WorkerWithCertifications extends Worker {
  certifications: (EquipmentCertification & { equipment_name: string })[];
}

export async function handleWorkers(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/workers - list all workers
  if (url.pathname === "/api/workers" && request.method === "GET") {
    const workers = db.query("SELECT * FROM workers ORDER BY name").all() as Worker[];

    // Get certifications for each worker
    const workersWithCerts: WorkerWithCertifications[] = workers.map(worker => {
      const certifications = db.query(`
        SELECT ec.*, e.name as equipment_name
        FROM equipment_certifications ec
        JOIN equipment e ON ec.equipment_id = e.id
        WHERE ec.worker_id = ?
      `).all(worker.id) as (EquipmentCertification & { equipment_name: string })[];

      return { ...worker, certifications };
    });

    return Response.json(workersWithCerts);
  }

  // POST /api/workers - create new worker
  if (url.pathname === "/api/workers" && request.method === "POST") {
    return handleCreateWorker(request);
  }

  // GET /api/workers/:id - get single worker with certifications
  const workerMatch = url.pathname.match(/^\/api\/workers\/(\d+)$/);
  if (workerMatch && request.method === "GET") {
    const workerId = parseInt(workerMatch[1]!);
    const worker = db.query("SELECT * FROM workers WHERE id = ?").get(workerId) as Worker | null;
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    const certifications = db.query(`
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `).all(workerId) as (EquipmentCertification & { equipment_name: string })[];

    return Response.json({ ...worker, certifications });
  }

  // PATCH /api/workers/:id - update worker
  if (workerMatch && request.method === "PATCH") {
    return handleUpdateWorker(request, parseInt(workerMatch[1]!));
  }

  // DELETE /api/workers/:id - delete worker
  if (workerMatch && request.method === "DELETE") {
    return handleDeleteWorker(parseInt(workerMatch[1]!));
  }

  // GET /api/workers/:id/certifications - get certifications for worker
  const certificationsMatch = url.pathname.match(/^\/api\/workers\/(\d+)\/certifications$/);
  if (certificationsMatch && request.method === "GET") {
    const workerId = parseInt(certificationsMatch[1]!);
    const certifications = db.query(`
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `).all(workerId) as (EquipmentCertification & { equipment_name: string })[];
    return Response.json(certifications);
  }

  return null;
}

async function handleCreateWorker(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      name: string;
      employee_id?: string;
      skill_category?: 'SEWING' | 'OTHER'
    };

    if (!body.name) {
      return Response.json({ error: "Missing required field: name" }, { status: 400 });
    }

    // Check if employee_id already exists
    if (body.employee_id) {
      const existing = db.query("SELECT id FROM workers WHERE employee_id = ?").get(body.employee_id);
      if (existing) {
        return Response.json({ error: "Worker with this employee_id already exists" }, { status: 409 });
      }
    }

    // Validate skill_category
    const skillCategory = body.skill_category || 'OTHER';
    if (!['SEWING', 'OTHER'].includes(skillCategory)) {
      return Response.json({ error: "Invalid skill_category" }, { status: 400 });
    }

    const result = db.run(
      "INSERT INTO workers (name, employee_id, skill_category) VALUES (?, ?, ?)",
      [body.name, body.employee_id || null, skillCategory]
    );

    const worker = db.query("SELECT * FROM workers WHERE id = ?").get(result.lastInsertRowid) as Worker;
    return Response.json({ ...worker, certifications: [] }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleUpdateWorker(request: Request, workerId: number): Promise<Response> {
  try {
    const body = await request.json() as {
      name?: string;
      employee_id?: string;
      status?: string;
      skill_category?: string;
    };

    const updates: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }

    if (body.employee_id !== undefined) {
      // Check if employee_id already exists (for another worker)
      if (body.employee_id) {
        const existing = db.query("SELECT id FROM workers WHERE employee_id = ? AND id != ?").get(body.employee_id, workerId);
        if (existing) {
          return Response.json({ error: "Worker with this employee_id already exists" }, { status: 409 });
        }
      }
      updates.push("employee_id = ?");
      values.push(body.employee_id || null);
    }

    if (body.status !== undefined) {
      if (!['active', 'inactive', 'on_leave'].includes(body.status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    if (body.skill_category !== undefined) {
      if (!['SEWING', 'OTHER'].includes(body.skill_category)) {
        return Response.json({ error: "Invalid skill_category" }, { status: 400 });
      }
      updates.push("skill_category = ?");
      values.push(body.skill_category);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(workerId);
    db.run(`UPDATE workers SET ${updates.join(", ")} WHERE id = ?`, values);

    const worker = db.query("SELECT * FROM workers WHERE id = ?").get(workerId) as Worker | null;
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    const certifications = db.query(`
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `).all(workerId) as (EquipmentCertification & { equipment_name: string })[];

    return Response.json({ ...worker, certifications });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

function handleDeleteWorker(workerId: number): Response {
  const worker = db.query("SELECT * FROM workers WHERE id = ?").get(workerId) as Worker | null;
  if (!worker) {
    return Response.json({ error: "Worker not found" }, { status: 404 });
  }

  // Check if worker has any scheduled entries
  const hasSchedules = db.query("SELECT id FROM schedule_entries WHERE worker_id = ?").get(workerId);
  if (hasSchedules) {
    return Response.json({ error: "Cannot delete worker with scheduled entries" }, { status: 409 });
  }

  db.run("DELETE FROM workers WHERE id = ?", [workerId]);
  return Response.json({ success: true });
}

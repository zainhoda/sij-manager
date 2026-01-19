import { db } from "../db";
import type { Worker, EquipmentCertification } from "../db/schema";

interface WorkerWithCertifications extends Worker {
  certifications: (EquipmentCertification & { equipment_name: string })[];
}

export async function handleWorkers(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/workers - list all workers
  if (url.pathname === "/api/workers" && request.method === "GET") {
    const result = await db.execute(`
      SELECT w.*, wc.name as work_category_name
      FROM workers w
      LEFT JOIN work_categories wc ON w.work_category_id = wc.id
      ORDER BY w.name
    `);
    const workers = result.rows as unknown as (Worker & { work_category_name: string | null })[];

    // Get certifications for each worker
    // Note: This N+1 query pattern isn't ideal but we'll keep the logic structure for now, just making it async
    const workersWithCerts: (WorkerWithCertifications & { work_category_name: string | null })[] = [];
    for (const worker of workers) {
      const certsResult = await db.execute({
        sql: `
        SELECT ec.*, e.name as equipment_name
        FROM equipment_certifications ec
        JOIN equipment e ON ec.equipment_id = e.id
        WHERE ec.worker_id = ?
      `,
        args: [worker.id]
      });
      const certifications = certsResult.rows as unknown as (EquipmentCertification & { equipment_name: string })[];
      workersWithCerts.push({ ...worker, certifications });
    }

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
    const result = await db.execute({
      sql: `
        SELECT w.*, wc.name as work_category_name
        FROM workers w
        LEFT JOIN work_categories wc ON w.work_category_id = wc.id
        WHERE w.id = ?
      `,
      args: [workerId]
    });
    const worker = result.rows[0] as unknown as (Worker & { work_category_name: string | null }) | undefined;
    
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    const certsResult = await db.execute({
      sql: `
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `,
      args: [workerId]
    });
    const certifications = certsResult.rows as unknown as (EquipmentCertification & { equipment_name: string })[];

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

  // GET /api/workers/:id/stats - get detailed stats for worker
  const statsMatch = url.pathname.match(/^\/api\/workers\/(\d+)\/stats$/);
  if (statsMatch && request.method === "GET") {
    return handleWorkerStats(parseInt(statsMatch[1]!));
  }

  // GET /api/workers/:id/certifications - get certifications for worker
  const certificationsMatch = url.pathname.match(/^\/api\/workers\/(\d+)\/certifications$/);
  if (certificationsMatch && request.method === "GET") {
    const workerId = parseInt(certificationsMatch[1]!);
    const result = await db.execute({
      sql: `
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `,
      args: [workerId]
    });
    const certifications = result.rows as unknown as (EquipmentCertification & { equipment_name: string })[];
    return Response.json(certifications);
  }

  return null;
}

async function handleCreateWorker(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      name: string;
      employee_id?: string;
      skill_category?: 'SEWING' | 'OTHER';
      work_category_id?: number | null;
      cost_per_hour?: number;
    };

    if (!body.name) {
      return Response.json({ error: "Missing required field: name" }, { status: 400 });
    }

    // Check if employee_id already exists
    if (body.employee_id) {
      const existingResult = await db.execute({
        sql: "SELECT id FROM workers WHERE employee_id = ?",
        args: [body.employee_id]
      });
      if (existingResult.rows.length > 0) {
        return Response.json({ error: "Worker with this employee_id already exists" }, { status: 409 });
      }
    }

    // Validate skill_category
    const skillCategory = body.skill_category || 'OTHER';
    if (!['SEWING', 'OTHER'].includes(skillCategory)) {
      return Response.json({ error: "Invalid skill_category" }, { status: 400 });
    }

    // Validate work_category_id if provided
    if (body.work_category_id !== undefined && body.work_category_id !== null) {
      const categoryResult = await db.execute({
        sql: "SELECT id FROM work_categories WHERE id = ?",
        args: [body.work_category_id]
      });
      if (categoryResult.rows.length === 0) {
        return Response.json({ error: "Invalid work_category_id" }, { status: 400 });
      }
    }

    const costPerHour = body.cost_per_hour !== undefined ? body.cost_per_hour : 0;

    const result = await db.execute({
      sql: "INSERT INTO workers (name, employee_id, skill_category, work_category_id, cost_per_hour) VALUES (?, ?, ?, ?, ?)",
      args: [body.name, body.employee_id || null, skillCategory, body.work_category_id ?? null, costPerHour]
    });

    const newWorkerResult = await db.execute({
      sql: `
        SELECT w.*, wc.name as work_category_name
        FROM workers w
        LEFT JOIN work_categories wc ON w.work_category_id = wc.id
        WHERE w.id = ?
      `,
      args: [Number(result.lastInsertRowid)]
    });
    const worker = newWorkerResult.rows[0] as unknown as Worker & { work_category_name: string | null };

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
      work_category_id?: number | null;
      cost_per_hour?: number;
    };

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }

    if (body.employee_id !== undefined) {
      // Check if employee_id already exists (for another worker)
      if (body.employee_id) {
        const existingResult = await db.execute({
          sql: "SELECT id FROM workers WHERE employee_id = ? AND id != ?",
          args: [body.employee_id, workerId]
        });
        if (existingResult.rows.length > 0) {
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

    if (body.work_category_id !== undefined) {
      if (body.work_category_id !== null) {
        const categoryResult = await db.execute({
          sql: "SELECT id FROM work_categories WHERE id = ?",
          args: [body.work_category_id]
        });
        if (categoryResult.rows.length === 0) {
          return Response.json({ error: "Invalid work_category_id" }, { status: 400 });
        }
      }
      updates.push("work_category_id = ?");
      values.push(body.work_category_id);
    }

    if (body.cost_per_hour !== undefined) {
      if (body.cost_per_hour < 0) {
        return Response.json({ error: "cost_per_hour cannot be negative" }, { status: 400 });
      }
      updates.push("cost_per_hour = ?");
      values.push(body.cost_per_hour);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(workerId);
    await db.execute({
      sql: `UPDATE workers SET ${updates.join(", ")} WHERE id = ?`,
      args: values
    });

    const workerResult = await db.execute({
      sql: `
        SELECT w.*, wc.name as work_category_name
        FROM workers w
        LEFT JOIN work_categories wc ON w.work_category_id = wc.id
        WHERE w.id = ?
      `,
      args: [workerId]
    });
    const worker = workerResult.rows[0] as unknown as (Worker & { work_category_name: string | null }) | undefined;
    
    if (!worker) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    const certsResult = await db.execute({
      sql: `
      SELECT ec.*, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
    `,
      args: [workerId]
    });
    const certifications = certsResult.rows as unknown as (EquipmentCertification & { equipment_name: string })[];

    return Response.json({ ...worker, certifications });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

async function handleDeleteWorker(workerId: number): Promise<Response> {
  const workerResult = await db.execute({
    sql: "SELECT * FROM workers WHERE id = ?",
    args: [workerId]
  });
  const worker = workerResult.rows[0];

  if (!worker) {
    return Response.json({ error: "Worker not found" }, { status: 404 });
  }

  // Check if worker has any scheduled entries
  const schedulesResult = await db.execute({
    sql: "SELECT id FROM schedule_entries WHERE worker_id = ?",
    args: [workerId]
  });

  if (schedulesResult.rows.length > 0) {
    return Response.json({ error: "Cannot delete worker with scheduled entries" }, { status: 409 });
  }

  await db.execute({
    sql: "DELETE FROM workers WHERE id = ?",
    args: [workerId]
  });
  return Response.json({ success: true });
}

async function handleWorkerStats(workerId: number): Promise<Response> {
  // Get worker basic info
  const workerResult = await db.execute({
    sql: `
      SELECT w.*, wc.name as work_category_name
      FROM workers w
      LEFT JOIN work_categories wc ON w.work_category_id = wc.id
      WHERE w.id = ?
    `,
    args: [workerId]
  });
  const worker = workerResult.rows[0] as unknown as (Worker & { work_category_name: string | null }) | undefined;

  if (!worker) {
    return Response.json({ error: "Worker not found" }, { status: 404 });
  }

  // Get overall performance stats from task_worker_assignments
  const overallStatsResult = await db.execute({
    sql: `
      SELECT
        COUNT(*) as total_tasks,
        COALESCE(SUM(actual_output), 0) as total_output,
        COALESCE(SUM(
          CASE
            WHEN actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL
            THEN (julianday(actual_end_time) - julianday(actual_start_time)) * 24
            ELSE 0
          END
        ), 0) as total_hours
      FROM task_worker_assignments
      WHERE worker_id = ? AND status = 'completed'
    `,
    args: [workerId]
  });
  const overallStats = overallStatsResult.rows[0] as unknown as {
    total_tasks: number;
    total_output: number;
    total_hours: number;
  };

  // Get per-step performance breakdown
  const stepStatsResult = await db.execute({
    sql: `
      SELECT
        ps.id as step_id,
        ps.name as step_name,
        ps.time_per_piece_seconds as estimated_seconds,
        p.name as product_name,
        COUNT(*) as times_performed,
        SUM(twa.actual_output) as total_output,
        SUM(
          CASE
            WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
            THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * 3600
            ELSE 0
          END
        ) as total_seconds,
        AVG(
          CASE
            WHEN twa.actual_output > 0 AND twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
            THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * 3600 / twa.actual_output
            ELSE NULL
          END
        ) as avg_seconds_per_piece
      FROM task_worker_assignments twa
      JOIN schedule_entries se ON twa.schedule_entry_id = se.id
      JOIN product_steps ps ON se.product_step_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE twa.worker_id = ? AND twa.status = 'completed' AND twa.actual_output > 0
      GROUP BY ps.id
      ORDER BY total_output DESC
    `,
    args: [workerId]
  });
  const stepStats = stepStatsResult.rows as unknown as {
    step_id: number;
    step_name: string;
    estimated_seconds: number;
    product_name: string;
    times_performed: number;
    total_output: number;
    total_seconds: number;
    avg_seconds_per_piece: number | null;
  }[];

  // Calculate efficiency per step
  const stepPerformance = stepStats.map((s) => ({
    ...s,
    efficiency:
      s.avg_seconds_per_piece && s.estimated_seconds
        ? Math.round((s.estimated_seconds / s.avg_seconds_per_piece) * 100)
        : null,
  }));

  // Get proficiencies
  const proficienciesResult = await db.execute({
    sql: `
      SELECT
        wp.id,
        wp.product_step_id,
        wp.level,
        ps.name as step_name,
        p.name as product_name
      FROM worker_proficiencies wp
      JOIN product_steps ps ON wp.product_step_id = ps.id
      JOIN products p ON ps.product_id = p.id
      WHERE wp.worker_id = ?
      ORDER BY p.name, ps.sequence
    `,
    args: [workerId]
  });
  const proficiencies = proficienciesResult.rows as unknown as {
    id: number;
    product_step_id: number;
    level: number;
    step_name: string;
    product_name: string;
  }[];

  // Get certifications
  const certificationsResult = await db.execute({
    sql: `
      SELECT ec.id, ec.equipment_id, e.name as equipment_name
      FROM equipment_certifications ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE ec.worker_id = ?
      ORDER BY e.name
    `,
    args: [workerId]
  });
  const certifications = certificationsResult.rows as unknown as {
    id: number;
    equipment_id: number;
    equipment_name: string;
  }[];

  // Get daily production for recent days
  const dailyProductionResult = await db.execute({
    sql: `
      SELECT
        date(twa.actual_start_time) as date,
        SUM(twa.actual_output) as output,
        SUM(
          CASE
            WHEN twa.actual_start_time IS NOT NULL AND twa.actual_end_time IS NOT NULL
            THEN (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24
            ELSE 0
          END
        ) as hours
      FROM task_worker_assignments twa
      WHERE twa.worker_id = ?
        AND twa.status = 'completed'
        AND twa.actual_start_time IS NOT NULL
        AND date(twa.actual_start_time) >= date('now', '-30 days')
      GROUP BY date(twa.actual_start_time)
      ORDER BY date(twa.actual_start_time) DESC
      LIMIT 14
    `,
    args: [workerId]
  });
  const dailyProduction = dailyProductionResult.rows as unknown as {
    date: string;
    output: number;
    hours: number;
  }[];

  // Calculate team averages for comparison
  const teamAveragesResult = await db.execute({
    sql: `
      SELECT
        AVG(worker_total) as avg_output,
        AVG(worker_hours) as avg_hours,
        AVG(worker_tasks) as avg_tasks
      FROM (
        SELECT
          worker_id,
          SUM(actual_output) as worker_total,
          SUM(
            CASE
              WHEN actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL
              THEN (julianday(actual_end_time) - julianday(actual_start_time)) * 24
              ELSE 0
            END
          ) as worker_hours,
          COUNT(*) as worker_tasks
        FROM task_worker_assignments
        WHERE status = 'completed'
        GROUP BY worker_id
      )
    `
  });
  const teamAverages = teamAveragesResult.rows[0] as unknown as {
    avg_output: number | null;
    avg_hours: number | null;
    avg_tasks: number | null;
  };

  return Response.json({
    worker,
    stats: {
      total_tasks: overallStats.total_tasks,
      total_output: overallStats.total_output,
      total_hours: overallStats.total_hours,
      output_per_hour:
        overallStats.total_hours > 0
          ? Math.round(overallStats.total_output / overallStats.total_hours)
          : 0,
    },
    teamAverages: {
      avg_output: teamAverages.avg_output ?? 0,
      avg_hours: teamAverages.avg_hours ?? 0,
      avg_tasks: teamAverages.avg_tasks ?? 0,
    },
    stepPerformance,
    proficiencies,
    certifications,
    dailyProduction: dailyProduction.reverse(),
  });
}

import type { Client } from "@libsql/client";
import { initDatabase, ensureSchema } from "./schema";

interface StepData {
  category: string;
  code: string;
  name: string;
  timeSeconds: number;
  skill: string;
  parent: string | null;
  dependsOn?: string[];
  equipment?: string; // equipment name reference
}

interface EquipmentData {
  name: string;
  description: string;
}

interface WorkerData {
  name: string;
  employee_id: string;
  skill_category: 'SEWING' | 'OTHER';
  certifications: string[]; // equipment names
}

// Sample equipment
const EQUIPMENT: EquipmentData[] = [
  { name: 'Industrial Sewing Machine #1', description: 'Main production sewing machine' },
  { name: 'Industrial Sewing Machine #2', description: 'Backup sewing machine' },
  { name: 'Cutting Table', description: 'Large fabric cutting station' },
  { name: 'Heat Press', description: 'For applying transfers' },
  { name: 'Serger', description: 'Overlock sewing machine for edge finishing' },
];

// Sample workers
const WORKERS: WorkerData[] = [
  { name: 'Maria Garcia', employee_id: 'EMP001', skill_category: 'SEWING', certifications: ['Industrial Sewing Machine #1', 'Industrial Sewing Machine #2', 'Serger'] },
  { name: 'Juan Rodriguez', employee_id: 'EMP002', skill_category: 'SEWING', certifications: ['Industrial Sewing Machine #1', 'Serger'] },
  { name: 'Ana Martinez', employee_id: 'EMP003', skill_category: 'OTHER', certifications: ['Cutting Table', 'Heat Press'] },
  { name: 'Carlos Lopez', employee_id: 'EMP004', skill_category: 'SEWING', certifications: ['Industrial Sewing Machine #2', 'Serger'] },
  { name: 'Sofia Hernandez', employee_id: 'EMP005', skill_category: 'OTHER', certifications: ['Cutting Table'] },
];

// Tenjam product steps from spreadsheet
const TENJAM_STEPS: StepData[] = [
  // 1. CUTTING
  { category: 'CUTTING', code: '1', name: 'Cut the fabric panels', timeSeconds: 90, skill: 'OTHER', parent: null, equipment: 'Cutting Table' },
  { category: 'CUTTING', code: '1.I', name: 'Cut the Velcro pieces', timeSeconds: 2, skill: 'OTHER', parent: '1', equipment: 'Cutting Table' },
  { category: 'CUTTING', code: '1.II', name: 'Cut the zipper', timeSeconds: 5, skill: 'OTHER', parent: '1', equipment: 'Cutting Table' },

  // 2. SILKSCREEN (N/A for this product)

  // 3. PREP STEPS
  { category: 'PREP', code: '3.A', name: 'Sew the USA flag onto the fabric panel', timeSeconds: 7, skill: 'SEWING', parent: null, dependsOn: ['1'], equipment: 'Industrial Sewing Machine #1' },

  // 4. SEWING - A. Small Velcro Pocket
  { category: 'SEWING', code: '4.A.I', name: 'Hem the short edges', timeSeconds: 20, skill: 'SEWING', parent: '4.A', dependsOn: ['1', '3.A'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.A.II', name: 'Sew on the hook Velcro', timeSeconds: 25, skill: 'SEWING', parent: '4.A', dependsOn: ['4.A.I'], equipment: 'Industrial Sewing Machine #1' },

  // 4. SEWING - B. Connector Strap
  { category: 'SEWING', code: '4.B.I', name: 'Sew the panel together along the one long side', timeSeconds: 12, skill: 'SEWING', parent: '4.B', dependsOn: ['1', '3.A'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.B.II', name: 'Turn inside-out', timeSeconds: 28, skill: 'OTHER', parent: '4.B', dependsOn: ['4.B.I'] },
  { category: 'SEWING', code: '4.B.III', name: 'Sew the 2 sides of the connector strap panel', timeSeconds: 25, skill: 'SEWING', parent: '4.B', dependsOn: ['4.B.II'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.B.IV', name: 'Sew the connector strap to the small Velcro pocket, add the loop Velcro', timeSeconds: 35, skill: 'SEWING', parent: '4.B', dependsOn: ['4.B.III', '4.A.II'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.B.V', name: 'Close the sides of the small Velcro pocket and cut corners', timeSeconds: 15, skill: 'SEWING', parent: '4.B', dependsOn: ['4.B.IV'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.B.VI', name: 'Cut threads turn pocket right side out', timeSeconds: 25, skill: 'SEWING', parent: '4.B', dependsOn: ['4.B.V'] },

  // 4. SEWING - C. Hanging big pocket
  { category: 'SEWING', code: '4.C.I', name: 'Hem long side', timeSeconds: 17, skill: 'SEWING', parent: '4.C', dependsOn: ['1', '3.A'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.C.II', name: 'Fold to the marking, and close both sides', timeSeconds: 35, skill: 'SEWING', parent: '4.C', dependsOn: ['4.C.I'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.C.III', name: 'Add stitching to the lower corners to create volume', timeSeconds: 15, skill: 'SEWING', parent: '4.C', dependsOn: ['4.C.II'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.C.IV', name: 'Turn Right Side out', timeSeconds: 16, skill: 'OTHER', parent: '4.C', dependsOn: ['4.C.III'] },
  { category: 'SEWING', code: '4.C.V', name: 'Sew the center stitch', timeSeconds: 20, skill: 'SEWING', parent: '4.C', dependsOn: ['4.C.IV'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.C.VI', name: 'Add straight single-stitching to the top of the pocket', timeSeconds: 15, skill: 'SEWING', parent: '4.C', dependsOn: ['4.C.V'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.C.VII', name: 'Stitch the connector strap to the large pocket', timeSeconds: 9, skill: 'SEWING', parent: '4.C', dependsOn: ['4.C.VI', '4.B.VI'], equipment: 'Industrial Sewing Machine #1' },

  // 4. SEWING - D. Cushion cover
  { category: 'SEWING', code: '4.D.I', name: 'Sew the zipper onto the 2 fabric panels', timeSeconds: 100, skill: 'SEWING', parent: '4.D', dependsOn: ['4.C.VII'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.D.II', name: 'Cut off extra material and add the zipper pull', timeSeconds: 30, skill: 'SEWING', parent: '4.D', dependsOn: ['4.D.I'] },
  { category: 'SEWING', code: '4.D.III', name: 'Add closing stitch to both zipper ends', timeSeconds: 18, skill: 'SEWING', parent: '4.D', dependsOn: ['4.D.II'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.D.IV', name: 'Sew together Big Hanging Pocket and Connector Strap and Zipper panels', timeSeconds: 60, skill: 'SEWING', parent: '4.D', dependsOn: ['4.D.III'], equipment: 'Industrial Sewing Machine #1' },

  // 4. SEWING - E. Finishing
  { category: 'SEWING', code: '4.E.I', name: 'Sew on the side panels', timeSeconds: 120, skill: 'SEWING', parent: '4.E', dependsOn: ['4.D.IV'], equipment: 'Industrial Sewing Machine #1' },
  { category: 'SEWING', code: '4.E.II', name: 'Add ZigZag to the top of the hanging big pocket', timeSeconds: 14, skill: 'SEWING', parent: '4.E', dependsOn: ['4.E.I'], equipment: 'Serger' },

  // 5. INSPECTION
  { category: 'INSPECTION', code: '5.1', name: 'Clean and inspect inside', timeSeconds: 30, skill: 'OTHER', parent: '5', dependsOn: ['4.E.II'] },
  { category: 'INSPECTION', code: '5.2', name: 'Turn right side out', timeSeconds: 50, skill: 'OTHER', parent: '5', dependsOn: ['5.1'] },
  { category: 'INSPECTION', code: '5.3', name: 'Insert the foam piece into the headrest', timeSeconds: 30, skill: 'OTHER', parent: '5', dependsOn: ['5.2'] },
  { category: 'INSPECTION', code: '5.4', name: 'Pack', timeSeconds: 60, skill: 'OTHER', parent: '5', dependsOn: ['5.3'] },
];

export async function seedDatabase(db: Client) {
  // Check if already seeded
  const existingProduct = await db.execute("SELECT id FROM products WHERE name = 'Tenjam Headrest'");
  if (existingProduct.rows.length > 0) {
    console.log("Database already seeded");
    return;
  }

  console.log("Seeding database...");

  // Insert equipment first and track IDs by name
  const equipmentIdsByName: Record<string, number> = {};
  for (const equip of EQUIPMENT) {
    const result = await db.execute({
      sql: "INSERT INTO equipment (name, description) VALUES (?, ?)",
      args: [equip.name, equip.description]
    });
    equipmentIdsByName[equip.name] = Number(result.lastInsertRowid);
  }
  console.log(`Seeded ${EQUIPMENT.length} equipment items`);

  // Insert workers and track IDs by name
  const workerIdsByName: Record<string, number> = {};
  for (const worker of WORKERS) {
    const result = await db.execute({
      sql: "INSERT INTO workers (name, employee_id, skill_category) VALUES (?, ?, ?)",
      args: [worker.name, worker.employee_id, worker.skill_category]
    });
    workerIdsByName[worker.name] = Number(result.lastInsertRowid);
  }
  console.log(`Seeded ${WORKERS.length} workers`);

  // Insert equipment certifications
  let certCount = 0;
  for (const worker of WORKERS) {
    const workerId = workerIdsByName[worker.name]!;
    for (const equipName of worker.certifications) {
      const equipId = equipmentIdsByName[equipName];
      if (equipId !== undefined) {
        await db.execute({
          sql: "INSERT INTO equipment_certifications (worker_id, equipment_id) VALUES (?, ?)",
          args: [workerId, equipId]
        });
        certCount++;
      }
    }
  }
  console.log(`Seeded ${certCount} equipment certifications`);

  // Create Tenjam product
  const productResult = await db.execute({
    sql: "INSERT INTO products (name, description) VALUES (?, ?)",
    args: ["Tenjam Headrest", "Headrest cushion with Velcro pockets and hanging storage"]
  });
  const productId = Number(productResult.lastInsertRowid);

  // Insert steps and track their IDs by code
  const stepIdsByCode: Record<string, number> = {};

  for (let i = 0; i < TENJAM_STEPS.length; i++) {
    const step = TENJAM_STEPS[i]!;
    const equipmentId = step.equipment ? equipmentIdsByName[step.equipment] : null;
    const result = await db.execute({
      sql: `INSERT INTO product_steps (product_id, name, category, time_per_piece_seconds, sequence, required_skill_category, parent_step_code, equipment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [productId, step.name, step.category, step.timeSeconds, i + 1, step.skill, step.parent, equipmentId]
    });
    stepIdsByCode[step.code] = Number(result.lastInsertRowid);
  }

  // Insert dependencies
  for (const step of TENJAM_STEPS) {
    if (step.dependsOn) {
      const stepId = stepIdsByCode[step.code]!;
      for (const depCode of step.dependsOn) {
        const depStepId = stepIdsByCode[depCode];
        if (depStepId !== undefined) {
          await db.execute({
            sql: "INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES (?, ?)",
            args: [stepId, depStepId]
          });
        }
      }
    }
  }

  console.log(`Seeded ${TENJAM_STEPS.length} product steps`);
}

// Run if called directly
if (import.meta.main) {
  const db = initDatabase();
  await ensureSchema(db);
  await seedDatabase(db);
  db.close();
}

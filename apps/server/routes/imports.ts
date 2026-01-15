/**
 * Import routes for cold start spreadsheet uploads
 */

import { db } from "../db";
import {
  parseEquipmentMatrix,
  parseProductSteps,
  parseProductionData,
  parseProducts,
  parseOrders,
  parseProductionDataV2,
  type ParsedEquipmentMatrix,
  type ParsedProductSteps,
  type ParsedProductionData,
  type ParsedProducts,
  type ParsedOrders,
  type ParsedProductionDataV2,
} from "../services/import-parsers";
import {
  validateEquipmentMatrix,
  validateProductSteps,
  validateProductionData,
  validateProducts,
  validateOrders,
  validateProductionDataV2,
  type ExistingData,
  type EquipmentMatrixValidationResult,
  type ProductStepsValidationResult,
  type ProductionDataExistingData,
  type ProductionDataValidationResult,
  type ProductsValidationResult,
  type OrdersExistingData,
  type OrdersValidationResult,
  type ProductionDataV2ExistingData,
  type ProductionDataV2ValidationResult,
} from "../services/import-validators";

// Preview token storage (in-memory with TTL)
interface PreviewData {
  type: 'equipment-matrix' | 'product-steps' | 'production-data' | 'products' | 'orders' | 'production-history';
  data: ParsedEquipmentMatrix | ParsedProductSteps | ParsedProductionData | ParsedProducts | ParsedOrders | ParsedProductionDataV2;
  validation: EquipmentMatrixValidationResult | ProductStepsValidationResult | ProductionDataValidationResult | ProductsValidationResult | OrdersValidationResult | ProductionDataV2ValidationResult;
  productId?: number;
  productName?: string;
  createdAt: number;
}

const previewStore = new Map<string, PreviewData>();
const PREVIEW_TTL = 30 * 60 * 1000; // 30 minutes

// Cleanup expired tokens periodically
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of previewStore) {
    if (now - data.createdAt > PREVIEW_TTL) {
      previewStore.delete(token);
    }
  }
}

function generateToken(): string {
  return crypto.randomUUID();
}

/**
 * Get existing data from database for validation
 */
async function getExistingData(): Promise<ExistingData> {
  const [equipmentResult, workersResult, categoriesResult, componentsResult] = await Promise.all([
    db.execute("SELECT id, name FROM equipment"),
    db.execute("SELECT id, name FROM workers"),
    db.execute("SELECT id, name FROM work_categories"),
    db.execute("SELECT id, name FROM components"),
  ]);

  const equipment = new Map<string, number>();
  for (const row of equipmentResult.rows) {
    equipment.set(row.name as string, row.id as number);
  }

  const workers = new Map<string, number>();
  for (const row of workersResult.rows) {
    workers.set(row.name as string, row.id as number);
  }

  const workCategories = new Map<string, number>();
  for (const row of categoriesResult.rows) {
    workCategories.set(row.name as string, row.id as number);
  }

  const components = new Map<string, number>();
  for (const row of componentsResult.rows) {
    components.set(row.name as string, row.id as number);
  }

  return { equipment, workers, workCategories, components };
}

/**
 * Execute Equipment-Worker Matrix import
 */
async function executeEquipmentMatrixImport(
  parsed: ParsedEquipmentMatrix
): Promise<{ workCategoriesCreated: number; equipmentCreated: number; workersCreated: number; certificationsCreated: number }> {
  // Get fresh existing data
  const existing = await getExistingData();

  // Track created IDs
  const categoryIds = new Map<string, number>(existing.workCategories);
  const equipmentIds = new Map<string, number>(existing.equipment);
  const workerIds = new Map<string, number>(existing.workers);

  let workCategoriesCreated = 0;
  let equipmentCreated = 0;
  let workersCreated = 0;
  let certificationsCreated = 0;

  // 1. Insert work categories
  for (const categoryName of parsed.workCategories) {
    if (!categoryIds.has(categoryName)) {
      const result = await db.execute({
        sql: "INSERT INTO work_categories (name) VALUES (?)",
        args: [categoryName],
      });
      categoryIds.set(categoryName, Number(result.lastInsertRowid));
      workCategoriesCreated++;
    }
  }

  // 2. Insert equipment (with hourly_cost)
  for (const equip of parsed.equipment) {
    if (!equipmentIds.has(equip.name)) {
      const categoryId = categoryIds.get(equip.workCategoryName) || null;
      const result = await db.execute({
        sql: "INSERT INTO equipment (name, description, station_count, work_category_id, hourly_cost) VALUES (?, ?, ?, ?, ?)",
        args: [equip.name, equip.description, equip.stationCount, categoryId, equip.hourlyCost],
      });
      equipmentIds.set(equip.name, Number(result.lastInsertRowid));
      equipmentCreated++;
    }
  }

  // 3. Insert workers (with cost_per_hour)
  for (const worker of parsed.workers) {
    if (!workerIds.has(worker.name)) {
      const result = await db.execute({
        sql: "INSERT INTO workers (name, status, cost_per_hour) VALUES (?, 'active', ?)",
        args: [worker.name, worker.costPerHour],
      });
      workerIds.set(worker.name, Number(result.lastInsertRowid));
      workersCreated++;
    }
  }

  // 4. Insert certifications
  for (const cert of parsed.certifications) {
    const workerId = workerIds.get(cert.workerName);
    const equipmentId = equipmentIds.get(cert.equipmentName);

    if (workerId && equipmentId) {
      // Check if certification already exists
      const existingCert = await db.execute({
        sql: "SELECT id FROM equipment_certifications WHERE worker_id = ? AND equipment_id = ?",
        args: [workerId, equipmentId],
      });

      if (existingCert.rows.length === 0) {
        await db.execute({
          sql: "INSERT INTO equipment_certifications (worker_id, equipment_id) VALUES (?, ?)",
          args: [workerId, equipmentId],
        });
        certificationsCreated++;
      }
    }
  }

  return { workCategoriesCreated, equipmentCreated, workersCreated, certificationsCreated };
}

/**
 * Execute Product Steps import
 */
async function executeProductStepsImport(
  parsed: ParsedProductSteps,
  productId: number
): Promise<{ workCategoriesCreated: number; componentsCreated: number; stepsCreated: number; dependenciesCreated: number }> {
  // Get fresh existing data
  const existing = await getExistingData();

  // Track created IDs
  const categoryIds = new Map<string, number>(existing.workCategories);
  const componentIds = new Map<string, number>(existing.components);
  const stepIds = new Map<string, number>();

  let workCategoriesCreated = 0;
  let componentsCreated = 0;
  let stepsCreated = 0;
  let dependenciesCreated = 0;

  // 1. Insert work categories
  for (const categoryName of parsed.workCategories) {
    if (!categoryIds.has(categoryName)) {
      const result = await db.execute({
        sql: "INSERT INTO work_categories (name) VALUES (?)",
        args: [categoryName],
      });
      categoryIds.set(categoryName, Number(result.lastInsertRowid));
      workCategoriesCreated++;
    }
  }

  // 2. Insert components
  for (const componentName of parsed.components) {
    if (!componentIds.has(componentName)) {
      const result = await db.execute({
        sql: "INSERT INTO components (name) VALUES (?)",
        args: [componentName],
      });
      componentIds.set(componentName, Number(result.lastInsertRowid));
      componentsCreated++;
    }
  }

  // 3. Insert product steps
  let sequence = 1;
  for (const step of parsed.steps) {
    const categoryId = categoryIds.get(step.category) || null;
    const componentId = step.componentName ? componentIds.get(step.componentName) || null : null;
    const equipmentId = step.equipmentCode ? existing.equipment.get(step.equipmentCode) || null : null;

    // Determine required_skill_category based on category
    const skillCategory = step.category === 'SEWING' ? 'SEWING' : 'OTHER';

    const result = await db.execute({
      sql: `INSERT INTO product_steps
            (product_id, name, category, work_category_id, time_per_piece_seconds, sequence,
             required_skill_category, equipment_id, component_id, step_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        productId,
        step.taskName,
        step.category, // Keep category for backwards compatibility
        categoryId,
        step.timePerPieceSeconds,
        sequence++,
        skillCategory,
        equipmentId,
        componentId,
        step.stepCode,
      ],
    });
    stepIds.set(step.stepCode, Number(result.lastInsertRowid));
    stepsCreated++;
  }

  // 4. Insert step dependencies
  for (const step of parsed.steps) {
    const stepId = stepIds.get(step.stepCode);
    if (!stepId) continue;

    for (const dep of step.dependencies) {
      const depStepId = stepIds.get(dep.stepCode);
      if (depStepId) {
        await db.execute({
          sql: "INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type) VALUES (?, ?, ?)",
          args: [stepId, depStepId, dep.type],
        });
        dependenciesCreated++;
      }
    }
  }

  return { workCategoriesCreated, componentsCreated, stepsCreated, dependenciesCreated };
}

/**
 * Get existing data for production data validation
 */
async function getProductionDataExistingData(): Promise<ProductionDataExistingData> {
  const existing = await getExistingData();

  // Get orders with product info
  const ordersResult = await db.execute(`
    SELECT o.id, o.product_id, p.name as product_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
  `);

  const orders = new Map<number, { id: number; productId: number; productName: string }>();
  for (const row of ordersResult.rows) {
    orders.set(row.id as number, {
      id: row.id as number,
      productId: row.product_id as number,
      productName: row.product_name as string,
    });
  }

  // Get product steps indexed by product_id and step_code
  const stepsResult = await db.execute(`
    SELECT id, product_id, step_code, name
    FROM product_steps
    WHERE step_code IS NOT NULL
  `);

  const productSteps = new Map<number, Map<string, { id: number; name: string }>>();
  for (const row of stepsResult.rows) {
    const productId = row.product_id as number;
    const stepCode = row.step_code as string;

    if (!productSteps.has(productId)) {
      productSteps.set(productId, new Map());
    }
    productSteps.get(productId)!.set(stepCode, {
      id: row.id as number,
      name: row.name as string,
    });
  }

  // Get existing assignments for duplicate detection
  const assignmentsResult = await db.execute(`
    SELECT twa.worker_id, se.product_step_id, se.date
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
  `);

  const existingAssignments = new Set<string>();
  for (const row of assignmentsResult.rows) {
    const key = `${row.worker_id}:${row.product_step_id}:${row.date}`;
    existingAssignments.add(key);
  }

  return {
    ...existing,
    orders,
    productSteps,
    existingAssignments,
  };
}

/**
 * Execute Production Data import
 */
async function executeProductionDataImport(
  validation: ProductionDataValidationResult
): Promise<{ schedulesCreated: number; entriesCreated: number; assignmentsCreated: number }> {
  let schedulesCreated = 0;
  let entriesCreated = 0;
  let assignmentsCreated = 0;

  // Track created schedules and entries to avoid duplicates
  const scheduleCache = new Map<string, number>(); // "orderId:weekStart" -> schedule_id
  const entryCache = new Map<string, number>(); // "scheduleId:stepId:date" -> entry_id

  // First, fetch existing schedules
  const existingSchedulesResult = await db.execute(`
    SELECT id, order_id, week_start_date FROM schedules
  `);
  for (const row of existingSchedulesResult.rows) {
    const key = `${row.order_id}:${row.week_start_date}`;
    scheduleCache.set(key, row.id as number);
  }

  // Fetch existing schedule entries
  const existingEntriesResult = await db.execute(`
    SELECT id, schedule_id, product_step_id, date FROM schedule_entries
  `);
  for (const row of existingEntriesResult.rows) {
    const key = `${row.schedule_id}:${row.product_step_id}:${row.date}`;
    entryCache.set(key, row.id as number);
  }

  for (const row of validation.preview.rows) {
    // Calculate week start date
    const date = new Date(row.date);
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Get or create schedule
    const scheduleKey = `${row.orderId}:${weekStartStr}`;
    let scheduleId = scheduleCache.get(scheduleKey);

    if (!scheduleId) {
      const scheduleResult = await db.execute({
        sql: "INSERT INTO schedules (order_id, week_start_date) VALUES (?, ?)",
        args: [row.orderId, weekStartStr],
      });
      scheduleId = Number(scheduleResult.lastInsertRowid);
      scheduleCache.set(scheduleKey, scheduleId);
      schedulesCreated++;
    }

    // Get or create schedule entry
    const entryKey = `${scheduleId}:${row.productStepId}:${row.date}`;
    let entryId = entryCache.get(entryKey);

    if (!entryId) {
      const entryResult = await db.execute({
        sql: "INSERT INTO schedule_entries (schedule_id, product_step_id, date, status) VALUES (?, ?, ?, 'completed')",
        args: [scheduleId, row.productStepId, row.date],
      });
      entryId = Number(entryResult.lastInsertRowid);
      entryCache.set(entryKey, entryId);
      entriesCreated++;
    }

    // Create task worker assignment
    // Convert date + time to ISO datetime string
    const startDateTime = `${row.date}T${row.startTime}`;
    const endDateTime = `${row.date}T${row.endTime}`;

    await db.execute({
      sql: `INSERT INTO task_worker_assignments
            (schedule_entry_id, worker_id, actual_start_time, actual_end_time, actual_output, status)
            VALUES (?, ?, ?, ?, ?, 'completed')`,
      args: [entryId, row.workerId, startDateTime, endDateTime, row.units],
    });
    assignmentsCreated++;
  }

  return { schedulesCreated, entriesCreated, assignmentsCreated };
}

// ============================================================================
// NEW V2 IMPORT FUNCTIONS
// ============================================================================

/**
 * Get existing data for Orders validation
 * Note: Orders no longer include version - version is determined at scheduling time
 */
async function getOrdersExistingData(): Promise<OrdersExistingData> {
  const existing = await getExistingData();

  // Get products by name
  const productsResult = await db.execute("SELECT id, name FROM products");
  const products = new Map<string, { id: number; name: string }>();
  for (const row of productsResult.rows) {
    products.set(row.name as string, { id: row.id as number, name: row.name as string });
  }

  return {
    ...existing,
    products,
  };
}

/**
 * Get existing data for Production History V2 validation
 * Note: Version is now provided in the CSV, not looked up from order
 */
async function getProductionDataV2ExistingData(): Promise<ProductionDataV2ExistingData> {
  const existing = await getExistingData();

  // Get orders by product_name:due_date key (no longer includes build_version_id)
  const ordersResult = await db.execute(`
    SELECT o.id, o.product_id, p.name as product_name, o.due_date
    FROM orders o
    JOIN products p ON o.product_id = p.id
  `);
  const ordersByKey = new Map<string, { id: number; productId: number; productName: string }>();
  for (const row of ordersResult.rows) {
    const key = `${row.product_name}:${row.due_date}`;
    ordersByKey.set(key, {
      id: row.id as number,
      productId: row.product_id as number,
      productName: row.product_name as string,
    });
  }

  // Get product versions by product_id -> version_name
  const versionsResult = await db.execute(`
    SELECT id, product_id, version_name FROM product_build_versions
  `);
  const productVersions = new Map<number, Map<string, { id: number; versionName: string }>>();
  for (const row of versionsResult.rows) {
    const productId = row.product_id as number;
    if (!productVersions.has(productId)) {
      productVersions.set(productId, new Map());
    }
    productVersions.get(productId)!.set(row.version_name as string, {
      id: row.id as number,
      versionName: row.version_name as string,
    });
  }

  // Get steps by build_version_id -> step_code
  const stepsResult = await db.execute(`
    SELECT bvs.build_version_id, ps.id, ps.step_code, ps.name, ps.time_per_piece_seconds
    FROM build_version_steps bvs
    JOIN product_steps ps ON bvs.product_step_id = ps.id
    WHERE ps.step_code IS NOT NULL
  `);
  const versionSteps = new Map<number, Map<string, { id: number; name: string; timePerPieceSeconds: number }>>();
  for (const row of stepsResult.rows) {
    const versionId = row.build_version_id as number;
    if (!versionSteps.has(versionId)) {
      versionSteps.set(versionId, new Map());
    }
    versionSteps.get(versionId)!.set(row.step_code as string, {
      id: row.id as number,
      name: row.name as string,
      timePerPieceSeconds: row.time_per_piece_seconds as number,
    });
  }

  // Get existing assignments for duplicate detection
  const assignmentsResult = await db.execute(`
    SELECT twa.worker_id, se.product_step_id, se.date, twa.actual_start_time
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
  `);
  const existingAssignments = new Set<string>();
  for (const row of assignmentsResult.rows) {
    // Extract time from datetime if present
    const startTime = row.actual_start_time ? (row.actual_start_time as string).split('T')[1] || '' : '';
    const key = `${row.worker_id}:${row.product_step_id}:${row.date}:${startTime}`;
    existingAssignments.add(key);
  }

  return {
    ...existing,
    ordersByKey,
    productVersions,
    versionSteps,
    existingAssignments,
  };
}

/**
 * Execute Products CSV import
 */
async function executeProductsImport(
  parsed: ParsedProducts,
  validation: ProductsValidationResult
): Promise<{
  workCategoriesCreated: number;
  componentsCreated: number;
  productsCreated: number;
  versionsCreated: number;
  stepsCreated: number;
  dependenciesCreated: number;
}> {
  const existing = await getExistingData();

  const categoryIds = new Map<string, number>(existing.workCategories);
  const componentIds = new Map<string, number>(existing.components);

  let workCategoriesCreated = 0;
  let componentsCreated = 0;
  let productsCreated = 0;
  let versionsCreated = 0;
  let stepsCreated = 0;
  let dependenciesCreated = 0;

  // 1. Insert work categories
  for (const categoryName of parsed.workCategories) {
    if (!categoryIds.has(categoryName)) {
      const result = await db.execute({
        sql: "INSERT INTO work_categories (name) VALUES (?)",
        args: [categoryName],
      });
      categoryIds.set(categoryName, Number(result.lastInsertRowid));
      workCategoriesCreated++;
    }
  }

  // 2. Insert components
  for (const componentName of parsed.components) {
    if (!componentIds.has(componentName)) {
      const result = await db.execute({
        sql: "INSERT INTO components (name) VALUES (?)",
        args: [componentName],
      });
      componentIds.set(componentName, Number(result.lastInsertRowid));
      componentsCreated++;
    }
  }

  // 3. For each product
  for (const [productName, versions] of parsed.products) {
    // Create product
    const productResult = await db.execute({
      sql: "INSERT INTO products (name) VALUES (?)",
      args: [productName],
    });
    const productId = Number(productResult.lastInsertRowid);
    productsCreated++;

    // For each version
    for (const [versionNumber, version] of versions) {
      // Create build version
      const versionResult = await db.execute({
        sql: `INSERT INTO product_build_versions (product_id, version_name, version_number, is_default, status)
              VALUES (?, ?, ?, ?, 'active')`,
        args: [productId, version.versionName, versionNumber, version.isDefault ? 1 : 0],
      });
      const buildVersionId = Number(versionResult.lastInsertRowid);
      versionsCreated++;

      // Create steps
      const stepIds = new Map<string, number>();
      let sequence = 1;

      for (const step of version.steps) {
        const categoryId = categoryIds.get(step.category) || null;
        const componentId = step.componentName ? componentIds.get(step.componentName) || null : null;
        const equipmentId = step.equipmentCode ? existing.equipment.get(step.equipmentCode) || null : null;
        const skillCategory = step.category === 'SEWING' ? 'SEWING' : 'OTHER';

        const stepResult = await db.execute({
          sql: `INSERT INTO product_steps
                (product_id, name, category, work_category_id, time_per_piece_seconds, sequence,
                 required_skill_category, equipment_id, component_id, step_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            productId,
            step.taskName,
            step.category,
            categoryId,
            step.timePerPieceSeconds,
            sequence++,
            skillCategory,
            equipmentId,
            componentId,
            step.stepCode,
          ],
        });
        const stepId = Number(stepResult.lastInsertRowid);
        stepIds.set(step.stepCode, stepId);
        stepsCreated++;

        // Link step to build version
        await db.execute({
          sql: "INSERT INTO build_version_steps (build_version_id, product_step_id, sequence) VALUES (?, ?, ?)",
          args: [buildVersionId, stepId, sequence - 1],
        });
      }

      // Create dependencies
      for (const step of version.steps) {
        const stepId = stepIds.get(step.stepCode);
        if (!stepId) continue;

        for (const dep of step.dependencies) {
          const depStepId = stepIds.get(dep.stepCode);
          if (depStepId) {
            await db.execute({
              sql: "INSERT INTO step_dependencies (step_id, depends_on_step_id, dependency_type) VALUES (?, ?, ?)",
              args: [stepId, depStepId, dep.type],
            });
            dependenciesCreated++;
          }
        }
      }
    }
  }

  return {
    workCategoriesCreated,
    componentsCreated,
    productsCreated,
    versionsCreated,
    stepsCreated,
    dependenciesCreated,
  };
}

/**
 * Execute Orders CSV import
 * Note: Orders no longer include version - version is determined at scheduling time
 */
async function executeOrdersImport(
  validation: OrdersValidationResult
): Promise<{ ordersCreated: number }> {
  let ordersCreated = 0;

  for (const order of validation.preview.orders) {
    await db.execute({
      sql: "INSERT INTO orders (product_id, quantity, due_date, status) VALUES (?, ?, ?, ?)",
      args: [order.productId, order.quantity, order.dueDate, order.status],
    });
    ordersCreated++;
  }

  return { ordersCreated };
}

/**
 * Execute Production History V2 import
 * Note: Now stores build_version_id on schedules from the CSV's version_name
 */
async function executeProductionDataV2Import(
  validation: ProductionDataV2ValidationResult
): Promise<{ schedulesCreated: number; entriesCreated: number; assignmentsCreated: number }> {
  let schedulesCreated = 0;
  let entriesCreated = 0;
  let assignmentsCreated = 0;

  // Track created schedules and entries to avoid duplicates
  // Key now includes build_version_id since same order could be built with different versions
  const scheduleCache = new Map<string, number>(); // "orderId:weekStart:buildVersionId" -> schedule_id
  const entryCache = new Map<string, number>(); // "scheduleId:stepId:date" -> entry_id

  // First, fetch existing schedules
  const existingSchedulesResult = await db.execute(`
    SELECT id, order_id, week_start_date, build_version_id FROM schedules
  `);
  for (const row of existingSchedulesResult.rows) {
    const key = `${row.order_id}:${row.week_start_date}:${row.build_version_id || 'null'}`;
    scheduleCache.set(key, row.id as number);
  }

  // Fetch existing schedule entries
  const existingEntriesResult = await db.execute(`
    SELECT id, schedule_id, product_step_id, date FROM schedule_entries
  `);
  for (const row of existingEntriesResult.rows) {
    const key = `${row.schedule_id}:${row.product_step_id}:${row.date}`;
    entryCache.set(key, row.id as number);
  }

  for (const row of validation.preview.rows) {
    // Calculate week start date
    const date = new Date(row.workDate);
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Get or create schedule (now includes build_version_id)
    const scheduleKey = `${row.orderId}:${weekStartStr}:${row.buildVersionId}`;
    let scheduleId = scheduleCache.get(scheduleKey);

    if (!scheduleId) {
      const scheduleResult = await db.execute({
        sql: "INSERT INTO schedules (order_id, week_start_date, build_version_id) VALUES (?, ?, ?)",
        args: [row.orderId, weekStartStr, row.buildVersionId],
      });
      scheduleId = Number(scheduleResult.lastInsertRowid);
      scheduleCache.set(scheduleKey, scheduleId);
      schedulesCreated++;
    }

    // Get or create schedule entry (unique per step + date + time slot)
    const entryKey = `${scheduleId}:${row.productStepId}:${row.workDate}:${row.startTime}`;
    let entryId = entryCache.get(entryKey);

    if (!entryId) {
      // Use the work session times as the entry's planned times
      const entryResult = await db.execute({
        sql: `INSERT INTO schedule_entries
              (schedule_id, product_step_id, date, start_time, end_time, planned_output, status)
              VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
        args: [scheduleId, row.productStepId, row.workDate, row.startTime, row.endTime, row.units],
      });
      entryId = Number(entryResult.lastInsertRowid);
      entryCache.set(entryKey, entryId);
      entriesCreated++;
    }

    // Create task worker assignment
    const startDateTime = `${row.workDate}T${row.startTime}`;
    const endDateTime = `${row.workDate}T${row.endTime}`;

    await db.execute({
      sql: `INSERT INTO task_worker_assignments
            (schedule_entry_id, worker_id, actual_start_time, actual_end_time, actual_output, status)
            VALUES (?, ?, ?, ?, ?, 'completed')`,
      args: [entryId, row.workerId, startDateTime, endDateTime, row.units],
    });
    assignmentsCreated++;
  }

  return { schedulesCreated, entriesCreated, assignmentsCreated };
}

/**
 * Calculate and insert worker proficiencies based on production history
 */
async function deriveProficiencies(): Promise<{ proficienciesCreated: number; proficienciesUpdated: number }> {
  let proficienciesCreated = 0;
  let proficienciesUpdated = 0;

  // Get all production data grouped by worker and step
  const productionResult = await db.execute(`
    SELECT
      twa.worker_id,
      se.product_step_id,
      ps.time_per_piece_seconds as expected_time_per_piece,
      SUM(twa.actual_output) as total_output,
      SUM(
        (julianday(twa.actual_end_time) - julianday(twa.actual_start_time)) * 24 * 3600
      ) as total_seconds
    FROM task_worker_assignments twa
    JOIN schedule_entries se ON twa.schedule_entry_id = se.id
    JOIN product_steps ps ON se.product_step_id = ps.id
    WHERE twa.actual_output > 0
      AND twa.actual_start_time IS NOT NULL
      AND twa.actual_end_time IS NOT NULL
    GROUP BY twa.worker_id, se.product_step_id
  `);

  for (const row of productionResult.rows) {
    const workerId = row.worker_id as number;
    const stepId = row.product_step_id as number;
    const expectedTimePerPiece = row.expected_time_per_piece as number;
    const totalOutput = row.total_output as number;
    const totalSeconds = row.total_seconds as number;

    if (totalOutput <= 0 || totalSeconds <= 0) continue;

    // Calculate efficiency: expected time / actual time
    const expectedTotalTime = expectedTimePerPiece * totalOutput;
    const efficiency = (expectedTotalTime / totalSeconds) * 100;

    // Map efficiency to proficiency level (1-5)
    let level: number;
    if (efficiency < 60) {
      level = 1;
    } else if (efficiency < 80) {
      level = 2;
    } else if (efficiency < 100) {
      level = 3;
    } else if (efficiency < 120) {
      level = 4;
    } else {
      level = 5;
    }

    // Check if proficiency exists
    const existingResult = await db.execute({
      sql: "SELECT id, level FROM worker_proficiencies WHERE worker_id = ? AND product_step_id = ?",
      args: [workerId, stepId],
    });

    if (existingResult.rows.length > 0) {
      // Update existing
      await db.execute({
        sql: "UPDATE worker_proficiencies SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE worker_id = ? AND product_step_id = ?",
        args: [level, workerId, stepId],
      });
      proficienciesUpdated++;
    } else {
      // Insert new
      await db.execute({
        sql: "INSERT INTO worker_proficiencies (worker_id, product_step_id, level) VALUES (?, ?, ?)",
        args: [workerId, stepId, level],
      });
      proficienciesCreated++;
    }
  }

  return { proficienciesCreated, proficienciesUpdated };
}

export async function handleImports(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // Clean up expired tokens on each request
  cleanupExpiredTokens();

  // POST /api/imports/equipment-matrix/preview
  if (url.pathname === "/api/imports/equipment-matrix/preview" && request.method === "POST") {
    try {
      const body = await request.json() as { content: string; format?: 'tsv' | 'csv' };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      const format = body.format || 'tsv';
      const parsed = parseEquipmentMatrix(body.content, format);
      const existing = await getExistingData();
      const validation = validateEquipmentMatrix(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'equipment-matrix',
        data: parsed,
        validation,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/equipment-matrix/confirm
  if (url.pathname === "/api/imports/equipment-matrix/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'equipment-matrix') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      // Check if validation passed
      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      // Execute import
      const result = await executeEquipmentMatrixImport(previewData.data as ParsedEquipmentMatrix);

      // Remove the token
      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // POST /api/imports/product-steps/preview
  if (url.pathname === "/api/imports/product-steps/preview" && request.method === "POST") {
    try {
      const body = await request.json() as {
        content: string;
        format?: 'tsv' | 'csv';
        productId?: number;
        productName?: string;
      };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      // Validate product specification
      if (!body.productId && !body.productName) {
        return Response.json({
          error: "Must specify either productId (existing product) or productName (create new product)",
        }, { status: 400 });
      }

      // If productId specified, verify it exists
      if (body.productId) {
        const productResult = await db.execute({
          sql: "SELECT id FROM products WHERE id = ?",
          args: [body.productId],
        });
        if (productResult.rows.length === 0) {
          return Response.json({ error: `Product with id ${body.productId} not found` }, { status: 404 });
        }
      }

      const format = body.format || 'tsv';
      const parsed = parseProductSteps(body.content, format);
      const existing = await getExistingData();
      const validation = validateProductSteps(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'product-steps',
        data: parsed,
        validation,
        productId: body.productId,
        productName: body.productName,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
        productInfo: body.productId
          ? { id: body.productId, action: 'use_existing' }
          : { name: body.productName, action: 'create_new' },
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/product-steps/confirm
  if (url.pathname === "/api/imports/product-steps/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'product-steps') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      // Check if validation passed
      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      // Get or create product
      let productId = previewData.productId;
      let productCreated = false;

      if (!productId && previewData.productName) {
        const result = await db.execute({
          sql: "INSERT INTO products (name) VALUES (?)",
          args: [previewData.productName],
        });
        productId = Number(result.lastInsertRowid);
        productCreated = true;
      }

      if (!productId) {
        return Response.json({ error: "No product specified" }, { status: 400 });
      }

      // Execute import
      const result = await executeProductStepsImport(previewData.data as ParsedProductSteps, productId);

      // Remove the token
      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        productId,
        productCreated,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // POST /api/imports/production-data/preview
  if (url.pathname === "/api/imports/production-data/preview" && request.method === "POST") {
    try {
      const body = await request.json() as { content: string; format?: 'tsv' | 'csv' };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      const format = body.format || 'csv';
      const parsed = parseProductionData(body.content, format);
      const existing = await getProductionDataExistingData();
      const validation = validateProductionData(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'production-data',
        data: parsed,
        validation,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/production-data/confirm
  if (url.pathname === "/api/imports/production-data/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'production-data') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      // Check if validation passed
      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      // Execute import
      const result = await executeProductionDataImport(
        previewData.validation as ProductionDataValidationResult
      );

      // Remove the token
      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // ============================================================================
  // NEW V2 IMPORT ROUTES
  // ============================================================================

  // POST /api/imports/products/preview
  if (url.pathname === "/api/imports/products/preview" && request.method === "POST") {
    try {
      const body = await request.json() as { content: string; format?: 'tsv' | 'csv' };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      const format = body.format || 'csv';
      const parsed = parseProducts(body.content, format);
      const existing = await getExistingData();
      const validation = validateProducts(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'products',
        data: parsed,
        validation,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/products/confirm
  if (url.pathname === "/api/imports/products/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'products') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      const result = await executeProductsImport(
        previewData.data as ParsedProducts,
        previewData.validation as ProductsValidationResult
      );

      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // POST /api/imports/orders/preview
  if (url.pathname === "/api/imports/orders/preview" && request.method === "POST") {
    try {
      const body = await request.json() as { content: string; format?: 'tsv' | 'csv' };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      const format = body.format || 'csv';
      const parsed = parseOrders(body.content, format);
      const existing = await getOrdersExistingData();
      const validation = validateOrders(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'orders',
        data: parsed,
        validation,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/orders/confirm
  if (url.pathname === "/api/imports/orders/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'orders') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      const result = await executeOrdersImport(previewData.validation as OrdersValidationResult);

      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // POST /api/imports/production-history/preview
  if (url.pathname === "/api/imports/production-history/preview" && request.method === "POST") {
    try {
      const body = await request.json() as { content: string; format?: 'tsv' | 'csv' };

      if (!body.content) {
        return Response.json({ error: "Missing required field: content" }, { status: 400 });
      }

      const format = body.format || 'csv';
      const parsed = parseProductionDataV2(body.content, format);
      const existing = await getProductionDataV2ExistingData();
      const validation = validateProductionDataV2(parsed, existing);

      const token = generateToken();
      previewStore.set(token, {
        type: 'production-history',
        data: parsed,
        validation,
        createdAt: Date.now(),
      });

      return Response.json({
        success: true,
        preview: validation.preview,
        errors: validation.errors,
        warnings: validation.warnings,
        importToken: token,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/imports/production-history/confirm
  if (url.pathname === "/api/imports/production-history/confirm" && request.method === "POST") {
    try {
      const body = await request.json() as { importToken: string; deriveProficiencies?: boolean };

      if (!body.importToken) {
        return Response.json({ error: "Missing required field: importToken" }, { status: 400 });
      }

      const previewData = previewStore.get(body.importToken);
      if (!previewData) {
        return Response.json({ error: "Import session not found or expired" }, { status: 404 });
      }

      if (previewData.type !== 'production-history') {
        return Response.json({ error: "Invalid import token type" }, { status: 400 });
      }

      if (!previewData.validation.valid) {
        return Response.json({
          error: "Cannot import: validation errors exist",
          errors: previewData.validation.errors,
        }, { status: 400 });
      }

      const result = await executeProductionDataV2Import(
        previewData.validation as ProductionDataV2ValidationResult
      );

      // Optionally derive proficiencies
      let proficiencyResult = null;
      if (body.deriveProficiencies !== false) {
        proficiencyResult = await deriveProficiencies();
      }

      previewStore.delete(body.importToken);

      return Response.json({
        success: true,
        result,
        proficiencies: proficiencyResult,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  // POST /api/imports/derive-proficiencies
  if (url.pathname === "/api/imports/derive-proficiencies" && request.method === "POST") {
    try {
      const result = await deriveProficiencies();
      return Response.json({
        success: true,
        result,
      });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 500 });
    }
  }

  return null;
}

// Export functions for use by seed.ts
export {
  getExistingData,
  getOrdersExistingData,
  getProductionDataV2ExistingData,
  executeEquipmentMatrixImport,
  executeProductsImport,
  executeOrdersImport,
  executeProductionDataV2Import,
  deriveProficiencies,
};

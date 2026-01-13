/**
 * Import routes for cold start spreadsheet uploads
 */

import { db } from "../db";
import {
  parseEquipmentMatrix,
  parseProductSteps,
  type ParsedEquipmentMatrix,
  type ParsedProductSteps,
} from "../services/import-parsers";
import {
  validateEquipmentMatrix,
  validateProductSteps,
  type ExistingData,
  type EquipmentMatrixValidationResult,
  type ProductStepsValidationResult,
} from "../services/import-validators";

// Preview token storage (in-memory with TTL)
interface PreviewData {
  type: 'equipment-matrix' | 'product-steps';
  data: ParsedEquipmentMatrix | ParsedProductSteps;
  validation: EquipmentMatrixValidationResult | ProductStepsValidationResult;
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

  // 2. Insert equipment
  for (const equip of parsed.equipment) {
    if (!equipmentIds.has(equip.name)) {
      const categoryId = categoryIds.get(equip.workCategoryName) || null;
      const result = await db.execute({
        sql: "INSERT INTO equipment (name, description, station_count, work_category_id) VALUES (?, ?, ?, ?)",
        args: [equip.name, equip.description, equip.stationCount, categoryId],
      });
      equipmentIds.set(equip.name, Number(result.lastInsertRowid));
      equipmentCreated++;
    }
  }

  // 3. Insert workers
  for (const worker of parsed.workers) {
    if (!workerIds.has(worker.name)) {
      const result = await db.execute({
        sql: "INSERT INTO workers (name, status) VALUES (?, 'active')",
        args: [worker.name],
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

    for (const depCode of step.dependencies) {
      const depStepId = stepIds.get(depCode);
      if (depStepId) {
        await db.execute({
          sql: "INSERT INTO step_dependencies (step_id, depends_on_step_id) VALUES (?, ?)",
          args: [stepId, depStepId],
        });
        dependenciesCreated++;
      }
    }
  }

  return { workCategoriesCreated, componentsCreated, stepsCreated, dependenciesCreated };
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

  return null;
}

/**
 * Validators for import data
 */

import type {
  ParsedEquipmentMatrix,
  ParsedProductSteps,
  ParsedProductionData,
  ParsedProductionRow,
  ParsedEquipment,
  ParsedWorker,
  ParsedCertification,
  ParsedProductStep,
  ParsedProducts,
  ParsedProductVersion,
  ParsedProductStepWithVersion,
  ParsedOrders,
  ParsedOrder,
  ParsedProductionDataV2,
  ParsedProductionRowV2,
} from './import-parsers';

export interface ValidationError {
  row?: number;
  field?: string;
  message: string;
}

export interface ValidationWarning {
  row?: number;
  field?: string;
  message: string;
}

export interface EquipmentMatrixValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    equipment: (ParsedEquipment & { action: 'create' | 'exists' })[];
    workers: (ParsedWorker & { action: 'create' | 'exists' })[];
    certifications: (ParsedCertification & { action: 'create' | 'exists' })[];
    workCategories: string[];
    summary: {
      equipmentToCreate: number;
      equipmentExisting: number;
      workersToCreate: number;
      workersExisting: number;
      certificationsToCreate: number;
      workCategoriesToCreate: number;
    };
  };
}

export interface ProductStepsValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    components: { name: string; action: 'create' | 'exists' }[];
    steps: (ParsedProductStep & {
      action: 'create';
      equipmentExists: boolean;
    })[];
    workCategories: string[];
    summary: {
      componentsToCreate: number;
      stepsToCreate: number;
      dependenciesToCreate: number;
      workCategoriesToCreate: number;
    };
  };
}

export interface ExistingData {
  equipment: Map<string, number>;  // name -> id
  workers: Map<string, number>;    // name -> id
  workCategories: Map<string, number>;  // name -> id
  components: Map<string, number>;  // name -> id
}

/**
 * Validate Equipment-Worker Matrix data
 */
export function validateEquipmentMatrix(
  parsed: ParsedEquipmentMatrix,
  existing: ExistingData
): EquipmentMatrixValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const equipmentWithAction: (ParsedEquipment & { action: 'create' | 'exists' })[] = [];
  const workersWithAction: (ParsedWorker & { action: 'create' | 'exists' })[] = [];
  const certificationsWithAction: (ParsedCertification & { action: 'create' | 'exists' })[] = [];

  // Check for duplicate work codes in upload
  const seenWorkCodes = new Set<string>();
  for (const equip of parsed.equipment) {
    if (seenWorkCodes.has(equip.name)) {
      errors.push({ field: 'Work Code', message: `Duplicate Work Code: ${equip.name}` });
    }
    seenWorkCodes.add(equip.name);

    // Check if equipment exists
    const exists = existing.equipment.has(equip.name);
    equipmentWithAction.push({ ...equip, action: exists ? 'exists' : 'create' });

    // Warn if no description
    if (!equip.description) {
      warnings.push({ field: 'Work Type', message: `Missing Work Type for equipment ${equip.name}` });
    }
  }

  // Check workers
  const seenWorkerNames = new Set<string>();
  for (const worker of parsed.workers) {
    if (seenWorkerNames.has(worker.name)) {
      errors.push({ field: 'Worker', message: `Duplicate worker name: ${worker.name}` });
    }
    seenWorkerNames.add(worker.name);

    const exists = existing.workers.has(worker.name);
    workersWithAction.push({ ...worker, action: exists ? 'exists' : 'create' });
  }

  // Check certifications and build certification set for duplicate detection
  const certSet = new Set<string>();
  for (const cert of parsed.certifications) {
    const key = `${cert.workerName}:${cert.equipmentName}`;
    if (certSet.has(key)) {
      warnings.push({ message: `Duplicate certification: ${cert.workerName} -> ${cert.equipmentName}` });
      continue;
    }
    certSet.add(key);

    // Will be 'exists' only if both worker and equipment exist in DB
    // For now, mark as 'create' since we're doing cold start
    certificationsWithAction.push({ ...cert, action: 'create' });
  }

  // Warn about workers with no certifications
  const workersWithCerts = new Set(parsed.certifications.map(c => c.workerName));
  for (const worker of parsed.workers) {
    if (!workersWithCerts.has(worker.name)) {
      warnings.push({ message: `Worker '${worker.name}' has no certifications` });
    }
  }

  // Warn about equipment with no certified workers
  const equipmentWithCerts = new Set(parsed.certifications.map(c => c.equipmentName));
  for (const equip of parsed.equipment) {
    if (!equipmentWithCerts.has(equip.name)) {
      warnings.push({ message: `Equipment '${equip.name}' has no certified workers` });
    }
  }

  // Calculate work categories to create
  const workCategoriesToCreate = [...parsed.workCategories].filter(
    cat => !existing.workCategories.has(cat)
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      equipment: equipmentWithAction,
      workers: workersWithAction,
      certifications: certificationsWithAction,
      workCategories: [...parsed.workCategories],
      summary: {
        equipmentToCreate: equipmentWithAction.filter(e => e.action === 'create').length,
        equipmentExisting: equipmentWithAction.filter(e => e.action === 'exists').length,
        workersToCreate: workersWithAction.filter(w => w.action === 'create').length,
        workersExisting: workersWithAction.filter(w => w.action === 'exists').length,
        certificationsToCreate: certificationsWithAction.length,
        workCategoriesToCreate: workCategoriesToCreate.length,
      },
    },
  };
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(steps: ParsedProductStep[]): string[] {
  const graph = new Map<string, string[]>();
  const stepCodes = new Set(steps.map(s => s.stepCode));

  // Build adjacency list
  for (const step of steps) {
    graph.set(step.stepCode, step.dependencies.map(d => d.stepCode).filter(code => stepCodes.has(code)));
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[] = [];

  function dfs(node: string, path: string[]): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...path, neighbor])) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).join(' -> ') + ' -> ' + neighbor;
        cycles.push(cycle);
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.stepCode)) {
      dfs(step.stepCode, [step.stepCode]);
    }
  }

  return cycles;
}

/**
 * Validate Product Steps data
 */
export function validateProductSteps(
  parsed: ParsedProductSteps,
  existing: ExistingData
): ProductStepsValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const stepsWithAction: (ParsedProductStep & {
    action: 'create';
    equipmentExists: boolean;
  })[] = [];

  const componentsWithAction: { name: string; action: 'create' | 'exists' }[] = [];

  // Build step code set for dependency validation
  const stepCodes = new Set(parsed.steps.map(s => s.stepCode));

  // Check for duplicate step codes
  const seenStepCodes = new Set<string>();
  for (const step of parsed.steps) {
    if (seenStepCodes.has(step.stepCode)) {
      errors.push({ row: step.rowNumber, field: 'ID', message: `Duplicate Step ID: ${step.stepCode}` });
    }
    seenStepCodes.add(step.stepCode);

    // Validate time
    if (step.timePerPieceSeconds <= 0) {
      errors.push({ row: step.rowNumber, field: 'Time', message: `Invalid time value` });
    }

    // Validate equipment exists
    const equipmentExists = existing.equipment.has(step.equipmentCode);
    if (step.equipmentCode && !equipmentExists) {
      errors.push({
        row: step.rowNumber,
        field: 'Equipment code',
        message: `Equipment '${step.equipmentCode}' not found`,
      });
    }

    // Validate dependencies exist in this upload
    for (const dep of step.dependencies) {
      if (!stepCodes.has(dep.stepCode)) {
        warnings.push({
          row: step.rowNumber,
          field: 'Dependency',
          message: `Dependency '${dep.stepCode}' not found in upload`,
        });
      }
    }

    // Warn if no component name
    if (!step.componentName) {
      warnings.push({ row: step.rowNumber, field: 'Component', message: `Missing component name` });
    }

    stepsWithAction.push({ ...step, action: 'create', equipmentExists });
  }

  // Check for circular dependencies
  const cycles = detectCircularDependencies(parsed.steps);
  for (const cycle of cycles) {
    errors.push({ message: `Circular dependency detected: ${cycle}` });
  }

  // Check components
  for (const compName of parsed.components) {
    const exists = existing.components.has(compName);
    componentsWithAction.push({ name: compName, action: exists ? 'exists' : 'create' });
  }

  // Calculate work categories to create
  const workCategoriesToCreate = [...parsed.workCategories].filter(
    cat => !existing.workCategories.has(cat)
  );

  // Count total dependencies
  const totalDependencies = parsed.steps.reduce((sum, s) => sum + s.dependencies.length, 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      components: componentsWithAction,
      steps: stepsWithAction,
      workCategories: [...parsed.workCategories],
      summary: {
        componentsToCreate: componentsWithAction.filter(c => c.action === 'create').length,
        stepsToCreate: stepsWithAction.length,
        dependenciesToCreate: totalDependencies,
        workCategoriesToCreate: workCategoriesToCreate.length,
      },
    },
  };
}

// Production Data validation types
export interface ProductionDataExistingData extends ExistingData {
  orders: Map<number, { id: number; productId: number; productName: string }>;
  productSteps: Map<number, Map<string, { id: number; name: string }>>; // productId -> stepCode -> step info
  existingAssignments: Set<string>; // "workerId:stepId:date" keys
}

export interface ProductionDataValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    rows: (ParsedProductionRow & {
      orderId: number;
      orderProductName: string;
      workerId: number;
      productStepId: number;
    })[];
    summary: {
      totalRows: number;
      ordersAffected: number;
      workersInvolved: number;
      stepsInvolved: number;
      schedulesToCreate: number;
      entriesToCreate: number;
      assignmentsToCreate: number;
    };
  };
}

/**
 * Validate Production Data for import
 */
export function validateProductionData(
  parsed: ParsedProductionData,
  existing: ProductionDataExistingData
): ProductionDataValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const validatedRows: (ParsedProductionRow & {
    orderId: number;
    orderProductName: string;
    workerId: number;
    productStepId: number;
  })[] = [];

  // Track unique combinations for summary
  const uniqueOrderDates = new Set<string>(); // For schedule count estimation
  const uniqueStepDates = new Set<string>(); // For entry count estimation
  const uniqueWorkers = new Set<number>();
  const uniqueSteps = new Set<number>();

  // Check each row
  for (const row of parsed.rows) {
    // Validate order exists
    const order = existing.orders.get(row.orderId);
    if (!order) {
      errors.push({
        row: row.rowNumber,
        field: 'order_id',
        message: `Order with ID ${row.orderId} does not exist`,
      });
      continue;
    }

    // Validate step_code exists for this order's product
    const productSteps = existing.productSteps.get(order.productId);
    if (!productSteps) {
      errors.push({
        row: row.rowNumber,
        field: 'step_code',
        message: `Product ${order.productName} (ID: ${order.productId}) has no steps defined`,
      });
      continue;
    }

    const step = productSteps.get(row.stepCode);
    if (!step) {
      errors.push({
        row: row.rowNumber,
        field: 'step_code',
        message: `Step code "${row.stepCode}" not found for product "${order.productName}"`,
      });
      continue;
    }

    // Validate worker exists (exact match)
    const workerId = existing.workers.get(row.workerName);
    if (!workerId) {
      errors.push({
        row: row.rowNumber,
        field: 'worker_name',
        message: `Worker "${row.workerName}" not found. Please add this worker to the system first.`,
      });
      continue;
    }

    // Check for duplicates - same worker + step + date
    const dupKey = `${workerId}:${step.id}:${row.date}`;
    if (existing.existingAssignments.has(dupKey)) {
      errors.push({
        row: row.rowNumber,
        message: `Duplicate: Worker "${row.workerName}" already has an assignment for step "${row.stepCode}" on ${row.date}`,
      });
      continue;
    }

    // Calculate week start for schedule grouping
    const date = new Date(row.date);
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    uniqueOrderDates.add(`${row.orderId}:${weekStartStr}`);
    uniqueStepDates.add(`${row.orderId}:${step.id}:${row.date}`);
    uniqueWorkers.add(workerId);
    uniqueSteps.add(step.id);

    validatedRows.push({
      ...row,
      orderId: row.orderId,
      orderProductName: order.productName,
      workerId,
      productStepId: step.id,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      rows: validatedRows,
      summary: {
        totalRows: validatedRows.length,
        ordersAffected: parsed.orderIds.size,
        workersInvolved: uniqueWorkers.size,
        stepsInvolved: uniqueSteps.size,
        schedulesToCreate: uniqueOrderDates.size,
        entriesToCreate: uniqueStepDates.size,
        assignmentsToCreate: validatedRows.length,
      },
    },
  };
}

// ============================================================================
// NEW VALIDATORS FOR V2 IMPORT SYSTEM
// ============================================================================

// Products CSV validation types
export interface ProductsValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    products: {
      name: string;
      versions: {
        versionName: string;
        versionNumber: number;
        isDefault: boolean;
        stepCount: number;
      }[];
    }[];
    components: { name: string; action: 'create' | 'exists' }[];
    workCategories: string[];
    summary: {
      productsToCreate: number;
      versionsToCreate: number;
      stepsToCreate: number;
      componentsToCreate: number;
      dependenciesToCreate: number;
      workCategoriesToCreate: number;
    };
  };
}

/**
 * Detect circular dependencies within a version's steps using DFS
 */
function detectCircularDependenciesInVersion(steps: ParsedProductStepWithVersion[]): string[] {
  const graph = new Map<string, string[]>();
  const stepCodes = new Set(steps.map(s => s.stepCode));

  // Build adjacency list
  for (const step of steps) {
    graph.set(step.stepCode, step.dependencies.map(d => d.stepCode).filter(code => stepCodes.has(code)));
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[] = [];

  function dfs(node: string, path: string[]): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...path, neighbor])) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).join(' -> ') + ' -> ' + neighbor;
        cycles.push(cycle);
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.stepCode)) {
      dfs(step.stepCode, [step.stepCode]);
    }
  }

  return cycles;
}

/**
 * Validate Products CSV data
 */
export function validateProducts(
  parsed: ParsedProducts,
  existing: ExistingData
): ProductsValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const productPreviews: {
    name: string;
    versions: {
      versionName: string;
      versionNumber: number;
      isDefault: boolean;
      stepCount: number;
    }[];
  }[] = [];

  let totalVersions = 0;
  let totalSteps = 0;
  let totalDependencies = 0;

  // Validate each product
  for (const [productName, versions] of parsed.products) {
    const versionPreviews: {
      versionName: string;
      versionNumber: number;
      isDefault: boolean;
      stepCount: number;
    }[] = [];

    // Check for exactly one default version
    const defaultVersions = [...versions.values()].filter(v => v.isDefault);
    if (defaultVersions.length === 0) {
      errors.push({
        message: `Product "${productName}" has no default version. Mark one version with is_default=Y`,
      });
    } else if (defaultVersions.length > 1) {
      errors.push({
        message: `Product "${productName}" has multiple default versions: ${defaultVersions.map(v => v.versionName).join(', ')}`,
      });
    }

    // Validate each version
    for (const [versionNumber, version] of versions) {
      totalVersions++;

      // Check for duplicate step codes within version
      const seenStepCodes = new Set<string>();
      for (const step of version.steps) {
        if (seenStepCodes.has(step.stepCode)) {
          errors.push({
            row: step.rowNumber,
            field: 'step_code',
            message: `Duplicate step_code "${step.stepCode}" in ${productName} ${version.versionName}`,
          });
        }
        seenStepCodes.add(step.stepCode);

        // Validate equipment exists
        if (step.equipmentCode && !existing.equipment.has(step.equipmentCode)) {
          errors.push({
            row: step.rowNumber,
            field: 'equipment_code',
            message: `Equipment "${step.equipmentCode}" not found. Import Worker-Equipment CSV first.`,
          });
        }

        // Validate dependencies exist within this version
        for (const dep of step.dependencies) {
          if (!seenStepCodes.has(dep.stepCode) && !version.steps.some(s => s.stepCode === dep.stepCode)) {
            warnings.push({
              row: step.rowNumber,
              field: 'dependencies',
              message: `Dependency "${dep.stepCode}" not found in ${productName} ${version.versionName}`,
            });
          }
        }

        // Warn if no component
        if (!step.componentName) {
          warnings.push({
            row: step.rowNumber,
            field: 'component',
            message: `Missing component name for step ${step.stepCode}`,
          });
        }

        totalSteps++;
        totalDependencies += step.dependencies.length;
      }

      // Check for circular dependencies
      const cycles = detectCircularDependenciesInVersion(version.steps);
      for (const cycle of cycles) {
        errors.push({
          message: `Circular dependency in ${productName} ${version.versionName}: ${cycle}`,
        });
      }

      versionPreviews.push({
        versionName: version.versionName,
        versionNumber,
        isDefault: version.isDefault,
        stepCount: version.steps.length,
      });
    }

    productPreviews.push({
      name: productName,
      versions: versionPreviews,
    });
  }

  // Check components
  const componentsWithAction: { name: string; action: 'create' | 'exists' }[] = [];
  for (const compName of parsed.components) {
    const exists = existing.components.has(compName);
    componentsWithAction.push({ name: compName, action: exists ? 'exists' : 'create' });
  }

  // Calculate work categories to create
  const workCategoriesToCreate = [...parsed.workCategories].filter(
    cat => !existing.workCategories.has(cat)
  );

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      products: productPreviews,
      components: componentsWithAction,
      workCategories: [...parsed.workCategories],
      summary: {
        productsToCreate: parsed.products.size,
        versionsToCreate: totalVersions,
        stepsToCreate: totalSteps,
        componentsToCreate: componentsWithAction.filter(c => c.action === 'create').length,
        dependenciesToCreate: totalDependencies,
        workCategoriesToCreate: workCategoriesToCreate.length,
      },
    },
  };
}

// Orders CSV validation types
export interface OrdersExistingData extends ExistingData {
  products: Map<string, { id: number; name: string }>;  // name -> product info
}

export interface OrdersValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    orders: (ParsedOrder & {
      productId: number;
    })[];
    summary: {
      ordersToCreate: number;
      productsReferenced: number;
    };
  };
}

/**
 * Validate Orders CSV data
 * Note: Orders no longer include version - version is determined at scheduling time
 */
export function validateOrders(
  parsed: ParsedOrders,
  existing: OrdersExistingData
): OrdersValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const validatedOrders: (ParsedOrder & {
    productId: number;
  })[] = [];

  // Track duplicate orders (same product + due_date)
  const orderKeys = new Set<string>();

  for (const order of parsed.orders) {
    // Validate product exists
    const product = existing.products.get(order.productName);
    if (!product) {
      errors.push({
        row: order.rowNumber,
        field: 'product_name',
        message: `Product "${order.productName}" not found. Import Products CSV first.`,
      });
      continue;
    }

    // Check for duplicate order (same product + due_date)
    const orderKey = `${order.productName}:${order.dueDate}`;
    if (orderKeys.has(orderKey)) {
      errors.push({
        row: order.rowNumber,
        message: `Duplicate order: ${order.productName} with due date ${order.dueDate} already exists in this import`,
      });
      continue;
    }
    orderKeys.add(orderKey);

    // Warn about past due dates
    const dueDate = new Date(order.dueDate);
    if (dueDate < new Date()) {
      warnings.push({
        row: order.rowNumber,
        field: 'due_date',
        message: `Due date ${order.dueDate} is in the past`,
      });
    }

    // Warn about very large quantities
    if (order.quantity > 10000) {
      warnings.push({
        row: order.rowNumber,
        field: 'quantity',
        message: `Large quantity: ${order.quantity}`,
      });
    }

    validatedOrders.push({
      ...order,
      productId: product.id,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      orders: validatedOrders,
      summary: {
        ordersToCreate: validatedOrders.length,
        productsReferenced: parsed.productNames.size,
      },
    },
  };
}

// Production History V2 validation types
export interface ProductionDataV2ExistingData extends ExistingData {
  // orderKey (productName:dueDate) -> order info (no longer includes buildVersionId)
  ordersByKey: Map<string, { id: number; productId: number; productName: string }>;
  // productId -> versionName -> build version info
  productVersions: Map<number, Map<string, { id: number; versionName: string }>>;
  // buildVersionId -> stepCode -> step info
  versionSteps: Map<number, Map<string, { id: number; name: string; timePerPieceSeconds: number }>>;
  existingAssignments: Set<string>; // "workerId:stepId:date" keys
}

export interface ProductionDataV2ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  preview: {
    rows: (ParsedProductionRowV2 & {
      orderId: number;
      workerId: number;
      productStepId: number;
      buildVersionId: number;  // Version used for this production record
      expectedTimeSeconds: number;  // For proficiency calculation
    })[];
    summary: {
      totalRows: number;
      ordersAffected: number;
      workersInvolved: number;
      stepsInvolved: number;
      schedulesToCreate: number;
      entriesToCreate: number;
      assignmentsToCreate: number;
    };
  };
}

/**
 * Validate Production History V2 data (uses product_name + due_date + version_name)
 * Note: version_name is now required and explicitly provided in the CSV
 */
export function validateProductionDataV2(
  parsed: ParsedProductionDataV2,
  existing: ProductionDataV2ExistingData
): ProductionDataV2ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const validatedRows: (ParsedProductionRowV2 & {
    orderId: number;
    workerId: number;
    productStepId: number;
    buildVersionId: number;
    expectedTimeSeconds: number;
  })[] = [];

  // Track unique combinations for summary
  const uniqueOrderDates = new Set<string>(); // For schedule count estimation
  const uniqueStepDates = new Set<string>(); // For entry count estimation
  const uniqueWorkers = new Set<number>();
  const uniqueSteps = new Set<number>();
  const uniqueOrders = new Set<number>();

  // Check each row
  for (const row of parsed.rows) {
    // Build order key
    const orderKey = `${row.productName}:${row.dueDate}`;

    // Validate order exists
    const order = existing.ordersByKey.get(orderKey);
    if (!order) {
      errors.push({
        row: row.rowNumber,
        field: 'product_name/due_date',
        message: `Order not found: "${row.productName}" with due date ${row.dueDate}. Import Orders CSV first.`,
      });
      continue;
    }

    // Validate version_name exists for this product
    const productVersions = existing.productVersions.get(order.productId);
    if (!productVersions) {
      errors.push({
        row: row.rowNumber,
        field: 'version_name',
        message: `Product "${row.productName}" has no build versions`,
      });
      continue;
    }

    const version = productVersions.get(row.versionName);
    if (!version) {
      errors.push({
        row: row.rowNumber,
        field: 'version_name',
        message: `Version "${row.versionName}" not found for product "${row.productName}"`,
      });
      continue;
    }

    // Validate step_code exists for this version
    const versionSteps = existing.versionSteps.get(version.id);
    if (!versionSteps) {
      errors.push({
        row: row.rowNumber,
        field: 'step_code',
        message: `No steps found for version "${row.versionName}"`,
      });
      continue;
    }

    const step = versionSteps.get(row.stepCode);
    if (!step) {
      errors.push({
        row: row.rowNumber,
        field: 'step_code',
        message: `Step code "${row.stepCode}" not found in version "${row.versionName}" of product "${row.productName}"`,
      });
      continue;
    }

    // Validate worker exists (exact match)
    const workerId = existing.workers.get(row.workerName);
    if (!workerId) {
      errors.push({
        row: row.rowNumber,
        field: 'worker_name',
        message: `Worker "${row.workerName}" not found. Import Worker-Equipment CSV first.`,
      });
      continue;
    }

    // Check for duplicates - same worker + step + date + time
    const dupKey = `${workerId}:${step.id}:${row.workDate}:${row.startTime}`;
    if (existing.existingAssignments.has(dupKey)) {
      errors.push({
        row: row.rowNumber,
        message: `Duplicate: Worker "${row.workerName}" already has an assignment for step "${row.stepCode}" on ${row.workDate} at ${row.startTime}`,
      });
      continue;
    }

    // Warn if work date is after order due date
    if (row.workDate > row.dueDate) {
      warnings.push({
        row: row.rowNumber,
        message: `Work date ${row.workDate} is after order due date ${row.dueDate}`,
      });
    }

    // Calculate week start for schedule grouping
    const date = new Date(row.workDate);
    const dayOfWeek = date.getDay();
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    uniqueOrderDates.add(`${order.id}:${weekStartStr}`);
    uniqueStepDates.add(`${order.id}:${step.id}:${row.workDate}`);
    uniqueWorkers.add(workerId);
    uniqueSteps.add(step.id);
    uniqueOrders.add(order.id);

    // Calculate expected time for proficiency calculation
    const expectedTimeSeconds = step.timePerPieceSeconds * row.units;

    validatedRows.push({
      ...row,
      orderId: order.id,
      workerId,
      productStepId: step.id,
      buildVersionId: version.id,
      expectedTimeSeconds,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    preview: {
      rows: validatedRows,
      summary: {
        totalRows: validatedRows.length,
        ordersAffected: uniqueOrders.size,
        workersInvolved: uniqueWorkers.size,
        stepsInvolved: uniqueSteps.size,
        schedulesToCreate: uniqueOrderDates.size,
        entriesToCreate: uniqueStepDates.size,
        assignmentsToCreate: validatedRows.length,
      },
    },
  };
}

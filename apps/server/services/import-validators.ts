/**
 * Validators for import data
 */

import type {
  ParsedEquipmentMatrix,
  ParsedProductSteps,
  ParsedEquipment,
  ParsedWorker,
  ParsedCertification,
  ParsedProductStep,
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
    graph.set(step.stepCode, step.dependencies.filter(d => stepCodes.has(d)));
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
      if (!stepCodes.has(dep)) {
        warnings.push({
          row: step.rowNumber,
          field: 'Dependency',
          message: `Dependency '${dep}' not found in upload`,
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

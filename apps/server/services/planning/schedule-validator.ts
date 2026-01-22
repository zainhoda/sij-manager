/**
 * Schedule Validator Service
 * Validates schedule edits for worker certifications, time conflicts, and work categories
 */

import type { Worker, BOMStep } from "../../db/schema";
import type { ScheduleTask } from "./scenario-generator";

export interface ValidationError {
  taskIndex: number;
  field: string;
  message: string;
}

export interface ValidationWarning {
  taskIndex: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationContext {
  workers: Worker[];
  bomSteps: Map<number, BOMStep>;
  certifications: Map<number, Set<number>>; // workerId -> Set<equipmentId>
  workCategories: Map<number, number>; // workerId -> workCategoryId
}

/**
 * Validate a schedule for errors and warnings
 */
export function validateSchedule(
  schedule: ScheduleTask[],
  context: ValidationContext
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Build a map of worker time slots for conflict detection
  const workerTimeSlots = new Map<number, { date: string; start: number; end: number; taskIndex: number }[]>();

  for (let i = 0; i < schedule.length; i++) {
    const task = schedule[i];

    // Validate each assigned worker
    for (const workerId of task.workerIds) {
      const worker = context.workers.find(w => w.id === workerId);
      if (!worker) {
        errors.push({
          taskIndex: i,
          field: "workerIds",
          message: `Worker ID ${workerId} not found`,
        });
        continue;
      }

      // Check worker is active
      if (worker.status !== "active") {
        warnings.push({
          taskIndex: i,
          message: `Worker "${worker.name}" is ${worker.status}`,
        });
      }

      const bomStep = context.bomSteps.get(task.bomStepId);
      if (!bomStep) {
        errors.push({
          taskIndex: i,
          field: "bomStepId",
          message: `BOM step ID ${task.bomStepId} not found`,
        });
        continue;
      }

      // Check certification for equipment
      if (bomStep.equipment_id) {
        const workerCerts = context.certifications.get(workerId);
        if (!workerCerts || !workerCerts.has(bomStep.equipment_id)) {
          errors.push({
            taskIndex: i,
            field: "workerIds",
            message: `Worker "${worker.name}" is not certified for equipment required by step "${task.stepName}"`,
          });
        }
      }

      // Work category is descriptive only - not validated

      // Check for time conflicts
      const startMinutes = timeToMinutes(task.startTime);
      const endMinutes = timeToMinutes(task.endTime);

      if (!workerTimeSlots.has(workerId)) {
        workerTimeSlots.set(workerId, []);
      }

      const slots = workerTimeSlots.get(workerId)!;
      for (const slot of slots) {
        if (slot.date === task.date) {
          // Check for overlap
          if (startMinutes < slot.end && endMinutes > slot.start) {
            errors.push({
              taskIndex: i,
              field: "startTime",
              message: `Time conflict: Worker "${worker.name}" is already assigned from ${minutesToTime(slot.start)} to ${minutesToTime(slot.end)} on ${task.date}`,
            });
          }
        }
      }

      slots.push({ date: task.date, start: startMinutes, end: endMinutes, taskIndex: i });
    }

    // Validate planned output
    if (task.plannedOutput <= 0) {
      errors.push({
        taskIndex: i,
        field: "plannedOutput",
        message: "Planned output must be greater than 0",
      });
    }

    // Validate time range
    const startMinutes = timeToMinutes(task.startTime);
    const endMinutes = timeToMinutes(task.endTime);
    if (endMinutes <= startMinutes) {
      errors.push({
        taskIndex: i,
        field: "endTime",
        message: "End time must be after start time",
      });
    }

    // Warn if no workers assigned
    if (task.workerIds.length === 0) {
      warnings.push({
        taskIndex: i,
        message: "No workers assigned to this task",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/**
 * Convert minutes since midnight to time string (HH:MM)
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Get qualified workers for a specific BOM step
 */
export function getQualifiedWorkersForStep(
  bomStep: BOMStep,
  workers: Worker[],
  certifications: Map<number, Set<number>>
): Worker[] {
  return workers.filter(worker => {
    // Must be active
    if (worker.status !== "active") return false;

    // If step requires equipment, worker must be certified
    if (bomStep.equipment_id) {
      const workerCerts = certifications.get(worker.id);
      if (!workerCerts || !workerCerts.has(bomStep.equipment_id)) {
        return false;
      }
    }

    return true;
  });
}

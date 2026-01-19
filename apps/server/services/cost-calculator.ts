import { db } from "../db";
import type { Worker, Equipment, TaskWorkerAssignment, ScheduleEntry } from "../db/schema";

export interface WorkerCostDetail {
  workerId: number;
  workerName: string;
  costPerHour: number;
  hoursWorked: number;
  cost: number;
}

export interface EquipmentCostDetail {
  equipmentId: number;
  equipmentName: string;
  hourlyRate: number;
  hoursUsed: number;
  cost: number;
}

export interface EntryCostBreakdown {
  entryId: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  durationMinutes: number;
  workerDetails: WorkerCostDetail[];
  equipmentDetails: EquipmentCostDetail | null;
}

export interface ScheduleCostSummary {
  scheduleId: number;
  estimatedLaborCost: number;
  estimatedEquipmentCost: number;
  estimatedTotalCost: number;
  actualLaborCost: number;
  actualEquipmentCost: number;
  actualTotalCost: number;
  variance: number;
  variancePercentage: number;
  entryBreakdowns: EntryCostBreakdown[];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function calculateDurationMinutes(startTime: string, endTime: string): number {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

export async function calculateEstimatedEntryCost(entryId: number): Promise<EntryCostBreakdown> {
  // Get the schedule entry with product step info
  const entryResult = await db.execute({
    sql: `
      SELECT se.*, ps.equipment_id
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.id = ?
    `,
    args: [entryId]
  });
  const entry = entryResult.rows[0] as unknown as (ScheduleEntry & { equipment_id: number | null }) | undefined;

  if (!entry) {
    return {
      entryId,
      laborCost: 0,
      equipmentCost: 0,
      totalCost: 0,
      durationMinutes: 0,
      workerDetails: [],
      equipmentDetails: null,
    };
  }

  const durationMinutes = calculateDurationMinutes(entry.start_time, entry.end_time);
  const durationHours = durationMinutes / 60;

  // Get all workers assigned to this entry with their cost_per_hour
  const assignmentsResult = await db.execute({
    sql: `
      SELECT twa.worker_id, w.name as worker_name, w.cost_per_hour
      FROM task_worker_assignments twa
      JOIN workers w ON twa.worker_id = w.id
      WHERE twa.schedule_entry_id = ?
    `,
    args: [entryId]
  });
  const assignments = assignmentsResult.rows as unknown as { worker_id: number; worker_name: string; cost_per_hour: number }[];

  // Calculate labor cost - each assigned worker works for the duration
  const workerDetails: WorkerCostDetail[] = assignments.map(a => ({
    workerId: a.worker_id,
    workerName: a.worker_name,
    costPerHour: a.cost_per_hour || 0,
    hoursWorked: durationHours,
    cost: durationHours * (a.cost_per_hour || 0),
  }));

  const laborCost = workerDetails.reduce((sum, w) => sum + w.cost, 0);

  // Calculate equipment cost if equipment is assigned
  let equipmentDetails: EquipmentCostDetail | null = null;
  let equipmentCost = 0;

  if (entry.equipment_id) {
    const equipmentResult = await db.execute({
      sql: "SELECT id, name, hourly_cost FROM equipment WHERE id = ?",
      args: [entry.equipment_id]
    });
    const equipment = equipmentResult.rows[0] as unknown as { id: number; name: string; hourly_cost: number } | undefined;

    if (equipment) {
      equipmentCost = durationHours * (equipment.hourly_cost || 0);
      equipmentDetails = {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        hourlyRate: equipment.hourly_cost || 0,
        hoursUsed: durationHours,
        cost: equipmentCost,
      };
    }
  }

  return {
    entryId,
    laborCost,
    equipmentCost,
    totalCost: laborCost + equipmentCost,
    durationMinutes,
    workerDetails,
    equipmentDetails,
  };
}

export async function calculateActualEntryCost(entryId: number): Promise<EntryCostBreakdown> {
  // Get the schedule entry with product step info
  const entryResult = await db.execute({
    sql: `
      SELECT se.*, ps.equipment_id
      FROM schedule_entries se
      JOIN product_steps ps ON se.product_step_id = ps.id
      WHERE se.id = ?
    `,
    args: [entryId]
  });
  const entry = entryResult.rows[0] as unknown as (ScheduleEntry & { equipment_id: number | null }) | undefined;

  if (!entry) {
    return {
      entryId,
      laborCost: 0,
      equipmentCost: 0,
      totalCost: 0,
      durationMinutes: 0,
      workerDetails: [],
      equipmentDetails: null,
    };
  }

  // Get all workers assigned to this entry with their actual times and cost_per_hour
  const assignmentsResult = await db.execute({
    sql: `
      SELECT twa.worker_id, twa.actual_start_time, twa.actual_end_time,
             w.name as worker_name, w.cost_per_hour
      FROM task_worker_assignments twa
      JOIN workers w ON twa.worker_id = w.id
      WHERE twa.schedule_entry_id = ?
    `,
    args: [entryId]
  });
  const assignments = assignmentsResult.rows as unknown as {
    worker_id: number;
    worker_name: string;
    cost_per_hour: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
  }[];

  // Calculate labor cost based on actual times worked
  let totalDurationMinutes = 0;
  const workerDetails: WorkerCostDetail[] = assignments.map(a => {
    // If no actual times recorded, use 0 hours
    if (!a.actual_start_time || !a.actual_end_time) {
      return {
        workerId: a.worker_id,
        workerName: a.worker_name,
        costPerHour: a.cost_per_hour || 0,
        hoursWorked: 0,
        cost: 0,
      };
    }

    const actualMinutes = calculateDurationMinutes(a.actual_start_time, a.actual_end_time);
    const actualHours = actualMinutes / 60;
    totalDurationMinutes = Math.max(totalDurationMinutes, actualMinutes);

    return {
      workerId: a.worker_id,
      workerName: a.worker_name,
      costPerHour: a.cost_per_hour || 0,
      hoursWorked: actualHours,
      cost: actualHours * (a.cost_per_hour || 0),
    };
  });

  const laborCost = workerDetails.reduce((sum, w) => sum + w.cost, 0);

  // Calculate equipment cost based on actual duration (max of all worker durations)
  let equipmentDetails: EquipmentCostDetail | null = null;
  let equipmentCost = 0;

  if (entry.equipment_id && totalDurationMinutes > 0) {
    const equipmentResult = await db.execute({
      sql: "SELECT id, name, hourly_cost FROM equipment WHERE id = ?",
      args: [entry.equipment_id]
    });
    const equipment = equipmentResult.rows[0] as unknown as { id: number; name: string; hourly_cost: number } | undefined;

    if (equipment) {
      const actualHours = totalDurationMinutes / 60;
      equipmentCost = actualHours * (equipment.hourly_cost || 0);
      equipmentDetails = {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        hourlyRate: equipment.hourly_cost || 0,
        hoursUsed: actualHours,
        cost: equipmentCost,
      };
    }
  }

  return {
    entryId,
    laborCost,
    equipmentCost,
    totalCost: laborCost + equipmentCost,
    durationMinutes: totalDurationMinutes,
    workerDetails,
    equipmentDetails,
  };
}

export async function getScheduleCostSummary(scheduleId: number): Promise<ScheduleCostSummary | null> {
  // Verify schedule exists
  const scheduleResult = await db.execute({
    sql: "SELECT id FROM schedules WHERE id = ?",
    args: [scheduleId]
  });
  if (scheduleResult.rows.length === 0) {
    return null;
  }

  // Get all schedule entries for this schedule
  const entriesResult = await db.execute({
    sql: "SELECT id FROM schedule_entries WHERE schedule_id = ?",
    args: [scheduleId]
  });
  const entries = entriesResult.rows as unknown as { id: number }[];

  let estimatedLaborCost = 0;
  let estimatedEquipmentCost = 0;
  let actualLaborCost = 0;
  let actualEquipmentCost = 0;
  const entryBreakdowns: EntryCostBreakdown[] = [];

  for (const entry of entries) {
    const estimated = await calculateEstimatedEntryCost(entry.id);
    const actual = await calculateActualEntryCost(entry.id);

    estimatedLaborCost += estimated.laborCost;
    estimatedEquipmentCost += estimated.equipmentCost;
    actualLaborCost += actual.laborCost;
    actualEquipmentCost += actual.equipmentCost;

    // For the breakdown, include both estimated and actual in a combined view
    entryBreakdowns.push({
      ...estimated,
      // Override with actual if available
      laborCost: actual.laborCost > 0 ? actual.laborCost : estimated.laborCost,
      equipmentCost: actual.equipmentCost > 0 ? actual.equipmentCost : estimated.equipmentCost,
      totalCost: actual.totalCost > 0 ? actual.totalCost : estimated.totalCost,
    });
  }

  const estimatedTotalCost = estimatedLaborCost + estimatedEquipmentCost;
  const actualTotalCost = actualLaborCost + actualEquipmentCost;

  // Positive variance = under budget, negative = over budget
  const variance = estimatedTotalCost - actualTotalCost;
  const variancePercentage = estimatedTotalCost > 0
    ? (variance / estimatedTotalCost) * 100
    : 0;

  return {
    scheduleId,
    estimatedLaborCost,
    estimatedEquipmentCost,
    estimatedTotalCost,
    actualLaborCost,
    actualEquipmentCost,
    actualTotalCost,
    variance,
    variancePercentage,
    entryBreakdowns,
  };
}

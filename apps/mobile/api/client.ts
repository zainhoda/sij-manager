/**
 * API Client for SIJ Production Scheduler
 */

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Types matching server responses
export interface Product {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ProductStep {
  id: number;
  product_id: number;
  name: string;
  category: 'CUTTING' | 'SILKSCREEN' | 'PREP' | 'SEWING' | 'INSPECTION';
  time_per_piece_seconds: number;
  sequence: number;
  required_skill_category: 'SEWING' | 'OTHER';
  parent_step_code: string | null;
  equipment_id: number | null;
  dependencies: number[];
}

export interface Order {
  id: number;
  product_id: number;
  quantity: number;
  due_date: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  color: string | null;
  created_at: string;
  product_name?: string;
}

// Task Worker Assignment for multi-worker per task
export interface TaskWorkerAssignment {
  id: number;
  schedule_entry_id: number;
  worker_id: number;
  worker_name: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
  assigned_at: string;
}

export interface ScheduleEntry {
  id: number;
  schedule_id: number;
  product_step_id: number;
  worker_id: number | null; // Deprecated - use assignments
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  actual_start_time: string | null; // Deprecated - use assignments
  actual_end_time: string | null; // Deprecated - use assignments
  actual_output: number; // Deprecated - use total_actual_output
  status: 'not_started' | 'in_progress' | 'completed'; // Deprecated - use computed_status
  notes: string | null;
  step_name: string;
  category: string;
  required_skill_category: string;
  time_per_piece_seconds?: number;
  equipment_id?: number | null;
  equipment_name?: string | null;
  worker_name?: string | null; // Deprecated - use assignments
  order_color?: string | null;
  product_name?: string;
  // New multi-worker fields
  computed_status?: 'not_started' | 'in_progress' | 'completed';
  total_actual_output?: number;
  assignments?: TaskWorkerAssignment[];
}

export interface EntryProductivity {
  entryId: number;
  plannedOutput: number;
  actualOutput: number;
  actualMinutes: number;
  expectedMinutes: number;
  efficiency: number;
  actualPiecesPerHour: number;
  standardPiecesPerHour: number;
  variance: number;
}

export interface Schedule {
  id: number;
  order_id: number;
  week_start_date: string;
  created_at: string;
  entries: ScheduleEntry[];
  entriesByDate: Record<string, ScheduleEntry[]>;
  quantity?: number;
  due_date?: string;
  product_name?: string;
  order_color?: string | null;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Products
export const getProducts = () => fetchAPI<Product[]>('/api/products');
export const getProduct = (id: number) => fetchAPI<Product>(`/api/products/${id}`);
export const getProductSteps = (id: number) => fetchAPI<ProductStep[]>(`/api/products/${id}/steps`);

// Orders
export const getOrders = () => fetchAPI<Order[]>('/api/orders');
export const getOrder = (id: number) => fetchAPI<Order>(`/api/orders/${id}`);
export const createOrder = (data: { product_id: number; quantity: number; due_date: string }) =>
  fetchAPI<Order>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const updateOrder = (id: number, data: { status?: string }) =>
  fetchAPI<Order>(`/api/orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// Schedules
export const getSchedules = () => fetchAPI<Schedule[]>('/api/schedules');
export const getSchedule = (id: number) => fetchAPI<Schedule>(`/api/schedules/${id}`);
export const generateSchedule = (orderId: number) =>
  fetchAPI<Schedule>('/api/schedules/generate', {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId }),
  });
export const deleteSchedule = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/schedules/${id}`, {
    method: 'DELETE',
  });

// Replan types
export interface DraftScheduleEntry {
  id: string;
  product_step_id: number;
  worker_id: number | null;
  worker_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  step_name: string;
  category: string;
  required_skill_category: 'SEWING' | 'OTHER';
  is_overtime: boolean;
  is_auto_suggested: boolean;
}

export interface ReplanResult {
  scheduleId: number;
  orderId: number;
  productName: string;
  dueDate: string;
  totalOutput: number;
  completedOutput: number;
  remainingOutput: number;
  canMeetDeadline: boolean;
  regularHoursNeeded: number;
  overtimeHoursNeeded: number;
  draftEntries: DraftScheduleEntry[];
  overtimeSuggestions: DraftScheduleEntry[];
  availableWorkers: { id: number; name: string; skill_category: string }[];
}

export interface CommitReplanRequest {
  entries: DraftScheduleEntry[];
  newWorkers?: { name: string; skill_category: 'SEWING' | 'OTHER' }[];
}

// Replan API
export const generateReplan = (scheduleId: number) =>
  fetchAPI<ReplanResult>(`/api/schedules/${scheduleId}/replan`, {
    method: 'POST',
  });

export const commitReplan = (scheduleId: number, data: CommitReplanRequest) =>
  fetchAPI<Schedule>(`/api/schedules/${scheduleId}/replan/commit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Schedule Entries
export const getAllScheduleEntries = () =>
  fetchAPI<ScheduleEntry[]>(`/api/schedule-entries`);

export const getScheduleEntry = (id: number) =>
  fetchAPI<ScheduleEntry>(`/api/schedule-entries/${id}`);

export const updateScheduleEntry = (
  id: number,
  data: {
    start_time?: string;
    end_time?: string;
    date?: string;
    planned_output?: number;
    actual_start_time?: string;
    actual_end_time?: string;
    actual_output?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    notes?: string;
    worker_id?: number;
  }
) =>
  fetchAPI<ScheduleEntry>(`/api/schedule-entries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const startScheduleEntry = (id: number) =>
  fetchAPI<ScheduleEntry>(`/api/schedule-entries/${id}/start`, {
    method: 'POST',
  });

export const completeScheduleEntry = (id: number, data: { actual_output: number; notes?: string }) =>
  fetchAPI<ScheduleEntry>(`/api/schedule-entries/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Task Worker Assignments API
export const getTaskAssignments = (entryId: number) =>
  fetchAPI<TaskWorkerAssignment[]>(`/api/schedule-entries/${entryId}/assignments`);

export const addWorkerToTask = (entryId: number, workerId: number) =>
  fetchAPI<TaskWorkerAssignment[]>(`/api/schedule-entries/${entryId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ worker_id: workerId }),
  });

export const removeWorkerFromTask = (entryId: number, workerId: number) =>
  fetchAPI<{ success: boolean }>(`/api/schedule-entries/${entryId}/assignments/${workerId}`, {
    method: 'DELETE',
  });

export const startAssignment = (assignmentId: number) =>
  fetchAPI<TaskWorkerAssignment>(`/api/assignments/${assignmentId}/start`, {
    method: 'POST',
  });

export const completeAssignment = (assignmentId: number, data: { actual_output: number; notes?: string }) =>
  fetchAPI<TaskWorkerAssignment>(`/api/assignments/${assignmentId}/complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateAssignment = (
  assignmentId: number,
  data: {
    actual_output?: number;
    notes?: string;
    status?: 'not_started' | 'in_progress' | 'completed';
    actual_start_time?: string;
    actual_end_time?: string;
  }
) =>
  fetchAPI<TaskWorkerAssignment>(`/api/assignments/${assignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// Equipment types
export interface Equipment {
  id: number;
  name: string;
  description: string | null;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  created_at: string;
}

// Worker types
export interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: 'active' | 'inactive' | 'on_leave';
  skill_category: 'SEWING' | 'OTHER';
  created_at: string;
  certifications?: EquipmentCertification[];
}

// Equipment certification types
export interface EquipmentCertification {
  id: number;
  worker_id: number;
  equipment_id: number;
  certified_at: string;
  expires_at: string | null;
  equipment_name?: string;
  worker_name?: string;
}

// Equipment API
export const getEquipment = () => fetchAPI<Equipment[]>('/api/equipment');
export const getEquipmentById = (id: number) => fetchAPI<Equipment>(`/api/equipment/${id}`);
export const createEquipment = (data: { name: string; description?: string }) =>
  fetchAPI<Equipment>('/api/equipment', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const updateEquipment = (
  id: number,
  data: { name?: string; description?: string; status?: Equipment['status'] }
) =>
  fetchAPI<Equipment>(`/api/equipment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
export const deleteEquipment = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/equipment/${id}`, {
    method: 'DELETE',
  });
export const getEquipmentCertifiedWorkers = (equipmentId: number) =>
  fetchAPI<Worker[]>(`/api/equipment/${equipmentId}/certified-workers`);

// Workers API
export const getWorkers = () => fetchAPI<Worker[]>('/api/workers');
export const getWorkerById = (id: number) => fetchAPI<Worker>(`/api/workers/${id}`);
export const createWorker = (data: { name: string; employee_id?: string; skill_category?: Worker['skill_category'] }) =>
  fetchAPI<Worker>('/api/workers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const updateWorker = (
  id: number,
  data: { name?: string; employee_id?: string; status?: Worker['status']; skill_category?: Worker['skill_category'] }
) =>
  fetchAPI<Worker>(`/api/workers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
export const deleteWorker = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/workers/${id}`, {
    method: 'DELETE',
  });
export const getWorkerCertifications = (workerId: number) =>
  fetchAPI<EquipmentCertification[]>(`/api/workers/${workerId}/certifications`);

// Certifications API
export const getCertifications = () => fetchAPI<EquipmentCertification[]>('/api/certifications');
export const grantCertification = (data: { worker_id: number; equipment_id: number; expires_at?: string }) =>
  fetchAPI<EquipmentCertification>('/api/certifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const revokeCertification = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/certifications/${id}`, {
    method: 'DELETE',
  });

// Proficiency types
export interface WorkerProficiency {
  id: number;
  worker_id: number;
  product_step_id: number;
  level: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  updated_at: string;
}

export interface ProficiencyStep {
  product_step_id: number;
  step_name: string;
  category: string;
  sequence: number;
  product_id: number;
  product_name: string;
  id: number;
  level: 1 | 2 | 3 | 4 | 5;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkerProficienciesResponse {
  worker_id: number;
  proficiencies: ProficiencyStep[];
  by_product: {
    product_id: number;
    product_name: string;
    steps: ProficiencyStep[];
  }[];
}

// Proficiencies API
export const getWorkerProficiencies = (workerId: number) =>
  fetchAPI<WorkerProficienciesResponse>(`/api/workers/${workerId}/proficiencies`);

export const updateProficiency = (data: {
  worker_id: number;
  product_step_id: number;
  level: 1 | 2 | 3 | 4 | 5;
}) =>
  fetchAPI<WorkerProficiency>('/api/proficiencies', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteProficiency = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/proficiencies/${id}`, {
    method: 'DELETE',
  });

// Analytics types
export interface StepProductivity {
  stepId: number;
  stepName: string;
  category: string;
  totalUnits: number;
  totalMinutes: number;
  averageEfficiency: number;
  entryCount: number;
  currentProficiency: number;
}

export interface ProductivitySummary {
  workerId: number;
  workerName: string;
  totalHoursWorked: number;
  totalUnitsProduced: number;
  averageEfficiency: number;
  stepBreakdown: StepProductivity[];
}

export interface ProductivityDataPoint {
  date: string;
  efficiency: number;
  unitsProduced: number;
}

export interface ProficiencyHistoryEntry {
  id: number;
  worker_id: number;
  product_step_id: number;
  old_level: number;
  new_level: number;
  reason: 'manual' | 'auto_increase' | 'auto_decrease';
  trigger_data: string | null;
  created_at: string;
  step_name?: string;
  product_name?: string;
}

// Analytics API
export const getWorkerProductivity = (workerId: number) =>
  fetchAPI<ProductivitySummary>(`/api/analytics/workers/${workerId}/productivity`);

export const getWorkerProductivityHistory = (workerId: number, days?: number) =>
  fetchAPI<ProductivityDataPoint[]>(
    `/api/analytics/workers/${workerId}/productivity/history${days ? `?days=${days}` : ''}`
  );

export const getWorkerProficiencyHistory = (workerId: number) =>
  fetchAPI<ProficiencyHistoryEntry[]>(`/api/analytics/workers/${workerId}/proficiency-history`);

export const recalculateProficiencies = () =>
  fetchAPI<{ applied: number; adjustments: unknown[] }>('/api/analytics/recalculate-proficiencies', {
    method: 'POST',
  });

// Assignment Analytics Interfaces
export interface AssignmentOutputHistoryEntry {
  id: number;
  output: number;
  recorded_at: string;
}

export interface AssignmentTimeMetrics {
  assignmentId: number;
  totalUpdates: number;
  beginningAvgTimePerPiece: number | null;
  middleAvgTimePerPiece: number | null;
  endAvgTimePerPiece: number | null;
  overallAvgTimePerPiece: number | null;
  speedupPercentage: number | null;
  currentOutput: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface AssignmentAnalytics {
  assignmentId: number;
  scheduleEntryId: number;
  workerId: number;
  workerName: string;
  stepName: string;
  category: string;
  timePerPieceSeconds: number;
  plannedOutput: number;
  currentOutput: number;
  startTime: string | null;
  endTime: string | null;
  status: string;
  outputHistory: AssignmentOutputHistoryEntry[];
  timeMetrics: AssignmentTimeMetrics | null;
}

// Assignment Analytics API
export const getAssignmentOutputHistory = (assignmentId: number) =>
  fetchAPI<AssignmentOutputHistoryEntry[]>(`/api/analytics/assignments/${assignmentId}/output-history`);

export const getAssignmentMetrics = (assignmentId: number) =>
  fetchAPI<AssignmentTimeMetrics>(`/api/analytics/assignments/${assignmentId}/metrics`);

export const getAssignmentAnalytics = (assignmentId: number) =>
  fetchAPI<AssignmentAnalytics>(`/api/analytics/assignments/${assignmentId}`);

export const getWorkerAssignmentAnalytics = (workerId: number) =>
  fetchAPI<AssignmentAnalytics[]>(`/api/analytics/workers/${workerId}/assignments`);

// Scheduling types
export interface DeadlineRisk {
  orderId: number;
  productName: string;
  dueDate: string;
  requiredHours: number;
  availableHours: number;
  canMeet: boolean;
  shortfallHours: number;
}

export interface OvertimeProjection {
  date: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}

export interface CapacityAnalysis {
  totalAvailableHours: number;
  totalRequiredHours: number;
  utilizationPercent: number;
  weeklyBreakdown: {
    weekStart: string;
    availableHours: number;
    requiredHours: number;
  }[];
}

export interface SchedulingScenario {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
  worker_pool: string;
  created_at: string;
  workerPoolParsed?: { workerId: number; available: boolean; hoursPerDay?: number }[];
}

export interface ScenarioResult {
  scenario: SchedulingScenario;
  deadlineRisks: DeadlineRisk[];
  capacityAnalysis: CapacityAnalysis;
}

// Scheduling API
export const getDeadlineRisks = () =>
  fetchAPI<DeadlineRisk[]>('/api/scheduling/deadline-risks');

export const getOvertimeProjections = () =>
  fetchAPI<OvertimeProjection[]>('/api/scheduling/overtime');

export const getCapacityAnalysis = (weeks?: number) =>
  fetchAPI<CapacityAnalysis>(`/api/scheduling/capacity${weeks ? `?weeks=${weeks}` : ''}`);

export const getScenarios = () =>
  fetchAPI<SchedulingScenario[]>('/api/scenarios');

export const getScenario = (id: number) =>
  fetchAPI<SchedulingScenario>(`/api/scenarios/${id}`);

export const createScenario = (data: {
  name: string;
  description?: string;
  workerPool: { workerId: number; available: boolean; hoursPerDay?: number }[];
}) =>
  fetchAPI<SchedulingScenario>('/api/scenarios', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const generateScenarioSchedule = (id: number) =>
  fetchAPI<ScenarioResult>(`/api/scenarios/${id}/generate`, {
    method: 'POST',
  });

export const deleteScenario = (id: number) =>
  fetchAPI<{ success: boolean }>(`/api/scenarios/${id}`, {
    method: 'DELETE',
  });

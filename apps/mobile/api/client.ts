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
  dependencies: number[];
}

export interface Order {
  id: number;
  product_id: number;
  quantity: number;
  due_date: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  created_at: string;
  product_name?: string;
}

export interface ScheduleEntry {
  id: number;
  schedule_id: number;
  product_step_id: number;
  worker_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string | null;
  step_name: string;
  category: string;
  required_skill_category: string;
  time_per_piece_seconds?: number;
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

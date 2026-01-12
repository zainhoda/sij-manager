import { useState, useEffect, useCallback } from 'react';
import { getOrders, getAllScheduleEntries, Order, ScheduleEntry } from '@/api/client';

export type CategoryType = 'CUTTING' | 'SILKSCREEN' | 'PREP' | 'SEWING' | 'INSPECTION';

export interface DailyProgress {
  totalPlanned: number;
  totalCompleted: number;
  entriesCompleted: number;
  totalEntries: number;
}

export interface OrderWithProgress {
  id: number;
  productName: string;
  dueDate: string;
  daysRemaining: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  progressPercent: number;
  quantity: number;
  completedQuantity: number;
}

export interface StationStatus {
  category: CategoryType;
  status: 'active' | 'idle' | 'completed';
  todayStats: {
    entriesCompleted: number;
    totalEntries: number;
    piecesCompleted: number;
    piecesPlanned: number;
  };
}

export interface DashboardMetrics {
  efficiency: number;
  piecesToday: number;
  ordersOnTrack: number;
  totalOrders: number;
}

export interface DashboardData {
  dailyProgress: DailyProgress;
  orders: OrderWithProgress[];
  stations: StationStatus[];
  metrics: DashboardMetrics;
  lastRefresh: Date;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const CATEGORIES: CategoryType[] = ['CUTTING', 'SILKSCREEN', 'PREP', 'SEWING', 'INSPECTION'];

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysRemaining(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateOrderStatus(
  progressPercent: number,
  daysRemaining: number,
  orderStatus: string
): 'on_track' | 'at_risk' | 'behind' | 'completed' {
  if (orderStatus === 'completed') return 'completed';
  if (daysRemaining < 0) return 'behind';

  // Expected progress based on time remaining
  // If 3 days remain out of 10, we should be ~70% done
  const expectedProgress = Math.max(0, 100 - (daysRemaining * 10));

  if (progressPercent >= expectedProgress - 10) return 'on_track';
  if (progressPercent >= expectedProgress - 25) return 'at_risk';
  return 'behind';
}

export function useDashboardData(refreshInterval = 30000): DashboardData {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({
    totalPlanned: 0,
    totalCompleted: 0,
    entriesCompleted: 0,
    totalEntries: 0,
  });
  const [orders, setOrders] = useState<OrderWithProgress[]>([]);
  const [stations, setStations] = useState<StationStatus[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    efficiency: 0,
    piecesToday: 0,
    ordersOnTrack: 0,
    totalOrders: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      const [ordersData, entriesData] = await Promise.all([
        getOrders(),
        getAllScheduleEntries(),
      ]);

      const today = getToday();

      // Filter today's entries
      const todayEntries = entriesData.filter((e) => e.date === today);

      // Calculate daily progress
      const dailyProg: DailyProgress = {
        totalPlanned: todayEntries.reduce((sum, e) => sum + e.planned_output, 0),
        totalCompleted: todayEntries.reduce((sum, e) => sum + e.actual_output, 0),
        entriesCompleted: todayEntries.filter((e) => e.status === 'completed').length,
        totalEntries: todayEntries.length,
      };
      setDailyProgress(dailyProg);

      // Calculate station status
      const stationStats: StationStatus[] = CATEGORIES.map((category) => {
        const categoryEntries = todayEntries.filter(
          (e) => e.category.toUpperCase() === category
        );
        const completed = categoryEntries.filter((e) => e.status === 'completed').length;
        const inProgress = categoryEntries.some((e) => e.status === 'in_progress');
        const piecesCompleted = categoryEntries.reduce((sum, e) => sum + e.actual_output, 0);
        const piecesPlanned = categoryEntries.reduce((sum, e) => sum + e.planned_output, 0);

        let status: 'active' | 'idle' | 'completed' = 'idle';
        if (inProgress) status = 'active';
        else if (completed === categoryEntries.length && categoryEntries.length > 0) status = 'completed';

        return {
          category,
          status,
          todayStats: {
            entriesCompleted: completed,
            totalEntries: categoryEntries.length,
            piecesCompleted,
            piecesPlanned,
          },
        };
      });
      setStations(stationStats);

      // Calculate order progress
      const activeOrders = ordersData
        .filter((o) => o.status !== 'pending')
        .map((order) => {
          // Get all entries for this order's schedule
          const orderEntries = entriesData.filter((e) => {
            // Match by checking if the entry belongs to this order
            // This is a simplification - in reality we'd need to join through schedules
            return true; // For now, calculate overall progress
          });

          const daysRemaining = getDaysRemaining(order.due_date);

          // Calculate completion based on entries for this order
          // For simplicity, using overall progress ratio
          const totalEntries = entriesData.length;
          const completedEntries = entriesData.filter((e) => e.status === 'completed').length;
          const progressPercent = totalEntries > 0
            ? Math.round((completedEntries / totalEntries) * 100)
            : 0;

          return {
            id: order.id,
            productName: order.product_name || 'Unknown Product',
            dueDate: order.due_date,
            daysRemaining,
            status: calculateOrderStatus(progressPercent, daysRemaining, order.status),
            progressPercent,
            quantity: order.quantity,
            completedQuantity: Math.round((progressPercent / 100) * order.quantity),
          };
        })
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 5);
      setOrders(activeOrders);

      // Calculate metrics
      const completedEntries = todayEntries.filter((e) => e.status === 'completed');
      const totalPlannedTime = completedEntries.reduce((sum, e) => {
        const seconds = e.time_per_piece_seconds || 60;
        return sum + (e.planned_output * seconds);
      }, 0);
      const totalActualTime = completedEntries.reduce((sum, e) => {
        const seconds = e.time_per_piece_seconds || 60;
        return sum + (e.actual_output * seconds);
      }, 0);

      const efficiency = totalPlannedTime > 0
        ? Math.round((totalPlannedTime / Math.max(totalActualTime, 1)) * 100)
        : 100;

      const onTrack = activeOrders.filter((o) => o.status === 'on_track' || o.status === 'completed').length;

      setMetrics({
        efficiency: Math.min(efficiency, 150), // Cap at 150%
        piecesToday: dailyProg.totalCompleted,
        ordersOnTrack: onTrack,
        totalOrders: activeOrders.length,
      });

      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return {
    dailyProgress,
    orders,
    stations,
    metrics,
    lastRefresh,
    isLoading,
    error,
    refresh: fetchData,
  };
}

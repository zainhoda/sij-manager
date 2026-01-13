import { useState, useEffect, useCallback } from 'react';
import { getEquipmentById, getAllScheduleEntries, Equipment, ScheduleEntry } from '@/api/client';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function isTimeInRange(currentTime: string, startTime: string, endTime: string): boolean {
  const [currentH, currentM] = currentTime.split(':').map(Number);
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const current = currentH * 60 + currentM;
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  return current >= start && current <= end;
}

export interface EquipmentTabletData {
  equipment: Equipment | null;
  currentTask: ScheduleEntry | null;
  nextTask: ScheduleEntry | null;
  todayProgress: {
    totalPlanned: number;
    totalCompleted: number;
    entriesCompleted: number;
    totalEntries: number;
    percentage: number;
  };
  lastRefresh: Date;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useEquipmentTabletData(
  equipmentId: number | null,
  refreshInterval = 30000
): EquipmentTabletData {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [currentTask, setCurrentTask] = useState<ScheduleEntry | null>(null);
  const [nextTask, setNextTask] = useState<ScheduleEntry | null>(null);
  const [todayProgress, setTodayProgress] = useState({
    totalPlanned: 0,
    totalCompleted: 0,
    entriesCompleted: 0,
    totalEntries: 0,
    percentage: 0,
  });

  const fetchData = useCallback(async () => {
    if (!equipmentId) {
      setIsLoading(false);
      return;
    }

    try {
      const [equipmentData, entriesData] = await Promise.all([
        getEquipmentById(equipmentId),
        getAllScheduleEntries(),
      ]);

      setEquipment(equipmentData);

      // Filter entries for this equipment
      const equipmentEntries = entriesData.filter(
        (e) => e.equipment_id === equipmentId
      );

      const today = getToday();
      const currentTime = getCurrentTime();

      // Filter today's entries
      const todayEntries = equipmentEntries.filter((e) => e.date === today);

      // Find current task (prioritize in_progress tasks within time range, then any in_progress)
      const inProgressTasks = todayEntries.filter(
        (e) => e.computed_status === 'in_progress' || e.status === 'in_progress'
      );
      
      // First try to find one within time range
      const currentInRange = inProgressTasks.find((e) =>
        isTimeInRange(currentTime, e.start_time, e.end_time)
      );
      
      // If none in range, use the first in_progress task (might be running late/early)
      const current = currentInRange || inProgressTasks[0] || null;
      setCurrentTask(current);

      // Find next task (not started, today or future, sorted by date and time)
      const futureEntries = equipmentEntries
        .filter(
          (e) =>
            e.date >= today &&
            e.id !== current?.id &&
            (e.computed_status === 'not_started' || e.status === 'not_started')
        )
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.start_time.localeCompare(b.start_time);
        });
      setNextTask(futureEntries[0] || null);

      // Calculate today's progress
      const totalPlanned = todayEntries.reduce(
        (sum, e) => sum + e.planned_output,
        0
      );
      const totalCompleted = todayEntries.reduce(
        (sum, e) => sum + (e.total_actual_output || e.actual_output || 0),
        0
      );
      const entriesCompleted = todayEntries.filter(
        (e) => e.computed_status === 'completed' || e.status === 'completed'
      ).length;
      const percentage =
        totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

      setTodayProgress({
        totalPlanned,
        totalCompleted,
        entriesCompleted,
        totalEntries: todayEntries.length,
        percentage,
      });

      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  }, [equipmentId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return {
    equipment,
    currentTask,
    nextTask,
    todayProgress,
    lastRefresh,
    isLoading,
    error,
    refresh: fetchData,
  };
}

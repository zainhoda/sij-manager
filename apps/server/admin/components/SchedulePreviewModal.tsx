import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock,
  DollarSign,
  Users,
  Calendar,
  AlertTriangle,
  Edit3,
  X,
  Sun,
  List,
  GitBranch,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  useNodesState,
} from "@xyflow/react";
import type { Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// Work day ends at 15:30 - anything after is overtime
const REGULAR_DAY_END = "15:30";

const isOvertimeTask = (startTime: string, endTime: string): boolean => {
  return startTime >= REGULAR_DAY_END || endTime > REGULAR_DAY_END;
};

// Step color palette for timeline view
const STEP_COLOR_PALETTE = [
  "#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ec4899",
  "#06b6d4", "#eab308", "#ef4444", "#84cc16", "#14b8a6",
];

function getStepColor(stepName: string): string {
  let hash = 0;
  for (let i = 0; i < stepName.length; i++) {
    hash = stepName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return STEP_COLOR_PALETTE[Math.abs(hash) % STEP_COLOR_PALETTE.length]!;
}

function buildStepColorMap(tasks: ScheduleTask[]): Map<string, string> {
  const colorMap = new Map<string, string>();
  const uniqueSteps = [...new Set(tasks.map(t => t.stepName))];
  for (const stepName of uniqueSteps) {
    colorMap.set(stepName, getStepColor(stepName));
  }
  return colorMap;
}

// Timeline configuration
const TIMELINE_CONFIG = {
  startHour: 6,
  endHour: 18,
  pixelsPerHour: 100,
  swimlaneHeight: 60,
  headerHeight: 40,
  leftPadding: 140,
};

// Timeline types
interface TimelineNodeData extends Record<string, unknown> {
  task: ScheduleTask;
  demand: { bomNum: string; customerName: string | null } | undefined;
  workerNames: string[];
  stepColor: string;
  isOvertime: boolean;
  durationMinutes: number;
}

interface Swimlane {
  workerId: number;
  y: number;
  name: string;
}

interface ScheduleTask {
  demandEntryId: number;
  batchNumber: number;
  batchQuantity: number;
  bomStepId: number;
  stepName: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  workerIds: number[];
  assignmentReason: string;
  constraints: { type: string; description: string }[];
}

interface ScheduleWithContext {
  scenario: {
    id: number;
    name: string;
    strategy: string;
    total_labor_hours: number | null;
    total_overtime_hours: number | null;
    total_labor_cost: number | null;
    total_equipment_cost: number | null;
    deadlines_met: number | null;
    deadlines_missed: number | null;
    parent_scenario_id: number | null;
  };
  schedule: ScheduleTask[];
  workers: { id: number; name: string; status: string; workCategoryId: number | null }[];
  demandEntries: { id: number; bomNum: string; customerName: string | null; quantity: number; dueDate: string }[];
  bomSteps: { id: number; name: string; equipmentId: number | null; workCategoryId: number | null }[];
  certifications: { workerId: number; equipmentId: number }[];
}

interface SchedulePreviewModalProps {
  isOpen: boolean;
  scenarioId: number;
  scenarioName: string;
  isAccepted: boolean;
  onClose: () => void;
  onEdit: () => void;
}

// Custom node component for timeline tasks
function TimelineTaskNode({ data }: { data: TimelineNodeData }) {
  const { task, demand, stepColor, isOvertime, durationMinutes } = data;
  const width = Math.max(80, durationMinutes * (TIMELINE_CONFIG.pixelsPerHour / 60));

  return (
    <div
      style={{
        width,
        height: 44,
        padding: "6px 10px",
        borderRadius: 6,
        background: stepColor,
        color: "white",
        fontSize: 11,
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
        border: isOvertime ? "2px solid #f59e0b" : "none",
        cursor: "default",
      }}
    >
      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {task.stepName}
      </div>
      <div style={{ opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {demand?.bomNum || "-"} - {task.plannedOutput} pcs
      </div>
    </div>
  );
}

const nodeTypes = { timelineTask: TimelineTaskNode };

// Calculate timeline layout positions
function calculateTimelineLayout(
  tasks: ScheduleTask[],
  workers: { id: number; name: string }[],
  demandLookup: Map<number, { bomNum: string; customerName: string | null }>,
  stepColorMap: Map<string, string>
): { nodes: Node<TimelineNodeData>[]; swimlanes: Swimlane[] } {
  const { startHour, pixelsPerHour, swimlaneHeight } = TIMELINE_CONFIG;

  // Get unique worker IDs from tasks
  const assignedWorkerIds = new Set<number>();
  for (const task of tasks) {
    for (const wid of task.workerIds) {
      assignedWorkerIds.add(wid);
    }
    if (task.workerIds.length === 0) {
      assignedWorkerIds.add(0); // Unassigned lane
    }
  }

  // Build swimlane positions
  const workerYPositions = new Map<number, number>();
  const swimlanes: Swimlane[] = [];
  let y = 0;

  // Add unassigned lane if needed
  if (assignedWorkerIds.has(0)) {
    workerYPositions.set(0, y);
    swimlanes.push({ workerId: 0, y, name: "Unassigned" });
    y += swimlaneHeight;
  }

  // Add lanes for each assigned worker
  for (const worker of workers) {
    if (assignedWorkerIds.has(worker.id)) {
      workerYPositions.set(worker.id, y);
      swimlanes.push({ workerId: worker.id, y, name: worker.name });
      y += swimlaneHeight;
    }
  }

  // Convert time string to X position
  const timeToX = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    const hoursFromStart = hours! - startHour + minutes! / 60;
    return hoursFromStart * pixelsPerHour;
  };

  // Create nodes
  const nodes: Node<TimelineNodeData>[] = tasks.map((task, index) => {
    const workerId = task.workerIds[0] || 0;
    const yPos = workerYPositions.get(workerId) ?? 0;
    const xPos = timeToX(task.startTime);

    // Calculate duration
    const [startH, startM] = task.startTime.split(":").map(Number);
    const [endH, endM] = task.endTime.split(":").map(Number);
    const durationMinutes = (endH! * 60 + endM!) - (startH! * 60 + startM!);

    const demand = demandLookup.get(task.demandEntryId);
    const workerNames = task.workerIds.map(id => {
      const w = workers.find(w => w.id === id);
      return w?.name || `Worker ${id}`;
    });

    return {
      id: `task-${index}`,
      type: "timelineTask",
      position: { x: xPos, y: yPos + 8 },
      data: {
        task,
        demand,
        workerNames,
        stepColor: stepColorMap.get(task.stepName) || "#64748b",
        isOvertime: isOvertimeTask(task.startTime, task.endTime),
        durationMinutes,
      },
      draggable: false,
    };
  });

  return { nodes, swimlanes };
}

// Timeline View Component
function ScheduleTimelineView({
  data,
  demandLookup,
  stepColorMap,
}: {
  data: ScheduleWithContext;
  demandLookup: Map<number, { bomNum: string; customerName: string | null }>;
  stepColorMap: Map<string, string>;
}) {
  const sortedDates = useMemo(() => {
    return [...new Set(data.schedule.map(t => t.date))].sort();
  }, [data.schedule]);

  const [selectedDate, setSelectedDate] = useState(sortedDates[0] || "");

  // Update selected date when dates change
  useEffect(() => {
    if (sortedDates.length > 0 && !sortedDates.includes(selectedDate)) {
      setSelectedDate(sortedDates[0]!);
    }
  }, [sortedDates, selectedDate]);

  // Filter tasks by selected date
  const filteredTasks = useMemo(() => {
    return data.schedule.filter(t => t.date === selectedDate);
  }, [data.schedule, selectedDate]);

  // Calculate layout
  const { nodes, swimlanes } = useMemo(() => {
    return calculateTimelineLayout(filteredTasks, data.workers, demandLookup, stepColorMap);
  }, [filteredTasks, data.workers, demandLookup, stepColorMap]);

  const [flowNodes] = useNodesState(nodes);

  const { startHour, endHour, pixelsPerHour, swimlaneHeight, leftPadding } = TIMELINE_CONFIG;
  const totalWidth = (endHour - startHour) * pixelsPerHour;
  const totalHeight = Math.max(swimlanes.length * swimlaneHeight, 120);

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  if (data.schedule.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "#64748b" }}>
        No tasks in this schedule
      </div>
    );
  }

  return (
    <div>
      {/* Date selector */}
      {sortedDates.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {sortedDates.map(date => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: selectedDate === date ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                background: selectedDate === date ? "#eff6ff" : "white",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {formatDateLabel(date)}
            </button>
          ))}
        </div>
      )}

      {/* Timeline container */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", display: "flex" }}>
        {/* Fixed left column - worker labels */}
        <div style={{ flexShrink: 0, background: "#f8fafc", borderRight: "1px solid #e2e8f0" }}>
          {/* Empty header cell */}
          <div style={{ width: leftPadding, height: 37, borderBottom: "1px solid #e2e8f0" }} />
          {/* Swimlane labels */}
          {swimlanes.map(sl => (
            <div
              key={sl.workerId}
              style={{
                width: leftPadding,
                height: swimlaneHeight,
                padding: "0 12px",
                display: "flex",
                alignItems: "center",
                fontSize: 12,
                fontWeight: 500,
                borderBottom: "1px solid #e2e8f0",
                color: sl.workerId === 0 ? "#94a3b8" : "#0f172a",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {sl.name}
            </div>
          ))}
        </div>

        {/* Scrollable right section - time axis and tasks */}
        <div style={{ flex: 1, overflowX: "auto" }}>
          {/* Time axis header */}
          <div style={{ display: "flex", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {Array.from({ length: endHour - startHour }, (_, i) => {
              const hour = startHour + i;
              return (
                <div
                  key={hour}
                  style={{
                    width: pixelsPerHour,
                    minWidth: pixelsPerHour,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#64748b",
                    padding: "10px 0",
                    borderRight: "1px solid #e2e8f0",
                  }}
                >
                  {hour > 12 ? `${hour - 12}PM` : hour === 12 ? "12PM" : `${hour}AM`}
                </div>
              );
            })}
          </div>

          {/* React Flow container */}
          <div style={{ width: totalWidth, height: totalHeight }}>
            <ReactFlow
              nodes={flowNodes}
              edges={[]}
              nodeTypes={nodeTypes}
              fitView={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              minZoom={1}
              maxZoom={1}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#e2e8f0" gap={pixelsPerHour} />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* Color legend */}
      <div
        style={{
          marginTop: 12,
          padding: "8px 12px",
          background: "#f8fafc",
          borderRadius: 6,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {[...stepColorMap.entries()].map(([stepName, color]) => (
          <div key={stepName} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
            <span style={{ fontSize: 11, color: "#64748b" }}>{stepName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SchedulePreviewModal({
  isOpen,
  scenarioId,
  scenarioName,
  isAccepted,
  onClose,
  onEdit,
}: SchedulePreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScheduleWithContext | null>(null);
  const [activeTab, setActiveTab] = useState<"table" | "timeline">("table");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRowExpanded = (rowKey: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/planning/scenarios/${scenarioId}/schedule`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch schedule");
      }
      const scheduleData = await response.json();
      setData(scheduleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schedule");
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    if (isOpen && scenarioId) {
      fetchSchedule();
    }
  }, [isOpen, scenarioId, fetchSchedule]);

  if (!isOpen) return null;

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours!);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Build worker name lookup
  const workerNames = new Map<number, string>();
  if (data) {
    for (const worker of data.workers) {
      workerNames.set(worker.id, worker.name);
    }
  }

  // Build demand entry lookup
  const demandLookup = new Map<number, { bomNum: string; customerName: string | null }>();
  if (data) {
    for (const entry of data.demandEntries) {
      demandLookup.set(entry.id, { bomNum: entry.bomNum, customerName: entry.customerName });
    }
  }

  // Build step color map for timeline view
  const stepColorMap = useMemo(() => {
    return data ? buildStepColorMap(data.schedule) : new Map<string, string>();
  }, [data]);

  // Group tasks by date
  const tasksByDate = new Map<string, ScheduleTask[]>();
  if (data) {
    for (const task of data.schedule) {
      if (!tasksByDate.has(task.date)) {
        tasksByDate.set(task.date, []);
      }
      tasksByDate.get(task.date)!.push(task);
    }
    // Sort tasks within each date by start time
    for (const tasks of tasksByDate.values()) {
      tasks.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
  }

  const sortedDates = [...tasksByDate.keys()].sort();

  const totalCost = data
    ? (data.scenario.total_labor_cost || 0) + (data.scenario.total_equipment_cost || 0)
    : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 1000, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Schedule Preview</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{scenarioName}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "#f1f5f9",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <p style={{ color: "#64748b" }}>Loading schedule...</p>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Summary Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Clock size={14} style={{ color: "#64748b" }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>Labor Hours</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {data.scenario.total_labor_hours?.toFixed(1) || "0"}h
                  </div>
                  {(data.scenario.total_overtime_hours || 0) > 0 && (
                    <div style={{ fontSize: 11, color: "#f59e0b" }}>
                      +{data.scenario.total_overtime_hours?.toFixed(1)}h OT
                    </div>
                  )}
                </div>

                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <DollarSign size={14} style={{ color: "#64748b" }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>Total Cost</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(totalCost)}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Labor: {formatCurrency(data.scenario.total_labor_cost)}
                  </div>
                </div>

                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Calendar size={14} style={{ color: "#64748b" }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>Deadlines</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: data.scenario.deadlines_missed ? "#ef4444" : "#22c55e" }}>
                    {data.scenario.deadlines_met || 0}/{(data.scenario.deadlines_met || 0) + (data.scenario.deadlines_missed || 0)}
                  </div>
                  <div style={{ fontSize: 11, color: data.scenario.deadlines_missed ? "#ef4444" : "#22c55e" }}>
                    {data.scenario.deadlines_missed ? `${data.scenario.deadlines_missed} missed` : "All on time"}
                  </div>
                </div>

                <div style={{ padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <Users size={14} style={{ color: "#64748b" }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>Tasks</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{data.schedule.length}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    across {sortedDates.length} days
                  </div>
                </div>
              </div>

              {/* Tab Buttons */}
              <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 4, borderRadius: 8, marginBottom: 16, width: "fit-content" }}>
                <button
                  onClick={() => setActiveTab("table")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: activeTab === "table" ? "white" : "transparent",
                    color: activeTab === "table" ? "#0f172a" : "#64748b",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: activeTab === "table" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <List size={14} />
                  Table
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: activeTab === "timeline" ? "white" : "transparent",
                    color: activeTab === "timeline" ? "#0f172a" : "#64748b",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: activeTab === "timeline" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  <GitBranch size={14} />
                  Timeline
                </button>
              </div>

              {/* Table View */}
              {activeTab === "table" && (
                <>
                  {data.schedule.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 48, color: "#64748b" }}>
                      No tasks in this schedule
                    </div>
                  ) : (
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Time</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Step</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>BOM</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Worker(s)</th>
                        <th style={{ padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Qty</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDates.map((date) => (
                        <React.Fragment key={date}>
                          {/* Date Header Row */}
                          <tr style={{ background: "#f1f5f9" }}>
                            <td colSpan={6} style={{ padding: "8px 12px", fontWeight: 600, color: "#475569" }}>
                              {formatDate(date)}
                            </td>
                          </tr>
                          {/* Tasks for this date */}
                          {tasksByDate.get(date)!.map((task, idx) => {
                            const demand = demandLookup.get(task.demandEntryId);
                            const workers = task.workerIds.map(id => workerNames.get(id) || `Worker ${id}`);
                            const isOvertime = isOvertimeTask(task.startTime, task.endTime);
                            const rowKey = `${date}-${idx}`;
                            const isExpanded = expandedRows.has(rowKey);
                            const hasNotes = task.assignmentReason || (task.constraints && task.constraints.length > 0);
                            return (
                              <React.Fragment key={rowKey}>
                                <tr
                                  onClick={() => hasNotes && toggleRowExpanded(rowKey)}
                                  style={{
                                    borderBottom: isExpanded ? "none" : "1px solid #e2e8f0",
                                    background: isOvertime ? "#fffbeb" : "white",
                                    cursor: hasNotes ? "pointer" : "default",
                                  }}
                                >
                                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      {hasNotes ? (
                                        isExpanded ? (
                                          <ChevronDown size={14} style={{ color: "#64748b", flexShrink: 0 }} />
                                        ) : (
                                          <ChevronRight size={14} style={{ color: "#64748b", flexShrink: 0 }} />
                                        )
                                      ) : (
                                        <span style={{ width: 14 }} />
                                      )}
                                      <span>{formatTime(task.startTime)} - {formatTime(task.endTime)}</span>
                                      {isOvertime && (
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 3,
                                            padding: "2px 6px",
                                            background: "#fef3c7",
                                            color: "#b45309",
                                            borderRadius: 4,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            fontFamily: "inherit",
                                          }}
                                          title="Overtime: after 3:30 PM"
                                        >
                                          <Sun size={10} />
                                          OT
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{task.stepName}</td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ fontFamily: "monospace", fontSize: 12 }}>{demand?.bomNum || "-"}</div>
                                    {demand?.customerName && (
                                      <div style={{ fontSize: 11, color: "#64748b" }}>{demand.customerName}</div>
                                    )}
                                  </td>
                                  <td style={{ padding: "10px 12px" }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {workers.length > 0 ? (
                                        workers.map((name, i) => (
                                          <span
                                            key={i}
                                            style={{
                                              display: "inline-block",
                                              padding: "2px 8px",
                                              background: "#e0f2fe",
                                              color: "#0369a1",
                                              borderRadius: 4,
                                              fontSize: 11,
                                            }}
                                          >
                                            {name}
                                          </span>
                                        ))
                                      ) : (
                                        <span style={{ color: "#94a3b8", fontSize: 12 }}>Unassigned</span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 500 }}>
                                    {task.plannedOutput}
                                  </td>
                                  <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 12 }}>
                                    #{task.batchNumber} ({task.batchQuantity})
                                  </td>
                                </tr>
                                {/* Expanded Notes Row */}
                                {isExpanded && hasNotes && (
                                  <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                                    <td colSpan={6} style={{ padding: "12px 12px 12px 42px" }}>
                                      {task.assignmentReason && (
                                        <div style={{ marginBottom: task.constraints?.length ? 10 : 0 }}>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                                            Assignment Reason
                                          </div>
                                          <div style={{ fontSize: 12, color: "#334155" }}>
                                            {task.assignmentReason}
                                          </div>
                                        </div>
                                      )}
                                      {task.constraints && task.constraints.length > 0 && (
                                        <div>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
                                            Constraints
                                          </div>
                                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {task.constraints.map((c, i) => (
                                              <span
                                                key={i}
                                                style={{
                                                  display: "inline-block",
                                                  padding: "4px 8px",
                                                  background: "#e2e8f0",
                                                  color: "#475569",
                                                  borderRadius: 4,
                                                  fontSize: 11,
                                                }}
                                                title={c.type}
                                              >
                                                {c.description}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* Timeline View */}
              {activeTab === "timeline" && (
                <ScheduleTimelineView
                  data={data}
                  demandLookup={demandLookup}
                  stepColorMap={stepColorMap}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 24px", borderTop: "1px solid #e2e8f0" }}>
          <div>
            {data?.scenario.parent_scenario_id && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Forked from another scenario
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            {!isAccepted && (
              <button className="btn btn-primary" onClick={onEdit} disabled={loading || !!error}>
                <Edit3 size={14} style={{ marginRight: 6 }} />
                Edit Schedule
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

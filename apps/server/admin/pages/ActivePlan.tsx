import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  RefreshCw,
  Calendar,
  Clock,
  CheckCircle,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  User,
  AlertCircle,
} from "lucide-react";

interface PlanTask {
  id: number;
  planning_run_id: number;
  demand_entry_id: number;
  bom_step_id: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  status: "not_started" | "in_progress" | "completed" | "blocked" | "cancelled";
  actual_start_time: string | null;
  actual_end_time: string | null;
  actual_output: number;
  step_name: string;
  fishbowl_bom_num: string;
  demand_quantity: number;
  customer_name: string | null;
  color: string | null;
  assignments: {
    id: number;
    worker_id: number;
    worker_name: string;
    status: string;
    actual_output: number;
  }[];
}

interface PlanningRun {
  id: number;
  name: string;
  status: string;
  planning_start_date: string;
  planning_end_date: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  not_started: { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0" },
  in_progress: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  completed: { bg: "#d1fae5", text: "#065f46", border: "#34d399" },
  blocked: { bg: "#fee2e2", text: "#991b1b", border: "#f87171" },
  cancelled: { bg: "#e5e7eb", text: "#374151", border: "#9ca3af" },
};

export default function ActivePlan() {
  const [run, setRun] = useState<PlanningRun | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split("T")[0]!);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  const fetchActivePlan = useCallback(async () => {
    setLoading(true);
    try {
      const runResponse = await fetch("/api/planning/runs/active");
      const runData = await runResponse.json();

      if (!runData.run) {
        setRun(null);
        setTasks([]);
        return;
      }

      setRun(runData.run);

      // Fetch tasks for the selected date
      const tasksResponse = await fetch(`/api/tasks?run_id=${runData.run.id}&date=${currentDate}`);
      const tasksData = await tasksResponse.json();
      setTasks(tasksData.tasks || []);
    } catch (error) {
      console.error("Failed to fetch active plan:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchActivePlan();
  }, [fetchActivePlan]);

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

  const navigateDate = (delta: number) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + delta);
    setCurrentDate(date.toISOString().split("T")[0]!);
  };

  const handleStartTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/start`, {
        method: "POST",
      });
      if (response.ok) {
        fetchActivePlan();
      }
    } catch (error) {
      console.error("Failed to start task:", error);
    }
  };

  const handleCompleteTask = async (taskId: number, output: number) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_output: output }),
      });
      if (response.ok) {
        fetchActivePlan();
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const getTimeSlotPosition = (startTime: string, endTime: string) => {
    const dayStart = 7 * 60; // 7:00 AM
    const dayEnd = 16 * 60; // 4:00 PM
    const totalMinutes = dayEnd - dayStart;

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH! * 60 + startM! - dayStart;
    const endMinutes = endH! * 60 + endM! - dayStart;

    const top = (startMinutes / totalMinutes) * 100;
    const height = ((endMinutes - startMinutes) / totalMinutes) * 100;

    return { top: `${Math.max(0, top)}%`, height: `${Math.min(height, 100 - top)}%` };
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Active Plan</h1>
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Loading active plan...</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="page">
        <h1>Active Plan</h1>
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Calendar size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No active plan</p>
          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
            Accept a scenario from a planning run to activate it
          </p>
          <Link href="/planning/runs">
            <button className="btn btn-primary">Go to Planning Runs</button>
          </Link>
        </div>
      </div>
    );
  }

  // Group tasks by worker
  const tasksByWorker = new Map<string, PlanTask[]>();
  for (const task of tasks) {
    if (task.assignments.length === 0) {
      const key = "Unassigned";
      if (!tasksByWorker.has(key)) tasksByWorker.set(key, []);
      tasksByWorker.get(key)!.push(task);
    } else {
      for (const assignment of task.assignments) {
        const key = assignment.worker_name;
        if (!tasksByWorker.has(key)) tasksByWorker.set(key, []);
        tasksByWorker.get(key)!.push(task);
      }
    }
  }

  const workers = Array.from(tasksByWorker.keys()).sort();

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{run.name}</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            {formatDate(run.planning_start_date)} - {formatDate(run.planning_end_date)}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchActivePlan}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Date navigation */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button className="btn btn-secondary" onClick={() => navigateDate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{formatDate(currentDate)}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {currentDate === new Date().toISOString().split("T")[0] ? "Today" : ""}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => navigateDate(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{tasks.length}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Total Tasks</div>
        </div>
        <div className="card" style={{ padding: 12, textAlign: "center", background: "#f1f5f9" }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {tasks.filter((t) => t.status === "not_started").length}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Not Started</div>
        </div>
        <div className="card" style={{ padding: 12, textAlign: "center", background: "#fef3c7" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#92400e" }}>
            {tasks.filter((t) => t.status === "in_progress").length}
          </div>
          <div style={{ fontSize: 12, color: "#92400e" }}>In Progress</div>
        </div>
        <div className="card" style={{ padding: 12, textAlign: "center", background: "#d1fae5" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#065f46" }}>
            {tasks.filter((t) => t.status === "completed").length}
          </div>
          <div style={{ fontSize: 12, color: "#065f46" }}>Completed</div>
        </div>
      </div>

      {/* Tasks Grid */}
      {tasks.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Calendar size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No tasks scheduled for this day</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Time</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Step</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>BOM</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 13 }}>Qty</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Workers</th>
                <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 13 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((task) => (
                  <tr key={task.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>
                      <div style={{ fontFamily: "monospace" }}>
                        {formatTime(task.start_time)} - {formatTime(task.end_time)}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14 }}>
                      <div style={{ fontWeight: 500 }}>{task.step_name}</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 12 }}>{task.fishbowl_bom_num}</div>
                      {task.customer_name && (
                        <div style={{ fontSize: 11, color: "#64748b" }}>{task.customer_name}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, textAlign: "right" }}>
                      <div style={{ fontWeight: 500 }}>
                        {task.status === "completed" ? task.actual_output : task.planned_output}
                      </div>
                      {task.status === "completed" && task.actual_output !== task.planned_output && (
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          planned: {task.planned_output}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {task.assignments.map((a) => (
                          <span
                            key={a.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              background: "#f1f5f9",
                              borderRadius: 4,
                              fontSize: 12,
                            }}
                          >
                            <User size={10} />
                            {a.worker_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: STATUS_COLORS[task.status]?.bg || "#e5e7eb",
                          color: STATUS_COLORS[task.status]?.text || "#374151",
                          border: `1px solid ${STATUS_COLORS[task.status]?.border || "#e2e8f0"}`,
                        }}
                      >
                        {task.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {task.status === "not_started" && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: "4px 12px", fontSize: 12 }}
                          onClick={() => handleStartTask(task.id)}
                        >
                          <Play size={12} style={{ marginRight: 4 }} />
                          Start
                        </button>
                      )}
                      {task.status === "in_progress" && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: "4px 12px", fontSize: 12 }}
                          onClick={() => {
                            const output = prompt("Enter actual output:", String(task.planned_output));
                            if (output) handleCompleteTask(task.id, parseInt(output));
                          }}
                        >
                          <CheckCircle size={12} style={{ marginRight: 4 }} />
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

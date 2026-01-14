import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import type { Column } from "../components/DataGrid";
import DataGrid from "../components/DataGrid";
import ReplanModal from "../components/ReplanModal";

interface Assignment {
  id: number;
  worker_id: number;
  worker_name: string;
  status: string;
  actual_output: number;
}

interface ScheduleEntry {
  id: number;
  schedule_id: number;
  product_step_id: number;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  step_name: string;
  category: string;
  required_skill_category: string;
  equipment_name: string | null;
  computed_status: "not_started" | "in_progress" | "completed";
  total_actual_output: number;
  assignments: Assignment[];
  worker_name: string | null;
}

interface ScheduleDetail {
  id: number;
  order_id: number;
  week_start_date: string;
  created_at: string;
  order_color: string | null;
  entries: ScheduleEntry[];
  entriesByDate: Record<string, ScheduleEntry[]>;
}

interface OrderInfo {
  id: number;
  product_name: string;
  quantity: number;
  due_date: string;
  status: string;
}

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const scheduleId = parseInt(params.id || "0");

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showReplanModal, setShowReplanModal] = useState(false);

  const fetchSchedule = useCallback(async () => {
    if (!scheduleId) return;

    try {
      const response = await fetch(`/api/schedules/${scheduleId}`);
      if (!response.ok) {
        throw new Error("Schedule not found");
      }
      const data = await response.json() as ScheduleDetail;
      setSchedule(data);

      // Fetch order info
      const orderResponse = await fetch(`/api/orders/${data.order_id}`);
      if (orderResponse.ok) {
        const orderData = await orderResponse.json() as OrderInfo;
        setOrderInfo(orderData);
      }
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this schedule? The order will be reset to pending.")) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete schedule");
      }

      setLocation("/schedules");
    } catch (error) {
      console.error("Failed to delete schedule:", error);
      alert("Failed to delete schedule");
    } finally {
      setDeleting(false);
    }
  };

  const getProgressStats = () => {
    if (!schedule) return { completed: 0, inProgress: 0, notStarted: 0, total: 0, percentComplete: 0 };
    const entries = schedule.entries;
    const completed = entries.filter((e) => e.computed_status === "completed").length;
    const inProgress = entries.filter((e) => e.computed_status === "in_progress").length;
    const notStarted = entries.filter((e) => e.computed_status === "not_started").length;
    return {
      completed,
      inProgress,
      notStarted,
      total: entries.length,
      percentComplete: entries.length > 0 ? Math.round((completed / entries.length) * 100) : 0,
    };
  };

  const getOutputStats = () => {
    if (!schedule || !orderInfo) return { planned: 0, actual: 0, remaining: 0 };
    const actual = schedule.entries.reduce((sum, e) => sum + e.total_actual_output, 0);
    return {
      planned: orderInfo.quantity,
      actual,
      remaining: Math.max(0, orderInfo.quantity - actual),
    };
  };

  const columns: Column<ScheduleEntry>[] = [
    {
      key: "date",
      header: "Date",
      width: 100,
      editable: false,
      render: (value) => new Date(String(value)).toLocaleDateString(),
    },
    {
      key: "start_time",
      header: "Time",
      width: 110,
      editable: false,
      render: (value, row) => `${value} - ${row.end_time}`,
    },
    {
      key: "step_name",
      header: "Step",
      width: 180,
      editable: false,
    },
    {
      key: "category",
      header: "Category",
      width: 100,
      editable: false,
    },
    {
      key: "worker_name",
      header: "Worker(s)",
      width: 150,
      editable: false,
      render: (value, row) => {
        if (row.assignments.length > 0) {
          return row.assignments.map((a) => a.worker_name).join(", ");
        }
        return <span style={{ color: "#94a3b8" }}>Unassigned</span>;
      },
    },
    {
      key: "planned_output",
      header: "Planned",
      width: 80,
      editable: false,
    },
    {
      key: "total_actual_output",
      header: "Actual",
      width: 80,
      editable: false,
    },
    {
      key: "computed_status",
      header: "Status",
      width: 110,
      editable: false,
      render: (value) => (
        <span className={`status-badge ${value}`}>
          {String(value).replace("_", " ")}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="page">
        <h1>Schedule Details</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="page">
        <h1>Schedule Not Found</h1>
        <p>The schedule you're looking for doesn't exist.</p>
        <Link href="/schedules" className="btn btn-primary" style={{ marginTop: 16 }}>
          Back to Schedules
        </Link>
      </div>
    );
  }

  const progress = getProgressStats();
  const output = getOutputStats();
  const isOverdue = orderInfo && new Date(orderInfo.due_date) < new Date();

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Link href="/schedules" style={{ color: "#64748b", textDecoration: "none" }}>
              Schedules
            </Link>
            <span style={{ color: "#94a3b8" }}>/</span>
            <h1 style={{ margin: 0 }}>Schedule #{schedule.id}</h1>
          </div>
          {orderInfo && (
            <div style={{ color: "#64748b", fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>{orderInfo.product_name}</span>
              <span style={{ margin: "0 8px" }}>|</span>
              Order #{orderInfo.id}
              <span style={{ margin: "0 8px" }}>|</span>
              Qty: {orderInfo.quantity}
              <span style={{ margin: "0 8px" }}>|</span>
              <span style={{ color: isOverdue ? "#dc2626" : "inherit" }}>
                Due: {new Date(orderInfo.due_date).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => setShowReplanModal(true)}
          >
            Replan
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDelete}
            disabled={deleting}
            style={{ color: "#dc2626" }}
          >
            {deleting ? "Deleting..." : "Delete Schedule"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Progress</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{progress.percentComplete}%</div>
            <div
              style={{
                flex: 1,
                height: 8,
                backgroundColor: "#e2e8f0",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress.percentComplete}%`,
                  height: "100%",
                  backgroundColor: progress.percentComplete === 100 ? "#22c55e" : "#3b82f6",
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            {progress.completed} completed, {progress.inProgress} in progress, {progress.notStarted} pending
          </div>
        </div>

        <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Output</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>
            {output.actual} / {output.planned}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            {output.remaining} remaining
          </div>
        </div>

        <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Entries</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{schedule.entries.length}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            across {Object.keys(schedule.entriesByDate).length} days
          </div>
        </div>
      </div>

      {/* Entries Table */}
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Schedule Entries</h2>
      {schedule.entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          <p>No entries in this schedule.</p>
        </div>
      ) : (
        <DataGrid
          data={schedule.entries}
          columns={columns}
          searchPlaceholder="Search entries..."
          height="calc(100vh - 450px)"
        />
      )}

      {/* Replan Modal */}
      <ReplanModal
        isOpen={showReplanModal}
        scheduleId={scheduleId}
        onClose={() => setShowReplanModal(false)}
        onSuccess={() => {
          setShowReplanModal(false);
          fetchSchedule();
        }}
      />
    </div>
  );
}

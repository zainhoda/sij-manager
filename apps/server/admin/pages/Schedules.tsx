import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import type { Column } from "../components/DataGrid";
import DataGrid from "../components/DataGrid";

interface ScheduleListItem {
  id: number;
  order_id: number;
  week_start_date: string;
  created_at: string;
  product_name: string;
  quantity: number;
  due_date: string;
  order_color: string | null;
  entries: Array<{
    id: number;
    status: string;
  }>;
}

export default function Schedules() {
  const [schedules, setSchedules] = useState<ScheduleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const response = await fetch("/api/schedules");
      const data = await response.json() as ScheduleListItem[];
      setSchedules(data);
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleDelete = async (scheduleId: number) => {
    if (!confirm("Are you sure you want to delete this schedule? The order will be reset to pending.")) {
      return;
    }

    setDeleting(scheduleId);
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete schedule");
      }

      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (error) {
      console.error("Failed to delete schedule:", error);
      alert("Failed to delete schedule");
    } finally {
      setDeleting(null);
    }
  };

  const getProgress = (entries: ScheduleListItem["entries"]) => {
    if (entries.length === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = entries.filter((e) => e.status === "completed").length;
    return {
      completed,
      total: entries.length,
      percent: Math.round((completed / entries.length) * 100),
    };
  };

  const columns: Column<ScheduleListItem>[] = [
    {
      key: "id",
      header: "ID",
      width: 60,
      editable: false,
    },
    {
      key: "product_name",
      header: "Product",
      width: 180,
      editable: false,
      render: (value, row) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {row.order_color && (
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: row.order_color,
              }}
            />
          )}
          <span>{String(value)}</span>
        </div>
      ),
    },
    {
      key: "order_id",
      header: "Order",
      width: 80,
      editable: false,
      render: (value) => `#${value}`,
    },
    {
      key: "quantity",
      header: "Qty",
      width: 80,
      editable: false,
    },
    {
      key: "due_date",
      header: "Due Date",
      width: 110,
      editable: false,
      render: (value) => {
        const date = new Date(String(value));
        const isOverdue = date < new Date();
        return (
          <span style={{ color: isOverdue ? "#dc2626" : "inherit" }}>
            {date.toLocaleDateString()}
          </span>
        );
      },
    },
    {
      key: "week_start_date",
      header: "Week Start",
      width: 110,
      editable: false,
      render: (value) => new Date(String(value)).toLocaleDateString(),
    },
    {
      key: "entries",
      header: "Progress",
      width: 140,
      editable: false,
      render: (value, row) => {
        const progress = getProgress(row.entries);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                  width: `${progress.percent}%`,
                  height: "100%",
                  backgroundColor: progress.percent === 100 ? "#22c55e" : "#3b82f6",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: "#64748b", minWidth: 45 }}>
              {progress.completed}/{progress.total}
            </span>
          </div>
        );
      },
    },
    {
      key: "id",
      header: "Actions",
      width: 160,
      editable: false,
      render: (value, row) => (
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/schedules/${row.id}`}
            className="btn btn-primary"
            style={{ padding: "4px 8px", fontSize: 12, textDecoration: "none" }}
          >
            View
          </Link>
          <button
            className="btn btn-secondary"
            style={{ padding: "4px 8px", fontSize: 12 }}
            onClick={() => handleDelete(row.id)}
            disabled={deleting === row.id}
          >
            {deleting === row.id ? "..." : "Delete"}
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="page">
        <h1>Schedules</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1>Schedules</h1>
        <Link
          href="/orders"
          className="btn btn-secondary"
          style={{ textDecoration: "none" }}
        >
          Go to Orders
        </Link>
      </div>
      {schedules.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          <p>No schedules yet. Generate a schedule from the Orders page.</p>
        </div>
      ) : (
        <DataGrid
          data={schedules}
          columns={columns}
          searchPlaceholder="Search schedules..."
          height="calc(100vh - 180px)"
        />
      )}
    </div>
  );
}

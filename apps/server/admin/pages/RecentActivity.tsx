import React, { useState, useEffect, useCallback } from "react";
import type { Column } from "../components/DataGrid";
import DataGrid from "../components/DataGrid";

interface ProductionEntry {
  id: number;
  productName: string;
  orderId: number;
  orderDueDate: string;
  stepCode: string;
  stepName: string;
  workerName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  unitsProduced: number;
  status: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "-";
  // Handle ISO timestamps like "2026-01-17T11:30:00" or plain "HH:MM"
  let timePart = timeStr;
  if (timeStr.includes("T")) {
    timePart = timeStr.split("T")[1] || timeStr;
  }
  const parts = timePart.split(":");
  if (parts.length >= 2) {
    const hours = parseInt(parts[0]!, 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  }
  return timeStr;
}

function getDateRange(preset: string): { start: string; end: string } | null {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;

  switch (preset) {
    case "today":
      return { start: todayStr, end: todayStr };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { start: weekAgo.toISOString().split("T")[0]!, end: todayStr };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { start: monthAgo.toISOString().split("T")[0]!, end: todayStr };
    }
    case "all":
      return null;
    default:
      return null;
  }
}

export default function RecentActivity() {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<string>("all");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetch(`/api/production-history?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error("Failed to fetch production history:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePresetClick = (preset: string) => {
    const range = getDateRange(preset);
    setStartDate(range?.start ?? null);
    setEndDate(range?.end ?? null);
    setActivePreset(preset);
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (type === "start") {
      setStartDate(value);
    } else {
      setEndDate(value);
    }
    setActivePreset("");
  };

  const columns: Column<ProductionEntry>[] = [
    {
      key: "workDate",
      header: "Date",
      width: 90,
      editable: false,
      render: (value) => formatDate(String(value)),
    },
    {
      key: "startTime",
      header: "Start",
      width: 80,
      editable: false,
      render: (value) => formatTime(value as string),
    },
    {
      key: "endTime",
      header: "End",
      width: 80,
      editable: false,
      render: (value) => formatTime(value as string),
    },
    {
      key: "workerName",
      header: "Worker",
      width: 120,
      editable: false,
    },
    {
      key: "productName",
      header: "Product",
      width: 140,
      editable: false,
    },
    {
      key: "orderDueDate",
      header: "Order Due",
      width: 90,
      editable: false,
      render: (value) => formatDate(String(value)),
    },
    {
      key: "stepCode",
      header: "Step",
      width: 70,
      editable: false,
    },
    {
      key: "stepName",
      header: "Step Name",
      width: 150,
      editable: false,
    },
    {
      key: "unitsProduced",
      header: "Units",
      width: 70,
      editable: false,
    },
  ];

  return (
    <div className="page">
      <h1>Recent Activity</h1>
      <p className="text-slate-500 mb-6">
        Raw production history data - use this to validate imports are complete
      </p>

      {/* Date Controls */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${activePreset === "today" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => handlePresetClick("today")}
          >
            Today
          </button>
          <button
            className={`btn ${activePreset === "week" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => handlePresetClick("week")}
          >
            Last 7 Days
          </button>
          <button
            className={`btn ${activePreset === "month" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => handlePresetClick("month")}
          >
            Last 30 Days
          </button>
          <button
            className={`btn ${activePreset === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => handlePresetClick("all")}
          >
            All
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            value={startDate ?? ""}
            onChange={(e) => handleDateChange("start", e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              fontSize: 14,
            }}
          />
          <span style={{ color: "#64748b" }}>to</span>
          <input
            type="date"
            value={endDate ?? ""}
            onChange={(e) => handleDateChange("end", e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginLeft: "auto", color: "#64748b", fontSize: 14 }}>
          {entries.length} entries
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <DataGrid
          data={entries}
          columns={columns}
          searchPlaceholder="Search by worker, product, step..."
          height="calc(100vh - 280px)"
        />
      )}
    </div>
  );
}

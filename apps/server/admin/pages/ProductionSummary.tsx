import React, { useState, useEffect, useCallback } from "react";
import type { Column } from "../components/DataGrid";
import DataGrid from "../components/DataGrid";

type ViewMode = "overall" | "product" | "order";

interface DailyBreakdown {
  id: string;
  date: string;
  units: number;
  tasks: number;
  workers: string[];
  hours: number;
  laborCost: number;
  equipmentCost: number;
  cost: number;
  plannedUnits: number;
  efficiency: number;
}

interface OverallSummary {
  totalUnits: number;
  tasksCompleted: number;
  workersActive: number;
  totalHoursWorked: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  avgEfficiency: number;
}

interface OverallResponse {
  period: { start: string; end: string };
  summary: OverallSummary;
  dailyBreakdown: Omit<DailyBreakdown, "id">[];
}

interface ProductSummary {
  id: number;
  productId: number;
  productName: string;
  totalUnits: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  plannedUnits: number;
  efficiency: number;
}

interface ProductResponse {
  period: { start: string; end: string };
  products: Omit<ProductSummary, "id">[];
}

interface OrderSummary {
  id: number;
  orderId: number;
  productName: string;
  orderQuantity: number;
  unitsProduced: number;
  progressPercent: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
}

interface OrderResponse {
  period: { start: string; end: string };
  orders: Omit<OrderSummary, "id">[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function getDateRange(preset: string): { start: string; end: string } {
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
    default:
      return { start: todayStr, end: todayStr };
  }
}

export default function ProductionSummary() {
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 7);
    return today.toISOString().split("T")[0]!;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]!);
  const [activePreset, setActivePreset] = useState<string | null>("week");

  const [loading, setLoading] = useState(true);
  const [overallData, setOverallData] = useState<OverallResponse | null>(null);
  const [productData, setProductData] = useState<ProductResponse | null>(null);
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        group_by: viewMode,
      });

      const response = await fetch(`/api/production-summary?${params}`);
      const data = await response.json();

      switch (viewMode) {
        case "overall":
          setOverallData(data as OverallResponse);
          break;
        case "product":
          setProductData(data as ProductResponse);
          break;
        case "order":
          setOrderData(data as OrderResponse);
          break;
      }
    } catch (error) {
      console.error("Failed to fetch production summary:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePresetClick = (preset: string) => {
    const range = getDateRange(preset);
    setStartDate(range.start);
    setEndDate(range.end);
    setActivePreset(preset);
  };

  const handleDateChange = (type: "start" | "end", value: string) => {
    if (type === "start") {
      setStartDate(value);
    } else {
      setEndDate(value);
    }
    setActivePreset(null);
  };

  const dailyColumns: Column<DailyBreakdown>[] = [
    {
      key: "date",
      header: "Date",
      width: 110,
      editable: false,
      render: (value) => formatDate(String(value)),
    },
    {
      key: "units",
      header: "Units",
      width: 80,
      editable: false,
    },
    {
      key: "tasks",
      header: "Tasks",
      width: 70,
      editable: false,
    },
    {
      key: "workers",
      header: "Workers",
      width: 180,
      editable: false,
      render: (value) => {
        const workers = value as string[];
        if (workers.length === 0) return <span style={{ color: "#94a3b8" }}>-</span>;
        if (workers.length <= 3) return workers.join(", ");
        return `${workers.slice(0, 3).join(", ")} +${workers.length - 3}`;
      },
    },
    {
      key: "hours",
      header: "Hours",
      width: 80,
      editable: false,
      render: (value) => `${Number(value).toFixed(1)}h`,
    },
    {
      key: "laborCost",
      header: "Labor $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "equipmentCost",
      header: "Equip $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "cost",
      header: "Total $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "efficiency",
      header: "Efficiency",
      width: 90,
      editable: false,
      render: (value) => {
        const eff = Number(value);
        const color = eff >= 100 ? "#22c55e" : eff >= 80 ? "#f59e0b" : "#dc2626";
        return <span style={{ color }}>{eff}%</span>;
      },
    },
  ];

  const productColumns: Column<ProductSummary>[] = [
    {
      key: "productName",
      header: "Product",
      width: 180,
      editable: false,
    },
    {
      key: "totalUnits",
      header: "Units",
      width: 80,
      editable: false,
    },
    {
      key: "tasksCompleted",
      header: "Tasks",
      width: 70,
      editable: false,
    },
    {
      key: "totalHours",
      header: "Hours",
      width: 80,
      editable: false,
      render: (value) => `${Number(value).toFixed(1)}h`,
    },
    {
      key: "laborCost",
      header: "Labor $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "equipmentCost",
      header: "Equip $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "totalCost",
      header: "Total $",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "efficiency",
      header: "Efficiency",
      width: 90,
      editable: false,
      render: (value) => {
        const eff = Number(value);
        const color = eff >= 100 ? "#22c55e" : eff >= 80 ? "#f59e0b" : "#dc2626";
        return <span style={{ color }}>{eff}%</span>;
      },
    },
  ];

  const orderColumns: Column<OrderSummary>[] = [
    {
      key: "orderId",
      header: "Order",
      width: 70,
      editable: false,
      render: (value) => `#${value}`,
    },
    {
      key: "productName",
      header: "Product",
      width: 160,
      editable: false,
    },
    {
      key: "unitsProduced",
      header: "Produced",
      width: 90,
      editable: false,
      render: (value, row) => `${value} / ${row.orderQuantity}`,
    },
    {
      key: "progressPercent",
      header: "Progress",
      width: 120,
      editable: false,
      render: (value) => (
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
                width: `${Math.min(Number(value), 100)}%`,
                height: "100%",
                backgroundColor: Number(value) >= 100 ? "#22c55e" : "#3b82f6",
              }}
            />
          </div>
          <span style={{ fontSize: 12, minWidth: 35 }}>{value}%</span>
        </div>
      ),
    },
    {
      key: "tasksCompleted",
      header: "Tasks",
      width: 70,
      editable: false,
    },
    {
      key: "totalHours",
      header: "Hours",
      width: 80,
      editable: false,
      render: (value) => `${Number(value).toFixed(1)}h`,
    },
    {
      key: "totalCost",
      header: "Cost",
      width: 90,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
  ];

  const summary = overallData?.summary;

  return (
    <div className="page">
      <h1>Production Summary</h1>

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
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            value={startDate}
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
            value={endDate}
            onChange={(e) => handleDateChange("end", e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              fontSize: 14,
            }}
          />
        </div>
      </div>

      {/* View Mode Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #e2e8f0" }}>
        {(["overall", "product", "order"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              borderBottom: viewMode === mode ? "2px solid #3b82f6" : "2px solid transparent",
              backgroundColor: "transparent",
              color: viewMode === mode ? "#3b82f6" : "#64748b",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {mode === "overall" ? "Overall" : mode === "product" ? "By Product" : "By Order"}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {/* Summary Cards (only for overall view) */}
          {viewMode === "overall" && summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Total Units</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.totalUnits.toLocaleString()}</div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Tasks Completed</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.tasksCompleted}</div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Workers Active</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.workersActive}</div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Hours Worked</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.totalHoursWorked.toFixed(1)}h</div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Total Cost</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>${summary.totalCost.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Labor: ${summary.laborCost.toFixed(2)} | Equip: ${summary.equipmentCost.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Avg Efficiency</div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: summary.avgEfficiency >= 100 ? "#22c55e" : summary.avgEfficiency >= 80 ? "#f59e0b" : "#dc2626"
                }}>
                  {summary.avgEfficiency}%
                </div>
              </div>
            </div>
          )}

          {/* Data Grid */}
          {viewMode === "overall" && overallData && (
            <DataGrid
              data={overallData.dailyBreakdown.map((d, i) => ({ ...d, id: d.date || `row-${i}` }))}
              columns={dailyColumns}
              searchPlaceholder="Search days..."
              height="calc(100vh - 450px)"
            />
          )}

          {viewMode === "product" && productData && (
            <DataGrid
              data={productData.products.map((p) => ({ ...p, id: p.productId }))}
              columns={productColumns}
              searchPlaceholder="Search products..."
              height="calc(100vh - 300px)"
            />
          )}

          {viewMode === "order" && orderData && (
            <DataGrid
              data={orderData.orders.map((o) => ({ ...o, id: o.orderId }))}
              columns={orderColumns}
              searchPlaceholder="Search orders..."
              height="calc(100vh - 300px)"
            />
          )}
        </>
      )}
    </div>
  );
}

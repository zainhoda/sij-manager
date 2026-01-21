import React, { useState, useEffect, useCallback } from "react";
import type { Column } from "../components/DataGrid";
import DataGrid from "../components/DataGrid";

type ViewMode = "overall" | "day" | "worker" | "product" | "order" | "step";

interface FilterOption {
  id: number;
  name: string;
}

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

interface DaySummary {
  id: string;
  date: string;
  units: number;
  tasks: number;
  workerCount: number;
  hours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  plannedUnits: number;
  efficiency: number;
}

interface DayResponse {
  period: { start: string | null; end: string | null };
  days: Omit<DaySummary, "id">[];
}

interface WorkerSummary {
  id: number;
  workerId: number;
  workerName: string;
  totalUnits: number;
  tasksCompleted: number;
  totalHours: number;
  laborCost: number;
  avgEfficiency: number;
}

interface WorkerResponse {
  period: { start: string | null; end: string | null };
  workers: Omit<WorkerSummary, "id">[];
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
  unitsComplete: number;
  unitsInProgress: number;
  unitsNotStarted: number;
  // Progress vs Ideal
  progressPercentIdeal: number;
  estimatedHoursRemainingIdeal: number;
  // Progress vs Actual Efficiency
  progressPercentActual: number;
  estimatedHoursRemainingActual: number;
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

interface StepSummary {
  id: number;
  stepId: number;
  stepName: string;
  productName: string;
  sequence: number;
  totalUnits: number;
  tasksCompleted: number;
  workerCount: number;
  totalHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  efficiency: number;
  estimatedSecondsPerPiece: number;
  actualSecondsPerPiece: number | null;
  topPerformers: { workerId: number; workerName: string; output: number; efficiency: number }[];
  proficientWorkers: { workerId: number; workerName: string; level: number }[];
}

interface StepResponse {
  period: { start: string; end: string };
  steps: Omit<StepSummary, "id">[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
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
      return null; // No date filter
    default:
      return { start: todayStr, end: todayStr };
  }
}

export default function ProductionSummary() {
  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>("all");

  const [loading, setLoading] = useState(true);
  const [overallData, setOverallData] = useState<OverallResponse | null>(null);
  const [dayData, setDayData] = useState<DayResponse | null>(null);
  const [workerData, setWorkerData] = useState<WorkerResponse | null>(null);
  const [productData, setProductData] = useState<ProductResponse | null>(null);
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [stepData, setStepData] = useState<StepResponse | null>(null);

  // Filter options
  const [productOptions, setProductOptions] = useState<FilterOption[]>([]);
  const [workerOptions, setWorkerOptions] = useState<FilterOption[]>([]);
  const [orderOptions, setOrderOptions] = useState<{ id: number; name: string; productName: string }[]>([]);

  // Selected filters
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ group_by: viewMode });
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      if (selectedProducts.length > 0) params.set("product_ids", selectedProducts.join(","));
      if (selectedWorkers.length > 0) params.set("worker_ids", selectedWorkers.join(","));
      if (selectedOrders.length > 0) params.set("order_ids", selectedOrders.join(","));

      const response = await fetch(`/api/production-summary?${params}`);
      const data = await response.json();

      switch (viewMode) {
        case "overall":
          setOverallData(data as OverallResponse);
          break;
        case "day":
          setDayData(data as DayResponse);
          break;
        case "worker":
          setWorkerData(data as WorkerResponse);
          break;
        case "product":
          setProductData(data as ProductResponse);
          break;
        case "order":
          setOrderData(data as OrderResponse);
          break;
        case "step":
          setStepData(data as StepResponse);
          break;
      }
    } catch (error) {
      console.error("Failed to fetch production summary:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, viewMode, selectedProducts, selectedWorkers, selectedOrders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [workersRes, demandRes] = await Promise.all([
          fetch("/api/workers"),
          fetch("/api/demand"),
        ]);

        // Get unique BOM nums from production history for product filter
        const productionRes = await fetch("/api/production-history?limit=1000");
        if (productionRes.ok) {
          const data = await productionRes.json();
          const bomNums = new Set<string>();
          const bomsById = new Map<string, { id: number; name: string }>();
          for (const entry of data.entries || []) {
            if (entry.fishbowlBomNum && !bomNums.has(entry.fishbowlBomNum)) {
              bomNums.add(entry.fishbowlBomNum);
              // Use the BOM num as both id and name for filtering
              bomsById.set(entry.fishbowlBomNum, {
                id: bomNums.size, // Use index as pseudo-id
                name: entry.fishbowlBomNum,
              });
            }
          }
          setProductOptions(Array.from(bomsById.values()));
        }

        if (workersRes.ok) {
          const workers = await workersRes.json();
          setWorkerOptions(workers.map((w: { id: number; name: string }) => ({ id: w.id, name: w.name })));
        }

        if (demandRes.ok) {
          const demands = await demandRes.json();
          setOrderOptions((demands.entries || []).map((d: { id: number; fishbowl_bom_num?: string; fishbowlBomNum?: string; customer_name?: string }) => ({
            id: d.id,
            name: `#${d.id}`,
            productName: d.fishbowl_bom_num || d.fishbowlBomNum || "",
          })));
        }
      } catch (error) {
        console.error("Failed to fetch filter options:", error);
      }
    };

    fetchFilterOptions();
  }, []);

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
      header: "Steps",
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

  const dayColumns: Column<DaySummary>[] = [
    {
      key: "date",
      header: "Date",
      width: 110,
      editable: false,
      render: (value) => formatDate(String(value)),
    },
    {
      key: "units",
      header: "Steps",
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
      key: "workerCount",
      header: "Workers",
      width: 80,
      editable: false,
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

  const workerColumns: Column<WorkerSummary>[] = [
    {
      key: "workerName",
      header: "Worker",
      width: 160,
      editable: false,
    },
    {
      key: "totalUnits",
      header: "Steps",
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
      width: 100,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
    {
      key: "avgEfficiency",
      header: "Avg Efficiency",
      width: 110,
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
      header: "Steps",
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
      width: 140,
      editable: false,
    },
    {
      key: "unitsComplete",
      header: "Completion",
      width: 180,
      editable: false,
      render: (_, row) => {
        const total = row.orderQuantity;
        const completePercent = total > 0 ? (row.unitsComplete / total) * 100 : 0;
        const inProgressPercent = total > 0 ? (row.unitsInProgress / total) * 100 : 0;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${completePercent}%`, height: "100%", backgroundColor: "#22c55e" }} />
              <div style={{ width: `${inProgressPercent}%`, height: "100%", backgroundColor: "#f59e0b" }} />
            </div>
            <div style={{ fontSize: 11, display: "flex", gap: 8 }}>
              <span style={{ color: "#22c55e" }}>{row.unitsComplete} done</span>
              <span style={{ color: "#f59e0b" }}>{row.unitsInProgress} wip</span>
              <span style={{ color: "#94a3b8" }}>{row.unitsNotStarted} todo</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "progressPercentIdeal",
      header: "vs. Ideal",
      width: 130,
      editable: false,
      render: (value, row) => {
        const percent = Math.min(Number(value), 100);
        const isOver = Number(value) > 100;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  backgroundColor: isOver ? "#dc2626" : "#3b82f6",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: isOver ? "#dc2626" : "#64748b" }}>
              {row.totalHours.toFixed(1)}h / {(row.totalHours + row.estimatedHoursRemainingIdeal).toFixed(1)}h ({value}%)
            </div>
          </div>
        );
      },
    },
    {
      key: "progressPercentActual",
      header: "vs. Act. Eff.",
      width: 130,
      editable: false,
      render: (value, row) => {
        const percent = Math.min(Number(value), 100);
        const isOver = Number(value) > 100;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 8, backgroundColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  backgroundColor: isOver ? "#dc2626" : "#8b5cf6",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: isOver ? "#dc2626" : "#64748b" }}>
              {row.totalHours.toFixed(1)}h / {(row.totalHours + row.estimatedHoursRemainingActual).toFixed(1)}h ({value}%)
            </div>
          </div>
        );
      },
    },
    {
      key: "totalCost",
      header: "Cost",
      width: 80,
      editable: false,
      render: (value) => `$${Number(value).toFixed(2)}`,
    },
  ];

  const stepColumns: Column<StepSummary>[] = [
    {
      key: "stepName",
      header: "Step",
      width: 180,
      editable: false,
    },
    {
      key: "productName",
      header: "Product",
      width: 120,
      editable: false,
    },
    {
      key: "totalUnits",
      header: "Units",
      width: 70,
      editable: false,
    },
    {
      key: "estimatedSecondsPerPiece",
      header: "Est. Time",
      width: 80,
      editable: false,
      render: (value) => `${Number(value)}s`,
    },
    {
      key: "actualSecondsPerPiece",
      header: "Actual",
      width: 80,
      editable: false,
      render: (value, row) => {
        if (value === null) return <span style={{ color: "#94a3b8" }}>-</span>;
        const actual = Number(value);
        const estimated = row.estimatedSecondsPerPiece;
        const color = actual <= estimated ? "#22c55e" : actual <= estimated * 1.2 ? "#f59e0b" : "#dc2626";
        return <span style={{ color }}>{actual.toFixed(1)}s</span>;
      },
    },
    {
      key: "efficiency",
      header: "Efficiency",
      width: 85,
      editable: false,
      render: (value) => {
        const eff = Number(value);
        const color = eff >= 100 ? "#22c55e" : eff >= 80 ? "#f59e0b" : "#dc2626";
        return <span style={{ color, fontWeight: 600 }}>{eff}%</span>;
      },
    },
    {
      key: "topPerformers",
      header: "Top Performers",
      width: 200,
      editable: false,
      render: (value) => {
        const performers = value as StepSummary["topPerformers"];
        if (!performers || performers.length === 0) {
          return <span style={{ color: "#94a3b8", fontSize: 12 }}>No data</span>;
        }
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {performers.slice(0, 3).map((p, i) => (
              <span
                key={p.workerId}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  backgroundColor: i === 0 ? "#fef08a" : "#f1f5f9",
                  color: "#334155",
                }}
                title={`${p.output} units, ${p.efficiency}% efficiency`}
              >
                {p.workerName}
                <span style={{ color: p.efficiency >= 100 ? "#16a34a" : "#64748b", marginLeft: 4 }}>
                  {p.efficiency}%
                </span>
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "proficientWorkers",
      header: "Proficient (3+)",
      width: 150,
      editable: false,
      render: (value) => {
        const workers = value as StepSummary["proficientWorkers"];
        if (!workers || workers.length === 0) {
          return <span style={{ color: "#94a3b8", fontSize: 12 }}>None set</span>;
        }
        const display = workers.slice(0, 3);
        const more = workers.length - 3;
        return (
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {display.map(w => w.workerName).join(", ")}
            {more > 0 && <span style={{ color: "#94a3b8" }}> +{more}</span>}
          </div>
        );
      },
    },
    {
      key: "workerCount",
      header: "Active",
      width: 60,
      editable: false,
    },
    {
      key: "totalHours",
      header: "Hours",
      width: 70,
      editable: false,
      render: (value) => `${Number(value).toFixed(1)}h`,
    },
    {
      key: "totalCost",
      header: "Cost",
      width: 80,
      editable: false,
      render: (value) => `$${Number(value).toFixed(0)}`,
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
          <button
            className={`btn ${activePreset === "all" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => handlePresetClick("all")}
          >
            All Time
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
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="min-w-[160px]">
          <label className="text-xs text-slate-500 block mb-1">Product</label>
          <select
            multiple
            value={selectedProducts.map(String)}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions, opt => Number(opt.value));
              setSelectedProducts(values);
            }}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm min-h-[60px]"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="text-xs text-slate-500 block mb-1">Worker</label>
          <select
            multiple
            value={selectedWorkers.map(String)}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions, opt => Number(opt.value));
              setSelectedWorkers(values);
            }}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm min-h-[60px]"
          >
            {workerOptions.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px]">
          <label className="text-xs text-slate-500 block mb-1">Order</label>
          <select
            multiple
            value={selectedOrders.map(String)}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions, opt => Number(opt.value));
              setSelectedOrders(values);
            }}
            className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-sm min-h-[60px]"
          >
            {orderOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.name} - {o.productName}</option>
            ))}
          </select>
        </div>

        {(selectedProducts.length > 0 || selectedWorkers.length > 0 || selectedOrders.length > 0) && (
          <div className="flex items-end">
            <button
              className="btn btn-secondary h-8"
              onClick={() => {
                setSelectedProducts([]);
                setSelectedWorkers([]);
                setSelectedOrders([]);
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* View Mode Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #e2e8f0" }}>
        {(["overall", "day", "worker", "product", "order", "step"] as ViewMode[]).map((mode) => {
          const labels: Record<ViewMode, string> = {
            overall: "Overall",
            day: "By Day",
            worker: "By Worker",
            product: "By Product",
            order: "By Order",
            step: "By Step",
          };
          return (
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
              }}
            >
              {labels[mode]}
            </button>
          );
        })}
      </div>

      {/* Active Filter Chips */}
      {(selectedProducts.length > 0 || selectedWorkers.length > 0 || selectedOrders.length > 0 || startDate || endDate) && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <span className="text-xs text-slate-500">Filtering by:</span>

          {startDate && endDate && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              {startDate === endDate ? startDate : `${startDate} to ${endDate}`}
              <button
                onClick={() => { setStartDate(null); setEndDate(null); setActivePreset("all"); }}
                className="hover:bg-blue-200 rounded-full p-0.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}

          {selectedProducts.map(id => {
            const product = productOptions.find(p => p.id === id);
            return product ? (
              <span key={`product-${id}`} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                {product.name}
                <button
                  onClick={() => setSelectedProducts(prev => prev.filter(p => p !== id))}
                  className="hover:bg-purple-200 rounded-full p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ) : null;
          })}

          {selectedWorkers.map(id => {
            const worker = workerOptions.find(w => w.id === id);
            return worker ? (
              <span key={`worker-${id}`} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                {worker.name}
                <button
                  onClick={() => setSelectedWorkers(prev => prev.filter(w => w !== id))}
                  className="hover:bg-green-200 rounded-full p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ) : null;
          })}

          {selectedOrders.map(id => {
            const order = orderOptions.find(o => o.id === id);
            return order ? (
              <span key={`order-${id}`} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                #{id} {order.productName}
                <button
                  onClick={() => setSelectedOrders(prev => prev.filter(o => o !== id))}
                  className="hover:bg-orange-200 rounded-full p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ) : null;
          })}

          {(selectedProducts.length > 0 || selectedWorkers.length > 0 || selectedOrders.length > 0) && (
            <button
              onClick={() => {
                setSelectedProducts([]);
                setSelectedWorkers([]);
                setSelectedOrders([]);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 underline ml-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {/* Summary Cards (only for overall view) */}
          {viewMode === "overall" && summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Step Completions</div>
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

          {viewMode === "day" && dayData && (
            <DataGrid
              data={dayData.days.map((d) => ({ ...d, id: d.date }))}
              columns={dayColumns}
              searchPlaceholder="Search days..."
              height="calc(100vh - 300px)"
            />
          )}

          {viewMode === "worker" && workerData && (
            <DataGrid
              data={workerData.workers.map((w) => ({ ...w, id: w.workerId }))}
              columns={workerColumns}
              searchPlaceholder="Search workers..."
              height="calc(100vh - 300px)"
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
            <>
              <DataGrid
                data={orderData.orders.map((o) => ({ ...o, id: o.orderId }))}
                columns={orderColumns}
                searchPlaceholder="Search orders..."
                height="calc(100vh - 380px)"
              />
              <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Progress Calculations</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ color: "#3b82f6", fontWeight: 500, marginBottom: 4 }}>vs. Ideal</div>
                    <div style={{ color: "#64748b" }}>
                      Based on <code style={{ backgroundColor: "#e2e8f0", padding: "1px 4px", borderRadius: 3 }}>time_per_piece_seconds</code> from product definitions.
                      <br />
                      <span style={{ fontSize: 12 }}>Formula: hours_worked ÷ (sum of ideal time per piece × quantity)</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#8b5cf6", fontWeight: 500, marginBottom: 4 }}>vs. Actual Efficiency</div>
                    <div style={{ color: "#64748b" }}>
                      Based on observed pace from production data.
                      <br />
                      <span style={{ fontSize: 12 }}>Formula: hours_worked ÷ (step_completions_needed × actual_hours_per_step)</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {viewMode === "step" && stepData && (
            <DataGrid
              data={stepData.steps.map((s) => ({ ...s, id: s.stepId }))}
              columns={stepColumns}
              searchPlaceholder="Search steps..."
              height="calc(100vh - 300px)"
            />
          )}
        </>
      )}
    </div>
  );
}

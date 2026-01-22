import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  RefreshCw,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  Archive,
  ChevronRight,
  Play,
  BarChart3,
  DollarSign,
  Scale,
  AlertTriangle,
  Trash2,
} from "lucide-react";

interface PlanningRun {
  id: number;
  name: string;
  description: string | null;
  planning_start_date: string;
  planning_end_date: string;
  accepted_scenario_id: number | null;
  status: "draft" | "pending" | "accepted" | "executed" | "archived";
  created_by: string | null;
  created_at: string;
  scenarios?: PlanningScenario[];
}

interface PlanningScenario {
  id: number;
  name: string;
  strategy: "meet_deadlines" | "minimize_cost" | "balanced" | "custom";
  total_labor_hours: number | null;
  total_overtime_hours: number | null;
  total_labor_cost: number | null;
  total_equipment_cost: number | null;
  deadlines_met: number | null;
  deadlines_missed: number | null;
  latest_completion_date: string | null;
}

interface DemandEntry {
  id: number;
  fishbowl_bom_num: string;
  quantity: number;
  due_date: string;
  customer_name: string | null;
  status: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f1f5f9", text: "#64748b" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  accepted: { bg: "#d1fae5", text: "#065f46" },
  executed: { bg: "#dbeafe", text: "#1e40af" },
  archived: { bg: "#e5e7eb", text: "#374151" },
};

const STRATEGY_ICONS = {
  meet_deadlines: Clock,
  minimize_cost: DollarSign,
  balanced: Scale,
  custom: BarChart3,
};

export default function PlanningRuns() {
  const [, setLocation] = useLocation();
  const [runs, setRuns] = useState<PlanningRun[]>([]);
  const [activeRun, setActiveRun] = useState<PlanningRun | null>(null);
  const [planableDemand, setPlanableDemand] = useState<DemandEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const [runsResponse, activeResponse, demandResponse] = await Promise.all([
        fetch("/api/planning/runs?limit=20"),
        fetch("/api/planning/runs/active"),
        fetch("/api/demand/planable"),
      ]);

      const runsData = await runsResponse.json();
      const activeData = await activeResponse.json();
      const demandData = await demandResponse.json();

      setRuns(runsData.runs || []);
      setActiveRun(activeData.run || null);
      setPlanableDemand(demandData.entries || []);
    } catch (error) {
      console.error("Failed to fetch planning runs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const handleDelete = async (run: PlanningRun) => {
    if (!confirm(`Are you sure you want to delete "${run.name}"? This will also delete all scenarios and tasks associated with this run.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/planning/runs/${run.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete planning run");
      }

      fetchRuns();
    } catch (error) {
      console.error("Failed to delete planning run:", error);
      alert(error instanceof Error ? error.message : "Failed to delete planning run");
    }
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Planning Runs</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            Create and compare production planning scenarios
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={fetchRuns}>
            <RefreshCw size={16} />
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            disabled={planableDemand.length === 0}
          >
            <Plus size={16} style={{ marginRight: 4 }} />
            New Planning Run
          </button>
        </div>
      </div>

      {/* Active Plan */}
      {activeRun && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: "4px solid #22c55e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <CheckCircle size={20} style={{ color: "#22c55e" }} />
                <h3 style={{ margin: 0 }}>Active Plan: {activeRun.name}</h3>
              </div>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
                {formatDate(activeRun.planning_start_date)} - {formatDate(activeRun.planning_end_date)}
              </p>
            </div>
            <Link href="/planning/active">
              <button className="btn btn-primary">
                View Active Plan
                <ChevronRight size={16} style={{ marginLeft: 4 }} />
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Planable Demand Summary */}
      <div className="card" style={{ padding: 16, marginBottom: 16, background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: 600 }}>{planableDemand.length}</span>
            <span style={{ color: "#64748b", marginLeft: 8 }}>demand entries ready to plan</span>
          </div>
          <Link href="/planning/demand">
            <button className="btn btn-secondary" style={{ fontSize: 13 }}>
              View Demand Pool
            </button>
          </Link>
        </div>
      </div>

      {/* Planning Runs List */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Loading planning runs...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Calendar size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No planning runs yet</p>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Create a new planning run to generate production scenarios
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {runs.map((run) => (
            <div key={run.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{run.name}</h3>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: STATUS_COLORS[run.status]?.bg || "#e5e7eb",
                        color: STATUS_COLORS[run.status]?.text || "#374151",
                      }}
                    >
                      {run.status}
                    </span>
                  </div>
                  <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                    {formatDate(run.planning_start_date)} - {formatDate(run.planning_end_date)}
                    {run.description && ` • ${run.description}`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/planning/runs/${run.id}`}>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }}>
                      View Details
                      <ChevronRight size={14} style={{ marginLeft: 4 }} />
                    </button>
                  </Link>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 13, color: "#ef4444" }}
                    onClick={() => handleDelete(run)}
                    title="Delete planning run"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Scenarios summary */}
              {run.scenarios && run.scenarios.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  {run.scenarios.map((scenario) => {
                    const Icon = STRATEGY_ICONS[scenario.strategy] || BarChart3;
                    const isAccepted = run.accepted_scenario_id === scenario.id;
                    return (
                      <div
                        key={scenario.id}
                        style={{
                          padding: 12,
                          background: isAccepted ? "#f0fdf4" : "#f8fafc",
                          borderRadius: 8,
                          border: isAccepted ? "1px solid #22c55e" : "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <Icon size={14} style={{ color: isAccepted ? "#22c55e" : "#64748b" }} />
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{scenario.name}</span>
                          {isAccepted && (
                            <CheckCircle size={14} style={{ color: "#22c55e", marginLeft: "auto" }} />
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: "#64748b" }}>Cost:</span>
                          <span style={{ fontWeight: 500 }}>
                            {formatCurrency((scenario.total_labor_cost || 0) + (scenario.total_equipment_cost || 0))}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: "#64748b" }}>Deadlines:</span>
                          <span
                            style={{
                              fontWeight: 500,
                              color: scenario.deadlines_missed ? "#ef4444" : "#22c55e",
                            }}
                          >
                            {scenario.deadlines_met}/{(scenario.deadlines_met || 0) + (scenario.deadlines_missed || 0)} met
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePlanningRunModal
          planableDemand={planableDemand}
          onClose={() => setShowCreateModal(false)}
          onCreated={(runId) => {
            setShowCreateModal(false);
            setLocation(`/planning/runs/${runId}`);
          }}
        />
      )}
    </div>
  );
}

interface CreateModalProps {
  planableDemand: DemandEntry[];
  onClose: () => void;
  onCreated: (runId: number) => void;
}

interface DemandBatchConfig {
  minBatchSize?: number;
  maxBatchSize?: number;
}

function CreatePlanningRunModal({ planableDemand, onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]!);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!
  );
  const [selectedDemand, setSelectedDemand] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch preferences per demand item
  const [batchConfigs, setBatchConfigs] = useState<Record<number, DemandBatchConfig>>({});

  const handleCreate = async () => {
    if (!name || !startDate || !endDate) {
      setError("Please fill in all required fields");
      return;
    }

    setCreating(true);
    setError(null);

    // Build preferences object with per-demand batch configs
    const preferences: any = {};
    const perDemandConfigs: Record<number, { minBatchSize?: number; maxBatchSize?: number }> = {};

    for (const [demandIdStr, config] of Object.entries(batchConfigs)) {
      const demandId = parseInt(demandIdStr);
      if (config.minBatchSize || config.maxBatchSize) {
        perDemandConfigs[demandId] = {};
        if (config.minBatchSize) {
          perDemandConfigs[demandId].minBatchSize = config.minBatchSize;
        }
        if (config.maxBatchSize) {
          perDemandConfigs[demandId].maxBatchSize = config.maxBatchSize;
        }
      }
    }

    if (Object.keys(perDemandConfigs).length > 0) {
      preferences.batching = { perDemand: perDemandConfigs };
    }

    try {
      const response = await fetch("/api/planning/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          planning_start_date: startDate,
          planning_end_date: endDate,
          demand_entry_ids: selectedDemand.length > 0 ? selectedDemand : undefined,
          preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create planning run");
      }

      const data = await response.json();
      onCreated(data.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create planning run");
    } finally {
      setCreating(false);
    }
  };

  const toggleDemand = (id: number) => {
    setSelectedDemand((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedDemand(planableDemand.map((d) => d.id));
  };

  const selectNone = () => {
    setSelectedDemand([]);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 600, maxHeight: "80vh", overflow: "auto", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>New Planning Run</h2>

        {error && (
          <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Week 4 Production Plan"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>End Date *</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontWeight: 500, fontSize: 14 }}>
              Include Demand ({selectedDemand.length}/{planableDemand.length} selected)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={selectAll} className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }}>
                Select All
              </button>
              <button onClick={selectNone} className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 8px" }}>
                Clear
              </button>
            </div>
          </div>
          <div
            style={{
              maxHeight: 300,
              overflow: "auto",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
            }}
          >
            {planableDemand.map((demand) => {
              const isSelected = selectedDemand.includes(demand.id);
              const config = batchConfigs[demand.id] || {};
              return (
                <div
                  key={demand.id}
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #e2e8f0",
                    background: isSelected ? "#f0fdf4" : "transparent",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDemand(demand.id)}
                    />
                    <span style={{ fontFamily: "monospace", fontSize: 12 }}>{demand.fishbowl_bom_num}</span>
                    <span style={{ color: "#64748b", fontSize: 12 }}>x{demand.quantity}</span>
                    <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 12 }}>
                      Due: {new Date(demand.due_date).toLocaleDateString()}
                    </span>
                  </label>
                  {isSelected && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, marginLeft: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <label style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Min batch:</label>
                        <input
                          type="number"
                          min="1"
                          max={demand.quantity}
                          value={config.minBatchSize || ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : undefined;
                            setBatchConfigs((prev) => ({
                              ...prev,
                              [demand.id]: { ...prev[demand.id], minBatchSize: val },
                            }));
                          }}
                          placeholder="-"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: 60,
                            padding: "4px 6px",
                            border: "1px solid #e2e8f0",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <label style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Max batch:</label>
                        <input
                          type="number"
                          min="1"
                          max={demand.quantity}
                          value={config.maxBatchSize || ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : undefined;
                            setBatchConfigs((prev) => ({
                              ...prev,
                              [demand.id]: { ...prev[demand.id], maxBatchSize: val },
                            }));
                          }}
                          placeholder="-"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: 60,
                            padding: "4px 6px",
                            border: "1px solid #e2e8f0",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            Leave empty to include all pending demand
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create & Generate Scenarios"}
          </button>
        </div>
      </div>
    </div>
  );
}

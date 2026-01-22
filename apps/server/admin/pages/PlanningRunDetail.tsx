import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  Clock,
  DollarSign,
  Scale,
  BarChart3,
  AlertTriangle,
  Calendar,
  Archive,
  Play,
  Eye,
} from "lucide-react";
import SchedulePreviewModal from "../components/SchedulePreviewModal";
import ScheduleEditModal from "../components/ScheduleEditModal";

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
  scenarios: PlanningScenario[];
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
  allow_overtime: boolean;
  overtime_limit_hours_per_day: number | null;
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

const STRATEGY_LABELS = {
  meet_deadlines: "Meet Deadlines",
  minimize_cost: "Minimize Cost",
  balanced: "Balanced",
  custom: "Custom",
};

export default function PlanningRunDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const runId = params.id;

  const [run, setRun] = useState<PlanningRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<number | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<{ id: number; name: string } | null>(null);

  const openPreviewModal = (scenarioId: number, scenarioName: string) => {
    setSelectedScenario({ id: scenarioId, name: scenarioName });
    setPreviewModalOpen(true);
  };

  const openEditModal = () => {
    setPreviewModalOpen(false);
    setEditModalOpen(true);
  };

  const handleEditSaved = async (newScenarioId: number) => {
    setEditModalOpen(false);
    setSelectedScenario(null);
    await fetchRun(); // Refresh to show the new scenario
  };

  const fetchRun = useCallback(async () => {
    try {
      const response = await fetch(`/api/planning/runs/${runId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Planning run not found");
        }
        throw new Error("Failed to fetch planning run");
      }
      const data = await response.json();
      setRun(data.run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const handleAccept = async (scenarioId: number) => {
    setAccepting(scenarioId);
    try {
      const response = await fetch(`/api/planning/runs/${runId}/accept/${scenarioId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to accept scenario");
      }

      await fetchRun();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to accept scenario");
    } finally {
      setAccepting(null);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this planning run?")) {
      return;
    }

    setArchiving(true);
    try {
      const response = await fetch(`/api/planning/runs/${runId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to archive planning run");
      }

      setLocation("/planning/runs");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive planning run");
    } finally {
      setArchiving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  if (loading) {
    return (
      <div className="page">
        <p style={{ color: "#64748b" }}>Loading planning run...</p>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <Link href="/planning/runs">
            <button className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ArrowLeft size={16} />
              Back to Planning Runs
            </button>
          </Link>
        </div>
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <AlertTriangle size={48} style={{ color: "#ef4444", marginBottom: 16 }} />
          <p style={{ color: "#ef4444", fontWeight: 500 }}>{error || "Planning run not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <Link href="/planning/runs">
          <button
            className="btn btn-secondary"
            style={{ padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} />
          </button>
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ margin: 0 }}>{run.name}</h1>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                background: STATUS_COLORS[run.status]?.bg || "#e5e7eb",
                color: STATUS_COLORS[run.status]?.text || "#374151",
              }}
            >
              {run.status}
            </span>
          </div>
          <p style={{ color: "#64748b", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={14} />
            {formatDate(run.planning_start_date)} - {formatDate(run.planning_end_date)}
            {run.description && <span> &middot; {run.description}</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={fetchRun}>
            <RefreshCw size={16} />
          </button>
          {run.status !== "archived" && (
            <button
              className="btn btn-secondary"
              onClick={handleArchive}
              disabled={archiving}
              style={{ color: "#64748b" }}
            >
              <Archive size={16} style={{ marginRight: 4 }} />
              {archiving ? "Archiving..." : "Archive"}
            </button>
          )}
        </div>
      </div>

      {/* Accepted Scenario Banner */}
      {run.accepted_scenario_id && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 24,
            borderLeft: "4px solid #22c55e",
            background: "#f0fdf4",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={20} style={{ color: "#22c55e" }} />
            <span style={{ fontWeight: 500, color: "#065f46" }}>
              Scenario accepted:{" "}
              {run.scenarios.find((s) => s.id === run.accepted_scenario_id)?.name || "Unknown"}
            </span>
            <Link href="/planning/active" style={{ marginLeft: "auto" }}>
              <button className="btn btn-primary" style={{ fontSize: 13 }}>
                <Play size={14} style={{ marginRight: 4 }} />
                View Active Plan
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Scenarios */}
      <h2 style={{ marginBottom: 16 }}>Scenarios ({run.scenarios.length})</h2>

      {run.scenarios.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <BarChart3 size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No scenarios generated yet</p>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Scenarios are being generated...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {run.scenarios.map((scenario) => {
            const Icon = STRATEGY_ICONS[scenario.strategy] || BarChart3;
            const isAccepted = run.accepted_scenario_id === scenario.id;
            const totalCost = (scenario.total_labor_cost || 0) + (scenario.total_equipment_cost || 0);
            const totalDeadlines = (scenario.deadlines_met || 0) + (scenario.deadlines_missed || 0);

            return (
              <div
                key={scenario.id}
                className="card"
                style={{
                  padding: 20,
                  border: isAccepted ? "2px solid #22c55e" : "1px solid #e2e8f0",
                  background: isAccepted ? "#fafff9" : "white",
                }}
              >
                {/* Scenario Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Icon size={18} style={{ color: isAccepted ? "#22c55e" : "#64748b" }} />
                      <h3 style={{ margin: 0, fontSize: 16 }}>{scenario.name}</h3>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        background: "#f1f5f9",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {STRATEGY_LABELS[scenario.strategy] || scenario.strategy}
                    </span>
                  </div>
                  {isAccepted && <CheckCircle size={24} style={{ color: "#22c55e" }} />}
                </div>

                {/* Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Total Cost</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency(totalCost)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Labor: {formatCurrency(scenario.total_labor_cost)} &middot; Equip: {formatCurrency(scenario.total_equipment_cost)}
                    </div>
                  </div>
                  <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Deadlines</div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        color: scenario.deadlines_missed ? "#ef4444" : "#22c55e",
                      }}
                    >
                      {scenario.deadlines_met}/{totalDeadlines} met
                    </div>
                    {scenario.deadlines_missed ? (
                      <div style={{ fontSize: 11, color: "#ef4444" }}>
                        {scenario.deadlines_missed} missed
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: "#22c55e" }}>All on time</div>
                    )}
                  </div>
                </div>

                {/* Additional Stats */}
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Labor Hours:</span>
                    <span style={{ fontWeight: 500 }}>{scenario.total_labor_hours?.toFixed(1) || "-"}h</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Overtime Hours:</span>
                    <span style={{ fontWeight: 500 }}>{scenario.total_overtime_hours?.toFixed(1) || "0"}h</span>
                  </div>
                  {scenario.latest_completion_date && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Latest Completion:</span>
                      <span style={{ fontWeight: 500 }}>{formatDate(scenario.latest_completion_date)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={() => openPreviewModal(scenario.id, scenario.name)}
                  >
                    <Eye size={14} />
                    Preview Schedule
                  </button>
                  {!run.accepted_scenario_id && run.status !== "archived" && (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => handleAccept(scenario.id)}
                      disabled={accepting !== null}
                    >
                      {accepting === scenario.id ? "Accepting..." : "Accept This Scenario"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Preview Modal */}
      {previewModalOpen && selectedScenario && (
        <SchedulePreviewModal
          isOpen={previewModalOpen}
          scenarioId={selectedScenario.id}
          scenarioName={selectedScenario.name}
          isAccepted={run.accepted_scenario_id !== null}
          onClose={() => {
            setPreviewModalOpen(false);
            setSelectedScenario(null);
          }}
          onEdit={openEditModal}
        />
      )}

      {/* Schedule Edit Modal */}
      {editModalOpen && selectedScenario && (
        <ScheduleEditModal
          isOpen={editModalOpen}
          scenarioId={selectedScenario.id}
          parentScenarioName={selectedScenario.name}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedScenario(null);
          }}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}

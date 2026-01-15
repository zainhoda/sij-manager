import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

interface DraftEntry {
  id: string;
  product_step_id: number;
  step_name: string;
  step_code: string | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  worker_ids: number[];
  worker_names: string[];
  qualified_worker_ids: number[];
}

interface DayProjection {
  date: string;
  cumulativeUnits: number;
  percentComplete: number;
  entries: number;
}

interface Worker {
  id: number;
  name: string;
  skill_category: string;
}

interface PlanPreview {
  orderId: number;
  productName: string;
  orderQuantity: number;
  dueDate: string;
  buildVersionId: number | null;
  projectedEndDate: string;
  projectedEndTime: string;
  isOnTrack: boolean;
  daysOverUnder: number;
  idealHours: number;
  adjustedHours: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  timeline: DayProjection[];
  entries: DraftEntry[];
  availableWorkers: Worker[];
}

interface PlanEditorProps {
  params: { id: string };
}

export default function PlanEditor({ params }: PlanEditorProps) {
  const orderId = parseInt(params.id);
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PlanPreview | null>(null);

  // Settings
  const [efficiency, setEfficiency] = useState(100);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]!);
  const [allowOvertime, setAllowOvertime] = useState(false);

  // Entries (editable)
  const [entries, setEntries] = useState<DraftEntry[]>([]);

  const fetchPreview = useCallback(async (settings?: {
    efficiency: number;
    workerIds: number[];
    startDate: string;
    allowOvertime: boolean;
  }) => {
    setGenerating(true);
    setError(null);

    try {
      const body = settings ?? {
        efficiency,
        workerIds: selectedWorkerIds,
        startDate,
        allowOvertime,
      };

      const response = await fetch(`/api/orders/${orderId}/plan/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate preview");
      }

      const data = await response.json() as PlanPreview;
      setPreview(data);
      setEntries(data.entries);

      // Initialize workers if first load
      if (!settings && data.availableWorkers.length > 0 && selectedWorkerIds.length === 0) {
        setSelectedWorkerIds(data.availableWorkers.map(w => w.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }, [orderId, efficiency, selectedWorkerIds, startDate, allowOvertime]);

  useEffect(() => {
    fetchPreview();
  }, []);

  const handleRegenerate = () => {
    fetchPreview({ efficiency, workerIds: selectedWorkerIds, startDate, allowOvertime });
  };

  const handleSaveDraft = async () => {
    if (!preview) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/plan/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          efficiency,
          workerIds: selectedWorkerIds,
          startDate,
          allowOvertime,
          entries,
          projection: {
            projectedEndDate: preview.projectedEndDate,
            projectedEndTime: preview.projectedEndTime,
            isOnTrack: preview.isOnTrack,
            idealHours: preview.idealHours,
            adjustedHours: preview.adjustedHours,
            laborCost: preview.laborCost,
            equipmentCost: preview.equipmentCost,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save draft");
      }

      alert("Draft saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!confirm("This will create the schedule. Are you sure?")) return;

    setCommitting(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/plan/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries,
          buildVersionId: preview?.buildVersionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to commit schedule");
      }

      const data = await response.json();
      setLocation(`/schedules/${data.scheduleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit schedule");
    } finally {
      setCommitting(false);
    }
  };

  const handleWorkerToggle = (workerId: number) => {
    setSelectedWorkerIds(prev =>
      prev.includes(workerId)
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const handleEntryWorkerChange = (entryId: string, workerId: number) => {
    const worker = preview?.availableWorkers.find(w => w.id === workerId);
    if (!worker) return;

    setEntries(prev => prev.map(e =>
      e.id === entryId
        ? { ...e, worker_ids: [workerId], worker_names: [worker.name] }
        : e
    ));
  };

  const handleEntryTimeChange = (entryId: string, field: "start_time" | "end_time", value: string) => {
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, [field]: value } : e
    ));
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Plan Editor</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="page">
        <h1>Plan Editor</h1>
        <div className="error-banner">{error}</div>
        <button className="btn btn-secondary" onClick={() => setLocation("/orders")}>
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          Plan: Order #{orderId} - {preview?.productName} ({preview?.orderQuantity} units)
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setLocation("/orders")}>
            Cancel
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Settings Panel */}
      <div style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: 14, color: "#475569" }}>Settings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
              Efficiency Factor (%)
            </label>
            <input
              type="number"
              min="50"
              max="200"
              value={efficiency}
              onChange={(e) => setEfficiency(parseInt(e.target.value) || 100)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <span style={{ fontSize: 11, color: "#94a3b8" }}>100% = ideal pace from product definition</span>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allowOvertime}
                onChange={(e) => setAllowOvertime(e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Allow Overtime</span>
            </label>
          </div>
        </div>

        {/* Worker Selection */}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 8 }}>
            Available Workers
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {preview?.availableWorkers.map(worker => (
              <label
                key={worker.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: selectedWorkerIds.includes(worker.id) ? "#dbeafe" : "#f1f5f9",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedWorkerIds.includes(worker.id)}
                  onChange={() => handleWorkerToggle(worker.id)}
                />
                {worker.name}
                <span style={{ color: "#94a3b8", fontSize: 11 }}>({worker.skill_category})</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={handleRegenerate}
            disabled={generating}
          >
            {generating ? "Regenerating..." : "Regenerate Plan"}
          </button>
        </div>
      </div>

      {/* Projection Summary */}
      {preview && (
        <div style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 14, color: "#475569" }}>Projection Summary</h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Projected End</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {new Date(preview.projectedEndDate).toLocaleDateString()} {preview.projectedEndTime}
              </div>
              <div style={{
                fontSize: 12,
                color: preview.isOnTrack ? "#22c55e" : "#dc2626",
                fontWeight: 500,
              }}>
                {preview.isOnTrack
                  ? (preview.daysOverUnder === 0 ? "On time" : `${Math.abs(preview.daysOverUnder)} day(s) early`)
                  : `${preview.daysOverUnder} day(s) late`
                }
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Due Date</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {new Date(preview.dueDate).toLocaleDateString()}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Total Hours</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{preview.adjustedHours.toFixed(1)}h</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Ideal: {preview.idealHours.toFixed(1)}h
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Labor Cost</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>${preview.laborCost.toFixed(2)}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Equipment Cost</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>${preview.equipmentCost.toFixed(2)}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Total Cost</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#3b82f6" }}>${preview.totalCost.toFixed(2)}</div>
            </div>
          </div>

          {/* Completion Timeline */}
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 13, color: "#475569" }}>Completion Timeline</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {preview.timeline.map((day, i) => (
                <div key={day.date} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 80, fontSize: 12, color: "#64748b" }}>
                    {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
                  </span>
                  <div style={{
                    flex: 1,
                    height: 16,
                    background: "#e2e8f0",
                    borderRadius: 4,
                    overflow: "hidden",
                    maxWidth: 300,
                  }}>
                    <div
                      style={{
                        width: `${Math.min(day.percentComplete, 100)}%`,
                        height: "100%",
                        background: day.percentComplete >= 100 ? "#22c55e" : "#3b82f6",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span style={{ width: 80, fontSize: 12, color: "#64748b" }}>
                    {day.cumulativeUnits} / {preview.orderQuantity}
                  </span>
                  <span style={{ fontSize: 11, color: day.percentComplete >= 100 ? "#22c55e" : "#94a3b8" }}>
                    {day.percentComplete}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Entries */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        marginBottom: 16,
      }}>
        <h3 style={{ margin: 0, padding: 16, fontSize: 14, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
          Schedule Entries ({entries.length})
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>Date</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>Step</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>Worker</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>Start</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>End</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, borderBottom: "1px solid #e2e8f0" }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 16px" }}>
                    {new Date(entry.date).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {entry.step_code && <span style={{ color: "#94a3b8", marginRight: 4 }}>[{entry.step_code}]</span>}
                    {entry.step_name}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <select
                      value={entry.worker_ids[0] ?? ""}
                      onChange={(e) => handleEntryWorkerChange(entry.id, parseInt(e.target.value))}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        fontSize: 12,
                        background: entry.qualified_worker_ids.length === 0 ? "#fef2f2" : "white",
                      }}
                    >
                      <option value="">Unassigned</option>
                      {preview?.availableWorkers
                        .filter(w => entry.qualified_worker_ids.length === 0 || entry.qualified_worker_ids.includes(w.id))
                        .map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <input
                      type="time"
                      value={entry.start_time}
                      onChange={(e) => handleEntryTimeChange(entry.id, "start_time", e.target.value)}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <input
                      type="time"
                      value={entry.end_time}
                      onChange={(e) => handleEntryTimeChange(entry.id, "end_time", e.target.value)}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    />
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>{entry.planned_output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
        padding: 16,
        background: "#f8fafc",
        borderRadius: 8,
        border: "1px solid #e2e8f0",
      }}>
        <button
          className="btn btn-secondary"
          onClick={handleSaveDraft}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleCommit}
          disabled={committing}
          style={{ minWidth: 150 }}
        >
          {committing ? "Committing..." : "Commit Schedule"}
        </button>
      </div>
    </div>
  );
}

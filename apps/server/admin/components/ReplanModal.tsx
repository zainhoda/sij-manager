import React, { useState, useEffect } from "react";

interface DraftScheduleEntry {
  id: string;
  product_step_id: number;
  worker_id: number | null;
  worker_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  planned_output: number;
  step_name: string;
  category: string;
  required_skill_category: "SEWING" | "OTHER";
  is_overtime: boolean;
  is_auto_suggested: boolean;
}

interface ReplanResult {
  scheduleId: number;
  orderId: number;
  productName: string;
  dueDate: string;
  totalOutput: number;
  completedOutput: number;
  remainingOutput: number;
  canMeetDeadline: boolean;
  regularHoursNeeded: number;
  overtimeHoursNeeded: number;
  draftEntries: DraftScheduleEntry[];
  overtimeSuggestions: DraftScheduleEntry[];
  availableWorkers: { id: number; name: string; skill_category: string }[];
}

interface ReplanModalProps {
  isOpen: boolean;
  scheduleId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReplanModal({ isOpen, scheduleId, onClose, onSuccess }: ReplanModalProps) {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replanData, setReplanData] = useState<ReplanResult | null>(null);
  const [draftEntries, setDraftEntries] = useState<DraftScheduleEntry[]>([]);
  const [acceptedOvertime, setAcceptedOvertime] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && scheduleId) {
      fetchReplanDraft();
    }
  }, [isOpen, scheduleId]);

  const fetchReplanDraft = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/schedules/${scheduleId}/replan`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to generate replan draft");
      }

      const data = await response.json() as ReplanResult;
      setReplanData(data);
      setDraftEntries(data.draftEntries);
      setAcceptedOvertime(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate replan");
    } finally {
      setLoading(false);
    }
  };

  const handleWorkerChange = (entryId: string, workerId: number | null, workerName: string | null) => {
    setDraftEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId ? { ...entry, worker_id: workerId, worker_name: workerName } : entry
      )
    );
  };

  const handleTimeChange = (entryId: string, field: "start_time" | "end_time", value: string) => {
    setDraftEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId ? { ...entry, [field]: value } : entry
      )
    );
  };

  const handleDeleteEntry = (entryId: string) => {
    setDraftEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  const handleToggleOvertime = (entryId: string) => {
    setAcceptedOvertime((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const handleCommit = async () => {
    if (!replanData) return;

    setCommitting(true);
    setError(null);

    try {
      // Combine draft entries with accepted overtime
      const acceptedOvertimeEntries = replanData.overtimeSuggestions.filter((e) =>
        acceptedOvertime.has(e.id)
      );
      const allEntries = [...draftEntries, ...acceptedOvertimeEntries];

      const response = await fetch(`/api/schedules/${scheduleId}/replan/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: allEntries }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to commit replan");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit replan");
    } finally {
      setCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 900, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Replan Schedule</h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors text-xl"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <p>Generating replan draft...</p>
            </div>
          )}

          {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

          {replanData && !loading && (
            <>
              {/* Summary Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Product</div>
                  <div style={{ fontWeight: 500 }}>{replanData.productName}</div>
                </div>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Completed</div>
                  <div style={{ fontWeight: 500 }}>{replanData.completedOutput} / {replanData.totalOutput}</div>
                </div>
                <div style={{ padding: 12, backgroundColor: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Remaining</div>
                  <div style={{ fontWeight: 500 }}>{replanData.remainingOutput}</div>
                </div>
                <div style={{ padding: 12, backgroundColor: replanData.canMeetDeadline ? "#f0fdf4" : "#fef2f2", borderRadius: 8, border: `1px solid ${replanData.canMeetDeadline ? "#bbf7d0" : "#fecaca"}` }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Deadline</div>
                  <div style={{ fontWeight: 500, color: replanData.canMeetDeadline ? "#16a34a" : "#dc2626" }}>
                    {replanData.canMeetDeadline ? "On Track" : "At Risk"}
                  </div>
                </div>
              </div>

              {/* Draft Entries */}
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Draft Entries ({draftEntries.length})
              </h3>
              {draftEntries.length === 0 ? (
                <p style={{ color: "#64748b", marginBottom: 24 }}>No remaining entries to schedule.</p>
              ) : (
                <div style={{ marginBottom: 24, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f8fafc" }}>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Date</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Time</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Step</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Worker</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Output</th>
                        <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "1px solid #e2e8f0", width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftEntries.map((entry) => (
                        <tr key={entry.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px 12px" }}>
                            {new Date(entry.date).toLocaleDateString()}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input
                                type="time"
                                value={entry.start_time}
                                onChange={(e) => handleTimeChange(entry.id, "start_time", e.target.value)}
                                style={{ padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12 }}
                              />
                              <span>-</span>
                              <input
                                type="time"
                                value={entry.end_time}
                                onChange={(e) => handleTimeChange(entry.id, "end_time", e.target.value)}
                                style={{ padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12 }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>{entry.step_name}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <select
                              value={entry.worker_id || ""}
                              onChange={(e) => {
                                const workerId = e.target.value ? parseInt(e.target.value) : null;
                                const worker = replanData.availableWorkers.find((w) => w.id === workerId);
                                handleWorkerChange(entry.id, workerId, worker?.name || null);
                              }}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12, minWidth: 120 }}
                            >
                              <option value="">Unassigned</option>
                              {replanData.availableWorkers
                                .filter((w) => w.skill_category === entry.required_skill_category)
                                .map((worker) => (
                                  <option key={worker.id} value={worker.id}>
                                    {worker.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td style={{ padding: "10px 12px" }}>{entry.planned_output}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              style={{
                                padding: "4px 8px",
                                backgroundColor: "#fee2e2",
                                color: "#dc2626",
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Overtime Suggestions */}
              {replanData.overtimeSuggestions.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#f59e0b" }}>
                    Overtime Suggestions ({replanData.overtimeSuggestions.length})
                  </h3>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                    These overtime slots can help meet the deadline. Check the ones you want to include.
                  </p>
                  <div style={{ marginBottom: 24, border: "1px solid #fcd34d", borderRadius: 8, overflow: "hidden", backgroundColor: "#fffbeb" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: "#fef3c7" }}>
                          <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "1px solid #fcd34d", width: 40 }}>
                            <input
                              type="checkbox"
                              checked={acceptedOvertime.size === replanData.overtimeSuggestions.length}
                              onChange={() => {
                                if (acceptedOvertime.size === replanData.overtimeSuggestions.length) {
                                  setAcceptedOvertime(new Set());
                                } else {
                                  setAcceptedOvertime(new Set(replanData.overtimeSuggestions.map((e) => e.id)));
                                }
                              }}
                            />
                          </th>
                          <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fcd34d" }}>Date</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fcd34d" }}>Time</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fcd34d" }}>Step</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fcd34d" }}>Worker</th>
                          <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #fcd34d" }}>Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replanData.overtimeSuggestions.map((entry) => (
                          <tr key={entry.id} style={{ borderBottom: "1px solid #fcd34d" }}>
                            <td style={{ padding: "10px 12px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={acceptedOvertime.has(entry.id)}
                                onChange={() => handleToggleOvertime(entry.id)}
                              />
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {new Date(entry.date).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              {entry.start_time} - {entry.end_time}
                            </td>
                            <td style={{ padding: "10px 12px" }}>{entry.step_name}</td>
                            <td style={{ padding: "10px 12px" }}>{entry.worker_name || "Unassigned"}</td>
                            <td style={{ padding: "10px 12px" }}>{entry.planned_output}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <button
            type="button"
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            onClick={onClose}
            disabled={committing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            onClick={handleCommit}
            disabled={loading || committing || !replanData}
          >
            {committing ? "Committing..." : "Commit Replan"}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Trash2,
  Save,
  X,
  AlertCircle,
  Sun,
} from "lucide-react";

// Work day ends at 15:30 - anything after is overtime
const REGULAR_DAY_END = "15:30";

const isOvertimeTask = (startTime: string, endTime: string): boolean => {
  return startTime >= REGULAR_DAY_END || endTime > REGULAR_DAY_END;
};

interface ScheduleTask {
  demandEntryId: number;
  batchNumber: number;
  batchQuantity: number;
  bomStepId: number;
  stepName: string;
  date: string;
  startTime: string;
  endTime: string;
  plannedOutput: number;
  workerIds: number[];
  assignmentReason: string;
  constraints: { type: string; description: string }[];
}

interface ScheduleWithContext {
  scenario: {
    id: number;
    name: string;
    strategy: string;
  };
  schedule: ScheduleTask[];
  workers: { id: number; name: string; status: string; workCategoryId: number | null }[];
  demandEntries: { id: number; bomNum: string; customerName: string | null; quantity: number; dueDate: string }[];
  bomSteps: { id: number; name: string; equipmentId: number | null; workCategoryId: number | null }[];
  certifications: { workerId: number; equipmentId: number }[];
}

interface ValidationResult {
  valid: boolean;
  errors: { taskIndex: number; field: string; message: string }[];
  warnings: { taskIndex: number; message: string }[];
}

interface ScheduleEditModalProps {
  isOpen: boolean;
  scenarioId: number;
  parentScenarioName: string;
  onClose: () => void;
  onSaved: (newScenarioId: number) => void;
}

export default function ScheduleEditModal({
  isOpen,
  scenarioId,
  parentScenarioName,
  onClose,
  onSaved,
}: ScheduleEditModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScheduleWithContext | null>(null);
  const [draftSchedule, setDraftSchedule] = useState<ScheduleTask[]>([]);
  const [modifiedIndices, setModifiedIndices] = useState<Set<number>>(new Set());
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [scenarioName, setScenarioName] = useState("");

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/planning/scenarios/${scenarioId}/schedule`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch schedule");
      }
      const scheduleData = await response.json() as ScheduleWithContext;
      setData(scheduleData);
      setDraftSchedule(JSON.parse(JSON.stringify(scheduleData.schedule))); // Deep copy
      setScenarioName(`Custom (from ${scheduleData.scenario.name})`);
      setModifiedIndices(new Set());
      setValidation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schedule");
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    if (isOpen && scenarioId) {
      fetchSchedule();
    }
  }, [isOpen, scenarioId, fetchSchedule]);

  const validateSchedule = useCallback(async () => {
    if (!data) return;

    try {
      const response = await fetch(`/api/planning/scenarios/${scenarioId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: draftSchedule }),
      });
      const result = await response.json() as ValidationResult;
      setValidation(result);
    } catch (err) {
      console.error("Validation error:", err);
    }
  }, [scenarioId, draftSchedule, data]);

  // Validate whenever schedule changes
  useEffect(() => {
    if (data && draftSchedule.length > 0) {
      const timer = setTimeout(validateSchedule, 500);
      return () => clearTimeout(timer);
    }
  }, [draftSchedule, validateSchedule, data]);

  const handleTimeChange = (index: number, field: "startTime" | "endTime", value: string) => {
    setDraftSchedule((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, [field]: value };
      return updated;
    });
    setModifiedIndices((prev) => new Set([...prev, index]));
  };

  const handleWorkerChange = (index: number, workerId: number | null) => {
    setDraftSchedule((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index]!,
        workerIds: workerId ? [workerId] : [],
        assignmentReason: workerId ? "Manually assigned" : "Unassigned",
      };
      return updated;
    });
    setModifiedIndices((prev) => new Set([...prev, index]));
  };

  const handleOutputChange = (index: number, value: number) => {
    setDraftSchedule((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index]!, plannedOutput: value };
      return updated;
    });
    setModifiedIndices((prev) => new Set([...prev, index]));
  };

  const handleRemoveTask = (index: number) => {
    setDraftSchedule((prev) => prev.filter((_, i) => i !== index));
    // Recalculate modified indices
    setModifiedIndices((prev) => {
      const newSet = new Set<number>();
      for (const i of prev) {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!data) return;

    // Check for blocking errors
    if (validation && !validation.valid) {
      setError("Please fix all errors before saving");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/planning/scenarios/${scenarioId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scenarioName,
          schedule: draftSchedule,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save scenario");
      }

      const result = await response.json();
      onSaved(result.scenario.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scenario");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

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

  // Build lookups
  const workerNames = new Map<number, string>();
  const activeWorkers: { id: number; name: string }[] = [];
  if (data) {
    for (const worker of data.workers) {
      workerNames.set(worker.id, worker.name);
      if (worker.status === "active") {
        activeWorkers.push({ id: worker.id, name: worker.name });
      }
    }
  }

  const demandLookup = new Map<number, { bomNum: string; customerName: string | null }>();
  if (data) {
    for (const entry of data.demandEntries) {
      demandLookup.set(entry.id, { bomNum: entry.bomNum, customerName: entry.customerName });
    }
  }

  // Build certification lookup for filtering workers
  const certifiedWorkers = new Map<number, Set<number>>(); // equipmentId -> Set<workerId>
  if (data) {
    for (const cert of data.certifications) {
      if (!certifiedWorkers.has(cert.equipmentId)) {
        certifiedWorkers.set(cert.equipmentId, new Set());
      }
      certifiedWorkers.get(cert.equipmentId)!.add(cert.workerId);
    }
  }

  // Get qualified workers for a step
  const getQualifiedWorkers = (bomStepId: number) => {
    if (!data) return activeWorkers;
    const step = data.bomSteps.find((s) => s.id === bomStepId);
    if (!step || !step.equipmentId) return activeWorkers;

    const certified = certifiedWorkers.get(step.equipmentId);
    if (!certified) return [];

    return activeWorkers.filter((w) => certified.has(w.id));
  };

  // Group tasks by date
  const tasksByDate = new Map<string, { task: ScheduleTask; originalIndex: number }[]>();
  draftSchedule.forEach((task, index) => {
    if (!tasksByDate.has(task.date)) {
      tasksByDate.set(task.date, []);
    }
    tasksByDate.get(task.date)!.push({ task, originalIndex: index });
  });
  // Sort by start time
  for (const tasks of tasksByDate.values()) {
    tasks.sort((a, b) => a.task.startTime.localeCompare(b.task.startTime));
  }

  const sortedDates = [...tasksByDate.keys()].sort();

  // Get errors/warnings for a specific task
  const getTaskErrors = (index: number) => {
    if (!validation) return [];
    return validation.errors.filter((e) => e.taskIndex === index);
  };

  const getTaskWarnings = (index: number) => {
    if (!validation) return [];
    return validation.warnings.filter((w) => w.taskIndex === index);
  };

  const hasChanges = modifiedIndices.size > 0 || draftSchedule.length !== data?.schedule.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 1100, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Edit Schedule</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>Based on: {parentScenarioName}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "none",
              background: "#f1f5f9",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <p style={{ color: "#64748b" }}>Loading schedule...</p>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Scenario Name Input */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>
                  New Scenario Name
                </label>
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: 400,
                    padding: "8px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </div>

              {/* Validation Summary */}
              {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
                <div style={{ marginBottom: 16 }}>
                  {validation.errors.length > 0 && (
                    <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#991b1b", fontWeight: 500, marginBottom: 4 }}>
                        <AlertTriangle size={16} />
                        {validation.errors.length} error(s) - must fix before saving
                      </div>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div style={{ padding: 12, background: "#fef3c7", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#92400e", fontWeight: 500 }}>
                        <AlertCircle size={16} />
                        {validation.warnings.length} warning(s)
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Schedule Table */}
              {draftSchedule.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, color: "#64748b" }}>
                  All tasks have been removed
                </div>
              ) : (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, width: 180 }}>Time</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>Step</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>BOM</th>
                        <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0", fontWeight: 600, width: 160 }}>Worker</th>
                        <th style={{ padding: "10px 12px", textAlign: "right", borderBottom: "1px solid #e2e8f0", fontWeight: 600, width: 80 }}>Qty</th>
                        <th style={{ padding: "10px 12px", textAlign: "center", borderBottom: "1px solid #e2e8f0", fontWeight: 600, width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDates.map((date) => (
                        <React.Fragment key={date}>
                          {/* Date Header Row */}
                          <tr style={{ background: "#f1f5f9" }}>
                            <td colSpan={6} style={{ padding: "8px 12px", fontWeight: 600, color: "#475569" }}>
                              {formatDate(date)}
                            </td>
                          </tr>
                          {/* Tasks for this date */}
                          {tasksByDate.get(date)!.map(({ task, originalIndex }) => {
                            const demand = demandLookup.get(task.demandEntryId);
                            const isModified = modifiedIndices.has(originalIndex);
                            const errors = getTaskErrors(originalIndex);
                            const warnings = getTaskWarnings(originalIndex);
                            const hasError = errors.length > 0;
                            const hasWarning = warnings.length > 0;
                            const qualifiedWorkers = getQualifiedWorkers(task.bomStepId);
                            const isOvertime = isOvertimeTask(task.startTime, task.endTime);

                            return (
                              <tr
                                key={originalIndex}
                                style={{
                                  borderBottom: "1px solid #e2e8f0",
                                  background: hasError ? "#fef2f2" : hasWarning ? "#fffbeb" : isModified ? "#f0fdf4" : isOvertime ? "#fffbeb" : "white",
                                }}
                              >
                                <td style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <input
                                      type="time"
                                      value={task.startTime}
                                      onChange={(e) => handleTimeChange(originalIndex, "startTime", e.target.value)}
                                      style={{
                                        padding: "4px 6px",
                                        border: `1px solid ${hasError ? "#fca5a5" : "#e2e8f0"}`,
                                        borderRadius: 4,
                                        fontSize: 12,
                                        width: 80,
                                      }}
                                    />
                                    <span>-</span>
                                    <input
                                      type="time"
                                      value={task.endTime}
                                      onChange={(e) => handleTimeChange(originalIndex, "endTime", e.target.value)}
                                      style={{
                                        padding: "4px 6px",
                                        border: `1px solid ${hasError ? "#fca5a5" : "#e2e8f0"}`,
                                        borderRadius: 4,
                                        fontSize: 12,
                                        width: 80,
                                      }}
                                    />
                                    {isOvertime && (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 3,
                                          padding: "2px 6px",
                                          background: "#fef3c7",
                                          color: "#b45309",
                                          borderRadius: 4,
                                          fontSize: 10,
                                          fontWeight: 600,
                                        }}
                                        title="Overtime: after 3:30 PM"
                                      >
                                        <Sun size={10} />
                                        OT
                                      </span>
                                    )}
                                  </div>
                                  {errors.filter(e => e.field === "startTime" || e.field === "endTime").map((e, i) => (
                                    <div key={i} style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{e.message}</div>
                                  ))}
                                </td>
                                <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                                  {task.stepName}
                                  <div style={{ fontSize: 11, color: "#64748b" }}>
                                    Batch #{task.batchNumber}
                                  </div>
                                </td>
                                <td style={{ padding: "10px 12px" }}>
                                  <div style={{ fontFamily: "monospace", fontSize: 12 }}>{demand?.bomNum || "-"}</div>
                                  {demand?.customerName && (
                                    <div style={{ fontSize: 11, color: "#64748b" }}>{demand.customerName}</div>
                                  )}
                                </td>
                                <td style={{ padding: "10px 12px" }}>
                                  <select
                                    value={task.workerIds[0] || ""}
                                    onChange={(e) => handleWorkerChange(originalIndex, e.target.value ? parseInt(e.target.value) : null)}
                                    style={{
                                      padding: "4px 8px",
                                      border: `1px solid ${errors.some(e => e.field === "workerIds") ? "#fca5a5" : "#e2e8f0"}`,
                                      borderRadius: 4,
                                      fontSize: 12,
                                      width: "100%",
                                    }}
                                  >
                                    <option value="">Unassigned</option>
                                    {qualifiedWorkers.map((worker) => (
                                      <option key={worker.id} value={worker.id}>
                                        {worker.name}
                                      </option>
                                    ))}
                                  </select>
                                  {errors.filter(e => e.field === "workerIds").map((e, i) => (
                                    <div key={i} style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{e.message}</div>
                                  ))}
                                  {warnings.map((w, i) => (
                                    <div key={i} style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>{w.message}</div>
                                  ))}
                                </td>
                                <td style={{ padding: "10px 12px" }}>
                                  <input
                                    type="number"
                                    min="1"
                                    value={task.plannedOutput}
                                    onChange={(e) => handleOutputChange(originalIndex, parseInt(e.target.value) || 1)}
                                    style={{
                                      padding: "4px 6px",
                                      border: `1px solid ${errors.some(e => e.field === "plannedOutput") ? "#fca5a5" : "#e2e8f0"}`,
                                      borderRadius: 4,
                                      fontSize: 12,
                                      width: 60,
                                      textAlign: "right",
                                    }}
                                  />
                                  {errors.filter(e => e.field === "plannedOutput").map((e, i) => (
                                    <div key={i} style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{e.message}</div>
                                  ))}
                                </td>
                                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                  <button
                                    onClick={() => handleRemoveTask(originalIndex)}
                                    style={{
                                      padding: "4px 8px",
                                      backgroundColor: "#fee2e2",
                                      color: "#dc2626",
                                      border: "none",
                                      borderRadius: 4,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                    title="Remove task"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {hasChanges ? (
              <span style={{ color: "#059669" }}>
                {modifiedIndices.size} task(s) modified
                {draftSchedule.length !== data?.schedule.length && `, ${(data?.schedule.length || 0) - draftSchedule.length} removed`}
              </span>
            ) : (
              "No changes made"
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !hasChanges || (validation && !validation.valid)}
            >
              <Save size={14} style={{ marginRight: 6 }} />
              {saving ? "Saving..." : "Save as New Scenario"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

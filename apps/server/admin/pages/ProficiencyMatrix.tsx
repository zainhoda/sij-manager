import React, { useState, useEffect, useCallback, useMemo } from "react";

interface MatrixWorker {
  id: number;
  name: string;
  employee_id: string | null;
  status: "active" | "inactive" | "on_leave";
}

interface MatrixStep {
  id: number;
  name: string;
  sequence: number;
  product_id: number;
  product_name: string;
}

interface ProficiencyRecord {
  id: number;
  worker_id: number;
  product_step_id: number;
  level: number;
}

interface Product {
  id: number;
  name: string;
}

interface ProficiencyCell {
  proficiencyId: number | null;
  level: number;
}

type StatusFilter = "all" | "active" | "inactive" | "on_leave";

const LEVEL_COLORS: Record<number, string> = {
  1: "#fee2e2", // red-100
  2: "#fed7aa", // orange-200
  3: "#fef08a", // yellow-200
  4: "#bbf7d0", // green-200
  5: "#86efac", // green-300
};

const LEVEL_TEXT_COLORS: Record<number, string> = {
  1: "#dc2626", // red-600
  2: "#ea580c", // orange-600
  3: "#ca8a04", // yellow-600
  4: "#16a34a", // green-600
  5: "#15803d", // green-700
};

const LEVEL_LABELS: Record<number, string> = {
  1: "Novice",
  2: "Learning",
  3: "Standard",
  4: "Proficient",
  5: "Expert",
};

export default function ProficiencyMatrix() {
  const [workers, setWorkers] = useState<MatrixWorker[]>([]);
  const [steps, setSteps] = useState<MatrixStep[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [proficiencies, setProficiencies] = useState<Map<string, ProficiencyCell>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [productFilter, setProductFilter] = useState<number | "all">("all");
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const fetchMatrixData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (productFilter !== "all") {
        params.set("product_id", String(productFilter));
      }
      const response = await fetch(`/api/proficiencies/matrix?${params}`);
      const data = await response.json();

      const profMap = new Map<string, ProficiencyCell>();
      for (const prof of data.proficiencies as ProficiencyRecord[]) {
        const key = `${prof.worker_id}-${prof.product_step_id}`;
        profMap.set(key, { proficiencyId: prof.id, level: prof.level });
      }

      setWorkers(data.workers);
      setSteps(data.steps);
      setProducts(data.products);
      setProficiencies(profMap);
    } catch (err) {
      console.error("Failed to load matrix data:", err);
    } finally {
      setLoading(false);
    }
  }, [productFilter]);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  const filteredWorkers = useMemo(() => {
    if (statusFilter === "all") return workers;
    return workers.filter((w) => w.status === statusFilter);
  }, [workers, statusFilter]);

  const handleLevelChange = useCallback(
    async (workerId: number, stepId: number, newLevel: number) => {
      const key = `${workerId}-${stepId}`;
      const current = proficiencies.get(key);

      if (pendingUpdates.has(key)) return;
      setPendingUpdates((prev) => new Set(prev).add(key));

      // Optimistic update
      setProficiencies((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, { proficiencyId: current?.proficiencyId ?? null, level: newLevel });
        return newMap;
      });

      try {
        const response = await fetch("/api/proficiencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worker_id: workerId,
            product_step_id: stepId,
            level: newLevel,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        setProficiencies((prev) => {
          const newMap = new Map(prev);
          newMap.set(key, { proficiencyId: data.id, level: data.level });
          return newMap;
        });
      } catch (err) {
        console.error("Proficiency update failed:", err);
        // Rollback
        setProficiencies((prev) => {
          const newMap = new Map(prev);
          if (current) {
            newMap.set(key, current);
          } else {
            newMap.delete(key);
          }
          return newMap;
        });
      } finally {
        setPendingUpdates((prev) => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
        setEditingCell(null);
      }
    },
    [proficiencies, pendingUpdates]
  );

  const statusCounts = useMemo(() => {
    const counts = { all: workers.length, active: 0, inactive: 0, on_leave: 0 };
    for (const w of workers) {
      counts[w.status]++;
    }
    return counts;
  }, [workers]);

  // Group steps by product for visual separation
  const stepsByProduct = useMemo(() => {
    const grouped: { product: string; steps: MatrixStep[] }[] = [];
    let currentProduct = "";
    let currentGroup: MatrixStep[] = [];

    for (const step of steps) {
      if (step.product_name !== currentProduct) {
        if (currentGroup.length > 0) {
          grouped.push({ product: currentProduct, steps: currentGroup });
        }
        currentProduct = step.product_name;
        currentGroup = [step];
      } else {
        currentGroup.push(step);
      }
    }
    if (currentGroup.length > 0) {
      grouped.push({ product: currentProduct, steps: currentGroup });
    }
    return grouped;
  }, [steps]);

  if (loading) {
    return (
      <div className="page">
        <h1>Proficiency Matrix</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Proficiency Matrix</h1>
      <p className="text-slate-500 mb-4">
        Click any cell to set a worker's proficiency level (1-5) for a step
      </p>

      <div className="matrix-toolbar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="filter-select"
        >
          <option value="all">All Workers ({statusCounts.all})</option>
          <option value="active">Active ({statusCounts.active})</option>
          <option value="inactive">Inactive ({statusCounts.inactive})</option>
          <option value="on_leave">On Leave ({statusCounts.on_leave})</option>
        </select>

        <select
          value={productFilter === "all" ? "all" : String(productFilter)}
          onChange={(e) =>
            setProductFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))
          }
          className="filter-select"
        >
          <option value="all">All Products ({steps.length} steps)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <span className="matrix-summary">
          {steps.length} steps × {filteredWorkers.length} workers
        </span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-sm">
        {[1, 2, 3, 4, 5].map((level) => (
          <div key={level} className="flex items-center gap-2">
            <div
              style={{
                width: 24,
                height: 24,
                backgroundColor: LEVEL_COLORS[level],
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                color: LEVEL_TEXT_COLORS[level],
                fontSize: 12,
              }}
            >
              {level}
            </div>
            <span className="text-slate-600">{LEVEL_LABELS[level]}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-4">
          <div
            style={{
              width: 24,
              height: 24,
              backgroundColor: "#f1f5f9",
              borderRadius: 4,
              border: "1px dashed #cbd5e1",
            }}
          />
          <span className="text-slate-500">Default (3)</span>
        </div>
      </div>

      <div className="matrix-container">
        <table className="certification-matrix">
          <thead>
            <tr>
              <th className="row-label-header">Worker</th>
              {stepsByProduct.map((group) =>
                group.steps.map((step, idx) => (
                  <th
                    key={step.id}
                    className="col-header"
                    title={`${step.name} (${group.product})`}
                    style={{
                      borderLeft: idx === 0 ? "2px solid #cbd5e1" : undefined,
                      fontSize: 11,
                    }}
                  >
                    <div className="truncate max-w-[80px]">{step.name}</div>
                    {idx === 0 && (
                      <div className="text-[10px] text-slate-400 truncate">{group.product}</div>
                    )}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {filteredWorkers.map((worker) => (
              <tr key={worker.id}>
                <td className="row-label" title={worker.name}>
                  {worker.name}
                </td>
                {stepsByProduct.map((group) =>
                  group.steps.map((step, idx) => {
                    const key = `${worker.id}-${step.id}`;
                    const cell = proficiencies.get(key);
                    const level = cell?.level ?? 3;
                    const isPending = pendingUpdates.has(key);
                    const isEditing = editingCell === key;
                    const hasExplicitValue = !!cell;

                    return (
                      <td
                        key={key}
                        className={`cert-cell ${isPending ? "pending" : ""}`}
                        style={{
                          backgroundColor: hasExplicitValue ? LEVEL_COLORS[level] : "#f8fafc",
                          borderLeft: idx === 0 ? "2px solid #cbd5e1" : undefined,
                          cursor: "pointer",
                          position: "relative",
                        }}
                        onClick={() => !isPending && setEditingCell(key)}
                      >
                        {isPending ? (
                          "..."
                        ) : isEditing ? (
                          <select
                            autoFocus
                            value={level}
                            onChange={(e) =>
                              handleLevelChange(worker.id, step.id, parseInt(e.target.value))
                            }
                            onBlur={() => setEditingCell(null)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              border: "2px solid #3b82f6",
                              borderRadius: 0,
                              backgroundColor: "white",
                              fontSize: 12,
                              textAlign: "center",
                              cursor: "pointer",
                            }}
                          >
                            {[1, 2, 3, 4, 5].map((l) => (
                              <option key={l} value={l}>
                                {l} - {LEVEL_LABELS[l]}
                              </option>
                            ))}
                          </select>
                        ) : hasExplicitValue ? (
                          <span
                            style={{
                              fontWeight: 600,
                              color: LEVEL_TEXT_COLORS[level],
                              fontSize: 12,
                            }}
                          >
                            {level}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>-</span>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

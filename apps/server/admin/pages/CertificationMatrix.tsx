import React, { useState, useEffect, useCallback, useMemo } from "react";

interface MatrixWorker {
  id: number;
  name: string;
  employee_id: string | null;
  status: "active" | "inactive" | "on_leave";
}

interface MatrixEquipment {
  id: number;
  name: string;
  description: string | null;
}

interface CertificationRecord {
  id: number;
  worker_id: number;
  equipment_id: number;
}

interface CertificationCell {
  certificationId: number | null;
  certified: boolean;
}

type StatusFilter = "all" | "active" | "inactive" | "on_leave";
type LayoutMode = "equipment-rows" | "worker-rows";

export default function CertificationMatrix() {
  const [workers, setWorkers] = useState<MatrixWorker[]>([]);
  const [equipment, setEquipment] = useState<MatrixEquipment[]>([]);
  const [certifications, setCertifications] = useState<Map<string, CertificationCell>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [layout, setLayout] = useState<LayoutMode>("equipment-rows");
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());

  const fetchMatrixData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/certifications/matrix");
      const data = await response.json();

      const certMap = new Map<string, CertificationCell>();
      for (const cert of data.certifications as CertificationRecord[]) {
        const key = `${cert.worker_id}-${cert.equipment_id}`;
        certMap.set(key, { certificationId: cert.id, certified: true });
      }

      setWorkers(data.workers);
      setEquipment(data.equipment);
      setCertifications(certMap);
    } catch (err) {
      console.error("Failed to load matrix data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  const filteredWorkers = useMemo(() => {
    if (statusFilter === "all") return workers;
    return workers.filter((w) => w.status === statusFilter);
  }, [workers, statusFilter]);

  const handleCellToggle = useCallback(
    async (workerId: number, equipmentId: number) => {
      const key = `${workerId}-${equipmentId}`;
      const current = certifications.get(key);

      if (pendingUpdates.has(key)) return;
      setPendingUpdates((prev) => new Set(prev).add(key));

      const newCertified = !current?.certified;

      // Optimistic update
      setCertifications((prev) => {
        const newMap = new Map(prev);
        if (newCertified) {
          newMap.set(key, { certificationId: null, certified: true });
        } else {
          newMap.delete(key);
        }
        return newMap;
      });

      try {
        if (newCertified) {
          const response = await fetch("/api/certifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ worker_id: workerId, equipment_id: equipmentId }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);

          setCertifications((prev) => {
            const newMap = new Map(prev);
            newMap.set(key, { certificationId: data.id, certified: true });
            return newMap;
          });
        } else {
          const certId = current?.certificationId;
          if (certId) {
            const response = await fetch(`/api/certifications/${certId}`, {
              method: "DELETE",
            });
            if (!response.ok) throw new Error("Failed to revoke");
          }
        }
      } catch (err) {
        console.error("Certification update failed:", err);
        // Rollback
        setCertifications((prev) => {
          const newMap = new Map(prev);
          if (current?.certified) {
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
      }
    },
    [certifications, pendingUpdates]
  );

  const statusCounts = useMemo(() => {
    const counts = { all: workers.length, active: 0, inactive: 0, on_leave: 0 };
    for (const w of workers) {
      counts[w.status]++;
    }
    return counts;
  }, [workers]);

  if (loading) {
    return (
      <div className="page">
        <h1>Certification Matrix</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Certification Matrix</h1>

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

        <button
          className="btn btn-secondary"
          onClick={() => setLayout((l) => (l === "equipment-rows" ? "worker-rows" : "equipment-rows"))}
        >
          {layout === "equipment-rows" ? "Switch to Worker Rows" : "Switch to Equipment Rows"}
        </button>

        <span className="matrix-summary">
          {equipment.length} equipment × {filteredWorkers.length} workers
        </span>
      </div>

      <div className="matrix-container">
        {layout === "equipment-rows" ? (
          <table className="certification-matrix">
            <thead>
              <tr>
                <th className="row-label-header">Equipment</th>
                {filteredWorkers.map((worker) => (
                  <th key={worker.id} className="col-header" title={worker.name}>
                    {worker.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipment.map((eq) => (
                <tr key={eq.id}>
                  <td className="row-label" title={eq.description || eq.name}>
                    {eq.name}
                  </td>
                  {filteredWorkers.map((worker) => {
                    const key = `${worker.id}-${eq.id}`;
                    const cell = certifications.get(key);
                    const isPending = pendingUpdates.has(key);
                    return (
                      <td
                        key={key}
                        className={`cert-cell ${cell?.certified ? "certified" : ""} ${isPending ? "pending" : ""}`}
                        onClick={() => handleCellToggle(worker.id, eq.id)}
                      >
                        {isPending ? "..." : cell?.certified ? "✓" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="certification-matrix">
            <thead>
              <tr>
                <th className="row-label-header">Worker</th>
                {equipment.map((eq) => (
                  <th key={eq.id} className="col-header" title={eq.description || eq.name}>
                    {eq.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.map((worker) => (
                <tr key={worker.id}>
                  <td className="row-label" title={worker.name}>
                    {worker.name}
                  </td>
                  {equipment.map((eq) => {
                    const key = `${worker.id}-${eq.id}`;
                    const cell = certifications.get(key);
                    const isPending = pendingUpdates.has(key);
                    return (
                      <td
                        key={key}
                        className={`cert-cell ${cell?.certified ? "certified" : ""} ${isPending ? "pending" : ""}`}
                        onClick={() => handleCellToggle(worker.id, eq.id)}
                      >
                        {isPending ? "..." : cell?.certified ? "✓" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

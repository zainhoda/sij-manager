import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { RefreshCw, AlertCircle, CheckCircle, Search, Settings, Clock } from "lucide-react";

interface FishbowlBOM {
  id: number;
  num: string;
  description: string | null;
  revision: string | null;
  activeFlag: number;
}

interface FishbowlStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

interface StepCount {
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  step_count: number;
  total_time_seconds: number;
}

export default function FishbowlBOMs() {
  const [status, setStatus] = useState<FishbowlStatus | null>(null);
  const [boms, setBoms] = useState<FishbowlBOM[]>([]);
  const [stepCounts, setStepCounts] = useState<Map<number, StepCount>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/fishbowl/status");
      const data = await response.json();
      setStatus(data);
      return data.connected;
    } catch (error) {
      console.error("Failed to fetch Fishbowl status:", error);
      setStatus({ configured: false, connected: false, message: "Failed to check connection" });
      return false;
    }
  }, []);

  const fetchBOMs = useCallback(async () => {
    if (!status?.connected) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      if (search) params.set("search", search);
      if (activeOnly) params.set("active", "true");

      const response = await fetch(`/api/fishbowl/boms?${params}`);
      const data = await response.json();
      setBoms(data.boms || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch BOMs:", error);
    } finally {
      setLoading(false);
    }
  }, [status?.connected, search, activeOnly, page]);

  const fetchStepCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/bom-steps/counts");
      const data = await response.json();
      const countsMap = new Map<number, StepCount>();
      for (const count of data.counts || []) {
        countsMap.set(count.fishbowl_bom_id, count);
      }
      setStepCounts(countsMap);
    } catch (error) {
      console.error("Failed to fetch step counts:", error);
    }
  }, []);

  useEffect(() => {
    fetchStatus().then((connected) => {
      if (connected) {
        fetchBOMs();
        fetchStepCounts();
      } else {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (status?.connected) {
      fetchBOMs();
    }
  }, [fetchBOMs, status?.connected]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchBOMs();
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  // Not configured state
  if (status && !status.configured) {
    return (
      <div className="page">
        <h1>Fishbowl BOMs</h1>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Fishbowl Not Configured</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            Fishbowl connection is not configured. Set the following environment variables:
          </p>
          <code style={{ display: "block", background: "#f1f5f9", padding: 16, borderRadius: 8, textAlign: "left" }}>
            FISHBOWL_HOST=your-host.myfishbowl.com<br />
            FISHBOWL_PORT=4320<br />
            FISHBOWL_DATABASE=your_database<br />
            FISHBOWL_USER=your_user<br />
            FISHBOWL_PASSWORD=your_password
          </code>
        </div>
      </div>
    );
  }

  // Not connected state
  if (status && !status.connected) {
    return (
      <div className="page">
        <h1>Fishbowl BOMs</h1>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#f59e0b", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Connection Failed</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            {status.message || "Could not connect to Fishbowl database"}
          </p>
          <button className="btn btn-primary" onClick={() => fetchStatus()}>
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const bomsWithSteps = stepCounts.size;
  const totalSteps = Array.from(stepCounts.values()).reduce((sum, c) => sum + Number(c.step_count), 0);

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Fishbowl BOMs</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            Browse Bills of Materials and configure labor steps for planning
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle size={16} style={{ color: "#22c55e" }} />
          <span style={{ color: "#22c55e", fontSize: 14 }}>Connected</span>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{total}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Total BOMs</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{bomsWithSteps}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>BOMs with Steps</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{totalSteps}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Total Steps Defined</div>
        </div>
      </div>

      {/* Search and filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search BOMs by number or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPage(0);
              }}
            />
            <span style={{ fontSize: 14 }}>Active only</span>
          </label>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          <button type="button" className="btn btn-secondary" onClick={fetchBOMs}>
            <RefreshCw size={16} />
          </button>
        </form>
      </div>

      {/* Results */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Loading BOMs...</p>
        </div>
      ) : boms.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>No BOMs found</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>BOM Number</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Description</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Revision</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Labor Steps</th>
                  <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 13 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {boms.map((bom) => {
                  const stepCount = stepCounts.get(bom.id);
                  return (
                    <tr key={bom.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontFamily: "monospace" }}>{bom.num}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, color: "#475569" }}>
                        {bom.description || <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 14 }}>
                        {bom.revision || <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 500,
                            background: bom.activeFlag ? "#dcfce7" : "#fef2f2",
                            color: bom.activeFlag ? "#166534" : "#991b1b",
                          }}
                        >
                          {bom.activeFlag ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        {stepCount ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 500,
                              background: "#dbeafe",
                              color: "#1e40af",
                            }}>
                              {stepCount.step_count} steps
                            </span>
                            <span style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 2 }}>
                              <Clock size={12} />
                              {formatTime(Number(stepCount.total_time_seconds))}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>Not configured</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <Link
                          href={`/bom-steps?bom=${bom.id}&bomNum=${encodeURIComponent(bom.num)}`}
                          className="btn btn-secondary"
                          style={{ padding: "4px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                        >
                          <Settings size={12} />
                          {stepCount ? "Edit Steps" : "Configure Steps"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span style={{ color: "#64748b", fontSize: 14 }}>
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total} BOMs
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= total}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

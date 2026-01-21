import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { RefreshCw, Download, AlertCircle, CheckCircle, Search, ArrowRight } from "lucide-react";

interface FishbowlSO {
  id: number;
  num: string;
  customerName: string | null;
  statusId: number;
  dateIssued: string | null;
  totalPrice: number | null;
}

interface FishbowlSOItem {
  id: number;
  productNum: string;
  productDescription: string;
  qtyOrdered: number;
  qtyFulfilled: number;
  unitPrice: number;
  dateScheduledFulfillment: string | null;
}

interface FishbowlStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

export default function FishbowlOrders() {
  const [status, setStatus] = useState<FishbowlStatus | null>(null);
  const [salesOrders, setSalesOrders] = useState<FishbowlSO[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "fulfilled" | "all">("open");
  const [selectedSO, setSelectedSO] = useState<number | null>(null);
  const [soDetails, setSODetails] = useState<{ so: FishbowlSO; items: FishbowlSOItem[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

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

  const fetchSalesOrders = useCallback(async () => {
    if (!status?.connected) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/fishbowl/sales-orders?status=${statusFilter}`);
      const data = await response.json();
      setSalesOrders(data.orders || []);
    } catch (error) {
      console.error("Failed to fetch sales orders:", error);
    } finally {
      setLoading(false);
    }
  }, [status?.connected, statusFilter]);

  const fetchSODetails = async (soId: number) => {
    setLoadingDetails(true);
    setSelectedSO(soId);
    try {
      const response = await fetch(`/api/fishbowl/sales-orders/${soId}`);
      const data = await response.json();
      setSODetails(data);
    } catch (error) {
      console.error("Failed to fetch SO details:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchStatus().then((connected) => {
      if (connected) {
        fetchSalesOrders();
      } else {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (status?.connected) {
      fetchSalesOrders();
    }
  }, [fetchSalesOrders, status?.connected]);

  const handleSyncAllToDemand = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch("/api/demand/sync/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_filter: statusFilter }),
      });
      const data = await response.json();
      setSyncResult({
        created: data.created || 0,
        skipped: data.skipped || 0,
        errors: data.errors || [],
      });
    } catch (error) {
      console.error("Failed to sync:", error);
      setSyncResult({ created: 0, skipped: 0, errors: ["Failed to sync sales orders"] });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncSOToDemand = async (soId: number) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch(`/api/demand/sync/sales-order/${soId}`, {
        method: "POST",
      });
      const data = await response.json();
      setSyncResult({
        created: data.created || 0,
        skipped: data.skipped || 0,
        errors: data.errors || [],
      });
    } catch (error) {
      console.error("Failed to sync SO:", error);
      setSyncResult({ created: 0, skipped: 0, errors: ["Failed to sync sales order"] });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusLabel = (statusId: number): string => {
    switch (statusId) {
      case 10: return "Bid/Estimate";
      case 20: return "Open";
      case 25: return "In Progress";
      case 60: return "Fulfilled";
      case 70: return "Closed";
      case 80: return "Cancelled";
      case 90: return "Voided";
      default: return `Status ${statusId}`;
    }
  };

  const getStatusColor = (statusId: number): { bg: string; text: string } => {
    switch (statusId) {
      case 20: return { bg: "#dbeafe", text: "#1e40af" };
      case 25: return { bg: "#fef3c7", text: "#92400e" };
      case 60: return { bg: "#dcfce7", text: "#166534" };
      case 70: return { bg: "#f1f5f9", text: "#475569" };
      case 80:
      case 90: return { bg: "#fef2f2", text: "#991b1b" };
      default: return { bg: "#f1f5f9", text: "#475569" };
    }
  };

  // Not configured state
  if (status && !status.configured) {
    return (
      <div className="page">
        <h1>Fishbowl Sales Orders</h1>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Fishbowl Not Configured</h2>
          <p style={{ color: "#64748b" }}>
            Fishbowl connection is not configured. Please check your environment variables.
          </p>
        </div>
      </div>
    );
  }

  // Not connected state
  if (status && !status.connected) {
    return (
      <div className="page">
        <h1>Fishbowl Sales Orders</h1>
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

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Fishbowl Sales Orders</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            Showing only orders with manufacturable items (have BOMs)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={16} style={{ color: "#22c55e" }} />
            <span style={{ color: "#22c55e", fontSize: 14 }}>Connected</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSyncAllToDemand}
            disabled={syncing}
          >
            <Download size={16} style={{ marginRight: 8 }} />
            {syncing ? "Syncing..." : "Sync All to Demand"}
          </button>
        </div>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 16,
            background: syncResult.errors.length > 0 ? "#fef2f2" : "#dcfce7",
            border: `1px solid ${syncResult.errors.length > 0 ? "#fecaca" : "#bbf7d0"}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{syncResult.created}</strong> demand entries created,{" "}
              <strong>{syncResult.skipped}</strong> skipped (already exist)
              {syncResult.errors.length > 0 && (
                <div style={{ color: "#991b1b", marginTop: 4, fontSize: 13 }}>
                  Errors: {syncResult.errors.join(", ")}
                </div>
              )}
            </div>
            <Link href="/planning/demand">
              <button className="btn btn-secondary">
                View Demand Pool <ArrowRight size={14} style={{ marginLeft: 4 }} />
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-secondary" onClick={fetchSalesOrders}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Sales Orders list */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div className="card" style={{ padding: 48, textAlign: "center" }}>
              <p style={{ color: "#64748b" }}>Loading sales orders...</p>
            </div>
          ) : salesOrders.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: "center" }}>
              <p style={{ color: "#64748b" }}>No sales orders found</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>SO Number</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Customer</th>
                    <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map((so) => {
                    const statusColor = getStatusColor(so.statusId);
                    return (
                      <tr
                        key={so.id}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          cursor: "pointer",
                          background: selectedSO === so.id ? "#eff6ff" : "transparent",
                        }}
                        onClick={() => fetchSODetails(so.id)}
                      >
                        <td style={{ padding: "12px 16px", fontSize: 14, fontFamily: "monospace", fontWeight: 500 }}>
                          {so.num}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 14, color: "#475569" }}>
                          {so.customerName || <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 500,
                              background: statusColor.bg,
                              color: statusColor.text,
                            }}
                          >
                            {getStatusLabel(so.statusId)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SO Details panel */}
        <div style={{ width: 400 }}>
          <div className="card" style={{ padding: 16, position: "sticky", top: 16 }}>
            {!selectedSO ? (
              <div style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                <Search size={32} style={{ marginBottom: 8 }} />
                <p>Select a Sales Order to view details</p>
              </div>
            ) : loadingDetails ? (
              <div style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                <p>Loading details...</p>
              </div>
            ) : soDetails ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <h3 style={{ margin: 0 }}>SO: {soDetails.so.num}</h3>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "6px 12px", fontSize: 13 }}
                    onClick={() => handleSyncSOToDemand(soDetails.so.id)}
                    disabled={syncing}
                  >
                    <Download size={14} style={{ marginRight: 4 }} />
                    {syncing ? "..." : "Sync"}
                  </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Customer</div>
                  <div style={{ fontSize: 14 }}>{soDetails.so.customerName || "—"}</div>
                </div>

                <h4 style={{ marginBottom: 12 }}>Line Items</h4>
                {soDetails.items.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: 14 }}>No items</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {soDetails.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          background: "#f8fafc",
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ fontWeight: 500, fontFamily: "monospace" }}>
                            {item.productNum}
                          </div>
                          {item.dateScheduledFulfillment && (
                            <div style={{ fontSize: 12, color: "#64748b", background: "#e0f2fe", padding: "2px 6px", borderRadius: 4 }}>
                              Due: {new Date(item.dateScheduledFulfillment).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
                          {item.productDescription}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: "#64748b" }}>Qty:</span>{" "}
                          <span style={{ fontWeight: 500 }}>{item.qtyFulfilled}</span>
                          <span style={{ color: "#94a3b8" }}> / {item.qtyOrdered}</span>
                          {item.qtyFulfilled < item.qtyOrdered && (
                            <span style={{ color: "#f59e0b", marginLeft: 8 }}>
                              ({item.qtyOrdered - item.qtyFulfilled} remaining)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 16, padding: 12, background: "#eff6ff", borderRadius: 8, fontSize: 13 }}>
                  <strong>How syncing works:</strong>
                  <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, color: "#475569" }}>
                    <li>Each unfulfilled line item creates a demand entry</li>
                    <li>The BOM is matched by product number</li>
                    <li>Already-synced items are skipped</li>
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  RefreshCw,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Package,
  ChevronDown,
  Pencil,
  Trash2,
  Settings,
  X,
} from "lucide-react";

interface DemandEntry {
  id: number;
  source: "fishbowl_so" | "fishbowl_wo" | "manual";
  fishbowl_so_id: number | null;
  fishbowl_so_num: string | null;
  fishbowl_wo_id: number | null;
  fishbowl_wo_num: string | null;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  quantity: number;
  due_date: string;
  target_completion_date: string;
  priority: number;
  customer_name: string | null;
  status: "pending" | "planned" | "in_progress" | "completed" | "cancelled";
  quantity_completed: number;
  color: string | null;
  bom_description?: string;
  total_steps?: number;
}

interface DemandSummary {
  total: number;
  pending: number;
  planned: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_this_week: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#fef3c7", text: "#92400e" },
  planned: { bg: "#dbeafe", text: "#1e40af" },
  in_progress: { bg: "#d1fae5", text: "#065f46" },
  completed: { bg: "#e5e7eb", text: "#374151" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
};

const PRIORITY_CONFIG: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: "Urgent", bg: "#fee2e2", text: "#991b1b" },
  2: { label: "High", bg: "#ffedd5", text: "#9a3412" },
  3: { label: "Normal", bg: "#f1f5f9", text: "#475569" },
  4: { label: "Low", bg: "#e0f2fe", text: "#0369a1" },
  5: { label: "Lowest", bg: "#e5e7eb", text: "#6b7280" },
};

const getPriorityConfig = (priority: number): { label: string; bg: string; text: string } => {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG[3]!;
};

interface FishbowlBOM {
  id: number;
  num: string;
  description: string | null;
}

export default function DemandPool() {
  const [entries, setEntries] = useState<DemandEntry[]>([]);
  const [summary, setSummary] = useState<DemandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending,planned,in_progress");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DemandEntry | null>(null);

  // Add modal form state
  const [bomSearch, setBomSearch] = useState("");
  const [bomResults, setBomResults] = useState<FishbowlBOM[]>([]);
  const [selectedBom, setSelectedBom] = useState<FishbowlBOM | null>(null);
  const [newQuantity, setNewQuantity] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [bomSearchLoading, setBomSearchLoading] = useState(false);

  // Edit modal form state
  const [editQuantity, setEditQuantity] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<number>(3);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/demand/summary");
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error("Failed to fetch summary:", error);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
        order_by: "due_date",
        order_dir: "asc",
      });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);

      const response = await fetch(`/api/demand?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch demand entries:", error);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchSummary();
    fetchEntries();
  }, [fetchSummary, fetchEntries]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchEntries();
  };

  // Parse date string as local date (not UTC) to avoid timezone shift
  const parseLocalDate = (dateStr: string) => {
    const datePart = dateStr.split("T")[0]!;
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year!, month! - 1, day!);
  };

  const formatDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isOverdue = (entry: DemandEntry) => {
    if (entry.status === "completed" || entry.status === "cancelled") return false;
    const dueDate = parseLocalDate(entry.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const isDueThisWeek = (entry: DemandEntry) => {
    if (entry.status === "completed" || entry.status === "cancelled") return false;
    const dueDate = parseLocalDate(entry.due_date);
    const today = new Date();
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return dueDate <= weekFromNow && dueDate >= today;
  };

  // BOM search for autocomplete
  const searchBOMs = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setBomResults([]);
      return;
    }
    setBomSearchLoading(true);
    try {
      const params = new URLSearchParams({ search: searchTerm, limit: "10", active: "true" });
      const response = await fetch(`/api/fishbowl/boms?${params}`);
      const data = await response.json();
      setBomResults(data.boms || []);
    } catch (error) {
      console.error("Failed to search BOMs:", error);
    } finally {
      setBomSearchLoading(false);
    }
  }, []);

  // Debounced BOM search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (bomSearch && !selectedBom) {
        searchBOMs(bomSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [bomSearch, selectedBom, searchBOMs]);

  // Handle adding new demand entry
  const handleAddDemand = async () => {
    if (!selectedBom || !newQuantity || !newDueDate) return;

    try {
      const response = await fetch("/api/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fishbowl_bom_id: selectedBom.id,
          fishbowl_bom_num: selectedBom.num,
          quantity: parseInt(newQuantity),
          due_date: newDueDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to add demand");
        return;
      }

      // Reset form and close modal
      setShowAddModal(false);
      setSelectedBom(null);
      setBomSearch("");
      setNewQuantity("");
      setNewDueDate("");
      setBomResults([]);

      // Refresh data
      fetchEntries();
      fetchSummary();
    } catch (error) {
      console.error("Failed to add demand:", error);
      alert("Failed to add demand");
    }
  };

  // Open edit modal with entry data
  const openEditModal = (entry: DemandEntry) => {
    setEditingEntry(entry);
    setEditQuantity(entry.quantity.toString());
    setEditDueDate(entry.due_date.split("T")[0] || entry.due_date); // Format as YYYY-MM-DD
    setEditPriority(entry.priority);
    setShowEditModal(true);
  };

  // Handle editing demand entry
  const handleEditDemand = async () => {
    if (!editingEntry || !editQuantity || !editDueDate) return;

    try {
      const response = await fetch(`/api/demand/${editingEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: parseInt(editQuantity),
          due_date: editDueDate,
          priority: editPriority,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to update demand");
        return;
      }

      // Close modal and refresh
      setShowEditModal(false);
      setEditingEntry(null);
      fetchEntries();
      fetchSummary();
    } catch (error) {
      console.error("Failed to update demand:", error);
      alert("Failed to update demand");
    }
  };

  // Handle deleting demand entry
  const handleDeleteDemand = async (entry: DemandEntry) => {
    const confirmMsg = `Delete demand for ${entry.fishbowl_bom_num}?\n\nQuantity: ${entry.quantity}\nSource: ${entry.source === "fishbowl_so" ? `SO ${entry.fishbowl_so_num}` : entry.source === "fishbowl_wo" ? `WO ${entry.fishbowl_wo_num}` : "Manual"}`;

    if (!confirm(confirmMsg)) return;

    try {
      const response = await fetch(`/api/demand/${entry.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete demand");
        return;
      }

      fetchEntries();
      fetchSummary();
    } catch (error) {
      console.error("Failed to delete demand:", error);
      alert("Failed to delete demand");
    }
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Demand Pool</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            Global demand pool for production planning
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={fetchEntries}>
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} style={{ marginRight: 4 }} />
            Add Demand
          </button>
          <Link href="/planning/runs">
            <button className="btn btn-primary">
              <Plus size={16} style={{ marginRight: 4 }} />
              Create Plan
            </button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.total}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center", background: "#fef3c7" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#92400e" }}>{summary.pending}</div>
            <div style={{ fontSize: 12, color: "#92400e" }}>Pending</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center", background: "#dbeafe" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#1e40af" }}>{summary.planned}</div>
            <div style={{ fontSize: 12, color: "#1e40af" }}>Planned</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center", background: "#d1fae5" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#065f46" }}>{summary.in_progress}</div>
            <div style={{ fontSize: 12, color: "#065f46" }}>In Progress</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center", background: "#fee2e2" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#991b1b" }}>{summary.overdue}</div>
            <div style={{ fontSize: 12, color: "#991b1b" }}>Overdue</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center", background: "#fef9c3" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#854d0e" }}>{summary.due_this_week}</div>
            <div style={{ fontSize: 12, color: "#854d0e" }}>Due This Week</div>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search by BOM, SO, customer..."
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
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            style={{
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="pending,planned,in_progress">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Loading demand entries...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Package size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No demand entries found</p>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Sync from Fishbowl Sales Orders or create manual entries
          </p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Source</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>BOM</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 13 }}>Customer</th>
                  <th style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: 13 }}>Qty</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Steps</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Due Date</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Priority</th>
                  <th style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isOverdue(entry) ? "#fef2f2" : isDueThisWeek(entry) ? "#fefce8" : undefined,
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 14 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>
                        {entry.source === "fishbowl_so" && `SO ${entry.fishbowl_so_num}`}
                        {entry.source === "fishbowl_wo" && `WO ${entry.fishbowl_wo_num}`}
                        {entry.source === "manual" && "Manual"}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14 }}>
                      <div style={{ fontFamily: "monospace", fontWeight: 500 }}>{entry.fishbowl_bom_num}</div>
                      {entry.bom_description && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>{entry.bom_description}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "#475569" }}>
                      {entry.customer_name || <span style={{ color: "#94a3b8" }}>-</span>}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, textAlign: "right", fontWeight: 500 }}>
                      {entry.quantity}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        {(entry.total_steps || 0) > 0 ? (
                          <Check size={14} style={{ color: "#22c55e" }} />
                        ) : (
                          <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
                        )}
                        <Link
                          href={`/bom-steps?bom=${entry.fishbowl_bom_id}&bomNum=${encodeURIComponent(entry.fishbowl_bom_num)}`}
                          className="btn btn-secondary"
                          style={{ padding: "4px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
                        >
                          <Settings size={12} />
                          {(entry.total_steps || 0) > 0 ? "Edit Steps" : "Configure Steps"}
                        </Link>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        {isOverdue(entry) && <AlertCircle size={14} style={{ color: "#ef4444" }} />}
                        <span style={{ fontSize: 13, color: isOverdue(entry) ? "#ef4444" : "#475569" }}>
                          {formatDate(entry.due_date)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          background: STATUS_COLORS[entry.status]?.bg || "#e5e7eb",
                          color: STATUS_COLORS[entry.status]?.text || "#374151",
                        }}
                      >
                        {entry.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          background: getPriorityConfig(entry.priority).bg,
                          color: getPriorityConfig(entry.priority).text,
                        }}
                      >
                        {getPriorityConfig(entry.priority).label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => openEditModal(entry)}
                          style={{ padding: "4px 8px" }}
                          title="Edit quantity and due date"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleDeleteDemand(entry)}
                          style={{ padding: "4px 8px", color: "#ef4444" }}
                          title="Delete demand entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span style={{ color: "#64748b", fontSize: 14 }}>
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total} entries
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

      {/* Add Demand Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="card"
            style={{ width: 480, padding: 24, maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Add Manual Demand</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X size={20} style={{ color: "#64748b" }} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>BOM</label>
              {selectedBom ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#f1f5f9",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "monospace", fontWeight: 500 }}>{selectedBom.num}</div>
                    {selectedBom.description && (
                      <div style={{ fontSize: 12, color: "#64748b" }}>{selectedBom.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedBom(null);
                      setBomSearch("");
                      setBomResults([]);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                  >
                    <X size={16} style={{ color: "#64748b" }} />
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search BOMs..."
                    value={bomSearch}
                    onChange={(e) => setBomSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 14,
                    }}
                  />
                  {bomSearchLoading && (
                    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                      <RefreshCw size={14} style={{ color: "#64748b", animation: "spin 1s linear infinite" }} />
                    </div>
                  )}
                  {bomResults.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        marginTop: 4,
                        maxHeight: 200,
                        overflow: "auto",
                        zIndex: 10,
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                    >
                      {bomResults.map((bom) => (
                        <div
                          key={bom.id}
                          onClick={() => {
                            setSelectedBom(bom);
                            setBomSearch("");
                            setBomResults([]);
                          }}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                        >
                          <div style={{ fontFamily: "monospace", fontWeight: 500 }}>{bom.num}</div>
                          {bom.description && (
                            <div style={{ fontSize: 12, color: "#64748b" }}>{bom.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Quantity</label>
              <input
                type="number"
                min="1"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                placeholder="Enter quantity"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Due Date</label>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddDemand}
                disabled={!selectedBom || !newQuantity || !newDueDate}
              >
                Add Demand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Demand Modal */}
      {showEditModal && editingEntry && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="card"
            style={{ width: 400, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Edit Demand</h2>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X size={20} style={{ color: "#64748b" }} />
              </button>
            </div>

            <div style={{ marginBottom: 16, padding: "12px", background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontFamily: "monospace", fontWeight: 500 }}>{editingEntry.fishbowl_bom_num}</div>
              {editingEntry.bom_description && (
                <div style={{ fontSize: 12, color: "#64748b" }}>{editingEntry.bom_description}</div>
              )}
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Source: {editingEntry.source === "fishbowl_so" ? `SO ${editingEntry.fishbowl_so_num}` :
                         editingEntry.source === "fishbowl_wo" ? `WO ${editingEntry.fishbowl_wo_num}` : "Manual"}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Quantity</label>
              <input
                type="number"
                min="1"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
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
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              >
                <option value={1}>1 - Urgent</option>
                <option value={2}>2 - High</option>
                <option value={3}>3 - Normal</option>
                <option value={4}>4 - Low</option>
                <option value={5}>5 - Lowest</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEditDemand}
                disabled={!editQuantity || !editDueDate}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

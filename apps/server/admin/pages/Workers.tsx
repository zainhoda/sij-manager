import React, { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import DataGrid from "../components/DataGrid";
import type { Column, CellChangeContext } from "../components/DataGrid";

interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: "active" | "inactive" | "on_leave";
  cost_per_hour: number;
}

interface AddWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (worker: Worker) => void;
}

function AddWorkerModal({ isOpen, onClose, onSuccess }: AddWorkerModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    employee_id: "",
    cost_per_hour: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ name: "", employee_id: "", cost_per_hour: "" });
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          employee_id: formData.employee_id || null,
          cost_per_hour: formData.cost_per_hour ? parseFloat(formData.cost_per_hour) : 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to create worker");
      }

      const newWorker = await response.json() as Worker;
      onSuccess(newWorker);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create worker");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Add New Worker</h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors text-xl"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: (e.target as HTMLInputElement).value }))}
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter worker name"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="employee_id" className="block text-sm font-medium text-slate-700 mb-2">
              Employee ID
            </label>
            <input
              type="text"
              id="employee_id"
              value={formData.employee_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, employee_id: (e.target as HTMLInputElement).value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. EMP001"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="cost_per_hour" className="block text-sm font-medium text-slate-700 mb-2">
              Cost per Hour ($)
            </label>
            <input
              type="number"
              id="cost_per_hour"
              step="0.01"
              min="0"
              value={formData.cost_per_hour}
              onChange={(e) => setFormData((prev) => ({ ...prev, cost_per_hour: (e.target as HTMLInputElement).value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>

          <div className="flex justify-end gap-3 pt-5 border-t border-slate-200 mt-6">
            <button
              type="button"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Worker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Workers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchWorkers = useCallback(async () => {
    try {
      const response = await fetch("/api/workers");
      const data = await response.json() as Worker[];
      setWorkers(data);
    } catch (error) {
      console.error("Failed to fetch workers:", error);
    }
  }, []);

  useEffect(() => {
    fetchWorkers().finally(() => setLoading(false));
  }, [fetchWorkers]);

  const handleCellChange = async ({
    rowId,
    key,
    value,
  }: CellChangeContext<Worker>) => {
    const oldWorker = workers.find((w) => w.id === rowId);
    if (!oldWorker) return;

    // Optimistic update
    setWorkers((prev) =>
      prev.map((w) => (w.id === rowId ? { ...w, [key]: value } : w))
    );

    try {
      const response = await fetch(`/api/workers/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update worker");
      }

      const updatedWorker = await response.json() as Worker;
      setWorkers((prev) =>
        prev.map((w) => (w.id === rowId ? updatedWorker : w))
      );
    } catch (error) {
      console.error("Failed to update worker:", error);
      // Rollback on error
      setWorkers((prev) =>
        prev.map((w) => (w.id === rowId ? oldWorker : w))
      );
    }
  };

  const columns: Column<Worker>[] = [
    {
      key: "employee_id",
      header: "ID",
      width: 100,
      editable: true,
    },
    {
      key: "name",
      header: "Name",
      width: 200,
      editable: true,
      render: (value, row) => (
        <Link
          href={`/workers/${row.id}`}
          className="text-blue-600 hover:text-blue-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      editable: true,
      render: (value) => (
        <span className={`status-badge ${value}`}>
          {String(value).replace("_", " ")}
        </span>
      ),
      renderEdit: (value, onChange, onCommit, onCancel, row) => (
        <select
          className="cell-edit-select"
          value={String(value)}
          onChange={async (e) => {
            const newStatus = (e.target as HTMLSelectElement).value as Worker["status"];
            await handleCellChange({
              rowId: row.id,
              key: "status",
              value: newStatus,
              row,
              column: { key: "status", header: "Status" },
            });
            onCancel(); // Close editor without triggering another commit
          }}
          onBlur={onCancel}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="on_leave">on leave</option>
        </select>
      ),
    },
    {
      key: "cost_per_hour",
      header: "Cost/Hour",
      width: 100,
      editable: true,
      render: (value) => `$${Number(value || 0).toFixed(2)}`,
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <input
          type="number"
          step="0.01"
          min="0"
          className="cell-edit-input"
          value={value ?? 0}
          onChange={(e) => onChange(parseFloat((e.target as HTMLInputElement).value) || 0)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div className="page">
        <h1>Workers</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1>Workers</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          Add Worker
        </button>
      </div>
      <DataGrid
        data={workers}
        columns={columns}
        onCellChange={handleCellChange}
        searchPlaceholder="Search workers..."
        height="calc(100vh - 180px)"
      />
      <AddWorkerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(newWorker) => setWorkers((prev) => [...prev, newWorker])}
      />
    </div>
  );
}

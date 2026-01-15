import React, { useState, useEffect, useCallback } from "react";
import DataGrid from "../components/DataGrid";
import type { Column, CellChangeContext } from "../components/DataGrid";

interface Equipment {
  id: number;
  name: string;
  description: string | null;
  status: "available" | "in_use" | "maintenance" | "retired";
  station_count: number;
  hourly_cost: number;
}

interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (equipment: Equipment) => void;
}

function AddEquipmentModal({ isOpen, onClose, onSuccess }: AddEquipmentModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    station_count: "1",
    hourly_cost: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ name: "", description: "", station_count: "1", hourly_cost: "" });
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
      const response = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          station_count: formData.station_count ? parseInt(formData.station_count) : 1,
          hourly_cost: formData.hourly_cost ? parseFloat(formData.hourly_cost) : 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to create equipment");
      }

      const newEquipment = await response.json() as Equipment;
      onSuccess(newEquipment);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create equipment");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Add New Equipment</h2>
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
              placeholder="Enter equipment name"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <input
              type="text"
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: (e.target as HTMLInputElement).value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional description"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="station_count" className="block text-sm font-medium text-slate-700 mb-2">
              Station Count
            </label>
            <input
              type="number"
              id="station_count"
              min="1"
              value={formData.station_count}
              onChange={(e) => setFormData((prev) => ({ ...prev, station_count: (e.target as HTMLInputElement).value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="1"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="hourly_cost" className="block text-sm font-medium text-slate-700 mb-2">
              Hourly Cost ($)
            </label>
            <input
              type="number"
              id="hourly_cost"
              step="0.01"
              min="0"
              value={formData.hourly_cost}
              onChange={(e) => setFormData((prev) => ({ ...prev, hourly_cost: (e.target as HTMLInputElement).value }))}
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
              {loading ? "Creating..." : "Create Equipment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchEquipment = useCallback(async () => {
    try {
      const response = await fetch("/api/equipment");
      const data = await response.json() as Equipment[];
      setEquipment(data);
    } catch (error) {
      console.error("Failed to fetch equipment:", error);
    }
  }, []);

  useEffect(() => {
    fetchEquipment().finally(() => setLoading(false));
  }, [fetchEquipment]);

  const handleCellChange = async ({
    rowId,
    key,
    value,
  }: CellChangeContext<Equipment>) => {
    const oldEquipment = equipment.find((e) => e.id === rowId);
    if (!oldEquipment) return;

    // Optimistic update
    setEquipment((prev) =>
      prev.map((e) => (e.id === rowId ? { ...e, [key]: value } : e))
    );

    try {
      const response = await fetch(`/api/equipment/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update equipment");
      }

      const updatedEquipment = await response.json() as Equipment;
      setEquipment((prev) =>
        prev.map((e) => (e.id === rowId ? updatedEquipment : e))
      );
    } catch (error) {
      console.error("Failed to update equipment:", error);
      // Rollback on error
      setEquipment((prev) =>
        prev.map((e) => (e.id === rowId ? oldEquipment : e))
      );
    }
  };

  const columns: Column<Equipment>[] = [
    {
      key: "name",
      header: "Name",
      width: 200,
      editable: true,
    },
    {
      key: "description",
      header: "Description",
      width: 250,
      editable: true,
      render: (value) => value || "-",
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
            const newStatus = (e.target as HTMLSelectElement).value as Equipment["status"];
            await handleCellChange({
              rowId: row.id,
              key: "status",
              value: newStatus,
              row,
              column: { key: "status", header: "Status" },
            });
            onCancel();
          }}
          onBlur={onCancel}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        >
          <option value="available">available</option>
          <option value="in_use">in use</option>
          <option value="maintenance">maintenance</option>
          <option value="retired">retired</option>
        </select>
      ),
    },
    {
      key: "station_count",
      header: "Stations",
      width: 80,
      editable: true,
      render: (value) => value || 1,
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <input
          type="number"
          min="1"
          className="cell-edit-input"
          value={value ?? 1}
          onChange={(e) => onChange(parseInt((e.target as HTMLInputElement).value) || 1)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
      ),
    },
    {
      key: "hourly_cost",
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
        <h1>Equipment</h1>
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
        <h1>Equipment</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          Add Equipment
        </button>
      </div>
      <DataGrid
        data={equipment}
        columns={columns}
        onCellChange={handleCellChange}
        searchPlaceholder="Search equipment..."
        height="calc(100vh - 180px)"
      />
      <AddEquipmentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(newEquipment) => setEquipment((prev) => [...prev, newEquipment])}
      />
    </div>
  );
}

import React, { useState } from "react";
import DataGrid, { Column, CellChangeContext } from "../components/DataGrid";

interface Worker {
  id: number;
  name: string;
  employee_id: string | null;
  status: "active" | "inactive" | "on_leave";
  skill_category: "SEWING" | "OTHER";
  created_at: string;
}

// Generate more mock data for scrolling demo
const generateMockWorkers = (): Worker[] => {
  const firstNames = ["Maria", "Carlos", "Ana", "Luis", "Sofia", "Diego", "Isabella", "Miguel", "Valentina", "Alejandro", "Camila", "Andres", "Lucia", "Sebastian", "Mariana", "Jorge", "Paula", "Ricardo", "Elena", "Fernando"];
  const lastNames = ["Garcia", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Sanchez", "Ramirez", "Torres", "Flores", "Rivera", "Gomez", "Diaz", "Morales", "Reyes", "Castro", "Ortiz", "Gutierrez", "Chavez", "Ramos", "Vargas"];
  const statuses: Worker["status"][] = ["active", "active", "active", "active", "inactive", "on_leave"];
  const categories: Worker["skill_category"][] = ["SEWING", "SEWING", "SEWING", "OTHER"];

  return Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    employee_id: `EMP${String(i + 1).padStart(3, "0")}`,
    status: statuses[i % statuses.length],
    skill_category: categories[i % categories.length],
    created_at: new Date(2024, Math.floor(i / 5), (i % 28) + 1).toISOString().split("T")[0],
  }));
};

export default function Workers() {
  const [workers, setWorkers] = useState<Worker[]>(generateMockWorkers);

  const handleCellChange = ({ rowId, key, value, row, column }: CellChangeContext<Worker>) => {
    // Determine which table to update based on column metadata
    const table = column.meta?.table || "workers";
    const foreignKey = column.meta?.foreignKey || "id";
    const updateId = row[foreignKey as keyof Worker];

    console.log(`Update ${table}.${String(key)} = ${value} WHERE id = ${updateId}`);

    // For now, just update local state
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === rowId ? { ...w, [key]: value } : w
      )
    );
  };

  const columns: Column<Worker>[] = [
    {
      key: "employee_id",
      header: "ID",
      width: 100,
      editable: false,
    },
    {
      key: "name",
      header: "Name",
      width: 200,
      editable: true,
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
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <select
          className="cell-edit-select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value as Worker["status"])}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
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
      key: "skill_category",
      header: "Category",
      width: 120,
      editable: true,
      render: (value) => (
        <span
          style={{
            fontWeight: 500,
            color: value === "SEWING" ? "var(--accent-color)" : "var(--text-secondary)",
          }}
        >
          {String(value)}
        </span>
      ),
      renderEdit: (value, onChange, onCommit, onCancel) => (
        <select
          className="cell-edit-select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value as Worker["skill_category"])}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        >
          <option value="SEWING">SEWING</option>
          <option value="OTHER">OTHER</option>
        </select>
      ),
    },
    {
      key: "created_at",
      header: "Joined",
      width: 120,
      editable: false,
      render: (value) => new Date(String(value)).toLocaleDateString(),
    },
  ];

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
        <button className="btn btn-primary">Add Worker</button>
      </div>
      <DataGrid
        data={workers}
        columns={columns}
        onCellChange={handleCellChange}
        searchPlaceholder="Search workers..."
        height="calc(100vh - 180px)"
      />
    </div>
  );
}

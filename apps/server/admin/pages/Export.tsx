import React, { useState } from "react";
import { Download, CheckCircle, AlertCircle } from "lucide-react";

interface ExportOption {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  filename: string;
}

const exportOptions: ExportOption[] = [
  {
    id: "equipment-matrix",
    title: "Workers & Equipment",
    description: "Export equipment, workers, hourly costs, and certification matrix",
    endpoint: "/api/exports/equipment-matrix",
    filename: "equipment-matrix.csv",
  },
  {
    id: "products",
    title: "BOMs & Steps",
    description: "Export BOM step configurations with steps and dependencies",
    endpoint: "/api/exports/products",
    filename: "bom-steps.csv",
  },
  {
    id: "orders",
    title: "Demand Entries",
    description: "Export all demand entries with BOM numbers, quantities, and due dates",
    endpoint: "/api/exports/orders",
    filename: "demand-entries.csv",
  },
  {
    id: "production-history",
    title: "Production History",
    description: "Export production history with worker assignments and times",
    endpoint: "/api/exports/production-history",
    filename: "production-history.csv",
  },
];

export default function Export() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (option: ExportOption) => {
    setDownloading(option.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(option.endpoint);

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = option.filename;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSuccess(option.id);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Export Data</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
          Download data as CSV files in the same format used for imports
        </p>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: "24px" }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="export-grid">
        {exportOptions.map((option) => (
          <div key={option.id} className="export-card">
            <div className="export-card-content">
              <h3>{option.title}</h3>
              <p>{option.description}</p>
            </div>
            <button
              className={`btn ${success === option.id ? "btn-success" : "btn-primary"}`}
              onClick={() => handleDownload(option)}
              disabled={downloading !== null}
            >
              {downloading === option.id ? (
                <>
                  <span className="spinner" />
                  Downloading...
                </>
              ) : success === option.id ? (
                <>
                  <CheckCircle size={18} />
                  Downloaded
                </>
              ) : (
                <>
                  <Download size={18} />
                  Download CSV
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="info-section" style={{ marginTop: "32px" }}>
        <h2>About Exports</h2>
        <p>
          These exports produce CSV files that match the exact format expected by
          the import system. You can use these files to:
        </p>
        <ul>
          <li>Back up your data</li>
          <li>Transfer data to another system</li>
          <li>Make bulk edits in a spreadsheet and re-import</li>
          <li>Review data in Excel or Google Sheets</li>
        </ul>
      </div>
    </div>
  );
}

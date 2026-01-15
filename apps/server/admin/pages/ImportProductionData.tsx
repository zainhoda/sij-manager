import React, { useState } from "react";

type ImportPhase = 'upload' | 'preview' | 'success';

interface PreviewSummary {
  totalRows: number;
  ordersAffected: number;
  workersInvolved: number;
  stepsInvolved: number;
  schedulesToCreate: number;
  entriesToCreate: number;
  assignmentsToCreate: number;
}

interface PreviewRow {
  orderId: number;
  orderProductName: string;
  stepCode: string;
  workerName: string;
  date: string;
  startTime: string;
  endTime: string;
  units: number;
  rowNumber: number;
}

interface ValidationError {
  row?: number;
  field?: string;
  message: string;
}

interface ValidationWarning {
  row?: number;
  field?: string;
  message: string;
}

interface PreviewResponse {
  success: boolean;
  preview: {
    summary: PreviewSummary;
    rows: PreviewRow[];
  };
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: {
    schedulesCreated: number;
    entriesCreated: number;
    assignmentsCreated: number;
  };
}

export default function ImportProductionData() {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setContent(text);

    if (file.name.endsWith('.tsv') || file.name.endsWith('.txt')) {
      setFormat('tsv');
    } else {
      setFormat('csv');
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/imports/production-data/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Preview failed');
      }

      setPreviewData(data);
      setPhase('preview');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData?.importToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/imports/production-data/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importToken: previewData.importToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setConfirmResult(data);
      setPhase('success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPhase('upload');
    setContent('');
    setPreviewData(null);
    setConfirmResult(null);
    setError(null);
  };

  return (
    <div className="page import-page">
      <h1>Import Production Data</h1>
      <p>Upload historical production data to record completed work for orders.</p>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {phase === 'upload' && (
        <div className="upload-section">
          <h2>Upload Production History</h2>

          <p className="description">
            Upload a CSV with completed work records.<br />
            <strong>Required columns:</strong> order_id, step_code, worker_name, date, start_time, end_time, units
          </p>

          <div className="form-group">
            <label htmlFor="file">Upload File (.csv, .tsv)</label>
            <input
              type="file"
              id="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
            />
          </div>

          <div className="form-group">
            <label htmlFor="format">Format</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'tsv' | 'csv')}
            >
              <option value="csv">CSV (Comma-separated)</option>
              <option value="tsv">TSV (Tab-separated)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="content">Or Paste Content Directly</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder={"order_id,step_code,worker_name,date,start_time,end_time,units\n5,CUT-01,Maria Garcia,2025-01-10,07:00,11:00,120\n5,CUT-01,John Smith,2025-01-10,07:00,11:00,80"}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={!content.trim() || loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Processing...
              </>
            ) : (
              <>Preview Import</>
            )}
          </button>
        </div>
      )}

      {phase === 'preview' && previewData && (
        <div className="preview-section">
          <h2>Preview</h2>

          {previewData.errors.length > 0 && (
            <div className="validation-errors">
              <h3>Errors (must fix before importing)</h3>
              <ul>
                {previewData.errors.map((err, i) => (
                  <li key={i}>
                    {err.row && <span className="row-num">Row {err.row}</span>}
                    {err.field && <span className="field-name">{err.field}: </span>}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previewData.warnings.length > 0 && (
            <div className="validation-warnings">
              <h3>Warnings</h3>
              <ul>
                {previewData.warnings.map((warn, i) => (
                  <li key={i}>
                    {warn.row && <span className="row-num">Row {warn.row}</span>}
                    {warn.field && <span className="field-name">{warn.field}: </span>}
                    {warn.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="preview-summary">
            <h3>Summary</h3>
            <table className="summary-table">
              <tbody>
                <tr>
                  <td>Total Rows</td>
                  <td>{previewData.preview.summary.totalRows}</td>
                </tr>
                <tr>
                  <td>Orders Affected</td>
                  <td>{previewData.preview.summary.ordersAffected}</td>
                </tr>
                <tr>
                  <td>Workers Involved</td>
                  <td>{previewData.preview.summary.workersInvolved}</td>
                </tr>
                <tr>
                  <td>Steps Involved</td>
                  <td>{previewData.preview.summary.stepsInvolved}</td>
                </tr>
                <tr>
                  <td>Schedules to Create</td>
                  <td>{previewData.preview.summary.schedulesToCreate}</td>
                </tr>
                <tr>
                  <td>Schedule Entries to Create</td>
                  <td>{previewData.preview.summary.entriesToCreate}</td>
                </tr>
                <tr>
                  <td>Worker Assignments to Create</td>
                  <td>{previewData.preview.summary.assignmentsToCreate}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {previewData.preview.rows.length > 0 && (
            <div className="preview-detail">
              <h3>Data Preview ({previewData.preview.rows.length} rows)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Step</th>
                      <th>Worker</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td>#{row.orderId} ({row.orderProductName})</td>
                        <td><code>{row.stepCode}</code></td>
                        <td>{row.workerName}</td>
                        <td>{row.date}</td>
                        <td>{row.startTime.slice(0, 5)} - {row.endTime.slice(0, 5)}</td>
                        <td>{row.units}</td>
                      </tr>
                    ))}
                    {previewData.preview.rows.length > 10 && (
                      <tr>
                        <td colSpan={6} className="more-rows">
                          ...and {previewData.preview.rows.length - 10} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="preview-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setPhase('upload')}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={previewData.errors.length > 0 || loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Importing...
                </>
              ) : (
                <>Confirm Import</>
              )}
            </button>
          </div>
        </div>
      )}

      {phase === 'success' && confirmResult && (
        <div className="success-section">
          <div className="success-icon">✓</div>
          <h2>Import Successful!</h2>

          <div className="result-summary">
            {confirmResult.result.schedulesCreated > 0 && (
              <p>Created {confirmResult.result.schedulesCreated} schedules</p>
            )}
            {confirmResult.result.entriesCreated > 0 && (
              <p>Created {confirmResult.result.entriesCreated} schedule entries</p>
            )}
            {confirmResult.result.assignmentsCreated > 0 && (
              <p>Created {confirmResult.result.assignmentsCreated} worker assignments</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/schedules" className="btn btn-primary">
              View Schedules
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

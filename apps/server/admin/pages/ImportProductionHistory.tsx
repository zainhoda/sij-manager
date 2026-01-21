import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

type ImportPhase = 'upload' | 'preview' | 'success';

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
    summary: {
      totalRows: number;
      ordersToUse: number;
      ordersToCreate: number;
      workersInvolved: number;
      stepsInvolved: number;
      schedulesToCreate: number;
      entriesToCreate: number;
      assignmentsToCreate: number;
    };
  };
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: {
    ordersCreated: number;
    schedulesCreated: number;
    entriesCreated: number;
    assignmentsCreated: number;
  };
  proficiencies?: {
    proficienciesCreated: number;
    proficienciesUpdated: number;
  };
}

interface FishbowlStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

export default function ImportProductionHistory() {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [deriveProficiencies, setDeriveProficiencies] = useState(true);
  const [fishbowlStatus, setFishbowlStatus] = useState<FishbowlStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fishbowl/status")
      .then((res) => res.json())
      .then((data) => setFishbowlStatus(data))
      .catch(() => setFishbowlStatus({ configured: false, connected: false }))
      .finally(() => setStatusLoading(false));
  }, []);

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
      const response = await fetch('/api/imports/production-history-fb/preview', {
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
      const response = await fetch('/api/imports/production-history-fb/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importToken: previewData.importToken,
          deriveProficiencies
        }),
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

  // Loading state
  if (statusLoading) {
    return (
      <div className="page import-page">
        <div className="page-header">
          <h1>Import Production History</h1>
        </div>
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Checking Fishbowl connection...</p>
        </div>
      </div>
    );
  }

  // Not configured state
  if (fishbowlStatus && !fishbowlStatus.configured) {
    return (
      <div className="page import-page">
        <div className="page-header">
          <h1>Import Production History</h1>
        </div>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Fishbowl Not Configured</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            Fishbowl connection is required for importing production history. Set the following environment variables:
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
  if (fishbowlStatus && !fishbowlStatus.connected) {
    return (
      <div className="page import-page">
        <div className="page-header">
          <h1>Import Production History</h1>
        </div>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#f59e0b", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Connection Failed</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            {fishbowlStatus.message || "Could not connect to Fishbowl database"}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setStatusLoading(true);
              fetch("/api/fishbowl/status")
                .then((res) => res.json())
                .then(setFishbowlStatus)
                .finally(() => setStatusLoading(false));
            }}
          >
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page import-page">
      <div className="page-header">
        <div>
          <h1>Import Production History</h1>
          <p className="page-subtitle">Import historical production data with Fishbowl references</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle size={16} style={{ color: "#22c55e" }} />
          <span style={{ color: "#22c55e", fontSize: 14 }}>Fishbowl Connected</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {phase === 'upload' && (
        <>
          <div className="import-docs">
            <div className="docs-section">
              <h2>Overview</h2>
              <p>
                This CSV imports historical production data using Fishbowl references. Each row
                represents a work session: a worker performing a specific step. The
                <code>fishbowl_bom_num</code> identifies the product, and optional SO/WO numbers
                link to Fishbowl orders.
              </p>
              <p>
                This import is <strong>optional</strong>, but highly recommended. It allows the
                system to automatically calculate worker proficiency levels based on actual
                performance data.
              </p>
            </div>

            <div className="docs-section">
              <h2>Column Reference</h2>
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>fishbowl_bom_num</code></td>
                    <td>Yes</td>
                    <td>
                      Fishbowl BOM number. Must match a product that's linked to this BOM.
                    </td>
                  </tr>
                  <tr>
                    <td><code>fishbowl_so_num</code></td>
                    <td>No</td>
                    <td>
                      Fishbowl Sales Order number. Used to link production to an order.
                      If provided and no matching order exists, one will be created.
                    </td>
                  </tr>
                  <tr>
                    <td><code>fishbowl_wo_num</code></td>
                    <td>No</td>
                    <td>
                      Fishbowl Work Order number. Used for tracking production against WOs.
                    </td>
                  </tr>
                  <tr>
                    <td><code>version_name</code></td>
                    <td>Yes</td>
                    <td>
                      Build version that was used for production (e.g., "v1.0 Standard").
                      Must match a version from the Product Steps import.
                    </td>
                  </tr>
                  <tr>
                    <td><code>step_code</code></td>
                    <td>Yes</td>
                    <td>
                      Step code from the specified build version (e.g., "A1A", "SEW-01").
                    </td>
                  </tr>
                  <tr>
                    <td><code>worker_name</code></td>
                    <td>Yes</td>
                    <td>
                      Worker name. Must match a worker from the Worker-Equipment import.
                    </td>
                  </tr>
                  <tr>
                    <td><code>work_date</code></td>
                    <td>Yes</td>
                    <td>
                      Date the work was performed, in <code>YYYY-MM-DD</code> format.
                    </td>
                  </tr>
                  <tr>
                    <td><code>start_time</code></td>
                    <td>Yes</td>
                    <td>
                      Start time in <code>HH:MM</code> or <code>HH:MM:SS</code> format (24-hour).
                    </td>
                  </tr>
                  <tr>
                    <td><code>end_time</code></td>
                    <td>Yes</td>
                    <td>
                      End time in <code>HH:MM</code> or <code>HH:MM:SS</code> format (24-hour).
                    </td>
                  </tr>
                  <tr>
                    <td><code>units_produced</code></td>
                    <td>Yes</td>
                    <td>
                      Number of units completed during this work session.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-section">
              <h2>Order Identification</h2>
              <p>
                Orders are identified by <code>fishbowl_so_num</code> or <code>fishbowl_wo_num</code>.
                If no matching order exists in the system, one will be created automatically and
                linked to the Fishbowl reference.
              </p>
            </div>

            <div className="docs-section">
              <h2>Proficiency Derivation</h2>
              <p>
                After import, the system can automatically calculate worker proficiency levels for
                each (worker, step) pair based on their actual performance:
              </p>
              <ul>
                <li>Efficiency = Expected Time / Actual Time × 100%</li>
                <li>&lt;60% efficiency → Level 1 (Learning)</li>
                <li>60-80% efficiency → Level 2 (Basic)</li>
                <li>80-100% efficiency → Level 3 (Proficient)</li>
                <li>100-120% efficiency → Level 4 (Advanced)</li>
                <li>&gt;120% efficiency → Level 5 (Expert)</li>
              </ul>
            </div>

            <div className="docs-section">
              <h2>Example</h2>
              <pre className="code-example">{`fishbowl_bom_num,fishbowl_so_num,fishbowl_wo_num,version_name,step_code,worker_name,work_date,start_time,end_time,units_produced
0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,A1A,Maria Garcia,2025-01-05,07:00,11:00,120
0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,A1A,Maria Garcia,2025-01-05,12:00,16:00,115
0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,A1B,John Smith,2025-01-06,08:00,12:00,100
0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,A1B,John Smith,2025-01-06,13:00,17:00,95
0707-ROLL-BLACK,SO-1234,WO-567,v1.0 Standard,SEW-01,Ana Rodriguez,2025-01-07,07:00,15:00,80
0808-POUCH-TAN,SO-1235,,v1.0,M1,Carlos Martinez,2025-02-10,09:00,12:00,50`}</pre>
            </div>
          </div>

          <div className="upload-section">
            <h2>Upload Your File</h2>

            <div className="form-group">
              <label htmlFor="file">Select File (.csv, .tsv)</label>
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
                placeholder="Paste your CSV content here..."
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={deriveProficiencies}
                  onChange={(e) => setDeriveProficiencies(e.target.checked)}
                />
                Automatically derive worker proficiencies from performance data
              </label>
            </div>

            <button
              className="btn btn-primary"
              onClick={handlePreview}
              disabled={!content.trim() || loading}
            >
              {loading ? 'Processing...' : 'Preview Import'}
            </button>
          </div>
        </>
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
                    {err.row && <span className="row-num">Row {err.row}: </span>}
                    {err.field && <strong>{err.field}: </strong>}
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
                    {warn.row && <span className="row-num">Row {warn.row}: </span>}
                    {warn.field && <strong>{warn.field}: </strong>}
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
                  <td>Orders to Use</td>
                  <td>{previewData.preview.summary.ordersToUse}</td>
                </tr>
                <tr>
                  <td>Orders to Create</td>
                  <td>{previewData.preview.summary.ordersToCreate}</td>
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
                  <td>Task Assignments to Create</td>
                  <td>{previewData.preview.summary.assignmentsToCreate}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {deriveProficiencies && (
            <div className="proficiency-notice">
              <h4>Proficiency Calculation</h4>
              <p>
                After import, worker proficiencies will be automatically calculated based on
                their performance. This may take a moment for large datasets.
              </p>
            </div>
          )}

          <div className="preview-actions">
            <button className="btn btn-secondary" onClick={() => setPhase('upload')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={previewData.errors.length > 0 || loading}
            >
              {loading ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      {phase === 'success' && confirmResult && (
        <div className="success-section">
          <div className="success-icon">✓</div>
          <h2>Import Successful!</h2>

          <div className="result-summary">
            {confirmResult.result.ordersCreated > 0 && (
              <p>Created {confirmResult.result.ordersCreated} orders</p>
            )}
            {confirmResult.result.schedulesCreated > 0 && (
              <p>Created {confirmResult.result.schedulesCreated} schedules</p>
            )}
            {confirmResult.result.entriesCreated > 0 && (
              <p>Created {confirmResult.result.entriesCreated} schedule entries</p>
            )}
            {confirmResult.result.assignmentsCreated > 0 && (
              <p>Created {confirmResult.result.assignmentsCreated} task assignments</p>
            )}
            {confirmResult.proficiencies && (
              <>
                {confirmResult.proficiencies.proficienciesCreated > 0 && (
                  <p>Created {confirmResult.proficiencies.proficienciesCreated} worker proficiencies</p>
                )}
                {confirmResult.proficiencies.proficienciesUpdated > 0 && (
                  <p>Updated {confirmResult.proficiencies.proficienciesUpdated} worker proficiencies</p>
                )}
              </>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/workers" className="btn btn-primary">
              View Workers
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

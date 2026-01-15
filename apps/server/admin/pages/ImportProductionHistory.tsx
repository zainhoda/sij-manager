import React, { useState } from "react";

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
      schedulesToCreate: number;
      scheduleEntriesCount: number;
      taskAssignmentsCount: number;
      uniqueWorkers: number;
      uniqueSteps: number;
      uniqueOrders: number;
    };
  };
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: {
    schedulesCreated: number;
    scheduleEntriesCreated: number;
    taskAssignmentsCreated: number;
  };
  proficiencies?: {
    proficienciesCreated: number;
    proficienciesUpdated: number;
  };
}

const SAMPLE_CSV_PATH = "/sample-data/sample-production-history.csv";

export default function ImportProductionHistory() {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [deriveProficiencies, setDeriveProficiencies] = useState(true);

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
      const response = await fetch('/api/imports/production-history/preview', {
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
      const response = await fetch('/api/imports/production-history/confirm', {
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

  return (
    <div className="page import-page">
      <div className="page-header">
        <div>
          <h1>Import Production History</h1>
          <p className="page-subtitle">Step 4 of 4 in the import process (Optional)</p>
        </div>
        <div className="import-order-badge">
          <span className="badge badge-secondary">Requires Orders</span>
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
                This CSV imports historical production data — what work was done, by whom, and when.
                Each row represents a work session: a worker performing a specific step for a
                specific order.
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
                    <td><code>product_name</code></td>
                    <td>Yes</td>
                    <td>
                      Product name. Used with <code>due_date</code> to identify the order.
                    </td>
                  </tr>
                  <tr>
                    <td><code>due_date</code></td>
                    <td>Yes</td>
                    <td>
                      Order due date in <code>YYYY-MM-DD</code> format.
                      Used with <code>product_name</code> to identify the order.
                    </td>
                  </tr>
                  <tr>
                    <td><code>version_name</code></td>
                    <td>Yes</td>
                    <td>
                      Build version that was used for production (e.g., "v1.0 Standard").
                      Must match a version from the Products import.
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
                Each row references an order using the composite key of <strong>product_name</strong> and
                <strong> due_date</strong>. Make sure these values match exactly with orders imported
                in the previous step.
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
              <pre className="code-example">{`product_name,due_date,version_name,step_code,worker_name,work_date,start_time,end_time,units_produced
Tactical Vest,2025-01-10,v1.0 Standard,A1A,Maria Garcia,2025-01-05,07:00,11:00,120
Tactical Vest,2025-01-10,v1.0 Standard,A1A,Maria Garcia,2025-01-05,12:00,16:00,115
Tactical Vest,2025-01-10,v1.0 Standard,A1B,John Smith,2025-01-06,08:00,12:00,100
Tactical Vest,2025-01-10,v1.0 Standard,A1B,John Smith,2025-01-06,13:00,17:00,95
Tactical Vest,2025-01-10,v1.0 Standard,SEW-01,Ana Rodriguez,2025-01-07,07:00,15:00,80
Medical Kit Pouch,2025-02-20,v1.0,M1,Carlos Martinez,2025-02-10,09:00,12:00,50`}</pre>
            </div>

            <div className="docs-section">
              <h2>Download Template</h2>
              <p>Download the sample CSV to use as a template:</p>
              <a href={SAMPLE_CSV_PATH} download className="btn btn-secondary">
                Download sample-production-history.csv
              </a>
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
                  <td>Schedules to Create</td>
                  <td>{previewData.preview.summary.schedulesToCreate}</td>
                </tr>
                <tr>
                  <td>Schedule Entries</td>
                  <td>{previewData.preview.summary.scheduleEntriesCount}</td>
                </tr>
                <tr>
                  <td>Task Assignments</td>
                  <td>{previewData.preview.summary.taskAssignmentsCount}</td>
                </tr>
                <tr>
                  <td>Unique Workers</td>
                  <td>{previewData.preview.summary.uniqueWorkers}</td>
                </tr>
                <tr>
                  <td>Unique Steps</td>
                  <td>{previewData.preview.summary.uniqueSteps}</td>
                </tr>
                <tr>
                  <td>Unique Orders Referenced</td>
                  <td>{previewData.preview.summary.uniqueOrders}</td>
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
            {confirmResult.result.schedulesCreated > 0 && (
              <p>Created {confirmResult.result.schedulesCreated} schedules</p>
            )}
            {confirmResult.result.scheduleEntriesCreated > 0 && (
              <p>Created {confirmResult.result.scheduleEntriesCreated} schedule entries</p>
            )}
            {confirmResult.result.taskAssignmentsCreated > 0 && (
              <p>Created {confirmResult.result.taskAssignmentsCreated} task assignments</p>
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

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
  token: string;
  preview: {
    workCategories: number;
    equipment: number;
    workers: number;
    certifications: number;
    sampleWorkers: string[];
    sampleEquipment: string[];
  };
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
}

interface ConfirmResponse {
  success: boolean;
  created: {
    workCategoriesCreated: number;
    equipmentCreated: number;
    workersCreated: number;
    certificationsCreated: number;
  };
}

const SAMPLE_CSV_PATH = "/sample-data/sample-worker-equipment.csv";

export default function ImportWorkerEquipment() {
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
      const response = await fetch('/api/imports/equipment-matrix/preview', {
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
    if (!previewData?.token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/imports/equipment-matrix/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: previewData.token }),
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
          <h1>Import Worker-Equipment Matrix</h1>
          <p className="page-subtitle">Step 1 of 4 in the import process</p>
        </div>
        <div className="import-order-badge">
          <span className="badge badge-info">Import First</span>
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
                This CSV defines your workforce, equipment, costs, and which workers are certified
                to use which equipment. It uses a matrix format where equipment is listed as rows
                and workers are listed as columns.
              </p>
              <p>
                <strong>This must be imported first</strong> because Products and Production History
                reference equipment and workers created here.
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
                    <td><code>equipment_code</code></td>
                    <td>Yes</td>
                    <td>
                      Unique identifier for the equipment (e.g., "STS", "CTL", "CMA").
                      Use <code>_COST</code> for the special worker costs row.
                    </td>
                  </tr>
                  <tr>
                    <td><code>work_category</code></td>
                    <td>Yes</td>
                    <td>
                      The work category for this equipment (e.g., "Sewing", "Cutting", "Inspection").
                      Used for scheduling and capacity planning.
                    </td>
                  </tr>
                  <tr>
                    <td><code>work_type</code></td>
                    <td>Yes</td>
                    <td>
                      Specific type of work within the category (e.g., "Single Needle", "Manual", "QC").
                    </td>
                  </tr>
                  <tr>
                    <td><code>station_count</code></td>
                    <td>Yes</td>
                    <td>
                      Number of stations available. Use <code>100</code> for virtual/unlimited
                      equipment (no capacity constraint).
                    </td>
                  </tr>
                  <tr>
                    <td><code>hourly_cost</code></td>
                    <td>No</td>
                    <td>Equipment operating cost per hour (default: 0).</td>
                  </tr>
                  <tr>
                    <td><code>[Worker Name]</code></td>
                    <td>—</td>
                    <td>
                      Additional columns for each worker. Use <code>Y</code> to indicate
                      the worker is certified for that equipment. In the <code>_COST</code>
                      row, enter the worker's hourly cost instead.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-section">
              <h2>Special _COST Row</h2>
              <p>
                Include a row with <code>equipment_code</code> = <code>_COST</code> to specify
                worker hourly costs. In this row, instead of Y/N for certifications, enter
                each worker's cost per hour (e.g., 25.50).
              </p>
            </div>

            <div className="docs-section">
              <h2>Example</h2>
              <pre className="code-example">{`equipment_code,work_category,work_type,station_count,hourly_cost,Maria Garcia,John Smith,Ana Rodriguez
_COST,,Worker Cost Per Hour,0,0,25.50,22.00,24.00
STS,Sewing,Single Needle,3,5.00,Y,Y,Y
SDN,Sewing,Double Needle,2,8.00,Y,,Y
CTL,Cutting,Team Lead,100,0,Y,Y,
CMA,Cutting,Manual,2,3.00,,Y,Y
INS,Inspection,QC,100,0,Y,Y,Y`}</pre>
            </div>

            <div className="docs-section">
              <h2>Download Template</h2>
              <p>Download the sample CSV to use as a template:</p>
              <a href={SAMPLE_CSV_PATH} download className="btn btn-secondary">
                Download sample-worker-equipment.csv
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

          {(previewData.errors?.length ?? 0) > 0 && (
            <div className="validation-errors">
              <h3>Errors (must fix before importing)</h3>
              <ul>
                {previewData.errors?.map((err, i) => (
                  <li key={i}>
                    {err.row && <span className="row-num">Row {err.row}: </span>}
                    {err.field && <strong>{err.field}: </strong>}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(previewData.warnings?.length ?? 0) > 0 && (
            <div className="validation-warnings">
              <h3>Warnings</h3>
              <ul>
                {previewData.warnings?.map((warn, i) => (
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
                  <td>Work Categories</td>
                  <td>{previewData.preview.workCategories}</td>
                </tr>
                <tr>
                  <td>Equipment</td>
                  <td>{previewData.preview.equipment}</td>
                </tr>
                <tr>
                  <td>Workers</td>
                  <td>{previewData.preview.workers}</td>
                </tr>
                <tr>
                  <td>Certifications</td>
                  <td>{previewData.preview.certifications}</td>
                </tr>
              </tbody>
            </table>

            {previewData.preview.sampleWorkers?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong>Sample Workers:</strong> {previewData.preview.sampleWorkers.join(', ')}
              </div>
            )}
            {previewData.preview.sampleEquipment?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong>Sample Equipment:</strong> {previewData.preview.sampleEquipment.join(', ')}
              </div>
            )}
          </div>

          <div className="preview-actions">
            <button className="btn btn-secondary" onClick={() => setPhase('upload')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={(previewData.errors?.length ?? 0) > 0 || loading}
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
            {confirmResult.created.workCategoriesCreated > 0 && (
              <p>Created {confirmResult.created.workCategoriesCreated} work categories</p>
            )}
            {confirmResult.created.equipmentCreated > 0 && (
              <p>Created {confirmResult.created.equipmentCreated} equipment</p>
            )}
            {confirmResult.created.workersCreated > 0 && (
              <p>Created {confirmResult.created.workersCreated} workers</p>
            )}
            {confirmResult.created.certificationsCreated > 0 && (
              <p>Created {confirmResult.created.certificationsCreated} certifications</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/import/product-steps" className="btn btn-primary">
              Next: Import BOM Steps →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

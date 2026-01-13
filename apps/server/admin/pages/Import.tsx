import React, { useState } from "react";

type ImportPhase = 'upload' | 'preview' | 'success';

interface PreviewSummary {
  equipmentToCreate: number;
  equipmentExisting: number;
  workersToCreate: number;
  workersExisting: number;
  certificationsToCreate: number;
  workCategoriesToCreate: number;
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
    equipment: Array<{ name: string; description: string; action: string }>;
    workers: Array<{ name: string; action: string }>;
    certifications: Array<{ workerName: string; equipmentName: string }>;
    workCategories: string[];
  };
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: {
    workCategoriesCreated: number;
    equipmentCreated: number;
    workersCreated: number;
    certificationsCreated: number;
  };
}

export default function Import() {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('tsv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setContent(text);

    if (file.name.endsWith('.csv')) {
      setFormat('csv');
    } else {
      setFormat('tsv');
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
    if (!previewData?.importToken) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/imports/equipment-matrix/confirm', {
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
      <h1>Import Equipment & Workers</h1>
      <p>Upload a spreadsheet to populate equipment types, workers, and their certifications.</p>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {phase === 'upload' && (
        <div className="upload-section">
          <h2>Upload Equipment-Worker Matrix</h2>

          <p className="description">
            Upload a spreadsheet with equipment types and worker certifications.<br />
            <strong>Format:</strong> Equipment Count, Work Code, Work Type, followed by worker name columns with Y for certifications.
          </p>

          <div className="form-group">
            <label htmlFor="file">Upload File (.tsv, .csv, .txt)</label>
            <input
              type="file"
              id="file"
              accept=".tsv,.csv,.txt"
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
              <option value="tsv">TSV (Tab-separated)</option>
              <option value="csv">CSV (Comma-separated)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="content">Or Paste Content Directly</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder={"Equipment Count\tWork Code\tWork Type\tWorker1\tWorker2\n100\tCTL\tCutting - Team Lead\tY\t\n1\tCMA\tCutting - Manual\tY\tY"}
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
              <>Preview Import →</>
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
                    {err.field && <span className="field-name">{err.field} - </span>}
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
                    {warn.field && <span className="field-name">{warn.field} - </span>}
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
                  <td>Work Categories to Create</td>
                  <td>{previewData.preview.summary.workCategoriesToCreate}</td>
                </tr>
                <tr>
                  <td>Equipment to Create</td>
                  <td>{previewData.preview.summary.equipmentToCreate}</td>
                </tr>
                {previewData.preview.summary.equipmentExisting > 0 && (
                  <tr>
                    <td>Equipment Already Existing</td>
                    <td>{previewData.preview.summary.equipmentExisting}</td>
                  </tr>
                )}
                <tr>
                  <td>Workers to Create</td>
                  <td>{previewData.preview.summary.workersToCreate}</td>
                </tr>
                {previewData.preview.summary.workersExisting > 0 && (
                  <tr>
                    <td>Workers Already Existing</td>
                    <td>{previewData.preview.summary.workersExisting}</td>
                  </tr>
                )}
                <tr>
                  <td>Certifications to Create</td>
                  <td>{previewData.preview.summary.certificationsToCreate}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {previewData.preview.workCategories.length > 0 && (
            <div className="preview-detail">
              <h3>Work Categories</h3>
              <div className="tag-list">
                {previewData.preview.workCategories.map((cat) => (
                  <span key={cat} className="tag">{cat}</span>
                ))}
              </div>
            </div>
          )}

          {previewData.preview.equipment.length > 0 && (
            <div className="preview-detail">
              <h3>Equipment ({previewData.preview.equipment.length})</h3>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.equipment.slice(0, 10).map((e) => (
                    <tr key={e.name}>
                      <td>{e.name}</td>
                      <td>{e.description}</td>
                      <td><span className={`action-badge ${e.action}`}>{e.action}</span></td>
                    </tr>
                  ))}
                  {previewData.preview.equipment.length > 10 && (
                    <tr>
                      <td colSpan={3} className="more-rows">
                        ...and {previewData.preview.equipment.length - 10} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {previewData.preview.workers.length > 0 && (
            <div className="preview-detail">
              <h3>Workers ({previewData.preview.workers.length})</h3>
              <div className="tag-list">
                {previewData.preview.workers.map((w) => (
                  <span key={w.name} className={`tag ${w.action}`}>{w.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="preview-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setPhase('upload')}
            >
              ← Back
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
            {confirmResult.result.workCategoriesCreated > 0 && (
              <p>Created {confirmResult.result.workCategoriesCreated} work categories</p>
            )}
            {confirmResult.result.equipmentCreated > 0 && (
              <p>Created {confirmResult.result.equipmentCreated} equipment types</p>
            )}
            {confirmResult.result.workersCreated > 0 && (
              <p>Created {confirmResult.result.workersCreated} workers</p>
            )}
            {confirmResult.result.certificationsCreated > 0 && (
              <p>Created {confirmResult.result.certificationsCreated} certifications</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/workers" className="btn btn-primary">
              View Workers →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

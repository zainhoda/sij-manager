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
      productsToCreate: number;
      productsExisting: number;
      versionsToCreate: number;
      versionsExisting: number;
      stepsToCreate: number;
      stepsToUpdate: number;
      dependenciesToCreate: number;
      componentsToCreate: number;
    };
  };
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: {
    productsCreated: number;
    versionsCreated: number;
    stepsCreated: number;
    stepsUpdated: number;
    dependenciesCreated: number;
    componentsCreated: number;
  };
}

const SAMPLE_CSV_PATH = "/sample-data/sample-products.csv";

export default function ImportProducts() {
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
      const response = await fetch('/api/imports/products/preview', {
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
      const response = await fetch('/api/imports/products/confirm', {
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
      <div className="page-header">
        <div>
          <h1>Import Products</h1>
          <p className="page-subtitle">Step 2 of 4 in the import process</p>
        </div>
        <div className="import-order-badge">
          <span className="badge badge-secondary">Requires Workers & Equipment</span>
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
                This CSV defines your products, build versions, production steps, and step dependencies.
                Each row represents a single production step. Multiple rows with the same product and
                version create the complete step sequence.
              </p>
              <p>
                <strong>Import this after Worker-Equipment</strong> because steps reference equipment
                codes defined in the previous import.
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
                      Human-readable product name. Multiple rows with the same name belong
                      to the same product.
                    </td>
                  </tr>
                  <tr>
                    <td><code>version_name</code></td>
                    <td>Yes</td>
                    <td>
                      Build version name (e.g., "v1.0 Standard", "v2.0 Lightweight").
                      Different versions can have different steps.
                    </td>
                  </tr>
                  <tr>
                    <td><code>version_number</code></td>
                    <td>Yes</td>
                    <td>
                      Numeric version identifier (1, 2, 3...). Used for ordering versions.
                    </td>
                  </tr>
                  <tr>
                    <td><code>is_default</code></td>
                    <td>No</td>
                    <td>
                      Enter <code>Y</code> if this is the default version for the product.
                      Only one version per product should be marked as default.
                    </td>
                  </tr>
                  <tr>
                    <td><code>step_code</code></td>
                    <td>Yes</td>
                    <td>
                      Unique code within a product/version. Used by other steps to define
                      dependencies (e.g., "A1A", "CUT-01", "SEW-01").
                    </td>
                  </tr>
                  <tr>
                    <td><code>external_id</code></td>
                    <td>No</td>
                    <td>
                      External system identifier for materials supply integration.
                      This is NOT used for dependencies.
                    </td>
                  </tr>
                  <tr>
                    <td><code>category</code></td>
                    <td>Yes</td>
                    <td>
                      Work category (e.g., CUTTING, SEWING, PREP, INSPECTION).
                      Must match categories from Worker-Equipment import.
                    </td>
                  </tr>
                  <tr>
                    <td><code>component</code></td>
                    <td>No</td>
                    <td>
                      Component or sub-assembly name (e.g., "Small Velcro Pocket", "Main Panel").
                    </td>
                  </tr>
                  <tr>
                    <td><code>task_name</code></td>
                    <td>Yes</td>
                    <td>
                      Human-readable description of the step (e.g., "Hem short edges",
                      "Sew hook Velcro").
                    </td>
                  </tr>
                  <tr>
                    <td><code>time_seconds</code></td>
                    <td>Yes</td>
                    <td>
                      Standard time to complete one unit, in seconds.
                    </td>
                  </tr>
                  <tr>
                    <td><code>equipment_code</code></td>
                    <td>No</td>
                    <td>
                      Equipment code from the Worker-Equipment import (e.g., "STS", "CTL").
                      Leave blank if step doesn't require specific equipment.
                    </td>
                  </tr>
                  <tr>
                    <td><code>dependencies</code></td>
                    <td>No</td>
                    <td>
                      Comma-separated list of step_codes that must complete before this step.
                      Optional suffix: <code>:start</code> (can start when dep starts) or
                      <code>:finish</code> (must wait for dep to finish, default).
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-section">
              <h2>Dependencies</h2>
              <p>
                Dependencies control the order steps can be worked on. By default, a step waits
                for its dependencies to <strong>finish</strong> before starting.
              </p>
              <ul>
                <li><code>A1A</code> or <code>A1A:finish</code> — Wait for step A1A to complete</li>
                <li><code>A1A:start</code> — Can start as soon as step A1A has started</li>
                <li><code>A1A,CUT-01</code> — Wait for both A1A and CUT-01 to complete</li>
                <li><code>A1A:finish,CUT-01:start</code> — Mixed dependency types</li>
              </ul>
            </div>

            <div className="docs-section">
              <h2>Example</h2>
              <pre className="code-example">{`product_name,version_name,version_number,is_default,step_code,external_id,category,component,task_name,time_seconds,equipment_code,dependencies
Tactical Vest,v1.0 Standard,1,Y,A1A,MAT-001,SEWING,Small Velcro Pocket,Hem short edges,20,STS,
Tactical Vest,v1.0 Standard,1,Y,A1B,MAT-002,SEWING,Small Velcro Pocket,Sew hook Velcro,25,STS,A1A
Tactical Vest,v1.0 Standard,1,Y,A1C,MAT-003,SEWING,Small Velcro Pocket,Attach to main panel,30,STS,A1B
Tactical Vest,v1.0 Standard,1,Y,CUT-01,MAT-010,CUTTING,Main Panel,Cut main fabric,45,CTL,
Tactical Vest,v1.0 Standard,1,Y,SEW-01,MAT-011,SEWING,Main Panel,Sew main seams,60,STS,CUT-01:finish
Tactical Vest,v1.0 Standard,1,Y,INS-01,,INSPECTION,Final,Quality check,30,INS,SEW-01:finish,A1C:finish`}</pre>
            </div>

            <div className="docs-section">
              <h2>Download Template</h2>
              <p>Download the sample CSV to use as a template:</p>
              <a href={SAMPLE_CSV_PATH} download className="btn btn-secondary">
                Download sample-products.csv
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
                  <td>Products to Create</td>
                  <td>{previewData.preview.summary.productsToCreate}</td>
                </tr>
                <tr>
                  <td>Products Already Existing</td>
                  <td>{previewData.preview.summary.productsExisting}</td>
                </tr>
                <tr>
                  <td>Versions to Create</td>
                  <td>{previewData.preview.summary.versionsToCreate}</td>
                </tr>
                <tr>
                  <td>Versions Already Existing</td>
                  <td>{previewData.preview.summary.versionsExisting}</td>
                </tr>
                <tr>
                  <td>Steps to Create</td>
                  <td>{previewData.preview.summary.stepsToCreate}</td>
                </tr>
                <tr>
                  <td>Steps to Update</td>
                  <td>{previewData.preview.summary.stepsToUpdate}</td>
                </tr>
                <tr>
                  <td>Dependencies to Create</td>
                  <td>{previewData.preview.summary.dependenciesToCreate}</td>
                </tr>
                <tr>
                  <td>Components to Create</td>
                  <td>{previewData.preview.summary.componentsToCreate}</td>
                </tr>
              </tbody>
            </table>
          </div>

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
            {confirmResult.result.productsCreated > 0 && (
              <p>Created {confirmResult.result.productsCreated} products</p>
            )}
            {confirmResult.result.versionsCreated > 0 && (
              <p>Created {confirmResult.result.versionsCreated} versions</p>
            )}
            {confirmResult.result.stepsCreated > 0 && (
              <p>Created {confirmResult.result.stepsCreated} steps</p>
            )}
            {confirmResult.result.stepsUpdated > 0 && (
              <p>Updated {confirmResult.result.stepsUpdated} steps</p>
            )}
            {confirmResult.result.dependenciesCreated > 0 && (
              <p>Created {confirmResult.result.dependenciesCreated} dependencies</p>
            )}
            {confirmResult.result.componentsCreated > 0 && (
              <p>Created {confirmResult.result.componentsCreated} components</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/import/orders" className="btn btn-primary">
              Next: Import Orders →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

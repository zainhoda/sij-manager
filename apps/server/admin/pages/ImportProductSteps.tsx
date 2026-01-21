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

interface BOMPreview {
  fishbowlBomNum: string;
  productAction: 'create' | 'use_existing' | 'link_existing';
  existingProductId?: number;
  existingProductName?: string;
  versions: {
    versionName: string;
    versionNumber: number;
    isDefault: boolean;
    stepCount: number;
  }[];
}

interface PreviewResponse {
  success: boolean;
  preview: {
    boms: BOMPreview[];
    components: { name: string; action: 'create' | 'exists' }[];
    workCategories: string[];
    summary: {
      bomsToProcess: number;
      productsToCreate: number;
      productsToLink: number;
      versionsToCreate: number;
      stepsToCreate: number;
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
    productsLinked: number;
    versionsCreated: number;
    stepsCreated: number;
    dependenciesCreated: number;
    componentsCreated: number;
    workCategoriesCreated: number;
  };
}

interface FishbowlStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

export default function ImportProductSteps() {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
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
      const response = await fetch('/api/imports/product-steps-fb/preview', {
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
      const response = await fetch('/api/imports/product-steps-fb/confirm', {
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

  // Loading state
  if (statusLoading) {
    return (
      <div className="page import-page">
        <div className="page-header">
          <h1>Import Product Steps</h1>
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
          <h1>Import Product Steps</h1>
        </div>
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <AlertCircle size={48} style={{ color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Fishbowl Not Configured</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            Fishbowl connection is required for importing product steps. Set the following environment variables:
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
          <h1>Import Product Steps</h1>
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
          <h1>Import Product Steps</h1>
          <p className="page-subtitle">Import production steps for products linked to Fishbowl BOMs</p>
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
                This CSV imports production steps for products linked to Fishbowl BOMs. Each row represents
                a single production step. The <code>fishbowl_bom_num</code> column links steps to the
                corresponding Fishbowl BOM and sij-manager product.
              </p>
              <p>
                <strong>Import this after linking BOMs to products</strong> via the Fishbowl BOMs page.
                If a BOM is not yet linked, a new product will be created and linked automatically.
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
                      Fishbowl BOM number. This links the steps to the corresponding product.
                      If no product exists for this BOM, one will be created.
                    </td>
                  </tr>
                  <tr>
                    <td><code>version_name</code></td>
                    <td>Yes</td>
                    <td>
                      Build version name (e.g., "v1.0 Standard", "v2.0 Lightweight").
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
                    </td>
                  </tr>
                  <tr>
                    <td><code>step_code</code></td>
                    <td>Yes</td>
                    <td>
                      Unique step code within a BOM/version (e.g., "A1A", "CUT-01").
                    </td>
                  </tr>
                  <tr>
                    <td><code>category</code></td>
                    <td>Yes</td>
                    <td>
                      Work category (e.g., CUTTING, SEWING, PREP, INSPECTION).
                    </td>
                  </tr>
                  <tr>
                    <td><code>component</code></td>
                    <td>No</td>
                    <td>
                      Component or sub-assembly name.
                    </td>
                  </tr>
                  <tr>
                    <td><code>task_name</code></td>
                    <td>Yes</td>
                    <td>
                      Human-readable description of the step.
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
                      Equipment code from the Worker-Equipment import.
                    </td>
                  </tr>
                  <tr>
                    <td><code>dependencies</code></td>
                    <td>No</td>
                    <td>
                      Comma-separated list of step_codes that must complete before this step.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-section">
              <h2>Example</h2>
              <pre className="code-example">{`fishbowl_bom_num,version_name,version_number,is_default,step_code,category,component,task_name,time_seconds,equipment_code,dependencies
0707-ROLL-BLACK,v1.0 Standard,1,Y,A1A,SEWING,Small Velcro Pocket,Hem short edges,20,STS,
0707-ROLL-BLACK,v1.0 Standard,1,Y,A1B,SEWING,Small Velcro Pocket,Sew hook Velcro,25,STS,A1A
0707-ROLL-BLACK,v1.0 Standard,1,Y,A1C,SEWING,Small Velcro Pocket,Attach to main panel,30,STS,A1B
0707-ROLL-BLACK,v1.0 Standard,1,Y,CUT-01,CUTTING,Main Panel,Cut main fabric,45,CTL,
0707-ROLL-BLACK,v1.0 Standard,1,Y,SEW-01,SEWING,Main Panel,Sew main seams,60,STS,CUT-01`}</pre>
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
                  <td>BOMs to Process</td>
                  <td>{previewData.preview.summary.bomsToProcess}</td>
                </tr>
                <tr>
                  <td>Products to Create</td>
                  <td>{previewData.preview.summary.productsToCreate}</td>
                </tr>
                <tr>
                  <td>Products to Link</td>
                  <td>{previewData.preview.summary.productsToLink}</td>
                </tr>
                <tr>
                  <td>Versions to Create</td>
                  <td>{previewData.preview.summary.versionsToCreate}</td>
                </tr>
                <tr>
                  <td>Steps to Create</td>
                  <td>{previewData.preview.summary.stepsToCreate}</td>
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

          {previewData.preview.boms.length > 0 && (
            <div className="preview-details" style={{ marginTop: 24 }}>
              <h3>BOM Details</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 13 }}>Fishbowl BOM</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 13 }}>Action</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 13 }}>Versions</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.boms.map((bom, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{bom.fishbowlBomNum}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {bom.productAction === 'create' && (
                          <span style={{ color: "#22c55e" }}>Create new product</span>
                        )}
                        {bom.productAction === 'link_existing' && (
                          <span style={{ color: "#3b82f6" }}>Link to existing product: {bom.existingProductName}</span>
                        )}
                        {bom.productAction === 'use_existing' && (
                          <span style={{ color: "#64748b" }}>Use existing product: {bom.existingProductName}</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {bom.versions.map((v, vi) => (
                          <div key={vi} style={{ fontSize: 13 }}>
                            {v.versionName} ({v.stepCount} steps)
                            {v.isDefault && <span style={{ color: "#3b82f6", marginLeft: 4 }}>(default)</span>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            {confirmResult.result.productsCreated > 0 && (
              <p>Created {confirmResult.result.productsCreated} products</p>
            )}
            {confirmResult.result.productsLinked > 0 && (
              <p>Linked {confirmResult.result.productsLinked} products to Fishbowl BOMs</p>
            )}
            {confirmResult.result.versionsCreated > 0 && (
              <p>Created {confirmResult.result.versionsCreated} versions</p>
            )}
            {confirmResult.result.stepsCreated > 0 && (
              <p>Created {confirmResult.result.stepsCreated} steps</p>
            )}
            {confirmResult.result.dependenciesCreated > 0 && (
              <p>Created {confirmResult.result.dependenciesCreated} dependencies</p>
            )}
            {confirmResult.result.componentsCreated > 0 && (
              <p>Created {confirmResult.result.componentsCreated} components</p>
            )}
            {confirmResult.result.workCategoriesCreated > 0 && (
              <p>Created {confirmResult.result.workCategoriesCreated} work categories</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/products" className="btn btn-primary">
              View Products
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

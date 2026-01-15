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
    orders: { productName: string; quantity: number; dueDate: string; action: string }[];
    summary: {
      ordersToCreate: number;
      ordersExisting: number;
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
  };
}

const SAMPLE_CSV_PATH = "/sample-data/sample-orders.csv";

export default function ImportOrders() {
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
      const response = await fetch('/api/imports/orders/preview', {
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
      const response = await fetch('/api/imports/orders/confirm', {
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
          <h1>Import Orders</h1>
          <p className="page-subtitle">Step 3 of 4 in the import process</p>
        </div>
        <div className="import-order-badge">
          <span className="badge badge-secondary">Requires Products</span>
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
                This CSV defines your orders. Each row represents a single order for a product.
                Orders are identified by the combination of <strong>product name + due date</strong>,
                which allows the Production History import to reference them.
              </p>
              <p>
                <strong>Import this after Products</strong> because orders reference products.
                Note: Build versions are selected at scheduling time, not when creating orders.
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
                      Product name. Must match a product from the Products import.
                    </td>
                  </tr>
                  <tr>
                    <td><code>quantity</code></td>
                    <td>Yes</td>
                    <td>
                      Number of units in the order.
                    </td>
                  </tr>
                  <tr>
                    <td><code>due_date</code></td>
                    <td>Yes</td>
                    <td>
                      Order due date in <code>YYYY-MM-DD</code> format.
                      This is used (along with product_name) to identify orders in
                      Production History.
                    </td>
                  </tr>
                  <tr>
                    <td><code>status</code></td>
                    <td>No</td>
                    <td>
                      Order status: <code>pending</code>, <code>scheduled</code>,
                      <code>in_progress</code>, or <code>completed</code>.
                      Defaults to <code>pending</code>.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-section">
              <h2>Order Identification</h2>
              <p>
                Orders are uniquely identified by the combination of <strong>product name</strong> and
                <strong> due date</strong>. This composite key is used when importing Production History
                to match work sessions to the correct order.
              </p>
              <p>
                This means you can have multiple orders for the same product, as long as they have
                different due dates.
              </p>
            </div>

            <div className="docs-section">
              <h2>Example</h2>
              <pre className="code-example">{`product_name,quantity,due_date,status
Tactical Vest,500,2025-02-15,completed
Tactical Vest,200,2025-03-01,in_progress
Medical Kit Pouch,100,2025-02-20,pending
Tactical Vest,300,2025-01-10,completed`}</pre>
            </div>

            <div className="docs-section">
              <h2>Download Template</h2>
              <p>Download the sample CSV to use as a template:</p>
              <a href={SAMPLE_CSV_PATH} download className="btn btn-secondary">
                Download sample-orders.csv
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
                  <td>Orders to Create</td>
                  <td>{previewData.preview.summary.ordersToCreate}</td>
                </tr>
                <tr>
                  <td>Orders Already Existing</td>
                  <td>{previewData.preview.summary.ordersExisting}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {previewData.preview.orders.length > 0 && (
            <div className="preview-details">
              <h3>Orders</h3>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Due Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.orders.slice(0, 20).map((order, i) => (
                    <tr key={i}>
                      <td>{order.productName}</td>
                      <td>{order.quantity}</td>
                      <td>{order.dueDate}</td>
                      <td>
                        <span className={`action-badge ${order.action}`}>
                          {order.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {previewData.preview.orders.length > 20 && (
                    <tr>
                      <td colSpan={4} className="more-rows">
                        ...and {previewData.preview.orders.length - 20} more orders
                      </td>
                    </tr>
                  )}
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
            {confirmResult.result.ordersCreated > 0 && (
              <p>Created {confirmResult.result.ordersCreated} orders</p>
            )}
          </div>

          <div className="success-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Import More
            </button>
            <a href="/admin/import/production-history" className="btn btn-primary">
              Next: Import Production History →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

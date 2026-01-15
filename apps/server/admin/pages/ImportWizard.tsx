import React, { useState } from "react";

type ImportStep = 'worker-equipment' | 'products' | 'orders' | 'production-history' | 'complete';
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
  preview: unknown;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  importToken: string;
}

interface ConfirmResponse {
  success: boolean;
  result: Record<string, number>;
  proficiencies?: { proficienciesCreated: number; proficienciesUpdated: number } | null;
}

const IMPORT_STEPS: { key: ImportStep; title: string; description: string; endpoint: string; required: boolean }[] = [
  {
    key: 'worker-equipment',
    title: '1. Worker-Equipment Matrix',
    description: 'Import workers, equipment, certifications, and costs',
    endpoint: 'equipment-matrix',
    required: true,
  },
  {
    key: 'products',
    title: '2. Products',
    description: 'Import products, build versions, steps, and dependencies',
    endpoint: 'products',
    required: true,
  },
  {
    key: 'orders',
    title: '3. Orders',
    description: 'Import historical orders',
    endpoint: 'orders',
    required: true,
  },
  {
    key: 'production-history',
    title: '4. Production History',
    description: 'Import historical production data and derive worker proficiencies',
    endpoint: 'production-history',
    required: false,
  },
];

export default function ImportWizard() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('worker-equipment');
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<ImportStep>>(new Set());

  const currentStepConfig = IMPORT_STEPS.find(s => s.key === currentStep)!;

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
      const response = await fetch(`/api/imports/${currentStepConfig.endpoint}/preview`, {
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
      const body: Record<string, unknown> = { importToken: previewData.importToken };

      // For production history, enable proficiency derivation
      if (currentStep === 'production-history') {
        body.deriveProficiencies = true;
      }

      const response = await fetch(`/api/imports/${currentStepConfig.endpoint}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setConfirmResult(data);
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      setPhase('success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    const currentIndex = IMPORT_STEPS.findIndex(s => s.key === currentStep);
    if (currentIndex < IMPORT_STEPS.length - 1) {
      const nextStep = IMPORT_STEPS[currentIndex + 1]!.key;
      setCurrentStep(nextStep);
      setPhase('upload');
      setContent('');
      setPreviewData(null);
      setConfirmResult(null);
      setError(null);
    } else {
      setCurrentStep('complete');
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const renderPreviewSummary = () => {
    if (!previewData?.preview) return null;

    const summary = (previewData.preview as { summary?: Record<string, number> }).summary;
    if (!summary) return null;

    return (
      <div className="preview-summary">
        <h3>Summary</h3>
        <table className="summary-table">
          <tbody>
            {Object.entries(summary).map(([key, value]) => (
              <tr key={key}>
                <td>{formatKey(key)}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const formatKey = (key: string): string => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace('To Create', ' to Create')
      .replace('To Update', ' to Update');
  };

  const getPlaceholder = (): string => {
    switch (currentStep) {
      case 'worker-equipment':
        return 'equipment_code,work_type,station_count,hourly_cost,Maria Garcia,John Smith\n_COST,Worker Cost Per Hour,0,0,25.50,22.00\nSTS,Sewing - Single Needle,3,5.00,Y,Y';
      case 'products':
        return 'product_name,version_name,version_number,is_default,step_code,external_id,category,component,task_name,time_seconds,equipment_code,dependencies\nTactical Vest,v1.0,1,Y,A1A,MAT-001,SEWING,Pocket,Hem edges,20,STS,';
      case 'orders':
        return 'product_name,version_name,quantity,due_date,status\nTactical Vest,v1.0,500,2025-02-15,completed';
      case 'production-history':
        return 'product_name,due_date,step_code,worker_name,work_date,start_time,end_time,units_produced\nTactical Vest,2025-02-15,A1A,Maria Garcia,2025-02-10,07:00,11:00,120';
      default:
        return '';
    }
  };

  if (currentStep === 'complete') {
    return (
      <div className="page import-wizard">
        <h1>Import Complete!</h1>

        <div className="success-section">
          <div className="success-icon">✓</div>
          <h2>All data has been imported successfully</h2>

          <div className="completed-steps">
            {IMPORT_STEPS.map(step => (
              <div key={step.key} className={`step-status ${completedSteps.has(step.key) ? 'completed' : 'skipped'}`}>
                <span className="status-icon">{completedSteps.has(step.key) ? '✓' : '—'}</span>
                <span className="step-name">{step.title}</span>
              </div>
            ))}
          </div>

          <div className="success-actions">
            <a href="/admin/workers" className="btn btn-secondary">View Workers</a>
            <a href="/admin/products" className="btn btn-secondary">View Products</a>
            <a href="/admin/orders" className="btn btn-primary">View Orders</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page import-wizard">
      <h1>Import Data Wizard</h1>

      <div className="wizard-progress">
        {IMPORT_STEPS.map((step, index) => (
          <div
            key={step.key}
            className={`progress-step ${step.key === currentStep ? 'active' : ''} ${completedSteps.has(step.key) ? 'completed' : ''}`}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-label">{step.title.split('. ')[1]}</div>
          </div>
        ))}
      </div>

      <div className="wizard-content">
        <h2>{currentStepConfig.title}</h2>
        <p className="description">{currentStepConfig.description}</p>

        {error && (
          <div className="error-banner">{error}</div>
        )}

        {phase === 'upload' && (
          <div className="upload-section">
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
                placeholder={getPlaceholder()}
              />
            </div>

            <div className="upload-actions">
              {!currentStepConfig.required && (
                <button
                  className="btn btn-secondary"
                  onClick={handleSkip}
                >
                  Skip This Step
                </button>
              )}
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
          </div>
        )}

        {phase === 'preview' && previewData && (
          <div className="preview-section">
            <h3>Preview</h3>

            {previewData.errors.length > 0 && (
              <div className="validation-errors">
                <h4>Errors (must fix before importing)</h4>
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
                <h4>Warnings</h4>
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

            {renderPreviewSummary()}

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
            <h3>Import Successful!</h3>

            <div className="result-summary">
              {Object.entries(confirmResult.result).map(([key, value]) => (
                value > 0 && <p key={key}>{formatKey(key)}: {value}</p>
              ))}
              {confirmResult.proficiencies && (
                <>
                  {confirmResult.proficiencies.proficienciesCreated > 0 && (
                    <p>Proficiencies Created: {confirmResult.proficiencies.proficienciesCreated}</p>
                  )}
                  {confirmResult.proficiencies.proficienciesUpdated > 0 && (
                    <p>Proficiencies Updated: {confirmResult.proficiencies.proficienciesUpdated}</p>
                  )}
                </>
              )}
            </div>

            <div className="success-actions">
              <button className="btn btn-primary" onClick={handleNext}>
                {IMPORT_STEPS.findIndex(s => s.key === currentStep) < IMPORT_STEPS.length - 1
                  ? 'Next Step'
                  : 'Finish'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

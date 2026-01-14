import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import DataGrid, { Column, CellChangeContext } from "../components/DataGrid";
import MultiSelect from "../components/MultiSelect";
import { Trash2, Plus } from "lucide-react";

interface DependencyDetail {
  stepId: number;
  type: 'start' | 'finish';
}

interface ProductStep {
  id: number;
  product_id: number;
  name: string;
  category: string | null;
  time_per_piece_seconds: number;
  sequence: number;
  step_code: string | null;
  equipment_id: number | null;
  equipment_name: string | null;  // Joined from equipment table
  dependencies: number[];
  dependencyDetails?: DependencyDetail[];
}

interface Product {
  id: number;
  name: string;
  description: string | null;
}

// Upload Steps Modal Types
interface StepsPreviewResponse {
  success: boolean;
  preview: {
    summary: {
      componentsToCreate: number;
      stepsToCreate: number;
      dependenciesToCreate: number;
      workCategoriesToCreate: number;
    };
    components: Array<{ name: string; action: string }>;
    steps: Array<{ stepCode: string; taskName: string; category: string; equipmentCode: string }>;
    workCategories: string[];
  };
  errors: Array<{ row?: number; field?: string; message: string }>;
  warnings: Array<{ row?: number; field?: string; message: string }>;
  importToken: string;
}

// Upload Steps Modal Component
function UploadStepsModal({
  isOpen,
  onClose,
  productId,
  productName,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  productId?: number;
  productName?: string;
  onSuccess: (productId: number) => void;
}) {
  const [phase, setPhase] = useState<'upload' | 'preview' | 'success'>('upload');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'tsv' | 'csv'>('tsv');
  const [newProductName, setNewProductName] = useState(productName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<StepsPreviewResponse | null>(null);
  const [result, setResult] = useState<{ productId: number; stepsCreated: number } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('upload');
      setContent('');
      setError(null);
      setPreviewData(null);
      setResult(null);
      setNewProductName(productName || '');
    }
  }, [isOpen, productName]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setFormat(file.name.endsWith('.csv') ? 'csv' : 'tsv');
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { content, format };
      if (productId) {
        body.productId = productId;
      } else {
        body.productName = newProductName || 'New Product';
      }

      const response = await fetch('/api/imports/product-steps/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Preview failed');

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
      const response = await fetch('/api/imports/product-steps/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importToken: previewData.importToken }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Import failed');

      setResult({
        productId: data.productId,
        stepsCreated: data.result.stepsCreated,
      });
      setPhase('success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content import-page" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        {phase === 'upload' && (
          <>
            <h2>Upload Product Steps</h2>
            <p className="description">
              {productId
                ? `Add steps to "${productName}"`
                : 'Create a new product and upload its manufacturing steps.'}
            </p>

            {error && <div className="error-banner">{error}</div>}

            {!productId && (
              <div className="form-group">
                <label htmlFor="productName">Product Name</label>
                <input
                  type="text"
                  id="productName"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Enter product name"
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="stepsFile">Upload File (.tsv, .csv)</label>
              <input
                type="file"
                id="stepsFile"
                accept=".tsv,.csv,.txt"
                onChange={handleFileUpload}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stepsFormat">Format</label>
              <select
                id="stepsFormat"
                value={format}
                onChange={(e) => setFormat(e.target.value as 'tsv' | 'csv')}
              >
                <option value="tsv">TSV (Tab-separated)</option>
                <option value="csv">CSV (Comma-separated)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stepsContent">Or Paste Content</label>
              <textarea
                id="stepsContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Dependency&#9;ID&#9;Category&#9;Component&#9;Task&#9;Time&#9;Equipment code"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={!content.trim() || (!productId && !newProductName.trim()) || loading}
              >
                {loading ? <><span className="spinner" /> Processing...</> : <>Preview →</>}
              </button>
            </div>
          </>
        )}

        {phase === 'preview' && previewData && (
          <>
            <h2>Preview Import</h2>

            {error && <div className="error-banner">{error}</div>}

            {previewData.errors.length > 0 && (
              <div className="validation-errors">
                <h3>Errors</h3>
                <ul>
                  {previewData.errors.map((err, i) => (
                    <li key={i}>
                      {err.row && <span className="row-num">Row {err.row}</span>}
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
                  <tr><td>Steps to Create</td><td>{previewData.preview.summary.stepsToCreate}</td></tr>
                  <tr><td>Dependencies</td><td>{previewData.preview.summary.dependenciesToCreate}</td></tr>
                  <tr><td>Components</td><td>{previewData.preview.summary.componentsToCreate}</td></tr>
                </tbody>
              </table>
            </div>

            {previewData.preview.steps.length > 0 && (
              <div className="preview-detail">
                <h3>Steps ({previewData.preview.steps.length})</h3>
                <table className="preview-table">
                  <thead>
                    <tr><th>ID</th><th>Task</th><th>Category</th><th>Equipment</th></tr>
                  </thead>
                  <tbody>
                    {previewData.preview.steps.slice(0, 8).map((s) => (
                      <tr key={s.stepCode}>
                        <td><code>{s.stepCode}</code></td>
                        <td>{s.taskName}</td>
                        <td>{s.category}</td>
                        <td>{s.equipmentCode || '—'}</td>
                      </tr>
                    ))}
                    {previewData.preview.steps.length > 8 && (
                      <tr><td colSpan={4} className="more-rows">...and {previewData.preview.steps.length - 8} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPhase('upload')}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={previewData.errors.length > 0 || loading}
              >
                {loading ? <><span className="spinner" /> Importing...</> : <>Confirm Import</>}
              </button>
            </div>
          </>
        )}

        {phase === 'success' && result && (
          <div className="success-section" style={{ padding: '32px 0' }}>
            <div className="success-icon">✓</div>
            <h2>Import Successful!</h2>
            <p style={{ color: '#64748b', marginBottom: '24px' }}>
              Created {result.stepsCreated} steps
            </p>
            <button
              className="btn btn-primary"
              onClick={() => onSuccess(result.productId)}
            >
              View Product →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  CUTTING: "#ef4444",
  SILKSCREEN: "#f97316",
  PREP: "#eab308",
  SEWING: "#22c55e",
  INSPECTION: "#3b82f6",
};

const CATEGORY_ORDER = ["CUTTING", "SILKSCREEN", "PREP", "SEWING", "INSPECTION"];

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function StepNode({ data }: { data: { label: string; category: string; time: number } }) {
  const bgColor = CATEGORY_COLORS[data.category] || "#6b7280";
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "8px",
        background: bgColor,
        color: "white",
        minWidth: "140px",
        textAlign: "center",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#fff" }} />
      <div style={{ fontWeight: 600, marginBottom: "4px" }}>{data.label}</div>
      <div style={{ fontSize: "11px", opacity: 0.9 }}>{data.category}</div>
      <div style={{ fontSize: "10px", opacity: 0.8 }}>{data.time}s/piece</div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#fff" }} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchProducts = useCallback(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleUploadSuccess = (productId: number) => {
    setShowUploadModal(false);
    // Navigate to the new product
    window.location.href = `/admin/products/${productId}`;
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Products</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1>Products</h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>
            Select a product to view its manufacturing step flow
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowUploadModal(true)}
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          + Create Product
        </button>
      </div>
      <div style={{ display: "grid", gap: "12px", maxWidth: "600px" }}>
        {products.length === 0 ? (
          <p style={{ color: "#64748b" }}>No products found. Click "Create Product" to add one with steps.</p>
        ) : (
          products.map((product) => (
            <a
              key={product.id}
              href={`/admin/products/${product.id}`}
              style={{
                display: "block",
                padding: "16px",
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(59, 130, 246, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>{product.name}</div>
              {product.description && (
                <div style={{ fontSize: "13px", color: "#64748b" }}>{product.description}</div>
              )}
            </a>
          ))
        )}
      </div>

      <UploadStepsModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

interface Equipment {
  id: number;
  name: string;
  status: string;
}

export default function ProductSteps({ params }: { params: { id: string } }) {
  const productId = params?.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [steps, setSteps] = useState<ProductStep[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStep, setNewStep] = useState({ step_code: "", name: "", category: "", time_per_piece_seconds: 60 });
  const [addError, setAddError] = useState<string | null>(null);

  const fetchProductData = useCallback(async () => {
    if (!productId) return;
    try {
      const [productRes, stepsRes, equipmentRes] = await Promise.all([
        fetch(`/api/products/${productId}`),
        fetch(`/api/products/${productId}/steps`),
        fetch(`/api/equipment`),
      ]);

      if (productRes.ok) {
        setProduct(await productRes.json());
      }
      if (stepsRes.ok) {
        setSteps(await stepsRes.json());
      }
      if (equipmentRes.ok) {
        setEquipment(await equipmentRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch product data:", err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProductData();
  }, [fetchProductData]);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    fetchProductData();
  };

  const handleAddStep = async () => {
    if (!newStep.step_code.trim() || !newStep.name.trim()) {
      setAddError("Step code and name are required");
      return;
    }

    try {
      const response = await fetch(`/api/products/${productId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_code: newStep.step_code.trim(),
          name: newStep.name.trim(),
          category: newStep.category || null,
          time_per_piece_seconds: newStep.time_per_piece_seconds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setAddError(error.error || "Failed to create step");
        return;
      }

      const createdStep = await response.json();
      setSteps((prev) => [...prev, { ...createdStep, dependencies: [] }]);
      setNewStep({ step_code: "", name: "", category: "", time_per_piece_seconds: 60 });
      setShowAddForm(false);
      setAddError(null);
    } catch (err) {
      setAddError("Network error");
    }
  };

  const handleDeleteStep = useCallback(async (stepId: number) => {
    if (!confirm("Are you sure you want to delete this step? This will also remove any dependencies.")) {
      return;
    }

    try {
      const response = await fetch(`/api/product-steps/${stepId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete step");
        return;
      }

      setSteps((prev) => prev.filter((s) => s.id !== stepId));
    } catch (err) {
      alert("Network error");
    }
  }, []);

  useEffect(() => {
    if (steps.length === 0) return;

    // Create initial nodes
    const initialNodes: Node[] = steps.map((step) => {
      const cat = step.category || "OTHER";
      return {
        id: String(step.id),
        type: "step",
        position: { x: 0, y: 0 }, // Will be set by dagre
        data: {
          label: step.name,
          category: cat,
          time: step.time_per_piece_seconds,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });

    // Create edges from dependencies with type-based styling
    const initialEdges: Edge[] = [];
    for (const step of steps) {
      // Use dependencyDetails if available, otherwise fall back to simple dependencies
      const deps = step.dependencyDetails || step.dependencies.map(id => ({ stepId: id, type: 'finish' as const }));
      for (const dep of deps) {
        const isStartDep = dep.type === 'start';
        initialEdges.push({
          id: `${dep.stepId}-${step.id}`,
          source: String(dep.stepId),
          target: String(step.id),
          animated: !isStartDep, // Only animate finish dependencies
          style: {
            stroke: isStartDep ? "#22c55e" : "#64748b", // Green for start, gray for finish
            strokeWidth: 2,
            strokeDasharray: isStartDep ? "5,5" : undefined, // Dashed for start
          },
          label: isStartDep ? "start" : undefined,
          labelStyle: { fontSize: 10, fill: "#22c55e" },
          labelBgStyle: { fill: "white", fillOpacity: 0.8 },
        });
      }
    }

    // Apply dagre layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [steps, setNodes, setEdges]);

  // Helper to save dependencies immediately (used by both handleCellChange and direct onToggle)
  const saveDependencies = useCallback(async (
    stepId: number,
    depType: 'start' | 'finish',
    newIds: number[],
    currentRow: ProductStep
  ) => {
    const otherType = depType === 'start' ? 'finish' : 'start';

    // Get existing deps of the other type
    const existingOther = (currentRow.dependencyDetails || []).filter(d => d.type === otherType);

    // Combine new deps with existing deps of the other type
    const newDepDetails = [
      ...existingOther,
      ...newIds.map(id => ({ stepId: id, type: depType }))
    ];

    console.log("Saving dependencies:", { stepId, depType, newIds, combined: newDepDetails });

    // Optimistic update
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? {
        ...s,
        dependencies: newDepDetails.map(d => d.stepId),
        dependencyDetails: newDepDetails
      } : s))
    );

    try {
      const response = await fetch(`/api/product-steps/${stepId}/dependencies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencies: newDepDetails }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Update failed:", error);
        // Revert
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, dependencies: currentRow.dependencies, dependencyDetails: currentRow.dependencyDetails } : s))
        );
      } else {
        const updated = await response.json();
        console.log("Dependencies updated:", updated);
        // Update with server response
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, dependencies: updated.dependencies, dependencyDetails: updated.dependencyDetails } : s))
        );
      }
    } catch (err) {
      console.error("Network error:", err);
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, dependencies: currentRow.dependencies, dependencyDetails: currentRow.dependencyDetails } : s))
      );
    }
  }, []);

  // Handle cell changes with metadata-aware routing
  const handleCellChange = useCallback(
    async ({ rowId, key, value, row, column }: CellChangeContext<ProductStep>) => {
      // Skip columns that save immediately in their onChange handlers
      if (key === "startDependencies" || key === "finishDependencies" || key === "equipment_id" || key === "category") {
        return;
      }

      // Standard field update
      const table = column.meta?.table || "product_steps";
      const foreignKeyField = column.meta?.foreignKey || "id";
      const updateId = row[foreignKeyField as keyof ProductStep];

      console.log("Cell Change:", {
        table,
        field: String(key),
        value,
        updateId,
      });

      // Update local state optimistically
      setSteps((prev) =>
        prev.map((s) => (s.id === rowId ? { ...s, [key]: value } : s))
      );

      // Make API call based on metadata
      const endpointMap: Record<string, string> = {
        product_steps: "product-steps",
        equipment: "equipment",
      };
      const endpoint = column.meta?.endpoint || `/api/${endpointMap[table] || table}/${updateId}`;

      try {
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("Update failed:", error);
          setSteps((prev) =>
            prev.map((s) => (s.id === rowId ? { ...s, [key]: row[key] } : s))
          );
        } else {
          const updated = await response.json();
          console.log("Updated:", updated);
          // Update with server response (includes joined fields like equipment_name)
          setSteps((prev) =>
            prev.map((s) => (s.id === rowId ? { ...s, ...updated, dependencies: s.dependencies } : s))
          );
        }
      } catch (err) {
        console.error("Network error:", err);
        setSteps((prev) =>
          prev.map((s) => (s.id === rowId ? { ...s, [key]: row[key] } : s))
        );
      }
    },
    []
  );

  // Column definitions with metadata for update routing
  const stepColumns: Column<ProductStep>[] = useMemo(
    () => [
      {
        key: "step_code",
        header: "Step Code",
        width: 100,
        editable: true,
        meta: { table: "product_steps", foreignKey: "id" },
        render: (value) => (
          <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
            {String(value || "—")}
          </span>
        ),
      },
      {
        key: "name",
        header: "Step Name",
        width: 200,
        editable: true,
        meta: { table: "product_steps", foreignKey: "id" },
      },
      {
        key: "category",
        header: "Category",
        width: 120,
        editable: true,
        meta: { table: "product_steps", foreignKey: "id" },
        render: (value) => {
          const cat = String(value || "");
          const color = CATEGORY_COLORS[cat] || "#6b7280";
          return (
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "4px",
                background: color,
                color: "white",
                fontSize: "11px",
                fontWeight: 500,
              }}
            >
              {cat || "—"}
            </span>
          );
        },
        renderEdit: (value, onChange, onCommit, onCancel, row) => (
          <select
            className="cell-edit-select"
            value={String(value || "")}
            onChange={async (e) => {
              const newVal = e.target.value || null;
              onChange(newVal);

              // Save immediately
              setSteps((prev) =>
                prev.map((s) => (s.id === row.id ? { ...s, category: newVal } : s))
              );

              try {
                const response = await fetch(`/api/product-steps/${row.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ category: newVal }),
                });
                if (response.ok) {
                  const updated = await response.json();
                  setSteps((prev) =>
                    prev.map((s) => (s.id === row.id ? { ...s, ...updated, dependencies: s.dependencies, dependencyDetails: s.dependencyDetails } : s))
                  );
                }
              } catch (err) {
                console.error("Failed to update category:", err);
              }

              onCommit();
            }}
            onBlur={() => {}}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
          >
            <option value="">—</option>
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "time_per_piece_seconds",
        header: "Time (sec)",
        width: 100,
        editable: true,
        meta: { table: "product_steps", foreignKey: "id" },
        render: (value) => `${value}s`,
        renderEdit: (value, onChange, onCommit, onCancel) => (
          <input
            type="number"
            className="cell-edit-input"
            value={value ?? ""}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
          />
        ),
      },
      {
        key: "equipment_id",
        header: "Equipment",
        width: 180,
        editable: true,
        meta: { table: "product_steps", foreignKey: "id" },
        render: (value, row) => (
          <span style={{ color: row.equipment_name ? "inherit" : "#9ca3af" }}>
            {row.equipment_name || "None"}
          </span>
        ),
        renderEdit: (value, onChange, onCommit, onCancel, row) => (
          <select
            className="cell-edit-select"
            value={value ?? ""}
            onChange={async (e) => {
              const newVal = e.target.value ? parseInt(e.target.value) : null;
              onChange(newVal as any);

              // Save immediately - don't wait for onCommit
              const equipmentName = newVal ? equipment.find(eq => eq.id === newVal)?.name : null;
              setSteps((prev) =>
                prev.map((s) => (s.id === row.id ? { ...s, equipment_id: newVal, equipment_name: equipmentName } : s))
              );

              try {
                const response = await fetch(`/api/product-steps/${row.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ equipment_id: newVal }),
                });
                if (response.ok) {
                  const updated = await response.json();
                  setSteps((prev) =>
                    prev.map((s) => (s.id === row.id ? { ...s, ...updated, dependencies: s.dependencies, dependencyDetails: s.dependencyDetails } : s))
                  );
                }
              } catch (err) {
                console.error("Failed to update equipment:", err);
              }

              onCommit();
            }}
            onBlur={() => {}} // Don't save on blur - already saved on change
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
          >
            <option value="">None</option>
            {equipment
              .filter((eq) => eq.status === "available" || eq.id === value)
              .map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
          </select>
        ),
      },
      {
        key: "startDependencies" as keyof ProductStep,
        header: "Starts With",
        width: 160,
        editable: true,
        meta: { table: "step_dependencies", foreignKey: "id", depType: "start" },
        render: (_value, row) => {
          const deps = (row.dependencyDetails || []).filter(d => d.type === 'start');
          if (deps.length === 0) {
            return <span style={{ color: "#9ca3af" }}>—</span>;
          }
          return (
            <span style={{ fontSize: "12px" }}>
              {deps.map((dep) => {
                const depStep = steps.find((s) => s.id === dep.stepId);
                return depStep?.step_code || `?${dep.stepId}`;
              }).join(", ")}
            </span>
          );
        },
        renderEdit: (_value, onChange, onCommit, _onCancel, row) => {
          const startDeps = (row.dependencyDetails || []).filter(d => d.type === 'start').map(d => d.stepId);
          const availableSteps = steps.filter((s) => s.id !== row.id);
          const options = availableSteps.map((s) => ({
            value: s.id,
            label: `${s.step_code} - ${s.name}`,
          }));

          return (
            <MultiSelect
              options={options}
              value={startDeps}
              onChange={(newValue) => onChange(newValue as any)}
              onToggle={(newValue) => {
                console.log("onToggle called for start deps:", { stepId: row.id, newValue });
                saveDependencies(row.id, 'start', newValue as number[], row);
              }}
              onClose={onCommit}
              placeholder="Select steps..."
              autoFocus
            />
          );
        },
      },
      {
        key: "finishDependencies" as keyof ProductStep,
        header: "After These Finish",
        width: 180,
        editable: true,
        meta: { table: "step_dependencies", foreignKey: "id", depType: "finish" },
        render: (_value, row) => {
          const deps = (row.dependencyDetails || []).filter(d => d.type === 'finish');
          if (deps.length === 0) {
            return <span style={{ color: "#9ca3af" }}>—</span>;
          }
          return (
            <span style={{ fontSize: "12px" }}>
              {deps.map((dep) => {
                const depStep = steps.find((s) => s.id === dep.stepId);
                return depStep?.step_code || `?${dep.stepId}`;
              }).join(", ")}
            </span>
          );
        },
        renderEdit: (_value, onChange, onCommit, _onCancel, row) => {
          const finishDeps = (row.dependencyDetails || []).filter(d => d.type === 'finish').map(d => d.stepId);
          const availableSteps = steps.filter((s) => s.id !== row.id);
          const options = availableSteps.map((s) => ({
            value: s.id,
            label: `${s.step_code} - ${s.name}`,
          }));

          return (
            <MultiSelect
              options={options}
              value={finishDeps}
              onChange={(newValue) => onChange(newValue as any)}
              onToggle={(newValue) => saveDependencies(row.id, 'finish', newValue as number[], row)}
              onClose={onCommit}
              placeholder="Select steps..."
              autoFocus
            />
          );
        },
      },
      {
        key: "id" as keyof ProductStep,
        header: "",
        width: 50,
        editable: false,
        sortable: false,
        render: (value) => (
          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteStep(value as number);
            }}
            title="Delete step"
          >
            <Trash2 size={14} />
          </button>
        ),
      },
    ],
    [steps, equipment, handleDeleteStep, saveDependencies]
  );

  if (!productId) {
    return <ProductList />;
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Loading...</h1>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h1>{product?.name || "Product"} - Step Flow</h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>
            {steps.length} steps • Dependencies shown as animated edges
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => setShowUploadModal(true)}
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          Upload Steps
        </button>
      </div>
      <div style={{ width: "100%", height: "400px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background color="#e2e8f0" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => CATEGORY_COLORS[node.data?.category as string] || "#6b7280"}
            maskColor="rgba(255, 255, 255, 0.8)"
          />
        </ReactFlow>
      </div>
      <div style={{ marginTop: "16px", marginBottom: "24px", display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "4px",
                  background: CATEGORY_COLORS[cat],
                }}
              />
              <span style={{ fontSize: "12px", color: "#64748b" }}>{cat}</span>
            </div>
          ))}
        </div>
        <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "24px", display: "flex", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "24px", height: "2px", background: "#64748b" }} />
            <span style={{ fontSize: "12px", color: "#64748b" }}>After finish</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "24px", height: "2px", background: "#22c55e", backgroundImage: "repeating-linear-gradient(90deg, #22c55e 0, #22c55e 5px, transparent 5px, transparent 10px)" }} />
            <span style={{ fontSize: "12px", color: "#64748b" }}>Starts with</span>
          </div>
        </div>
      </div>

      {/* Spreadsheet view */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
          Step Details
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ fontSize: "13px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}
        >
          {showAddForm ? "Cancel" : <><Plus size={14} /> Add Step</>}
        </button>
      </div>

      {showAddForm && (
        <div style={{
          marginBottom: "16px",
          padding: "16px",
          background: "#f8fafc",
          borderRadius: "8px",
          border: "1px solid #e2e8f0"
        }}>
          {addError && (
            <div style={{ color: "#ef4444", marginBottom: "12px", fontSize: "13px" }}>
              {addError}
            </div>
          )}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 100px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                Step Code *
              </label>
              <input
                type="text"
                value={newStep.step_code}
                onChange={(e) => setNewStep({ ...newStep, step_code: e.target.value })}
                placeholder="S30"
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "13px"
                }}
              />
            </div>
            <div style={{ flex: "1", minWidth: "200px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                Step Name *
              </label>
              <input
                type="text"
                value={newStep.name}
                onChange={(e) => setNewStep({ ...newStep, name: e.target.value })}
                placeholder="Enter step name"
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "13px"
                }}
              />
            </div>
            <div style={{ flex: "0 0 120px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                Category
              </label>
              <select
                value={newStep.category}
                onChange={(e) => setNewStep({ ...newStep, category: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "13px"
                }}
              >
                <option value="">—</option>
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 100px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                Time (sec)
              </label>
              <input
                type="number"
                value={newStep.time_per_piece_seconds}
                onChange={(e) => setNewStep({ ...newStep, time_per_piece_seconds: parseInt(e.target.value) || 60 })}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "13px"
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={handleAddStep}
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <DataGrid
        data={steps}
        columns={stepColumns}
        onCellChange={handleCellChange}
        searchPlaceholder="Search steps..."
        height="300px"
      />

      <UploadStepsModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        productId={Number(productId)}
        productName={product?.name}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

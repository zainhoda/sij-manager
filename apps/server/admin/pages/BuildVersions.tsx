import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, Copy, Star, Plus, Trash2, ChevronRight } from "lucide-react";

interface ProductStep {
  id: number;
  name: string;
  step_code: string | null;
  time_per_piece_seconds: number;
  category: string | null;
  build_sequence?: number;
}

interface BuildVersion {
  id: number;
  product_id: number;
  version_name: string;
  version_number: number;
  description: string | null;
  status: 'draft' | 'active' | 'deprecated';
  is_default: number;
  created_at: string;
  steps?: ProductStep[];
}

interface Product {
  id: number;
  name: string;
}

export default function BuildVersions({ params }: { params: { id: string } }) {
  const productId = params?.id;
  const [product, setProduct] = useState<Product | null>(null);
  const [versions, setVersions] = useState<BuildVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<BuildVersion | null>(null);
  const [availableSteps, setAvailableSteps] = useState<ProductStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');
  const [cloneFromId, setCloneFromId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [productRes, versionsRes] = await Promise.all([
        fetch(`/api/products/${productId}`),
        fetch(`/api/products/${productId}/build-versions`),
      ]);

      if (productRes.ok) {
        setProduct(await productRes.json() as Product);
      }
      if (versionsRes.ok) {
        const data = await versionsRes.json() as BuildVersion[];
        setVersions(data);
        // Select the default version by default
        const defaultVersion = data.find((v) => v.is_default);
        if (defaultVersion) {
          await selectVersion(defaultVersion.id);
        } else if (data.length > 0 && data[0]) {
          await selectVersion(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const selectVersion = async (versionId: number) => {
    try {
      const [versionRes, availableRes] = await Promise.all([
        fetch(`/api/build-versions/${versionId}`),
        fetch(`/api/build-versions/${versionId}/available-steps`),
      ]);

      if (versionRes.ok) {
        setSelectedVersion(await versionRes.json() as BuildVersion);
      }
      if (availableRes.ok) {
        setAvailableSteps(await availableRes.json() as ProductStep[]);
      }
    } catch (err) {
      console.error("Failed to fetch version details:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!newVersionName.trim()) {
      setCreateError("Version name is required");
      return;
    }

    try {
      const response = await fetch(`/api/products/${productId}/build-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version_name: newVersionName.trim(),
          description: newVersionDescription.trim() || null,
          clone_from_id: cloneFromId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        setCreateError(errorData.error || 'Failed to create version');
        return;
      }

      const created = await response.json() as BuildVersion;
      setVersions(prev => [created, ...prev]);
      setShowCreateModal(false);
      setNewVersionName('');
      setNewVersionDescription('');
      setCloneFromId(null);
      setCreateError(null);
      await selectVersion(created.id);
    } catch (err) {
      setCreateError('Network error');
    }
  };

  const handleSetDefault = async (versionId: number) => {
    try {
      const response = await fetch(`/api/build-versions/${versionId}/set-default`, {
        method: 'POST',
      });

      if (response.ok) {
        setVersions(prev => prev.map(v => ({
          ...v,
          is_default: v.id === versionId ? 1 : 0,
        })));
        if (selectedVersion?.id === versionId) {
          setSelectedVersion(prev => prev ? { ...prev, is_default: 1 } : null);
        }
      }
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  };

  const handleActivate = async (versionId: number) => {
    try {
      const response = await fetch(`/api/build-versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });

      if (response.ok) {
        const updated = await response.json() as BuildVersion;
        setVersions(prev => prev.map(v => v.id === versionId ? updated : v));
        if (selectedVersion?.id === versionId) {
          setSelectedVersion(updated);
        }
      }
    } catch (err) {
      console.error('Failed to activate:', err);
    }
  };

  const handleAddStep = async (stepId: number) => {
    if (!selectedVersion) return;

    try {
      const response = await fetch(`/api/build-versions/${selectedVersion.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_step_id: stepId }),
      });

      if (response.ok) {
        await selectVersion(selectedVersion.id);
      }
    } catch (err) {
      console.error('Failed to add step:', err);
    }
  };

  const handleRemoveStep = async (stepId: number) => {
    if (!selectedVersion) return;

    try {
      const response = await fetch(`/api/build-versions/${selectedVersion.id}/steps/${stepId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await selectVersion(selectedVersion.id);
      }
    } catch (err) {
      console.error('Failed to remove step:', err);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Loading...</h1>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page">
        <h1>Product not found</h1>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ marginBottom: "16px" }}>
        <Link href={`/products/${productId}`} style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#64748b", textDecoration: "none", fontSize: "14px" }}>
          <ArrowLeft size={16} /> Back to {product.name}
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1>{product.name} - Build Versions</h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>
            Manage which steps are included in each build version
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCloneFromId(selectedVersion?.id || null);
            setShowCreateModal(true);
          }}
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Plus size={16} /> New Version
        </button>
      </div>

      <div style={{ display: "flex", gap: "24px" }}>
        {/* Version List */}
        <div style={{ width: "300px", flexShrink: 0 }}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "#64748b" }}>
            Versions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {versions.map(version => (
              <div
                key={version.id}
                onClick={() => selectVersion(version.id)}
                style={{
                  padding: "12px 16px",
                  background: selectedVersion?.id === version.id ? "#eff6ff" : "white",
                  border: `1px solid ${selectedVersion?.id === version.id ? "#3b82f6" : "#e2e8f0"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: 600 }}>{version.version_name}</span>
                    {version.is_default === 1 && (
                      <Star size={14} fill="#f59e0b" color="#f59e0b" />
                    )}
                  </div>
                  <ChevronRight size={16} color="#9ca3af" />
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: version.status === 'active' ? '#dcfce7' : version.status === 'draft' ? '#fef3c7' : '#f1f5f9',
                      color: version.status === 'active' ? '#166534' : version.status === 'draft' ? '#92400e' : '#64748b',
                    }}
                  >
                    {version.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Version Details */}
        {selectedVersion && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "4px" }}>
                  {selectedVersion.version_name}
                </h2>
                {selectedVersion.description && (
                  <p style={{ color: "#64748b", fontSize: "14px" }}>{selectedVersion.description}</p>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {selectedVersion.status === 'draft' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleActivate(selectedVersion.id)}
                    style={{ fontSize: "13px" }}
                  >
                    Activate
                  </button>
                )}
                {selectedVersion.is_default !== 1 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleSetDefault(selectedVersion.id)}
                    style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Star size={14} /> Set as Default
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCloneFromId(selectedVersion.id);
                    setNewVersionName(`${selectedVersion.version_name} (copy)`);
                    setShowCreateModal(true);
                  }}
                  style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Copy size={14} /> Clone
                </button>
              </div>
            </div>

            {/* Steps in Version */}
            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                Steps in this Version ({selectedVersion.steps?.length || 0})
              </h3>
              <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                {selectedVersion.steps && selectedVersion.steps.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Seq</th>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Code</th>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Name</th>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Category</th>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Time</th>
                        <th style={{ padding: "10px 16px", width: "50px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVersion.steps.map((step, idx) => (
                        <tr key={step.id} style={{ borderBottom: idx < selectedVersion.steps!.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                          <td style={{ padding: "10px 16px", fontSize: "13px", color: "#64748b" }}>{step.build_sequence || idx + 1}</td>
                          <td style={{ padding: "10px 16px", fontSize: "13px", fontFamily: "monospace" }}>{step.step_code || "—"}</td>
                          <td style={{ padding: "10px 16px", fontSize: "13px" }}>{step.name}</td>
                          <td style={{ padding: "10px 16px", fontSize: "13px" }}>{step.category || "—"}</td>
                          <td style={{ padding: "10px 16px", fontSize: "13px" }}>{step.time_per_piece_seconds}s</td>
                          <td style={{ padding: "10px 16px" }}>
                            <button
                              onClick={() => handleRemoveStep(step.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "4px" }}
                              title="Remove from version"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    No steps in this version yet. Add steps from the available list below.
                  </div>
                )}
              </div>
            </div>

            {/* Available Steps to Add */}
            {availableSteps.length > 0 && (
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                  Available Steps ({availableSteps.length})
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {availableSteps.map(step => (
                    <button
                      key={step.id}
                      onClick={() => handleAddStep(step.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "13px",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.currentTarget.style.borderColor = "#3b82f6";
                        e.currentTarget.style.background = "#eff6ff";
                      }}
                      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                        e.currentTarget.style.background = "white";
                      }}
                    >
                      <Plus size={14} />
                      <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{step.step_code || step.id}</span>
                      <span>{step.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Version Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            <h2>Create New Build Version</h2>

            {createError && (
              <div style={{ marginBottom: "16px", padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#dc2626", fontSize: "14px" }}>
                {createError}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="versionName">Version Name *</label>
              <input
                type="text"
                id="versionName"
                value={newVersionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVersionName(e.target.value)}
                placeholder="e.g., v2.0, Without-Maria"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="versionDescription">Description</label>
              <textarea
                id="versionDescription"
                value={newVersionDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewVersionDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            {cloneFromId && (
              <div style={{ marginBottom: "16px", padding: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", fontSize: "14px" }}>
                <strong>Cloning from:</strong> {versions.find(v => v.id === cloneFromId)?.version_name}
                <button
                  onClick={() => setCloneFromId(null)}
                  style={{ marginLeft: "12px", color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Start empty instead
                </button>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>
                Create Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

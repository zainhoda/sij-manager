import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw,
  Plus,
  Search,
  Clock,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit,
  Save,
  X,
  ArrowLeft,
  CheckCircle,
  Link as LinkIcon,
} from "lucide-react";
import { Link } from "wouter";
import MultiSelect from "../components/MultiSelect";

interface StepDependency {
  id: number;
  step_id: number;
  depends_on_step_id: number;
  dependency_type: "start" | "finish";
  lag_seconds: number;
  depends_on_step_name?: string;
}

interface BOMStep {
  id: number;
  fishbowl_bom_id: number;
  fishbowl_bom_num: string;
  name: string;
  step_code: string | null;
  details: string | null;
  time_per_piece_seconds: number;
  sequence: number;
  work_category_id: number | null;
  work_category_name: string | null;
  equipment_id: number | null;
  equipment_name: string | null;
  component_id: number | null;
  component_name: string | null;
  // Dependencies loaded separately
  dependencies?: StepDependency[];
}

interface FishbowlBOM {
  id: number;
  num: string;
  description: string;
}

// Work Instructions from Fishbowl (bominstructionitem table)
interface FishbowlBOMInstruction {
  id: number;
  bomId: number;
  name: string;  // Step label like "Cut 1 / Back", "Screening Dept."
  description: string | null;  // Equipment/method like "Slitter Machine", "Color 1 Front"
  details: string | null;  // Full instructions with dimensions, procedures
  sortOrder: number;
  url: string | null;
}

interface WorkCategory {
  id: number;
  name: string;
}

interface Equipment {
  id: number;
  name: string;
}

// Category colors for flow visualization - matches Fishbowl category names
const CATEGORY_COLORS: Record<string, string> = {
  "Cutting Dept.": "#ef4444",      // Red
  "Screening Dept.": "#f97316",    // Orange
  "Prep": "#eab308",               // Yellow
  "Sewing Dept.": "#22c55e",       // Green
  "Inspection": "#3b82f6",         // Blue
  "Finishing Dept.": "#8b5cf6",    // Purple
  "Packing": "#ec4899",            // Pink
  "Assembly": "#06b6d4",           // Cyan
};

const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#14b8a6",
];

function getCategoryColor(category: string | null): string {
  if (!category) return "#6b7280"; // Gray for uncategorized
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  // Fallback: hash-based color for unknown categories
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]!;
}

// ReactFlow node and layout
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });
  nodes.forEach((node) => g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  Dagre.layout(g);
  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
    }),
    edges,
  };
}

function StepNode({ data }: { data: { label: string; category: string | null; time: number } }) {
  const bgColor = getCategoryColor(data.category);
  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: "8px",
      background: bgColor,
      color: "white",
      minWidth: "140px",
      textAlign: "center",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
    }}>
      <Handle type="target" position={Position.Top} style={{ background: "#fff" }} />
      <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: 13 }}>{data.label}</div>
      {data.category && <div style={{ fontSize: "11px", opacity: 0.9 }}>{data.category}</div>}
      <div style={{ fontSize: "10px", opacity: 0.8 }}>{data.time}s/piece</div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#fff" }} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

export default function BOMSteps() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const urlBomId = urlParams.get("bom");
  const urlBomNum = urlParams.get("bomNum");

  const [steps, setSteps] = useState<BOMStep[]>([]);
  const [boms, setBOMs] = useState<FishbowlBOM[]>([]);
  const [workCategories, setWorkCategories] = useState<WorkCategory[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedBOMs, setExpandedBOMs] = useState<Set<number>>(new Set());
  const [editingStep, setEditingStep] = useState<BOMStep | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBOM, setSelectedBOM] = useState<FishbowlBOM | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fishbowl BOM data when viewing specific BOM
  const [fishbowlBOM, setFishbowlBOM] = useState<FishbowlBOM | null>(null);
  const [fishbowlInstructions, setFishbowlInstructions] = useState<FishbowlBOMInstruction[]>([]);
  const [loadingFishbowl, setLoadingFishbowl] = useState(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Dependencies state per step
  const [stepDependencies, setStepDependencies] = useState<Map<number, StepDependency[]>>(new Map());
  const [editingDepsForStep, setEditingDepsForStep] = useState<number | null>(null);

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/bom-steps");
      const data = await response.json();
      setSteps(data.steps || []);
    } catch (error) {
      console.error("Failed to fetch steps:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBOMs = useCallback(async () => {
    try {
      const response = await fetch("/api/fishbowl/boms?limit=500");
      const data = await response.json();
      setBOMs(data.boms || []);
    } catch (error) {
      console.error("Failed to fetch BOMs:", error);
    }
  }, []);

  const fetchWorkCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/work-categories");
      const data = await response.json();
      setWorkCategories(data.categories || []);
    } catch (error) {
      console.error("Failed to fetch work categories:", error);
    }
  }, []);

  const fetchEquipment = useCallback(async () => {
    try {
      const response = await fetch("/api/equipment");
      const data = await response.json();
      setEquipment(data.equipment || []);
    } catch (error) {
      console.error("Failed to fetch equipment:", error);
    }
  }, []);

  // Fetch Fishbowl BOM and work instructions when viewing a specific BOM
  const fetchFishbowlBOM = useCallback(async (bomId: number) => {
    setLoadingFishbowl(true);
    try {
      // Fetch BOM details and instructions in parallel
      const [bomRes, instrRes] = await Promise.all([
        fetch(`/api/fishbowl/boms/${bomId}`),
        fetch(`/api/fishbowl/boms/${bomId}/instructions`),
      ]);
      const bomData = await bomRes.json();
      const instrData = await instrRes.json();

      if (bomData.bom) {
        setFishbowlBOM(bomData.bom);
      }
      setFishbowlInstructions(instrData.instructions || []);
    } catch (error) {
      console.error("Failed to fetch Fishbowl BOM:", error);
    } finally {
      setLoadingFishbowl(false);
    }
  }, []);

  // Fetch dependencies for a step
  const fetchStepDependencies = useCallback(async (stepId: number) => {
    try {
      const response = await fetch(`/api/bom-steps/${stepId}/dependencies`);
      const data = await response.json();
      setStepDependencies((prev) => {
        const next = new Map(prev);
        next.set(stepId, data.dependencies || []);
        return next;
      });
    } catch (error) {
      console.error("Failed to fetch dependencies:", error);
    }
  }, []);

  // Fetch all dependencies for current BOM steps
  const fetchAllDependencies = useCallback(async (bomSteps: BOMStep[]) => {
    const depsMap = new Map<number, StepDependency[]>();
    await Promise.all(
      bomSteps.map(async (step) => {
        try {
          const response = await fetch(`/api/bom-steps/${step.id}/dependencies`);
          const data = await response.json();
          depsMap.set(step.id, data.dependencies || []);
        } catch (error) {
          console.error(`Failed to fetch dependencies for step ${step.id}:`, error);
          depsMap.set(step.id, []);
        }
      })
    );
    setStepDependencies(depsMap);
  }, []);

  // Add a dependency
  const addDependency = useCallback(async (stepId: number, dependsOnStepId: number, depType: "start" | "finish") => {
    try {
      const response = await fetch(`/api/bom-steps/${stepId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depends_on_step_id: dependsOnStepId,
          dependency_type: depType,
          lag_seconds: 0,
        }),
      });
      if (response.ok) {
        await fetchStepDependencies(stepId);
      }
    } catch (error) {
      console.error("Failed to add dependency:", error);
    }
  }, [fetchStepDependencies]);

  // Remove a dependency
  const removeDependency = useCallback(async (stepId: number, depId: number) => {
    try {
      const response = await fetch(`/api/bom-steps/${stepId}/dependencies/${depId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchStepDependencies(stepId);
      }
    } catch (error) {
      console.error("Failed to remove dependency:", error);
    }
  }, [fetchStepDependencies]);

  useEffect(() => {
    fetchSteps();
    fetchBOMs();
    fetchWorkCategories();
    fetchEquipment();
  }, [fetchSteps, fetchBOMs, fetchWorkCategories, fetchEquipment]);

  // Fetch Fishbowl BOM when viewing specific BOM
  useEffect(() => {
    if (urlBomId) {
      fetchFishbowlBOM(parseInt(urlBomId));
    }
  }, [urlBomId, fetchFishbowlBOM]);

  // Handle URL params - auto-expand or open add modal for specific BOM
  useEffect(() => {
    if (initialized || loading || !urlBomId) return;

    const bomId = parseInt(urlBomId);
    const hasSteps = steps.some((s) => s.fishbowl_bom_id === bomId);

    if (hasSteps) {
      // BOM has steps - expand it
      setExpandedBOMs(new Set([bomId]));
    } else if (urlBomNum && boms.length > 0) {
      // BOM has no steps - open add modal with BOM pre-selected
      const bom = boms.find((b) => b.id === bomId) || { id: bomId, num: urlBomNum, description: "" };
      setSelectedBOM(bom);
      setShowAddModal(true);
    }

    setInitialized(true);
  }, [loading, urlBomId, urlBomNum, steps, boms, initialized]);

  // Group steps by BOM
  const stepsByBOM = new Map<number, { bom: { id: number; num: string }; steps: BOMStep[] }>();
  for (const step of steps) {
    if (!stepsByBOM.has(step.fishbowl_bom_id)) {
      stepsByBOM.set(step.fishbowl_bom_id, {
        bom: { id: step.fishbowl_bom_id, num: step.fishbowl_bom_num },
        steps: [],
      });
    }
    stepsByBOM.get(step.fishbowl_bom_id)!.steps.push(step);
  }

  // Sort steps within each BOM by sequence
  for (const group of stepsByBOM.values()) {
    group.steps.sort((a, b) => a.sequence - b.sequence);
  }

  // Filter by search and URL BOM
  const filteredBOMs = Array.from(stepsByBOM.values()).filter((group) => {
    // If viewing specific BOM from URL, only show that BOM
    if (urlBomId && group.bom.id !== parseInt(urlBomId)) {
      return false;
    }
    // Otherwise filter by search
    return (
      group.bom.num.toLowerCase().includes(search.toLowerCase()) ||
      group.steps.some((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const toggleBOM = (bomId: number) => {
    const newExpanded = new Set(expandedBOMs);
    if (newExpanded.has(bomId)) {
      newExpanded.delete(bomId);
    } else {
      newExpanded.add(bomId);
    }
    setExpandedBOMs(newExpanded);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!confirm("Delete this step?")) return;
    try {
      const response = await fetch(`/api/bom-steps/${stepId}`, { method: "DELETE" });
      if (response.ok) {
        fetchSteps();
      }
    } catch (error) {
      console.error("Failed to delete step:", error);
    }
  };

  const handleSaveStep = async (step: BOMStep) => {
    try {
      const response = await fetch(`/api/bom-steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: step.name,
          step_code: step.step_code,
          time_per_piece_seconds: step.time_per_piece_seconds,
          sequence: step.sequence,
          work_category_id: step.work_category_id,
          equipment_id: step.equipment_id,
        }),
      });
      if (response.ok) {
        setEditingStep(null);
        fetchSteps();
      }
    } catch (error) {
      console.error("Failed to save step:", error);
    }
  };

  const handleAddStep = async (step: Partial<BOMStep>) => {
    if (!selectedBOM) return;
    try {
      const response = await fetch("/api/bom-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fishbowl_bom_id: selectedBOM.id,
          fishbowl_bom_num: selectedBOM.num,
          name: step.name,
          step_code: step.step_code || null,
          time_per_piece_seconds: step.time_per_piece_seconds || 0,
          sequence: step.sequence || 1,
          work_category_id: step.work_category_id || null,
          equipment_id: step.equipment_id || null,
        }),
      });
      if (response.ok) {
        setShowAddModal(false);
        setSelectedBOM(null);
        fetchSteps();
        // Expand the BOM we just added to
        setExpandedBOMs((prev) => new Set([...prev, selectedBOM.id]));
      }
    } catch (error) {
      console.error("Failed to add step:", error);
    }
  };

  // Import a Fishbowl work instruction as a labor step
  // Mapping: instruction.name → work_category, instruction.description → step name, instruction.details → details
  const handleImportInstruction = async (
    instruction: FishbowlBOMInstruction,
    timeSeconds: number,
    equipmentId: number | null,
    workCategoryId: number | null
  ) => {
    if (!urlBomId || !urlBomNum) return;

    // Use description as step name, fall back to instruction name if empty
    const stepName = instruction.description || instruction.name;

    try {
      const response = await fetch("/api/bom-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fishbowl_bom_id: parseInt(urlBomId),
          fishbowl_bom_num: urlBomNum,
          name: stepName,
          step_code: `instr-${instruction.id}`,
          details: instruction.details || null,
          time_per_piece_seconds: timeSeconds,
          sequence: instruction.sortOrder,
          work_category_id: workCategoryId,
          equipment_id: equipmentId,
        }),
      });
      if (response.ok) {
        fetchSteps();
      }
    } catch (error) {
      console.error("Failed to import instruction:", error);
    }
  };

  // Check if a Fishbowl instruction is already imported as a step
  const isInstructionImported = (instruction: FishbowlBOMInstruction) => {
    if (!urlBomId) return false;
    return steps.some(
      (s) => s.fishbowl_bom_id === parseInt(urlBomId) && s.step_code === `instr-${instruction.id}`
    );
  };

  // Get steps for current BOM - memoized to prevent infinite loops
  const currentBOMSteps = useMemo(() => {
    if (!urlBomId) return [];
    return steps.filter((s) => s.fishbowl_bom_id === parseInt(urlBomId));
  }, [urlBomId, steps]);

  // Create a stable key for dependencies to detect changes
  const depsKey = useMemo(() => {
    const entries: string[] = [];
    stepDependencies.forEach((deps, stepId) => {
      deps.forEach((d) => entries.push(`${stepId}:${d.id}:${d.dependency_type}`));
    });
    return entries.sort().join(",");
  }, [stepDependencies]);

  // Fetch dependencies when current BOM steps change
  useEffect(() => {
    if (currentBOMSteps.length > 0) {
      fetchAllDependencies(currentBOMSteps);
    }
  }, [currentBOMSteps, fetchAllDependencies]);

  // Update ReactFlow when steps or dependencies change
  useEffect(() => {
    if (currentBOMSteps.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const initialNodes: Node[] = currentBOMSteps.map((step) => ({
      id: String(step.id),
      type: "step",
      position: { x: 0, y: 0 },
      data: {
        label: step.name,
        category: step.work_category_name,
        time: step.time_per_piece_seconds,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }));

    const initialEdges: Edge[] = [];
    for (const step of currentBOMSteps) {
      const deps = stepDependencies.get(step.id) || [];
      for (const dep of deps) {
        const isStart = dep.dependency_type === "start";
        initialEdges.push({
          id: `${dep.depends_on_step_id}-${step.id}`,
          source: String(dep.depends_on_step_id),
          target: String(step.id),
          animated: !isStart,
          style: {
            stroke: isStart ? "#22c55e" : "#64748b",
            strokeWidth: 2,
            strokeDasharray: isStart ? "5,5" : undefined,
          },
          label: isStart ? "start" : undefined,
          labelStyle: { fontSize: 10, fill: "#22c55e" },
          labelBgStyle: { fill: "white", fillOpacity: 0.8 },
        });
      }
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBOMSteps, depsKey]);

  // Helper to get dependencies for a step by type
  const getStepDeps = (stepId: number, type: "start" | "finish") => {
    const deps = stepDependencies.get(stepId) || [];
    return deps.filter((d) => d.dependency_type === type);
  };

  return (
    <div className="page">
      {urlBomNum && (
        <Link
          href="/fishbowl/boms"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#64748b", textDecoration: "none", marginBottom: 12, fontSize: 14 }}
        >
          <ArrowLeft size={14} />
          Back to BOMs
        </Link>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {urlBomNum ? (
              <>Configure Steps: <span style={{ fontFamily: "monospace" }}>{urlBomNum}</span></>
            ) : (
              "BOM Steps"
            )}
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
            {urlBomNum
              ? "Define the labor steps required to manufacture this product"
              : "Define labor steps for each Fishbowl BOM"
            }
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={fetchSteps}>
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-primary" onClick={() => {
            if (urlBomId && urlBomNum) {
              const bom = boms.find((b) => b.id === parseInt(urlBomId)) || { id: parseInt(urlBomId), num: urlBomNum, description: "" };
              setSelectedBOM(bom);
            }
            setShowAddModal(true);
          }}>
            <Plus size={16} style={{ marginRight: 4 }} />
            Add Step
          </button>
        </div>
      </div>

      {/* Search - only show when viewing all BOMs */}
      {!urlBomId && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ position: "relative", maxWidth: 400 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search by BOM or step name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
        </div>
      )}

      {/* Summary - only show when viewing all BOMs */}
      {!urlBomId && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{stepsByBOM.size}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>BOMs with Steps</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{steps.length}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total Steps</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>
              {formatTime(steps.reduce((sum, s) => sum + s.time_per_piece_seconds, 0))}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total Time (all steps)</div>
          </div>
        </div>
      )}

      {/* BOM-specific view: Flow diagram, instructions, and configured steps */}
      {urlBomId && (
        <>
          {/* Step Flow Diagram */}
          {currentBOMSteps.length > 0 && (
            <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Step Flow</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                    Dependencies shown as edges · Dashed green = starts with, solid gray = after finish
                  </p>
                </div>
              </div>
              <div style={{ height: 300 }}>
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
                    nodeColor={(node) => getCategoryColor(node.data?.category as string | null)}
                    maskColor="rgba(255, 255, 255, 0.8)"
                  />
                </ReactFlow>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Left: Fishbowl Work Instructions */}
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Fishbowl Work Instructions</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  {fishbowlInstructions.length} instructions · Import as labor steps
                </p>
              </div>
              {loadingFishbowl ? (
                <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>Loading...</div>
              ) : fishbowlInstructions.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                  <p>No work instructions found for this BOM</p>
                  <p style={{ fontSize: 12, marginTop: 8 }}>Add instructions in Fishbowl or use "Add Step" to create manually</p>
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflow: "auto" }}>
                  {fishbowlInstructions.map((instruction) => (
                    <InstructionRow
                      key={instruction.id}
                      instruction={instruction}
                      isImported={isInstructionImported(instruction)}
                      workCategories={workCategories}
                      equipment={equipment}
                      onImport={handleImportInstruction}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: Configured Labor Steps with Dependencies */}
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Configured Labor Steps</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  {currentBOMSteps.length} steps · {formatTime(currentBOMSteps.reduce((sum, s) => sum + s.time_per_piece_seconds, 0))} total
                </p>
              </div>
              {currentBOMSteps.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                  No steps configured yet. Import items from the left panel.
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflow: "auto" }}>
                  {currentBOMSteps.sort((a, b) => a.sequence - b.sequence).map((step) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      allSteps={currentBOMSteps}
                      startDeps={getStepDeps(step.id, "start")}
                      finishDeps={getStepDeps(step.id, "finish")}
                      isEditing={editingDepsForStep === step.id}
                      onToggleEdit={() => setEditingDepsForStep(editingDepsForStep === step.id ? null : step.id)}
                      onAddDep={addDependency}
                      onRemoveDep={removeDependency}
                      onEdit={() => setEditingStep(step)}
                      onDelete={() => handleDeleteStep(step.id)}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Steps by BOM - only show when viewing all BOMs */}
      {!urlBomId && loading ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#64748b" }}>Loading steps...</p>
        </div>
      ) : !urlBomId && filteredBOMs.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <Clock size={48} style={{ color: "#94a3b8", marginBottom: 16 }} />
          <p style={{ color: "#64748b" }}>No BOM steps defined</p>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Add labor steps to BOMs to enable planning
          </p>
        </div>
      ) : !urlBomId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredBOMs.map((group) => (
            <div key={group.bom.id} className="card" style={{ overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  cursor: "pointer",
                  background: expandedBOMs.has(group.bom.id) ? "#f8fafc" : undefined,
                }}
                onClick={() => toggleBOM(group.bom.id)}
              >
                {expandedBOMs.has(group.bom.id) ? (
                  <ChevronDown size={18} style={{ marginRight: 8, color: "#64748b" }} />
                ) : (
                  <ChevronRight size={18} style={{ marginRight: 8, color: "#64748b" }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontFamily: "monospace" }}>{group.bom.num}</div>
                </div>
                <div style={{ display: "flex", gap: 16, color: "#64748b", fontSize: 13 }}>
                  <span>{group.steps.length} steps</span>
                  <span>{formatTime(group.steps.reduce((sum, s) => sum + s.time_per_piece_seconds, 0))}</span>
                </div>
              </div>

              {expandedBOMs.has(group.bom.id) && (
                <div style={{ borderTop: "1px solid #e2e8f0" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 12, width: 40 }}>#</th>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Step Name</th>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Code</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, fontSize: 12 }}>Time</th>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Category</th>
                        <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Equipment</th>
                        <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, fontSize: 12, width: 80 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.steps.map((step) => (
                        <tr key={step.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          {editingStep?.id === step.id ? (
                            <>
                              <td style={{ padding: "8px 16px", fontSize: 13 }}>
                                <input
                                  type="number"
                                  value={editingStep.sequence}
                                  onChange={(e) => setEditingStep({ ...editingStep, sequence: parseInt(e.target.value) || 1 })}
                                  style={{ width: 40, padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                />
                              </td>
                              <td style={{ padding: "8px 16px" }}>
                                <input
                                  type="text"
                                  value={editingStep.name}
                                  onChange={(e) => setEditingStep({ ...editingStep, name: e.target.value })}
                                  style={{ width: "100%", padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                />
                              </td>
                              <td style={{ padding: "8px 16px" }}>
                                <input
                                  type="text"
                                  value={editingStep.step_code || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, step_code: e.target.value || null })}
                                  style={{ width: 80, padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                />
                              </td>
                              <td style={{ padding: "8px 16px" }}>
                                <input
                                  type="number"
                                  value={editingStep.time_per_piece_seconds}
                                  onChange={(e) => setEditingStep({ ...editingStep, time_per_piece_seconds: parseInt(e.target.value) || 0 })}
                                  style={{ width: 60, padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                />
                              </td>
                              <td style={{ padding: "8px 16px" }}>
                                <select
                                  value={editingStep.work_category_id || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, work_category_id: e.target.value ? parseInt(e.target.value) : null })}
                                  style={{ padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                >
                                  <option value="">-</option>
                                  {workCategories.map((wc) => (
                                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "8px 16px" }}>
                                <select
                                  value={editingStep.equipment_id || ""}
                                  onChange={(e) => setEditingStep({ ...editingStep, equipment_id: e.target.value ? parseInt(e.target.value) : null })}
                                  style={{ padding: 4, border: "1px solid #e2e8f0", borderRadius: 4 }}
                                >
                                  <option value="">-</option>
                                  {equipment.map((eq) => (
                                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "8px 16px", textAlign: "right" }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: "4px 8px", marginRight: 4 }}
                                  onClick={() => handleSaveStep(editingStep)}
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 8px" }}
                                  onClick={() => setEditingStep(null)}
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: "8px 16px", fontSize: 13, color: "#64748b" }}>{step.sequence}</td>
                              <td style={{ padding: "8px 16px", fontSize: 14, fontWeight: 500 }}>{step.name}</td>
                              <td style={{ padding: "8px 16px", fontSize: 13, fontFamily: "monospace", color: "#64748b" }}>
                                {step.step_code || "-"}
                              </td>
                              <td style={{ padding: "8px 16px", fontSize: 13, textAlign: "right" }}>
                                {formatTime(step.time_per_piece_seconds)}
                              </td>
                              <td style={{ padding: "8px 16px", fontSize: 13, color: "#64748b" }}>
                                {step.work_category_name || "-"}
                              </td>
                              <td style={{ padding: "8px 16px", fontSize: 13, color: "#64748b" }}>
                                {step.equipment_name || "-"}
                              </td>
                              <td style={{ padding: "8px 16px", textAlign: "right" }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 8px", marginRight: 4 }}
                                  onClick={() => setEditingStep(step)}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 8px" }}
                                  onClick={() => handleDeleteStep(step.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Add Step Modal */}
      {showAddModal && (
        <AddStepModal
          boms={boms}
          workCategories={workCategories}
          equipment={equipment}
          selectedBOM={selectedBOM}
          onSelectBOM={setSelectedBOM}
          onSave={handleAddStep}
          onClose={() => {
            setShowAddModal(false);
            setSelectedBOM(null);
          }}
        />
      )}

      {/* Edit Step Modal - shown when editing from BOM-specific view */}
      {editingStep && urlBomId && (
        <EditStepModal
          step={editingStep}
          workCategories={workCategories}
          equipment={equipment}
          onChange={setEditingStep}
          onSave={() => {
            handleSaveStep(editingStep);
          }}
          onClose={() => setEditingStep(null)}
        />
      )}
    </div>
  );
}

interface AddStepModalProps {
  boms: FishbowlBOM[];
  workCategories: WorkCategory[];
  equipment: Equipment[];
  selectedBOM: FishbowlBOM | null;
  onSelectBOM: (bom: FishbowlBOM | null) => void;
  onSave: (step: Partial<BOMStep>) => void;
  onClose: () => void;
}

function AddStepModal({ boms, workCategories, equipment, selectedBOM, onSelectBOM, onSave, onClose }: AddStepModalProps) {
  const [bomSearch, setBomSearch] = useState("");
  const [step, setStep] = useState<Partial<BOMStep>>({
    name: "",
    step_code: "",
    time_per_piece_seconds: 60,
    sequence: 1,
    work_category_id: null,
    equipment_id: null,
  });

  const filteredBOMs = boms.filter(
    (b) =>
      b.num.toLowerCase().includes(bomSearch.toLowerCase()) ||
      b.description?.toLowerCase().includes(bomSearch.toLowerCase())
  );

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="card" style={{ width: 500, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Add Step</h2>
          <button className="btn btn-secondary" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {!selectedBOM ? (
            <>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Select BOM</label>
              <input
                type="text"
                placeholder="Search BOMs..."
                value={bomSearch}
                onChange={(e) => setBomSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
              <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                {filteredBOMs.slice(0, 50).map((bom) => (
                  <div
                    key={bom.id}
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid #e2e8f0",
                      cursor: "pointer",
                    }}
                    onClick={() => onSelectBOM(bom)}
                  >
                    <div style={{ fontWeight: 500, fontFamily: "monospace" }}>{bom.num}</div>
                    {bom.description && (
                      <div style={{ fontSize: 12, color: "#64748b" }}>{bom.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>Adding step to:</div>
                <div style={{ fontWeight: 600, fontFamily: "monospace" }}>{selectedBOM.num}</div>
                <button
                  style={{ fontSize: 12, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                  onClick={() => onSelectBOM(null)}
                >
                  Change BOM
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Step Name *</label>
                  <input
                    type="text"
                    value={step.name}
                    onChange={(e) => setStep({ ...step, name: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Step Code</label>
                    <input
                      type="text"
                      value={step.step_code || ""}
                      onChange={(e) => setStep({ ...step, step_code: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Sequence</label>
                    <input
                      type="number"
                      value={step.sequence}
                      onChange={(e) => setStep({ ...step, sequence: parseInt(e.target.value) || 1 })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Time per Piece (seconds) *</label>
                  <input
                    type="number"
                    value={step.time_per_piece_seconds}
                    onChange={(e) => setStep({ ...step, time_per_piece_seconds: parseInt(e.target.value) || 0 })}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Work Category</label>
                    <select
                      value={step.work_category_id || ""}
                      onChange={(e) => setStep({ ...step, work_category_id: e.target.value ? parseInt(e.target.value) : null })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                    >
                      <option value="">-</option>
                      {workCategories.map((wc) => (
                        <option key={wc.id} value={wc.id}>{wc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Equipment</label>
                    <select
                      value={step.equipment_id || ""}
                      onChange={(e) => setStep({ ...step, equipment_id: e.target.value ? parseInt(e.target.value) : null })}
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                    >
                      <option value="">-</option>
                      {equipment.map((eq) => (
                        <option key={eq.id} value={eq.id}>{eq.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => onSave(step)}
                  disabled={!step.name}
                >
                  Add Step
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Edit Step Modal
interface EditStepModalProps {
  step: BOMStep;
  workCategories: WorkCategory[];
  equipment: Equipment[];
  onChange: (step: BOMStep) => void;
  onSave: () => void;
  onClose: () => void;
}

function EditStepModal({ step, workCategories, equipment, onChange, onSave, onClose }: EditStepModalProps) {
  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="card" style={{ width: 500, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Edit Step</h2>
          <button className="btn btn-secondary" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Step Name *</label>
              <input
                type="text"
                value={step.name}
                onChange={(e) => onChange({ ...step, name: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Step Code</label>
                <input
                  type="text"
                  value={step.step_code || ""}
                  onChange={(e) => onChange({ ...step, step_code: e.target.value || null })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Sequence</label>
                <input
                  type="number"
                  value={step.sequence}
                  onChange={(e) => onChange({ ...step, sequence: parseInt(e.target.value) || 1 })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Time per Piece (seconds) *</label>
              <input
                type="number"
                value={step.time_per_piece_seconds}
                onChange={(e) => onChange({ ...step, time_per_piece_seconds: parseInt(e.target.value) || 0 })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Work Category</label>
                <select
                  value={step.work_category_id || ""}
                  onChange={(e) => onChange({ ...step, work_category_id: e.target.value ? parseInt(e.target.value) : null })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  {workCategories.map((wc) => (
                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Equipment</label>
                <select
                  value={step.equipment_id || ""}
                  onChange={(e) => onChange({ ...step, equipment_id: e.target.value ? parseInt(e.target.value) : null })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}
                >
                  <option value="">-</option>
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {step.details && (
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Work Instructions</label>
                <pre style={{
                  fontSize: 11,
                  color: "#64748b",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  padding: 8,
                  borderRadius: 4,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  maxHeight: 100,
                  overflow: "auto",
                  margin: 0,
                }}>
                  {step.details}
                </pre>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={onSave}
              disabled={!step.name}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for a single Fishbowl work instruction with import functionality
interface InstructionRowProps {
  instruction: FishbowlBOMInstruction;
  isImported: boolean;
  workCategories: WorkCategory[];
  equipment: Equipment[];
  onImport: (instruction: FishbowlBOMInstruction, timeSeconds: number, equipmentId: number | null, workCategoryId: number | null) => void;
}

function InstructionRow({ instruction, isImported, workCategories, equipment, onImport }: InstructionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(60);
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [workCategoryId, setWorkCategoryId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Auto-match work category based on instruction.name
  // Handles typos like "Sweing", "Screeing", "Cuting" and variations like "Cut 1", "Sewing Dept"
  useEffect(() => {
    if (workCategoryId !== null) return; // Already set

    const normalize = (s: string) => s.toLowerCase()
      .replace(/dept\.?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const instrNorm = normalize(instruction.name);

    // Match patterns to categories
    const patterns: [RegExp, string][] = [
      [/^sew|sweing|sewingin/, "Sewing Dept."],
      [/^cut|cuting/, "Cutting Dept."],
      [/^screen|screeing|silk\s*screen/, "Screening Dept."],
      [/^inspect|clean.*inspect|quality/, "Inspection"],
      [/^pack|packaging/, "Packing"],
      [/^prep/, "Prep"],
      [/^finish/, "Finishing Dept."],
      [/^assembl/, "Assembly"],
    ];

    for (const [pattern, categoryName] of patterns) {
      if (pattern.test(instrNorm)) {
        const match = workCategories.find((wc) => wc.name === categoryName);
        if (match) {
          setWorkCategoryId(match.id);
          return;
        }
      }
    }

    // Fallback: exact or partial match
    const match = workCategories.find((wc) => {
      const wcNorm = normalize(wc.name);
      return instrNorm.includes(wcNorm) || wcNorm.includes(instrNorm);
    });
    if (match) {
      setWorkCategoryId(match.id);
    }
  }, [instruction.name, workCategories, workCategoryId]);

  const handleImport = async () => {
    setImporting(true);
    await onImport(instruction, timeSeconds, equipmentId, workCategoryId);
    setImporting(false);
    setExpanded(false);
  };

  return (
    <div style={{ borderBottom: "1px solid #e2e8f0" }}>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          cursor: isImported ? "default" : "pointer",
          background: isImported ? "#f0fdf4" : expanded ? "#f8fafc" : undefined,
        }}
        onClick={() => !isImported && setExpanded(!expanded)}
      >
        {/* Step number */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isImported ? "#dcfce7" : "#f1f5f9",
          color: isImported ? "#16a34a" : "#64748b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {instruction.sortOrder}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Show category (instruction.name) as a small badge, step name (description) as main text */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 11,
              background: "#e2e8f0",
              color: "#475569",
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 500,
            }}>
              {instruction.name}
            </span>
          </div>
          {instruction.description && (
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>
              {instruction.description}
            </div>
          )}
          {instruction.details && (
            <div style={{ marginTop: 4 }}>
              <button
                style={{
                  fontSize: 11,
                  color: "#3b82f6",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(!showDetails);
                }}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
              {showDetails && (
                <pre style={{
                  fontSize: 11,
                  color: "#64748b",
                  background: "#f8fafc",
                  padding: 8,
                  borderRadius: 4,
                  marginTop: 4,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  maxHeight: 150,
                  overflow: "auto",
                }}>
                  {instruction.details}
                </pre>
              )}
            </div>
          )}
        </div>
        {isImported ? (
          <span style={{
            fontSize: 12,
            color: "#16a34a",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}>
            <CheckCircle size={14} />
            Imported
          </span>
        ) : (
          <ChevronRight
            size={16}
            style={{
              color: "#94a3b8",
              transform: expanded ? "rotate(90deg)" : undefined,
              transition: "transform 0.2s",
              flexShrink: 0,
              marginTop: 4,
            }}
          />
        )}
      </div>

      {expanded && !isImported && (
        <div style={{ padding: "12px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Time per piece (seconds)
              </label>
              <input
                type="number"
                value={timeSeconds}
                onChange={(e) => setTimeSeconds(parseInt(e.target.value) || 0)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Work Category
              </label>
              <select
                value={workCategoryId || ""}
                onChange={(e) => setWorkCategoryId(e.target.value ? parseInt(e.target.value) : null)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <option value="">-</option>
                {workCategories.map((wc) => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                Equipment
              </label>
              <select
                value={equipmentId || ""}
                onChange={(e) => setEquipmentId(e.target.value ? parseInt(e.target.value) : null)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <option value="">-</option>
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13, padding: "6px 12px" }}
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import as Step"}
          </button>
        </div>
      )}
    </div>
  );
}

// Component for a configured step with dependency management
interface StepCardProps {
  step: BOMStep;
  allSteps: BOMStep[];
  startDeps: StepDependency[];
  finishDeps: StepDependency[];
  isEditing: boolean;
  onToggleEdit: () => void;
  onAddDep: (stepId: number, dependsOnStepId: number, depType: "start" | "finish") => void;
  onRemoveDep: (stepId: number, depId: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  formatTime: (seconds: number) => string;
}

function StepCard({
  step,
  allSteps,
  startDeps,
  finishDeps,
  isEditing,
  onToggleEdit,
  onAddDep,
  onRemoveDep,
  onEdit,
  onDelete,
  formatTime,
}: StepCardProps) {
  // Get available steps for dependencies (exclude self)
  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  // Get step IDs already used in each dependency type
  const startDepIds = new Set(startDeps.map((d) => d.depends_on_step_id));
  const finishDepIds = new Set(finishDeps.map((d) => d.depends_on_step_id));

  // Build options for the dependency selectors
  const startOptions = otherSteps.map((s) => ({
    value: s.id.toString(),
    label: `${s.sequence}. ${s.name}`,
  }));

  const finishOptions = otherSteps.map((s) => ({
    value: s.id.toString(),
    label: `${s.sequence}. ${s.name}`,
  }));

  // Handle dependency selection changes
  const handleStartChange = (selectedValues: (string | number)[]) => {
    const selected = new Set(selectedValues.map((v) => typeof v === "string" ? parseInt(v) : v));

    // Add new dependencies
    for (const val of selected) {
      if (!startDepIds.has(val)) {
        onAddDep(step.id, val, "start");
      }
    }

    // Remove deselected dependencies
    for (const dep of startDeps) {
      if (!selected.has(dep.depends_on_step_id)) {
        onRemoveDep(step.id, dep.id);
      }
    }
  };

  const handleFinishChange = (selectedValues: (string | number)[]) => {
    const selected = new Set(selectedValues.map((v) => typeof v === "string" ? parseInt(v) : v));

    // Add new dependencies
    for (const val of selected) {
      if (!finishDepIds.has(val)) {
        onAddDep(step.id, val, "finish");
      }
    }

    // Remove deselected dependencies
    for (const dep of finishDeps) {
      if (!selected.has(dep.depends_on_step_id)) {
        onRemoveDep(step.id, dep.id);
      }
    }
  };

  const bgColor = getCategoryColor(step.work_category_name);

  return (
    <div style={{ borderBottom: "1px solid #e2e8f0" }}>
      {/* Step header */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          background: isEditing ? "#f8fafc" : undefined,
        }}
        onClick={onToggleEdit}
      >
        {/* Step sequence number */}
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: bgColor,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {step.sequence}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{step.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 12, marginTop: 2 }}>
            <span>{formatTime(step.time_per_piece_seconds)}</span>
            {step.work_category_name && <span>{step.work_category_name}</span>}
            {step.equipment_name && <span>· {step.equipment_name}</span>}
            {step.details && <span style={{ color: "#3b82f6" }}>📋 has details</span>}
          </div>

          {/* Show dependencies summary or hint */}
          {(startDeps.length > 0 || finishDeps.length > 0) ? (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              {startDeps.length > 0 && (
                <span style={{ marginRight: 8 }}>
                  Starts with: {startDeps.map((d) => {
                    const depStep = allSteps.find((s) => s.id === d.depends_on_step_id);
                    return depStep ? depStep.sequence : "?";
                  }).join(", ")}
                </span>
              )}
              {finishDeps.length > 0 && (
                <span>
                  After: {finishDeps.map((d) => {
                    const depStep = allSteps.find((s) => s.id === d.depends_on_step_id);
                    return depStep ? depStep.sequence : "?";
                  }).join(", ")}
                </span>
              )}
            </div>
          ) : !isEditing && allSteps.length > 1 && (
            <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>
              Click to set dependencies
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            className="btn btn-secondary"
            style={{ padding: "4px 8px" }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit step"
          >
            <Edit size={14} />
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: "4px 8px" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete step"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <ChevronRight
          size={16}
          style={{
            color: "#94a3b8",
            transform: isEditing ? "rotate(90deg)" : undefined,
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        />
      </div>

      {/* Expanded dependency editing panel */}
      {isEditing && (
        <div style={{ padding: "12px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
          {/* Show details if present */}
          {step.details && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                Work Instructions
              </label>
              <pre style={{
                fontSize: 11,
                color: "#64748b",
                background: "white",
                border: "1px solid #e2e8f0",
                padding: 8,
                borderRadius: 4,
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                maxHeight: 120,
                overflow: "auto",
                margin: 0,
              }}>
                {step.details}
              </pre>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Starts With */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#22c55e", marginBottom: 6 }}>
                Starts With (runs in parallel)
              </label>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                This step starts at the same time as these steps
              </p>
              <MultiSelect
                options={startOptions}
                value={Array.from(startDepIds).map((id) => id.toString())}
                onChange={handleStartChange}
                placeholder="Select steps..."
              />
            </div>

            {/* After These Finish */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                After These Finish (sequential)
              </label>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                This step starts after these steps complete
              </p>
              <MultiSelect
                options={finishOptions}
                value={Array.from(finishDepIds).map((id) => id.toString())}
                onChange={handleFinishChange}
                placeholder="Select steps..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

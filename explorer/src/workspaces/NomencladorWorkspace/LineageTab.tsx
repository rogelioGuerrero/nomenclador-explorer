import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, GitBranch } from "lucide-react";
import { ReactFlow, Background, Controls, useNodesState, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const THEME_CSS = `
  .react-flow { background: var(--ws-bg, #060d1a); }
  .react-flow__node-default {
    background: rgba(6,13,26,0.92);
    color: var(--ws-text, #ddeeff);
    border: 1px solid rgba(74,163,255,0.22);
    border-radius: 8px;
    padding: 10px 12px;
    white-space: pre-wrap;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }
  .react-flow__node-default.is-root {
    border-color: var(--ws-accent, #4aa3ff);
    border-width: 2px;
    box-shadow: 0 0 12px rgba(74,163,255,0.3);
  }
  .react-flow__controls { background: rgba(6,13,26,0.9); border: 1px solid rgba(74,163,255,0.18); border-radius: 10px; }
  .react-flow__controls-button { background: transparent; border-color: rgba(74,163,255,0.15); color: var(--ws-text-muted, #8fa8c6); }
  .react-flow__controls-button:hover { background: rgba(74,163,255,0.1); color: var(--ws-text, #ddeeff); }
`;

const EDGE_COLORS: Record<string, string> = {
  implementa: "#4aa3ff",
  transforma_a: "#f59e0b",
  equivalente_a: "#4cc38a",
  proviene_de: "#a78bfa",
  compone: "#a78bfa",
  deriva_de: "#a78bfa",
  subconcepto_de: "#a78bfa",
  usa_clasificador: "#4cc38a",
  respaldado_por: "#f59e0b",
  pertenece_a: "#5a7a9a",
  tiene_contexto: "#5a7a9a",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  concept: "#4aa3ff",
  field: "#4cc38a",
  classifier: "#a78bfa",
  source: "#f59e0b",
  operation: "#f97316",
  normative: "#fbbf24",
  quality_issue: "#ef4444",
};

type LineageNode = {
  id: string;
  label: string;
  type: string;
  source_db?: string;
  standard?: string | null;
  review_status?: string;
  data_classification?: string;
  is_root?: boolean;
};

type LineageEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export function LineageTab() {
  const [searchId, setSearchId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [depth, setDepth] = useState(2);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [availableNodes, setAvailableNodes] = useState<LineageNode[]>([]);

  useEffect(() => {
    async function loadNodeList() {
      try {
        const res = await fetch("/api/nomenclador/concepts");
        const data = await res.json();
        if (data.concepts) {
          setAvailableNodes(
            data.concepts.map((c: any) => ({
              id: c.name,
              label: c.name,
              type: "concept",
              standard: c.standard,
              review_status: c.review_status,
            })),
          );
        }
      } catch {
        // ignore
      }
    }
    loadNodeList();
  }, []);

  const trace = useCallback(async () => {
    if (!searchId.trim()) return;
    setLoading(true);
    setError("");
    setNodes([]);
    setEdges([]);
    try {
      const res = await fetch(
        `/api/nomenclador/lineage/${encodeURIComponent(searchId)}?depth=${depth}`,
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);
      }
      const data = await res.json();
      const rawNodes: LineageNode[] = data.nodes || [];
      const rawEdges: LineageEdge[] = data.edges || [];

      // Simple layout: root at center, others in concentric rings
      const centerX = 400;
      const centerY = 300;
      const ringSpacing = 180;

      const nodeDepth: Record<string, number> = {};
      nodeDepth[data.root] = 0;
      // BFS to assign depths
      const queue = [data.root];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const e of rawEdges) {
          const neighbor = e.source === cur ? e.target : e.target === cur ? e.source : null;
          if (neighbor && !(neighbor in nodeDepth)) {
            nodeDepth[neighbor] = nodeDepth[cur] + 1;
            queue.push(neighbor);
          }
        }
      }

      const nodesByDepth: Record<number, string[]> = {};
      for (const [id, d] of Object.entries(nodeDepth)) {
        if (!nodesByDepth[d]) nodesByDepth[d] = [];
        nodesByDepth[d].push(id);
      }

      const mappedNodes: Node[] = rawNodes.map((n) => {
        const d = nodeDepth[n.id] ?? 0;
        const siblings = nodesByDepth[d] || [n.id];
        const idx = siblings.indexOf(n.id);
        const angle = (idx / siblings.length) * Math.PI * 2;
        const radius = d * ringSpacing;
        return {
          id: n.id,
          data: {
            label: `${n.label}\n(${n.type})`,
          },
          position: {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          },
          type: "default",
          className: n.is_root ? "is-root" : "",
          style: {
            borderColor: NODE_TYPE_COLORS[n.type] || "rgba(74,163,255,0.22)",
          },
        };
      });

      const mappedEdges: Edge[] = rawEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: EDGE_COLORS[e.label] || "#58a6ff" },
      }));

      setNodes(mappedNodes);
      setEdges(mappedEdges);
      setActiveId(searchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lineage");
    } finally {
      setLoading(false);
    }
  }, [searchId, depth]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "var(--ws-bg, #060d1a)" }}>
      <style>{THEME_CSS}</style>

      {/* Toolbar */}
      <div style={{
        position: "absolute", top: 14, left: 14, right: 14, zIndex: 10,
        display: "flex", gap: 8, alignItems: "center",
        background: "rgba(4,10,18,0.88)", backdropFilter: "blur(14px)",
        padding: "8px 12px", borderRadius: 12,
        border: "1px solid rgba(74,163,255,0.16)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}>
        <span className="ws-eyebrow" style={{ color: "var(--ws-accent)", marginRight: 4 }}>
          Lineage del Nomenclador
        </span>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: 9, color: "var(--ws-text-dim)" }} />
          <input
            type="text"
            list="lineage-nodes"
            placeholder="Nombre del concepto…"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void trace(); }}
            style={{
              width: 220, padding: "6px 10px 6px 30px", fontSize: 12,
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: 6, color: "var(--ws-text)",
            }}
          />
          <datalist id="lineage-nodes">
            {availableNodes.map((n) => (
              <option key={n.id} value={n.id} />
            ))}
          </datalist>
        </div>
        <select
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value))}
          style={{
            padding: "6px 8px", fontSize: 12, borderRadius: 6,
            background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
            color: "var(--ws-text)",
          }}
        >
          <option value={1}>1 hop</option>
          <option value={2}>2 hops</option>
          <option value={3}>3 hops</option>
          <option value={4}>4 hops</option>
        </select>
        <button
          className="ws-btn ws-btn--primary"
          style={{ padding: "6px 12px" }}
          onClick={() => void trace()}
          disabled={loading}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
          Trazar
        </button>
        <div style={{ flex: 1 }} />
        {nodes.length > 0 && (
          <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
            {nodes.length} nodos · {edges.length} aristas
          </span>
        )}
      </div>

      {error && (
        <div style={{
          position: "absolute", top: 60, left: 14, right: 14, zIndex: 10,
          padding: 12, borderRadius: 14,
          color: "#ffb4c2", background: "rgba(255,157,175,0.1)",
          border: "1px solid rgba(255,157,175,0.18)",
        }}>
          {error}
        </div>
      )}

      {activeId ? (
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} fitView>
          <Background color="rgba(74,163,255,0.08)" gap={24} />
          <Controls />
        </ReactFlow>
      ) : (
        <div className="ws-empty" style={{ height: "100%", paddingTop: 72 }}>
          <div className="ws-empty-icon"><GitBranch size={36} color="var(--ws-accent)" /></div>
          <div className="ws-empty-title">Lineage del Nomenclador</div>
          <div className="ws-empty-body">
            Escribe un nombre de concepto y traza sus relaciones: implementa, transforma_a,
            equivalente_a, proviene_de, y más.
          </div>
        </div>
      )}

      {/* Edge legend */}
      {edges.length > 0 && (
        <div style={{
          position: "absolute", bottom: 14, left: 14, zIndex: 10,
          display: "flex", flexWrap: "wrap", gap: 8,
          background: "rgba(4,10,18,0.88)", backdropFilter: "blur(14px)",
          padding: "8px 12px", borderRadius: 10,
          border: "1px solid rgba(74,163,255,0.12)",
          maxWidth: 600,
        }}>
          {Array.from(new Set(edges.map((e) => String(e.label)).filter(Boolean))).map((label) => (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "11px", color: "var(--ws-text-muted)",
            }}>
              <span style={{
                width: 16, height: 2, borderRadius: 1,
                background: EDGE_COLORS[label] || "#58a6ff",
              }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

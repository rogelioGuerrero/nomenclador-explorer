import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, Bug } from "lucide-react";

type GraphStats = {
  node_count: number;
  edge_count: number;
  node_types: Record<string, number>;
  edge_types: Record<string, number>;
};

type IssueNode = {
  id: string;
  label: string;
  type: string;
  issue_type?: string;
  severity?: string;
  description?: string;
  field?: string;
  source?: string;
};

export function QualityIssuesTab() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [issues, setIssues] = useState<IssueNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, graphRes] = await Promise.all([
          fetch("/api/graph/stats").then((r) => r.json()),
          fetch("/api/graph/nodes?limit=500").then((r) => r.json()),
        ]);
        setStats(statsRes);
        const allNodes = graphRes.nodes || [];
        const issueNodes = allNodes.filter(
          (n: any) => n.type === "QualityIssue" || n.node_type === "quality_issue"
        );
        setIssues(issueNodes);
      } catch (e) {
        console.error("Failed to load issues", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const issueCount = stats?.node_types?.QualityIssue ?? stats?.node_types?.quality_issue ?? 0;

  const filteredIssues = filterSource
    ? issues.filter((i) => i.id.includes(filterSource) || i.source === filterSource)
    : issues;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Bug size={20} color="var(--ws-amber)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Quality Issues detectados
          </h3>
          <span style={{
            background: "var(--ws-amber-soft)", color: "var(--ws-amber)",
            padding: "2px 10px", borderRadius: 12, fontSize: "12px", fontWeight: 600,
          }}>
            {issueCount} issues
          </span>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <div style={{ color: "var(--ws-text-muted)", fontSize: "13px", padding: 20, textAlign: "center" }}>
            No se encontraron quality issues en el grafo.
          </div>
        ) : (
          <>
            {/* Filter */}
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Filtrar por fuente…"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                style={{
                  background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                  borderRadius: "8px", padding: "8px 12px", color: "var(--ws-text)",
                  fontSize: "13px", width: 250,
                }}
              />
            </div>

            {/* Issues list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredIssues.map((issue, i) => {
                const parts = issue.id.split(":");
                const fieldPart = parts.find((p) => p.startsWith("field:")) || "";
                const sourcePart = fieldPart.split(".")[0]?.replace("field:", "") || "";
                const issueType = parts.find((p) => p === "clave_primaria" || p === "nulos" || p === "cardinalidad") || parts[parts.length - 1];

                return (
                  <div key={i} className="ws-panel--inset" style={{
                    padding: 14, borderRadius: 8,
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}>
                    <AlertTriangle size={16} color="var(--ws-amber)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", color: "var(--ws-text)", fontWeight: 500 }}>
                        {issue.label || issue.id}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--ws-text-muted)", marginTop: 4 }}>
                        <span style={{ color: "var(--ws-amber)" }}>{issueType}</span>
                        {sourcePart && <> · fuente: <span style={{ color: "var(--ws-accent)" }}>{sourcePart}</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

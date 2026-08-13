import { useState, useEffect } from "react";
import { Loader2, Lightbulb, TrendingUp, ArrowRight } from "lucide-react";

type Insight = {
  id: string;
  observation: string;
  source_id: string;
  created_at: string;
  variables_covered: string[];
  cross_source_potential: string;
  quality_snapshot: {
    avg_qs: number;
    field_count: number;
    low_quality_count: number;
  };
};

export function InsightsTab() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/nomenclador/insights");
        const data = await res.json();
        setInsights(data.insights || []);
      } catch (e) {
        console.error("Failed to load insights", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const sources = [...new Set(insights.map((i) => i.source_id.replace("source:", "")))];
  const filtered = filterSource
    ? insights.filter((i) => i.source_id.includes(filterSource))
    : insights;

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Lightbulb size={20} color="var(--ws-amber)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Insights del análisis de fuentes
          </h3>
          <span style={{
            background: "var(--ws-amber-soft)", color: "var(--ws-amber)",
            padding: "2px 10px", borderRadius: 12, fontSize: "12px", fontWeight: 600,
          }}>
            {insights.length} observaciones
          </span>
        </div>

        {/* Source filter */}
        {sources.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterSource("")}
              style={{
                padding: "4px 12px", borderRadius: 6, fontSize: "12px", cursor: "pointer",
                border: "1px solid var(--ws-border)",
                background: !filterSource ? "var(--ws-accent-soft)" : "transparent",
                color: !filterSource ? "var(--ws-accent)" : "var(--ws-text-muted)",
              }}
            >
              Todas
            </button>
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => setFilterSource(s)}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: "12px", cursor: "pointer",
                  border: "1px solid var(--ws-border)",
                  background: filterSource === s ? "var(--ws-accent-soft)" : "transparent",
                  color: filterSource === s ? "var(--ws-accent)" : "var(--ws-text-muted)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Insights list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map((insight) => {
            const sourceName = insight.source_id.replace("source:", "");
            return (
              <div key={insight.id} className="ws-panel--inset" style={{ padding: 18, borderRadius: 10 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TrendingUp size={14} color="var(--ws-accent)" />
                    <span style={{ fontSize: "12px", color: "var(--ws-accent)", fontWeight: 600 }}>
                      {sourceName}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                      {new Date(insight.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {insight.quality_snapshot && (
                    <div style={{ display: "flex", gap: 8, fontSize: "11px" }}>
                      <span style={{ color: "var(--ws-green)" }}>
                        qs: {(insight.quality_snapshot.avg_qs * 100).toFixed(0)}%
                      </span>
                      <span style={{ color: "var(--ws-text-muted)" }}>
                        {insight.quality_snapshot.field_count} campos
                      </span>
                    </div>
                  )}
                </div>

                {/* Observation */}
                <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--ws-text)", lineHeight: 1.6 }}>
                  {insight.observation}
                </p>

                {/* Variables covered */}
                {insight.variables_covered.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                    {insight.variables_covered.map((v) => (
                      <span key={v} style={{
                        fontSize: "11px", padding: "2px 8px", borderRadius: 4,
                        background: "rgba(74,163,255,0.08)", color: "var(--ws-text-muted)",
                        fontFamily: "monospace",
                      }}>
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                {/* Cross-source potential */}
                {insight.cross_source_potential && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 8, fontSize: "12px",
                    background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.15)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <ArrowRight size={12} color="var(--ws-green)" />
                      <span style={{ color: "var(--ws-green)", fontWeight: 600 }}>Potencial cross-source</span>
                    </div>
                    <span style={{ color: "var(--ws-text-muted)" }}>{insight.cross_source_potential}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

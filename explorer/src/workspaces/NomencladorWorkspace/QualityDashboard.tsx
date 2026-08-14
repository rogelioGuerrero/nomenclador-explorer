import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, Info, AlertCircle, Gauge, Clock } from "lucide-react";

type SourceQuality = {
  source: string;
  field_count: number;
  completeness: number;
  uniqueness: number;
  consistency: number;
  validity: number;
  quality_score: number;
  low_confidence: number;
  pending_review: number;
  last_verified?: string;
};

type QualityIssue = {
  id: string;
  issue_type: string;
  severity: string;
  detail: string;
  metric_value: number;
  detected_by: string;
};

type QualitySummary = {
  sources: SourceQuality[];
  source_count: number;
  total_fields: number;
  quality_issues: QualityIssue[];
  issues_by_severity: Record<string, number>;
  total_issues: number;
};

const SEVERITY_META: Record<string, { color: string; bg: string; icon: typeof Info }> = {
  error: { color: "var(--ws-red)", bg: "var(--ws-red-soft)", icon: AlertCircle },
  warning: { color: "var(--ws-amber)", bg: "var(--ws-amber-soft)", icon: AlertTriangle },
  info: { color: "var(--ws-accent)", bg: "var(--ws-accent-soft)", icon: Info },
};

function QualityBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <span style={{ fontSize: "11px", color: "var(--ws-text-dim)", width: 80, textTransform: "capitalize" }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: "rgba(0,0,0,0.3)", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 3,
          background: color, transition: "width 400ms ease",
        }} />
      </div>
      <span style={{ fontSize: "11px", color, fontWeight: 600, width: 36, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "var(--ws-green)";
  if (score >= 0.6) return "var(--ws-amber)";
  return "var(--ws-red)";
}

export function QualityDashboard() {
  const [data, setData] = useState<QualitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/nomenclador/quality-summary");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quality summary");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 28, color: "var(--ws-red)" }}>
        <AlertCircle size={20} />
        <p style={{ marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="ws-empty" style={{ height: "100%", paddingTop: 72 }}>
        <div className="ws-empty-icon"><Gauge size={36} color="var(--ws-accent)" /></div>
        <div className="ws-empty-title">Dashboard de Calidad</div>
        <div className="ws-empty-body">No hay métricas de calidad disponibles en el nomenclador.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="ws-card" style={{ padding: 16, minWidth: 140 }}>
          <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
            Fuentes
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ws-accent)", marginTop: 4 }}>
            {data.source_count}
          </div>
        </div>
        <div className="ws-card" style={{ padding: 16, minWidth: 140 }}>
          <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
            Campos totales
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ws-green)", marginTop: 4 }}>
            {data.total_fields}
          </div>
        </div>
        <div className="ws-card" style={{ padding: 16, minWidth: 140 }}>
          <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
            Issues de calidad
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ws-amber)", marginTop: 4 }}>
            {data.total_issues}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, fontSize: "11px" }}>
            {Object.entries(data.issues_by_severity).map(([sev, count]) => {
              const meta = SEVERITY_META[sev];
              if (!meta || count === 0) return null;
              const Icon = meta.icon;
              return (
                <span key={sev} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: meta.color }}>
                  <Icon size={10} /> {count}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-source quality table */}
      <div className="ws-card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "var(--ws-text)" }}>
          Métricas de calidad por fuente
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.sources.map((src) => (
            <div key={src.source} style={{
              padding: 16, borderRadius: 10,
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(74,163,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "14px", color: "var(--ws-text)", fontWeight: 600, fontFamily: "monospace" }}>
                    {src.source}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                    {src.field_count} campos
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {src.low_confidence > 0 && (
                    <span style={{
                      fontSize: "10px", padding: "2px 8px", borderRadius: 8,
                      background: "var(--ws-amber-soft)", color: "var(--ws-amber)",
                    }}>
                      {src.low_confidence} baja confianza
                    </span>
                  )}
                  {src.pending_review > 0 && (
                    <span style={{
                      fontSize: "10px", padding: "2px 8px", borderRadius: 8,
                      background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                    }}>
                      {src.pending_review} pendientes
                    </span>
                  )}
                  {src.last_verified && (() => {
                    const days = Math.floor((Date.now() - new Date(src.last_verified).getTime()) / 86400000);
                    if (days < 0) return null;
                    const stale = days > 180;
                    const veryStale = days > 365;
                    if (!stale) return null;
                    return (
                      <span style={{
                        fontSize: "10px", padding: "2px 8px", borderRadius: 8,
                        display: "inline-flex", alignItems: "center", gap: 3,
                        background: veryStale ? "var(--ws-red-soft)" : "var(--ws-amber-soft)",
                        color: veryStale ? "var(--ws-red)" : "var(--ws-amber)",
                      }} title={`Última verificación: ${new Date(src.last_verified).toLocaleDateString("es")}`}>
                        <Clock size={10} />
                        {days < 365 ? `${Math.floor(days / 30)}m sin verificar` : `${Math.floor(days / 365)}a sin verificar`}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <QualityBar value={src.quality_score} label="Score" color={scoreColor(src.quality_score)} />
                <QualityBar value={src.completeness} label="Complete" color="var(--ws-accent)" />
                <QualityBar value={src.uniqueness} label="Unique" color="var(--ws-green)" />
                <QualityBar value={src.consistency} label="Consist" color="var(--ws-purple)" />
                <QualityBar value={src.validity} label="Valid" color="var(--ws-amber)" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quality issues list */}
      {data.quality_issues.length > 0 && (
        <div className="ws-card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--ws-text)" }}>
            Issues detectados
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.quality_issues.map((issue) => {
              const meta = SEVERITY_META[issue.severity] || SEVERITY_META.warning;
              const Icon = meta.icon;
              return (
                <div key={issue.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 14px", borderRadius: 8,
                  background: meta.bg, border: `1px solid ${meta.color}22`,
                }}>
                  <Icon size={14} style={{ color: meta.color, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: "12px", color: meta.color, fontWeight: 600, textTransform: "uppercase" }}>
                        {issue.issue_type}
                      </span>
                      {issue.detected_by && (
                        <span style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>
                          por {issue.detected_by}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                      {issue.detail}
                    </p>
                  </div>
                  {issue.metric_value > 0 && (
                    <span style={{
                      fontSize: "12px", fontWeight: 600, color: meta.color,
                      fontFamily: "monospace",
                    }}>
                      {(issue.metric_value * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Loader2, ArrowRight, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Copy } from "lucide-react";

type Source = { id: string; name: string; label: string };

type Checkpoint = {
  name: string;
  status: string;
  detail: string;
};

type InteropPath = {
  concept: string;
  field_a: { source_db: string; column: string };
  field_b: { source_db: string; column: string };
  checkpoints: Checkpoint[];
  recommendation: string;
  warnings: string[];
};

type InteropResult = {
  source: string;
  target: string;
  paths: InteropPath[];
};

type TransformResult = {
  source: string;
  target: string;
  transforms: Array<{
    concept: string;
    standard: string | null;
    field_a: string;
    field_b: string;
    sql: string;
    json_schema: Record<string, unknown>;
    warnings: string[];
  }>;
};

function statusIcon(status: string) {
  if (status === "match") return <CheckCircle2 size={16} color="var(--ws-green)" />;
  if (status === "mismatch") return <XCircle size={16} color="var(--ws-red)" />;
  if (status === "unknown") return <HelpCircle size={16} color="var(--ws-text-dim)" />;
  return <AlertTriangle size={16} color="var(--ws-amber)" />;
}

function statusColor(status: string) {
  if (status === "match") return "var(--ws-green)";
  if (status === "mismatch") return "var(--ws-red)";
  if (status === "unknown") return "var(--ws-text-dim)";
  return "var(--ws-amber)";
}

export function InteroperabilityTab() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceDb, setSourceDb] = useState("");
  const [targetDb, setTargetDb] = useState("");
  const [loading, setLoading] = useState(false);
  const [interop, setInterop] = useState<InteropResult | null>(null);
  const [transform, setTransform] = useState<TransformResult | null>(null);
  const [error, setError] = useState("");
  const [showTransform, setShowTransform] = useState(false);
  const [loadingTransform, setLoadingTransform] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  async function loadSources() {
    if (sourcesLoaded) return;
    try {
      const res = await fetch("/api/nomenclador/sources");
      const data = await res.json();
      setSources(data.sources || []);
      setSourcesLoaded(true);
    } catch (e) {
      setError("No se pudieron cargar las fuentes");
    }
  }

  loadSources();

  async function runInterop() {
    if (!sourceDb || !targetDb) return;
    setLoading(true);
    setError("");
    setInterop(null);
    setTransform(null);
    setShowTransform(false);
    try {
      const res = await fetch("/api/nomenclador/interoperability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_db: sourceDb, target_db: targetDb }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error en la consulta");
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setInterop(null);
      } else {
        setInterop(data);
      }
    } catch (e: any) {
      setError(e.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function runTransform() {
    if (!sourceDb || !targetDb) return;
    setLoadingTransform(true);
    setShowTransform(true);
    try {
      const res = await fetch("/api/nomenclador/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_db: sourceDb, target_db: targetDb }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error en la consulta");
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTransform(null);
      } else {
        setTransform(data);
      }
    } catch (e: any) {
      setError(e.message || "Error de conexión");
    } finally {
      setLoadingTransform(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      {/* Source selectors */}
      <div className="ws-card">
        <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--ws-text)" }}>
          Comparar interoperabilidad entre fuentes
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <select
            value={sourceDb}
            onChange={(e) => setSourceDb(e.target.value)}
            style={{
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: "8px", padding: "8px 12px", color: "var(--ws-text)",
              fontSize: "13px", minWidth: 200,
            }}
          >
            <option value="">Fuente origen…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <ArrowRight size={18} color="var(--ws-text-muted)" />
          <select
            value={targetDb}
            onChange={(e) => setTargetDb(e.target.value)}
            style={{
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: "8px", padding: "8px 12px", color: "var(--ws-text)",
              fontSize: "13px", minWidth: 200,
            }}
          >
            <option value="">Fuente destino…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={runInterop}
            disabled={!sourceDb || !targetDb || loading}
            style={{
              background: "var(--ws-accent-soft)", border: "1px solid var(--ws-border-strong)",
              borderRadius: "8px", padding: "8px 18px", color: "var(--ws-accent)",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
              opacity: (!sourceDb || !targetDb || loading) ? 0.4 : 1,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Analizar"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, color: "var(--ws-red)", fontSize: "13px" }}>{error}</div>
        )}
      </div>

      {/* No results message */}
      {interop && interop.paths.length === 0 && (
        <div className="ws-card" style={{ textAlign: "center", padding: 40, color: "var(--ws-text-muted)", fontSize: "14px" }}>
          No se encontraron caminos de interoperabilidad entre las fuentes seleccionadas.
        </div>
      )}

      {/* Interop results */}
      {interop && interop.paths.length > 0 && (
        <div className="ws-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
              {interop.paths.length} caminos de interoperabilidad
            </h3>
            <button
              onClick={runTransform}
              disabled={loadingTransform}
              style={{
                background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.3)",
                borderRadius: "8px", padding: "6px 14px", color: "var(--ws-green)",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
              }}
            >
              {loadingTransform ? <Loader2 size={12} className="animate-spin" /> : "Generar transformaciones"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {interop.paths.map((path, i) => (
              <div key={i} className="ws-panel--inset" style={{ padding: 16, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--ws-accent)", fontSize: "14px" }}>
                    {path.concept}
                  </span>
                  <span style={{ color: "var(--ws-text-muted)", fontSize: "12px" }}>
                    {path.field_a.column} → {path.field_b.column}
                  </span>
                </div>
                {/* Checkpoints */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {path.checkpoints.map((cp, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "12px" }}>
                      {statusIcon(cp.status)}
                      <div>
                        <div style={{ color: statusColor(cp.status), fontWeight: 600 }}>{cp.name}</div>
                        <div style={{ color: "var(--ws-text-muted)" }}>{cp.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Recommendation */}
                <div style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: "12px", fontWeight: 600,
                  background: path.recommendation.includes("CONDICIONADA")
                    ? "var(--ws-amber-soft)"
                    : path.recommendation.includes("NO")
                    ? "var(--ws-red-soft)"
                    : "var(--ws-green-soft)",
                  color: path.recommendation.includes("CONDICIONADA")
                    ? "var(--ws-amber)"
                    : path.recommendation.includes("NO")
                    ? "var(--ws-red)"
                    : "var(--ws-green)",
                }}>
                  {path.recommendation}
                </div>
                {path.warnings.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {path.warnings.map((w, k) => (
                      <div key={k} style={{ fontSize: "11px", color: "var(--ws-amber)", display: "flex", gap: 6 }}>
                        <AlertTriangle size={12} /> {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transform results */}
      {showTransform && transform && transform.transforms && transform.transforms.length > 0 && (
        <div className="ws-card">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--ws-text)" }}>
            Transformaciones SQL + JSON Schema
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {transform.transforms.map((t, i) => (
              <div key={i} className="ws-panel--inset" style={{ padding: 16, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--ws-accent)", fontSize: "14px" }}>
                    {t.concept} {t.standard && `(${t.standard})`}
                  </span>
                  <span style={{ color: "var(--ws-text-muted)", fontSize: "12px" }}>
                    {t.field_a} → {t.field_b}
                  </span>
                </div>
                <div style={{ position: "relative" }}>
                  <pre style={{
                    background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: 14,
                    fontSize: "12px", color: "var(--ws-green)", overflow: "auto",
                    border: "1px solid var(--ws-border)",
                  }}>
                    {t.sql}
                  </pre>
                  <button
                    onClick={() => navigator.clipboard.writeText(t.sql)}
                    style={{
                      position: "absolute", top: 8, right: 8,
                      background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                      borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                      color: "var(--ws-text-muted)",
                    }}
                  >
                    <Copy size={12} />
                  </button>
                </div>
                {t.warnings.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {t.warnings.map((w, k) => (
                      <div key={k} style={{ fontSize: "11px", color: "var(--ws-amber)" }}>
                        <AlertTriangle size={11} style={{ display: "inline" }} /> {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

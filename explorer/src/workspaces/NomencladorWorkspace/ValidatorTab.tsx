import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

type ValidateResult = {
  column: string;
  sample_values: string[];
  candidates: Array<{
    standard: string;
    name: string;
    confidence: string;
    reason: string;
    non_canonical_values: string[];
    canonical_values: Record<string, string>;
    is_valid: boolean;
  }>;
};

export function ValidatorTab() {
  const [columnName, setColumnName] = useState("");
  const [sampleValues, setSampleValues] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState("");

  async function validate() {
    if (!columnName || !sampleValues) return;
    setLoading(true);
    setError("");
    setResult(null);
    const values = sampleValues.split(",").map((v) => v.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/nomenclador/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column_name: columnName, sample_values: values }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error en la validación");
      }
      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error en la validación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <ShieldCheck size={20} color="var(--ws-green)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Validador de campos contra estándares canónicos
          </h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--ws-text-muted)", display: "block", marginBottom: 6 }}>
              Nombre de la columna
            </label>
            <input
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="ej: sexo, genero, fecha_nacimiento…"
              style={{
                background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                borderRadius: "8px", padding: "10px 14px", color: "var(--ws-text)",
                fontSize: "13px", width: "100%",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "var(--ws-text-muted)", display: "block", marginBottom: 6 }}>
              Valores muestra (separados por comas)
            </label>
            <input
              type="text"
              value={sampleValues}
              onChange={(e) => setSampleValues(e.target.value)}
              placeholder="ej: M, F, 1, 2, H"
              style={{
                background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                borderRadius: "8px", padding: "10px 14px", color: "var(--ws-text)",
                fontSize: "13px", width: "100%",
              }}
            />
          </div>
          <button
            onClick={validate}
            disabled={!columnName || !sampleValues || loading}
            style={{
              background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.3)",
              borderRadius: "8px", padding: "10px 20px", color: "var(--ws-green)",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
              opacity: (!columnName || !sampleValues || loading) ? 0.4 : 1,
              alignSelf: "flex-start",
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : "Validar"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "var(--ws-red)", fontSize: "13px" }}>{error}</div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="ws-card">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", color: "var(--ws-text)" }}>
            Resultados para "{result.column}"
          </h3>

          {result.candidates.length === 0 ? (
            <div style={{ color: "var(--ws-text-muted)", fontSize: "13px", padding: 20, textAlign: "center" }}>
              No se encontraron estándares candidatos para esta columna.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {result.candidates.map((c, i) => (
                <div key={i} className="ws-panel--inset" style={{ padding: 16, borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {c.is_valid ? (
                        <CheckCircle2 size={18} color="var(--ws-green)" />
                      ) : (
                        <XCircle size={18} color="var(--ws-red)" />
                      )}
                      <span style={{ fontWeight: 600, color: "var(--ws-text)", fontSize: "14px" }}>
                        {c.name}
                      </span>
                      <span style={{
                        background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                        padding: "2px 10px", borderRadius: 12, fontSize: "11px", fontWeight: 600,
                      }}>
                        {c.standard}
                      </span>
                    </div>
                    <span style={{
                      fontSize: "12px", fontWeight: 600,
                      color: c.confidence === "high" ? "var(--ws-green)" : c.confidence === "medium" ? "var(--ws-amber)" : "var(--ws-text-muted)",
                    }}>
                      confianza: {c.confidence}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "var(--ws-text-muted)", marginBottom: 10 }}>
                    {c.reason}
                  </div>

                  {/* Value comparison */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {result.sample_values.map((val) => {
                      const isCanonical = Object.keys(c.canonical_values).includes(val);
                      const canonicalLabel = c.canonical_values[val];
                      return (
                        <div key={val} style={{
                          padding: "6px 12px", borderRadius: 6, fontSize: "12px",
                          background: isCanonical ? "var(--ws-green-soft)" : "var(--ws-red-soft)",
                          border: `1px solid ${isCanonical ? "rgba(76,195,138,0.2)" : "rgba(255,123,114,0.2)"}`,
                        }}>
                          <span style={{
                            color: isCanonical ? "var(--ws-green)" : "var(--ws-red)",
                            fontFamily: "monospace", fontWeight: 600,
                          }}>
                            {val}
                          </span>
                          {isCanonical ? (
                            <span style={{ color: "var(--ws-text-muted)", marginLeft: 6 }}>
                              → {canonicalLabel}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ws-red)", marginLeft: 6 }}>
                              ✗ no canónico
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Canonical values reference */}
                  <div style={{ marginTop: 12, fontSize: "11px", color: "var(--ws-text-muted)" }}>
                    Valores canónicos: {Object.entries(c.canonical_values).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

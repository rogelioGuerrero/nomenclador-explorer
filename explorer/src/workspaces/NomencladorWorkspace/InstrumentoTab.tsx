import { useState } from "react";
import { Loader2, Sparkles, Download, FileText, Users } from "lucide-react";

type InstrumentVariable = {
  name: string;
  definition: string;
  suggested_question: string;
  response_options: Record<string, string>;
  classifier_standard: string;
  population: string;
  capture_method: string;
  custodian: string;
  custodian_department: string;
  normative: string;
  rationale: string;
};

type InstrumentResponse = {
  variables: InstrumentVariable[];
  summary: string;
};

export function InstrumentoTab() {
  const [policyDescription, setPolicyDescription] = useState("");
  const [population, setPopulation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InstrumentResponse | null>(null);

  async function generateInstrument() {
    if (!policyDescription.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/suggest-instrument", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy_description: policyDescription.trim(),
          population: population.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      const data: InstrumentResponse = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar instrumento");
    } finally {
      setLoading(false);
    }
  }

  function exportInstrument(format: "json" | "markdown") {
    if (!result) return;
    let content: string;
    let filename: string;

    if (format === "json") {
      content = JSON.stringify(result, null, 2);
      filename = "instrumento.json";
    } else {
      const lines: string[] = [];
      lines.push("# Instrumento de captura indicativo\n");
      if (result.summary) {
        lines.push(`**Resumen:** ${result.summary}\n`);
      }
      lines.push("---\n");
      result.variables.forEach((v, i) => {
        lines.push(`## ${i + 1}. ${v.name}\n`);
        lines.push(`**Pregunta:** ${v.suggested_question}\n`);
        if (v.definition && v.definition !== "-") {
          lines.push(`**Definición:** ${v.definition}\n`);
        }
        if (v.classifier_standard) {
          lines.push(`**Clasificador:** ${v.classifier_standard}\n`);
        }
        if (Object.keys(v.response_options).length > 0) {
          lines.push("**Opciones de respuesta:**\n");
          for (const [code, label] of Object.entries(v.response_options)) {
            lines.push(`- \`${code}\` — ${label}`);
          }
          lines.push("");
        } else {
          lines.push("**Opciones de respuesta:** Respuesta abierta\n");
        }
        if (v.population && v.population !== "-") lines.push(`**Población:** ${v.population}\n`);
        if (v.capture_method && v.capture_method !== "-") lines.push(`**Método de captura:** ${v.capture_method}\n`);
        if (v.custodian && v.custodian !== "-") lines.push(`**Propietario:** ${v.custodian} (${v.custodian_department})\n`);
        if (v.normative && v.normative !== "-") lines.push(`**Normativa:** ${v.normative}\n`);
        if (v.rationale) lines.push(`**Justificación:** ${v.rationale}\n`);
        lines.push("---\n");
      });
      content = lines.join("\n");
      filename = "instrumento.md";
    }

    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      {/* Input */}
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Sparkles size={20} color="var(--ws-accent)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Generador de instrumento indicativo
          </h3>
        </div>
        <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.6 }}>
          Describe la política pública a monitorear. El agente seleccionará variables relevantes del nomenclador,
          generará preguntas sugeridas con opciones de respuesta estandarizadas y justificará cada elección.
        </p>
        <textarea
          placeholder="Ej: Monitorear el acceso a servicios de salud de mujeres en zonas rurales, con énfasis en salud reproductiva y barreras geográficas…"
          value={policyDescription}
          onChange={(e) => setPolicyDescription(e.target.value)}
          rows={5}
          style={{
            width: "100%",
            background: "var(--ws-surface)",
            border: "1px solid var(--ws-border)",
            borderRadius: 8,
            padding: "12px 14px",
            color: "var(--ws-text)",
            fontSize: "13px",
            lineHeight: 1.6,
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
            <Users size={14} color="var(--ws-text-muted)" />
            <input
              type="text"
              placeholder="Población objetivo (opcional, ej: mujeres 15-49 años)"
              value={population}
              onChange={(e) => setPopulation(e.target.value)}
              style={{
                background: "var(--ws-surface)",
                border: "1px solid var(--ws-border)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--ws-text)",
                fontSize: "13px",
                flex: 1,
              }}
            />
          </div>
          <button
            onClick={generateInstrument}
            disabled={!policyDescription.trim() || loading}
            style={{
              background: "var(--ws-accent-soft)",
              border: "1px solid rgba(127,208,255,0.3)",
              borderRadius: 8,
              padding: "10px 22px",
              color: "var(--ws-accent)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              opacity: (!policyDescription.trim() || loading) ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? "Generando…" : "Generar instrumento"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="ws-card" style={{
          padding: 16,
          background: "rgba(255,157,175,0.06)",
          border: "1px solid rgba(255,157,175,0.18)",
          color: "#ffb4c2",
          fontSize: "13px",
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Summary + export */}
          <div className="ws-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={18} color="var(--ws-green)" />
                <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
                  Instrumento sugerido
                </h3>
                <span style={{
                  background: "var(--ws-green-soft)", color: "var(--ws-green)",
                  padding: "2px 10px", borderRadius: 12, fontSize: "12px",
                }}>
                  {result.variables.length} variables
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => exportInstrument("json")}
                  style={{
                    background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                    borderRadius: 6, padding: "6px 12px", color: "var(--ws-text-muted)",
                    fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Download size={12} /> JSON
                </button>
                <button
                  onClick={() => exportInstrument("markdown")}
                  style={{
                    background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                    borderRadius: 6, padding: "6px 12px", color: "var(--ws-text-muted)",
                    fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Download size={12} /> Markdown
                </button>
              </div>
            </div>
            {result.summary && (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--ws-text-muted)", lineHeight: 1.6 }}>
                {result.summary}
              </p>
            )}
          </div>

          {/* Variable cards */}
          {result.variables.map((v, i) => (
            <div key={`${v.name}-${i}`} className="ws-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                      padding: "2px 8px", borderRadius: 6, fontSize: "11px", fontWeight: 700,
                    }}>
                      V{i + 1}
                    </span>
                    <h4 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
                      {v.name}
                    </h4>
                    {v.classifier_standard && (
                      <span style={{
                        background: "rgba(242,182,109,0.1)", color: "var(--ws-amber)",
                        padding: "2px 8px", borderRadius: 6, fontSize: "10px", fontWeight: 600,
                      }}>
                        {v.classifier_standard}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Suggested question */}
              <div className="ws-panel--inset" style={{ padding: 12, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: "11px", color: "var(--ws-text-muted)", marginBottom: 4 }}>Pregunta sugerida</div>
                <div style={{ fontSize: "14px", color: "var(--ws-text)", fontWeight: 500, lineHeight: 1.5 }}>
                  {v.suggested_question}
                </div>
              </div>

              {/* Response options */}
              {Object.keys(v.response_options).length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: "11px", color: "var(--ws-text-muted)", marginBottom: 6 }}>Opciones de respuesta</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(v.response_options).map(([code, label]) => (
                      <span key={code} style={{
                        background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                        borderRadius: 6, padding: "4px 10px", fontSize: "12px",
                        color: "var(--ws-text)", fontFamily: "monospace",
                      }}>
                        <strong style={{ color: "var(--ws-green)" }}>{code}</strong> — {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 12, fontSize: "12px", color: "var(--ws-text-muted)" }}>
                  Respuesta abierta (sin clasificador)
                </div>
              )}

              {/* Metadata grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {v.population && v.population !== "-" && (
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>Población</div>
                    <div style={{ fontSize: "12px", color: "var(--ws-text-muted)" }}>{v.population}</div>
                  </div>
                )}
                {v.capture_method && v.capture_method !== "-" && (
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>Método de captura</div>
                    <div style={{ fontSize: "12px", color: "var(--ws-text-muted)" }}>{v.capture_method}</div>
                  </div>
                )}
                {v.custodian && v.custodian !== "-" && (
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>Propietario</div>
                    <div style={{ fontSize: "12px", color: "var(--ws-text-muted)" }}>
                      {v.custodian}{v.custodian_department !== "-" ? ` · ${v.custodian_department}` : ""}
                    </div>
                  </div>
                )}
                {v.normative && v.normative !== "-" && (
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>Normativa</div>
                    <div style={{ fontSize: "12px", color: "var(--ws-text-muted)" }}>{v.normative}</div>
                  </div>
                )}
              </div>

              {/* Rationale */}
              {v.rationale && (
                <div style={{
                  padding: "10px 12px", borderRadius: 8,
                  background: "rgba(127,208,255,0.05)", border: "1px solid rgba(127,208,255,0.12)",
                  fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5,
                }}>
                  <span style={{ color: "var(--ws-accent)", fontWeight: 600 }}>Justificación: </span>
                  {v.rationale}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

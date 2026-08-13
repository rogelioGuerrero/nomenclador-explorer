import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Play, RotateCcw, CheckCircle2, AlertCircle, Zap, GitBranch, Info, Sparkles, Wand2, Loader2 } from "lucide-react";

const SAMPLE_FACTS = `deriva_de(area_cultivada, area_agricola)
compone(area_agricola, uso_de_suelo)`;

const SAMPLE_RULE = `IF deriva_de(?X, ?Y) AND compone(?Y, ?Z) THEN deriva_de(?X, ?Z)`;

const TEMPLATES = [
  {
    label: "Propagar derivación",
    description: "Si A deriva de B y B compone a C, entonces A deriva de C. Útil para descubrir dependencias indirectas entre variables.",
    facts: `deriva_de(area_cultivada, area_agricola)\ncompone(area_agricola, uso_de_suelo)`,
    rule: `IF deriva_de(?X, ?Y) AND compone(?Y, ?Z) THEN deriva_de(?X, ?Z)`,
  },
  {
    label: "Heredar equivalencia",
    description: "Si un campo A es equivalente a B, y B deriva de un concepto C, entonces A también deriva de C. Útil para sincronizar fuentes equivalentes.",
    facts: `equivalente_a(field:us_economic_indicators.date, field:ministerio_economia_sv.fecha_observacion)\nderiva_de(field:ministerio_economia_sv.fecha_observacion, concepto:tiempo)`,
    rule: `IF equivalente_a(?A, ?B) AND deriva_de(?B, ?C) THEN deriva_de(?A, ?C)`,
  },
  {
    label: "Propagar clasificador",
    description: "Si un campo implementa un concepto que usa un clasificador, el campo también hereda ese clasificador. Útil para validar consistencia.",
    facts: `usa_clasificador(concepto:sexo, classifier:iso_5218)\nimplementa(field:b.genero, concepto:sexo)`,
    rule: `IF implementa(?F, ?C) AND usa_clasificador(?C, ?K) THEN usa_clasificador(?F, ?K)`,
  },
];

export function ReasoningWorkspace() {
  const queryClient = useQueryClient();
  const [facts, setFacts] = useState(SAMPLE_FACTS);
  const [rules, setRules] = useState(SAMPLE_RULE);
  const [applyToGraph, setApplyToGraph] = useState(true);
  const [result, setResult] = useState<{
    inferred_facts?: string[];
    rules_fired?: number;
    added_edges?: number;
    mutated?: boolean;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState("");
  const [nlRule, setNlRule] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");

  async function handleRun() {
    setIsRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: facts.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
          rules: rules.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
          mode: "forward",
          apply_to_graph: applyToGraph,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Status ${response.status}`);
      if (response.status === 207) setError(data.message || "Warning: Partial success reasoning.");
      setResult(data);
      if (data.mutated) queryClient.invalidateQueries({ queryKey: ["graph", "full-load"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reasoning failed");
    } finally {
      setIsRunning(false);
    }
  }

  function loadTemplate(t: (typeof TEMPLATES)[number]) {
    setFacts(t.facts);
    setRules(t.rule);
    setResult(null);
    setError("");
  }

  function handleReset() {
    setFacts(SAMPLE_FACTS);
    setRules(SAMPLE_RULE);
    setResult(null);
    setError("");
    setExplanation("");
    setExplainError("");
  }

  async function handleExplain() {
    setIsExplaining(true);
    setExplainError("");
    setExplanation("");
    try {
      const response = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts,
          rules,
          inferred_facts: result?.inferred_facts ?? [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Status ${response.status}`);
      setExplanation(data.explanation);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : "Error al explicar");
    } finally {
      setIsExplaining(false);
    }
  }

  async function handleTranslateRule() {
    if (!nlRule.trim()) return;
    setIsTranslating(true);
    setTranslateError("");
    try {
      const response = await fetch("/api/ai/translate-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: nlRule }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Status ${response.status}`);
      setRules(data.rule);
      if (data.facts_example) setFacts(data.facts_example);
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : "Error al traducir");
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <div className="ws-page" style={{ flexDirection: "row" }}>
      {/* ── Left: Input panel ── */}
      <div style={{ width: 480, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--ws-border)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--ws-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--ws-accent-soft)", border: "1px solid var(--ws-border-strong)", display: "grid", placeItems: "center", color: "var(--ws-accent)", flexShrink: 0 }}>
              <BrainCircuit size={16} />
            </div>
            <div>
              <div className="ws-eyebrow" style={{ marginBottom: 2 }}>Encadenamiento hacia adelante</div>
              <div style={{ color: "var(--ws-text)", fontWeight: 700, fontSize: 15, lineHeight: 1 }}>Motor de Inferencia</div>
            </div>
          </div>
        </div>

        {/* Templates */}
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--ws-border)", flexShrink: 0 }}>
          <div className="ws-eyebrow" style={{ marginBottom: 8 }}>Plantillas de inferencia</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TEMPLATES.map((t) => (
              <button key={t.label} className="ws-btn ws-btn--ghost" style={{ padding: "8px 12px", fontSize: 12, textAlign: "left", display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }} onClick={() => loadTemplate(t)}>
                <span style={{ fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 10, color: "var(--ws-text-dim)", lineHeight: 1.4 }}>{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="ws-scroll ws-padded" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="ws-label">Hechos</label>
            <div className="ws-body" style={{ marginBottom: 8 }}>Un hecho por línea usando el formato <code style={{ color: "var(--ws-accent)", fontSize: 11 }}>predicado(sujeto, objeto)</code>.</div>
            <textarea
              className="ws-textarea"
              value={facts}
              onChange={(e) => setFacts(e.target.value)}
              rows={6}
              spellCheck={false}
            />
          </div>

          <div>
            <label className="ws-label">Reglas</label>
            <div className="ws-body" style={{ marginBottom: 8 }}>Usa la sintaxis <code style={{ color: "var(--ws-amber)", fontSize: 11 }}>IF … AND … THEN …</code> con variables prefijadas con <code style={{ color: "var(--ws-amber)", fontSize: 11 }}>?</code>.</div>
            <textarea
              className="ws-textarea"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={5}
              spellCheck={false}
            />
          </div>

          {/* Apply toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", borderRadius: "var(--ws-radius-sm)", border: "1px solid var(--ws-border)", background: applyToGraph ? "var(--ws-green-soft)" : "var(--ws-surface)" }}>
            <div style={{ position: "relative", width: 36, height: 20, flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={applyToGraph}
                onChange={(e) => setApplyToGraph(e.target.checked)}
                style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer", margin: 0 }}
              />
              <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: applyToGraph ? "var(--ws-green)" : "rgba(255,255,255,0.12)", transition: "background 180ms ease" }} />
              <div style={{ position: "absolute", top: 3, left: applyToGraph ? 19 : 3, width: 14, height: 14, borderRadius: 999, background: "#fff", transition: "left 180ms ease", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: applyToGraph ? "#6ee7b7" : "var(--ws-text-muted)" }}>Escribir hechos inferidos al grafo</div>
              <div style={{ fontSize: 11, color: "var(--ws-text-dim)" }}>Los hechos binarios inferidos se añaden como aristas</div>
            </div>
          </label>

          {/* AI: Translate natural language to rule */}
          <div style={{ padding: "12px 14px", borderRadius: "var(--ws-radius-sm)", border: "1px solid var(--ws-border)", background: "var(--ws-surface)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Wand2 size={13} color="var(--ws-accent)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ws-text)" }}>Traducir regla en lenguaje natural</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                className="ws-input"
                value={nlRule}
                onChange={(e) => setNlRule(e.target.value)}
                placeholder="Ej: si un campo es equivalente a otro, hereda sus derivaciones"
                style={{ flex: 1, fontSize: 12 }}
                onKeyDown={(e) => { if (e.key === "Enter") handleTranslateRule(); }}
              />
              <button
                className="ws-btn ws-btn--ghost"
                onClick={handleTranslateRule}
                disabled={isTranslating || !nlRule.trim()}
                style={{ padding: "6px 10px", fontSize: 11, flexShrink: 0 }}
              >
                {isTranslating ? <Loader2 size={13} className="ws-spin" /> : <Sparkles size={13} />}
              </button>
            </div>
            {translateError && <div style={{ fontSize: 11, color: "#fca5a5" }}>{translateError}</div>}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="ws-btn ws-btn--primary"
              onClick={handleRun}
              disabled={isRunning}
              style={{ flex: 1, justifyContent: "center" }}
            >
              {isRunning
                ?<><span className="ws-spin" style={{ display: "inline-block" }}><Zap size={15} /></span>Ejecutando…</>
                : <><Play size={14} />Ejecutar inferencia</>}
            </button>
            <button className="ws-btn ws-btn--ghost" onClick={handleReset} title="Restablecer valores por defecto">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Results panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--ws-border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ws-text)" }}>Resultados de inferencia</div>
          {result && !isRunning && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <span className="ws-pill ws-pill--accent">
                <Zap size={9} /> {result.rules_fired ?? 0} reglas activadas
              </span>
              <span className="ws-pill ws-pill--green">
                <GitBranch size={9} /> {result.added_edges ?? 0} aristas añadidas
              </span>
              {result.mutated
                ? <span className="ws-pill ws-pill--green">grafo actualizado</span>
                : <span className="ws-pill ws-pill--mono">solo vista previa</span>}
            </div>
          )}
        </div>

        <div className="ws-scroll ws-padded" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && (
            <div className="ws-animate-in" style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--ws-radius-sm)", background: "var(--ws-red-soft)", border: "1px solid rgba(255,123,114,0.28)", color: "#fca5a5", fontSize: 13 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{error}</div>
            </div>
          )}

          {isRunning && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3,4].map((i) => <div key={i} className="ws-skeleton" style={{ height: 52 }} />)}
            </div>
          )}

          {result && !isRunning && (
            <div className="ws-animate-in">
              {(result.inferred_facts ?? []).length === 0 ? (
                <div className="ws-empty">
                  <div className="ws-empty-icon"><CheckCircle2 size={32} /></div>
                  <div className="ws-empty-title">Inferencia completada</div>
                  <div className="ws-empty-body">No se infirieron nuevos hechos a partir de las reglas y hechos actuales.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.inferred_facts!.map((fact, i) => (
                    <div key={`${fact}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: "var(--ws-radius-sm)", background: "var(--ws-surface)", border: "1px solid var(--ws-border)" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.28)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                        <CheckCircle2 size={11} color="var(--ws-green)" />
                      </div>
                      <code style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, color: "var(--ws-text)", lineHeight: 1.6, wordBreak: "break-all" }}>{fact}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result && !isRunning && !error && (
            <div className="ws-empty">
              <div className="ws-empty-icon"><Info size={32} /></div>
              <div className="ws-empty-title">Listo para inferir</div>
              <div className="ws-empty-body">Ingresa hechos y reglas a la izquierda, luego haz clic en Ejecutar inferencia para ver los resultados aquí.</div>
            </div>
          )}

          {/* AI Explanation */}
          {result && !isRunning && (
            <div className="ws-animate-in" style={{ marginTop: 8, padding: "14px 16px", borderRadius: "var(--ws-radius-sm)", border: "1px solid rgba(99,102,241,0.22)", background: "rgba(99,102,241,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Sparkles size={15} color="#a78bfa" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ws-text)" }}>Explicación con IA</span>
                {!explanation && !isExplaining && (
                  <button
                    className="ws-btn ws-btn--ghost"
                    onClick={handleExplain}
                    style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}
                  >
                    <Sparkles size={12} /> Explicar resultados
                  </button>
                )}
              </div>
              {isExplaining && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ws-text-dim)", fontSize: 12 }}>
                  <Loader2 size={14} className="ws-spin" />
                  <span>El LLM está analizando los resultados…</span>
                </div>
              )}
              {explainError && (
                <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 6 }}>{explainError}</div>
              )}
              {explanation && !isExplaining && (
                <div style={{ fontSize: 13, color: "var(--ws-text)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{explanation}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

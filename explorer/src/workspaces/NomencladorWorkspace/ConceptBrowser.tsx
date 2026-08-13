import { useState, useEffect } from "react";
import { Loader2, Search, BookOpen, Tag, FileText, Lightbulb, Shield } from "lucide-react";

type Concept = {
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
};

type ConceptDetail = {
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
  fields: Array<{ source: string; column: string }>;
  classifier?: { standard: string; name: string; values: Record<string, string> };
  normatives: Array<{ id: string; title: string; citation: string; similarity_score: number }>;
};

type RagResult = {
  id: string;
  source: string;
  text: string;
  tags: string[];
  score: number;
};

export function ConceptBrowser() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [ragResults, setRagResults] = useState<RagResult[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/nomenclador/concepts");
        const data = await res.json();
        setConcepts(data.concepts || []);
      } catch (e) {
        console.error("Failed to load concepts", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function selectConcept(name: string) {
    setDetailLoading(true);
    setSelected(null);
    setRagResults([]);
    try {
      const [conceptRes, ragRes] = await Promise.all([
        fetch(`/api/nomenclador/concept/${name}`).then((r) => r.json()),
        fetch(`/api/nomenclador/rag/search?q=${encodeURIComponent(name)}`).then((r) => r.ok ? r.json() : null),
      ]);
      setSelected(conceptRes);
      if (ragRes) setRagResults(ragRes.results || []);
    } catch (e) {
      console.error("Failed to load concept detail", e);
    } finally {
      setDetailLoading(false);
    }
  }

  const filtered = search
    ? concepts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : concepts;

  const conceptsWithStandard = filtered.filter((c) => c.standard);
  const conceptsWithoutStandard = filtered.filter((c) => !c.standard);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "var(--ws-bg)", overflow: "hidden" }}>
      {/* Left: concept list */}
      <div style={{
        width: 320, borderRight: "1px solid var(--ws-border)",
        display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)",
      }}>
        {/* Search */}
        <div style={{ padding: 16, borderBottom: "1px solid var(--ws-border)" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--ws-text-dim)" }} />
            <input
              type="text"
              placeholder="Buscar concepto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                borderRadius: 8, padding: "8px 12px 8px 32px", color: "var(--ws-text)",
                fontSize: "13px", width: "100%",
              }}
            />
          </div>
        </div>

        {/* Concept list */}
        <div className="ws-scroll" style={{ flex: 1 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 size={20} className="animate-spin" color="var(--ws-accent)" />
            </div>
          ) : (
            <>
              {conceptsWithStandard.length > 0 && (
                <div style={{ padding: "8px 12px 4px", fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Con estándar
                </div>
              )}
              {conceptsWithStandard.map((c) => (
                <ConceptListItem key={c.name} concept={c} onSelect={selectConcept} hasStandard />
              ))}
              {conceptsWithoutStandard.length > 0 && (
                <div style={{ padding: "12px 12px 4px", fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Sin estándar
                </div>
              )}
              {conceptsWithoutStandard.map((c) => (
                <ConceptListItem key={c.name} concept={c} onSelect={selectConcept} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
        {detailLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
          </div>
        ) : selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800 }}>
            {/* Header */}
            <div className="ws-card" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <BookOpen size={22} color="var(--ws-accent)" />
                <h2 style={{ margin: 0, fontSize: "20px", color: "var(--ws-text)" }}>{selected.name}</h2>
                {selected.standard && (
                  <span style={{
                    background: "var(--ws-purple-soft)", color: "var(--ws-purple)",
                    padding: "3px 12px", borderRadius: 12, fontSize: "12px", fontWeight: 600,
                  }}>
                    {selected.standard}
                  </span>
                )}
              </div>
              <p style={{ margin: "4px 0 0 0", color: "var(--ws-text-muted)", fontSize: "14px" }}>
                {selected.definition}
              </p>
            </div>

            {/* Fields */}
            {selected.fields && selected.fields.length > 0 && (
              <div className="ws-card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--ws-text)" }}>
                  Campos que implementan este concepto
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selected.fields.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, fontSize: "13px",
                      padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 6,
                    }}>
                      <Tag size={12} color="var(--ws-accent)" />
                      <span style={{ color: "var(--ws-text)", fontFamily: "monospace" }}>{f.column}</span>
                      <span style={{ color: "var(--ws-text-dim)" }}>← {f.source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Classifier */}
            {selected.classifier && (
              <div className="ws-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Shield size={16} color="var(--ws-green)" />
                  <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
                    Clasificador: {selected.classifier.name}
                  </h3>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(selected.classifier.values).map(([code, label]) => (
                    <div key={code} style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: "12px",
                      background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.2)",
                    }}>
                      <span style={{ color: "var(--ws-green)", fontFamily: "monospace", fontWeight: 600 }}>{code}</span>
                      <span style={{ color: "var(--ws-text-muted)", marginLeft: 6 }}>→ {label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Normatives from graph */}
            {selected.normatives && selected.normatives.length > 0 && (
              <div className="ws-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <FileText size={16} color="var(--ws-amber)" />
                  <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
                    Normativas vinculadas
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selected.normatives.map((n, i) => (
                    <div key={i} className="ws-panel--inset" style={{ padding: 14, borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: "13px", color: "var(--ws-amber)", fontWeight: 600 }}>{n.title}</span>
                        <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                          score: {(n.similarity_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                        {n.citation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RAG — Documental references */}
            {ragResults.length > 0 && (
              <div className="ws-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Lightbulb size={16} color="var(--ws-accent)" />
                  <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
                    Referencia documental (RAG)
                  </h3>
                  <span style={{
                    background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                    padding: "2px 8px", borderRadius: 10, fontSize: "11px",
                  }}>
                    {ragResults.length} fragmentos
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {ragResults.map((r, i) => (
                    <div key={i} className="ws-panel--inset" style={{ padding: 16, borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: "12px", color: "var(--ws-accent)", fontWeight: 600 }}>
                          {r.source}
                        </span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {r.tags.map((tag) => (
                            <span key={tag} style={{
                              fontSize: "10px", padding: "1px 6px", borderRadius: 4,
                              background: "rgba(74,163,255,0.08)", color: "var(--ws-text-muted)",
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p style={{
                        margin: 0, fontSize: "12px", color: "var(--ws-text)",
                        lineHeight: 1.6, whiteSpace: "pre-wrap",
                        maxHeight: 200, overflow: "auto",
                      }}>
                        {r.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--ws-text-muted)", fontSize: "14px", gap: 8,
          }}>
            <BookOpen size={32} color="var(--ws-text-dim)" />
            <p>Selecciona un concepto para ver su detalle, fuentes, clasificador y referencias documentales.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptListItem({
  concept,
  onSelect,
  hasStandard,
}: {
  concept: Concept;
  onSelect: (name: string) => void;
  hasStandard?: boolean;
}) {
  return (
    <button
      onClick={() => onSelect(concept.name)}
      style={{
        display: "flex", flexDirection: "column", width: "100%", textAlign: "left",
        padding: "10px 14px", border: "none", background: "transparent",
        cursor: "pointer", borderBottom: "1px solid rgba(74,163,255,0.05)",
        transition: "background 160ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ws-surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: "13px", color: "var(--ws-text)", fontWeight: 500 }}>
          {concept.name}
        </span>
        {hasStandard && (
          <Tag size={11} color="var(--ws-purple)" />
        )}
      </div>
      <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", marginTop: 2 }}>
        {concept.sources.length} fuente{concept.sources.length !== 1 ? "s" : ""}
        {concept.standard && ` · ${concept.standard}`}
      </div>
    </button>
  );
}

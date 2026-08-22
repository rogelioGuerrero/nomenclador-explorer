import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Network, BookOpen, ArrowRight, X } from "lucide-react";

type GraphResult = {
  node: { id: string; type: string; content: string; properties: Record<string, unknown> };
  score: number;
};

type ConceptResult = {
  id: string;
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
};

type SearchResults = {
  graph: GraphResult[];
  concepts: ConceptResult[];
};

type GlobalSearchProps = {
  onNavigateGraph: (nodeId: string) => void;
  onNavigateConcept: (conceptName: string) => void;
};

export function GlobalSearch({ onNavigateGraph, onNavigateConcept }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setQuery("");
    setResults(null);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const [graphRes, conceptRes] = await Promise.all([
        fetch("/api/graph/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 5 }),
        }).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/nomenclador/search?q=${encodeURIComponent(q)}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

      setResults({
        graph: graphRes?.results ?? [],
        concepts: conceptRes?.results ?? [],
      });
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => void doSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setModalOpen(true);
      }
      if (e.key === "Escape" && modalOpen) {
        closeModal();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [modalOpen, closeModal]);

  useEffect(() => {
    if (modalOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [modalOpen]);

  const hasResults = results && (results.graph.length > 0 || results.concepts.length > 0);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        title="Buscar (Ctrl+K)"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", padding: "8px", borderRadius: 8,
          background: "rgba(0,0,0,0.25)", border: "1px solid var(--ws-border)",
          cursor: "pointer", color: "var(--ws-text-dim)",
        }}
      >
        <Search size={16} />
      </button>

      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "15vh",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="search-modal"
            style={{
              width: "min(560px, 90vw)", maxHeight: "70vh",
              borderRadius: 14, overflow: "hidden",
              background: "var(--ws-bg-elevated, #0d1117)",
              border: "1px solid var(--ws-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Input header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 18px", borderBottom: "1px solid var(--ws-border)",
            }}>
              <Search size={18} color="var(--ws-text-dim)" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en grafo y conceptos…"
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "var(--ws-text)", fontSize: 15, fontFamily: "inherit",
                }}
              />
              {loading && <Loader2 size={16} className="animate-spin" color="var(--ws-text-dim)" />}
              <button
                onClick={closeModal}
                title="Cerrar"
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  color: "var(--ws-text-dim)", padding: 4, borderRadius: 4,
                  display: "flex", alignItems: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {query.trim().length < 2 && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                  Escribe al menos 2 caracteres para buscar
                </div>
              )}
              {query.trim().length >= 2 && loading && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                  <Loader2 size={16} className="animate-spin" style={{ display: "inline-block", marginRight: 8 }} />
                  Buscando…
                </div>
              )}
              {query.trim().length >= 2 && !loading && !hasResults && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 13 }}>
                  No se encontraron resultados para "{query}"
                </div>
              )}
              {query.trim().length >= 2 && !loading && hasResults && (
                <>
                  {results!.concepts.length > 0 && (
                    <div>
                      <div style={{
                        padding: "8px 18px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: 1, color: "var(--ws-text-dim)",
                        background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <BookOpen size={11} /> Conceptos del nomenclador
                      </div>
                      {results!.concepts.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { onNavigateConcept(c.name); closeModal(); }}
                          className="search-result-item"
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            {c.standard && (
                              <div style={{ fontSize: 11, color: "var(--ws-text-dim)" }}>{c.standard}</div>
                            )}
                          </div>
                          <ArrowRight size={14} color="var(--ws-text-dim)" />
                        </button>
                      ))}
                    </div>
                  )}
                  {results!.graph.length > 0 && (
                    <div>
                      <div style={{
                        padding: "8px 18px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: 1, color: "var(--ws-text-dim)",
                        background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <Network size={11} /> Nodos del grafo
                      </div>
                      {results!.graph.map((g) => (
                        <button
                          key={g.node.id}
                          onClick={() => { onNavigateGraph(g.node.id); closeModal(); }}
                          className="search-result-item"
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {g.node.content || g.node.id}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--ws-text-dim)" }}>
                              {g.node.type} · {g.node.id.substring(0, 40)}
                            </div>
                          </div>
                          <ArrowRight size={14} color="var(--ws-text-dim)" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer hint */}
            <div style={{
              padding: "8px 18px", borderTop: "1px solid var(--ws-border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 11, color: "var(--ws-text-dim)",
            }}>
              <span>Esc para cerrar</span>
              <span>Ctrl+K</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

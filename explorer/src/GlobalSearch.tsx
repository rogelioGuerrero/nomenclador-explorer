import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Network, BookOpen, ArrowRight } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const hasResults = results && (results.graph.length > 0 || results.concepts.length > 0);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Collapsed: icon button. Expanded: full input. */}
      {expanded ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.25)", border: "1px solid var(--ws-border)",
        }}>
          <Search size={14} color="var(--ws-text-dim)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar…"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: "var(--ws-text)", fontSize: 12, fontFamily: "inherit", minWidth: 0,
            }}
          />
          {loading && <Loader2 size={12} className="animate-spin" color="var(--ws-text-dim)" />}
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          title="Buscar en grafo y conceptos"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", padding: "8px", borderRadius: 8,
            background: "rgba(0,0,0,0.25)", border: "1px solid var(--ws-border)",
            cursor: "pointer", color: "var(--ws-text-dim)",
          }}
        >
          <Search size={16} />
        </button>
      )}

      {open && query.trim().length >= 2 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          width: 320,
          zIndex: 100, borderRadius: 10, overflow: "hidden",
          background: "var(--ws-bg-elevated, #161b22)", border: "1px solid var(--ws-border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          maxHeight: 400, overflowY: "auto",
        }}>
          {loading && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 12 }}>
              <Loader2 size={14} className="animate-spin" style={{ display: "inline-block", marginRight: 6 }} />
              Buscando…
            </div>
          )}
          {!loading && !hasResults && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--ws-text-dim)", fontSize: 12 }}>
              No se encontraron resultados para "{query}"
            </div>
          )}
          {!loading && hasResults && (
            <>
              {results!.concepts.length > 0 && (
                <div>
                  <div style={{
                    padding: "6px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 1, color: "var(--ws-text-dim)",
                    background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <BookOpen size={11} /> Conceptos del nomenclador
                  </div>
                  {results!.concepts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { onNavigateConcept(c.name); setOpen(false); setExpanded(false); setQuery(""); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "8px 12px", cursor: "pointer",
                        background: "none", border: "none", textAlign: "left",
                        color: "var(--ws-text)", fontSize: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.standard && (
                          <div style={{ fontSize: 10, color: "var(--ws-text-dim)" }}>{c.standard}</div>
                        )}
                      </div>
                      <ArrowRight size={12} color="var(--ws-text-dim)" />
                    </button>
                  ))}
                </div>
              )}
              {results!.graph.length > 0 && (
                <div>
                  <div style={{
                    padding: "6px 12px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 1, color: "var(--ws-text-dim)",
                    background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <Network size={11} /> Nodos del grafo
                  </div>
                  {results!.graph.map((g) => (
                    <button
                      key={g.node.id}
                      onClick={() => { onNavigateGraph(g.node.id); setOpen(false); setExpanded(false); setQuery(""); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "8px 12px", cursor: "pointer",
                        background: "none", border: "none", textAlign: "left",
                        color: "var(--ws-text)", fontSize: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.node.content || g.node.id}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--ws-text-dim)" }}>
                          {g.node.type} · {g.node.id.substring(0, 30)}
                        </div>
                      </div>
                      <ArrowRight size={12} color="var(--ws-text-dim)" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

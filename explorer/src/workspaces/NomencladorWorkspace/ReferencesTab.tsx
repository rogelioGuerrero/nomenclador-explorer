import { useState, useEffect, useRef } from "react";
import { Loader2, Search, FileText, BookOpen, RefreshCw, GitBranch, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";

type Normative = {
  id: string;
  title: string;
  source: string;
  citation: string;
  similarity_score: number;
};

type RagChunk = {
  id: string;
  source: string;
  source_type: string;
  chunk_index: number;
  tags: string[];
  text_preview: string;
};

type RagSearchResult = {
  id: string;
  source: string;
  text: string;
  tags: string[];
  score: number;
};

type LineageNode = {
  id: string;
  label: string;
  prov_type: string;
  source_document?: string | null;
  source_location?: string | null;
  confidence?: number | null;
};

type LineageEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  direction: string;
};

type LineageResponse = {
  nodes: LineageNode[];
  edges: LineageEdge[];
  source?: string;
};

export function ReferencesTab() {
  const [normatives, setNormatives] = useState<Normative[]>([]);
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RagSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<string>("");
  const [lineageQuery, setLineageQuery] = useState("");
  const [lineageData, setLineageData] = useState<LineageResponse | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [normRes, chunksRes] = await Promise.all([
          fetch("/api/nomenclador/normatives").then((r) => r.json()),
          fetch("/api/nomenclador/rag/chunks").then((r) => r.ok ? r.json() : null),
        ]);
        setNormatives(normRes.normatives || []);
        if (chunksRes) setChunks(chunksRes.chunks || []);
      } catch (e) {
        console.error("Failed to load references", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/nomenclador/rag/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.error("RAG search failed", e);
    } finally {
      setSearching(false);
    }
  }

  async function reloadGraph() {
    setReloadStatus("Recargando…");
    try {
      const res = await fetch("/api/nomenclador/reload", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReloadStatus(`Grafo recargado: ${data.nodes} nodos, ${data.edges} edges`);
        // Reload normatives
        const normRes = await fetch("/api/nomenclador/normatives").then((r) => r.json());
        setNormatives(normRes.normatives || []);
      } else {
        setReloadStatus("Error al recargar");
      }
    } catch (e) {
      setReloadStatus("Error de conexión");
    }
  }

  async function handleNormativeUpload(file: File) {
    setUploading(true);
    setUploadFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const tagsParam = uploadTags.trim();
      const url = `/api/governance/normative/upload${tagsParam ? `?tags=${encodeURIComponent(tagsParam)}` : ""}`;
      const res = await fetch(url, { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      const data = await res.json();
      setUploadFeedback({
        ok: true,
        msg: `"${data.source}" ingestado: ${data.chunks_ingested} fragmentos · corpus total: ${data.corpus_total_chunks}`,
      });
      // Reload chunks
      const chunksRes = await fetch("/api/nomenclador/rag/chunks").then((r) => r.ok ? r.json() : null);
      if (chunksRes) setChunks(chunksRes.chunks || []);
    } catch (e) {
      setUploadFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error al subir documento" });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadFeedback(null), 6000);
    }
  }

  async function runLineageSearch() {
    setLineageLoading(true);
    setLineageError("");
    setLineageData(null);
    try {
      const res = await fetch("/api/provenance?node_id=" + encodeURIComponent(lineageQuery.trim()));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 120)}`);
      }
      const data: LineageResponse = await res.json();
      setLineageData(data);
    } catch (e) {
      setLineageError(e instanceof Error ? e.message : "Error al cargar lineage");
    } finally {
      setLineageLoading(false);
    }
  }

  async function downloadLineageReport(format: "json" | "markdown") {
    if (!lineageQuery.trim()) return;
    const suffix = format === "markdown" ? "markdown" : "json";
    const res = await fetch(`/api/provenance/report?node_id=${encodeURIComponent(lineageQuery.trim())}&format=${suffix}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lineageQuery.trim()}_provenance.${format === "markdown" ? "md" : "json"}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      {/* Upload normative document */}
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Upload size={20} color="var(--ws-amber)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Cargar documento normativo
          </h3>
        </div>
        <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
          Sube leyes, reglamentos o manuales técnicos. El agent hará chunking + embeddings y
          buscará respaldo para las variables del nomenclador automáticamente.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Tags (conceptos): sexo, edad, fecha_nacimiento…"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            style={{
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: 8, padding: "10px 14px", color: "var(--ws-text)",
              fontSize: "13px", flex: 1,
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.text"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleNormativeUpload(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: "var(--ws-amber-soft)", border: "1px solid rgba(242,182,109,0.3)",
              borderRadius: 8, padding: "8px 18px", color: "var(--ws-amber)",
              fontSize: "13px", fontWeight: 600, cursor: uploading ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Procesando…" : "Subir documento"}
          </button>
        </div>
        {uploadFeedback && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8,
            background: uploadFeedback.ok ? "var(--ws-green-soft)" : "rgba(255,157,175,0.08)",
            border: `1px solid ${uploadFeedback.ok ? "rgba(76,195,138,0.2)" : "rgba(255,157,175,0.18)"}`,
            fontSize: "12px", color: uploadFeedback.ok ? "var(--ws-green)" : "#ffb4c2",
          }}>
            {uploadFeedback.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {uploadFeedback.msg}
          </div>
        )}
      </div>

      {/* RAG Search */}
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Search size={20} color="var(--ws-accent)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Búsqueda documental (RAG)
          </h3>
          <span style={{
            background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
            padding: "2px 10px", borderRadius: 12, fontSize: "12px",
          }}>
            {chunks.length} fragmentos
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Buscar por variable: sexo, fecha_nacimiento, diagnostico…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            style={{
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: 8, padding: "10px 14px", color: "var(--ws-text)",
              fontSize: "13px", flex: 1,
            }}
          />
          <button
            onClick={runSearch}
            disabled={!searchQuery.trim() || searching}
            style={{
              background: "var(--ws-accent-soft)", border: "1px solid var(--ws-border-strong)",
              borderRadius: 8, padding: "8px 18px", color: "var(--ws-accent)",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
              opacity: (!searchQuery.trim() || searching) ? 0.4 : 1,
            }}
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
          </button>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {searchResults.map((r, i) => (
              <div key={i} className="ws-panel--inset" style={{ padding: 16, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: "12px", color: "var(--ws-accent)", fontWeight: 600 }}>
                    {r.source}
                  </span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {r.tags.map((tag) => (
                      <span key={tag} style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: 4,
                        background: "rgba(74,163,255,0.08)", color: "var(--ws-text-muted)",
                      }}>
                        {tag}
                      </span>
                    ))}
                    <span style={{ fontSize: "10px", color: "var(--ws-green)", marginLeft: 4 }}>
                      score: {r.score}
                    </span>
                  </div>
                </div>
                <p style={{
                  margin: 0, fontSize: "12px", color: "var(--ws-text)",
                  lineHeight: 1.6, whiteSpace: "pre-wrap",
                  maxHeight: 250, overflow: "auto",
                }}>
                  {r.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* All chunks preview when no search */}
        {searchResults.length === 0 && chunks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: "12px", color: "var(--ws-text-muted)", marginBottom: 4 }}>
              Fragmentos del corpus normativo:
            </div>
            {chunks.map((c) => (
              <div key={c.id} className="ws-panel--inset" style={{ padding: 12, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "12px", color: "var(--ws-accent)" }}>{c.source}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {c.tags.map((tag) => (
                      <span key={tag} style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: 4,
                        background: "rgba(74,163,255,0.08)", color: "var(--ws-text-muted)",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: "11px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                  {c.text_preview}…
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Normatives from graph */}
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <FileText size={20} color="var(--ws-amber)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Normativas vinculadas (grafo)
          </h3>
          <span style={{
            background: "var(--ws-amber-soft)", color: "var(--ws-amber)",
            padding: "2px 10px", borderRadius: 12, fontSize: "12px",
          }}>
            {normatives.length} normas
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {normatives.map((n) => (
            <div key={n.id} className="ws-panel--inset" style={{ padding: 14, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <BookOpen size={14} color="var(--ws-amber)" />
                  <span style={{ fontSize: "13px", color: "var(--ws-amber)", fontWeight: 600 }}>
                    {n.title}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                  match: {(n.similarity_score * 100).toFixed(0)}%
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                {n.citation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Provenance Lineage */}
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <GitBranch size={20} color="var(--ws-green)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Cadena de proveniencia (PROV-O)
          </h3>
          {lineageData && (
            <span style={{
              background: "var(--ws-green-soft)", color: "var(--ws-green)",
              padding: "2px 10px", borderRadius: 12, fontSize: "12px",
            }}>
              {lineageData.nodes.length} nodos · {lineageData.edges.length} aristas
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Node ID del indicador o concepto…"
            value={lineageQuery}
            onChange={(e) => setLineageQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runLineageSearch()}
            style={{
              background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
              borderRadius: 8, padding: "10px 14px", color: "var(--ws-text)",
              fontSize: "13px", flex: 1,
            }}
          />
          <button
            onClick={runLineageSearch}
            disabled={!lineageQuery.trim() || lineageLoading}
            style={{
              background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.3)",
              borderRadius: 8, padding: "8px 18px", color: "var(--ws-green)",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
              opacity: (!lineageQuery.trim() || lineageLoading) ? 0.4 : 1,
            }}
          >
            {lineageLoading ? <Loader2 size={14} className="animate-spin" /> : "Trazar"}
          </button>
        </div>

        {lineageError && (
          <div style={{
            padding: 12, borderRadius: 8, marginBottom: 12,
            background: "rgba(255,157,175,0.08)", border: "1px solid rgba(255,157,175,0.18)",
            color: "#ffb4c2", fontSize: "12px",
          }}>
            {lineageError}
          </div>
        )}

        {lineageData && lineageData.nodes.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => downloadLineageReport("json")}
                style={{
                  background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                  borderRadius: 6, padding: "6px 12px", color: "var(--ws-text-muted)",
                  fontSize: "11px", cursor: "pointer",
                }}
              >
                Export JSON
              </button>
              <button
                onClick={() => downloadLineageReport("markdown")}
                style={{
                  background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                  borderRadius: 6, padding: "6px 12px", color: "var(--ws-text-muted)",
                  fontSize: "11px", cursor: "pointer",
                }}
              >
                Export MD
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lineageData.nodes.map((n) => (
                <div key={n.id} className="ws-panel--inset" style={{ padding: 12, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                        background: n.prov_type === "Agent" ? "rgba(74,163,255,0.12)" : n.prov_type === "Activity" ? "rgba(242,182,109,0.12)" : "rgba(76,195,138,0.12)",
                        color: n.prov_type === "Agent" ? "var(--ws-accent)" : n.prov_type === "Activity" ? "var(--ws-amber)" : "var(--ws-green)",
                      }}>
                        {n.prov_type}
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--ws-text)", fontWeight: 600 }}>
                        {n.label}
                      </span>
                    </div>
                    {n.confidence != null && (
                      <span style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>
                        conf: {(n.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {n.source_document && (
                    <div style={{ fontSize: "11px", color: "var(--ws-text-muted)" }}>
                      fuente: {n.source_document}
                      {n.source_location ? ` · ${n.source_location}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {lineageData && lineageData.nodes.length === 0 && (
          <div style={{ fontSize: "12px", color: "var(--ws-text-muted)" }}>
            No se encontró cadena de proveniencia para este nodo.
          </div>
        )}
      </div>

      {/* Graph reload */}
      <div className="ws-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <RefreshCw size={18} color="var(--ws-green)" />
          <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
            Recarga dinámica del grafo
          </h3>
        </div>
        <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "var(--ws-text-muted)" }}>
          Si el governance-agent actualizó el nomenclador.json, recarga el grafo sin reiniciar el servidor.
        </p>
        <button
          onClick={reloadGraph}
          style={{
            background: "var(--ws-green-soft)", border: "1px solid rgba(76,195,138,0.3)",
            borderRadius: 8, padding: "8px 18px", color: "var(--ws-green)",
            fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}
        >
          <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} />
          Recargar grafo
        </button>
        {reloadStatus && (
          <div style={{ marginTop: 10, fontSize: "12px", color: "var(--ws-text-muted)" }}>
            {reloadStatus}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Upload, Database, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Table, FileText, X } from "lucide-react";

type SourceInfo = {
  id: string;
  name: string;
  description: string;
  last_verified: string;
  field_count: number;
  review_status: string;
};

type GovColumn = {
  name: string;
  data_type: string;
  nullable: boolean;
  total_count: number;
  null_count: number;
  unique_count: number;
  sample_values: string[];
  min_value: string | null;
  max_value: string | null;
  inferred_standard: { name: string; standard: string; confidence: string; reason: string } | null;
};

type GovTable = {
  name: string;
  row_count: number;
  columns: GovColumn[];
};

type PreviewResult = {
  filename: string;
  table_count: number;
  tables: GovTable[];
};

export function IngerirFuenteTab() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const pendingFileRef = useRef<File | null>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nomenclador/sources/detailed");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSources(); }, [loadSources]);

  const handleFileSelected = useCallback(async (file: File) => {
    pendingFileRef.current = file;
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/governance/profiler/csv", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Error al previsualizar");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleConfirmUpload = useCallback(async () => {
    const file = pendingFileRef.current;
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/nomenclador/sources/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      const data = await res.json();
      setFeedback({ ok: true, msg: `Esquema "${data.source_name}" registrado: ${data.field_count} campos detectados` });
      setPreview(null);
      pendingFileRef.current = null;
      void loadSources();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error al subir" });
    } finally {
      setUploading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [loadSources]);

  const handleCancelPreview = useCallback(() => {
    setPreview(null);
    pendingFileRef.current = null;
    setPreviewError("");
  }, []);

  const handleDelete = useCallback(async (sourceId: string) => {
    setDeleting(sourceId);
    try {
      const res = await fetch(`/api/nomenclador/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      setFeedback({ ok: true, msg: "Fuente eliminada del nomenclador" });
      void loadSources();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error al eliminar" });
    } finally {
      setDeleting(null);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [loadSources]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      {/* Upload zone */}
      <div className="ws-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Upload size={20} color="var(--ws-accent)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Conectar fuente de datos
          </h3>
        </div>
        <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.6 }}>
          Selecciona un archivo para leer su estructura: detección de tipos, calidad, cardinalidad y matching contra conceptos del nomenclador.
        </p>
        <p style={{ margin: "0 0 14px 0", fontSize: 11, color: "var(--ws-text-dim)", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6 }}>
          <Database size={12} /> Solo se procesa metadato del esquema. Los datos no se almacenan ni transfieren.
        </p>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.json,.ndjson,.parquet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
            e.target.value = "";
          }}
          disabled={uploading || previewLoading}
          style={{ display: "none" }}
          id="csv-upload"
        />
        <label
          htmlFor="csv-upload"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 8, cursor: uploading ? "wait" : "pointer",
            border: "1px dashed var(--ws-accent)",
            background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
            fontSize: "13px", fontWeight: 600,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? "Procesando…" : previewLoading ? "Leyendo esquema…" : "Conectar fuente"}
        </label>
        {feedback && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: feedback.ok ? "var(--ws-green-soft)" : "var(--ws-red-soft)",
            border: `1px solid ${feedback.ok ? "var(--ws-green)" : "var(--ws-red)"}`,
            fontSize: "12px", color: feedback.ok ? "var(--ws-green)" : "var(--ws-red)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {feedback.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {feedback.msg}
          </div>
        )}
        {previewError && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "var(--ws-red-soft)", border: "1px solid var(--ws-red)",
            fontSize: "12px", color: "var(--ws-red)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <AlertTriangle size={14} /> {previewError}
          </div>
        )}

        {/* Preview panel */}
        {preview && !previewLoading && (
          <div style={{
            marginTop: 14, borderRadius: 10, overflow: "hidden",
            border: "1px solid var(--ws-border)", background: "var(--ws-surface)",
          }}>
            {/* Preview header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: "1px solid var(--ws-border)", background: "rgba(0,0,0,0.2)",
            }}>
              <FileText size={15} color="var(--ws-accent)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ws-text)" }}>
                {preview.filename}
              </span>
              <span style={{ fontSize: 11, color: "var(--ws-text-dim)" }}>
                {preview.tables[0]?.row_count ?? 0} filas · {preview.tables[0]?.columns.length ?? 0} columnas
              </span>
              <button
                onClick={handleCancelPreview}
                style={{
                  marginLeft: "auto", padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                  border: "1px solid var(--ws-border)", background: "var(--ws-surface)",
                  color: "var(--ws-text-muted)", display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11,
                }}
              >
                <X size={12} /> Cancelar
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={uploading}
                style={{
                  padding: "4px 12px", borderRadius: 6, cursor: uploading ? "wait" : "pointer",
                  border: "1px solid rgba(76,195,138,0.3)", background: "var(--ws-green-soft)",
                  color: "var(--ws-green)", fontSize: 11, fontWeight: 600,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  opacity: uploading ? 0.5 : 1,
                }}
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Registrar en nomenclador
              </button>
            </div>
            {/* Column profiling table */}
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--ws-surface)", zIndex: 1 }}>
                  <tr style={{ borderBottom: "1px solid var(--ws-border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Columna</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Tipo</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Nulos</th>
                    <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Únicos</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Estándar</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--ws-text-dim)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Muestras</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.tables[0]?.columns ?? []).map((col, i) => {
                    const compPct = col.total_count > 0 ? Math.round((1 - col.null_count / col.total_count) * 100) : 0;
                    const compColor = compPct >= 90 ? "var(--ws-green)" : compPct >= 60 ? "var(--ws-amber)" : "var(--ws-red)";
                    const std = col.inferred_standard;
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--ws-border)" }}>
                        <td style={{ padding: "6px 10px", color: "var(--ws-text)", fontWeight: 600 }}>{col.name}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                            background: col.data_type === "integer" || col.data_type === "float" ? "rgba(99,102,241,0.12)" : col.data_type === "date" ? "rgba(72,209,204,0.12)" : "rgba(96,112,136,0.12)",
                            color: col.data_type === "integer" || col.data_type === "float" ? "#a78bfa" : col.data_type === "date" ? "#48d1cc" : "var(--ws-text-muted)",
                          }}>
                            {col.data_type}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: compColor, fontWeight: 600 }}>{col.null_count}/{col.total_count}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--ws-text-muted)" }}>{col.unique_count}</td>
                        <td style={{ padding: "6px 10px", fontSize: 10 }}>
                          {std ? (
                            <span style={{ color: std.confidence === "high" ? "var(--ws-green)" : "var(--ws-amber)", fontWeight: 600 }}>
                              {std.standard}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ws-text-dim)" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px", color: "var(--ws-text-dim)", fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {col.sample_values.join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Sources list */}
      <div className="ws-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Database size={18} color="var(--ws-accent)" />
          <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
            Fuentes registradas ({sources.length})
          </h3>
          <button
            onClick={() => void loadSources()}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              border: "1px solid var(--ws-border)", background: "var(--ws-surface)",
              color: "var(--ws-text-muted)", fontSize: "11px",
            }}
          >
            <RefreshCw size={11} />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
            <Loader2 size={20} className="animate-spin" color="var(--ws-accent)" />
          </div>
        ) : sources.length === 0 ? (
          <p style={{ color: "var(--ws-text-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>
            No hay fuentes registradas.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sources.map((src) => (
              <div
                key={src.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(0,0,0,0.2)", border: "1px solid var(--ws-border)",
                }}
              >
                <Table size={16} color="var(--ws-accent)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ws-text)" }}>
                    {src.name}
                    <span style={{
                      marginLeft: 8, fontSize: "10px", fontWeight: 600,
                      background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                      padding: "1px 6px", borderRadius: 4,
                    }}>
                      {src.field_count} campos
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                    {src.description || "Sin descripción"}
                    {src.last_verified && ` · Verificado: ${new Date(src.last_verified).toLocaleDateString("es")}`}
                  </div>
                </div>
                {src.review_status && src.review_status !== "approved" && (
                  <span style={{
                    fontSize: "10px", padding: "2px 8px", borderRadius: 4,
                    background: "var(--ws-amber-soft)", color: "var(--ws-amber)", fontWeight: 600,
                  }}>
                    {src.review_status}
                  </span>
                )}
                <button
                  onClick={() => void handleDelete(src.id)}
                  disabled={deleting === src.id}
                  title="Eliminar fuente del nomenclador"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                    border: "1px solid var(--ws-red)", background: "var(--ws-red-soft)",
                    color: "var(--ws-red)", fontSize: "11px", fontWeight: 500,
                    opacity: deleting === src.id ? 0.5 : 1,
                  }}
                >
                  {deleting === src.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

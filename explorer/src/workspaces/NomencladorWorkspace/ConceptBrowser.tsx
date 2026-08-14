import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, BookOpen, Tag, FileText, Lightbulb, Shield, AlertCircle, Clock, CheckCircle2, Eye, Lock, EyeOff, MessageSquare, X, Archive, History } from "lucide-react";

type ReviewStatus = "approved" | "proposed" | "under_review" | "rejected" | "deprecated";

type Concept = {
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
  source_count?: number;
  review_status?: ReviewStatus;
  proposed_by?: string;
  data_classification?: string;
  custodian?: string;
};

type FieldDetail = {
  source: string;
  column: string;
  data_type?: string;
  confidence?: string;
  data_classification?: string;
  quality_score?: number;
  review_status?: ReviewStatus;
  completeness?: number;
  uniqueness?: number;
  consistency?: number;
  validity?: number;
  last_verified?: string;
};

type ConceptDetail = {
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
  fields: FieldDetail[];
  review_status?: ReviewStatus;
  proposed_by?: string;
  data_classification?: string;
  custodian?: string;
  custodian_department?: string;
  population?: string;
  capture_method?: string;
  normative?: string;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_history?: Array<{ timestamp: string; status: string; notes: string; reviewed_by: string }>;
  deprecated_at?: string;
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

const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  approved: { label: "Aprobado", color: "var(--ws-green)", bg: "var(--ws-green-soft)", icon: CheckCircle2 },
  proposed: { label: "Propuesto", color: "var(--ws-amber)", bg: "var(--ws-amber-soft)", icon: Clock },
  under_review: { label: "En revisión", color: "var(--ws-accent)", bg: "var(--ws-accent-soft)", icon: Eye },
  rejected: { label: "Rechazado", color: "var(--ws-red)", bg: "var(--ws-red-soft)", icon: AlertCircle },
  deprecated: { label: "Deprecado", color: "var(--ws-text-dim)", bg: "rgba(90,122,154,0.12)", icon: Archive },
};

const CLASSIFICATION_META: Record<string, { label: string; color: string; bg: string; icon: typeof Lock }> = {
  publico: { label: "Público", color: "var(--ws-green)", bg: "var(--ws-green-soft)", icon: EyeOff },
  interno: { label: "Interno", color: "var(--ws-accent)", bg: "var(--ws-accent-soft)", icon: Eye },
  pii: { label: "PII", color: "var(--ws-amber)", bg: "var(--ws-amber-soft)", icon: Lock },
  sensible: { label: "Sensible", color: "var(--ws-red)", bg: "var(--ws-red-soft)", icon: Lock },
};

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const meta = REVIEW_STATUS_META[status] || REVIEW_STATUS_META.approved;
  const Icon = meta.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: meta.bg, color: meta.color,
      padding: "2px 8px", borderRadius: 10, fontSize: "11px", fontWeight: 600,
    }}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function ClassificationBadge({ classification }: { classification: string }) {
  const meta = CLASSIFICATION_META[classification] || CLASSIFICATION_META.publico;
  const Icon = meta.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: meta.bg, color: meta.color,
      padding: "2px 7px", borderRadius: 8, fontSize: "10px", fontWeight: 600,
    }}>
      <Icon size={10} />
      {meta.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const color = confidence === "high" ? "var(--ws-green)" : confidence === "medium" ? "var(--ws-amber)" : "var(--ws-text-dim)";
  return (
    <span style={{
      fontSize: "10px", color, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: 0.5,
    }}>
      {confidence}
    </span>
  );
}

function ReviewPanel({
  concept,
  onReviewed,
}: {
  concept: ConceptDetail;
  onReviewed: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const submit = useCallback(async (status: "approved" | "rejected" | "under_review" | "deprecated") => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/nomenclador/concepts/${encodeURIComponent(concept.name)}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: status,
          review_notes: notes,
          reviewed_by: reviewedBy,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 150)}`);
      }
      const labels: Record<string, string> = { approved: "Aprobado", rejected: "Rechazado", under_review: "En revisión", deprecated: "Deprecado" };
      setFeedback({ ok: true, msg: `${labels[status]} correctamente` });
      setNotes("");
      onReviewed();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error" });
    } finally {
      setSubmitting(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  }, [concept.name, notes, reviewedBy, onReviewed]);

  const isPending = concept.review_status === "proposed" || concept.review_status === "under_review";
  const isDeprecated = concept.review_status === "deprecated";
  const history = concept.review_history || [];

  return (
    <div className="ws-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <MessageSquare size={16} color="var(--ws-accent)" />
        <h3 style={{ margin: 0, fontSize: "14px", color: "var(--ws-text)" }}>
          Revisión de gobernanza
        </h3>
        {concept.review_status && (
          <ReviewBadge status={concept.review_status} />
        )}
      </div>

      {/* Existing review notes */}
      {concept.review_notes && (
        <div style={{
          padding: 12, marginBottom: 14, borderRadius: 8,
          background: "rgba(0,0,0,0.2)", border: "1px solid var(--ws-border)",
        }}>
          <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            Notas previas
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {concept.review_notes}
          </p>
          {concept.reviewed_by && (
            <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "var(--ws-text-dim)" }}>
              — {concept.reviewed_by}
              {concept.reviewed_at && ` · ${new Date(concept.reviewed_at).toLocaleString("es")}`}
            </p>
          )}
        </div>
      )}

      {/* Review history timeline */}
      {history.length > 0 && (
        <div style={{
          padding: 14, marginBottom: 14, borderRadius: 8,
          background: "rgba(0,0,0,0.15)", border: "1px solid var(--ws-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <History size={12} color="var(--ws-text-dim)" />
            <span style={{ fontSize: "11px", color: "var(--ws-text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
              Lifecycle ({history.length} eventos)
            </span>
          </div>
          <div style={{ position: "relative", paddingLeft: 20 }}>
            {/* Vertical connector line */}
            <div style={{
              position: "absolute", left: 7, top: 6, bottom: 6,
              width: 2, background: "var(--ws-border)",
            }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {history.map((h, i) => {
                const meta = REVIEW_STATUS_META[h.status as ReviewStatus];
                const isLast = i === history.length - 1;
                return (
                  <div key={i} style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {/* Dot */}
                    <div style={{
                      position: "absolute", left: -20, top: 2,
                      width: 12, height: 12, borderRadius: "50%",
                      background: meta?.color || "var(--ws-text-dim)",
                      border: "2px solid var(--ws-bg)",
                      boxShadow: isLast ? `0 0 0 3px ${meta?.color || "var(--ws-text-dim)"}33` : "none",
                      zIndex: 1,
                    }} />
                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: meta?.color || "var(--ws-text-dim)" }}>
                          {meta?.label || h.status}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>
                          {new Date(h.timestamp).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--ws-text-dim)" }}>
                          · {h.reviewed_by || "anónimo"}
                        </span>
                      </div>
                      {h.notes && (
                        <div style={{ fontSize: "11px", color: "var(--ws-text-muted)", marginTop: 3, lineHeight: 1.5 }}>
                          {h.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Deprecation warning */}
      {isDeprecated && concept.deprecated_at && (
        <div style={{
          padding: 10, marginBottom: 14, borderRadius: 8,
          background: "rgba(90,122,154,0.08)", border: "1px solid rgba(90,122,154,0.2)",
          fontSize: "12px", color: "var(--ws-text-dim)",
        }}>
          <Archive size={12} style={{ display: "inline", marginRight: 6 }} />
          Variable deprecada el {new Date(concept.deprecated_at).toLocaleDateString("es")}.
          No usar en nuevos instrumentos.
        </div>
      )}

      {/* Reviewer name */}
      <input
        type="text"
        placeholder="Tu nombre (custodio / revisor)…"
        value={reviewedBy}
        onChange={(e) => setReviewedBy(e.target.value)}
        style={{
          width: "100%", padding: "8px 12px", marginBottom: 10, fontSize: 13,
          background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
          borderRadius: 8, color: "var(--ws-text)",
        }}
      />

      {/* Notes textarea */}
      <textarea
        placeholder="Notas explicativas: justifica la decisión, documenta hallazgos, agrega contexto…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        style={{
          width: "100%", padding: "10px 12px", marginBottom: 12, fontSize: 13,
          background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
          borderRadius: 8, color: "var(--ws-text)", resize: "vertical",
          fontFamily: "inherit",
        }}
      />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {isPending ? (
          <>
            <button
              onClick={() => void submit("approved")}
              disabled={submitting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--ws-green)",
                background: "var(--ws-green-soft)", color: "var(--ws-green)",
                fontSize: "13px", fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <CheckCircle2 size={14} />
              Aprobar
            </button>
            <button
              onClick={() => void submit("rejected")}
              disabled={submitting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--ws-red)",
                background: "var(--ws-red-soft)", color: "var(--ws-red)",
                fontSize: "13px", fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <X size={14} />
              Rechazar
            </button>
            <button
              onClick={() => void submit("under_review")}
              disabled={submitting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--ws-accent)",
                background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                fontSize: "13px", fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <Eye size={14} />
              En revisión
            </button>
          </>
        ) : (
          <button
            onClick={() => void submit("under_review")}
            disabled={submitting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--ws-border)",
              background: "var(--ws-surface)", color: "var(--ws-text-muted)",
              fontSize: "13px", fontWeight: 500,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <Clock size={14} />
            Reabrir revisión
          </button>
        )}
        {!isDeprecated && (
          <button
            onClick={() => void submit("deprecated")}
            disabled={submitting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--ws-text-dim)",
              background: "rgba(90,122,154,0.08)", color: "var(--ws-text-dim)",
              fontSize: "13px", fontWeight: 500,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <Archive size={14} />
            Deprecar
          </button>
        )}
        {isDeprecated && (
          <button
            onClick={() => void submit("approved")}
            disabled={submitting}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, cursor: "pointer",
              border: "1px solid var(--ws-green)",
              background: "var(--ws-green-soft)", color: "var(--ws-green)",
              fontSize: "13px", fontWeight: 600,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <CheckCircle2 size={14} />
            Reactivar
          </button>
        )}
        {submitting && <Loader2 size={14} className="animate-spin" color="var(--ws-accent)" />}
        {feedback && (
          <span style={{
            fontSize: "12px",
            color: feedback.ok ? "var(--ws-green)" : "var(--ws-red)",
          }}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

export function ConceptBrowser() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPending, setFilterPending] = useState(false);
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

  const refreshConcepts = useCallback(async () => {
    try {
      const res = await fetch("/api/nomenclador/concepts");
      const data = await res.json();
      setConcepts(data.concepts || []);
    } catch {
      // ignore
    }
  }, []);

  const handleReviewed = useCallback(() => {
    if (selected) {
      void selectConcept(selected.name);
      void refreshConcepts();
    }
  }, [selected, refreshConcepts]);

  const filtered = concepts.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPending && c.review_status !== "proposed" && c.review_status !== "under_review") return false;
    return true;
  });

  const pendingCount = concepts.filter(
    (c) => c.review_status === "proposed" || c.review_status === "under_review",
  ).length;

  const conceptsWithStandard = filtered.filter((c) => c.standard);
  const conceptsWithoutStandard = filtered.filter((c) => !c.standard);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "var(--ws-bg)", overflow: "hidden" }}>
      {/* Left: concept list */}
      <div style={{
        width: 320, borderRight: "1px solid var(--ws-border)",
        display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.15)",
      }}>
        {/* Search + filter */}
        <div style={{ padding: 16, borderBottom: "1px solid var(--ws-border)", display: "flex", flexDirection: "column", gap: 8 }}>
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
          {pendingCount > 0 && (
            <button
              onClick={() => setFilterPending((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                border: "1px solid var(--ws-border)",
                background: filterPending ? "var(--ws-amber-soft)" : "transparent",
                color: filterPending ? "var(--ws-amber)" : "var(--ws-text-muted)",
                fontSize: "12px", fontWeight: 500, transition: "all 160ms ease",
              }}
            >
              <Clock size={13} />
              {filterPending ? "Mostrar todos" : `Pendientes (${pendingCount})`}
            </button>
          )}
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
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
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
                {selected.review_status && selected.review_status !== "approved" && (
                  <ReviewBadge status={selected.review_status} />
                )}
                {selected.data_classification && selected.data_classification !== "publico" && (
                  <ClassificationBadge classification={selected.data_classification} />
                )}
              </div>
              <p style={{ margin: "4px 0 0 0", color: "var(--ws-text-muted)", fontSize: "14px" }}>
                {selected.definition}
              </p>
              {selected.proposed_by && (
                <p style={{ margin: "8px 0 0 0", fontSize: "11px", color: "var(--ws-text-dim)" }}>
                  Propuesto por: {selected.proposed_by}
                </p>
              )}
              {selected.reviewed_by && selected.review_status && selected.review_status !== "proposed" && (
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--ws-text-dim)" }}>
                  {selected.review_status === "approved" ? "Aprobado" : selected.review_status === "rejected" ? "Rechazado" : selected.review_status === "deprecated" ? "Deprecado" : "Revisado"} por: {selected.reviewed_by}
                  {selected.reviewed_at && ` · ${new Date(selected.reviewed_at).toLocaleString("es")}`}
                </p>
              )}
            </div>

            {/* Review panel */}
            <ReviewPanel concept={selected} onReviewed={handleReviewed} />

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
                      padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 6,
                      flexWrap: "wrap",
                    }}>
                      <Tag size={12} color="var(--ws-accent)" />
                      <span style={{ color: "var(--ws-text)", fontFamily: "monospace" }}>{f.column}</span>
                      <span style={{ color: "var(--ws-text-dim)" }}>← {f.source}</span>
                      {f.confidence && <ConfidenceBadge confidence={f.confidence} />}
                      {f.data_classification && f.data_classification !== "publico" && (
                        <ClassificationBadge classification={f.data_classification} />
                      )}
                      {f.review_status && f.review_status !== "approved" && (
                        <ReviewBadge status={f.review_status} />
                      )}
                      {f.quality_score !== undefined && f.quality_score > 0 && (
                        <span style={{
                          fontSize: "10px", color: "var(--ws-text-dim)",
                        }}>
                          Q: {(f.quality_score * 100).toFixed(0)}%
                        </span>
                      )}
                      {f.last_verified && (() => {
                        const days = Math.floor((Date.now() - new Date(f.last_verified).getTime()) / 86400000);
                        if (days < 0) return null;
                        const stale = days > 180;
                        const veryStale = days > 365;
                        return (
                          <span style={{
                            fontSize: "10px", display: "inline-flex", alignItems: "center", gap: 3,
                            color: veryStale ? "var(--ws-red)" : stale ? "var(--ws-amber)" : "var(--ws-text-dim)",
                          }} title={`Última verificación: ${new Date(f.last_verified).toLocaleDateString("es")}`}>
                            <Clock size={10} />
                            {days < 30 ? `${days}d` : days < 365 ? `${Math.floor(days / 30)}m` : `${Math.floor(days / 365)}a`}
                          </span>
                        );
                      })()}
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
  const isPending = concept.review_status === "proposed" || concept.review_status === "under_review";
  const isSensitive = concept.data_classification && concept.data_classification !== "publico";
  return (
    <button
      onClick={() => onSelect(concept.name)}
      style={{
        display: "flex", flexDirection: "column", width: "100%", textAlign: "left",
        padding: "10px 14px", border: "none", background: "transparent",
        cursor: "pointer", borderBottom: "1px solid rgba(74,163,255,0.05)",
        transition: "background 160ms ease",
        borderLeft: isPending ? "3px solid var(--ws-amber)" : "3px solid transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ws-surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", color: "var(--ws-text)", fontWeight: 500 }}>
          {concept.name}
        </span>
        {hasStandard && (
          <Tag size={11} color="var(--ws-purple)" />
        )}
        {isPending && (
          <Clock size={11} color="var(--ws-amber)" />
        )}
        {isSensitive && (
          <Lock size={10} color={CLASSIFICATION_META[concept.data_classification!]?.color || "var(--ws-amber)"} />
        )}
      </div>
      <div style={{ fontSize: "11px", color: "var(--ws-text-dim)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          color: concept.source_count === 1 ? "var(--ws-amber)" : "var(--ws-text-dim)",
        }}>
          {concept.sources.length} fuente{concept.sources.length !== 1 ? "s" : ""}
        </span>
        {concept.standard && <span>· {concept.standard}</span>}
        {concept.custodian && <span>· {concept.custodian}</span>}
      </div>
    </button>
  );
}

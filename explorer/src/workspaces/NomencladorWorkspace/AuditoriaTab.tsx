import { useState, useEffect, useCallback } from "react";
import { Loader2, History, Shield, User, Clock, ArrowUpRight, Archive, RefreshCw, FileText } from "lucide-react";

type DecisionEntry = {
  timestamp: string;
  action: string;
  actor: string;
  reason: string;
  details: string;
};

type DecisionLog = Record<string, DecisionEntry[]>;

const ACTION_META: Record<string, { label: string; icon: typeof History; color: string }> = {
  created: { label: "Creado", icon: ArrowUpRight, color: "var(--ws-green)" },
  deprecated: { label: "Deprecado", icon: Archive, color: "var(--ws-text-dim)" },
  reactivated: { label: "Reactivado", icon: RefreshCw, color: "var(--ws-green)" },
  custodian_assigned: { label: "Custodio asignado", icon: User, color: "var(--ws-accent)" },
  normative_attached: { label: "Normativa vinculada", icon: FileText, color: "var(--ws-amber)" },
  standard_assigned: { label: "Estándar asignado", icon: Shield, color: "var(--ws-accent)" },
  updated: { label: "Actualizado", icon: History, color: "var(--ws-text-muted)" },
};

export function AuditoriaTab() {
  const [log, setLog] = useState<DecisionLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/nomenclador/decision-log");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLog(data.entries || data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar decision log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "var(--ws-red)", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!log || Object.keys(log).length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ws-text-dim)" }}>
        <History size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
        <p>No hay entradas en el decision log.</p>
      </div>
    );
  }

  const conceptIds = Object.keys(log).sort();

  const totalEntries = Object.values(log).reduce((sum, entries) => sum + entries.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      {/* Summary */}
      <div className="ws-card" style={{ padding: 16, display: "flex", gap: 24, alignItems: "center" }}>
        <History size={20} color="var(--ws-accent)" />
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--ws-text)" }}>
            Decision Log
          </div>
          <div style={{ fontSize: "12px", color: "var(--ws-text-dim)" }}>
            {conceptIds.length} conceptos con historial · {totalEntries} entradas totales
          </div>
        </div>
      </div>

      {/* Timeline per concept */}
      {conceptIds.map((conceptId) => {
        const entries = log[conceptId];
        const conceptName = conceptId.replace("concept:", "");
        const isExpanded = expanded === conceptId;

        return (
          <div key={conceptId} className="ws-card" style={{ padding: 0 }}>
            {/* Concept header */}
            <button
              onClick={() => setExpanded(isExpanded ? null : conceptId)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", border: "none", cursor: "pointer",
                background: "transparent", color: "var(--ws-text)",
                fontSize: "14px", fontWeight: 600, textAlign: "left",
                borderBottom: isExpanded ? "1px solid var(--ws-border)" : "none",
                borderRadius: isExpanded ? "8px 8px 0 0" : "8px",
              }}
            >
              <span style={{
                background: "var(--ws-accent-soft)", color: "var(--ws-accent)",
                padding: "2px 8px", borderRadius: 6, fontSize: "11px", fontWeight: 700,
              }}>
                {entries.length}
              </span>
              {conceptName}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
                {entries[entries.length - 1]?.action.replace(/_/g, " ")}
              </span>
            </button>

            {/* Timeline entries */}
            {isExpanded && (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {entries.map((entry, i) => {
                  const meta = ACTION_META[entry.action] || { label: entry.action, icon: History, color: "var(--ws-text-muted)" };
                  const Icon = meta.icon;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Timeline dot + line */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: `${meta.color}15`, border: `1px solid ${meta.color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon size={13} color={meta.color} />
                        </div>
                        {i < entries.length - 1 && (
                          <div style={{ width: 1, flex: 1, background: "var(--ws-border)", minHeight: 16 }} />
                        )}
                      </div>

                      {/* Entry content */}
                      <div style={{ flex: 1, paddingBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: meta.color }}>
                            {meta.label}
                          </span>
                          <span style={{
                            fontSize: "10px", color: "var(--ws-text-dim)",
                            background: "var(--ws-surface)", padding: "1px 6px", borderRadius: 4,
                          }}>
                            {entry.actor}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "11px", color: "var(--ws-text-dim)" }}>
                            <Clock size={10} />
                            {new Date(entry.timestamp).toLocaleString("es")}
                          </span>
                        </div>
                        {entry.reason && (
                          <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
                            {entry.reason}
                          </p>
                        )}
                        {entry.details && (
                          <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "var(--ws-text-dim)", lineHeight: 1.4 }}>
                            {entry.details}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

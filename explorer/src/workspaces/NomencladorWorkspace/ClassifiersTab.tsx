import { useState, useEffect } from "react";
import { Loader2, Tag, BookOpen } from "lucide-react";

type Concept = {
  name: string;
  standard: string | null;
  definition: string;
  sources: string[];
};

type Classifier = {
  standard: string;
  name: string;
  domain: string;
  values: Record<string, string>;
  version: string;
};

export function ClassifiersTab() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassifier, setSelectedClassifier] = useState<Classifier | null>(null);
  const [classifierLoading, setClassifierLoading] = useState(false);

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

  // Concepts that have a standard → potential classifiers
  const conceptsWithStandards = concepts.filter((c) => c.standard);

  async function loadClassifier(standard: string) {
    setClassifierLoading(true);
    setSelectedClassifier(null);
    try {
      const res = await fetch(`/api/nomenclador/classifier/${standard}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "No encontrado");
      }
      const data = await res.json();
      setSelectedClassifier(data);
    } catch (e: any) {
      console.error("Failed to load classifier", e);
    } finally {
      setClassifierLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
      <div className="ws-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Tag size={20} color="var(--ws-purple)" />
          <h3 style={{ margin: 0, fontSize: "15px", color: "var(--ws-text)" }}>
            Clasificadores y estándares canónicos
          </h3>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
            {/* Left: list of standards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: "12px", color: "var(--ws-text-muted)", marginBottom: 8 }}>
                Conceptos con estándar:
              </div>
              {conceptsWithStandards.map((c) => (
                <button
                  key={c.name}
                  onClick={() => loadClassifier(c.standard!)}
                  style={{
                    background: "var(--ws-surface)", border: "1px solid var(--ws-border)",
                    borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                    textAlign: "left", transition: "all 160ms ease",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "var(--ws-text)", fontWeight: 500 }}>
                    {c.standard}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--ws-text-muted)" }}>
                    usado por: {c.name}
                  </div>
                </button>
              ))}
              {conceptsWithStandards.length === 0 && (
                <div style={{ color: "var(--ws-text-muted)", fontSize: "13px" }}>
                  No hay conceptos con estándar en el grafo.
                </div>
              )}
            </div>

            {/* Right: classifier detail */}
            <div>
              {classifierLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <Loader2 size={24} className="animate-spin" color="var(--ws-accent)" />
                </div>
              ) : selectedClassifier ? (
                <div className="ws-panel--inset" style={{ padding: 20, borderRadius: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <BookOpen size={18} color="var(--ws-purple)" />
                    <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--ws-text)" }}>
                      {selectedClassifier.name}
                    </span>
                    <span style={{
                      background: "var(--ws-purple-soft)", color: "var(--ws-purple)",
                      padding: "2px 10px", borderRadius: 12, fontSize: "11px", fontWeight: 600,
                    }}>
                      {selectedClassifier.standard}
                    </span>
                  </div>
                  {selectedClassifier.domain && selectedClassifier.domain !== "-" && (
                    <div style={{ fontSize: "12px", color: "var(--ws-text-muted)", marginBottom: 12 }}>
                      Dominio: {selectedClassifier.domain}
                    </div>
                  )}
                  <div style={{ fontSize: "12px", color: "var(--ws-text-muted)", marginBottom: 8 }}>
                    Versión: {selectedClassifier.version}
                  </div>

                  {/* Values table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--ws-border)", color: "var(--ws-text-muted)" }}>Código</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--ws-border)", color: "var(--ws-text-muted)" }}>Etiqueta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedClassifier.values).map(([code, label]) => (
                        <tr key={code}>
                          <td style={{
                            padding: "8px 12px", borderBottom: "1px solid rgba(74,163,255,0.06)",
                            color: "var(--ws-accent)", fontFamily: "monospace", fontSize: "12px",
                          }}>
                            {code}
                          </td>
                          <td style={{
                            padding: "8px 12px", borderBottom: "1px solid rgba(74,163,255,0.06)",
                            color: "var(--ws-text)",
                          }}>
                            {label}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: "var(--ws-text-muted)", fontSize: "13px", padding: 40, textAlign: "center" }}>
                  Selecciona un estándar para ver sus valores canónicos.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

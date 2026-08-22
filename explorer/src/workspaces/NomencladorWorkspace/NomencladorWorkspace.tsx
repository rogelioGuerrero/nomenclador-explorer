import { useState, useCallback, useEffect } from "react";
import { InteroperabilityTab } from "./InteroperabilityTab";
import { ClassifiersTab } from "./ClassifiersTab";
import { ValidatorTab } from "./ValidatorTab";
import { InsightsTab } from "./InsightsTab";
import { ReferencesTab } from "./ReferencesTab";
import { InstrumentoTab } from "./InstrumentoTab";
import { LineageTab } from "./LineageTab";
import { QualityDashboard } from "./QualityDashboard";
import { ConceptBrowser } from "./ConceptBrowser";
import { AuditoriaTab } from "./AuditoriaTab";
import { IngerirFuenteTab } from "./IngerirFuenteTab";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

type TabId =
  | "conceptos" | "auditoria" | "calidad" | "clasificadores" | "referencias"
  | "interop" | "lineage" | "observaciones"
  | "instrumento" | "ingerir" | "validador";

type Section = "gobernanza" | "analisis" | "captura";

const SECTIONS: {
  id: Section;
  label: string;
  tabs: { id: TabId; label: string; hint: string }[];
}[] = [
  {
    id: "gobernanza",
    label: "Gobernanza",
    tabs: [
      { id: "conceptos", label: "Conceptos", hint: "Explorar y revisar conceptos del nomenclador" },
      { id: "auditoria", label: "Auditoría", hint: "Decision log y ciclo de vida de variables" },
      { id: "calidad", label: "Calidad", hint: "Dashboard y problemas de calidad de datos" },
      { id: "clasificadores", label: "Clasificadores", hint: "Estándares y valores canónicos" },
      { id: "referencias", label: "Referencias", hint: "Corpus normativo y RAG documental" },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    tabs: [
      { id: "interop", label: "Interoperabilidad", hint: "Comparar fuentes, equivalencias y transformaciones" },
      { id: "lineage", label: "Lineage", hint: "Trazar relaciones entre conceptos, fields y fuentes" },
      { id: "observaciones", label: "Observaciones", hint: "Insights del análisis de fuentes" },
    ],
  },
  {
    id: "captura",
    label: "Captura",
    tabs: [
      { id: "instrumento", label: "Instrumento", hint: "Generar codebook indicativo desde política pública" },
      { id: "ingerir", label: "Ingerir Fuente", hint: "Cargar CSV, perfilar y matchear contra nomenclador" },
      { id: "validador", label: "Validador", hint: "Validar valores contra estándares" },
    ],
  },
];

export function NomencladorWorkspace() {
  const [activeSection, setActiveSection] = useState<Section>("analisis");
  const [activeTab, setActiveTab] = useState<TabId>("interop");
  const [reloading, setReloading] = useState(false);
  const [reloadStatus, setReloadStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [lastReload, setLastReload] = useState<string | null>(null);

  const selectSection = useCallback((s: Section) => {
    setActiveSection(s);
    const firstTab = SECTIONS.find((sec) => sec.id === s)?.tabs[0];
    if (firstTab) setActiveTab(firstTab.id);
  }, []);

  const reload = useCallback(async () => {
    setReloading(true);
    setReloadStatus(null);
    try {
      const res = await fetch("/api/nomenclador/reload", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
      }
      const data = await res.json();
      setLastReload(new Date().toLocaleTimeString("es"));
      setReloadStatus({ ok: true, msg: `${data.nodes} nodos, ${data.edges} aristas` });
    } catch (e) {
      setReloadStatus({ ok: false, msg: e instanceof Error ? e.message : "Error al recargar" });
    } finally {
      setReloading(false);
      setTimeout(() => setReloadStatus(null), 5000);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("nomenclador_last_reload");
    if (stored) setLastReload(stored);
  }, []);

  useEffect(() => {
    if (lastReload) sessionStorage.setItem("nomenclador_last_reload", lastReload);
  }, [lastReload]);

  return (
    <div className="ws-page">
      {/* Section bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "0 16px", borderBottom: "1px solid var(--ws-border)",
        background: "rgba(0,0,0,0.3)",
      }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => selectSection(sec.id)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: activeSection === sec.id ? "2px solid var(--ws-accent)" : "2px solid transparent",
              background: activeSection === sec.id ? "rgba(127,208,255,0.06)" : "transparent",
              color: activeSection === sec.id ? "var(--ws-accent)" : "var(--ws-text-dim)",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              transition: "all 160ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {sec.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 12 }}>
          {lastReload && (
            <span style={{ fontSize: "11px", color: "var(--ws-text-dim)" }}>
              Actualizado: {lastReload}
            </span>
          )}
          {reloadStatus && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: "11px",
              color: reloadStatus.ok ? "var(--ws-green)" : "var(--ws-red)",
            }}>
              {reloadStatus.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {reloadStatus.msg}
            </span>
          )}
          <button
            onClick={reload}
            disabled={reloading}
            title="Recargar nomenclador desde governance-agent"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              border: "1px solid var(--ws-border)",
              background: "var(--ws-surface)",
              color: "var(--ws-text-muted)",
              fontSize: "12px", fontWeight: 500,
              opacity: reloading ? 0.6 : 1,
              transition: "all 160ms ease",
            }}
          >
            <RefreshCw size={13} className={reloading ? "animate-spin" : ""} />
            {reloading ? "Recargando…" : "Recargar"}
          </button>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2,
        padding: "6px 16px", borderBottom: "1px solid var(--ws-border)",
        background: "rgba(0,0,0,0.15)", overflowX: "auto",
      }}>
        {SECTIONS.find((s) => s.id === activeSection)?.tabs.map((tab) => (
          <button
            key={tab.id}
            className="workspace-tab"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.hint}
            style={{
              padding: "6px 14px",
              border: "none",
              background: activeTab === tab.id ? "var(--ws-accent-soft)" : "transparent",
              color: activeTab === tab.id ? "var(--ws-accent)" : "var(--ws-text-muted)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              transition: "all 160ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "lineage" ? (
        <LineageTab />
      ) : (
        <div className="ws-scroll ws-padded">
          {activeTab === "conceptos" && <ConceptBrowser />}
          {activeTab === "auditoria" && <AuditoriaTab />}
          {activeTab === "calidad" && <QualityDashboard />}
          {activeTab === "clasificadores" && <ClassifiersTab />}
          {activeTab === "referencias" && <ReferencesTab />}
          {activeTab === "interop" && <InteroperabilityTab />}
          {activeTab === "observaciones" && <InsightsTab />}
          {activeTab === "instrumento" && <InstrumentoTab />}
          {activeTab === "ingerir" && <IngerirFuenteTab />}
          {activeTab === "validador" && <ValidatorTab />}
        </div>
      )}
    </div>
  );
}

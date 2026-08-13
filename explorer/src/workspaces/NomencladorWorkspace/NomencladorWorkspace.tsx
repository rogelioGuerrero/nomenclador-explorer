import { useState } from "react";
import { InteroperabilityTab } from "./InteroperabilityTab";
import { QualityIssuesTab } from "./QualityIssuesTab";
import { ClassifiersTab } from "./ClassifiersTab";
import { ValidatorTab } from "./ValidatorTab";
import { InsightsTab } from "./InsightsTab";
import { ReferencesTab } from "./ReferencesTab";
import { InstrumentoTab } from "./InstrumentoTab";

type TabId = "interop" | "issues" | "classifiers" | "validator" | "insights" | "references" | "instrument";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "interop", label: "Interoperabilidad", hint: "Comparar fuentes y generar transformaciones" },
  { id: "issues", label: "Problemas de Calidad", hint: "Problemas de calidad detectados" },
  { id: "classifiers", label: "Clasificadores", hint: "Estándares y valores canónicos" },
  { id: "validator", label: "Validador", hint: "Validar valores contra estándares" },
  { id: "insights", label: "Observaciones", hint: "Observaciones del análisis de fuentes" },
  { id: "references", label: "Referencias", hint: "Corpus normativo y RAG documental" },
  { id: "instrument", label: "Instrumento", hint: "Generar codebook indicativo desde política pública" },
];

export function NomencladorWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("interop");

  return (
    <div className="ws-page">
      <div style={{ display: "flex", gap: 2, padding: "8px 16px", borderBottom: "1px solid var(--ws-border)", background: "rgba(0,0,0,0.2)", overflowX: "auto" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className="workspace-tab"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.hint}
            style={{
              padding: "8px 16px",
              border: "none",
              background: activeTab === tab.id ? "var(--ws-accent-soft)" : "transparent",
              color: activeTab === tab.id ? "var(--ws-accent)" : "var(--ws-text-muted)",
              borderRadius: "8px 8px 0 0",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 160ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ws-scroll ws-padded">
        {activeTab === "interop" && <InteroperabilityTab />}
        {activeTab === "issues" && <QualityIssuesTab />}
        {activeTab === "classifiers" && <ClassifiersTab />}
        {activeTab === "validator" && <ValidatorTab />}
        {activeTab === "insights" && <InsightsTab />}
        {activeTab === "references" && <ReferencesTab />}
        {activeTab === "instrument" && <InstrumentoTab />}
      </div>
    </div>
  );
}

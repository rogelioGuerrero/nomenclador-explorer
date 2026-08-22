import type { CSSProperties } from "react";

import type {
  GraphAnalyticsSnapshot,
  GraphDiagnosticsSnapshot,
  GraphEffectAvailability,
  GraphEffectToggle,
} from "../types";
import type { GraphPlugin } from "./types";

const EFFECTS_PANEL_ID = "effects-panel";

type EffectRowConfig = {
  key: GraphEffectToggle;
  label: string;
  description: string;
};

const SCENE_EFFECT_ROWS: EffectRowConfig[] = [
  {
    key: "pathPulseEnabled",
    label: "Pulso de camino",
    description: "Pulso animado en el camino seleccionado activo.",
  },
  {
    key: "pathFlowEnabled",
    label: "Flujo de camino",
    description: "Acentos direccionales de flujo a lo largo del camino seleccionado activo.",
  },
  {
    key: "lensEnabled",
    label: "Lente de vecindario",
    description: "Énfasis local alrededor del nodo seleccionado o bajo cursor.",
  },
  {
    key: "temporalEmphasisEnabled",
    label: "Énfasis temporal",
    description: "Brillo sutil alrededor de nodos temporalmente relevantes en la ventana de tiempo activa.",
  },
  {
    key: "semanticRegionsEnabled",
    label: "Regiones semánticas",
    description: "Envolturas semánticas discretas alrededor de los clusters de temas más fuertes visibles.",
  },
  {
    key: "contoursEnabled",
    label: "Contornos",
    description: "Halo de densidad de bajo contraste alrededor de los anclas más fuertes visibles.",
  },
  {
    key: "legendEnabled",
    label: "Resumen de regiones",
    description: "Mantener visible el resumen de regiones y señales en el panel de Efectos.",
  },
];

const INTELLIGENCE_EFFECT_ROWS: EffectRowConfig[] = [
  {
    key: "pathfindingEnabled",
    label: "Búsqueda de camino dirigida",
    description: "Comparar el camino trazado contra un camino más corto dirigido local estricto.",
  },
  {
    key: "communitiesEnabled",
    label: "Regiones de comunidad",
    description: "Detectar comunidades estables de Louvain para orientación y agrupación de escena.",
  },
  {
    key: "centralityEnabled",
    label: "Ranking de centralidad",
    description: "Clasificar las anclas más fuertes del grafo para etiquetas, regiones y navegación.",
  },
];

const AVAILABILITY_KEYS: Record<GraphEffectToggle, keyof GraphDiagnosticsSnapshot["effectAvailability"]> = {
  pathPulseEnabled: "pathPulse",
  pathFlowEnabled: "pathFlow",
  lensEnabled: "lens",
  temporalEmphasisEnabled: "temporalEmphasis",
  semanticRegionsEnabled: "semanticRegions",
  contoursEnabled: "contours",
  pathfindingEnabled: "pathfinding",
  communitiesEnabled: "communities",
  centralityEnabled: "centrality",
  legendEnabled: "legend",
  diagnosticsEnabled: "diagnostics",
};

function renderAvailabilityText(availability: GraphEffectAvailability) {
  if (availability.available) {
    if (typeof availability.visibleSegments === "number" && typeof availability.segmentCap === "number") {
      return `${availability.reason} - ${availability.visibleSegments}/${availability.segmentCap} segments`;
    }
    return availability.reason;
  }

  return availability.detail ? `${availability.reason} - ${availability.detail}` : availability.reason;
}

function collectFallbackLegendItems(context: Parameters<NonNullable<GraphPlugin["renderPanel"]>>[0]) {
  const groups = new Map<string, { count: number; color: string }>();
  context.graph.forEachNode((_nodeId, attrs) => {
    const semanticGroup = String(attrs.semanticGroup || attrs.nodeType || "entity");
    const color = String(attrs.baseColor || context.theme.palette.semantic[0]);
    const current = groups.get(semanticGroup);
    groups.set(semanticGroup, {
      count: (current?.count ?? 0) + 1,
      color,
    });
  });

  return [...groups.entries()]
    .map(([group, data]) => ({ group, ...data }))
    .sort((left, right) => right.count - left.count)
    .slice(0, context.theme.effects.legend.maxGroups);
}

function resolveAvailability(
  availabilityMap: GraphDiagnosticsSnapshot["effectAvailability"] | undefined,
  key: GraphEffectToggle,
  enabled: boolean,
): GraphEffectAvailability {
  return availabilityMap?.[AVAILABILITY_KEYS[key]] ?? {
    enabled,
    available: false,
    reason: "Esperando runtime del grafo",
  };
}

function EffectToggleRow({
  label,
  description,
  checked,
  availability,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  availability: GraphEffectAvailability;
  onToggle: () => void;
}) {
  return (
    <div style={toggleRowStyle}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={rowTitleStyle}>{label}</div>
        <div style={rowDescriptionStyle}>{description}</div>
        <div style={rowMetaStyle}>{renderAvailabilityText(availability)}</div>
      </div>
      <button type="button" onClick={onToggle} style={checked ? toggleButtonActiveStyle : toggleButtonStyle}>
        {checked ? "Activo" : "Inactivo"}
      </button>
    </div>
  );
}

function renderRegionsAndSignals(
  context: Parameters<NonNullable<GraphPlugin["renderPanel"]>>[0],
  analytics: GraphAnalyticsSnapshot | null,
) {
  const fallbackLegendItems = collectFallbackLegendItems(context);
  const semanticRegions = analytics?.semanticRegions.summaries ?? [];
  const communities = analytics?.communities.summaries ?? [];
  const centrality = analytics?.centrality.topNodes ?? [];
  const directedPath = analytics?.directedPath ?? null;

  if (!semanticRegions.length && !communities.length && !centrality.length && !fallbackLegendItems.length && !directedPath) {
    return <div style={emptyTextStyle}>Las regiones y resúmenes de inteligencia aparecerán cuando el análisis del grafo esté listo.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {semanticRegions.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subsectionTitleStyle}>Regiones semánticas</div>
          {semanticRegions.map((region) => (
            <div key={region.semanticGroup} style={legendRowStyle}>
              <span
                style={{
                  ...legendSwatchStyle,
                  background: region.color,
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 0 14px ${region.color}40`,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={rowTitleStyle}>{region.semanticGroup}</div>
                <div style={rowMetaStyle}>
                  {region.visibleNodeCount.toLocaleString()} visibles / {region.nodeCount.toLocaleString()} total
                </div>
              </div>
              <div style={signalBadgeStyle}>{region.anchorLabel}</div>
            </div>
          ))}
        </div>
      ) : null}

      {communities.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subsectionTitleStyle}>Anclas de comunidad</div>
          {communities.slice(0, 3).map((community) => (
            <div key={community.communityId} style={signalRowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={rowTitleStyle}>{community.anchorLabel}</div>
                <div style={rowMetaStyle}>
                  Comunidad {community.communityId} - {community.visibleNodeCount} visibles / {community.nodeCount} total
                </div>
              </div>
              <div style={signalBadgeStyle}>{community.dominantSemanticGroup}</div>
            </div>
          ))}
        </div>
      ) : null}

      {centrality.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subsectionTitleStyle}>Líderes de centralidad</div>
          {centrality.slice(0, 3).map((node) => (
            <div key={node.id} style={signalRowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={rowTitleStyle}>{node.label}</div>
                <div style={rowMetaStyle}>
                  {node.semanticGroup} - puntaje {node.score.toFixed(3)}
                </div>
              </div>
              <div style={signalBadgeStyle}>deg {node.degree.toFixed(3)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {directedPath ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subsectionTitleStyle}>Directed pathfinding</div>
          <div style={signalRowStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={rowTitleStyle}>{directedPath.ready ? "Camino dirigido local listo" : "Esperando contexto de camino"}</div>
              <div style={rowMetaStyle}>{directedPath.reason}</div>
            </div>
            {directedPath.ready ? (
              <div style={signalBadgeStyle}>
                {directedPath.length} saltos{directedPath.verifiedAgainstActivePath ? " - coincide" : ""}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!semanticRegions.length && !communities.length && !centrality.length && fallbackLegendItems.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={subsectionTitleStyle}>Leyenda semántica de respaldo</div>
          {fallbackLegendItems.map((item) => (
            <div key={item.group} style={legendRowStyle}>
              <span
                style={{
                  ...legendSwatchStyle,
                  background: item.color,
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.06), 0 0 14px ${item.color}40`,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={rowTitleStyle}>{item.group}</div>
                <div style={rowMetaStyle}>{item.count.toLocaleString()} nodos</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const explorationEffectsPluginPhaseC: GraphPlugin = {
  id: "exploration-effects",
  mount: () => {},
  unmount: () => {},
  onStateChange: () => {},
  toolbarItems: (context) => [
    {
      id: "effects-toggle",
      label: "Efectos",
      title: "Abrir controles de efectos de exploración",
      active: context.isPanelOpen(EFFECTS_PANEL_ID),
      order: 18,
      onClick: () => context.dispatchAction({ type: "togglePanel", panelId: EFFECTS_PANEL_ID }),
    },
  ],
  renderPanel: (context) => {
    if (!context.isPanelOpen(EFFECTS_PANEL_ID)) {
      return null;
    }

    const effectsState = context.getEffectsState();
    const diagnosticsSnapshot = context.getDiagnosticsSnapshot();
    const analyticsSnapshot = context.getAnalyticsSnapshot();
    const availability = diagnosticsSnapshot?.effectAvailability;
    const showSignalsSection =
      effectsState.legendEnabled
      || effectsState.semanticRegionsEnabled
      || effectsState.communitiesEnabled
      || effectsState.centralityEnabled
      || effectsState.pathfindingEnabled;

    return {
      id: EFFECTS_PANEL_ID,
      title: "Efectos",
      placement: "bottom",
      order: 8,
      defaultOpen: false,
      preferredWidth: 460,
      preferredHeight: 360,
      content: (
        <div style={panelBodyStyle}>
          <div style={panelEyebrowStyle}>Efectos de exploración</div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Efectos de escena</div>
            {SCENE_EFFECT_ROWS.map((row) => (
              <EffectToggleRow
                key={row.key}
                label={row.label}
                description={row.description}
                checked={effectsState[row.key]}
                availability={resolveAvailability(availability, row.key, effectsState[row.key])}
                onToggle={() => context.dispatchAction({ type: "toggleEffect", effect: row.key })}
              />
            ))}
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Inteligencia del grafo</div>
            {INTELLIGENCE_EFFECT_ROWS.map((row) => (
              <EffectToggleRow
                key={row.key}
                label={row.label}
                description={row.description}
                checked={effectsState[row.key]}
                availability={resolveAvailability(availability, row.key, effectsState[row.key])}
                onToggle={() => context.dispatchAction({ type: "toggleEffect", effect: row.key })}
              />
            ))}
          </div>

          {showSignalsSection ? (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Regiones y señales</div>
              {renderRegionsAndSignals(context, analyticsSnapshot)}
            </div>
          ) : null}

          {import.meta.env.DEV ? (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Diagnóstico</div>
              <EffectToggleRow
                label="Dev Diagnostics"
                description="Inspect plugin, interaction, and effect gating state."
                checked={effectsState.diagnosticsEnabled}
                availability={resolveAvailability(availability, "diagnosticsEnabled", effectsState.diagnosticsEnabled)}
                onToggle={() => context.dispatchAction({ type: "toggleEffect", effect: "diagnosticsEnabled" })}
              />
              {effectsState.diagnosticsEnabled && diagnosticsSnapshot ? (
                <details style={detailsStyle}>
                  <summary style={summaryStyle}>Runtime snapshot</summary>
                  <pre style={diagnosticsPreStyle}>
                    {JSON.stringify({ diagnostics: diagnosticsSnapshot, analytics: analyticsSnapshot }, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    };
  },
};

const panelBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const panelEyebrowStyle: CSSProperties = {
  color: "#8ea4be",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.025)",
};

const sectionTitleStyle: CSSProperties = {
  color: "#dce9f8",
  fontSize: 12,
  fontWeight: 700,
};

const subsectionTitleStyle: CSSProperties = {
  color: "#9cc4ec",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
};

const rowTitleStyle: CSSProperties = {
  color: "#f3f7fd",
  fontSize: 13,
  fontWeight: 600,
};

const rowDescriptionStyle: CSSProperties = {
  color: "#a1b7cf",
  fontSize: 12,
  lineHeight: 1.45,
};

const rowMetaStyle: CSSProperties = {
  color: "#7fc6ff",
  fontSize: 11,
  lineHeight: 1.45,
};

const toggleButtonStyle: CSSProperties = {
  minWidth: 52,
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  color: "#cfe0f4",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const toggleButtonActiveStyle: CSSProperties = {
  ...toggleButtonStyle,
  background: "rgba(31, 111, 235, 0.24)",
  border: "1px solid rgba(127, 208, 255, 0.28)",
  color: "#eef6ff",
};

const legendRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.025)",
};

const legendSwatchStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
};

const signalRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.05)",
  background: "rgba(255,255,255,0.02)",
};

const signalBadgeStyle: CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "rgba(31, 111, 235, 0.16)",
  border: "1px solid rgba(127, 208, 255, 0.16)",
  color: "#dce9f8",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const detailsStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.05)",
  background: "rgba(0,0,0,0.14)",
  overflow: "hidden",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  padding: "10px 12px",
  color: "#c6d4e3",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const diagnosticsPreStyle: CSSProperties = {
  margin: 0,
  padding: "0 12px 12px",
  color: "#dce9f8",
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const emptyTextStyle: CSSProperties = {
  color: "#8ea4be",
  fontSize: 12,
  lineHeight: 1.5,
};

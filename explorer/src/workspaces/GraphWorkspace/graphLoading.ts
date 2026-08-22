import type { GraphLoadPhase, GraphLoadProgress, GraphLoadProgressKind, GraphLayoutSource, GraphLayoutState } from "./types";

export const GRAPH_LOAD_STAGE_SEQUENCE: Exclude<GraphLoadPhase, "ready">[] = [
  "bootstrapping",
  "fetching_nodes",
  "fetching_edges",
  "computing_styling",
  "hydrating_scene",
  "stabilizing_layout",
];

export function getGraphLoadTitle(phase: GraphLoadPhase): string {
  switch (phase) {
    case "bootstrapping":
      return "Preparando sesión de grafo";
    case "fetching_nodes":
      return "Cargando nodos";
    case "fetching_edges":
      return "Cargando relaciones";
    case "computing_styling":
      return "Calculando estilos de nodos";
    case "hydrating_scene":
      return "Hidratando escena del grafo";
    case "stabilizing_layout":
      return "Estabilizando diseño";
    case "ready":
    default:
      return "Grafo listo";
  }
}

export function getGraphLoadStageLabel(phase: Exclude<GraphLoadPhase, "ready">): string {
  switch (phase) {
    case "bootstrapping":
      return "Preparar";
    case "fetching_nodes":
      return "Nodos";
    case "fetching_edges":
      return "Relaciones";
    case "computing_styling":
      return "Estilos";
    case "hydrating_scene":
      return "Escena";
    case "stabilizing_layout":
      return "Diseño";
    default:
      return "Etapa";
  }
}

export function createGraphLoadProgress(input: {
  phase: GraphLoadPhase;
  message: string;
  progressKind: GraphLoadProgressKind;
  loaded?: number | null;
  total?: number | null;
  nodesLoaded?: number;
  nodesTotal?: number | null;
  edgesLoaded?: number;
  edgesTotal?: number | null;
  showGraphBehind?: boolean;
  layoutSource?: GraphLayoutSource;
  layoutState?: GraphLayoutState;
}): GraphLoadProgress {
  const phaseIndex = GRAPH_LOAD_STAGE_SEQUENCE.indexOf(input.phase as Exclude<GraphLoadPhase, "ready">);

  return {
    phase: input.phase,
    title: getGraphLoadTitle(input.phase),
    message: input.message,
    progressKind: input.progressKind,
    loaded: input.loaded ?? null,
    total: input.total ?? null,
    nodesLoaded: input.nodesLoaded ?? 0,
    nodesTotal: input.nodesTotal ?? null,
    edgesLoaded: input.edgesLoaded ?? 0,
    edgesTotal: input.edgesTotal ?? null,
    showGraphBehind: input.showGraphBehind ?? false,
    stageIndex: phaseIndex >= 0 ? phaseIndex + 1 : GRAPH_LOAD_STAGE_SEQUENCE.length,
    stageCount: GRAPH_LOAD_STAGE_SEQUENCE.length,
    layoutSource: input.layoutSource,
    layoutState: input.layoutState,
  };
}

import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Database,
  FileSearch,
  GitBranch,
  Network,
  Radar,
  ScanSearch,
  Search,
  Server,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { GlobalSearch } from './GlobalSearch';
import { ToastProvider } from './ui/toast';

const GraphWorkspace = lazy(() => import('./workspaces/GraphWorkspace/GraphWorkspace').then((module) => ({ default: module.GraphWorkspace })));
const ReasoningWorkspace = lazy(() => import('./workspaces/ReasoningWorkspace').then((module) => ({ default: module.ReasoningWorkspace })));
const SparqlWorkspace = lazy(() => import('./workspaces/SparqlWorkspace/SparqlWorkspace').then((module) => ({ default: module.SparqlWorkspace })));
const LineageDiagram = lazy(() => import('./workspaces/LineageWorkspace/LineageDiagram').then((module) => ({ default: module.LineageDiagram })));
const ConceptBrowser = lazy(() => import('./workspaces/NomencladorWorkspace/ConceptBrowser').then((module) => ({ default: module.ConceptBrowser })));
const NomencladorWorkspace = lazy(() => import('./workspaces/NomencladorWorkspace/NomencladorWorkspace').then((module) => ({ default: module.NomencladorWorkspace })));
const OntologyWorkspace = lazy(() => import('./workspaces/OntologyWorkspace').then((module) => ({ default: module.OntologyWorkspace })));
const VocabularyWorkspace = lazy(() => import('./workspaces/VocabularyWorkspace/VocabularyWorkspace').then((module) => ({ default: module.VocabularyWorkspace })));
const DecisionWorkspace = lazy(() => import('./workspaces/DecisionWorkspace/DecisionWorkspace').then((module) => ({ default: module.DecisionWorkspace })));
const EntityResolutionTab = lazy(() => import('./workspaces/EnrichWorkspace/EntityResolutionTab').then((module) => ({ default: module.EntityResolutionTab })));
const RegistryTab = lazy(() => import('./workspaces/EnrichWorkspace/RegistryTab').then((module) => ({ default: module.RegistryTab })));
const DiffMergeWorkspace = lazy(() => import('./workspaces/DiffMergeWorkspace/DiffMergeWorkspace').then((module) => ({ default: module.DiffMergeWorkspace })));
const ImportExportWorkspace = lazy(() => import('./workspaces/ImportExportWorkspace/ImportExportWorkspace').then((module) => ({ default: module.ImportExportWorkspace })));
const KGOverviewTab = lazy(() => import('./workspaces/ManageWorkspace/KGOverviewTab').then((module) => ({ default: module.KGOverviewTab })));
const OntologySummaryTab = lazy(() => import('./workspaces/ManageWorkspace/OntologySummaryTab').then((module) => ({ default: module.OntologySummaryTab })));

type WorkspaceId = 'welcome' | 'explore' | 'analyze' | 'nomenclador' | 'ontology' | 'vocabulary' | 'enrich' | 'manage';
type ExploreView = 'graph' | 'concepts';
type AnalyzeView = 'sparql' | 'reasoning' | 'lineage' | 'decisions';
type EnrichView = 'entity' | 'diffmerge' | 'registry';
type ManageView = 'overview' | 'ontology-summary' | 'import-export';

type NavItem = {
  id: WorkspaceId;
  label: string;
  hint: string;
  icon: LucideIcon;
};

type LandingMetric = {
  label: string;
  value: string;
  tone?: 'cyan' | 'mint' | 'amber' | 'rose';
};

type LandingAction = {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
};

type GraphStatsPayload = {
  node_count?: number;
  edge_count?: number;
  nodeCount?: number;
  edgeCount?: number;
  nodes?: number;
  edges?: number;
  classifiers?: number;
  classifier_count?: number;
};


const PREVIEW_DOTS = Array.from({ length: 42 }, (_, i) => ({
  cx: 170 + ((i * 73) % 330),
  cy: 170 + ((i * 47) % 210),
  r: 2 + (i % 3),
  fill: (['#56d364', '#58a6ff', '#f2b66d', '#ff9daf'] as const)[i % 4],
}));

const navItems: NavItem[] = [
  { id: 'explore', label: 'Explorar', hint: 'Grafo y conceptos del nomenclador', icon: Database },
  { id: 'analyze', label: 'Analizar', hint: 'Consultas, inferencia y decisiones', icon: FileSearch },
  { id: 'nomenclador', label: 'Gobernanza', hint: 'Interoperabilidad, calidad y validación', icon: Radar },
  { id: 'ontology', label: 'Ontología', hint: 'Editor, versiones, alineamientos y SHACL', icon: BookMarked },
  { id: 'vocabulary', label: 'Vocabulario', hint: 'Esquemas SKOS y conceptos', icon: BookOpen },
  { id: 'enrich', label: 'Enriquecer', hint: 'Resolución de entidades, merge y registro', icon: ScanSearch },
  { id: 'manage', label: 'Gestión', hint: 'Resumen del KG, ontología e import/export', icon: Server },
];

function WorkspaceShell({
  title,
  subtitle,
  tabs,
  compact = false,
  kicker = 'Workspace',
  children,
}: {
  title: string;
  subtitle?: string;
  tabs?: ReactNode;
  compact?: boolean;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section className="workspace-shell">
      <header className={`workspace-header${compact ? " workspace-header--compact" : ""}`}>
        <div className="workspace-header-main">
          <div className="workspace-kicker">{kicker}</div>
          <div className="workspace-title-block">
            <h1 className="workspace-title">{title}</h1>
            {subtitle ? <div className="workspace-subtitle">{subtitle}</div> : null}
          </div>
        </div>
        {tabs ? <div className="workspace-tabs">{tabs}</div> : null}
      </header>
      <div className="workspace-body">{children}</div>
    </section>
  );
}

function WorkspaceFallback() {
  return <div className="workspace-loading">Cargando espacio de trabajo…</div>;
}

function getNumberStat(payload: GraphStatsPayload, keys: Array<keyof GraphStatsPayload>) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function formatMetric(value: number | null, fallback: string) {
  return value === null ? fallback : value.toLocaleString();
}

function WelcomeScreen({
  onOpenNetwork,
  onOpenVocabulary,
  onOpenReasoning,
  onOpenNomenclador,
  onOpenLineage,
  onOpenSparql,
}: {
  onOpenNetwork: () => void;
  onOpenVocabulary: () => void;
  onOpenReasoning: () => void;
  onOpenNomenclador: () => void;
  onOpenLineage: () => void;
  onOpenSparql: () => void;
}) {
  const [stats, setStats] = useState<{ nodes: number | null; edges: number | null; classifiers: number | null; ready: boolean }>({
    nodes: null,
    edges: null,
    classifiers: null,
    ready: false,
  });
  const [temporalBounds, setTemporalBounds] = useState<{ min: string | null; max: string | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/graph/stats', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() as Promise<GraphStatsPayload> : null))
      .then((payload) => {
        if (!payload) {
          setStats((current) => ({ ...current, ready: false }));
          return;
        }

        setStats({
          nodes: getNumberStat(payload, ['node_count', 'nodeCount', 'nodes']),
          edges: getNumberStat(payload, ['edge_count', 'edgeCount', 'edges']),
          classifiers: getNumberStat(payload, ['classifiers', 'classifier_count']),
          ready: true,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStats((current) => ({ ...current, ready: false }));
      });

    fetch('/api/temporal/bounds', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() as Promise<{ min: string | null; max: string | null }> : null))
      .then((data) => {
        if (data) setTemporalBounds(data);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setTemporalBounds({ min: null, max: null });
        }
      });

    return () => controller.abort();
  }, []);

  const metrics: LandingMetric[] = [
    { label: 'Nodos de conocimiento', value: formatMetric(stats.nodes, 'Activo'), tone: 'cyan' },
    { label: 'Relaciones mapeadas', value: formatMetric(stats.edges, 'Listo'), tone: 'mint' },
    { label: 'Clasificadores', value: formatMetric(stats.classifiers ?? 0, 'Estándar'), tone: 'amber' },
    { label: stats.ready ? 'Dataset en línea' : 'Listo para explorar', value: stats.ready ? 'Activo' : 'En espera', tone: 'rose' },
  ];

  const secondaryLaunchers: LandingAction[] = [
    {
      label: 'Conceptos',
      description: 'Explora conceptos, fuentes y clasificadores',
      icon: Database,
      onClick: onOpenVocabulary,
    },
    {
      label: 'Analizar',
      description: 'Inferencia, consultas SPARQL y lineage PROV-O',
      icon: BrainCircuit,
      onClick: onOpenReasoning,
    },
    {
      label: 'Gobernanza',
      description: 'Interoperabilidad, calidad, validación e instrumentos',
      icon: Radar,
      onClick: onOpenNomenclador,
    },
  ];

  return (
    <main className="landing-page">
      <div className="landing-shell">

        {/* ── Hero ── */}
        <section className="landing-hero">
          <div className="landing-copy">
            <div className="landing-status-bar">
              <div className="landing-status-dot" />
              <span className="landing-status-text">Sistema en línea</span>
              <div className="landing-status-divider" />
              <span className="landing-status-version">Explorador de Nomenclador · Accesibilidad Territorial</span>
            </div>

            <div className="landing-kicker" aria-label="Categoría del producto">
              <span className="landing-kicker-mark" aria-hidden="true" />
              Explorador de Nomenclador
            </div>

            <h1 className="landing-title">
              Explora el nomenclador<br />
              como un <span>sistema conectado.</span>
            </h1>
            <p className="landing-subtitle">
              Variables, fuentes, clasificadores y normativas conectados en un grafo interactivo.
              Trazar origen y lineage de los datos, medir distancia semántica entre conceptos y generar instrumentos de captura desde la política pública.
            </p>

            <div className="landing-cta-row">
              <button className="landing-cta-primary" type="button" onClick={onOpenNetwork}>
                <Network size={16} />
                Abrir Explorador
                <ArrowRight size={15} />
              </button>
              <button className="landing-cta-secondary" type="button" onClick={onOpenReasoning}>
                <BrainCircuit size={15} />
                Inferencia
              </button>
            </div>
          </div>

          {/* ── Preview panel ── */}
          <div className="landing-preview" aria-label="Vista previa del grafo de conocimiento">
            <div className="landing-preview-topbar" aria-hidden="true">
              <div className="landing-preview-dot" />
              <div className="landing-preview-dot" />
              <div className="landing-preview-dot" />
              <div className="landing-preview-tab">Explorador de Nomenclador</div>
            </div>
            <div className="landing-command-card">
              <div className="landing-command-icon">
                <Search size={15} />
              </div>
              <div>
                <div className="landing-command-label">Buscar comando, nodo o concepto</div>
                <div className="landing-command-meta">distancia semántica · lineage · instrumento de captura</div>
              </div>
            </div>
            <div className="landing-preview-orbit">
              <svg viewBox="0 0 640 440" role="img" aria-hidden="true">
                <path className="landing-preview-line" d="M110 310 C200 110 390 90 510 240" />
                <path className="landing-preview-line landing-preview-line--warm" d="M120 190 C240 270 374 182 508 340" />
                <path className="landing-preview-line landing-preview-line--mint" d="M168 378 C274 200 392 218 488 144" />
                <path className="landing-preview-line landing-preview-line--warm" d="M204 118 C318 340 408 368 526 284" />
                <path className="landing-preview-line" d="M110 310 C180 350 260 360 340 320 C420 280 480 260 510 240" />
                <g className="landing-node">
                  <circle cx="110" cy="310" r="10" fill="#4cc38a" fillOpacity="0.9" />
                  <circle cx="110" cy="310" r="20" fill="none" stroke="rgba(76,195,138,0.24)" strokeWidth="1.5" />
                  <circle cx="110" cy="310" r="34" fill="none" stroke="rgba(76,195,138,0.1)" strokeWidth="1" />
                </g>
                <g className="landing-node">
                  <circle cx="204" cy="118" r="7" fill="#4aa3ff" fillOpacity="0.9" />
                  <circle cx="204" cy="118" r="16" fill="none" stroke="rgba(74,163,255,0.24)" strokeWidth="1.5" />
                </g>
                <g className="landing-node">
                  <circle cx="510" cy="240" r="13" fill="#f2b66d" fillOpacity="0.9" />
                  <circle cx="510" cy="240" r="26" fill="none" stroke="rgba(242,182,109,0.26)" strokeWidth="1.5" />
                  <circle cx="510" cy="240" r="40" fill="none" stroke="rgba(242,182,109,0.1)" strokeWidth="1" />
                </g>
                <g className="landing-node">
                  <circle cx="488" cy="144" r="6" fill="#ff9daf" fillOpacity="0.9" />
                  <circle cx="488" cy="144" r="14" fill="none" stroke="rgba(255,157,175,0.22)" strokeWidth="1.5" />
                </g>
                <g className="landing-node">
                  <circle cx="340" cy="320" r="9" fill="#7fd0ff" fillOpacity="0.9" />
                  <circle cx="340" cy="320" r="20" fill="none" stroke="rgba(127,208,255,0.22)" strokeWidth="1.5" />
                </g>
                <g opacity="0.45">
                  {PREVIEW_DOTS.map((dot, index) => (
                    <circle key={index} cx={dot.cx} cy={dot.cy * 0.82} r={dot.r * 0.8} fill={dot.fill} />
                  ))}
                </g>
              </svg>
            </div>
            <div className="landing-dossier-card">
              <div className="landing-dossier-kicker">Ficha de variable</div>
              <div className="landing-dossier-title">Variable</div>
              <div className="landing-dossier-row"><span>Banda de distancia</span><strong>Cercana</strong></div>
              <div className="landing-dossier-row"><span>Coherencia de camino</span><strong>0.84</strong></div>
              <div className="landing-dossier-row"><span>Origen</span><strong>Auditado</strong></div>
            </div>
            {temporalBounds && temporalBounds.min && temporalBounds.max ? (
              <div className="landing-timeline-card">
                <div className="landing-timeline-header">
                  <span className="landing-timeline-title">Evidencia temporal</span>
                  <span className="landing-timeline-badge">{temporalBounds.min.slice(0, 4)} — {temporalBounds.max.slice(0, 4)}</span>
                </div>
                <div className="landing-timeline-track" />
                <div className="landing-timeline-labels">
                  <span>{temporalBounds.min.slice(0, 4)}</span>
                  <span>{temporalBounds.max.slice(0, 4)}</span>
                </div>
              </div>
            ) : (
              <div className="landing-quickstart-card">
                <div className="landing-quickstart-header">
                  <span className="landing-quickstart-title">Primeros pasos</span>
                  <span className="landing-quickstart-badge">Onboarding</span>
                </div>
                <div className="landing-quickstart-list">
                  <button className="landing-quickstart-item" type="button" onClick={onOpenNetwork}>
                    {stats.ready ? <CheckCircle2 size={14} color="var(--ws-green)" /> : <Circle size={14} color="var(--ws-text-dim)" />}
                    <span>Explorar el grafo de conocimiento</span>
                  </button>
                  <button className="landing-quickstart-item" type="button" onClick={onOpenNomenclador}>
                    <Circle size={14} color="var(--ws-text-dim)" />
                    <span>Cargar y perfilar una fuente de datos</span>
                  </button>
                  <button className="landing-quickstart-item" type="button" onClick={onOpenNomenclador}>
                    <Circle size={14} color="var(--ws-text-dim)" />
                    <span>Validar campos contra estándares canónicos</span>
                  </button>
                  <button className="landing-quickstart-item" type="button" onClick={onOpenLineage}>
                    <Circle size={14} color="var(--ws-text-dim)" />
                    <span>Trazar lineage de un nodo</span>
                  </button>
                  <button className="landing-quickstart-item" type="button" onClick={onOpenNomenclador}>
                    <Circle size={14} color="var(--ws-text-dim)" />
                    <span>Generar instrumento de captura</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Live metrics ── */}
        <div className="landing-metrics" aria-label="Estado del sistema">
          {metrics.map((metric) => (
            <div key={metric.label} className="landing-metric" data-tone={metric.tone}>
              <div className="landing-metric-value">{metric.value}</div>
              <div className="landing-metric-label">{metric.label}</div>
            </div>
          ))}
        </div>

        {/* ── Workspace grid ── */}
        <section aria-label="Espacios de trabajo">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Espacios de trabajo</h2>
            <div className="landing-section-line" />
          </div>
          <div className="landing-workspace-grid">
            <button className="landing-workspace-card landing-workspace-card--primary" type="button" onClick={onOpenNetwork}>
              <div>
                <div className="landing-workspace-card-eyebrow">Espacio principal</div>
                <div className="landing-workspace-card-title">Explorador de Nomenclador</div>
                <div className="landing-workspace-card-desc">
                  Grafo interactivo con distancia semántica, origen y lineage de variables, y filtrado temporal por snapshot histórica.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="landing-workspace-card-icon" style={{ marginBottom: 0 }}>
                  <Network size={22} />
                </div>
                <div className="landing-workspace-card-arrow">
                  <ArrowRight size={18} />
                </div>
              </div>
            </button>

            {secondaryLaunchers.map((launcher) => {
              const Icon = launcher.icon;
              return (
                <button key={launcher.label} className="landing-workspace-card" type="button" onClick={launcher.onClick}>
                  <div className="landing-workspace-card-icon">
                    <Icon size={18} />
                  </div>
                  <div className="landing-workspace-card-title">{launcher.label}</div>
                  <div className="landing-workspace-card-desc">{launcher.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Capability band ── */}
        <section className="landing-capability-band" aria-label="Capacidades de inteligencia">
          <div className="landing-capability-label">Capacidades</div>
          <button className="landing-capability" type="button" onClick={onOpenLineage}><GitBranch size={12} />Trazar origen de datos</button>
          <button className="landing-capability" type="button" onClick={onOpenNomenclador}><Sparkles size={12} />Generar instrumento de captura</button>
          <button className="landing-capability" type="button" onClick={onOpenNomenclador}><Workflow size={12} />Comparar entre fuentes</button>
          <button className="landing-capability" type="button" onClick={onOpenReasoning}><BrainCircuit size={12} />Inferencia lógica</button>
          <button className="landing-capability" type="button" onClick={onOpenSparql}><Search size={12} />Consultas avanzadas</button>
          <button className="landing-capability" type="button" onClick={onOpenNetwork}><Radar size={12} />Evolución temporal</button>
        </section>

      </div>
    </main>
  );
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(() => {
    const hash = window.location.hash.slice(1);
    const valid = ['welcome', 'explore', 'analyze', 'nomenclador', 'ontology', 'vocabulary', 'enrich', 'manage'] as const;
    return (valid as readonly string[]).includes(hash) ? hash as WorkspaceId : 'welcome';
  });
  const [exploreView, setExploreView] = useState<ExploreView>('graph');
  const [analyzeView, setAnalyzeView] = useState<AnalyzeView>('reasoning');
  const [enrichView, setEnrichView] = useState<EnrichView>('entity');
  const [manageView, setManageView] = useState<ManageView>('overview');

  const switchWorkspace = useCallback((ws: WorkspaceId) => {
    setActiveWorkspace(ws);
    window.history.replaceState(null, '', ws === 'welcome' ? '#' : `#${ws}`);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      const valid = ['welcome', 'explore', 'analyze', 'nomenclador', 'ontology', 'vocabulary', 'enrich', 'manage'] as const;
      if ((valid as readonly string[]).includes(hash)) {
        setActiveWorkspace(hash as WorkspaceId);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateToGraph = (_nodeId: string) => {
    switchWorkspace('explore');
    setExploreView('graph');
  };

  const navigateToConcept = (_conceptName: string) => {
    switchWorkspace('explore');
    setExploreView('concepts');
  };


  const renderWorkspace = () => {
    if (activeWorkspace === 'welcome') {
      return (
        <WelcomeScreen
          onOpenNetwork={() => {
            switchWorkspace('explore');
            setExploreView('graph');
          }}
          onOpenVocabulary={() => {
            switchWorkspace('explore');
            setExploreView('concepts');
          }}
          onOpenReasoning={() => {
            switchWorkspace('analyze');
            setAnalyzeView('reasoning');
          }}
          onOpenNomenclador={() => {
            switchWorkspace('nomenclador');
          }}
          onOpenLineage={() => {
            switchWorkspace('analyze');
            setAnalyzeView('lineage');
          }}
          onOpenSparql={() => {
            switchWorkspace('analyze');
            setAnalyzeView('sparql');
          }}
        />
      );
    }

    if (activeWorkspace === 'explore') {
      return (
        <WorkspaceShell
          title="Explorar"
          subtitle={exploreView === 'graph' ? undefined : "Explora conceptos del nomenclador, sus fuentes, clasificadores y referencias normativas."}
          kicker={exploreView === 'graph' ? 'Estudio de Grafo' : 'Explorador de Conceptos'}
          compact
          tabs={
            <>
              <button className="workspace-tab" data-active={exploreView === 'graph'} onClick={() => setExploreView('graph')}>
                Explorador de Nomenclador
              </button>
              <button className="workspace-tab" data-active={exploreView === 'concepts'} onClick={() => setExploreView('concepts')}>
                Explorador de Conceptos
              </button>
            </>
          }
        >
          <ErrorBoundary key={`explore-${exploreView}`}>
            <Suspense fallback={<WorkspaceFallback />}>
              {exploreView === 'graph' ? (
                <GraphWorkspace />
              ) : <ConceptBrowser />}
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'analyze') {
      return (
        <WorkspaceShell
          title="Analizar"
          subtitle="Consulta el grafo activo y prueba reglas de inferencia."
          kicker={analyzeView === 'reasoning' ? 'Motor de Inferencia' : analyzeView === 'sparql' ? 'Consulta SPARQL' : analyzeView === 'lineage' ? 'Lineage PROV-O' : 'Cadena de Decisión'}
          tabs={
            <>
              <button className="workspace-tab" data-active={analyzeView === 'reasoning'} onClick={() => setAnalyzeView('reasoning')}>
                Inferencia
              </button>
              <button className="workspace-tab" data-active={analyzeView === 'sparql'} onClick={() => setAnalyzeView('sparql')}>
                Consultas SPARQL
              </button>
              <button className="workspace-tab" data-active={analyzeView === 'lineage'} onClick={() => setAnalyzeView('lineage')}>
                Lineage
              </button>
              <button className="workspace-tab" data-active={analyzeView === 'decisions'} onClick={() => setAnalyzeView('decisions')}>
                Decisiones
              </button>
            </>
          }
        >
          <ErrorBoundary key={`analyze-${analyzeView}`}>
            <Suspense fallback={<WorkspaceFallback />}>
              {analyzeView === 'reasoning' ? <ReasoningWorkspace /> : analyzeView === 'sparql' ? <SparqlWorkspace /> : analyzeView === 'lineage' ? <LineageDiagram /> : <DecisionWorkspace />}
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'nomenclador') {
      return (
        <WorkspaceShell
          title="Gobernanza"
          subtitle="Interoperabilidad, calidad de datos y validación de campos."
          kicker="Agente de Gobernanza"
        >
          <ErrorBoundary key="nomenclador">
            <Suspense fallback={<WorkspaceFallback />}>
              <NomencladorWorkspace />
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'ontology') {
      return (
        <WorkspaceShell
          title="Ontología"
          subtitle="Editor, versiones, alineamientos, salud y SHACL."
          kicker="Gestor de Ontología"
        >
          <ErrorBoundary key="ontology">
            <Suspense fallback={<WorkspaceFallback />}>
              <OntologyWorkspace onJumpToGraphNode={navigateToGraph} />
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'vocabulary') {
      return (
        <WorkspaceShell
          title="Vocabulario"
          subtitle="Esquemas SKOS, conceptos y jerarquías."
          kicker="Navegador de Vocabulario"
          compact
        >
          <ErrorBoundary key="vocabulary">
            <Suspense fallback={<WorkspaceFallback />}>
              <VocabularyWorkspace />
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'enrich') {
      return (
        <WorkspaceShell
          title="Enriquecer"
          subtitle="Resolución de entidades, merge y registro de mutaciones."
          kicker={enrichView === 'entity' ? 'Resolución de Entidades' : enrichView === 'diffmerge' ? 'Diff & Merge' : 'Registro'}
          compact
          tabs={
            <>
              <button className="workspace-tab" data-active={enrichView === 'entity'} onClick={() => setEnrichView('entity')}>
                Entidades
              </button>
              <button className="workspace-tab" data-active={enrichView === 'diffmerge'} onClick={() => setEnrichView('diffmerge')}>
                Diff & Merge
              </button>
              <button className="workspace-tab" data-active={enrichView === 'registry'} onClick={() => setEnrichView('registry')}>
                Registro
              </button>
            </>
          }
        >
          <ErrorBoundary key={`enrich-${enrichView}`}>
            <Suspense fallback={<WorkspaceFallback />}>
              {enrichView === 'entity' ? <EntityResolutionTab /> : enrichView === 'diffmerge' ? <DiffMergeWorkspace /> : <RegistryTab />}
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    if (activeWorkspace === 'manage') {
      return (
        <WorkspaceShell
          title="Gestión"
          subtitle="Resumen del knowledge graph, ontología e import/export."
          kicker={manageView === 'overview' ? 'Resumen del KG' : manageView === 'ontology-summary' ? 'Resumen de Ontología' : 'Import / Export'}
          compact
          tabs={
            <>
              <button className="workspace-tab" data-active={manageView === 'overview'} onClick={() => setManageView('overview')}>
                KG Overview
              </button>
              <button className="workspace-tab" data-active={manageView === 'ontology-summary'} onClick={() => setManageView('ontology-summary')}>
                Ontología
              </button>
              <button className="workspace-tab" data-active={manageView === 'import-export'} onClick={() => setManageView('import-export')}>
                Import / Export
              </button>
            </>
          }
        >
          <ErrorBoundary key={`manage-${manageView}`}>
            <Suspense fallback={<WorkspaceFallback />}>
              {manageView === 'overview' ? <KGOverviewTab /> : manageView === 'ontology-summary' ? <OntologySummaryTab /> : <ImportExportWorkspace />}
            </Suspense>
          </ErrorBoundary>
        </WorkspaceShell>
      );
    }

    return null;
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="app-shell">
        <aside className="app-rail">
          <button className="brand-pill" title="Explorador de Nomenclador" onClick={() => switchWorkspace('welcome')} style={{ cursor: 'pointer', border: '1px solid rgba(127,208,255,0.18)' }}>NE</button>
          <GlobalSearch onNavigateGraph={navigateToGraph} onNavigateConcept={navigateToConcept} />
          {navItems.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              className="nav-button"
              data-active={activeWorkspace === id}
              onClick={() => switchWorkspace(id)}
              title={hint}
            >
              <Icon size={20} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </aside>
        {renderWorkspace()}
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

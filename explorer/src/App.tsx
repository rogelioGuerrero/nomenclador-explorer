import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowRight,
  BrainCircuit,
  Database,
  FileSearch,
  GitBranch,
  Network,
  Radar,
  Search,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

const GraphWorkspace = lazy(() => import('./workspaces/GraphWorkspace/GraphWorkspace').then((module) => ({ default: module.GraphWorkspace })));
const ReasoningWorkspace = lazy(() => import('./workspaces/ReasoningWorkspace').then((module) => ({ default: module.ReasoningWorkspace })));
const SparqlWorkspace = lazy(() => import('./workspaces/SparqlWorkspace/SparqlWorkspace').then((module) => ({ default: module.SparqlWorkspace })));
const LineageDiagram = lazy(() => import('./workspaces/LineageWorkspace/LineageDiagram').then((module) => ({ default: module.LineageDiagram })));
const ConceptBrowser = lazy(() => import('./workspaces/NomencladorWorkspace/ConceptBrowser').then((module) => ({ default: module.ConceptBrowser })));
const NomencladorWorkspace = lazy(() => import('./workspaces/NomencladorWorkspace/NomencladorWorkspace').then((module) => ({ default: module.NomencladorWorkspace })));

type WorkspaceId = 'welcome' | 'explore' | 'analyze' | 'nomenclador';
type ExploreView = 'graph' | 'concepts';
type AnalyzeView = 'sparql' | 'reasoning' | 'lineage';

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

const queryClient = new QueryClient();

const PREVIEW_DOTS = Array.from({ length: 42 }, (_, i) => ({
  cx: 170 + ((i * 73) % 330),
  cy: 170 + ((i * 47) % 210),
  r: 2 + (i % 3),
  fill: (['#56d364', '#58a6ff', '#f2b66d', '#ff9daf'] as const)[i % 4],
}));

const navItems: NavItem[] = [
  { id: 'explore', label: 'Explorar', hint: 'Grafo y conceptos del nomenclador', icon: Database },
  { id: 'analyze', label: 'Analizar', hint: 'Consultas e inferencia', icon: FileSearch },
  { id: 'nomenclador', label: 'Gobernanza', hint: 'Interoperabilidad, calidad y validación', icon: Radar },
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
            <div className="landing-timeline-card">
              <div className="landing-timeline-header">
                <span className="landing-timeline-title">Evidencia temporal</span>
                <span className="landing-timeline-badge">66% cobertura</span>
              </div>
              <div className="landing-timeline-track" />
              <div className="landing-timeline-labels">
                <span>2030</span>
              </div>
            </div>
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
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('welcome');
  const [exploreView, setExploreView] = useState<ExploreView>('graph');
  const [analyzeView, setAnalyzeView] = useState<AnalyzeView>('reasoning');


  const renderWorkspace = () => {
    if (activeWorkspace === 'welcome') {
      return (
        <WelcomeScreen
          onOpenNetwork={() => {
            setActiveWorkspace('explore');
            setExploreView('graph');
          }}
          onOpenVocabulary={() => {
            setActiveWorkspace('explore');
            setExploreView('concepts');
          }}
          onOpenReasoning={() => {
            setActiveWorkspace('analyze');
            setAnalyzeView('reasoning');
          }}
          onOpenNomenclador={() => {
            setActiveWorkspace('nomenclador');
          }}
          onOpenLineage={() => {
            setActiveWorkspace('analyze');
            setAnalyzeView('lineage');
          }}
          onOpenSparql={() => {
            setActiveWorkspace('analyze');
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
          kicker={analyzeView === 'reasoning' ? 'Motor de Inferencia' : analyzeView === 'sparql' ? 'Consulta SPARQL' : 'Lineage PROV-O'}
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
            </>
          }
        >
          <ErrorBoundary key={`analyze-${analyzeView}`}>
            <Suspense fallback={<WorkspaceFallback />}>
              {analyzeView === 'reasoning' ? <ReasoningWorkspace /> : analyzeView === 'sparql' ? <SparqlWorkspace /> : <LineageDiagram />}
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

    return null;
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <aside className="app-rail">
          <button className="brand-pill" title="Explorador de Nomenclador" onClick={() => setActiveWorkspace('welcome')} style={{ cursor: 'pointer', border: '1px solid rgba(127,208,255,0.18)' }}>NE</button>
          {navItems.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              className="nav-button"
              data-active={activeWorkspace === id}
              onClick={() => setActiveWorkspace(id)}
              title={hint}
            >
              <Icon size={20} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </aside>
        {renderWorkspace()}
      </div>
    </QueryClientProvider>
  );
}

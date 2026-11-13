import { createContext, Fragment, lazy, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  CloudUpload,
  Download,
  FileSpreadsheet,
  Gauge,
  Info,
  LayoutDashboard,
  LayoutTemplate,
  ListFilter,
  LoaderCircle,
  MapPin,
  Menu,
  MoreHorizontal,
  PencilLine,
  PackageCheck,
  Plus,
  Route as RouteIcon,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Truck,
  Upload,
  UsersRound,
  Warehouse,
  X,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cancelJob, downloadJobExport, downloadTemplate, importScenarioFile, importTemplate, listTemplates, submitSolve, validateScenario, waitForJob } from './api';
import type { Customer, DataKind, Depot, InspectorTab, Route, ScenarioTemplate, ValidationResponse, Vehicle, VehicleType, VrpScenario, VrpSolution, VrpViewData } from './types';
import { buildViewData } from './view-model';
import { SettingsModal } from './SettingsModal';
import operartisLogo from '../../operartis-logo.svg';
import operartisWatermark from '../../fulllogo_transparent_nobuffer.png';

const MapView = lazy(() => import('./MapView'));
const LEGEND_COLLAPSED_KEY = 'operartis_vrp_legend_collapsed';

const OperartisAuthTopbarSlot = memo(function OperartisAuthTopbarSlot() {
  return <div id="operartis-auth-topbar-slot" className="auth-slot" />;
});

type DataNavItem = { kind: DataKind; label: string; description: string; count: number; icon: typeof Warehouse };

const createDataNav = (viewData: VrpViewData): DataNavItem[] => [
  { kind: 'depots', label: 'Depots', description: 'Dispatch & reload', count: viewData.depots.length, icon: Warehouse },
  { kind: 'customers', label: 'Customers', description: 'Demand & windows', count: viewData.customers.length, icon: UsersRound },
  { kind: 'vehicleTypes', label: 'Vehicle types', description: 'Capacity & costs', count: viewData.vehicleTypes.length, icon: Truck },
  { kind: 'vehicles', label: 'Physical fleet', description: 'Home depot & shift', count: viewData.vehicles.length, icon: Gauge },
];

type VrpRuntimeContextValue = {
  scenario: VrpScenario | null;
  solution: VrpSolution | null;
  validation: ValidationResponse | null;
  viewData: VrpViewData;
};

const VrpRuntimeContext = createContext<VrpRuntimeContextValue | null>(null);

function useVrpRuntime() {
  const value = useContext(VrpRuntimeContext);
  if (!value?.scenario) throw new Error('VRP scenario is unavailable');
  return { ...value, scenario: value.scenario };
}

const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'routes', label: 'Routes' },
  { id: 'validation', label: 'Validation' },
];

const TIMELINE_DURATION_MINUTES = 720;
const TIMELINE_INTERVAL_MINUTES = 30;
const TIMELINE_PX_PER_MINUTE = 5;
const TIMELINE_TRACK_WIDTH = TIMELINE_DURATION_MINUTES * TIMELINE_PX_PER_MINUTE;
const TIMELINE_TICK_WIDTH = TIMELINE_INTERVAL_MINUTES * TIMELINE_PX_PER_MINUTE;

const minutesToOffset = (minutes: number) => `${Math.max(0, Math.min(TIMELINE_TRACK_WIDTH, minutes * TIMELINE_PX_PER_MINUTE))}px`;
const minutesToSize = (minutes: number) => `${Math.max(0, minutes * TIMELINE_PX_PER_MINUTE)}px`;

const timelineStyle = {
  '--timeline-track-width': `${TIMELINE_TRACK_WIDTH}px`,
  '--timeline-tick-width': `${TIMELINE_TICK_WIDTH}px`,
} as CSSProperties;

const formatTimelineMinute = (minute: number) => {
  const totalMinutes = 6 * 60 + minute;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timelineTicks = Array.from(
  { length: TIMELINE_DURATION_MINUTES / TIMELINE_INTERVAL_MINUTES + 1 },
  (_, index) => {
    const minute = index * TIMELINE_INTERVAL_MINUTES;
    return { minute, label: formatTimelineMinute(minute), isHour: minute % 60 === 0 };
  },
);

const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_PADDING = 8;

function positionTimelineTooltip(event: { currentTarget: HTMLElement }) {
  const host = event.currentTarget;
  const tooltip = host.querySelector(':scope > span');
  const scroller = host.closest('.timeline-body');
  if (!(tooltip instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return;

  host.classList.remove('is-tooltip-above');
  tooltip.style.removeProperty('--tooltip-shift-x');

  const place = () => {
    const hostRect = host.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const axis = scroller.querySelector('.timeline-axis-row');
    const vehicleCol = scroller.querySelector('.timeline-vehicle-column');
    const visibleTop = scrollerRect.top + scroller.clientTop;
    const visibleLeft = scrollerRect.left + scroller.clientLeft;
    const visibleBottom = visibleTop + scroller.clientHeight;
    const visibleRight = visibleLeft + scroller.clientWidth;
    const axisBottom = axis instanceof HTMLElement ? axis.getBoundingClientRect().bottom : visibleTop;
    const colRight = vehicleCol instanceof HTMLElement ? vehicleCol.getBoundingClientRect().right : visibleLeft;
    const needed = tooltipRect.height + TOOLTIP_GAP;
    const spaceBelow = visibleBottom - hostRect.bottom;
    const spaceAbove = hostRect.top - axisBottom;

    if (spaceBelow < needed && spaceAbove > spaceBelow) {
      host.classList.add('is-tooltip-above');
    }

    const placedRect = tooltip.getBoundingClientRect();
    const minLeft = Math.max(visibleLeft, colRight) + TOOLTIP_EDGE_PADDING;
    const maxRight = visibleRight - TOOLTIP_EDGE_PADDING;
    let shift = 0;
    if (placedRect.left < minLeft) shift += minLeft - placedRect.left;
    if (placedRect.right + shift > maxRight) shift -= placedRect.right + shift - maxRight;
    tooltip.style.setProperty('--tooltip-shift-x', `${shift}px`);
  };

  requestAnimationFrame(place);
}

function TimelineEvent({ className, style, time, children }: { className: string; style?: CSSProperties; time: string; children: ReactNode }) {
  return (
    <span
      className={`timeline-event ${className}`}
      data-time={time}
      style={style}
      onMouseEnter={positionTimelineTooltip}
      onFocus={positionTimelineTooltip}
    >
      {children}
    </span>
  );
}

function useTheme() {
  const initialTheme = window.getOperartisTheme?.() || 'system';
  const [theme, setThemeState] = useState(initialTheme);
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: 'light' | 'dark' | 'system' }>).detail;
      setThemeState(detail?.theme || window.getOperartisTheme?.() || 'system');
    };
    window.addEventListener('operartis:theme-change', handler);
    return () => window.removeEventListener('operartis:theme-change', handler);
  }, []);

  const setTheme = (next: 'light' | 'dark' | 'system') => {
    if (window.setOperartisTheme) {
      window.setOperartisTheme(next);
      return;
    }
    window.persistOperartisTheme?.(next);
    window.applyOperartisThemeClass?.(next);
    document.documentElement.classList.toggle('dark', next === 'dark' || (next === 'system' && systemDark));
    setThemeState(next);
  };

  return { theme, dark, setTheme };
}

function useLang() {
  const [lang, setLangState] = useState<'en' | 'vi' | 'de'>(() => window.getOperartisLang?.() || 'en');

  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<{ lang?: 'en' | 'vi' | 'de' }>).detail?.lang || window.getOperartisLang?.() || 'en';
      setLangState(next);
    };
    window.addEventListener('operartis:lang-change', handler);
    return () => window.removeEventListener('operartis:lang-change', handler);
  }, []);

  const setLang = (next: 'en' | 'vi' | 'de') => {
    if (window.setOperartisLang) {
      window.setOperartisLang(next);
      return;
    }
    window.persistOperartisLang?.(next);
    setLangState(next);
  };

  return { lang, setLang };
}

function App() {
  const { theme, dark, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const [scenario, setScenario] = useState<VrpScenario | null>(null);
  const [solution, setSolution] = useState<VrpSolution | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('summary');
  const [dataManager, setDataManager] = useState<DataKind | null>(null);
  const [enabledDepotIds, setEnabledDepotIds] = useState<string[] | null>(null);
  const [allowedDepotChoices, setAllowedDepotChoices] = useState<Record<string, string> | null>(null);
  const [entityDialog, setEntityDialog] = useState<DataKind | null>(null);
  const [scenarioDialog, setScenarioDialog] = useState<ScenarioSource | null>(null);
  const [importedFilename, setImportedFilename] = useState<string | null>(null);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(() => {
    try { return window.localStorage.getItem(LEGEND_COLLAPSED_KEY) !== '0'; } catch { return true; }
  });
  const toggleLegend = useCallback(() => {
    setLegendCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(LEGEND_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationStage, setOptimizationStage] = useState('Ready to optimize');
  const [progress, setProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mapFitRequest, setMapFitRequest] = useState(0);
  const optimizationAbortRef = useRef<AbortController | null>(null);

  const viewData = useMemo<VrpViewData>(() => scenario
    ? buildViewData(scenario, solution, validation)
    : { customers: [], depots: [], vehicleTypes: [], vehicles: [], routes: [], trips: [], validationItems: [] },
  [scenario, solution, validation]);
  const dataNav = useMemo(() => createDataNav(viewData), [viewData]);
  const mapDepots = useMemo(() => enabledDepotIds === null
    ? viewData.depots
    : viewData.depots.filter(depot => enabledDepotIds.includes(depot.id)),
  [viewData.depots, enabledDepotIds]);
  const selectedRoute = viewData.routes.find((route) => route.id === selectedRouteId) || null;
  const selectedCustomer = viewData.customers.find((customer) => customer.id === selectedCustomerId) || null;
  const blockingErrors = validation?.errors.length || 0;
  const warningCount = (validation?.warnings.length || 0) + (solution?.verification.warnings.length || 0) + (solution?.unserved.length || 0);
  const runtimeValue = useMemo<VrpRuntimeContextValue>(() => ({ scenario, solution, validation, viewData }), [scenario, solution, validation, viewData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener('operartis:open-settings', openSettings);
    return () => window.removeEventListener('operartis:open-settings', openSettings);
  }, []);

  const handleSelectRoute = useCallback((routeId: string | null) => {
    setSelectedRouteId(routeId);
    setSelectedCustomerId(null);
    if (routeId) setInspectorTab('routes');
  }, []);

  const handleSelectCustomer = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId);
    setInspectorTab('summary');
  }, []);

  const handleImported = useCallback((checked: ValidationResponse) => {
    const imported = checked.normalized_scenario;
    setScenario(checked.normalized_scenario);
    setEnabledDepotIds(null);
    setAllowedDepotChoices(null);
    setValidation(checked);
    setSolution(null);
    setCompletedJobId(null);
    setSelectedRouteId(null);
    setSelectedCustomerId(null);
    setMapFitRequest((value) => value + 1);
    setInspectorTab(checked.valid ? 'summary' : 'validation');
    setOptimizationStage(checked.valid ? 'Scenario validated' : 'Input corrections required');
    setProgress(0);
    setToast(checked.valid
      ? `${checked.counts.customers || imported.customers.length} customers imported and validated`
      : `Import completed with ${checked.errors.length} blocking error${checked.errors.length === 1 ? '' : 's'}`);
  }, []);

  const handleScenarioChosen = useCallback((report: ValidationResponse, filename: string) => {
    handleImported(report);
    setImportedFilename(filename);
    setScenarioDialog(null);
  }, [handleImported]);

  const runOptimization = async () => {
    if (optimizing || !scenario) return;
    const controller = new AbortController();
    optimizationAbortRef.current = controller;
    setOptimizing(true);
    setProgress(5);
    setOptimizationStage('Validating scenario');
    setSolution(null);
    setCompletedJobId(null);
    try {
      const report = await validateScenario(scenario);
      if (controller.signal.aborted) return;
      setScenario(report.normalized_scenario);
      setValidation(report);
      if (!report.valid) {
        setInspectorTab('validation');
        throw new Error(`Scenario validation found ${report.errors.length} blocking error${report.errors.length === 1 ? '' : 's'}`);
      }

      setProgress(10);
      setOptimizationStage('Submitting optimization job');
      const accepted = await submitSolve(report.normalized_scenario);
      if (controller.signal.aborted) {
        void cancelJob(accepted.job_id).catch(() => undefined);
        return;
      }
      setActiveJobId(accepted.job_id);
      const result = await waitForJob(accepted.job_id, (job) => {
        const stageLabels: Record<string, string> = {
          queued: 'Waiting for solver capacity',
          matrix: 'Building road matrix',
          constructing: 'Constructing feasible trips',
          improving: 'Improving trip sequences',
          packing: 'Packing trips into physical vehicles',
          verifying: 'Verifying hard constraints',
          cancelling: 'Cancelling optimization',
        };
        setOptimizationStage(stageLabels[job.status] || job.status.replaceAll('_', ' '));
        setProgress(job.progress);
      }, controller.signal);
      if (controller.signal.aborted) return;
      setSolution(result);
      setCompletedJobId(accepted.job_id);
      setProgress(100);
      setOptimizationStage(result.verification.passed ? 'Verified plan' : 'Verification failed');
      setInspectorTab(result.verification.passed ? 'summary' : 'validation');
      setSelectedRouteId(null);
      setToast(`${result.verification.passed ? 'Verified' : 'Completed'} route plan generated · ${result.summary.customers_served} customers served`);
      window.OperartisApi?.broadcastDashboardDataChanged('vrp');
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
        setToast(error instanceof Error ? error.message : 'Optimization failed');
      }
    } finally {
      if (optimizationAbortRef.current === controller) {
        optimizationAbortRef.current = null;
        setActiveJobId(null);
        setOptimizing(false);
      }
    }
  };

  const cancelOptimization = async () => {
    const controller = optimizationAbortRef.current;
    setOptimizationStage('Cancelling optimization');
    if (activeJobId) await cancelJob(activeJobId).catch(() => undefined);
    controller?.abort();
    setProgress(0);
    setToast('Optimization cancelled');
  };

  const handleReset = () => {
    const controller = optimizationAbortRef.current;
    if (activeJobId) void cancelJob(activeJobId).catch(() => undefined);
    controller?.abort();
    optimizationAbortRef.current = null;
    setOptimizing(false);
    setScenario(null);
    setEnabledDepotIds(null);
    setAllowedDepotChoices(null);
    setSolution(null);
    setValidation(null);
    setSelectedRouteId(null);
    setSelectedCustomerId(null);
    setInspectorTab('summary');
    setDataManager(null);
    setEntityDialog(null);
    setImportedFilename(null);
    setOptimizationStage('Ready to optimize');
    setProgress(0);
    setActiveJobId(null);
    setCompletedJobId(null);
    setMapFitRequest((value) => value + 1);
    setToast('Scenario reset');
  };

  const handleExport = async (format: 'xlsx' | 'json' | 'geojson' = 'xlsx') => {
    if (!completedJobId) {
      setToast('Run an optimization before exporting a plan');
      return;
    }
    try {
      await downloadJobExport(completedJobId, format);
      setToast(`Operational ${format.toUpperCase()} export downloaded`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Export failed');
    }
  };

  return (
    <VrpRuntimeContext.Provider value={runtimeValue}>
    <div className="vrp-app">
      <div className="app-body">
        <div className={`scenario-sidebar-shell ${sidebarCollapsed ? 'is-collapsed' : ''} ${mobileSidebarOpen ? 'is-mobile-open' : ''}`}>
          <button
            className="boundary-toggle sidebar-boundary-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
          </button>

          <aside className={`scenario-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
            <div className="sidebar-brand-header">
              <a className="brand-lockup" href="/" aria-label="Operartis home">
                <img src={operartisLogo} alt="" />
                <span>OPERARTIS</span>
              </a>
              <button className="icon-button mobile-sidebar-close" type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close scenario navigation"><X size={18} /></button>
            </div>

            <div className="sidebar-scroll scroller">
              <div className="sidebar-import">
                <span className="sidebar-section-label">Source data</span>
                <div className={`sidebar-file-card ${importedFilename ? validation?.valid ? 'is-ready' : 'needs-review' : ''}`}>
                  {importedFilename ? (
                    <div className="sidebar-file-selected">
                      <button className="sidebar-file-name" type="button" title={`${importedFilename} · choose another scenario`} onClick={() => setScenarioDialog('templates')} disabled={optimizing}>{importedFilename}</button>
                      <span className="sidebar-file-status">{validation?.valid ? 'Uploaded & validated' : 'Action required'}</span>
                      <div className="sidebar-file-actions">
                        <button type="button" title="Upload another file" aria-label="Upload another file" onClick={() => setScenarioDialog('upload')} disabled={optimizing}><Upload size={14} /></button>
                        <button type="button" title="Review scenario data" aria-label="Review scenario data" onClick={() => setDataManager('customers')}><Table2 size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <button className="sidebar-file-empty" type="button" onClick={() => setScenarioDialog('templates')} disabled={optimizing} aria-label="Choose scenario data">
                      <Upload size={32} /><span>Choose Data</span>
                    </button>
                  )}
                </div>
              </div>

              {scenario && <>
              <div className="sidebar-heading">
                <span className="sidebar-section-label">Scenario data</span>
                <strong className="sidebar-scenario-name">{scenario.name}</strong>
              </div>

              <nav className="data-navigation" aria-label="Scenario data">
                {dataNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.kind} className="data-nav-item" type="button" onClick={() => { setDataManager(item.kind); setMobileSidebarOpen(false); }}>
                      <span className="data-nav-icon"><Icon size={18} /></span>
                      <span className="data-nav-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="count-pill">{item.count}</span>
                      <ChevronRight className="nav-chevron" size={15} />
                    </button>
                  );
                })}
              </nav>

              <div className="sidebar-section">
                <span className="sidebar-section-label">Planning rules</span>
                <button className="rule-row" type="button" onClick={() => setToast('Fixed home-depot policy is active')}>
                  <RouteIcon size={17} />
                  <span><strong>Fixed home depots</strong><small>Return & reload at home</small></span>
                  <Check size={14} />
                </button>
                <button className="rule-row" type="button" onClick={() => setToast('All customer windows are hard constraints')}>
                  <Clock3 size={17} />
                  <span><strong>Hard time windows</strong><small>No lateness allowed</small></span>
                  <Check size={14} />
                </button>
                <button className="rule-row" type="button" onClick={() => setToast('One delivery-capacity dimension is active')}>
                  <PackageCheck size={17} />
                  <span><strong>Delivery demand</strong><small>Single capacity unit</small></span>
                  <Check size={14} />
                </button>
              </div>

              </>}
              <div className="sidebar-reset">
                <button type="button" className="sidebar-reset-button" onClick={handleReset}>
                  <Trash2 size={16} />
                  Reset
                </button>
              </div>
            </div>

            <div className="sidebar-bottom">
              <div className="sidebar-bottom-copy">
                <p className="sidebar-bottom-title">Operartis Analytics</p>
                <p className="sidebar-bottom-tagline">Optimizing Today, Growing Tomorrow</p>
              </div>
            </div>
          </aside>
        </div>
        {mobileSidebarOpen && <button className="mobile-backdrop" type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation" />}

        <div className="vrp-main-shell">
          <header className="app-header glass-chrome">
            <div className="header-leading">
              <button className="icon-button mobile-menu-button" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open scenario navigation">
                <Menu size={19} />
              </button>
              <button className="scenario-selector" type="button" onClick={() => setScenarioDialog('templates')} disabled={optimizing} aria-haspopup="dialog" title="Choose scenario">
                <span>
                  <small>Scenario</small>
                  <strong>{scenario ? `${scenario.name} · ${new Date(`${scenario.planning_date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}` : 'Choose a scenario'}</strong>
                </span>
                <ChevronDown size={15} />
              </button>
            </div>

            <div className="module-identity module-title">
              <strong>Vehicle Routing</strong>
            </div>

            <div className="header-actions">
              {scenario && <><button className="icon-button hide-compact" type="button" onClick={() => setToast('Scenario draft saved locally')} aria-label="Save scenario">
                <Save size={17} />
              </button>
              <button className="button button-primary" type="button" onClick={runOptimization} disabled={optimizing}>
                {optimizing ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
                <span>{optimizing ? 'Optimizing' : 'Optimize'}</span>
              </button>
              </>}
              <OperartisAuthTopbarSlot />
            </div>
          </header>

          <main className={`planning-workspace ${scenario ? '' : 'is-empty'}`}>
          <section className="map-workspace">
            {scenario ? <Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={22} /><span>Loading route map</span></div>}>
              <MapView customers={viewData.customers} depots={mapDepots} routes={viewData.routes} selectedRouteId={selectedRouteId} onSelectRoute={handleSelectRoute} onSelectCustomer={handleSelectCustomer} dark={dark} fitRequest={mapFitRequest} />
            </Suspense> : (
              <div className="vrp-empty-state" aria-hidden="true">
                <img src={operartisWatermark} alt="" width="420" height="117" className="vrp-empty-watermark" />
              </div>
            )}

            {scenario && <>
            <div className="map-toolbar glass-panel">
              <button className="toolbar-back" type="button" onClick={() => { setSelectedRouteId(null); setSelectedCustomerId(null); setMapFitRequest((value) => value + 1); }} title="Show all routes" aria-label="Show all routes"><ArrowLeft size={16} /></button>
              <span />
              <button type="button" onClick={() => setDataManager('customers')} title="Data table" aria-label="Data table"><Table2 size={15} /></button>
            </div>

            {legendCollapsed ? (
              <button className="map-legend map-legend-collapsed glass-panel" type="button" onClick={toggleLegend} aria-label="Show map legend" aria-expanded="false">
                <Info size={13} strokeWidth={2.2} /> Legend <ChevronRight size={13} strokeWidth={2.2} />
              </button>
            ) : (
              <div className="map-legend glass-panel" aria-label="Map legend">
                <span><i className="legend-depot" /> Depot</span>
                <span><i className="legend-stop">1</i> Customer</span>
                <span><i className="legend-cluster" /> Grouped stops</span>
                {viewData.routes.length > 0 && <span><i className="legend-route" /> Vehicle route</span>}
                <button className="legend-toggle" type="button" onClick={toggleLegend} aria-label="Hide map legend" aria-expanded="true" title="Hide legend">
                  <ChevronLeft size={13} strokeWidth={2.2} />
                </button>
              </div>
            )}
            </>}
          </section>

          {scenario && <>
          <aside className="route-inspector">
            <div className="inspector-header">
              <div>
                <span className="eyebrow">Solution</span>
                <h2>Route plan</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Solution actions"><MoreHorizontal size={18} /></button>
            </div>

            <div className="segmented-tabs" role="tablist" aria-label="Solution views">
              {inspectorTabs.map((tab) => (
                <button key={tab.id} className={inspectorTab === tab.id ? 'is-active' : ''} type="button" onClick={() => setInspectorTab(tab.id)} role="tab" aria-selected={inspectorTab === tab.id}>
                  {tab.label}
                  {tab.id === 'validation' && <span className="tab-count">{blockingErrors + warningCount}</span>}
                </button>
              ))}
            </div>

            <div className="inspector-content scroller">
              {inspectorTab === 'summary' && (
                <SummaryPanel selectedRoute={selectedRoute} selectedCustomer={selectedCustomer} onOpenRoutes={() => setInspectorTab('routes')} />
              )}
              {inspectorTab === 'routes' && (
                <RoutesPanel selectedRouteId={selectedRouteId} onSelectRoute={handleSelectRoute} />
              )}
              {inspectorTab === 'validation' && <ValidationPanel />}
            </div>
          </aside>

          <section className={`timeline-panel ${timelineCollapsed ? 'is-collapsed' : ''}`}>
            <div className="timeline-header">
              <div className="timeline-title">
                <button className="boundary-toggle" type="button" onClick={() => setTimelineCollapsed((value) => !value)} aria-label={timelineCollapsed ? 'Expand vehicle timeline' : 'Collapse vehicle timeline'}>
                  {timelineCollapsed ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
                </button>
                <div><span className="eyebrow">Vehicle schedule</span><h3>Trips & reloads</h3></div>
              </div>
              <div className="timeline-actions">
                <span className="timeline-note"><span /> Hard-window feasible</span>
                <button className="button button-quiet" type="button" onClick={() => void handleExport('xlsx')} disabled={!completedJobId}><Download size={17} /> Export</button>
              </div>
            </div>
            {!timelineCollapsed && <VehicleTimeline selectedRouteId={selectedRouteId} onSelectRoute={handleSelectRoute} />}
          </section>
          </>}
          </main>
        </div>
      </div>

      {optimizing && (
        <div className="optimization-strip" role="status" aria-live="polite">
          <span className="optimization-copy"><LoaderCircle className="spin" size={16} /> {optimizationStage}</span>
          <span className="optimization-progress"><i style={{ width: `${progress}%` }} /></span>
          <b>{progress}%</b>
          <button className="button button-quiet" type="button" onClick={() => void cancelOptimization()}>Cancel</button>
        </div>
      )}

      {dataManager && (
        <DataManager kind={dataManager} enabledDepotIds={enabledDepotIds} allowedDepotChoices={allowedDepotChoices}
          onApplyDepots={async (selected, choices) => {
            if (!scenario || optimizing) throw new Error('Wait for optimization to finish before changing depots.');
            if (!selected.length) throw new Error('Select at least one depot.');
            const customers = scenario.customers.map(customer => {
              const choice = choices[customer.id];
              const allowed = choice === 'Unassigned' ? selected : choice.split(',').map(id => id.trim());
              if (!allowed.length || allowed.some(id => !selected.includes(id))) throw new Error(`${customer.id}: choose an available Allowed Depot or Unassigned.`);
              return { ...customer, compatible_depot_ids: choice === 'Unassigned' && selected.length === scenario.depots.length ? null : allowed };
            });
            const report = await validateScenario({ ...scenario, customers });
            if (!report.valid) throw new Error(report.errors.map(issue => `${issue.entity_id || 'Scenario'}: ${issue.message}`).join(' · '));
            setScenario(report.normalized_scenario);
            setValidation(report);
            setEnabledDepotIds(selected);
            setAllowedDepotChoices(choices);
            setSolution(null);
            setCompletedJobId(null);
            setSelectedRouteId(null);
            setSelectedCustomerId(null);
            setInspectorTab('summary');
            setToast('Allowed depots applied. Optimize again to calculate routes.');
          }} onClose={() => setDataManager(null)} onAdd={() => setEntityDialog(dataManager)} onToast={setToast} />
      )}
      {scenarioDialog && <ScenarioDialog initialSource={scenarioDialog} onClose={() => setScenarioDialog(null)} onImported={handleScenarioChosen} />}
      {entityDialog && <EntityDialog kind={entityDialog} onClose={() => setEntityDialog(null)} onSaved={(message) => { setEntityDialog(null); setToast(message); }} />}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />

      {toast && (
        <div className="toast" role="status">
          <span><CheckCircle2 size={20} /></span>
          <div><strong>Success</strong><p>{toast}</p></div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button>
        </div>
      )}
    </div>
    </VrpRuntimeContext.Provider>
  );
}

function SummaryPanel({ selectedRoute, selectedCustomer, onOpenRoutes }: {
  selectedRoute: Route | null;
  selectedCustomer: Customer | null;
  onOpenRoutes: () => void;
}) {
  const { scenario, solution } = useVrpRuntime();
  const summary = solution?.summary;
  const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: scenario.currency, maximumFractionDigits: 0 });
  const totalCost = summary?.total_cost || 0;
  const distanceKm = (summary?.distance_meters || 0) / 1000;
  const costPerKm = distanceKm ? totalCost / distanceKm : 0;
  const objectiveParts = [summary?.activation_cost || 0, summary?.distance_cost || 0, summary?.working_time_cost || 0];
  const objectiveTotal = objectiveParts.reduce((total, value) => total + value, 0) || 1;
  const depotWorkload = scenario.depots.map((depot) => {
    const assignedVehicles = solution?.vehicles.filter((vehicle) => vehicle.home_depot_id === depot.id) || [];
    const stops = assignedVehicles.reduce((total, vehicle) => total + vehicle.trips.reduce((subtotal, trip) => subtotal + trip.stops.length, 0), 0);
    return { depot, vehicles: assignedVehicles.length, stops };
  });
  const maximumStops = Math.max(1, ...depotWorkload.map((item) => item.stops));
  const reusedVehicles = solution?.vehicles.filter((vehicle) => vehicle.trips.length > 1).length || 0;

  if (selectedCustomer) {
    return (
      <div className="inspector-stack">
        <div className="selection-card">
          <div className="selection-card-head">
            <span className="selection-icon"><MapPin size={20} /></span>
            <div><small>Selected customer</small><strong>{selectedCustomer.name}</strong><span>{selectedCustomer.id}</span></div>
          </div>
          <dl className="detail-list">
            <div><dt>Time window</dt><dd>{selectedCustomer.timeWindow}</dd></div>
            <div><dt>Demand</dt><dd>{selectedCustomer.demand} {scenario.demand_unit}</dd></div>
            <div><dt>Service</dt><dd>{selectedCustomer.serviceMinutes} min</dd></div>
            <div><dt>Assigned depot</dt><dd>{selectedCustomer.depotId}</dd></div>
          </dl>
          <div className="feasible-banner"><CheckCircle2 size={16} /> {selectedCustomer.routeId ? 'Scheduled by verified plan' : 'Awaiting optimization'}</div>
        </div>
        <button className="button button-quiet button-full" type="button" onClick={onOpenRoutes}><RouteIcon size={18} /> View assigned route</button>
      </div>
    );
  }

  return (
    <div className="inspector-stack">
      <div className="metric-grid">
        <MetricCard icon={MapPin} label="Customers" value={`${summary?.customers_served || 0} / ${scenario.customers.length}`} meta={solution ? `${Math.round(((summary?.customers_served || 0) / scenario.customers.length) * 100)}% served` : 'Awaiting solution'} accent="emerald" />
        <MetricCard icon={Truck} label="Fleet used" value={`${summary?.vehicles_used || 0} / ${scenario.vehicles.filter((vehicle) => vehicle.enabled).length}`} meta={`${summary?.trips || 0} trips`} />
        <MetricCard icon={RouteIcon} label="Distance" value={distanceKm.toFixed(1)} meta="kilometres" />
        <MetricCard icon={CircleDollarSign} label="Plan cost" value={currency.format(totalCost)} meta={`${currency.format(costPerKm)} / km`} accent="gold" />
      </div>

      <div className="inspector-card objective-card">
        <div className="card-heading"><span><BarChart3 size={18} /> Objective</span></div>
        <div className="objective-row"><span>Vehicle activation</span><strong>{currency.format(objectiveParts[0])}</strong><i><b style={{ width: `${objectiveParts[0] / objectiveTotal * 100}%` }} /></i></div>
        <div className="objective-row"><span>Distance cost</span><strong>{currency.format(objectiveParts[1])}</strong><i><b style={{ width: `${objectiveParts[1] / objectiveTotal * 100}%` }} /></i></div>
        <div className="objective-row"><span>Working time</span><strong>{currency.format(objectiveParts[2])}</strong><i><b style={{ width: `${objectiveParts[2] / objectiveTotal * 100}%` }} /></i></div>
      </div>

      {selectedRoute ? (
        <div className="inspector-card selected-route-card" style={{ '--route-color': selectedRoute.color } as CSSProperties}>
          <div className="card-heading"><span><i className="route-color-dot" /> {selectedRoute.label}</span><button type="button" onClick={onOpenRoutes}>Details <ChevronRight size={14} /></button></div>
          <div className="route-kpis"><span><strong>{selectedRoute.stops}</strong><small>stops</small></span><span><strong>{selectedRoute.distanceKm} km</strong><small>distance</small></span><span><strong>{selectedRoute.duration}</strong><small>duration</small></span></div>
        </div>
      ) : (
        <div className="inspector-card coverage-card">
          <div className="card-heading"><span><Warehouse size={17} /> Depot workload</span><button type="button">Balanced</button></div>
          <div className="depot-workload">{depotWorkload.map((item) => <span key={item.depot.id}><b>{item.depot.id}</b><i><em style={{ width: `${item.stops / maximumStops * 100}%` }} /></i><small>{item.stops} stops · {item.vehicles} vehicles</small></span>)}</div>
        </div>
      )}

      <div className="inspector-card carbon-card">
        <span className="carbon-icon"><Zap size={18} /></span>
        <div><small>Vehicle reuse</small><strong>{reusedVehicles} vehicle{reusedVehicles === 1 ? '' : 's'} perform multiple trips</strong><p>{solution ? 'Calculated from the verified depot reload schedule.' : 'Vehicle reuse is calculated after optimization.'}</p></div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, meta, accent }: { icon: typeof MapPin; label: string; value: string; meta: string; accent?: 'gold' | 'emerald' }) {
  return (
    <div className={`metric-card ${accent ? `accent-${accent}` : ''}`}>
      <span><Icon size={16} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{meta}</p>
    </div>
  );
}

function RoutesPanel({ selectedRouteId, onSelectRoute }: { selectedRouteId: string | null; onSelectRoute: (routeId: string | null) => void }) {
  const { scenario, viewData } = useVrpRuntime();
  const { routes, vehicles } = viewData;
  const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: scenario.currency, maximumFractionDigits: 0 });
  const tripCount = routes.reduce((total, route) => total + route.trips, 0);
  const stopCount = routes.reduce((total, route) => total + route.stops, 0);
  return (
    <div className="route-list">
      <div className="route-list-tools">
        <label><Search size={16} /><input placeholder="Find route or vehicle" /></label>
        <button type="button" aria-label="Filter routes"><ListFilter size={17} /></button>
      </div>
      <button className={`route-card route-card-all ${selectedRouteId === null ? 'is-selected' : ''}`} type="button" onClick={() => onSelectRoute(null)}>
        <span className="route-overview-icon"><LayoutDashboard size={18} /></span>
        <span><strong>All vehicle routes</strong><small>{routes.length} vehicles · {tripCount} trips · {stopCount} stops</small></span>
        <ChevronRight size={16} />
      </button>
      {routes.map((route) => {
        const vehicle = vehicles.find((item) => item.id === route.vehicleId);
        return (
          <button key={route.id} className={`route-card ${selectedRouteId === route.id ? 'is-selected' : ''}`} type="button" onClick={() => onSelectRoute(route.id)} style={{ '--route-color': route.color } as CSSProperties}>
            <span className="route-number"><i />{route.id.replace('R-', '')}</span>
            <span className="route-card-copy"><strong>{vehicle?.plate || route.vehicleId}</strong><small>{route.label} · {route.trips} {route.trips === 1 ? 'trip' : 'trips'}</small><em>{route.stops} stops · {route.distanceKm} km · {route.duration}</em></span>
            <span className="route-cost">{currency.format(route.cost)}<ChevronRight size={15} /></span>
          </button>
        );
      })}
      {!routes.length && <div className="inspector-card"><strong>No solved routes yet</strong><p>Validate the scenario and run Optimize to create a route plan.</p></div>}
    </div>
  );
}

function ValidationPanel() {
  const { solution, validation, viewData } = useVrpRuntime();
  const validationItems = viewData.validationItems;
  const verified = Boolean(solution?.verification.passed);
  const score = verified ? 100 : validation?.valid ? 75 : validation ? 25 : 0;
  return (
    <div className="validation-stack">
      <div className="validation-score-card">
        <span className="score-ring" aria-label={`Feasibility score ${score} out of 100`}><b>{score}</b><small>/100</small></span>
        <div><span className="eyebrow">Feasibility score</span><strong>{verified ? 'Verified solution' : validation?.valid ? 'Scenario validated' : 'Validation required'}</strong><p>{verified ? 'All launch-version hard constraints passed.' : 'The backend verifier runs after optimization.'}</p></div>
      </div>
      <div className="constraint-pills">
        <span><CheckCircle2 size={14} /> Capacity</span><span><CheckCircle2 size={14} /> Time windows</span><span><CheckCircle2 size={14} /> Shifts</span><span><CheckCircle2 size={14} /> Reloads</span>
      </div>
      {validationItems.map((item) => (
        <article key={item.id} className={`validation-item level-${item.level}`}>
          <span className="validation-item-icon">{item.level === 'warning' || item.level === 'error' ? <AlertTriangle size={18} /> : item.level === 'success' ? <ShieldCheck size={18} /> : <Info size={18} />}</span>
          <div><strong>{item.title}</strong><p>{item.detail}</p>{item.entity && <button type="button">Open {item.entity} <ChevronRight size={14} /></button>}</div>
        </article>
      ))}
    </div>
  );
}

function VehicleTimeline({ selectedRouteId, onSelectRoute }: { selectedRouteId: string | null; onSelectRoute: (routeId: string | null) => void }) {
  const { scenario, viewData } = useVrpRuntime();
  const { customers, depots, routes, trips, vehicles } = viewData;
  const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
  const timelineVehicles = vehicles.filter((vehicle) => vehicle.routeId && (!selectedRouteId || vehicle.routeId === selectedRouteId));
  const enabledVehicles = scenario.vehicles.filter((vehicle) => vehicle.enabled);
  const timelineStartMinute = Math.floor(Math.min(...enabledVehicles.map((vehicle) => vehicle.shift_window.start), 6 * 3600) / 3600) * 60;
  const timelineEndMinute = Math.ceil(Math.max(...enabledVehicles.map((vehicle) => vehicle.shift_window.end), 18 * 3600) / 3600) * 60;
  const timelineDurationMinutes = Math.max(60, timelineEndMinute - timelineStartMinute);
  const timelinePxPerMinute = 5;
  const timelineTrackWidth = timelineDurationMinutes * timelinePxPerMinute;
  const timelineTickWidth = 30 * timelinePxPerMinute;
  const timelineStyle = {
    '--timeline-track-width': `${timelineTrackWidth}px`,
    '--timeline-tick-width': `${timelineTickWidth}px`,
  } as CSSProperties;
  const timelineTicks = Array.from({ length: timelineDurationMinutes / 30 + 1 }, (_, index) => {
    const minute = timelineStartMinute + index * 30;
    const hours = Math.floor(minute / 60);
    const minutes = minute % 60;
    return { minute, label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, isHour: minute % 60 === 0 };
  });
  const minutesToOffset = (minute: number) => `${Math.max(0, Math.min(timelineTrackWidth, (minute - timelineStartMinute) * timelinePxPerMinute))}px`;
  const minutesToSize = (minutes: number) => `${Math.max(0, minutes * timelinePxPerMinute)}px`;

  return (
    <div className="timeline-body scroller" style={timelineStyle}>
      <div className="timeline-layout">
        <div className="timeline-vehicle-column">
          <div className="vehicle-column-head"><Truck size={16} /> Physical vehicle</div>
          {timelineVehicles.map((vehicle) => {
            const route = routes.find((item) => item.id === vehicle.routeId)!;
            const vehicleTrips = trips.filter((trip) => trip.vehicleId === vehicle.id);
            const isHovered = hoveredVehicleId === vehicle.id;
            return (
              <button
                key={vehicle.id}
                className={`vehicle-label${isHovered ? ' is-hovered' : ''}`}
                type="button"
                onClick={() => onSelectRoute(vehicle.routeId)}
                onMouseEnter={() => setHoveredVehicleId(vehicle.id)}
                onMouseLeave={() => setHoveredVehicleId(null)}
                style={{ '--route-color': route.color } as CSSProperties}
              >
                <i /><span><strong>{vehicle.plate}</strong><small>{vehicle.id} · {vehicle.utilization}% utilized</small></span><em>{vehicleTrips.length}T</em>
              </button>
            );
          })}
        </div>
        <div className="timeline-schedule">
          <div className="timeline-axis-row">
            <div className="timeline-axis">
              {timelineTicks.map((tick, index) => (
                <span
                  key={tick.minute}
                  className={[index === timelineTicks.length - 1 ? 'axis-end' : '', tick.isHour ? 'axis-hour' : 'axis-half'].filter(Boolean).join(' ')}
                  style={{ left: minutesToOffset(tick.minute) }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
          {timelineVehicles.map((vehicle) => {
            const route = routes.find((item) => item.id === vehicle.routeId)!;
            const vehicleTrips = trips.filter((trip) => trip.vehicleId === vehicle.id);
            const isHovered = hoveredVehicleId === vehicle.id;
            return (
              <button
                key={vehicle.id}
                className={`timeline-row${isHovered ? ' is-hovered' : ''}`}
                type="button"
                onClick={() => onSelectRoute(vehicle.routeId)}
                onMouseEnter={() => setHoveredVehicleId(vehicle.id)}
                onMouseLeave={() => setHoveredVehicleId(null)}
                style={{ '--route-color': route.color } as CSSProperties}
              >
                <span className="timeline-track">
                  {timelineTicks.map((tick) => <i className={`timeline-gridline${tick.isHour ? ' is-hour' : ''}`} key={tick.minute} style={{ left: minutesToOffset(tick.minute) }} />)}
                  {vehicleTrips.map((trip, index) => {
                    const depot = depots.find((item) => item.id === trip.depotId)!;
                    const nextTrip = vehicleTrips[index + 1];
                    return (
                      <Fragment key={trip.id}>
                        <span className="trip-journey-line" style={{ left: minutesToOffset(trip.startMinute), width: minutesToSize(trip.endMinute - trip.startMinute) }} aria-hidden="true" />
                        {index === 0 && (
                          <TimelineEvent className="depot-event event-start" time={trip.start} style={{ left: minutesToOffset(trip.startMinute) }}>
                            <Warehouse size={18} />
                            <span><b>{depot.id} · {depot.name} · Depart</b><small>Departure at {trip.start}</small></span>
                          </TimelineEvent>
                        )}
                        {trip.visits.map((visit) => {
                          const customer = customers.find((item) => item.id === visit.customerId)!;
                          return (
                            <TimelineEvent
                              key={visit.customerId}
                              className="customer-event"
                              time={visit.arrival}
                              style={{ left: minutesToOffset(visit.arrivalMinute), width: minutesToSize(visit.departureMinute - visit.arrivalMinute) }}
                            >
                              <i>{customer.sequence}</i>
                              <span>
                                <b>{customer.id} · {customer.name}</b>
                                <small>Arrive {visit.arrival}</small>
                                <small>Depart {visit.departure}</small>
                                <small>Time Window {customer.timeWindow.replace('–', ' - ')}</small>
                              </span>
                            </TimelineEvent>
                          );
                        })}
                        {nextTrip ? (
                          <TimelineEvent className="depot-event reload-event" time={trip.end} style={{ left: minutesToOffset(trip.endMinute), width: minutesToSize(nextTrip.startMinute - trip.endMinute) }}>
                            <Warehouse size={18} />
                            <span>
                              <b>{depot.id} · {depot.name} · Reload</b>
                              <small>Arrive {trip.end}</small>
                              <small>Depart {nextTrip.start}</small>
                            </span>
                          </TimelineEvent>
                        ) : (
                          <TimelineEvent className="depot-event event-end" time={trip.end} style={{ left: minutesToOffset(trip.endMinute) }}>
                            <Warehouse size={18} />
                            <span><b>{depot.id} · {depot.name} · Return</b><small>Arrival at {trip.end}</small></span>
                          </TimelineEvent>
                        )}
                      </Fragment>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type TableRow = Record<string, string>;
type ScenarioTables = Record<DataKind, TableRow[]>;

function cloneScenarioTables(tables: ScenarioTables): ScenarioTables {
  return {
    depots: tables.depots.map((row) => ({ ...row })),
    customers: tables.customers.map((row) => ({ ...row })),
    vehicleTypes: tables.vehicleTypes.map((row) => ({ ...row })),
    vehicles: tables.vehicles.map((row) => ({ ...row })),
  };
}

function createScenarioTables(viewData: VrpViewData): ScenarioTables {
  return {
    depots: getDataRows('depots', viewData),
    customers: getDataRows('customers', viewData),
    vehicleTypes: getDataRows('vehicleTypes', viewData),
    vehicles: getDataRows('vehicles', viewData),
  };
}

function DataManager({ kind, onClose, onAdd, onToast, enabledDepotIds, allowedDepotChoices, onApplyDepots }: { kind: DataKind; onClose: () => void; onAdd: () => void; onToast: (message: string) => void; enabledDepotIds: string[] | null; allowedDepotChoices: Record<string, string> | null; onApplyDepots: (selected: string[], choices: Record<string, string>) => Promise<void> }) {
  const { viewData, scenario } = useVrpRuntime();
  const dataNav = useMemo(() => createDataNav(viewData), [viewData]);
  const initialTables = useMemo(() => {
    const result = createScenarioTables(viewData);
    result.customers = result.customers.map(row => ({ ...row, 'Allowed Depot': allowedDepotChoices?.[row.ID] ?? scenario.customers.find(c => c.id === row.ID)?.compatible_depot_ids?.join(', ') ?? 'Unassigned' }));
    return result;
  }, [viewData, scenario, allowedDepotChoices]);
  const [saving, setSaving] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState(kind);
  const [query, setQuery] = useState('');
  const [committedTables, setCommittedTables] = useState(() => cloneScenarioTables(initialTables));
  const [tables, setTables] = useState(() => cloneScenarioTables(initialTables));
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingRowSnapshot, setEditingRowSnapshot] = useState<Record<string, string> | null>(null);
  const [openMenuRow, setOpenMenuRow] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<DataKind, Set<number>>>(() => Object.fromEntries(
    (Object.keys(initialTables) as DataKind[]).map(key => [key, new Set(initialTables[key].flatMap((row, index) => key !== 'depots' || !enabledDepotIds || enabledDepotIds.includes(row.ID) ? [index] : []))]),
  ) as Record<DataKind, Set<number>>);
  const selectedRows = selections[activeKind];
  const selectionLabels: Record<DataKind, string> = { depots: 'depot', customers: 'customer', vehicleTypes: 'vehicle type', vehicles: 'physical vehicle' };
  const setSelectedRows = (update: (current: Set<number>) => Set<number>) => {
    const next = update(selectedRows);
    if (next.size === 0) {
      setApplyError(`At least one ${selectionLabels[activeKind]} must be selected.`);
      return;
    }
    setApplyError(null);
    setSelections(current => ({ ...current, [activeKind]: next }));
  };
  const availableDepots = tables.depots.filter((_, index) => selections.depots.has(index));
  const isAvailableChoice = (choice: string) => choice === 'Unassigned' || choice.split(',').every(id => availableDepots.some(depot => depot.ID === id.trim()));
  const [sortKey, setSortKey] = useState('ID');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const tableRef = useRef<HTMLTableElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const title = dataNav.find((item) => item.kind === activeKind)!.label;
  const rows = tables[activeKind];
  const columns = Object.keys(rows[0] || {});
  const activeSortKey = columns.includes(sortKey) ? sortKey : (columns[0] || '');
  const visibleRows = useMemo(() => {
    const filtered = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()));
    if (!activeSortKey) return filtered;
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const cmp = String(left.row[activeSortKey] ?? '').localeCompare(String(right.row[activeSortKey] ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return cmp === 0 ? left.index - right.index : cmp * direction;
    });
  }, [rows, query, activeSortKey, sortDir]);
  const blocking = rows.filter((row) => Object.values(row).some((value) => !String(value).trim())).length;
  const dirty = JSON.stringify(tables) !== JSON.stringify(committedTables);
  const visibleIndexes = visibleRows.map(({ index }) => index);
  const selectedVisibleCount = visibleIndexes.filter((index) => selectedRows.has(index)).length;
  const allVisibleSelected = visibleIndexes.length > 0 && selectedVisibleCount === visibleIndexes.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    // Keep the draft values (not just the dropdown display) synchronized so Apply
    // sends Unassigned after either individual or bulk depot deselection.
    setTables(current => {
      const availableIds = new Set(current.depots.filter((_, index) => selections.depots.has(index)).map(depot => depot.ID));
      let changed = false;
      const customers = current.customers.map(customer => {
        const choice = customer['Allowed Depot'];
        if (choice === 'Unassigned' || choice.split(',').every(id => availableIds.has(id.trim()))) return customer;
        changed = true;
        return { ...customer, 'Allowed Depot': 'Unassigned' };
      });
      return changed ? { ...current, customers } : current;
    });
  }, [selections.depots, tables.depots, tables.customers]);

  useEffect(() => {
    setEditingRow(null);
    setEditingRowSnapshot(null);
    setOpenMenuRow(null);
    setSortKey('ID');
    setSortDir('asc');
  }, [activeKind]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  useEffect(() => {
    if (openMenuRow === null) return undefined;
    const closeMenu = (event: globalThis.MouseEvent) => {
      if (!(event.target as Element).closest('.data-row-menu')) setOpenMenuRow(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [openMenuRow]);

  const toggleRowSelected = (rowIndex: number) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const handleSort = (column: string) => {
    if (sortKey === column) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(column);
      setSortDir('asc');
    }
  };

  const toggleAllVisible = () => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIndexes.forEach((index) => next.delete(index));
      else visibleIndexes.forEach((index) => next.add(index));
      return next;
    });
  };

  const updateCell = (rowIndex: number, column: string, value: string) => {
    setTables((current) => ({
      ...current,
      [activeKind]: current[activeKind].map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
    }));
  };

  const startEditing = (rowIndex: number) => {
    if (editingRow !== null && editingRow !== rowIndex && editingRowSnapshot) {
      setTables((current) => ({
        ...current,
        [activeKind]: current[activeKind].map((row, index) => (index === editingRow ? editingRowSnapshot : row)),
      }));
    }
    setEditingRowSnapshot({ ...tables[activeKind][rowIndex] });
    setEditingRow(rowIndex);
    setOpenMenuRow(null);
    requestAnimationFrame(() => {
      const input = tableRef.current?.querySelector<HTMLInputElement>(`input[data-row="${rowIndex}"]`);
      input?.focus();
      input?.select();
    });
  };

  const applyRowEdit = (rowIndex: number) => {
    const row = tables[activeKind][rowIndex];
    if (Object.values(row).some((value) => !String(value).trim())) {
      onToast('Complete all fields before applying this row');
      return;
    }
    setEditingRow(null);
    setEditingRowSnapshot(null);
  };

  const cancelRowEdit = (rowIndex: number) => {
    if (editingRowSnapshot) {
      setTables((current) => ({
        ...current,
        [activeKind]: current[activeKind].map((row, index) => (index === rowIndex ? editingRowSnapshot : row)),
      }));
    }
    setEditingRow(null);
    setEditingRowSnapshot(null);
  };

  const discardAndClose = () => {
    setTables(cloneScenarioTables(committedTables));
    setEditingRow(null);
    setEditingRowSnapshot(null);
    setOpenMenuRow(null);
    onClose();
  };

  const applyAndClose = async () => {
    if (saving) return;
    for (const key of Object.keys(selectionLabels) as DataKind[]) {
      if (!tables[key].some((_, index) => selections[key].has(index))) {
        setApplyError(`At least one ${selectionLabels[key]} must be selected.`);
        return;
      }
    }
    if (blocking) {
      onToast(`${blocking} record${blocking === 1 ? '' : 's'} still need values before they can be applied`);
      return;
    }
    setSaving(true);
    setApplyError(null);
    try {
      await onApplyDepots(availableDepots.map(row => row.ID), Object.fromEntries(tables.customers.map(row => [row.ID, row['Allowed Depot']])));
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Could not apply allowed depots.');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-layer" role="presentation">
      <div className="data-manager" role="dialog" aria-modal="true" aria-label={`Manage ${title}`}>
        <header className="data-manager-header">
          <div><span className="eyebrow">Scenario data</span><h2>Manage operational inputs</h2><p>Select available depots, then choose each customer's Allowed Depot. Unassigned lets the solver choose among selected depots.</p></div>
          <button className="icon-button" type="button" onClick={discardAndClose} disabled={saving} aria-label="Close data manager"><X size={19} /></button>
        </header>
        <div className="data-manager-tabs">
          {dataNav.map((item) => {
            const Icon = item.icon;
            return <button key={item.kind} className={activeKind === item.kind ? 'is-active' : ''} type="button" onClick={() => setActiveKind(item.kind)}><Icon size={18} />{item.label}<span>{item.count}</span></button>;
          })}
        </div>
        <div className="data-manager-toolbar">
          <label><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} /></label>
          <button className="button button-quiet" type="button" onClick={() => onToast(`${title} template downloaded`)}><Download size={16} /> Template</button>
          <button className="button button-quiet" type="button" onClick={() => onToast(blocking ? `${title} table has ${blocking} incomplete record${blocking === 1 ? '' : 's'}` : `${title} table validated`)}><ShieldCheck size={16} /> Validate</button>
          <button className="button button-primary" type="button" onClick={onAdd}><Plus size={17} /> Add {singular(activeKind)}</button>
        </div>
        <div className="data-table-wrap scroller">
          <table className="data-table" ref={tableRef}>
            <thead>
              <tr>
                <th className="is-select">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="fc-row-check"
                    checked={allVisibleSelected}
                    disabled={saving || visibleIndexes.length === 0}
                    onChange={toggleAllVisible}
                    aria-label={`Select all ${title.toLowerCase()}`}
                  />
                </th>
                {columns.map((column) => {
                  const active = activeSortKey === column;
                  return (
                    <th key={column} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className={`data-sort-header${active ? ' is-active' : ''}`} onClick={() => handleSort(column)}>
                        <span>{column}</span>
                        <span className="data-sort-icon" aria-hidden="true">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    </th>
                  );
                })}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ row, index }) => (
                <tr key={`${activeKind}-${index}`} className={[editingRow === index ? 'is-editing' : undefined, selectedRows.has(index) ? 'is-selected' : undefined].filter(Boolean).join(' ') || undefined}>
                  <td className="is-select">
                    <input
                      type="checkbox"
                      className="fc-row-check"
                      checked={selectedRows.has(index)}
                      disabled={saving}
                      onChange={() => toggleRowSelected(index)}
                      aria-label={`Select ${row.ID || `row ${index + 1}`}`}
                    />
                  </td>
                  {columns.map((column, columnIndex) => (
                    <td key={column} className={column === 'ID' ? 'is-id' : undefined}>
                      {editingRow === index && activeKind === 'customers' && column === 'Allowed Depot' ? (
                        <select className="allowed-depot-select" value={isAvailableChoice(row[column]) ? row[column] : '__unavailable'} disabled={saving} aria-label={`Allowed Depot for ${row.ID}`} aria-invalid={!isAvailableChoice(row[column])} onChange={event => updateCell(index, column, event.target.value)}>
                          {!isAvailableChoice(row[column]) && <option value="__unavailable" disabled>Choose an available depot</option>}
                          <option value="Unassigned">Unassigned</option>
                          {availableDepots.map(depot => <option key={depot.ID} value={depot.ID}>{depot.ID}</option>)}
                          {row[column].includes(',') && isAvailableChoice(row[column]) && <option value={row[column]}>{row[column]} (imported restriction)</option>}
                        </select>
                      ) : editingRow === index ? (
                        <input
                          data-row={columnIndex === 0 ? String(index) : undefined}
                          value={row[column]}
                          aria-label={`Edit ${column} for ${row.ID || `row ${index + 1}`}`}
                          onChange={(event) => updateCell(index, column, event.target.value)}
                        />
                      ) : (
                        <span className="data-cell-value">{row[column]}</span>
                      )}
                    </td>
                  ))}
                  <td>
                    {editingRow === index ? (
                      <div className="data-row-edit-actions">
                        <button type="button" className="is-apply" onClick={() => applyRowEdit(index)} aria-label={`Apply changes for ${row.ID || `row ${index + 1}`}`}>
                          <Check size={16} aria-hidden="true" />
                        </button>
                        <button type="button" className="is-cancel" onClick={() => cancelRowEdit(index)} aria-label={`Cancel editing for ${row.ID || `row ${index + 1}`}`}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <div className="data-row-menu">
                        <button
                          type="button"
                          onClick={() => setOpenMenuRow(openMenuRow === index ? null : index)}
                          aria-label={`Actions for ${row.ID || `row ${index + 1}`}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuRow === index}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuRow === index && (
                          <div className="data-row-menu-panel" role="menu">
                            <button type="button" role="menuitem" onClick={() => startEditing(index)}>
                              <PencilLine size={16} aria-hidden="true" />
                              Editing
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="data-manager-footer">
          {applyError && <p role="alert" className="allowed-depot-error">{applyError}</p>}
          <span className={blocking ? 'is-blocked' : undefined}><CheckCircle2 size={16} /> {rows.length} record{rows.length === 1 ? '' : 's'} · {blocking} blocking error{blocking === 1 ? '' : 's'}{selectedRows.size ? ` · ${selectedRows.size} selected` : ''}{dirty ? ' · unsaved edits' : ''}</span>
          <div>
            <button className="button button-quiet" type="button" onClick={discardAndClose} disabled={saving}>Cancel</button>
            <button className="button button-primary" type="button" onClick={() => void applyAndClose()} disabled={saving || blocking > 0}><Save size={16} /> {saving ? 'Validating…' : 'Apply changes'}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function EntityDialog({ kind, onClose, onSaved }: { kind: DataKind; onClose: () => void; onSaved: (message: string) => void }) {
  const label = singular(kind);
  const submit = (event: FormEvent) => { event.preventDefault(); onSaved(`${label} added and validated`); };
  return (
    <div className="modal-layer modal-layer-top" role="presentation">
      <form className="entity-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Add ${label}`}>
        <header><div><span className="entity-dialog-icon">{kind === 'depots' ? <Warehouse size={20} /> : kind === 'customers' ? <MapPin size={20} /> : <Truck size={20} />}</span><span><small>Scenario data</small><h2>Add {label}</h2></span></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
        <div className="form-section"><div className="form-section-title"><span>01</span><div><strong>General information</strong><small>Identity and operational ownership</small></div></div><div className="form-grid"><label><span>{label} ID *</span><input required placeholder={kind === 'customers' ? 'C-019' : kind === 'depots' ? 'BER-03' : 'VEH-06'} /></label><label><span>Name *</span><input required placeholder={`New ${label.toLowerCase()}`} /></label><label><span>Home depot *</span><select defaultValue="BER-01"><option>BER-01 · Berlin Central</option><option>BER-02 · Spandau</option></select></label><label><span>Status</span><select><option>Active</option><option>Draft</option></select></label></div></div>
        <div className="form-section"><div className="form-section-title"><span>02</span><div><strong>{kind === 'customers' ? 'Demand & service' : 'Operating constraints'}</strong><small>Hard constraints used by the solver</small></div></div><div className="form-grid"><label><span>{kind === 'customers' ? 'Demand (units) *' : 'Capacity (units) *'}</span><input required type="number" placeholder="24" /></label><label><span>{kind === 'customers' ? 'Service time (min) *' : 'Reload time (min)'}</span><input required type="number" placeholder="15" /></label><label><span>Window start *</span><input required type="time" defaultValue="08:00" /></label><label><span>Window end *</span><input required type="time" defaultValue="17:00" /></label></div></div>
        {(kind === 'customers' || kind === 'depots') && <div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Location</strong><small>WGS84 coordinates are canonical</small></div></div><div className="form-grid"><label className="form-span-2"><span>Address label</span><input placeholder="Street, city" /></label><label><span>Longitude *</span><input required type="number" step="any" placeholder="13.4050" /></label><label><span>Latitude *</span><input required type="number" step="any" placeholder="52.5200" /></label></div></div>}
        <footer><span><ShieldCheck size={15} /> Backend validation runs again on save</span><div><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Check size={16} /> Add {label}</button></div></footer>
      </form>
    </div>
  );
}

type ScenarioSource = 'templates' | 'upload';

const REQUIRED_SHEETS = [
  { label: 'Scenario', icon: Settings2 },
  { label: 'Depots', icon: Warehouse },
  { label: 'Customers', icon: UsersRound },
  { label: 'Vehicle Types', icon: Truck },
  { label: 'Vehicles', icon: Truck },
  { label: 'Objective & Solver', icon: Gauge },
];

function ScenarioDialog({ initialSource, onClose, onImported }: {
  initialSource: ScenarioSource;
  onClose: () => void;
  onImported: (report: ValidationResponse, filename: string) => void;
}) {
  const [source, setSource] = useState<ScenarioSource>(initialSource);
  const templatesQuery = useQuery({ queryKey: ['vrp-templates'], queryFn: listTemplates, staleTime: Infinity });
  const templates = templatesQuery.data || [];
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !working) onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, working]);

  const chooseFile = (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    setError(null);
  };

  const confirm = async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      if (source === 'templates') {
        if (!selectedTemplate) return;
        onImported(await importTemplate(selectedTemplate.id), selectedTemplate.filename);
      } else {
        if (!file) return;
        onImported(await importScenarioFile(file), file.name);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Scenario import failed');
    } finally {
      setWorking(false);
    }
  };

  const download = async (template: ScenarioTemplate) => {
    try {
      await downloadTemplate(template);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Template download failed');
    }
  };

  const canConfirm = !working && (source === 'templates' ? Boolean(selectedTemplate) : Boolean(file));

  return (
    <div className="modal-layer modal-layer-top" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) onClose(); }}>
      <div className="import-dialog scenario-dialog" role="dialog" aria-modal="true" aria-labelledby="scenario-dialog-title">
        <header>
          <div>
            <span className="entity-dialog-icon"><FileSpreadsheet size={20} /></span>
            <span><h2 id="scenario-dialog-title">Choose scenario</h2><small>Start from an Operartis template or upload your own workbook.</small></span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={working} aria-label="Close dialog"><X size={18} /></button>
        </header>

        <div className="scenario-source-tabs" role="tablist" aria-label="Scenario source">
          <button type="button" role="tab" aria-selected={source === 'templates'} className={source === 'templates' ? 'is-active' : ''} onClick={() => { setSource('templates'); setError(null); }}><LayoutTemplate size={15} /> Operartis templates</button>
          <button type="button" role="tab" aria-selected={source === 'upload'} className={source === 'upload' ? 'is-active' : ''} onClick={() => { setSource('upload'); setError(null); }}><Upload size={15} /> Upload your own file</button>
        </div>

        {source === 'templates' ? (
          <div className="scenario-dialog-body">
            <p className="scenario-dialog-hint">Sample scenarios for demos and quick testing. Download one to use its layout for your own data.</p>
            {templatesQuery.isLoading && <div className="scenario-template-status" role="status"><LoaderCircle className="spin" size={18} /> Loading templates…</div>}
            {templatesQuery.isError && <p className="import-error" role="alert"><AlertTriangle size={16} /> {templatesQuery.error instanceof Error ? templatesQuery.error.message : 'Templates could not be loaded'}</p>}
            <div className="scenario-template-list" role="radiogroup" aria-label="Operartis templates">
              {templates.map((template) => {
                const selected = selectedTemplate?.id === template.id;
                return (
                  <div key={template.id} className={`scenario-template-card ${selected ? 'is-selected' : ''}`}>
                    <button type="button" role="radio" aria-checked={selected} className="scenario-template-select" onClick={() => setSelectedTemplateId(template.id)}>
                      <span className="scenario-template-title"><strong>{template.name}</strong><small><MapPin size={12} /> {template.location}</small></span>
                      <span className="scenario-template-counts">
                        <span><b>{template.counts.depots}</b> depots</span>
                        <span><b>{template.counts.customers}</b> customers</span>
                        <span><b>{template.counts.vehicles}</b> vehicles</span>
                      </span>
                      <span className="scenario-template-meta">{template.vehicle_types.join(' · ')} · {template.currency}</span>
                    </button>
                    <button type="button" className="scenario-template-download" onClick={() => void download(template)} title={`Download ${template.filename}`} aria-label={`Download ${template.name} template`}><Download size={15} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="scenario-dialog-body">
            <label
              className={`drop-zone ${file ? 'has-file' : ''} ${dragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
            >
              <input type="file" accept=".xlsx,.json" onChange={(event) => chooseFile(event.target.files?.[0])} />
              {file
                ? <><CheckCircle2 size={30} /><strong>{file.name}</strong><span>Ready to validate · click to choose another file</span></>
                : <><CloudUpload size={32} /><strong>Drop a workbook here</strong><span>or click to browse · XLSX or JSON</span></>}
            </label>
            <div className="import-structure">
              <span className="eyebrow">Required workbook sheets</span>
              <div>{REQUIRED_SHEETS.map(({ label, icon: Icon }) => <span key={label}><Icon size={16} /> {label}</span>)}</div>
            </div>
            <p className="scenario-dialog-hint">Not sure about the layout? Download a template from <button type="button" className="text-link" onClick={() => setSource('templates')}>Operartis templates</button>.</p>
          </div>
        )}

        {error && <p className="import-error" role="alert"><AlertTriangle size={16} /> {error}</p>}

        <footer>
          <span className="scenario-dialog-note">Your current scenario changes only when you confirm.</span>
          <button className="button button-quiet" type="button" onClick={onClose} disabled={working}>Cancel</button>
          <button className="button button-primary" type="button" onClick={() => void confirm()} disabled={!canConfirm}>
            {working ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
            {working ? 'Validating' : source === 'templates' ? 'Use template' : 'Validate & import'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function singular(kind: DataKind) {
  return kind === 'depots' ? 'depot' : kind === 'customers' ? 'customer' : kind === 'vehicleTypes' ? 'vehicle type' : 'vehicle';
}

function getDataRows(kind: DataKind, viewData: VrpViewData): Array<Record<string, string>> {
  if (kind === 'depots') return viewData.depots.map((item) => ({ ID: item.id, Name: item.name, 'Operating window': item.window, Reload: `${item.reloadMinutes} min`, Fleet: String(item.vehicles), Coordinates: `${item.coordinate[1].toFixed(4)}, ${item.coordinate[0].toFixed(4)}` }));
  if (kind === 'customers') return viewData.customers.map((item) => ({ ID: item.id, Customer: item.name, 'Allowed Depot': 'Unassigned', Demand: String(item.demand), 'Time window': item.timeWindow, Service: `${item.serviceMinutes} min`, Route: item.routeId || 'Unassigned' }));
  if (kind === 'vehicleTypes') return viewData.vehicleTypes.map((item) => ({ ID: item.id, Type: item.name, Capacity: String(item.capacity), 'Fixed cost': String(item.fixedCost), 'Distance cost': String(item.distanceCost), Profile: item.profile }));
  return viewData.vehicles.map((item) => ({ ID: item.id, Plate: item.plate, Type: item.typeId, 'Home depot': item.depotId, Shift: item.shift, Trips: String(item.trips), Utilization: `${item.utilization}%` }));
}

export default App;

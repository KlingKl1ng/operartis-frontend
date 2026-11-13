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
  FolderOpen,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { attachVersionPlan, cancelJob, downloadJobExport, downloadTemplate, importScenarioFile, importTemplate, listSavedScenarios, listTemplates, saveNewScenario, saveScenarioVersion, submitSolve, validateScenario, waitForJob } from './api';
import { CurrentScenarioStrip, SAVED_SCENARIOS_QUERY_KEY, ScenarioLibraryPane, type CurrentScenarioSave, type OpenSavedScenario } from './ScenarioLibrary';
import type { Customer, DataKind, Depot, InspectorTab, OpenedScenarioVersion, Route, SaveScenarioResult, ScenarioTemplate, Trip, TripVisit, ValidationItem, ValidationResponse, Vehicle, VehicleType, VrpScenario, VrpSolution, VrpViewData } from './types';
import { buildViewData } from './view-model';
import { applyTableEdits, isEditableColumn, rowEditErrors } from './scenario-edits';
import { SettingsModal } from './SettingsModal';
import operartisLogo from '../../icononly_transparent_quadratic.png';
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
  // Follow OS light/dark changes live, so 'system' also switches the map style.
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

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
  const [scenarioDialog, setScenarioDialog] = useState<ScenarioSource | null>(null);
  const queryClient = useQueryClient();
  const [savedScenario, setSavedScenario] = useState<OpenSavedScenario | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [solvedSnapshot, setSolvedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const [solvedAt, setSolvedAt] = useState<Date | null>(null);
  const [toastState, setToastState] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const setToast = useCallback((message: string | null) => setToastState(message ? { message, tone: 'success' } : null), []);
  const showErrorToast = useCallback((message: string) => setToastState({ message, tone: 'error' }), []);
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
  const issueCount = viewData.validationItems.filter(isIssue).length;
  const runtimeValue = useMemo<VrpRuntimeContextValue>(() => ({ scenario, solution, validation, viewData }), [scenario, solution, validation, viewData]);

  useEffect(() => {
    if (!toastState) return;
    const timer = window.setTimeout(() => setToastState(null), toastState.tone === 'error' ? 6000 : 3600);
    return () => window.clearTimeout(timer);
  }, [toastState]);

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
    setInspectorTab('routes');
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
    setInspectorTab('summary');
    setOptimizationStage(checked.valid ? 'Scenario validated' : 'Input corrections required');
    setProgress(0);
    setToast(checked.valid
      ? `${checked.counts.customers || imported.customers.length} customers imported and validated`
      : `Import completed with ${checked.errors.length} blocking error${checked.errors.length === 1 ? '' : 's'}`);
  }, []);

  const handleScenarioChosen = useCallback((report: ValidationResponse, filename: string) => {
    handleImported(report);
    setImportedFilename(filename);
    setSavedScenario(null);
    setSavedSnapshot(null);
    setSolvedSnapshot(null);
    setScenarioDialog(null);
  }, [handleImported]);

  const handleSavedScenarioOpened = useCallback((opened: OpenedScenarioVersion) => {
    handleImported(opened.report);
    setImportedFilename(opened.scenario.source_filename || opened.scenario.name);
    setSavedScenario({ id: opened.scenario.id, name: opened.scenario.name, versionId: opened.version.id, versionNumber: opened.version.version_number });
    const snapshot = JSON.stringify(opened.report.normalized_scenario);
    setSavedSnapshot(snapshot);
    setScenarioDialog(null);
    if (opened.plan && opened.report.valid) {
      setSolution(opened.plan.solution);
      setCompletedJobId(opened.plan.job_id);
      setSolvedAt(new Date(opened.plan.created_at));
      setSolvedSnapshot(snapshot);
      setProgress(100);
      setOptimizationStage('Saved plan');
      setInspectorTab('summary');
      setToast(`Opened ${opened.scenario.name} · version ${opened.version.version_number} with its saved plan`);
    } else {
      setSolvedSnapshot(null);
      setToast(`Opened ${opened.scenario.name} · version ${opened.version.version_number}`);
    }
  }, [handleImported, setToast]);

  // Deleting the open scenario keeps its data on screen, but it is no longer saved.
  const handleSavedScenarioDeleted = useCallback((scenarioId: string) => {
    if (savedScenario?.id !== scenarioId) return;
    setSavedScenario(null);
    setSavedSnapshot(null);
  }, [savedScenario]);

  const attachPlan = useCallback(async (scenarioId: string, versionId: string, versionNumber: number, jobId: string) => {
    try {
      const attached = await attachVersionPlan(scenarioId, versionId, jobId);
      void queryClient.invalidateQueries({ queryKey: SAVED_SCENARIOS_QUERY_KEY });
      return attached.plan.id;
    } catch (error) {
      showErrorToast(`The plan could not be saved with version ${versionNumber}: ${error instanceof Error ? error.message : 'request failed'}`);
      return null;
    }
  }, [queryClient, showErrorToast]);

  const applySaveResult = (result: SaveScenarioResult, saved: VrpScenario) => {
    setSavedScenario({ id: result.scenario.id, name: result.scenario.name, versionId: result.version.id, versionNumber: result.version.version_number });
    setSavedSnapshot(JSON.stringify(saved));
    void queryClient.invalidateQueries({ queryKey: SAVED_SCENARIOS_QUERY_KEY });
  };

  // A plan belongs to a version only if it was solved from exactly that version's data.
  const attachCurrentPlan = async (result: SaveScenarioResult, saved: VrpScenario) => {
    if (!solution?.verification.passed || !completedJobId || solvedSnapshot !== JSON.stringify(saved)) return false;
    return (await attachPlan(result.scenario.id, result.version.id, result.version.version_number, completedJobId)) !== null;
  };

  const handleSaveVersion = async () => {
    if (!scenario || !savedScenario || saving || optimizing) return;
    const snapshot = scenario;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveScenarioVersion(savedScenario.id, snapshot);
      applySaveResult(result, snapshot);
      const planSaved = await attachCurrentPlan(result, snapshot);
      setToast(result.created
        ? `Saved ${result.scenario.name} · version ${result.version.version_number}${planSaved ? ' with its plan' : ''}`
        : `No changes since version ${result.version.version_number}${planSaved ? ' · plan saved' : ''}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The scenario could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNew = async (name: string) => {
    if (!scenario || saving || optimizing) return;
    const snapshot = scenario;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveNewScenario(name, snapshot, importedFilename);
      applySaveResult(result, snapshot);
      const planSaved = await attachCurrentPlan(result, snapshot);
      setToast(`Saved ${result.scenario.name} · version 1${planSaved ? ' with its plan' : ''}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The scenario could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const plannedCustomers = useMemo(() => viewData.customers.filter((customer) => customer.enabled !== false), [viewData.customers]);
  const hasUnsavedChanges = Boolean(scenario && savedScenario && savedSnapshot !== JSON.stringify(scenario));
  const saveState = !savedScenario ? 'Not saved' : hasUnsavedChanges ? `Version ${savedScenario.versionNumber} · unsaved changes` : `Saved · version ${savedScenario.versionNumber}`;
  const scenarioDisplayName = savedScenario?.name || scenario?.name || importedFilename || 'Scenario';
  const planningDateLabel = scenario ? new Date(`${scenario.planning_date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '';
  const scenarioJson = useMemo(() => scenario ? JSON.stringify(scenario) : null, [scenario]);
  const blockingErrors = validation && !validation.valid ? validation.errors.length : 0;
  const planStatus: { tone: 'running' | 'ok' | 'warning' | 'error' | 'idle'; text: string } = optimizing
    ? { tone: 'running', text: optimizationStage }
    : blockingErrors
      ? { tone: 'error', text: `Fix ${blockingErrors} blocking error${blockingErrors === 1 ? '' : 's'} first` }
      : solution
        ? solution.verification.passed
          ? { tone: 'ok', text: `Plan up to date${solvedAt ? ` · solved ${solvedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}` }
          : { tone: 'error', text: 'Plan failed verification' }
        : solvedSnapshot && solvedSnapshot !== scenarioJson
          ? { tone: 'warning', text: 'Data changed · optimize again' }
          : { tone: 'idle', text: 'No plan yet' };
  const optimizeLabel = solution ? 'Re-optimize' : 'Optimize plan';
  const savedScenariosQuery = useQuery({ queryKey: SAVED_SCENARIOS_QUERY_KEY, queryFn: listSavedScenarios });
  // Start in My scenarios once there is something saved there; otherwise templates are the useful first step.
  const chooseScenarioSource: ScenarioSource = savedScenariosQuery.data?.scenarios.length ? 'library' : 'templates';

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
        setInspectorTab('summary');
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
      setSolvedAt(new Date());
      const solvedJson = JSON.stringify(report.normalized_scenario);
      setSolvedSnapshot(solvedJson);
      if (result.verification.passed && savedScenario && savedSnapshot === solvedJson) {
        void attachPlan(savedScenario.id, savedScenario.versionId, savedScenario.versionNumber, accepted.job_id);
      }
      setProgress(100);
      setOptimizationStage(result.verification.passed ? 'Verified plan' : 'Verification failed');
      setInspectorTab('summary');
      setSelectedRouteId(null);
      setToast(`${result.verification.passed ? 'Verified' : 'Completed'} route plan generated · ${result.summary.customers_served} customers served`);
      window.OperartisApi?.broadcastDashboardDataChanged('vrp');
    } catch (error) {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) {
        showErrorToast(error instanceof Error ? error.message : 'Optimization failed');
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
    setImportedFilename(null);
    setSavedScenario(null);
    setSavedSnapshot(null);
    setSolvedSnapshot(null);
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
      showErrorToast(error instanceof Error ? error.message : 'Export failed');
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
                <div className={`sidebar-file-card ${scenario ? validation?.valid ? 'is-ready' : 'needs-review' : ''}`}>
                  {scenario ? (
                    <div className="sidebar-file-selected">
                      <button className="sidebar-file-name" type="button" title={`${importedFilename ? `${importedFilename} · ` : ''}open My scenarios`} onClick={() => setScenarioDialog('library')} disabled={optimizing}>{scenarioDisplayName}</button>
                      <span className={`sidebar-file-status ${validation?.valid ? '' : 'is-warning'}`}>{validation?.valid ? 'Validated' : 'Action required'}</span>
                      <span className={`sidebar-file-meta ${hasUnsavedChanges ? 'has-changes' : ''}`}>{saveState} · {planningDateLabel}</span>
                      <div className="sidebar-file-actions">
                        <button type="button" title="My scenarios" aria-label="Open My scenarios" onClick={() => setScenarioDialog('library')} disabled={optimizing}><FolderOpen size={14} /></button>
                        <button type="button" title="Upload another file" aria-label="Upload another file" onClick={() => setScenarioDialog('upload')} disabled={optimizing}><Upload size={14} /></button>
                        <button type="button" title="Review scenario data" aria-label="Review scenario data" onClick={() => setDataManager('customers')}><Table2 size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <button className="sidebar-file-empty" type="button" onClick={() => setScenarioDialog(chooseScenarioSource)} disabled={optimizing} aria-label="Choose scenario data">
                      <Upload size={32} /><span>Choose Data</span>
                    </button>
                  )}
                </div>
              </div>

              {scenario && <>
              <div className="sidebar-heading">
                <span className="sidebar-section-label">Scenario data</span>
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
            </div>

            {scenario && (
              <div className="sidebar-run">
                <div className={`sidebar-run-status is-${planStatus.tone}`} role="status" aria-live="polite">
                  <i aria-hidden="true" />
                  <span>{planStatus.text}</span>
                </div>
                <div className="sidebar-run-buttons">
                  <button className="sidebar-run-primary" type="button" onClick={runOptimization} disabled={optimizing} title={optimizing ? optimizationStage : optimizeLabel} aria-label={optimizing ? `Optimizing, ${progress}%` : optimizeLabel}>
                    {optimizing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                    <span>{optimizing ? `Optimizing · ${progress}%` : optimizeLabel}</span>
                  </button>
                </div>
              </div>
            )}

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
            </div>

            <div className="module-identity module-title">
              <strong>Vehicle Routing</strong>
            </div>

            <div className="header-actions">
              <OperartisAuthTopbarSlot />
            </div>
          </header>

          <main className={`planning-workspace ${scenario ? '' : 'is-empty'}`}>
          <section className="map-workspace">
            {scenario ? <Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={22} /><span>Loading route map</span></div>}>
              <MapView customers={plannedCustomers} depots={mapDepots} routes={viewData.routes} selectedRouteId={selectedRouteId} onSelectRoute={handleSelectRoute} onSelectCustomer={handleSelectCustomer} dark={dark} fitRequest={mapFitRequest} />
            </Suspense> : (
              <div className="vrp-empty-state" aria-hidden="true">
                <img src={operartisWatermark} alt="" width="420" height="117" className="vrp-empty-watermark" />
              </div>
            )}

            {scenario && <>
            <div className="map-toolbar glass-panel">
              <button className="toolbar-back" type="button" onClick={() => { setSelectedRouteId(null); setSelectedCustomerId(null); setMapFitRequest((value) => value + 1); }} title="Show all routes" aria-label="Show all routes"><ArrowLeft size={16} /></button>
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
              <SolutionMenu canExport={Boolean(completedJobId) && !optimizing} onExport={(format) => void handleExport(format)} onReset={handleReset} />
            </div>

            <div className="segmented-tabs" role="tablist" aria-label="Solution views">
              {inspectorTabs.map((tab) => (
                <button key={tab.id} className={inspectorTab === tab.id ? 'is-active' : ''} type="button" onClick={() => setInspectorTab(tab.id)} role="tab" aria-selected={inspectorTab === tab.id}>
                  {tab.label}
                  {tab.id === 'summary' && issueCount > 0 && <span className="tab-count" aria-label={`${issueCount} issue${issueCount === 1 ? '' : 's'}`}>{issueCount}</span>}
                </button>
              ))}
            </div>

            <div className="inspector-content scroller">
              {inspectorTab === 'summary' && (
                <SummaryPanel onOpenCustomer={handleSelectCustomer} />
              )}
              {inspectorTab === 'routes' && (
                <RoutesPanel selectedRouteId={selectedRouteId} selectedCustomerId={selectedCustomerId} onSelectRoute={handleSelectRoute} onSelectCustomer={handleSelectCustomer} onClearCustomer={() => setSelectedCustomerId(null)} />
              )}
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
          onApply={async (selection, choices, original, edited) => {
            if (!scenario || optimizing) throw new Error('Wait for optimization to finish before changing scenario data.');
            const selected = selection.depots;
            if (!selected.length) throw new Error('Select at least one depot.');
            const withEdits = applyTableEdits(scenario, original, edited);
            const plannedIds = new Set(selection.customers);
            const enabledVehicleIds = new Set(selection.vehicles);
            const vehicles = withEdits.vehicles.map(vehicle => vehicle.enabled === enabledVehicleIds.has(vehicle.id) ? vehicle : { ...vehicle, enabled: enabledVehicleIds.has(vehicle.id) });
            const customers = withEdits.customers.map(customer => {
              const choice = choices[customer.id];
              const allowed = choice === 'Unassigned' ? selected : choice.split(',').map(id => id.trim());
              if (!allowed.length || allowed.some(id => !selected.includes(id))) throw new Error(`${customer.id}: choose an available Allowed Depot or Unassigned.`);
              const { enabled: _enabled, ...rest } = customer;
              return { ...rest, compatible_depot_ids: choice === 'Unassigned' && selected.length === scenario.depots.length ? null : allowed, ...(plannedIds.has(customer.id) ? {} : { enabled: false }) };
            });
            const candidate = { ...withEdits, customers, vehicles };
            setEnabledDepotIds(selected);
            setAllowedDepotChoices(choices);
            if (JSON.stringify(candidate) === JSON.stringify(scenario)) return;
            const report = await validateScenario(candidate);
            if (!report.valid) throw new Error(report.errors.map(issue => `${issue.entity_id || 'Scenario'}: ${issue.message}`).join(' · '));
            setScenario(report.normalized_scenario);
            setValidation(report);
            setSolution(null);
            setCompletedJobId(null);
            setSelectedRouteId(null);
            setSelectedCustomerId(null);
            setInspectorTab('summary');
            setToast('Scenario data updated. Optimize again to calculate routes.');
          }} onClose={() => setDataManager(null)} onToast={setToast} />
      )}
      {scenarioDialog && <ScenarioDialog initialSource={scenarioDialog} current={savedScenario} save={scenario ? { defaultName: scenario.name, saved: savedScenario, hasUnsavedChanges, saving, error: saveError, onSaveVersion: () => void handleSaveVersion(), onSaveNew: (name) => void handleSaveAsNew(name) } : null} onClose={() => { setScenarioDialog(null); setSaveError(null); }} onImported={handleScenarioChosen} onOpened={handleSavedScenarioOpened} onRenamed={(id, name) => setSavedScenario((value) => value && value.id === id ? { ...value, name } : value)} onDeleted={handleSavedScenarioDeleted} />}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />

      {toastState && (
        <div className={`toast ${toastState.tone === 'error' ? 'is-error' : ''}`} role={toastState.tone === 'error' ? 'alert' : 'status'}>
          <span>{toastState.tone === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
          <div><strong>{toastState.tone === 'error' ? 'Something went wrong' : 'Success'}</strong><p>{toastState.message}</p></div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button>
        </div>
      )}
    </div>
    </VrpRuntimeContext.Provider>
  );
}

function SolutionMenu({ canExport, onExport, onReset }: { canExport: boolean; onExport: (format: 'xlsx' | 'json' | 'geojson') => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setConfirmReset(false); };
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => { setOpen(false); setConfirmReset(false); action(); };

  return (
    <div className="solution-menu" ref={rootRef}>
      <button className="icon-button" type="button" aria-label="Solution actions" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((value) => !value); setConfirmReset(false); }}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="solution-menu-panel" role="menu">
          <button type="button" role="menuitem" disabled={!canExport} onClick={() => choose(() => onExport('xlsx'))}>
            <Download size={15} aria-hidden="true" /> Export as Excel
          </button>
          <button type="button" role="menuitem" disabled={!canExport} onClick={() => choose(() => onExport('json'))}>
            <Download size={15} aria-hidden="true" /> Export as JSON
          </button>
          <button type="button" role="menuitem" disabled={!canExport} onClick={() => choose(() => onExport('geojson'))}>
            <Download size={15} aria-hidden="true" /> Export as GeoJSON
          </button>
          <hr />
          {confirmReset ? (
            <button type="button" role="menuitem" className="is-danger is-confirm" onClick={() => choose(onReset)} autoFocus>
              <Trash2 size={15} aria-hidden="true" /> Confirm reset
            </button>
          ) : (
            <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirmReset(true)}>
              <Trash2 size={15} aria-hidden="true" /> Reset scenario
            </button>
          )}
          {confirmReset && <p className="solution-menu-note">Clears the data and plan on screen. Saved versions are kept.</p>}
        </div>
      )}
    </div>
  );
}

function SummaryPanel({ onOpenCustomer }: { onOpenCustomer: (customerId: string) => void }) {
  const { scenario, solution } = useVrpRuntime();
  const summary = solution?.summary;
  const excludedCount = scenario.customers.filter((customer) => customer.enabled === false).length;
  const plannedCount = scenario.customers.length - excludedCount;
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

  return (
    <div className="inspector-stack">
      <PlanCheckCard onOpenCustomer={onOpenCustomer} />
      <div className="metric-grid">
        <MetricCard icon={MapPin} label="Customers" value={`${summary?.customers_served || 0} / ${plannedCount}`} meta={solution ? `${Math.round(((summary?.customers_served || 0) / Math.max(plannedCount, 1)) * 100)}% served${excludedCount ? ` · ${excludedCount} excluded` : ''}` : excludedCount ? `${excludedCount} excluded · awaiting solution` : 'Awaiting solution'} accent="emerald" />
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

      <div className="inspector-card coverage-card">
        <div className="card-heading"><span><Warehouse size={17} /> Depot workload</span></div>
        <div className="depot-workload">{depotWorkload.map((item) => <span key={item.depot.id}><b>{item.depot.id}</b><i><em style={{ width: `${item.stops / maximumStops * 100}%` }} /></i><small>{item.stops} stops · {item.vehicles} vehicles</small></span>)}</div>
      </div>

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

type CustomerPlanStatus =
  | { kind: 'planned'; route: Route | undefined; trip: Trip; visit: TripVisit; stopNumber: number }
  | { kind: 'excluded' }
  | { kind: 'unserved'; reason: string }
  | { kind: 'pending' };

/** Where a customer ended up in the current plan. */
function customerPlanStatus(customerId: string, scenario: VrpScenario, solution: VrpSolution | null, viewData: VrpViewData): CustomerPlanStatus {
  if (scenario.customers.find((item) => item.id === customerId)?.enabled === false) return { kind: 'excluded' };
  for (const trip of viewData.trips) {
    const index = trip.visits.findIndex((visit) => visit.customerId === customerId);
    if (index >= 0) {
      const route = viewData.routes.find((item) => item.vehicleId === trip.vehicleId);
      // Stops are numbered across the whole route, matching the map and timeline.
      const earlierStops = viewData.trips.filter((item) => item.vehicleId === trip.vehicleId && item.startMinute < trip.startMinute).reduce((total, item) => total + item.visits.length, 0);
      return { kind: 'planned', route, trip, visit: trip.visits[index], stopNumber: earlierStops + index + 1 };
    }
  }
  const unserved = solution?.unserved.find((item) => item.customer_id === customerId);
  if (unserved) return { kind: 'unserved', reason: unserved.reason_code.replaceAll('_', ' ') };
  return { kind: 'pending' };
}

function RoutesPanel({ selectedRouteId, selectedCustomerId, onSelectRoute, onSelectCustomer, onClearCustomer }: {
  selectedRouteId: string | null;
  selectedCustomerId: string | null;
  onSelectRoute: (routeId: string | null) => void;
  onSelectCustomer: (customerId: string) => void;
  onClearCustomer: () => void;
}) {
  const { scenario, solution, viewData } = useVrpRuntime();
  const { routes, vehicles, trips, customers } = viewData;
  const [query, setQuery] = useState('');
  const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: scenario.currency, maximumFractionDigits: 0 });
  const tripCount = routes.reduce((total, route) => total + route.trips, 0);
  const stopCount = routes.reduce((total, route) => total + route.stops, 0);
  const needle = query.trim().toLowerCase();
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const customerMatches = (customerId: string) => Boolean(needle) && (customerId.toLowerCase().includes(needle) || Boolean(customerById.get(customerId)?.name.toLowerCase().includes(needle)));
  const visibleRoutes = routes.flatMap((route) => {
    const vehicle = vehicles.find((item) => item.id === route.vehicleId);
    const routeTrips = trips.filter((trip) => trip.vehicleId === route.vehicleId);
    const matchedStops = new Set(routeTrips.flatMap((trip) => trip.customerIds.filter(customerMatches)));
    const routeMatches = !needle || [route.id, route.label, route.vehicleId, vehicle?.plate || ''].some((value) => value.toLowerCase().includes(needle));
    return routeMatches || matchedStops.size ? [{ route, vehicle, routeTrips, matchedStops }] : [];
  });
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Bring the first matching stop into view; it can sit far down an expanded route.
    if (!needle) return;
    listRef.current?.querySelector('.route-stop.is-match, .route-off-plan')?.scrollIntoView({ block: 'nearest' });
  }, [needle]);
  useEffect(() => {
    // A customer picked on the map can sit on any route; bring its stop (or card) into view.
    if (!selectedCustomerId) return;
    const target = listRef.current?.querySelector('.route-stop.is-selected, .route-customer-card');
    // Scroll the whole stop, details included, not just its button.
    (target?.closest('li') || target)?.scrollIntoView({ block: 'nearest' });
  }, [selectedCustomerId]);
  const selectedOffRoute = selectedCustomerId && !trips.some((trip) => trip.customerIds.includes(selectedCustomerId))
    ? customerById.get(selectedCustomerId) || null
    : null;
  // Customers the search finds that are not on any route: excluded, not served, or not planned yet.
  const offRouteMatches = needle ? customers.filter((customer) => customerMatches(customer.id) && !trips.some((trip) => trip.customerIds.includes(customer.id))) : [];

  return (
    <div className="route-list" ref={listRef}>
      <div className="route-list-tools">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find route, vehicle or customer" aria-label="Find route, vehicle or customer" /></label>
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
      </div>
      {selectedOffRoute && <OffRouteCustomerCard customer={selectedOffRoute} onClose={onClearCustomer} />}
      {!needle && routes.length > 0 && (
        <button className={`route-card route-card-all ${selectedRouteId === null ? 'is-selected' : ''}`} type="button" onClick={() => onSelectRoute(null)}>
          <span className="route-overview-icon"><LayoutDashboard size={18} /></span>
          <span><strong>All vehicle routes</strong><small>{routes.length} vehicles · {tripCount} trips · {stopCount} stops</small></span>
        </button>
      )}
      {visibleRoutes.map(({ route, vehicle, routeTrips, matchedStops }) => {
        const expanded = selectedRouteId === route.id || matchedStops.size > 0
          || Boolean(selectedCustomerId && routeTrips.some((trip) => trip.customerIds.includes(selectedCustomerId)));
        return (
          <div key={route.id} className={`route-item ${expanded ? 'is-expanded' : ''}`} style={{ '--route-color': route.color } as CSSProperties}>
            <button className={`route-card ${selectedRouteId === route.id ? 'is-selected' : ''}`} type="button" aria-expanded={expanded} onClick={() => onSelectRoute(selectedRouteId === route.id ? null : route.id)}>
              <span className="route-number"><i />{route.id.replace('R-', '')}</span>
              <span className="route-card-copy"><strong>{vehicle?.plate || route.vehicleId}</strong><small>{route.label}{expanded ? '' : ` · ${route.trips} ${route.trips === 1 ? 'trip' : 'trips'}`}</small>{!expanded && <em>{route.stops} stops · {route.distanceKm.toFixed(1)} km · {route.duration}</em>}</span>
              <span className="route-cost">{currency.format(route.cost)}<ChevronDown size={15} className="route-chevron" /></span>
            </button>
            {expanded && (
              <div className="route-stops">
                <div className="route-kpis route-item-kpis">
                  <span><strong>{route.stops}</strong><small>stops</small></span>
                  <span><strong>{route.distanceKm.toFixed(1)} km</strong><small>distance</small></span>
                  <span><strong>{route.duration}</strong><small>duration</small></span>
                  <span><strong>{route.trips}</strong><small>{route.trips === 1 ? 'trip' : 'trips'}</small></span>
                </div>
                {routeTrips.map((trip) => (
                  <section key={trip.id} className="route-trip" aria-label={`${trip.label} of ${vehicle?.plate || route.vehicleId}`}>
                    <div className="route-trip-head">
                      <strong>{trip.label}</strong>
                      <span>{trip.depotId} · {trip.start}–{trip.end} · {trip.load}/{trip.capacity} {scenario.demand_unit}</span>
                    </div>
                    <ol>
                      {trip.visits.map((visit, index) => {
                        const customer = customerById.get(visit.customerId);
                        const selected = selectedCustomerId === visit.customerId;
                        return (
                          <li key={visit.customerId}>
                            <button type="button" className={`route-stop ${matchedStops.has(visit.customerId) ? 'is-match' : ''} ${selected ? 'is-selected' : ''}`} aria-expanded={selected} onClick={() => (selected ? onClearCustomer() : onSelectCustomer(visit.customerId))}>
                              <span className="route-stop-number">{customer?.sequence || index + 1}</span>
                              <span className="route-stop-copy">
                                <strong>{customer?.name || visit.customerId}</strong>
                                <small>{visit.customerId} · arrives {visit.arrival}{visit.waitingMinutes ? ` · waits ${visit.waitingMinutes} min` : ''}</small>
                              </span>
                              <span className="route-stop-load">{visit.delivered}</span>
                            </button>
                            {selected && (
                              <dl className="route-stop-detail">
                                <div><dt>Time window</dt><dd>{customer?.timeWindow || '—'}</dd></div>
                                <div><dt>Arrival</dt><dd>{visit.arrival}</dd></div>
                                <div><dt>Departure</dt><dd>{visit.departure}</dd></div>
                                <div><dt>Demand</dt><dd>{customer?.demand ?? visit.delivered} {scenario.demand_unit}</dd></div>
                                <div><dt>Service</dt><dd>{customer?.serviceMinutes ?? 0} min</dd></div>
                                <div><dt>Waiting</dt><dd>{visit.waitingMinutes ? `${visit.waitingMinutes} min` : 'None'}</dd></div>
                              </dl>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {offRouteMatches.map((customer) => {
        const status = customerPlanStatus(customer.id, scenario, solution, viewData);
        return (
          <button key={customer.id} type="button" className="route-off-plan" onClick={() => onSelectCustomer(customer.id)}>
            <span className="route-stop-copy"><strong>{customer.name}</strong><small>{customer.id}</small></span>
            <span className={`route-off-plan-status is-${status.kind}`}>{status.kind === 'excluded' ? 'Excluded from plan' : status.kind === 'unserved' ? 'Not served' : 'Not planned yet'}</span>
          </button>
        );
      })}
      {needle && !visibleRoutes.length && !offRouteMatches.length && <div className="inspector-card inspector-empty"><strong>No matches</strong><p>No route, vehicle or customer matches “{query.trim()}”.</p></div>}
      {!routes.length && !needle && <div className="inspector-card inspector-empty"><strong>No solved routes yet</strong><p>Run Optimize plan to create routes.</p></div>}
    </div>
  );
}

/** A selected customer that is on no route: excluded, not served, or waiting for a plan. */
function OffRouteCustomerCard({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { scenario, solution, viewData } = useVrpRuntime();
  const status = customerPlanStatus(customer.id, scenario, solution, viewData);
  const allowedDepots = scenario.customers.find((item) => item.id === customer.id)?.compatible_depot_ids?.join(', ') || 'Any selected';
  return (
    <div className="selection-card route-customer-card">
      <div className="selection-card-head">
        <span className="selection-icon"><MapPin size={20} /></span>
        <div><small>Selected customer</small><strong>{customer.name}</strong><span>{customer.id}</span></div>
        <button className="icon-button selection-card-close" type="button" onClick={onClose} aria-label="Close customer details"><X size={16} /></button>
      </div>
      <dl className="detail-list">
        <div><dt>Time window</dt><dd>{customer.timeWindow}</dd></div>
        <div><dt>Demand</dt><dd>{customer.demand} {scenario.demand_unit}</dd></div>
        <div><dt>Service</dt><dd>{customer.serviceMinutes} min</dd></div>
        <div><dt>Allowed depot</dt><dd>{allowedDepots}</dd></div>
      </dl>
      {status.kind === 'excluded' && <div className="feasible-banner is-neutral"><Info size={16} /> Excluded from plan · tick it in Customers to plan it</div>}
      {status.kind === 'unserved' && <div className="feasible-banner is-warning"><AlertTriangle size={16} /> Not served · {status.reason}</div>}
      {status.kind === 'pending' && <div className="feasible-banner is-neutral"><Info size={16} /> Awaiting optimization</div>}
    </div>
  );
}

function isIssue(item: ValidationItem): boolean {
  return item.level === 'error' || item.level === 'warning';
}

/**
 * Result of the backend checks: scenario validation before Optimize, the
 * independent verifier after. One line when everything passes; the issues,
 * errors first, when something needs attention.
 */
function PlanCheckCard({ onOpenCustomer }: { onOpenCustomer: (customerId: string) => void }) {
  const { scenario, solution, validation, viewData } = useVrpRuntime();
  const issues = viewData.validationItems.filter(isIssue).sort((left, right) => Number(right.level === 'error') - Number(left.level === 'error'));
  const customerIds = new Set(scenario.customers.map((customer) => customer.id));
  const errorCount = issues.filter((item) => item.level === 'error').length;
  let tone: 'ok' | 'warning' | 'error' | 'neutral';
  let title: string;
  let detail: string;
  if (solution) {
    const passed = solution.verification.passed;
    tone = !passed || errorCount ? 'error' : issues.length ? 'warning' : 'ok';
    title = passed ? 'Verified plan' : 'Verification failed';
    detail = `${solution.summary.customers_served} of ${solution.summary.customers_total} customers checked against the solved schedule`;
  } else if (validation) {
    tone = !validation.valid ? 'error' : issues.length ? 'warning' : 'ok';
    title = validation.valid ? 'Scenario validated' : 'Scenario needs corrections';
    detail = validation.valid ? 'Ready to optimize.' : `Fix ${errorCount} blocking error${errorCount === 1 ? '' : 's'} before optimizing.`;
  } else {
    tone = 'neutral';
    title = 'Not checked yet';
    detail = 'Optimize runs the scenario and plan checks.';
  }
  const Icon = tone === 'ok' ? ShieldCheck : tone === 'neutral' ? Info : AlertTriangle;
  return (
    <div className={`inspector-card plan-check-card is-${tone}`}>
      <div className="plan-check-head">
        <span className="plan-check-icon"><Icon size={17} /></span>
        <div><strong>{title}</strong><small>{detail}</small></div>
        {issues.length > 0 && <span className="tab-count">{issues.length}</span>}
      </div>
      {issues.length > 0 && (
        <ul className="plan-check-issues">
          {issues.map((item) => (
            <li key={item.id} className={`level-${item.level}`}>
              <AlertTriangle size={14} />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                {item.entity && customerIds.has(item.entity) && (
                  <button type="button" onClick={() => onOpenCustomer(item.entity!)}>Open {item.entity} <ChevronRight size={13} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
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
                                <small>Demand {customer.demand} {scenario.demand_unit}</small>
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
type DataSelection = Record<'depots' | 'customers' | 'vehicles', string[]>;

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

function DataManager({ kind, onClose, onToast, enabledDepotIds, allowedDepotChoices, onApply }: { kind: DataKind; onClose: () => void; onToast: (message: string) => void; enabledDepotIds: string[] | null; allowedDepotChoices: Record<string, string> | null; onApply: (selection: DataSelection, choices: Record<string, string>, original: ScenarioTables, edited: ScenarioTables) => Promise<void> }) {
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
  const [addingCustomer, setAddingCustomer] = useState(false);
  // Ticks mirror the scenario: available depots, planned customers, enabled vehicles.
  const isInitiallySelected = (key: DataKind, id: string) => {
    if (key === 'depots') return !enabledDepotIds || enabledDepotIds.includes(id);
    if (key === 'customers') return scenario.customers.find((item) => item.id === id)?.enabled !== false;
    if (key === 'vehicles') return scenario.vehicles.find((item) => item.id === id)?.enabled !== false;
    return true;
  };
  const [selections, setSelections] = useState<Record<DataKind, Set<number>>>(() => Object.fromEntries(
    (Object.keys(initialTables) as DataKind[]).map(key => [key, new Set(initialTables[key].flatMap((row, index) => isInitiallySelected(key, row.ID) ? [index] : []))]),
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
  const firstEditableColumn = columns.find((column) => isEditableColumn(activeKind, column) && column !== 'Allowed Depot');
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
    const problems = rowEditErrors(activeKind, committedTables[activeKind].find((item) => item.ID === row.ID), row);
    if (problems.length) {
      setApplyError(`${row.ID}: ${problems.join(' · ')}`);
      return;
    }
    setApplyError(null);
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
      const selectedIds = (key: DataKind) => tables[key].filter((_, index) => selections[key].has(index)).map((row) => row.ID);
      await onApply(
        { depots: selectedIds('depots'), customers: selectedIds('customers'), vehicles: selectedIds('vehicles') },
        Object.fromEntries(tables.customers.map(row => [row.ID, row['Allowed Depot']])), committedTables, tables,
      );
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Could not apply the scenario data.');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-layer" role="presentation">
      <div className="data-manager" role="dialog" aria-modal="true" aria-label={`Manage ${title}`}>
        <header className="data-manager-header">
          <div><span className="eyebrow">Scenario data</span><h2>Manage operational inputs</h2><p>Edit values and untick customers or vehicles to leave them out of the plan. Unassigned lets the solver choose among the selected depots.</p></div>
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
          {activeKind === 'customers' && <button className="button button-primary" type="button" onClick={() => setAddingCustomer(true)} disabled={saving}><Plus size={17} /> Add customer</button>}
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
                  {columns.map((column) => (
                    <td key={column} className={column === 'ID' ? 'is-id' : undefined}>
                      {editingRow === index && activeKind === 'customers' && column === 'Allowed Depot' ? (
                        <select className="allowed-depot-select" value={isAvailableChoice(row[column]) ? row[column] : '__unavailable'} disabled={saving} aria-label={`Allowed Depot for ${row.ID}`} aria-invalid={!isAvailableChoice(row[column])} onChange={event => updateCell(index, column, event.target.value)}>
                          {!isAvailableChoice(row[column]) && <option value="__unavailable" disabled>Choose an available depot</option>}
                          <option value="Unassigned">Unassigned</option>
                          {availableDepots.map(depot => <option key={depot.ID} value={depot.ID}>{depot.ID}</option>)}
                          {row[column].includes(',') && isAvailableChoice(row[column]) && <option value={row[column]}>{row[column]} (imported restriction)</option>}
                        </select>
                      ) : editingRow === index && isEditableColumn(activeKind, column) ? (
                        <input
                          data-row={column === firstEditableColumn ? String(index) : undefined}
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
          {addingCustomer && (
            <CustomerDialog
              existingIds={tables.customers.map((row) => row.ID)}
              depotIds={availableDepots.map((depot) => depot.ID)}
              onClose={() => setAddingCustomer(false)}
              onAdd={(row) => {
                const index = tables.customers.length;
                setTables((current) => ({ ...current, customers: [...current.customers, row] }));
                setSelections((current) => ({ ...current, customers: new Set([...current.customers, index]) }));
                setAddingCustomer(false);
                setQuery('');
                onToast(`${row.ID} added. Apply changes to keep it.`);
              }}
            />
          )}
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

function nextCustomerId(existing: string[]): string {
  // Continue the most common pattern, e.g. C-006 -> C-007 or HCM-C-030 -> HCM-C-031.
  const match = existing.map((id) => /^(.*?)(\d+)$/.exec(id)).filter(Boolean).pop();
  if (!match) return `C-${String(existing.length + 1).padStart(3, '0')}`;
  const [, prefix, digits] = match;
  let value = Math.max(...existing.map((id) => (id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN)).filter(Number.isFinite));
  let candidate: string;
  do { value += 1; candidate = `${prefix}${String(value).padStart(digits.length, '0')}`; } while (existing.includes(candidate));
  return candidate;
}

const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function CustomerDialog({ existingIds, depotIds, onClose, onAdd }: { existingIds: string[]; depotIds: string[]; onClose: () => void; onAdd: (row: Record<string, string>) => void }) {
  const [form, setForm] = useState({ id: nextCustomerId(existingIds), name: '', latitude: '', longitude: '', demand: '', service: '10', start: '08:00', end: '17:00', depot: 'Unassigned' });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = form.id.trim();
    if (!ENTITY_ID_PATTERN.test(id)) { setError('ID: start with a letter or digit; use letters, digits, - _ . or :'); return; }
    if (existingIds.includes(id)) { setError(`ID: ${id} already exists`); return; }
    const row = {
      ID: id, Customer: form.name.trim(), Coordinates: `${form.latitude.trim()}, ${form.longitude.trim()}`,
      'Allowed Depot': form.depot, Demand: form.demand.trim(), 'Time window': `${form.start}–${form.end}`,
      Service: `${form.service.trim() || '0'} min`,
    };
    const problems = rowEditErrors('customers', undefined, row);
    if (problems.length) { setError(problems.join(' · ')); return; }
    onAdd(row);
  };
  return (
    <div className="modal-layer modal-layer-top" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="entity-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add customer">
        <header><div><span className="entity-dialog-icon"><MapPin size={20} /></span><span><small>Scenario data</small><h2>Add customer</h2></span></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>
        <div className="form-section"><div className="form-section-title"><span>01</span><div><strong>General information</strong><small>Identity and allowed depot</small></div></div><div className="form-grid">
          <label><span>Customer ID *</span><input required value={form.id} maxLength={80} onChange={set('id')} /></label>
          <label><span>Name *</span><input required autoFocus value={form.name} maxLength={255} onChange={set('name')} placeholder="New customer" /></label>
          <label className="form-span-2"><span>Allowed depot</span><select value={form.depot} onChange={set('depot')}><option value="Unassigned">Unassigned · solver chooses</option>{depotIds.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
        </div></div>
        <div className="form-section"><div className="form-section-title"><span>02</span><div><strong>Demand & service</strong><small>Hard constraints used by the solver</small></div></div><div className="form-grid">
          <label><span>Demand *</span><input required inputMode="decimal" value={form.demand} onChange={set('demand')} placeholder="24" /></label>
          <label><span>Service time (min) *</span><input required inputMode="numeric" value={form.service} onChange={set('service')} /></label>
          <label><span>Window start *</span><input required type="time" value={form.start} onChange={set('start')} /></label>
          <label><span>Window end *</span><input required type="time" value={form.end} onChange={set('end')} /></label>
        </div></div>
        <div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Location</strong><small>WGS84 coordinates</small></div></div><div className="form-grid">
          <label><span>Latitude *</span><input required inputMode="decimal" value={form.latitude} onChange={set('latitude')} placeholder="52.5200" /></label>
          <label><span>Longitude *</span><input required inputMode="decimal" value={form.longitude} onChange={set('longitude')} placeholder="13.4050" /></label>
        </div></div>
        {error && <p className="import-error" role="alert"><AlertTriangle size={16} /> {error}</p>}
        <footer><span><ShieldCheck size={15} /> Validated again when you apply changes</span><div><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Check size={16} /> Add customer</button></div></footer>
      </form>
    </div>
  );
}

type ScenarioSource = 'library' | 'templates' | 'upload';

const REQUIRED_SHEETS = [
  { label: 'Scenario', icon: Settings2 },
  { label: 'Depots', icon: Warehouse },
  { label: 'Customers', icon: UsersRound },
  { label: 'Vehicle Types', icon: Truck },
  { label: 'Vehicles', icon: Truck },
  { label: 'Objective & Solver', icon: Gauge },
];

function ScenarioDialog({ initialSource, current, save, onClose, onImported, onOpened, onRenamed, onDeleted }: {
  initialSource: ScenarioSource;
  current: OpenSavedScenario | null;
  save: CurrentScenarioSave | null;
  onClose: () => void;
  onImported: (report: ValidationResponse, filename: string) => void;
  onOpened: (opened: OpenedScenarioVersion) => void;
  onRenamed: (scenarioId: string, name: string) => void;
  onDeleted: (scenarioId: string) => void;
}) {
  const [source, setSource] = useState<ScenarioSource>(initialSource);
  const templatesQuery = useQuery({ queryKey: ['vrp-templates'], queryFn: listTemplates, staleTime: Infinity });
  const templates = templatesQuery.data || [];
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importWorking, setImportWorking] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const working = importWorking || libraryBusy || Boolean(save?.saving);
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
    setImportWorking(true);
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
      setImportWorking(false);
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
            <span><h2 id="scenario-dialog-title">Scenarios</h2><small>Save your work, reopen a version, or start from a template or your own workbook.</small></span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={working} aria-label="Close dialog"><X size={18} /></button>
        </header>

        <div className="scenario-source-tabs" role="tablist" aria-label="Scenario source">
          <button type="button" role="tab" aria-selected={source === 'library'} className={source === 'library' ? 'is-active' : ''} onClick={() => { setSource('library'); setError(null); }} disabled={working}><FolderOpen size={15} /> My scenarios</button>
          <button type="button" role="tab" aria-selected={source === 'templates'} className={source === 'templates' ? 'is-active' : ''} onClick={() => { setSource('templates'); setError(null); }}><LayoutTemplate size={15} /> Operartis templates</button>
          <button type="button" role="tab" aria-selected={source === 'upload'} className={source === 'upload' ? 'is-active' : ''} onClick={() => { setSource('upload'); setError(null); }}><Upload size={15} /> Upload your own file</button>
        </div>

        {source === 'library' ? (
          <div className="scenario-dialog-body">
            {save && <CurrentScenarioStrip {...save} />}
            <ScenarioLibraryPane current={current} onOpened={onOpened} onRenamed={onRenamed} onDeleted={onDeleted} onChooseTemplate={() => setSource('templates')} onBusyChange={setLibraryBusy} />
          </div>
        ) : source === 'templates' ? (
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
          <span className="scenario-dialog-note">{source === 'library' ? 'Private to your account · up to 50 scenarios.' : 'Your current scenario changes only when you confirm.'}</span>
          <button className="button button-quiet" type="button" onClick={onClose} disabled={working}>{source === 'library' ? 'Close' : 'Cancel'}</button>
          {source !== 'library' && <button className="button button-primary" type="button" onClick={() => void confirm()} disabled={!canConfirm}>
            {importWorking ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
            {importWorking ? 'Validating' : source === 'templates' ? 'Use template' : 'Validate & import'}
          </button>}
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
  if (kind === 'customers') return viewData.customers.map((item) => ({ ID: item.id, Customer: item.name, Coordinates: `${item.coordinate[1].toFixed(4)}, ${item.coordinate[0].toFixed(4)}`, 'Allowed Depot': 'Unassigned', Demand: String(item.demand), 'Time window': item.timeWindow, Service: `${item.serviceMinutes} min` }));
  if (kind === 'vehicleTypes') return viewData.vehicleTypes.map((item) => ({ ID: item.id, Type: item.name, Capacity: String(item.capacity), 'Fixed cost': String(item.fixedCost), 'Distance cost': String(item.distanceCost), Profile: item.profile }));
  return viewData.vehicles.map((item) => ({ ID: item.id, Plate: item.plate, Type: item.typeId, 'Home depot': item.depotId, Shift: item.shift }));
}

export default App;

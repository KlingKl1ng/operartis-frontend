import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, LayoutList, Play, RotateCcw, Search, Upload, X } from 'lucide-react';
import { SettingsModal } from '../../app-shared/SettingsModal';
import { AppShell, EmptyWatermark } from '../../app-shared/Shell';
import { useLang, useStoredFlag, useTheme } from '../../app-shared/hooks';
import { Toast, type ToastKind, type ToastMessage } from '../../app-shared/ui';
import {
  cancelBatch, exportReport, optimizePolicy, simulateMonteCarlo, simulateTimeline, submitBatch, waitForBatch,
  type BatchProgress,
} from './api/inventory';
import { MappingDialog } from './components/MappingDialog';
import { KpiBar, Overview, type OverviewProduct } from './components/Overview';
import { Sidebar } from './components/Sidebar';
import { DEFAULT_PARAMS, leadTimeValuesValid, lockedFields, resolveSkuParams, withFileParams } from './domain/params';
import { batchRequest, exportRequest, optimizationRequest, simulationRequest } from './domain/requests';
import { summaryRow, type SummaryRow } from './domain/summary';
import type {
  FileMetadata, FileSkuParams, ForecastPoint, LockState, Mapping, MonteCarloResult, OptimizationResult, Params, SimResult, SimulationMode,
} from './domain/types';
import { useTranslator } from './i18n';
import { autoMapping } from './parsing/mapping';

// The chart and the spreadsheet reader are large; they load when first needed.
const ProductView = lazy(() => import('./components/ProductView').then((module) => ({ default: module.ProductView })));
const loadWorkbookReader = () => import('./parsing/workbook');

const OVERVIEW = '__overview__';

interface PendingFile {
  file: File;
  data: ArrayBuffer;
  headers: string[];
  metadata: FileMetadata;
}

function environmentLabel(): 'environmentLocal' | 'environmentStaging' | null {
  const host = window.location.hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'environmentLocal';
  return host.startsWith('staging.') ? 'environmentStaging' : null;
}

export default function App() {
  const { theme, dark, setTheme } = useTheme();
  const { lang, setLang } = useLang();
  const t = useTranslator(lang);
  const [collapsed, setCollapsed] = useStoredFlag('inv-sidebar-collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((kind: ToastKind, title: string, detail?: string) => setToast({ id: Date.now() + Math.random(), kind, title, detail }), []);

  // The uploaded file and what was read from it.
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [skus, setSkus] = useState<string[]>([]);
  const [forecasts, setForecasts] = useState<Record<string, ForecastPoint[]>>({});
  const [fileParams, setFileParams] = useState<Record<string, FileSkuParams>>({});
  const [locks, setLocks] = useState<LockState>({});

  // Parameters: the sidebar shows `params`; `manualParams` remembers them per product once it was selected.
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [manualParams, setManualParams] = useState<Record<string, Params>>({});
  const [currentSku, setCurrentSku] = useState<string | null>(null);
  const [mode, setMode] = useState<SimulationMode>('optimize');

  // Results.
  const [simResults, setSimResults] = useState<Record<string, SimResult>>({});
  const [mcResults, setMcResults] = useState<Record<string, MonteCarloResult>>({});
  const [optimizationResults, setOptimizationResults] = useState<Record<string, OptimizationResult>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [latestJobId, setLatestJobId] = useState<string | null>(null);

  // Work in progress.
  const [optimizing, setOptimizing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const batchJob = useRef<string | null>(null);
  const busy = optimizing || simulating;

  // Result tabs: the overview plus one tab per opened product.
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>(OVERVIEW);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('operartis:open-settings', open);
    return () => window.removeEventListener('operartis:open-settings', open);
  }, []);

  const failed = useCallback((titleKey: 'simulationFailed' | 'optimizationFailed' | 'reloadFailed' | 'exportError' | 'fileReadError' | 'fileParseError', error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    notify('error', t(titleKey), /Failed to fetch|NetworkError|Load failed/i.test(message) ? t('connectionFailed') : message);
  }, [notify, t]);

  // ---------- Parameters ----------

  const updateParams = (patch: Partial<Params>) => {
    const next = { ...params, ...patch };
    setParams(next);
    if (currentSku) setManualParams((current) => ({ ...current, [currentSku]: next }));
  };

  /** Make a product the selected one: the sidebar shows its parameters. */
  const selectSku = (sku: string) => {
    if (sku === currentSku) return;
    const next = manualParams[sku] ?? withFileParams(params, fileParams[sku]);
    setManualParams((current) => ({ ...current, ...(currentSku ? { [currentSku]: params } : {}), [sku]: next }));
    setParams(next);
    setCurrentSku(sku);
  };

  const paramsFor = (sku: string) => (sku === currentSku ? params : resolveSkuParams(sku, { sidebar: params, manual: manualParams, file: fileParams }));

  const openProduct = (sku: string) => {
    selectSku(sku);
    setOpenTabs((tabs) => (tabs.includes(sku) ? tabs : [...tabs, sku]));
    setActiveTab(sku);
    setMobileOpen(false);
  };

  const closeTab = (sku: string) => {
    setOpenTabs((tabs) => tabs.filter((tab) => tab !== sku));
    if (activeTab === sku) setActiveTab(OVERVIEW);
  };

  const stepProduct = (direction: number) => {
    if (!currentSku || skus.length < 2) return;
    stepTo(skus[(skus.indexOf(currentSku) + direction + skus.length) % skus.length]);
  };

  // ---------- File ----------

  const chooseFile = () => fileInput.current?.click();

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    try {
      window.OperartisSecurity?.validateUploadFile(file, { allowedExtensions: ['.xlsx', '.xls', '.csv'] });
    } catch (error) {
      notify('error', t('invalidFileFormat'), error instanceof Error ? error.message : undefined);
      return;
    }
    try {
      const [data, { inspectFile }] = await Promise.all([file.arrayBuffer(), loadWorkbookReader()]);
      const { headers, metadata } = inspectFile(data);
      if (!headers.length) {
        notify('error', t('noHeadersFound'));
        return;
      }
      setPending({ file, data, headers, metadata });
    } catch (error) {
      failed('fileReadError', error);
    }
  };

  const onMappingConfirmed = async (mapping: Mapping, chosenLocks: LockState) => {
    if (!pending) return;
    const { file, data } = pending;
    setPending(null);
    try {
      const { parseFile } = await loadWorkbookReader();
      const parsed = parseFile(data, mapping);
      if (parsed.skus.length === 0) {
        notify('error', t('noValidDataFound'));
        return;
      }
      const first = parsed.skus[0];
      // The sidebar takes the first product's values from the file; nothing is carried over from the previous file.
      const sidebar = withFileParams(params, parsed.skuParams[first]);
      setFilename(file.name);
      setSkus(parsed.skus);
      setForecasts(parsed.grouped);
      setFileParams(parsed.skuParams);
      setLocks(chosenLocks);
      setParams(sidebar);
      setManualParams({ [first]: sidebar });
      setCurrentSku(first);
      setSimResults({});
      setMcResults({});
      setOptimizationResults({});
      setFailures({});
      setLatestJobId(null);
      setOpenTabs(parsed.skus.length === 1 ? [first] : []);
      setActiveTab(parsed.skus.length === 1 ? first : OVERVIEW);
    } catch (error) {
      failed('fileParseError', error);
    }
  };

  const resetAll = () => {
    setFilename(null);
    setSkus([]);
    setForecasts({});
    setFileParams({});
    setLocks({});
    setParams(DEFAULT_PARAMS);
    setManualParams({});
    setCurrentSku(null);
    setSimResults({});
    setMcResults({});
    setOptimizationResults({});
    setFailures({});
    setLatestJobId(null);
    setOpenTabs([]);
    setActiveTab(OVERVIEW);
  };

  // ---------- Runs ----------

  const leadTimeOk = () => {
    if (leadTimeValuesValid(params.leadTimeConfig)) return true;
    notify('warning', t('valueListInvalid'));
    return false;
  };

  /** Optimize the selected product. */
  const runOptimization = async () => {
    if (!currentSku || !forecasts[currentSku] || !leadTimeOk()) return;
    const sku = currentSku;
    setOptimizing(true);
    try {
      const result = await optimizePolicy(optimizationRequest(sku, forecasts[sku], params, filename));
      if (result.jobId) setLatestJobId(result.jobId);
      setOptimizationResults((current) => ({ ...current, [sku]: result }));
      setFailures(({ [sku]: _cleared, ...rest }) => rest);
      if (result.timeline) setSimResults((current) => ({ ...current, [sku]: { skuId: result.skuId, timeline: result.timeline!, metrics: result.metrics } }));
      openProduct(sku);
    } catch (error) {
      failed('optimizationFailed', error);
    } finally {
      setOptimizing(false);
    }
  };

  /** Optimize every product as one batch in the server's queue. */
  const runAllOptimizations = async () => {
    if (!leadTimeOk()) return;
    setOptimizing(true);
    try {
      const products = skus.filter((sku) => forecasts[sku]).map((sku) => ({ sku, forecast: forecasts[sku], params: paramsFor(sku) }));
      const accepted = await submitBatch(batchRequest(products, filename));
      batchJob.current = accepted.job_id;
      const outcome = await waitForBatch(accepted, setBatch);
      if (!outcome) {
        notify('warning', t('batchCancelled'));
        return;
      }
      setLatestJobId(outcome.jobId);
      setOptimizationResults(outcome.results);
      setSimResults(Object.fromEntries(Object.entries(outcome.results)
        .filter(([, result]) => result.timeline)
        .map(([sku, result]) => [sku, { skuId: result.skuId, timeline: result.timeline!, metrics: result.metrics }])));
      setFailures(outcome.failures);
      setActiveTab(OVERVIEW);
      const failedCount = Object.keys(outcome.failures).length;
      if (failedCount) notify('warning', t('productsFailed', t.format.number(failedCount, 0, 0), t.format.number(outcome.totalSkus, 0, 0)));
    } catch (error) {
      failed('optimizationFailed', error);
    } finally {
      batchJob.current = null;
      setBatch(null);
      setOptimizing(false);
    }
  };

  const cancelRunningBatch = async () => {
    if (!batchJob.current) return;
    try {
      await cancelBatch(batchJob.current);
      setBatch((current) => current && { ...current, status: 'cancel_requested' });
    } catch (error) {
      failed('optimizationFailed', error);
    }
  };

  /** What-If for the selected product: one run for the chart, then many runs for the figures. */
  const runSimulation = async () => {
    if (!currentSku || !forecasts[currentSku] || !leadTimeOk()) return;
    const sku = currentSku;
    const body = simulationRequest(sku, forecasts[sku], params, filename);
    setSimulating(true);
    try {
      const result = await simulateTimeline(body);
      if (result.jobId) setLatestJobId(result.jobId);
      setSimResults((current) => ({ ...current, [sku]: result }));
      openProduct(sku);
      const monteCarlo = await simulateMonteCarlo(body);
      if (monteCarlo.jobId) setLatestJobId(monteCarlo.jobId);
      setMcResults((current) => ({ ...current, [sku]: monteCarlo }));
    } catch (error) {
      failed('simulationFailed', error);
    } finally {
      setSimulating(false);
    }
  };

  /** What-If for every product, one after another. */
  const runAllSimulations = async () => {
    if (!leadTimeOk()) return;
    setSimulating(true);
    try {
      const bodies = skus.filter((sku) => forecasts[sku]).map((sku) => simulationRequest(sku, forecasts[sku], paramsFor(sku), filename));
      const timelines: Record<string, SimResult> = {};
      for (const body of bodies) {
        timelines[body.sku_id] = await simulateTimeline(body);
        if (timelines[body.sku_id].jobId) setLatestJobId(timelines[body.sku_id].jobId!);
      }
      setSimResults(timelines);
      setActiveTab(OVERVIEW);
      const monteCarlo: Record<string, MonteCarloResult> = {};
      for (const body of bodies) {
        monteCarlo[body.sku_id] = await simulateMonteCarlo(body);
        if (monteCarlo[body.sku_id].jobId) setLatestJobId(monteCarlo[body.sku_id].jobId!);
      }
      setMcResults(monteCarlo);
    } catch (error) {
      failed('simulationFailed', error);
    } finally {
      setSimulating(false);
    }
  };

  /** A fresh single run of the selected product with new random demand. */
  const reload = async () => {
    if (!currentSku || !forecasts[currentSku]) return;
    const sku = currentSku;
    // In Optimize mode the run uses the safety factor the optimizer found.
    const optimum = mode === 'optimize' ? optimizationResults[sku] : undefined;
    setReloading(true);
    try {
      const result = await simulateTimeline(simulationRequest(sku, forecasts[sku], optimum ? { ...params, safetyFactor: optimum.optimalSafetyFactor } : params, filename));
      if (result.jobId) setLatestJobId(result.jobId);
      setSimResults((current) => ({ ...current, [sku]: result }));
    } catch (error) {
      failed('reloadFailed', error);
    } finally {
      setReloading(false);
    }
  };

  const exportResults = async () => {
    if (exporting) return;
    if (Object.keys(simResults).length === 0) {
      notify('warning', t('nothingToExport'));
      return;
    }
    setExporting(true);
    try {
      await exportReport(exportRequest({ skus, paramsFor, forecasts, simResults, mcResults, optimizationResults, sourceJobId: latestJobId, filename, mode, language: lang }));
      notify('success', t('exportSuccess'));
    } catch (error) {
      failed('exportError', error);
    } finally {
      setExporting(false);
    }
  };

  // ---------- What is shown ----------

  const products: OverviewProduct[] = useMemo(() => skus.map((sku) => ({
    sku,
    forecastDays: forecasts[sku]?.length || 0,
    row: summaryRow(sku, mode, simResults[sku], mcResults[sku], optimizationResults[sku]),
    failure: failures[sku],
  })), [skus, forecasts, mode, simResults, mcResults, optimizationResults, failures]);
  const summaryRows = products.map((product) => product.row).filter((row): row is SummaryRow => row !== null);
  const hasResults = Object.keys(simResults).length > 0;
  const hasFile = skus.length > 0;
  const locked = lockedFields(mode, hasFile, locks);
  const environment = environmentLabel();
  const runOne = mode === 'optimize' ? runOptimization : runSimulation;
  const runAll = mode === 'optimize' ? runAllOptimizations : runAllSimulations;
  const runAllLabel = `${t(mode === 'optimize' ? 'optimizeAll' : 'simulateAll')} (${t.format.number(skus.length, 0, 0)})`;
  const productTab = activeTab !== OVERVIEW && skus.includes(activeTab) ? activeTab : null;

  const statusText = batch
    ? batch.status === 'queued'
      ? t('batchQueued', t.format.number(batch.position || 1, 0, 0))
      : batch.status === 'cancel_requested'
        ? t('batchCancelling')
        : batch.total
          ? t('batchProgress', t.format.number(batch.completed, 0, 0), t.format.number(batch.total, 0, 0))
          : t('batchStarting')
    : optimizing
      ? t('searchingOptimal')
      : simulating
        ? t('runningMonteCarlo')
        : null;

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void onFileChosen(file);
        }}
      />

      <AppShell
        title={t('inventoryOptimizer')}
        labels={{
          expandSidebar: t('expandSidebar'),
          collapseSidebar: t('collapseSidebar'),
          openMenu: t('openMenu'),
          closeMenu: t('closeMenu'),
          footerTitle: t('footerTitle'),
          footerTagline: t('footerTagline'),
        }}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        headerActions={environment && <span className="ops-pill is-good">{t(environment)}</span>}
        sidebar={(
          <Sidebar
            t={t}
            filename={filename}
            productCount={skus.length}
            forecastDays={currentSku ? forecasts[currentSku]?.length || 0 : 0}
            onUpload={chooseFile}
            busy={busy}
            mode={mode}
            onModeChange={setMode}
            skus={skus}
            currentSku={currentSku}
            onSelectSku={(sku) => (productTab ? stepTo(sku) : selectSku(sku))}
            params={params}
            onParamsChange={updateParams}
            locked={locked}
            result={currentSku ? optimizationResults[currentSku] || null : null}
          />
        )}
        sidebarFooter={(
          <>
            <button className="ops-button is-primary is-full" type="button" onClick={runOne} disabled={!currentSku || busy}>
              {mode === 'optimize' ? <Search size={14} /> : <Play size={14} />}
              {busy ? t(mode === 'optimize' ? 'optimizing' : 'simulating') : t(mode === 'optimize' ? 'findOptimalPolicy' : 'runSimulation')}
            </button>
            {skus.length > 1 && (
              <button className="ops-button is-quiet is-full" type="button" onClick={runAll} disabled={busy}>{runAllLabel}</button>
            )}
            <div className="inv-footer-row">
              <button className="ops-button is-export is-small" type="button" onClick={exportResults} disabled={!hasResults || exporting || busy}>
                <FileDown size={14} /> {t(exporting ? 'exporting' : 'exportReport')}
              </button>
              <button className="ops-button is-danger-quiet is-small" type="button" onClick={resetAll} disabled={busy || !hasFile} title={t('resetAll')}>
                <RotateCcw size={14} /> {t('resetAll')}
              </button>
            </div>
          </>
        )}
        rail={(
          <>
            <button className="ops-rail-button" type="button" onClick={chooseFile} disabled={busy} title={t('uploadInputData')} aria-label={t('uploadInputData')}><Upload size={18} /></button>
            <button className="ops-rail-button is-primary" type="button" onClick={runOne} disabled={!currentSku || busy} title={t(mode === 'optimize' ? 'findOptimalPolicy' : 'runSimulation')} aria-label={t(mode === 'optimize' ? 'findOptimalPolicy' : 'runSimulation')}>
              {mode === 'optimize' ? <Search size={18} /> : <Play size={18} />}
            </button>
            {skus.length > 1 && <button className="ops-rail-button" type="button" onClick={runAll} disabled={busy} title={runAllLabel} aria-label={runAllLabel}><LayoutList size={18} /></button>}
            <button className="ops-rail-button" type="button" onClick={exportResults} disabled={!hasResults || exporting || busy} title={t('exportReport')} aria-label={t('exportReport')}><FileDown size={18} /></button>
            <button className="ops-rail-button" type="button" onClick={resetAll} disabled={busy || !hasFile} title={t('resetAll')} aria-label={t('resetAll')}><RotateCcw size={18} /></button>
          </>
        )}
        belowHeader={(
          <>
            {statusText && (
              <div className="inv-status-bar" role="status">
                <span className="ops-pill is-gold">{t('running')}</span>
                <span className="inv-status-text">{statusText}</span>
                <div className={`inv-progress ${batch?.total && batch.status !== 'queued' ? '' : 'is-indeterminate'}`}>
                  <i style={batch?.total && batch.status !== 'queued' ? { width: `${Math.round((100 * batch.completed) / batch.total)}%` } : undefined} />
                </div>
                {batch && (
                  <button className="ops-button is-quiet is-small" type="button" onClick={cancelRunningBatch} disabled={batch.status === 'cancel_requested'}>{t('batchCancel')}</button>
                )}
              </div>
            )}
            {hasFile && (
              <div className="inv-tabs" role="tablist">
                {skus.length > 1 && (
                  <button type="button" role="tab" aria-selected={activeTab === OVERVIEW} className={activeTab === OVERVIEW ? 'is-active' : ''} onClick={() => setActiveTab(OVERVIEW)}>
                    <LayoutList size={14} /> {t('overview')}
                  </button>
                )}
                {openTabs.map((sku) => (
                  <span key={sku} className={`inv-tab ${activeTab === sku ? 'is-active' : ''}`}>
                    <button type="button" role="tab" aria-selected={activeTab === sku} onClick={() => openProduct(sku)} title={sku}>{sku}</button>
                    {skus.length > 1 && <button type="button" className="inv-tab-close" onClick={() => closeTab(sku)} aria-label={`${t('closeTab')}: ${sku}`}><X size={12} /></button>}
                  </span>
                ))}
              </div>
            )}
            {hasFile && activeTab === OVERVIEW && <KpiBar rows={summaryRows} t={t} />}
          </>
        )}
      >
        {!hasFile ? (
          <EmptyWatermark />
        ) : productTab ? (
          <Suspense fallback={null}>
          <ProductView
            key={productTab}
            t={t}
            dark={dark}
            sku={productTab}
            canStep={skus.length > 1}
            onStep={stepProduct}
            result={simResults[productTab] || null}
            running={busy}
            onReload={reload}
            reloading={reloading}
          />
          </Suspense>
        ) : (
          <Overview products={products} onOpen={openProduct} t={t} />
        )}
      </AppShell>

      {pending && (
        <MappingDialog
          key={pending.file.name + pending.file.lastModified}
          headers={pending.headers}
          initial={autoMapping(pending.headers, pending.metadata).mapping}
          initialLocks={autoMapping(pending.headers, pending.metadata).locks}
          onConfirm={onMappingConfirmed}
          onClose={() => setPending(null)}
          t={t}
        />
      )}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />
      <Toast toast={toast} onClose={() => setToast(null)} closeLabel={t('close')} />
    </>
  );

  /**
   * Move a showing product tab to another product. The product replaces the
   * one in the tab, unless it already has a tab of its own, which is shown instead.
   */
  function stepTo(sku: string) {
    if (!currentSku || sku === currentSku) return;
    selectSku(sku);
    setOpenTabs((tabs) => (tabs.includes(sku) ? tabs : tabs.map((tab) => (tab === currentSku ? sku : tab))));
    setActiveTab(sku);
  }
}

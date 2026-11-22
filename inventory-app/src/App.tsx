import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutList, Search, Upload, X } from 'lucide-react';
import { SettingsModal } from '../../app-shared/SettingsModal';
import { AppShell, EmptyWatermark } from '../../app-shared/Shell';
import { useLang, useStoredFlag, useTheme } from '../../app-shared/hooks';
import { Toast, type ToastKind, type ToastMessage } from '../../app-shared/ui';
import {
  cancelBatch, exportReport, simulateTimeline, submitBatch, waitForBatch,
  type BatchProgress,
} from './api/inventory';
import { ActionsMenu } from './components/ActionsMenu';
import { MappingDialog } from './components/MappingDialog';
import { KpiBar, Overview, type OverviewProduct, type ProductStatus } from './components/Overview';
import { Sidebar } from './components/Sidebar';
import { DEFAULT_PARAMS, fileGivenFields, hasOwnValues, leadTimeValuesValid, lockedFields, resolveSkuParams } from './domain/params';
import { batchRequest, exportRequest, simulationRequest } from './domain/requests';
import { forecastSpanDays } from './domain/forecastSpan';
import { summaryRow, type SummaryRow } from './domain/summary';
import type {
  FileMetadata, FileSkuParams, FileValidation, ForecastPoint, LockState, Mapping, OptimizationResult, Params, SimResult,
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
  // What a forecast report's past forecast errors gave: the persistence and how many products' spread.
  const [validation, setValidation] = useState<FileValidation | null>(null);

  // Parameters: `defaults` are the values for all products; `overrides` hold what was changed for single products.
  const [defaults, setDefaults] = useState<Params>(DEFAULT_PARAMS);
  const [overrides, setOverrides] = useState<Record<string, Partial<Params>>>({});
  // Products whose file values the user unlocked for editing.
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  // Products ticked in the overview: the ones the next run from there optimizes.
  const [selected, setSelected] = useState<string[]>([]);

  // Results: the optimizer's figures per product, and one simulated run each for the day-by-day chart.
  const [simResults, setSimResults] = useState<Record<string, SimResult>>({});
  const [optimizationResults, setOptimizationResults] = useState<Record<string, OptimizationResult>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [latestJobId, setLatestJobId] = useState<string | null>(null);

  // Work in progress.
  const [runningSkus, setRunningSkus] = useState<string[]>([]);
  const [reloading, setReloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const batchJob = useRef<string | null>(null);
  const busy = runningSkus.length > 0;

  // Result tabs: the overview plus one tab per opened product.
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>(OVERVIEW);
  /** The product whose tab is showing; null on the overview. The sidebar and the run button act on it. */
  const productTab = activeTab !== OVERVIEW && skus.includes(activeTab) ? activeTab : null;

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('operartis:open-settings', open);
    return () => window.removeEventListener('operartis:open-settings', open);
  }, []);

  const failed = useCallback((titleKey: 'optimizationFailed' | 'reloadFailed' | 'exportError' | 'fileReadError' | 'fileParseError', error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    notify('error', t(titleKey), /Failed to fetch|NetworkError|Load failed/i.test(message) ? t('connectionFailed') : message);
  }, [notify, t]);

  // ---------- Parameters ----------

  const fileFields = useMemo(() => fileGivenFields(fileParams), [fileParams]);
  const sources = useMemo(() => ({ defaults, overrides, file: fileParams }), [defaults, overrides, fileParams]);
  const paramsFor = useCallback((sku: string) => resolveSkuParams(sku, sources), [sources]);

  /** A change in the sidebar: for the product whose tab is showing, otherwise for all products. */
  const updateParams = (patch: Partial<Params>) => {
    if (productTab) setOverrides((current) => ({ ...current, [productTab]: { ...current[productTab], ...patch } }));
    else setDefaults((current) => ({ ...current, ...patch }));
  };

  /** Drop what was changed for the showing product and lock its file values again. */
  const discardProductChanges = () => {
    if (!productTab) return;
    setOverrides(({ [productTab]: _own, ...rest }) => rest);
    setUnlocked(({ [productTab]: _open, ...rest }) => rest);
  };

  const openProduct = (sku: string) => {
    setOpenTabs((tabs) => (tabs.includes(sku) ? tabs : [...tabs, sku]));
    setActiveTab(sku);
    setMobileOpen(false);
  };

  const closeTab = (sku: string) => {
    setOpenTabs((tabs) => tabs.filter((tab) => tab !== sku));
    if (activeTab === sku) setActiveTab(OVERVIEW);
  };

  const toggleSelected = (sku: string) => setSelected((current) => (current.includes(sku) ? current.filter((item) => item !== sku) : [...current, sku]));
  const toggleAllSelected = () => setSelected((current) => (current.length === skus.length ? [] : skus));

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

  /** Everything that belongs to one file: what the user changed, ticked and ran. */
  const clearFileState = () => {
    setOverrides({});
    setUnlocked({});
    setSimResults({});
    setOptimizationResults({});
    setFailures({});
    setLatestJobId(null);
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
      // The values for all products stay as set; nothing else is carried over from the previous file.
      clearFileState();
      setFilename(file.name);
      setSkus(parsed.skus);
      setForecasts(parsed.grouped);
      setFileParams(parsed.skuParams);
      setLocks(chosenLocks);
      // The persistence estimated from the report's past forecast errors becomes the value for all products.
      // One taken from the previous file does not carry over to a file without such errors.
      const estimated = parsed.validation?.persistence ?? null;
      const previous = validation?.persistence ?? null;
      setDefaults((current) => {
        if (estimated != null) return { ...current, errorPersistence: estimated };
        return previous != null && current.errorPersistence === previous ? { ...current, errorPersistence: 0 } : current;
      });
      setValidation(parsed.validation ?? null);
      if (parsed.validation && (estimated != null || parsed.validation.spreadProducts > 0)) {
        notify('success', t('validationErrorsRead'), [
          estimated != null ? t('validationPersistence', t.format.number(estimated, 0, 2)) : '',
          parsed.validation.spreadProducts > 0
            ? t('validationSpread', t.format.number(parsed.validation.spreadProducts, 0, 0), t.format.number(parsed.skus.length, 0, 0))
            : '',
        ].filter(Boolean).join(' '));
      }
      setSelected(parsed.skus);
      // A file with a single product has no overview; its tab is the page.
      setOpenTabs(parsed.skus.length === 1 ? parsed.skus : []);
      setActiveTab(parsed.skus.length === 1 ? parsed.skus[0] : OVERVIEW);
    } catch (error) {
      failed('fileParseError', error);
    }
  };

  const resetAll = () => {
    clearFileState();
    setFilename(null);
    setSkus([]);
    setForecasts({});
    setFileParams({});
    setLocks({});
    setValidation(null);
    setDefaults(DEFAULT_PARAMS);
    setSelected([]);
    setOpenTabs([]);
    setActiveTab(OVERVIEW);
  };

  // ---------- Runs ----------

  /** What the run button optimizes: the showing product, or the products ticked in the overview. */
  const runTargets = useMemo(() => {
    if (productTab) return forecasts[productTab] ? [productTab] : [];
    const ticked = new Set(selected);
    return skus.filter((sku) => ticked.has(sku) && forecasts[sku]);
  }, [productTab, selected, skus, forecasts]);

  /** Optimize the run targets as one batch in the server's queue. Other products keep their results. */
  const runOptimization = async () => {
    const targets = runTargets;
    if (!targets.length || busy) return;
    if (targets.some((sku) => !leadTimeValuesValid(paramsFor(sku).leadTimeConfig))) {
      notify('warning', t('valueListInvalid'));
      return;
    }
    setRunningSkus(targets);
    try {
      const accepted = await submitBatch(batchRequest(targets.map((sku) => ({ sku, forecast: forecasts[sku], params: paramsFor(sku) })), filename));
      batchJob.current = accepted.job_id;
      const outcome = await waitForBatch(accepted, setBatch);
      if (!outcome) {
        notify('warning', t('batchCancelled'));
        return;
      }
      const ran = new Set(targets);
      const others = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([sku]) => !ran.has(sku)));
      setLatestJobId(outcome.jobId);
      setOptimizationResults((current) => ({ ...others(current), ...outcome.results }));
      setSimResults((current) => ({
        ...others(current),
        ...Object.fromEntries(Object.entries(outcome.results)
          .filter(([, result]) => result.timeline)
          .map(([sku, result]) => [sku, { skuId: result.skuId, timeline: result.timeline!, metrics: result.metrics }])),
      }));
      setFailures((current) => ({ ...others(current), ...outcome.failures }));
      const failedCount = Object.keys(outcome.failures).length;
      if (failedCount) notify('warning', t('productsFailed', t.format.number(failedCount, 0, 0), t.format.number(outcome.totalSkus, 0, 0)));
    } catch (error) {
      failed('optimizationFailed', error);
    } finally {
      batchJob.current = null;
      setBatch(null);
      setRunningSkus([]);
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

  /** A fresh single run of the showing product with new random demand. */
  const reload = async () => {
    const optimum = productTab ? optimizationResults[productTab] : undefined;
    if (!productTab || !forecasts[productTab] || !optimum) return;
    const sku = productTab;
    setReloading(true);
    try {
      // The run uses the safety factor the optimizer found.
      const result = await simulateTimeline(simulationRequest(sku, forecasts[sku], paramsFor(sku), optimum.optimalSafetyFactor, filename));
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
      await exportReport(exportRequest({ skus, paramsFor, forecasts, simResults, optimizationResults, sourceJobId: latestJobId, filename, language: lang }));
      notify('success', t('exportSuccess'));
    } catch (error) {
      failed('exportError', error);
    } finally {
      setExporting(false);
    }
  };

  // ---------- What is shown ----------

  const products: OverviewProduct[] = useMemo(() => {
    const running = new Set(runningSkus);
    return skus.map((sku) => {
      // A product that is running again shows no figures from its previous run.
      const row = running.has(sku) ? null : summaryRow(sku, simResults[sku], optimizationResults[sku]);
      const tuned = optimizationResults[sku]?.status === 'tuned';
      const status: ProductStatus = running.has(sku) ? 'running' : failures[sku] ? 'failed' : !row ? 'notRun' : tuned ? 'optimized' : 'untuned';
      return { sku, forecastDays: forecastSpanDays(forecasts[sku] || []), status, row, failure: running.has(sku) ? undefined : failures[sku], edited: hasOwnValues(sku, sources) };
    });
  }, [skus, forecasts, simResults, optimizationResults, failures, runningSkus, sources]);
  const summaryRows = products.map((product) => product.row).filter((row): row is SummaryRow => row !== null);
  const hasResults = Object.keys(simResults).length > 0;
  const hasFile = skus.length > 0;
  const environment = environmentLabel();
  const runLabel = productTab ? t('optimizeProduct') : hasFile ? t('optimizeSelected', t.format.number(runTargets.length, 0, 0)) : t('optimize');
  const runDisabled = busy || runTargets.length === 0;
  const runHint = hasFile && !productTab && runTargets.length === 0 ? t('selectRequired') : runLabel;
  // Calendar days, not rows: a weekly or monthly forecast covers more days than it has rows.
  const forecastDays = productTab ? forecastSpanDays(forecasts[productTab] || []) : skus.reduce((most, sku) => Math.max(most, forecastSpanDays(forecasts[sku] || [])), 0);

  const statusText = batch
    ? batch.status === 'queued'
      ? t('batchQueued', t.format.number(batch.position || 1, 0, 0))
      : batch.status === 'cancel_requested'
        ? t('batchCancelling')
        : batch.total
          ? t('batchProgress', t.format.number(batch.completed, 0, 0), t.format.number(batch.total, 0, 0))
          : t('batchStarting')
    : busy
      ? t('searchingOptimal')
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
            forecastDays={forecastDays}
            onUpload={chooseFile}
            busy={busy}
            hasFile={hasFile}
            product={productTab}
            params={productTab ? paramsFor(productTab) : defaults}
            onParamsChange={updateParams}
            fileFields={fileFields}
            reportPersistence={validation?.persistence ?? null}
            lockedFields={lockedFields(hasFile, locks)}
            unlocked={Boolean(productTab && unlocked[productTab])}
            edited={Boolean(productTab && hasOwnValues(productTab, sources))}
            onUnlock={() => productTab && setUnlocked((current) => ({ ...current, [productTab]: true }))}
            onDiscardChanges={discardProductChanges}
          />
        )}
        sidebarFooter={(
          <button className="ops-button is-primary is-full" type="button" onClick={runOptimization} disabled={runDisabled} title={runHint}>
            <Search size={14} />
            {busy ? t('optimizing') : runLabel}
          </button>
        )}
        rail={(
          <>
            <button className="ops-rail-button" type="button" onClick={chooseFile} disabled={busy} title={t('uploadInputData')} aria-label={t('uploadInputData')}><Upload size={18} /></button>
            <button className="ops-rail-button is-primary" type="button" onClick={runOptimization} disabled={runDisabled} title={runHint} aria-label={runHint}>
              <Search size={18} />
            </button>
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
              <div className="inv-tab-row">
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
                <ActionsMenu canExport={hasResults && !busy} exporting={exporting} canReset={!busy} onExport={exportResults} onReset={resetAll} t={t} />
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
            result={simResults[productTab] || null}
            policy={optimizationResults[productTab] || null}
            running={runningSkus.includes(productTab)}
            failure={failures[productTab]}
            onReload={reload}
            reloading={reloading}
          />
          </Suspense>
        ) : (
          <Overview products={products} selected={selected} onToggle={toggleSelected} onToggleAll={toggleAllSelected} onOpen={openProduct} t={t} />
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

}

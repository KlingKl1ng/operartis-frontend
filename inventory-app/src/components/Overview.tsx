import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, PencilLine } from 'lucide-react';
import { MONTE_CARLO_RUNS } from '../domain/params';
import { serviceLevelBand, stockoutsAreRare, summaryTotals, type SummaryRow } from '../domain/summary';
import type { TextKey, Translator } from '../i18n';
import { label as upper } from './Label';

type SortKey = 'sku' | 'days' | 'status' | 'alpha' | 'beta' | 'safetyFactor' | 'avgInventory' | 'stockouts';

export type ProductStatus = 'notRun' | 'running' | 'optimized' | 'failed';

const STATUS: Record<ProductStatus, { label: TextKey; pill: string; rank: number }> = {
  failed: { label: 'statusFailed', pill: 'is-bad', rank: 0 },
  notRun: { label: 'noResultYet', pill: '', rank: 1 },
  running: { label: 'running', pill: 'is-gold', rank: 2 },
  optimized: { label: 'statusOptimized', pill: 'is-good', rank: 3 },
};

export interface OverviewProduct {
  sku: string;
  forecastDays: number;
  status: ProductStatus;
  row: SummaryRow | null;
  /** Why the engine could not optimize it, if it failed in its last run. */
  failure?: string;
  /** It runs with values other than the ones in the file. */
  edited?: boolean;
}

/** The four figures above the product table. */
export function KpiBar({ rows, t }: { rows: SummaryRow[]; t: Translator }) {
  const totals = summaryTotals(rows);
  if (!totals.count) return null;
  const tiles: Array<{ label: TextKey; value: string; level?: string }> = [
    { label: 'avgServiceLevel', value: `${t.format.fixed(totals.avgAlpha * 100, 1)}%`, level: serviceLevelBand(totals.avgAlpha) },
    { label: 'avgFillRate', value: `${t.format.fixed(totals.avgBeta * 100, 1)}%` },
    { label: 'avgStockoutDays', value: t.format.fixed(totals.avgStockouts, 1), level: totals.avgStockouts < 1 ? 'good' : 'bad' },
    { label: 'skusBelow90', value: `${t.format.number(totals.below90, 0, 0)} / ${t.format.number(totals.count, 0, 0)}`, level: totals.below90 === 0 ? 'good' : 'warn' },
  ];
  return (
    <div className="inv-kpi-bar" title={t('avgOfRuns', t.format.number(MONTE_CARLO_RUNS, 0, 0))}>
      {tiles.map((tile) => (
        <div className="inv-kpi" key={tile.label}>
          <span>{upper(t(tile.label))}</span>
          <strong>
            {tile.level && <i className={`inv-dot is-${tile.level}`} aria-hidden="true" />}
            {tile.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

interface OverviewProps {
  products: OverviewProduct[];
  /** The ticked products: the ones the next run optimizes. */
  selected: string[];
  onToggle: (sku: string) => void;
  onToggleAll: () => void;
  onOpen: (sku: string) => void;
  t: Translator;
}

/** Every product of the file with its latest result. A tick includes it in the next run; a row opens the product. */
export function Overview({ products, selected, onToggle, onToggleAll, onOpen, t }: OverviewProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [ascending, setAscending] = useState(true);
  const selectAll = useRef<HTMLInputElement>(null);
  const ticked = useMemo(() => new Set(selected), [selected]);
  const allTicked = products.length > 0 && selected.length === products.length;
  const someTicked = selected.length > 0 && !allTicked;
  const resultCount = products.filter((product) => product.row).length;

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = someTicked;
  }, [someTicked]);

  const sorted = useMemo(() => {
    if (!sortKey) return products;
    const value = (product: OverviewProduct): string | number | undefined => {
      if (sortKey === 'sku') return product.sku.toLowerCase();
      if (sortKey === 'days') return product.forecastDays;
      if (sortKey === 'status') return STATUS[product.status].rank;
      return product.row?.[sortKey];
    };
    return [...products].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      // Products without a result stay at the bottom either way.
      if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1;
      const order = left > right ? 1 : left < right ? -1 : 0;
      return ascending ? order : -order;
    });
  }, [products, sortKey, ascending]);

  const header = (key: SortKey, label: string, numeric = true) => (
    <th className={numeric ? 'is-number' : ''} aria-sort={sortKey === key ? (ascending ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setAscending(!ascending);
          else {
            setSortKey(key);
            setAscending(true);
          }
        }}
      >
        <span>{upper(label)}</span>
        {sortKey === key ? (ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="inv-sort-idle" />}
      </button>
    </th>
  );

  return (
    <div className="inv-overview ops-card">
      <div className="inv-overview-head">
        <h2>{t('skuPerformanceSummary')}</h2>
        {resultCount > 0 && <span className="ops-pill is-good">{t('optimizedSteadyState')}</span>}
        <span className="inv-overview-count">
          {t('selectedCount', t.format.number(selected.length, 0, 0), t.format.number(products.length, 0, 0))}
          {resultCount > 0 && ` · ${t.format.number(resultCount, 0, 0)} ${t('skusOptimized')}`}
        </span>
      </div>
      <div className="inv-table-scroll ops-scroller">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="inv-cell-check">
                <input ref={selectAll} className="inv-check" type="checkbox" checked={allTicked} onChange={onToggleAll} aria-label={t('selectAll')} title={t('selectAll')} />
              </th>
              {header('sku', t('skuId'), false)}
              {header('days', t('forecastDays'))}
              {header('status', t('status'), false)}
              {header('alpha', t('alphaCol'))}
              {header('beta', t('betaCol'))}
              {header('safetyFactor', t('safetyFactorCol'))}
              {header('avgInventory', t('avgInvCol'))}
              {header('stockouts', t('stockoutsCol'))}
              <th aria-label={t('actionCol')} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ sku, forecastDays, status, row, failure, edited }) => (
              <tr key={sku} onClick={() => onOpen(sku)} className={ticked.has(sku) ? '' : 'is-unticked'}>
                {/* The whole cell toggles the tick, so a near miss does not open the product. */}
                <td className="inv-cell-check" onClick={(event) => { event.stopPropagation(); onToggle(sku); }}>
                  <input className="inv-check" type="checkbox" checked={ticked.has(sku)} onChange={() => undefined} aria-label={t('selectProduct', sku)} />
                </td>
                <td>
                  <div className="inv-cell-sku">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(sku); }}>{sku}</button>
                    {edited && <span className="inv-edited" title={t('valuesEdited')} aria-label={t('valuesEdited')}><PencilLine size={12} /></span>}
                  </div>
                </td>
                <td className="is-number">{t.format.number(forecastDays, 0, 0)}</td>
                <td><span className={`ops-pill ${STATUS[status].pill}`} title={failure}>{t(STATUS[status].label)}</span></td>
                {row ? (
                  <>
                    <td className="is-number">
                      <span className={`ops-pill is-${serviceLevelBand(row.alpha)}`}>{t.format.fixed(row.alpha * 100, 1)}%</span>
                    </td>
                    <td className="is-number">{t.format.fixed(row.beta * 100, 1)}%</td>
                    <td className="is-number">{row.safetyFactor ? `${t.format.fixed(row.safetyFactor, 2)}×` : '—'}</td>
                    <td className="is-number">{t.format.number(row.avgInventory, 0, 0)}</td>
                    <td className="is-number">
                      {stockoutsAreRare(row.stockouts)
                        ? <span className="inv-status is-good">{t('rare')}</span>
                        : <span className="inv-status is-bad">{t.format.fixed(row.stockouts, 1)} {t('days')}</span>}
                    </td>
                  </>
                ) : (
                  <td className="inv-cell-empty" colSpan={5}>{failure ?? '—'}</td>
                )}
                <td className="inv-cell-open"><ChevronRight size={15} aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

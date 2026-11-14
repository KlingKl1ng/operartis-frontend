import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CircleAlert } from 'lucide-react';
import { MONTE_CARLO_RUNS } from '../domain/params';
import { serviceLevelBand, stockoutsAreRare, summaryTotals, type SummaryRow } from '../domain/summary';
import type { TextKey, Translator } from '../i18n';
import { label as upper } from './Label';

type SortKey = 'sku' | 'days' | 'alpha' | 'beta' | 'safetyFactor' | 'avgInventory' | 'stockouts';

export interface OverviewProduct {
  sku: string;
  forecastDays: number;
  row: SummaryRow | null;
  /** Why the engine could not optimize it, if it failed in the last batch. */
  failure?: string;
}

/** The four figures above the product table. */
export function KpiBar({ rows, t }: { rows: SummaryRow[]; t: Translator }) {
  const totals = summaryTotals(rows);
  if (!totals.count) return null;
  const monteCarlo = rows.some((row) => row.hasMonteCarlo || row.isOptimized);
  const tiles: Array<{ label: TextKey; value: string; level?: string }> = [
    { label: 'avgServiceLevel', value: `${t.format.fixed(totals.avgAlpha * 100, 1)}%`, level: serviceLevelBand(totals.avgAlpha) },
    { label: 'avgFillRate', value: `${t.format.fixed(totals.avgBeta * 100, 1)}%` },
    { label: 'avgStockoutDays', value: t.format.fixed(totals.avgStockouts, 1), level: totals.avgStockouts < 1 ? 'good' : 'bad' },
    { label: 'skusBelow90', value: `${t.format.number(totals.below90, 0, 0)} / ${t.format.number(totals.count, 0, 0)}`, level: totals.below90 === 0 ? 'good' : 'warn' },
  ];
  return (
    <div className="inv-kpi-bar" title={monteCarlo ? t('avgOfRuns', t.format.number(MONTE_CARLO_RUNS, 0, 0)) : undefined}>
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

/** Every product of the file with its latest result; a row opens the product. */
export function Overview({ products, onOpen, t }: { products: OverviewProduct[]; onOpen: (sku: string) => void; t: Translator }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [ascending, setAscending] = useState(true);
  const optimized = products.some((product) => product.row?.isOptimized);
  const withMonteCarlo = products.some((product) => product.row?.hasMonteCarlo);
  const resultCount = products.filter((product) => product.row).length;

  const sorted = useMemo(() => {
    if (!sortKey) return products;
    const value = (product: OverviewProduct): string | number | undefined => {
      if (sortKey === 'sku') return product.sku.toLowerCase();
      if (sortKey === 'days') return product.forecastDays;
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
  const range = (low: string, high: string) => <small>{low} – {high}</small>;

  return (
    <div className="inv-overview ops-card">
      <div className="inv-overview-head">
        <h2>{t('skuPerformanceSummary')}</h2>
        {optimized && <span className="ops-pill is-good">{t('optimizedSteadyState')}</span>}
        {withMonteCarlo && !optimized && <span className="ops-pill is-gold">{t('monteCarloRuns', t.format.number(MONTE_CARLO_RUNS, 0, 0))}</span>}
        <span className="inv-overview-count">
          {resultCount
            ? `${t.format.number(resultCount, 0, 0)} / ${t.format.number(products.length, 0, 0)} ${t(optimized ? 'skusOptimized' : 'skusSimulated')}`
            : `${t.format.number(products.length, 0, 0)} ${t('products')}`}
        </span>
      </div>
      <div className="inv-table-scroll ops-scroller">
        <table className="inv-table">
          <thead>
            <tr>
              {header('sku', t('skuId'), false)}
              {header('days', t('forecastDays'))}
              {header('alpha', t('alphaCol'))}
              {header('beta', t('betaCol'))}
              {optimized && header('safetyFactor', t('safetyFactorCol'))}
              {header('avgInventory', t('avgInvCol'))}
              {header('stockouts', t('stockoutsCol'))}
              <th aria-label={t('actionCol')} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ sku, forecastDays, row, failure }) => (
              <tr key={sku} onClick={() => onOpen(sku)}>
                <td>
                  <div className="inv-cell-sku">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(sku); }}>{sku}</button>
                    {failure && <span className="ops-pill is-bad" title={failure}><CircleAlert size={11} /> {t('productFailed')}</span>}
                  </div>
                </td>
                <td className="is-number">{t.format.number(forecastDays, 0, 0)}</td>
                {row ? (
                  <>
                    <td className="is-number">
                      <span className={`ops-pill is-${serviceLevelBand(row.alpha)}`}>{t.format.fixed(row.alpha * 100, 1)}%</span>
                      {row.alphaRange && range(`${t.format.fixed(row.alphaRange.low * 100, 1)}%`, `${t.format.fixed(row.alphaRange.high * 100, 1)}%`)}
                    </td>
                    <td className="is-number">
                      {t.format.fixed(row.beta * 100, 1)}%
                      {row.betaRange && range(`${t.format.fixed(row.betaRange.low * 100, 1)}%`, `${t.format.fixed(row.betaRange.high * 100, 1)}%`)}
                    </td>
                    {optimized && <td className="is-number">{row.safetyFactor ? `${t.format.fixed(row.safetyFactor, 2)}×` : '—'}</td>}
                    <td className="is-number">
                      {t.format.number(row.avgInventory, 0, 0)}
                      {row.inventoryRange && range(t.format.number(row.inventoryRange.low, 0, 0), t.format.number(row.inventoryRange.high, 0, 0))}
                    </td>
                    <td className="is-number">
                      {stockoutsAreRare(row.stockouts)
                        ? <span className="inv-status is-good">{t('rare')}</span>
                        : <span className="inv-status is-bad">{t.format.fixed(row.stockouts, 1)} {t('days')}</span>}
                      {row.stockoutRange && range(t.format.fixed(row.stockoutRange.low, 0), t.format.fixed(row.stockoutRange.high, 0))}
                    </td>
                  </>
                ) : (
                  <td className="inv-cell-empty" colSpan={optimized ? 5 : 4}>{failure ? failure : t('noResultYet')}</td>
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

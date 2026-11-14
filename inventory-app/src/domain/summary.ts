// What the overview shows per product, and the colour bands used across the module.
import type { OptimizationResult, SimResult } from './types';

export type Level = 'good' | 'warn' | 'bad';

/** Service level in the overview: 95 % and above is good, 90 % and above acceptable. */
export const serviceLevelBand = (alpha: number): Level => (alpha >= 0.95 ? 'good' : alpha >= 0.9 ? 'warn' : 'bad');
/** Fewer than half a stockout day on average counts as rare. */
export const stockoutsAreRare = (days: number) => days < 0.5;
/** The optimizer may land up to two points under the target and still count as reached. */
export const targetReached = (result: { achievedAlpha: number; targetAlpha: number }) => result.achievedAlpha >= result.targetAlpha - 0.02;

export interface SummaryRow {
  sku: string;
  alpha: number;
  beta: number;
  avgInventory: number;
  stockouts: number;
  safetyFactor: number;
}

/** A product's overview figures: the optimizer's averages over its simulation runs. */
export function summaryRow(sku: string, sim: SimResult | undefined, optimum: OptimizationResult | undefined): SummaryRow | null {
  if (!optimum) return null;
  return {
    sku,
    alpha: optimum.achievedAlpha,
    beta: optimum.achievedBeta,
    avgInventory: optimum.mcAvgInventory || sim?.metrics?.avgInventory || 0,
    stockouts: optimum.mcAvgStockoutDays || sim?.metrics?.totalStockouts || 0,
    safetyFactor: optimum.optimalSafetyFactor,
  };
}

export interface SummaryTotals {
  count: number;
  avgAlpha: number;
  avgBeta: number;
  avgStockouts: number;
  below90: number;
}

export function summaryTotals(rows: SummaryRow[]): SummaryTotals {
  const count = rows.length;
  const mean = (pick: (row: SummaryRow) => number) => (count ? rows.reduce((sum, row) => sum + pick(row), 0) / count : 0);
  return {
    count,
    avgAlpha: mean((row) => row.alpha),
    avgBeta: mean((row) => row.beta),
    avgStockouts: mean((row) => row.stockouts),
    below90: rows.filter((row) => row.alpha < 0.9).length,
  };
}

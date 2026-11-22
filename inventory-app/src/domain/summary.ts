// What the overview shows per product, and the colour bands used across the module.
import type { OptimizationResult, ServiceMeasure, SimResult } from './types';

export type Level = 'good' | 'warn' | 'bad';

/** Fewer than half a stockout day on average counts as rare. */
export const stockoutsAreRare = (days: number) => days < 0.5;
type Judged = Pick<OptimizationResult, 'achievedAlpha' | 'achievedBeta' | 'targetAlpha' | 'serviceMeasure'>;
/** The achieved figure of the measure the target was set for. */
export const targetedService = (result: Judged) => (result.serviceMeasure === 'fill' ? result.achievedBeta : result.achievedAlpha);
/** The target is a floor: reached means at or above it. */
export const targetReached = (result: Judged) => targetedService(result) >= result.targetAlpha - 1e-9;

export interface SummaryRow {
  sku: string;
  alpha: number;
  beta: number;
  avgInventory: number;
  stockouts: number;
  safetyFactor: number;
  /** The measure the target was set for, and whether the tuned policy reaches it. */
  measure: ServiceMeasure;
  reached: boolean;
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
    measure: optimum.serviceMeasure === 'fill' ? 'fill' : 'cycle',
    reached: optimum.status === 'tuned' && targetReached(optimum),
  };
}

export interface SummaryTotals {
  count: number;
  avgAlpha: number;
  avgBeta: number;
  avgStockouts: number;
  /** Products whose policy does not reach its target. */
  belowTarget: number;
}

export function summaryTotals(rows: SummaryRow[]): SummaryTotals {
  const count = rows.length;
  const mean = (pick: (row: SummaryRow) => number) => (count ? rows.reduce((sum, row) => sum + pick(row), 0) / count : 0);
  return {
    count,
    avgAlpha: mean((row) => row.alpha),
    avgBeta: mean((row) => row.beta),
    avgStockouts: mean((row) => row.stockouts),
    belowTarget: rows.filter((row) => !row.reached).length,
  };
}

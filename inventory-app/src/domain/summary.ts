// What the overview shows per product, and the colour bands used across the module.
import type { MonteCarloResult, OptimizationResult, SimResult, SimulationMode } from './types';

export type Level = 'good' | 'warn' | 'bad';

/** Service level in the overview: 95 % and above is good, 90 % and above acceptable. */
export const serviceLevelBand = (alpha: number): Level => (alpha >= 0.95 ? 'good' : alpha >= 0.9 ? 'warn' : 'bad');
/** A single simulated run in the product view is judged more leniently: 90 % / 70 %. */
export const singleRunBand = (value: number): Level => (value >= 0.9 ? 'good' : value >= 0.7 ? 'warn' : 'bad');
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
  safetyFactor?: number;
  /** 5th–95th percentile over the Monte Carlo runs, when a separate Monte Carlo was run. */
  alphaRange?: { low: number; high: number };
  betaRange?: { low: number; high: number };
  inventoryRange?: { low: number; high: number };
  stockoutRange?: { low: number; high: number };
  hasMonteCarlo: boolean;
  isOptimized: boolean;
}

export function summaryRow(
  sku: string,
  mode: SimulationMode,
  sim: SimResult | undefined,
  mc: MonteCarloResult | undefined,
  optimum: OptimizationResult | undefined,
): SummaryRow | null {
  if (!sim && !optimum) return null;
  if (mode === 'optimize' && optimum) {
    return {
      sku,
      alpha: optimum.achievedAlpha,
      beta: optimum.achievedBeta,
      avgInventory: optimum.mcAvgInventory || sim?.metrics?.avgInventory || 0,
      stockouts: optimum.mcAvgStockoutDays || sim?.metrics?.totalStockouts || 0,
      safetyFactor: optimum.optimalSafetyFactor,
      hasMonteCarlo: false,
      isOptimized: true,
    };
  }
  if (!sim?.metrics) return null;
  if (!mc) {
    return { sku, alpha: sim.metrics.alpha, beta: sim.metrics.beta, avgInventory: sim.metrics.avgInventory, stockouts: sim.metrics.totalStockouts, hasMonteCarlo: false, isOptimized: false };
  }
  return {
    sku,
    alpha: mc.alpha.mean,
    beta: mc.beta.mean,
    avgInventory: mc.avgInventory.mean,
    stockouts: mc.stockoutDays.mean,
    alphaRange: { low: mc.alpha.p5, high: mc.alpha.p95 },
    betaRange: { low: mc.beta.p5, high: mc.beta.p95 },
    inventoryRange: { low: mc.avgInventory.p5, high: mc.avgInventory.p95 },
    stockoutRange: { low: mc.stockoutDays.p5, high: mc.stockoutDays.p95 },
    hasMonteCarlo: true,
    isOptimized: false,
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

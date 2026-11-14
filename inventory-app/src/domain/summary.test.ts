import { describe, expect, it } from 'vitest';
import { serviceLevelBand, singleRunBand, stockoutsAreRare, summaryRow, summaryTotals, targetReached } from './summary';
import type { MonteCarloResult, OptimizationResult, SimResult } from './types';

const sim: SimResult = { timeline: [], metrics: { alpha: 0.8, beta: 0.9, avgInventory: 100, totalStockouts: 4 } };
const spread = (mean: number) => ({ mean, p5: mean - 0.05, p95: mean + 0.05 });
const mc: MonteCarloResult = { numRuns: 500, alpha: spread(0.93), beta: spread(0.97), avgInventory: { mean: 120, p5: 100, p95: 140 }, stockoutDays: { mean: 0.4, p5: 0, p95: 2 } };
const optimum = { achievedAlpha: 0.951, achievedBeta: 0.98, optimalSafetyFactor: 2.4, mcAvgInventory: 300, mcAvgStockoutDays: 1.2, targetAlpha: 0.95 } as OptimizationResult;

describe('overview figures', () => {
  it('uses the optimizer result in Optimize mode', () => {
    expect(summaryRow('A', 'optimize', sim, mc, optimum)).toMatchObject({ alpha: 0.951, beta: 0.98, avgInventory: 300, stockouts: 1.2, safetyFactor: 2.4, isOptimized: true, hasMonteCarlo: false });
  });

  it('prefers the Monte Carlo figures over the single run in What-If mode', () => {
    expect(summaryRow('A', 'whatif', sim, mc, optimum)).toMatchObject({ alpha: 0.93, stockouts: 0.4, hasMonteCarlo: true, isOptimized: false, inventoryRange: { low: 100, high: 140 } });
    expect(summaryRow('A', 'whatif', sim, undefined, undefined)).toMatchObject({ alpha: 0.8, avgInventory: 100, hasMonteCarlo: false });
    expect(summaryRow('A', 'whatif', undefined, undefined, undefined)).toBeNull();
  });

  it('averages over the products that have a result', () => {
    const rows = [summaryRow('A', 'whatif', sim, undefined, undefined)!, summaryRow('B', 'whatif', sim, mc, undefined)!];
    expect(summaryTotals(rows)).toMatchObject({ count: 2, below90: 1 });
    expect(summaryTotals(rows).avgAlpha).toBeCloseTo(0.865);
    expect(summaryTotals([])).toEqual({ count: 0, avgAlpha: 0, avgBeta: 0, avgStockouts: 0, below90: 0 });
  });

  it('keeps the colour bands of the old page', () => {
    expect([0.95, 0.9, 0.89].map(serviceLevelBand)).toEqual(['good', 'warn', 'bad']);
    expect([0.9, 0.7, 0.69].map(singleRunBand)).toEqual(['good', 'warn', 'bad']);
    expect([stockoutsAreRare(0.49), stockoutsAreRare(0.5)]).toEqual([true, false]);
    expect([targetReached({ achievedAlpha: 0.93, targetAlpha: 0.95 }), targetReached({ achievedAlpha: 0.92, targetAlpha: 0.95 })]).toEqual([true, false]);
  });
});

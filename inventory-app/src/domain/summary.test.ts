import { describe, expect, it } from 'vitest';
import { serviceLevelBand, stockoutsAreRare, summaryRow, summaryTotals, targetReached } from './summary';
import type { OptimizationResult, SimResult } from './types';

const sim: SimResult = { timeline: [], metrics: { alpha: 0.8, beta: 0.9, avgInventory: 100, totalStockouts: 4 } };
const optimum = { achievedAlpha: 0.951, achievedBeta: 0.98, optimalSafetyFactor: 2.4, mcAvgInventory: 300, mcAvgStockoutDays: 1.2, targetAlpha: 0.95 } as OptimizationResult;

describe('overview figures', () => {
  it('shows the optimizer result, and nothing for a product that was not optimized', () => {
    expect(summaryRow('A', sim, optimum)).toEqual({ sku: 'A', alpha: 0.951, beta: 0.98, avgInventory: 300, stockouts: 1.2, safetyFactor: 2.4 });
    expect(summaryRow('A', sim, undefined)).toBeNull();
  });

  it('falls back to the run on screen when the optimizer gives no averages', () => {
    expect(summaryRow('A', sim, { ...optimum, mcAvgInventory: null, mcAvgStockoutDays: null })).toMatchObject({ avgInventory: 100, stockouts: 4 });
  });

  it('averages over the products that have a result', () => {
    const rows = [summaryRow('A', sim, optimum)!, summaryRow('B', sim, { ...optimum, achievedAlpha: 0.85 })!];
    expect(summaryTotals(rows)).toMatchObject({ count: 2, below90: 1 });
    expect(summaryTotals(rows).avgAlpha).toBeCloseTo(0.9005);
    expect(summaryTotals([])).toEqual({ count: 0, avgAlpha: 0, avgBeta: 0, avgStockouts: 0, below90: 0 });
  });

  it('keeps the colour bands of the old page', () => {
    expect([0.95, 0.9, 0.89].map(serviceLevelBand)).toEqual(['good', 'warn', 'bad']);
    expect([stockoutsAreRare(0.49), stockoutsAreRare(0.5)]).toEqual([true, false]);
  });

  it('counts the target as reached only at or above it', () => {
    const reached = (achievedAlpha: number) => targetReached({ achievedAlpha, targetAlpha: 0.95 });
    expect([reached(0.95), reached(0.953), reached(0.949)]).toEqual([true, true, false]);
  });
});

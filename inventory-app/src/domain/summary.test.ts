import { describe, expect, it } from 'vitest';
import { stockoutsAreRare, summaryRow, summaryTotals, targetReached } from './summary';
import type { OptimizationResult, SimResult } from './types';

const sim: SimResult = { timeline: [], metrics: { alpha: 0.8, beta: 0.9, avgInventory: 100, totalStockouts: 4 } };
const optimum = { achievedAlpha: 0.951, achievedBeta: 0.98, optimalSafetyFactor: 2.4, mcAvgInventory: 300, mcAvgStockoutDays: 1.2, targetAlpha: 0.95, serviceMeasure: 'cycle', status: 'tuned' } as OptimizationResult;

describe('overview figures', () => {
  it('shows the optimizer result, and nothing for a product that was not optimized', () => {
    expect(summaryRow('A', sim, optimum)).toEqual({ sku: 'A', alpha: 0.951, beta: 0.98, avgInventory: 300, stockouts: 1.2, safetyFactor: 2.4, measure: 'cycle', reached: true });
    expect(summaryRow('A', sim, undefined)).toBeNull();
  });

  it('falls back to the run on screen when the optimizer gives no averages', () => {
    expect(summaryRow('A', sim, { ...optimum, mcAvgInventory: null, mcAvgStockoutDays: null })).toMatchObject({ avgInventory: 100, stockouts: 4 });
  });

  it('averages over the products that have a result', () => {
    const rows = [summaryRow('A', sim, optimum)!, summaryRow('B', sim, { ...optimum, achievedAlpha: 0.85 })!];
    expect(summaryTotals(rows)).toMatchObject({ count: 2, belowTarget: 1 });
    expect(summaryTotals(rows).avgAlpha).toBeCloseTo(0.9005);
    expect(summaryTotals([])).toEqual({ count: 0, avgAlpha: 0, avgBeta: 0, avgStockouts: 0, belowTarget: 0 });
  });

  it('calls fewer than half a stockout day rare', () => {
    expect([stockoutsAreRare(0.49), stockoutsAreRare(0.5)]).toEqual([true, false]);
  });

  it('counts the target as reached only at or above it', () => {
    const reached = (achievedAlpha: number) => targetReached({ achievedAlpha, achievedBeta: 0.5, targetAlpha: 0.95, serviceMeasure: 'cycle' });
    expect([reached(0.95), reached(0.953), reached(0.949)]).toEqual([true, true, false]);
  });

  it('judges the figure the target was set for', () => {
    // A fill-rate target of 95%: reached with 95.2% of demand served, although only 59% of cycles had no shortage.
    const fill = { ...optimum, serviceMeasure: 'fill' as const, achievedAlpha: 0.59, achievedBeta: 0.952 };
    expect(targetReached(fill)).toBe(true);
    expect(summaryRow('A', sim, fill)).toMatchObject({ measure: 'fill', reached: true });
    expect(targetReached({ ...fill, achievedBeta: 0.94 })).toBe(false);
    // A policy that could not be tuned does not count as reaching its target.
    expect(summaryRow('A', sim, { ...optimum, status: 'forecast_too_short' })).toMatchObject({ reached: false });
  });
});

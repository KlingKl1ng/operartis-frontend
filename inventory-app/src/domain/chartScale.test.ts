import { describe, expect, it } from 'vitest';
import { bandLabelFit, chartScale } from './chartScale';
import type { TimelineDay } from './types';

const day = (values: Partial<TimelineDay>): TimelineDay => ({
  S_t: 0, s_t: 0, invAfterDemand: 0, inventoryPosition: 0, actualDemand: 0, arrivedQty: 0, backlog: 0,
  ...values,
} as TimelineDay);

describe('chartScale', () => {
  it('runs from zero to a round number above the highest value of the whole run', () => {
    const scale = chartScale([day({ invAfterDemand: 500, S_t: 413 }), day({ S_t: 560 })]);
    expect(scale.domain).toEqual([0, 600]);
    expect(scale.ticks).toEqual([0, 200, 400, 600]);
  });

  it('gives a small backlog a thin band below zero instead of a whole step', () => {
    const scale = chartScale([day({ S_t: 560 }), day({ backlog: 5 })]);
    expect(scale.domain).toEqual([-48, 600]);
    expect(scale.ticks).toEqual([0, 200, 400, 600]);
  });

  it('makes room for a large backlog and labels it', () => {
    const scale = chartScale([day({ S_t: 560 }), day({ backlog: 300 })]);
    expect(scale.domain[0]).toBeCloseTo(-330);
    expect(scale.ticks).toEqual([-200, 0, 200, 400, 600]);
  });

  it('copes with an empty or all-zero run', () => {
    expect(chartScale([]).domain).toEqual([0, 0.2]);
    expect(chartScale([day({})]).ticks[0]).toBe(0);
  });
});

describe('bandLabelFit', () => {
  it('writes the name across a band that is wide enough', () => {
    expect(bandLabelFit(60, 200, 45)).toBe('across');
  });

  it('turns the name along a band that is narrower than the text', () => {
    expect(bandLabelFit(54, 200, 45)).toBe('along');
    expect(bandLabelFit(13, 200, 45)).toBe('along');
  });

  it('leaves the name out of a sliver, or of a band too short for it', () => {
    expect(bandLabelFit(12, 200, 45)).toBe('none');
    expect(bandLabelFit(20, 50, 45)).toBe('none');
  });
});

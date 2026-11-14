// The vertical scale of the simulation chart, worked out once for the whole run
// so the lines do not move while the days are played back.
import type { TimelineDay } from './types';

export interface ChartScale {
  domain: [number, number];
  ticks: number[];
}

/** The smallest of 1, 2, 2.5, 5 × a power of ten that is at least `raw`. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= raw) ?? 10;
  return step * power;
}

/**
 * From zero up to a round number above the highest value of the run. Below zero
 * (a backlog is drawn there) only as much room as the largest backlog needs,
 * with a small minimum so it stays visible.
 */
export function chartScale(timeline: TimelineDay[]): ChartScale {
  let highest = 0;
  let lowest = 0;
  for (const day of timeline) {
    highest = Math.max(highest, day.S_t, day.s_t, day.invAfterDemand, day.inventoryPosition, day.actualDemand, day.arrivedQty);
    lowest = Math.min(lowest, day.invAfterDemand, -day.backlog);
  }
  const step = niceStep(Math.max(highest, 1) / 5);
  const top = Math.max(1, Math.ceil(highest / step)) * step;
  const bottom = lowest < 0 ? -Math.max(-lowest * 1.1, top * 0.08) : 0;

  const ticks: number[] = [];
  for (let tick = Math.ceil(bottom / step) * step; tick <= top + step / 1000; tick += step) ticks.push(Math.round(tick * 1000) / 1000 || 0);
  return { domain: [bottom, top], ticks };
}

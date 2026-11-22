import { describe, expect, it } from 'vitest';
import { forecastSpanDays } from './forecastSpan';

const points = (dates: string[]) => dates.map((date) => ({ date, p50: 1, p90: 2 }));

describe('calendar days a forecast covers', () => {
  it('counts daily rows as days, also where days are missing', () => {
    expect(forecastSpanDays(points(['2026-01-01', '2026-01-02', '2026-01-03']))).toBe(3);
    expect(forecastSpanDays(points(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12']))).toBe(8);
    expect(forecastSpanDays(points(['2026-01-01']))).toBe(1);
    expect(forecastSpanDays([])).toBe(0);
  });

  it('counts weekly and monthly rows as their whole periods', () => {
    expect(forecastSpanDays(points(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']))).toBe(28);
    expect(forecastSpanDays(points(['2026-01-01', '2026-02-01', '2026-03-01']))).toBe(31 + 28 + 31);
  });

  it('counts rows when the dates cannot be read or are out of order', () => {
    expect(forecastSpanDays(points(['D1', 'D2', 'D3']))).toBe(3);
    expect(forecastSpanDays(points(['2026-01-02', '2026-01-01']))).toBe(2);
  });
});

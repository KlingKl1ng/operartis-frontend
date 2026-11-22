// How many calendar days a product's forecast covers. The engine simulates in
// days and reads the rows by their dates (prepare_forecast in the backend):
// daily rows are days, weekly or monthly rows stand for their whole period.
import type { ForecastPoint } from './types';

const DAY = 86_400_000;

export function forecastSpanDays(points: ForecastPoint[]): number {
  if (points.length === 0) return 0;
  const times = points.map((point) => Date.parse(point.date));
  if (times.some(Number.isNaN)) return points.length; // no calendar to go by: one row is one day
  const gaps = times.slice(1).map((time, index) => Math.round((time - times[index]) / DAY));
  if (gaps.length === 0) return 1;
  if (gaps.some((gap) => gap <= 0)) return points.length;

  // The usual distance between two rows; the shorter one on a tie.
  const counts = new Map<number, number>();
  gaps.forEach((gap) => counts.set(gap, (counts.get(gap) ?? 0) + 1));
  let period = 1;
  let most = 0;
  [...counts.entries()].sort((a, b) => a[0] - b[0]).forEach(([gap, count]) => {
    if (count > most) [period, most] = [gap, count];
  });

  const last = times[times.length - 1];
  let lastPeriod = period;
  if (period >= 28 && period <= 31) {
    // A monthly row covers its calendar month.
    const date = new Date(last);
    lastPeriod = Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / DAY);
  }
  return Math.round((last - times[0]) / DAY) + lastPeriod;
}

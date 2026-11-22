import { describe, expect, it } from 'vitest';
import { addDays, byDate, isDateLike, isoDate, parseHeaderDate, parsePrefixedDate, parseStartDate } from './dates';

describe('calendar dates', () => {
  it('reads day-first and year-first headers as the day written, in any time zone', () => {
    expect(parseHeaderDate('16.01.2026')).toBe('2026-01-16');
    expect(parseHeaderDate('16/01/26')).toBe('2026-01-16');
    expect(parseHeaderDate('2026-01-16')).toBe('2026-01-16');
    expect(parseHeaderDate('SKU')).toBeNull();
  });

  it('reads the date in a P50_/P90_ column name', () => {
    expect(parsePrefixedDate('P50_01.02.2026')).toBe('2026-02-01');
    expect(parsePrefixedDate('p90_1-2-26')).toBe('2026-02-01');
    expect(parsePrefixedDate('P50_D1')).toBeNull();
  });

  it('counts days across a month end and the summer-time change without skipping or repeating a day', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(isoDate(2026, 2, 31)).toBe('2026-03-03');
  });

  it('reads a start date and rejects text that is not a date', () => {
    expect(parseStartDate('2026-02-26')).toBe('2026-02-26');
    expect(parseStartDate('Feb 26 2026')).toBe('2026-02-26');
    expect(() => parseStartDate('soon')).toThrow(/Invalid start date/);
  });

  it('recognises date headers', () => {
    expect(isDateLike('01.01.2026')).toBe(true);
    expect(isDateLike('Jan 01 2026')).toBe(true);
    expect(isDateLike('P50_D1')).toBe(false);
    expect(isDateLike(44927)).toBe(false);
  });

  it('orders points by date and leaves unreadable dates in place', () => {
    const points = [{ date: '2026-01-03' }, { date: '2026-01-01' }, { date: '2026-01-02' }];
    expect(points.sort(byDate).map((point) => point.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(byDate({ date: 'x' }, { date: '2026-01-01' })).toBe(0);
  });
});

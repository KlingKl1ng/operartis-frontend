// Calendar dates without time zones. A forecast date is a day on the calendar,
// so it is never passed through local midnight and back (which moves it one
// day earlier for anyone east of UTC).

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD for a year, 1-based month and day; overflowing days roll over like a calendar. */
export function isoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The calendar day a Date shows on this computer's clock. */
export function localIsoDate(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return isoDate(year, month, day + days);
}

const DAY_FIRST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
const YEAR_FIRST = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/;

/** A header such as 16.01.2026, 16/01/26 or 2026-01-16 as YYYY-MM-DD; null if it is not a date. */
export function parseHeaderDate(header: unknown): string | null {
  const text = String(header).trim();
  let match = DAY_FIRST.exec(text);
  if (match) {
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return isoDate(year, parseInt(match[2], 10), parseInt(match[1], 10));
  }
  match = YEAR_FIRST.exec(text);
  if (match) return isoDate(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
  // Anything else the browser can read as a date ("Jan 5 2026").
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : localIsoDate(parsed);
}

/** The date in a column name such as P50_16.01.2026; null if there is none. */
export function parsePrefixedDate(column: unknown): string | null {
  const match = /^P(?:50|90)_(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/i.exec(String(column));
  if (!match) return null;
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  return isoDate(year, parseInt(match[2], 10), parseInt(match[1], 10));
}

/** A start-date cell as YYYY-MM-DD. Throws when it cannot be read as a date. */
export function parseStartDate(value: unknown): string {
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T ])/.exec(text);
  if (match) return isoDate(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid start date: ${text}`);
  return localIsoDate(parsed);
}

/** Does a header look like a date? Used to recognise forecast files. */
export function isDateLike(header: unknown): boolean {
  const text = String(header).trim();
  return DAY_FIRST.test(text) || YEAR_FIRST.test(text) || /^[A-Za-z]{3,9}[\s-]\d{1,2}[\s,-]\d{2,4}$/.test(text);
}

/** The narrower check used on data headers: numeric day-first or year-first dates only. */
export function isNumericDate(header: unknown): boolean {
  const text = String(header).trim();
  return DAY_FIRST.test(text) || YEAR_FIRST.test(text);
}

export const isPrefixedP50 = (column: unknown) => /^P50_\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/i.test(String(column));
export const isPrefixedP90 = (column: unknown) => /^P90_\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/i.test(String(column));

/** Order forecast points by date; text that is not a date keeps its place. */
export function byDate(a: { date: string }, b: { date: string }): number {
  const difference = new Date(a.date).getTime() - new Date(b.date).getTime();
  return Number.isNaN(difference) ? 0 : difference;
}

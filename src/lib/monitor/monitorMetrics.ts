/**
 * Pure monitor math — sums, deltas, series bucketing, row builders.
 * Store-free; every function takes plain data so it can be unit-tested.
 */

import { isoDate, addDays, parseDay, type MonitorRange } from './monitorRange';

export interface DatedRow {
  date: string;
}

/** Sum of `amount` over rows whose date falls inside the inclusive window. */
export function sumInRange<T extends DatedRow>(
  rows: T[] | undefined,
  amount: (row: T) => number,
  from: string,
  to: string,
): number {
  if (!rows) return 0;
  let total = 0;
  for (const row of rows) {
    if (!row.date || row.date.slice(0, 10) < from || row.date.slice(0, 10) > to) continue;
    total += amount(row) || 0;
  }
  return total;
}

/**
 * Amount accessors.
 *
 * The parameter types carry `date` on purpose: `sumInRange` infers its row
 * type from the accessor, and a candidate without `date` fails the
 * `DatedRow` constraint, which makes TypeScript fall back to the bare
 * constraint and reject the accessor as a weak type.
 */
export const saleTotal = (s: { date: string; totalAmount?: number }) => s.totalAmount || 0;
export const purchaseTotal = (p: { date: string; weight?: number; ratePerUnit?: number }) =>
  (p.weight || 0) * (p.ratePerUnit || 0);

/** Delta of `current` vs `prior`, as a fraction (0.25 = +25%). Null when prior is 0. */
export function deltaFraction(current: number, prior: number): number | null {
  if (!(prior > 0)) return null;
  return (current - prior) / prior;
}

export interface SeriesPoint {
  key: string;
  label: string;
  revenue: number;
  purchase: number;
}

/** Bucket sales/purchases by the range's granularity (day / week / month). */
export function seriesForRange(
  sales: Array<DatedRow & { totalAmount?: number }>,
  purchases: Array<DatedRow & { weight?: number; ratePerUnit?: number }>,
  range: MonitorRange,
): SeriesPoint[] {
  const from = parseDay(range.from)!;
  const to = parseDay(range.to)!;
  const buckets = new Map<string, SeriesPoint>();
  const put = (key: string, label: string) => {
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, revenue: 0, purchase: 0 };
      buckets.set(key, b);
    }
    return b;
  };

  if (range.granularity === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      put(isoDate(d), `${d.getDate()}/${d.getMonth() + 1}`);
    }
  } else if (range.granularity === 'week') {
    let weekStart = from;
    let idx = 1;
    while (weekStart <= to) {
      const weekEnd = addDays(weekStart, 6);
      const label = `W${idx} ${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      const key = isoDate(weekStart);
      put(key, label);
      idx += 1;
      weekStart = addDays(weekEnd, 1);
    }
  } else {
    let monthStart = new Date(from.getFullYear(), from.getMonth(), 1);
    while (monthStart <= to) {
      const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
      put(key, monthStart.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    }
  }

  for (const s of sales) {
    if (!s.date) continue;
    const d = s.date.slice(0, 10);
    if (d < range.from || d > range.to) continue;
    const key = bucketKey(d, range.granularity);
    const bucket = buckets.get(key);
    if (bucket) bucket.revenue += s.totalAmount || 0;
  }
  for (const p of purchases) {
    if (!p.date) continue;
    const d = p.date.slice(0, 10);
    if (d < range.from || d > range.to) continue;
    const key = bucketKey(d, range.granularity);
    const bucket = buckets.get(key);
    if (bucket) bucket.purchase += purchaseTotal(p);
  }

  return [...buckets.values()];
}

function bucketKey(dateIso: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') return dateIso.slice(0, 7);
  if (granularity === 'day') return dateIso;
  const d = parseDay(dateIso)!;
  const day = d.getDay(); // 0 Sun..6 Sat — ISO-ish: week starts Monday
  const offset = (day + 6) % 7;
  const monday = addDays(d, -offset);
  return isoDate(monday);
}

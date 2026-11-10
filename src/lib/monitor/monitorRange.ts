/**
 * Monitor date-range math — one source of truth for the hub and the detail
 * pages. Pure, store-free, unit-testable.
 *
 * Wire format (URL query):
 *   ?range=today | yesterday | 7d | 30d | mtd
 *   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 */

export type MonitorRangeId = 'today' | 'yesterday' | '7d' | '30d' | 'mtd' | 'custom';
export type MonitorGranularity = 'day' | 'week' | 'month';

export interface MonitorRange {
  id: MonitorRangeId;
  label: string;
  /** Inclusive ISO dates (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Equal-length window immediately before `from` (same days when MTD). */
  prior: { from: string; to: string };
  granularity: MonitorGranularity;
  days: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDay = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, month - 1, day);
  // Reject rollover dates like 2026-02-31 (would silently become March 3).
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
};

export const addDays = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

const safeNow = (now?: Date) => {
  const n = now && !Number.isNaN(now.getTime()) ? new Date(now) : new Date();
  n.setHours(0, 0, 0, 0);
  return n;
};

const granularityFor = (days: number): MonitorGranularity =>
  days <= 14 ? 'day' : days <= 90 ? 'week' : 'month';

const priorWindow = (from: Date, to: Date) => {
  const days = daysBetween(from, to);
  const priorTo = addDays(from, -1);
  const priorFrom = addDays(priorTo, -(days - 1));
  return { from: isoDate(priorFrom), to: isoDate(priorTo), days };
};

export function buildRange(id: MonitorRangeId, now = new Date()): MonitorRange {
  const today = safeNow(now);
  const yesterday = addDays(today, -1);
  if (id === 'today') {
    return withMeta('today', 'Today', today, today);
  }
  if (id === 'yesterday') {
    return withMeta('yesterday', 'Yesterday', yesterday, yesterday);
  }
  if (id === '7d') {
    return withMeta('7d', 'Last 7 days', addDays(today, -6), today);
  }
  if (id === '30d') {
    return withMeta('30d', 'Last 30 days', addDays(today, -29), today);
  }
  if (id === 'mtd') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const dayOfMonth = today.getDate();
    const priorFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const priorEnd = addDays(priorFirst, dayOfMonth - 1);
    return {
      id: 'mtd',
      label: 'This month',
      from: isoDate(first),
      to: isoDate(today),
      prior: { from: isoDate(priorFirst), to: isoDate(priorEnd) },
      granularity: granularityFor(dayOfMonth),
      days: dayOfMonth,
    };
  }
  // custom — fall back to today (never throw)
  return withMeta('today', 'Today', today, today);

  function withMeta(id: MonitorRangeId, label: string, from: Date, to: Date): MonitorRange {
    const prior = priorWindow(from, to);
    const days = daysBetween(from, to);
    return {
      id,
      label,
      from: isoDate(from),
      to: isoDate(to),
      prior: { from: prior.from, to: prior.to },
      granularity: granularityFor(days),
      days,
    };
  }
}

export function customRange(fromIso: string, toIso: string): MonitorRange | null {
  const from = parseDay(fromIso);
  const to = parseDay(toIso);
  if (!from || !to) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  const days = daysBetween(a, b);
  const prior = priorWindow(a, b);
  return {
    id: 'custom',
    label: `${fromIso} → ${toIso}`,
    from: isoDate(a),
    to: isoDate(b),
    prior: { from: prior.from, to: prior.to },
    granularity: granularityFor(days),
    days,
  };
}

/** Parse URL query params into a MonitorRange (never throws; falls back to today). */
export function parseRange(params: URLSearchParams | string): MonitorRange {
  const p = typeof params === 'string' ? new URLSearchParams(params) : params;
  const id = (p.get('range') || 'today') as MonitorRangeId;
  if (id === 'custom') {
    const c = customRange(p.get('from') || '', p.get('to') || '');
    if (c) return c;
  }
  if (id === 'today' || id === 'yesterday' || id === '7d' || id === '30d' || id === 'mtd') {
    return buildRange(id);
  }
  return buildRange('today');
}

export function rangeToParams(r: MonitorRange): string {
  if (r.id === 'custom') return `range=custom&from=${r.from}&to=${r.to}`;
  return `range=${r.id}`;
}

export function rangeHref(path: string, r: MonitorRange): string {
  return `${path}?${rangeToParams(r)}`;
}

/** True when the date ISO string falls inside the inclusive [from, to] window. */
export function inRange(dateIso: string | undefined, from: string, to: string): boolean {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10);
  return d >= from && d <= to;
}

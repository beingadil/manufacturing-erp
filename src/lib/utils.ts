import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Font-size class for a displayed amount that must fit a bounded container.
 * Money strings grow as the business grows ("Rs 4,33,375.00" -> "Rs 343,349,500.00"),
 * so the text steps down a tier instead of overflowing or wrapping.
 * Non-string values (rich nodes, trend chips, icons) keep the default size.
 */
export function adaptiveAmountClass(value: unknown, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const len = typeof value === 'string' ? value.trim().length : 0;
  const steps: Record<'sm' | 'md' | 'lg', Array<[number, string]>> = {
    sm: [[8, 'text-lg'], [11, 'text-base'], [14, 'text-sm'], [Number.POSITIVE_INFINITY, 'text-xs']],
    md: [[9, 'text-2xl'], [12, 'text-xl'], [16, 'text-lg'], [Number.POSITIVE_INFINITY, 'text-base']],
    lg: [[9, 'text-3xl'], [12, 'text-2xl'], [16, 'text-xl'], [Number.POSITIVE_INFINITY, 'text-base']],
  };
  for (const [max, cls] of steps[size]) {
    if (len <= max) return cls;
  }
  return steps[size][steps[size].length - 1][1];
}

export function formatDocDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.day}-${map.month}-${map.year}`;
}

export function formatDocNumber(num: number | undefined | null): string {
  if (num == null) return '—';
  return num.toLocaleString('en-PK');
}


export function formatNumber(num: number) {
  return num.toLocaleString("en-US");
}

/**
 * Format a date string or Date object using Intl.DateTimeFormat.
 * Consistent locale-aware formatting across the entire app.
 */
export function formatDate(
  date: string | Date,
  opts?: Intl.DateTimeFormatOptions & { locale?: string }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  const locale = opts?.locale ?? 'en-PK';
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  };
  return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Format a date for input[type=date] (yyyy-MM-dd) using LOCAL calendar time.
 * (toISOString() shifts to UTC, which can return the previous day for PKT +5.)
 */
export function formatDateISO(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a ratio (0..1) as a percentage using Intl.NumberFormat.
 * e.g. formatPercent(0.9524) -> "95.24%".
 */
export function formatPercent(ratio: number, digits = 2) {
  return new Intl.NumberFormat("en-PK", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}


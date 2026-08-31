import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
  }).format(amount);
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


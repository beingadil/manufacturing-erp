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
 * Format a date for input[type=date] (yyyy-MM-dd).
 */
export function formatDateISO(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}


import { Banknote, BookOpen, Landmark, type LucideIcon } from 'lucide-react';

/** Accent colors used by the five voucher pages. */
export type VoucherAccent = 'rose' | 'emerald' | 'sky' | 'amber';

export const ACCENT_BTN: Record<VoucherAccent, string> = {
  rose: 'bg-rose-600 hover:bg-rose-500',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
  sky: 'bg-sky-600 hover:bg-sky-500',
  amber: 'bg-amber-600 hover:bg-amber-500',
};

export const ACCENT_SOFT: Record<VoucherAccent, string> = {
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
};

export const ACCENT_BAR: Record<VoucherAccent, string> = {
  rose: 'from-rose-600 to-rose-400',
  emerald: 'from-emerald-600 to-emerald-400',
  sky: 'from-sky-600 to-sky-400',
  amber: 'from-amber-600 to-amber-400',
};

export const ACCENT_HEAD: Record<VoucherAccent, string> = {
  rose: 'text-rose-700 dark:text-rose-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  sky: 'text-sky-700 dark:text-sky-300',
  amber: 'text-amber-700 dark:text-amber-300',
};

/** Voucher page kinds — must stay in sync with VoucherFormMode. */
export type VoucherKind = 'cash-payment' | 'bank-payment' | 'cash-receipt' | 'bank-receipt' | 'journal';

export const KIND_ACCENT: Record<VoucherKind, VoucherAccent> = {
  'cash-payment': 'rose',
  'bank-payment': 'amber',
  'cash-receipt': 'emerald',
  'bank-receipt': 'sky',
  journal: 'sky',
};

export const KIND_ICON: Record<VoucherKind, LucideIcon> = {
  'cash-payment': Banknote,
  'bank-payment': Landmark,
  'cash-receipt': Banknote,
  'bank-receipt': Landmark,
  journal: BookOpen,
};

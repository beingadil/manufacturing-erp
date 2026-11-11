import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormGridProps {
  /** 1 → one column; 2 → sm:2 columns; 3 → sm:2 / lg:3 columns. Always 1 column below sm. */
  cols?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
}

/**
 * Responsive form grid. Mirrors the reference Sales/Purchases layouts:
 * - cols 1: grid grid-cols-1 gap-4
 * - cols 2: grid grid-cols-1 sm:grid-cols-2 gap-4
 * - cols 3: grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4
 * Layout-only primitive — no behavior.
 */
export function FormGrid({ cols = 2, className, children }: FormGridProps) {
  const base =
    cols === 3
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
      : cols === 1
        ? 'grid grid-cols-1 gap-4'
        : 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  return <div className={cn(base, className)}>{children}</div>;
}

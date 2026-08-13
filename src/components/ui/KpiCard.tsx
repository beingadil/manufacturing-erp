import React from 'react';
import { cn } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';

/**
 * Canonical KPI card — the single card pattern for headline metrics across
 * the app (Dashboard, Balance Sheet / P&L summary strips, voucher lists and
 * all report templates).
 *
 * Design basis (ui-ux-pro-max): Executive Dashboard (large metric, trend
 * indicator, status color, hover lift on drill-down) blended with the app's
 * Data-Dense Dashboard system (compact card, 8–12px grid rhythm, theme tokens).
 *
 * Every value comes from the caller — this is a pure presentation component.
 */
export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  /** A lucide icon component, or an already-rendered element (e.g. a sized icon). */
  icon?: LucideIcon | React.ReactElement;
  /** Tint class for the icon (text-*). Defaults to muted. */
  iconClassName?: string;
  /** Tint class for the value (text-*). Defaults to foreground. */
  accent?: string;
  /** Optional trend chip rendered beside the value. */
  trend?: { value: number; isPositive: boolean };
  /** Small caption under the value. */
  description?: React.ReactNode;
  /** When set, the card renders as a button with hover lift (drill-down). */
  onClick?: () => void;
  /** Value size — 'md' (text-2xl) default, 'sm' for compact strips, 'lg' for hero figures. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  valueClassName?: string;
  /** Icon placement: beside the label (left, default) or top-right (right). */
  iconPosition?: 'left' | 'right';
}

const VALUE_SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
} as const;

export function KpiCard({
  label,
  value,
  icon,
  iconClassName,
  accent,
  trend,
  description,
  onClick,
  size = 'md',
  className,
  valueClassName,
  iconPosition = 'left',
}: KpiCardProps) {
  // lucide icons are forward-ref objects (typeof 'object'), not functions —
  // so distinguish an already-rendered element (ReactNode) from a component
  // via isValidElement instead of typeof.
  const isElement = React.isValidElement(icon);
  const Lucide = !isElement && icon ? (icon as LucideIcon) : null;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {iconPosition === 'left' && icon && (
            <span className={cn('shrink-0', Lucide && 'h-5 w-5', Lucide && (iconClassName || 'text-muted-foreground'))}>
              {Lucide ? <Lucide className="h-5 w-5" /> : (icon as React.ReactElement)}
            </span>
          )}
          <span className="text-sm font-medium text-muted-foreground truncate">{label}</span>
        </div>
        {iconPosition === 'right' && Lucide && (
          <Lucide className={cn('h-4 w-4 shrink-0', iconClassName || 'text-muted-foreground/50')} />
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn(VALUE_SIZES[size], 'font-bold tracking-tight tabular-nums', accent || 'text-foreground', valueClassName)}>
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0',
              trend.isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
            )}
          >
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>

      {description && <div className="mt-1.5 text-xs text-muted-foreground/80">{description}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col text-left transition-all hover:shadow-md hover:border-primary/30',
          className
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col', className)}>
      {content}
    </div>
  );
}

import React from 'react';
import { KpiCard } from '../../ui/KpiCard';
import type { LucideIcon } from 'lucide-react';

export interface ReportKPICardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
  className?: string;
  valueClassName?: string;
}

/**
 * Report KPI card — delegates to the canonical KpiCard so every report
 * template shares the exact same card pattern as the Dashboard, Balance
 * Sheet and P&L summary strips. New work should use KpiCard directly.
 */
export function ReportKPICard({
  title,
  value,
  icon,
  trend,
  description,
  className,
  valueClassName,
}: ReportKPICardProps) {
  return (
    <KpiCard
      label={title}
      value={value}
      icon={icon}
      iconPosition="right"
      trend={trend}
      description={description}
      className={className}
      valueClassName={valueClassName}
    />
  );
}

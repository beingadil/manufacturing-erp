import React from 'react';
import { cn } from '../../../lib/utils';
import { LucideIcon } from 'lucide-react';

interface ReportKPICardProps {
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

export function ReportKPICard({ title, value, icon: Icon, trend, description, className, valueClassName }: ReportKPICardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col", className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <h3 className={cn("text-2xl font-bold tracking-tight text-foreground", valueClassName)}>{value}</h3>
        {trend && (
          <span className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded-md",
            trend.isPositive ? "bg-success/10 text-emerald-600" : "bg-destructive/100/10 text-destructive"
          )}>
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}

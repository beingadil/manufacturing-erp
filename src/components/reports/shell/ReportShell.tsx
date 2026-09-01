import { ChevronRight } from 'lucide-react';
import type { ReportShellProps } from '../registry/reportTypes';

export function ReportShell({ definition, children, actions, filters, summary, showHeader = true }: ReportShellProps) {
  const Icon = definition.icon;
  return (
    <div className="space-y-5 min-w-0">
      {showHeader && (
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <span>Reports</span><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{definition.categoryLabel}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{definition.title}</h1>
              {definition.description && <p className="text-sm text-muted-foreground mt-1">{definition.description}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      {filters}
      {summary}
      <main>{children}</main>
    </div>
  );
}

import { ArrowLeft } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DatePicker } from '../../components/ui/date-picker';
import {
  type MonitorRange,
  parseRange,
  rangeToParams,
  type MonitorRangeId,
} from '../../lib/monitor/monitorRange';
import { cn } from '../../lib/utils';

const PRESETS: Array<{ id: MonitorRangeId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'mtd', label: 'MTD' },
];

/**
 * The bespoke shell for every dedicated monitor page. Owns the URL-synced
 * date range (the hub links here with `?range=` already set) and renders the
 * date chips + custom range pickers. Pages render via `children(range)`.
 */
export function MonitorDetailShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (range: MonitorRange) => ReactNode;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo(() => parseRange(searchParams), [searchParams]);

  const apply = (patch: { range?: string; from?: string; to?: string }) => {
    const next = new URLSearchParams(searchParams);
    // Never carry a stale from/to over a preset switch.
    if (patch.range && patch.range !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  const back = () => navigate(`/monitor?${rangeToParams(range)}`);

  const isCustom = range.id === 'custom';

  return (
    <div className="flex min-h-full flex-col pb-10 animate-in fade-in duration-300">
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-border/50 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back to Business Monitor"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Business Monitor</p>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <span className="ml-auto hidden rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline-flex">
            {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
          </span>
        </div>
      </header>

      {/* ── Date controls ── */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <div role="group" aria-label="Date range presets" className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map(p => {
              const active = !isCustom && range.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => apply({ range: p.id })}
                  aria-pressed={active}
                  className={cn(
                    'h-9 rounded-lg border px-3 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <DatePicker size="sm" className="w-40" value={range.from} onChange={(v) => apply({ range: 'custom', from: v, to: range.to })} placeholder="From" />
            <span className="text-xs text-muted-foreground">to</span>
            <DatePicker size="sm" className="w-40" value={range.to} onChange={(v) => apply({ range: 'custom', from: range.from, to: v })} placeholder="To" />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 pt-5 sm:px-6 lg:px-8">
        {children(range)}
      </div>
    </div>
  );
}

import { formatNumber } from '../../lib/utils';
import { cn } from '../../lib/utils';

export interface BucketShare {
  raw: number;
  inTransit: number;
  available: number;
  finished: number;
}

const SEGMENTS: Array<{ key: keyof BucketShare; label: string; color: string }> = [
  { key: 'raw', label: 'Raw', color: 'bg-zinc-500/70' },
  { key: 'inTransit', label: 'At processor', color: 'bg-amber-500' },
  { key: 'available', label: 'Awaiting next stage', color: 'bg-sky-500' },
  { key: 'finished', label: 'Finished', color: 'bg-emerald-500' },
];

/**
 * One-click read of where a batch's pieces sit: a single segmented track,
 * labelled by the shares beneath it. No boxes — the proportion is the data.
 */
export function BucketBar({ buckets, className }: { buckets: BucketShare; className?: string }) {
  const total = buckets.raw + buckets.inTransit + buckets.available + buckets.finished;
  if (total <= 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="h-2 rounded-full bg-muted/60" />
        <p className="text-xs text-muted-foreground">No pieces on hand — batch is depleted.</p>
      </div>
    );
  }
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/60" role="presentation">
        {SEGMENTS.map(seg => {
          const pcs = buckets[seg.key];
          if (pcs <= 0) return null;
          return (
            <div
              key={seg.key}
              className={cn('h-full', seg.color)}
              style={{ width: `${(pcs / total) * 100}%` }}
              title={`${seg.label}: ${formatNumber(pcs)} PCS`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {SEGMENTS.map(seg => {
          const pcs = buckets[seg.key];
          if (pcs <= 0) return null;
          return (
            <span key={seg.key} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', seg.color)} />
              {seg.label} <span className="font-medium tabular-nums text-foreground">{formatNumber(pcs)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

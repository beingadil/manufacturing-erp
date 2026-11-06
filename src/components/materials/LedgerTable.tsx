import { format } from 'date-fns';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn, formatNumber } from '../../lib/utils';
import type { InventoryMovement } from '../../types/erp';

/**
 * The movement ledger — one shape, reused by the material overview and the
 * per-purchase detail. In = green, Out = red; the running balance is the
 * stock figure after that line (shown, never recomputed here).
 *
 * Rows are two-line entries rather than a fixed table, so the ledger fits
 * narrow side-column cards without horizontal overflow or scrollbars.
 */
export function LedgerTable({ movements }: { movements: InventoryMovement[] }) {
  if (movements.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No movements recorded for this batch.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/50">
      {movements.map(m => {
        const incoming = m.transactionType === 'IN';
        return (
          <li key={m.id} className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  incoming ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                )}
              >
                {incoming
                  ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  : <ArrowUp className="h-3 w-3" aria-hidden="true" />}
                {m.transactionType}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">{m.referenceNo}</span>
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', incoming ? 'text-success' : 'text-destructive')}>
                {incoming ? '+' : '−'}{formatNumber(m.quantity)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 pl-14 text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">
                <span className="uppercase tracking-wider">{m.module}</span> · {format(new Date(m.date), 'MMM d, yyyy')}
              </span>
              <span className="shrink-0 tabular-nums">Balance {formatNumber(m.runningBalance)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

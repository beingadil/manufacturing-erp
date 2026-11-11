import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn, formatCurrency, formatNumber } from '../../lib/utils';
import { Dropdown } from '../Dropdown';

type BatchRowSort = 'newest' | 'value' | 'onHand';

export interface BatchRegisterRow {
  id: string;
  batchNo: string;
  purchaseNo: string;
  supplierName: string;
  date: string;
  pathLabel: string;
  rawPcs: number;
  availPcs: number;
  wipPcs: number;
  finishedPcs: number;
  onHandPcs: number;
  valueOnHand: number;
  costPerPiece: number;
  depleted: boolean;
}

const PATH_LABEL: Record<string, string> = {
  full_chain: 'Full chain',
  single_stage: 'Single stage',
  custom_stages: 'Custom stages',
  ready_made: 'Ready-made',
};
export const batchPathLabel = (p?: string) => PATH_LABEL[p ?? 'full_chain'] ?? 'Full chain';

/**
 * Batch register — the material detail page's center of gravity.
 * One scannable table; row click (or Enter/Space) opens the batch's own page.
 * The full per-batch economics live there, never inline here.
 */
export function BatchRegister({
  materialId,
  rows,
}: {
  materialId: string;
  rows: BatchRegisterRow[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<BatchRowSort>('newest');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter(r => [r.batchNo, r.purchaseNo, r.supplierName, r.pathLabel]
          .some(f => f && String(f).toLowerCase().includes(q)))
      : rows;
    const sorted = [...base];
    if (sort === 'value') sorted.sort((a, b) => b.valueOnHand - a.valueOnHand);
    else if (sort === 'onHand') sorted.sort((a, b) => b.onHandPcs - a.onHandPcs);
    else sorted.sort((a, b) => b.date.localeCompare(a.date));
    return sorted;
  }, [rows, query, sort]);

  const open = (id: string) => navigate(`/materials/${materialId}/purchases/${id}`);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No batches yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Record a purchase and the batch — and everything that happens to it — shows up here automatically.
        </p>
        <Link to="/purchases/new" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          New purchase
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Register toolbar */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search batches"
            placeholder="Search batch, PO or supplier…"
            className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="batch-sort" className="sr-only">Sort batches</label>
          <Dropdown
            id="batch-sort"
            size="sm"
            ariaLabel="Sort batches"
            value={sort}
            onChange={(next) => setSort(next as BatchRowSort)}
            triggerClassName="w-44"
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'value', label: 'Highest value' },
              { value: 'onHand', label: 'Most on hand' },
            ]}
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {visible.length} / {rows.length}
          </span>
        </div>
      </div>

      {/* Register table — scrolls sideways on small screens, never the page */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Batch · PO</th>
              <th className="px-4 py-3 text-left font-medium">Supplier</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Path</th>
              <th className="px-4 py-3 text-right font-medium">Raw</th>
              <th className="px-4 py-3 text-right font-medium">Avail</th>
              <th className="px-4 py-3 text-right font-medium">WIP</th>
              <th className="px-4 py-3 text-right font-medium">Finished</th>
              <th className="px-4 py-3 text-right font-medium">On hand</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {visible.map(r => (
              <tr
                key={r.id}
                role="link"
                tabIndex={0}
                aria-label={`Open batch ${r.batchNo}`}
                onClick={e => {
                  const t = e.target as HTMLElement;
                  if (t.closest('a, button, input, select')) return;
                  open(r.id);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.id); }
                }}
                className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <td className="px-4 py-3">
                  <Link to={`/materials/${materialId}/purchases/${r.id}`} className="font-mono text-xs font-semibold text-foreground hover:text-primary">
                    {r.batchNo}
                  </Link>
                  {r.purchaseNo && <div className="text-[10px] text-muted-foreground">{r.purchaseNo}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.supplierName}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {new Date(r.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.pathLabel}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(r.rawPcs)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatNumber(r.availPcs)}</td>
                <td className={cn('px-4 py-3 text-right tabular-nums', r.wipPcs > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground')}>
                  {formatNumber(r.wipPcs)}
                </td>
                <td className={cn('px-4 py-3 text-right tabular-nums', r.finishedPcs > 0 ? 'text-success font-medium' : 'text-muted-foreground')}>
                  {formatNumber(r.finishedPcs)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                  {formatNumber(r.onHandPcs)}
                  {r.depleted && <span className="ml-2 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">Depleted</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatCurrency(r.valueOnHand)}</td>
                <td className="px-4 py-3">
                  <Link to={`/materials/${materialId}/purchases/${r.id}`} className="text-xs font-semibold text-primary hover:underline">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

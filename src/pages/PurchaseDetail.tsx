import { ArrowLeft, ArrowRightLeft, Layers, Package, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LedgerTable } from '../components/materials/LedgerTable';
import { BucketBar } from '../components/materials/BucketBar';
import { stageCostBreakdown } from '../lib/processing/batchCosts';
import { getSortedStages } from '../lib/processing/stageProgress';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { InventoryCalculationService, batchAvailableTotal, batchRawAvailableOf, stageAvailableEntries } from '../lib/business/InventoryCalculationService';
import { useERPStore } from '../store/useERPStore';

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

/**
 * Per-purchase detail — the full story of ONE batch: where its pieces sit,
 * what it cost to buy, what each processor stage cost to work on them, and
 * the movement ledger for the batch.
 */
export function PurchaseDetail() {
  const { id: materialId, batchId } = useParams<{ id: string; batchId: string }>();
  const {
    batches, materials, suppliers, purchases, sales, products,
    processingSends, processingReceipts, processingStages,
    inventoryMovements, categories,
  } = useERPStore();

  const material = materials.find(m => m.id === materialId);
  const batch = (batches || []).find(b => b.id === batchId && b.materialId === materialId);
  const purchase = batch ? purchases.find(p => p.id === batch.purchaseId) : undefined;
  const supplier = batch ? suppliers.find(s => s.id === batch.supplierId) : undefined;
  const category = materials.find(m => m.id === materialId) ? categories.find(c => c.id === material?.categoryId) : undefined;
  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  // Stage cost breakdown scoped to this purchase
  const costScope = useMemo(
    () => (batch ? stageCostBreakdown(processingSends || [], processingReceipts || [], processingStages || [], batch.id) : null),
    [processingSends, processingReceipts, processingStages, batch],
  );

  const bucketShare = useMemo(() => {
    if (!batch) return { raw: 0, inTransit: 0, available: 0, finished: 0 };
    return {
      raw: batchRawAvailableOf(batch),
      inTransit: batch.atProcessorPcs || 0,
      available: batchAvailableTotal(batch),
      finished: batch.processedPcs || 0,
    };
  }, [batch]);

  const costPcs = batch ? InventoryCalculationService.getBatchCostPerPiece(batch) : 0;
  const valueOnHand = batch
    ? (bucketShare.raw + bucketShare.inTransit + bucketShare.available + bucketShare.finished) * costPcs
    : 0;

  const waitingFrom = useMemo(() => {
    if (!batch) return null;
    const names = new Set<string>();
    for (const entry of stageAvailableEntries(batch)) {
      if (entry.pcs <= 0) continue;
      const src = sortedStages.find(s => s.id === entry.stageId);
      if (src) names.add(src.name);
    }
    return names.size > 0 ? [...names].join(' + ') : null;
  }, [batch, sortedStages]);

  const batchMovements = useMemo(
    () => (inventoryMovements || []).filter(m => m.batchId === batchId),
    [inventoryMovements, batchId],
  );

  const salesOfBatch = useMemo(() => {
    if (!batch) return [];
    // FIFO: a sale drawing this material may have consumed pcs from this batch —
    // but per-sale attribution requires replay; show sales of the LINKED product(s)
    // only as context, never as a per-batch claim.
    const linkedProducts = products.filter(p => p.materialId === materialId || (p.components || []).some(c => c.materialId === materialId));
    const ids = new Set(linkedProducts.map(p => p.id));
    return sales.filter(s => ids.has(s.productId)).slice(0, 6);
  }, [batch, products, materialId, sales]);

  if (!material || !batch) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center animate-in fade-in">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Purchase not found</h2>
        <p className="text-sm text-muted-foreground">It may have been deleted, or the link is stale.</p>
        <Link to="/materials" className="mt-2 text-sm font-medium text-primary hover:underline">Back to Raw Materials</Link>
      </div>
    );
  }

  const statusLabel = batch.status === 'Depleted'
    ? 'Depleted'
    : bucketShare.raw > 0
      ? 'Raw'
      : bucketShare.available > 0
        ? 'Awaiting next stage'
        : bucketShare.inTransit > 0
          ? 'In processing'
          : bucketShare.finished > 0
            ? 'Finished'
            : 'Depleted';

  const statusTone = batch.status === 'Depleted'
    ? 'bg-muted text-muted-foreground'
    : bucketShare.raw > 0
      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
      : bucketShare.inTransit > 0 || bucketShare.available > 0
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  const kpis = [
    { label: 'Raw stock', pcs: bucketShare.raw, value: bucketShare.raw * costPcs, tone: 'text-foreground' },
    { label: 'At processor', pcs: bucketShare.inTransit, value: bucketShare.inTransit * costPcs, tone: 'text-warning' },
    { label: 'Awaiting next stage', pcs: bucketShare.available, value: bucketShare.available * costPcs, tone: 'text-sky-600 dark:text-sky-400' },
    { label: 'Finished', pcs: bucketShare.finished, value: bucketShare.finished * costPcs, tone: 'text-success' },
  ];

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to={`/materials/${materialId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to {material.name}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{batch.batchNo}</h1>
            {purchase && (
              <span className="font-mono text-xs text-muted-foreground border border-border rounded-md px-2 py-1">{purchase.purchaseNo}</span>
            )}
            <span className={cn('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium', statusTone)}>{statusLabel}</span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {supplier?.name ?? 'Unknown supplier'} · Purchased {formatDate(batch.date)} · {category?.name ?? 'Uncategorized'}
          </p>
        </div>
        {/* Cost of this purchase at a glance */}
        <div className="rounded-2xl border border-border bg-card px-6 py-4 shadow-sm sm:text-right">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Purchase value</div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(batch.amount || 0)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(batch.initialPcs)} PCS at {costPcs > 0 ? formatCurrency(costPcs) : '—'} / pc · {formatNumber(batch.weight || 0)} {batch.weightUnit}
          </div>
        </div>
      </div>

      {/* ── Where the pieces are + bucket bar ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4" aria-hidden="true" /> Where the pieces are right now
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            Value on hand <span className="font-medium text-foreground">{formatCurrency(valueOnHand)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl bg-muted/30 p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className={cn('mt-1.5 text-2xl font-bold tracking-tight tabular-nums', k.tone)}>{formatNumber(k.pcs)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{formatCurrency(k.value)} at purchase cost</div>
            </div>
          ))}
        </div>
        <BucketBar buckets={bucketShare} className="mt-5" />
        {waitingFrom && (
          <p className="mt-3 text-xs text-muted-foreground">
            Waiting on: <span className="font-medium text-foreground">{waitingFrom}</span> — pick the next stage in Send to Processor.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* ── Stage-by-stage cost table ─────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-sm xl:col-span-3">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wallet className="h-4 w-4" aria-hidden="true" /> Processing cost, stage by stage
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Billed amounts attribute to the stage whose receipt raised them.</p>
          </div>
          {costScope && costScope.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border/60">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Stage</th>
                    <th className="px-6 py-3 text-right font-medium">Sends</th>
                    <th className="px-6 py-3 text-right font-medium">Sent</th>
                    <th className="px-6 py-3 text-right font-medium">Recv</th>
                    <th className="px-6 py-3 text-right font-medium">Loss</th>
                    <th className="px-6 py-3 text-right font-medium">Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {costScope.rows.map(row => (
                    <tr key={row.stageId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {row.isFinalStage && <span className="mr-1.5 text-emerald-500">★</span>}
                        {row.name}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{row.dispatches}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatNumber(row.sent)}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-success">{formatNumber(row.received)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {row.loss > 0 ? <span className="text-destructive font-medium">{formatNumber(row.loss)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium text-foreground">{formatCurrency(row.billed)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border/60 bg-muted/30 text-xs font-semibold">
                  <tr>
                    <td className="px-6 py-3 text-muted-foreground">Totals</td>
                    <td className="px-6 py-3 text-right tabular-nums">{costScope.totals.dispatches}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatNumber(costScope.totals.sent)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-success">{formatNumber(costScope.totals.received)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-destructive">{costScope.totals.loss > 0 ? formatNumber(costScope.totals.loss) : '0'}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(costScope.totals.billed)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing processed from this purchase yet.
            </div>
          )}
        </section>

        {/* ── Movement ledger scoped to this batch ─────────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-sm xl:col-span-2">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Movement ledger
            </h2>
          </div>
          <LedgerTable movements={batchMovements} />
        </section>
      </div>

      {/* ── Sales context (read-only, material-level; not batch attribution) ── */}
      {salesOfBatch.length > 0 && (
        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Package className="h-4 w-4" aria-hidden="true" /> Recent sales of this material's products
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Across all batches — batch-level attribution is FIFO.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Invoice</th>
                  <th className="px-6 py-3 text-left font-medium">Date</th>
                  <th className="px-6 py-3 text-right font-medium">PCS</th>
                  <th className="px-6 py-3 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {salesOfBatch.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-foreground">{s.invoiceNo}</td>
                    <td className="px-6 py-3 text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(s.date)}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatNumber(s.pcsSold)}</td>
                    <td className="px-6 py-3 text-right tabular-nums font-medium">{formatCurrency(s.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

import { ArrowLeft, ArrowRight, ChevronRight, Package, PackageCheck, Truck, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BucketBar } from '../components/materials/BucketBar';
import { stageCostBreakdown } from '../lib/processing/batchCosts';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { InventoryCalculationService, batchAvailableTotal, batchRawAvailableOf, stageAvailableEntries } from '../lib/business/InventoryCalculationService';
import { getSortedStages } from '../lib/processing/stageProgress';
import { useERPStore } from '../store/useERPStore';

/**
 * Material overview — the purchases (batches) of one material, listed one by
 * one. Clicking a purchase opens its own route with that purchase's full
 * detail: bucket KPIs, stage-by-stage processing cost, movement ledger.
 *
 * Everything on this page is derived from the purchase/sale/send/receipt
 * history — never from a stored roll-up that could drift.
 */
export function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    materials, categories, batches, processingSends, processingReceipts,
    processingStages, suppliers, customers, products, sales, purchases,
  } = useERPStore();

  const material = materials.find(m => m.id === id);
  const category = categories.find(c => c.id === material?.categoryId);
  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  const materialBatches = useMemo(
    () => (batches || []).filter(b => b.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [batches, id],
  );

  const materialSales = useMemo(() => {
    if (!material) return [];
    const linkedIds = new Set(
      products.filter(p => p.materialId === material.id || (p.components || []).some(c => c.materialId === material.id)).map(p => p.id),
    );
    return sales.filter(s => linkedIds.has(s.productId)).slice(0, 8);
  }, [sales, products, material]);

  const materialSends = useMemo(
    () => processingSends.filter(s => s.materialId === id),
    [processingSends, id],
  );

  const stageValues = useMemo(
    () => (material ? InventoryCalculationService.getMaterialStageValues(material.id, batches || []) : null),
    [material, batches],
  );

  const processingCost = useMemo(
    () => processingReceipts.filter(r => r.materialId === id).reduce((sum, r) => sum + (r.billAmount || 0), 0),
    [processingReceipts, id],
  );

  // Per-stage processing cost — totals across the whole material
  const stageCost = useMemo(
    () => stageCostBreakdown(processingSends || [], processingReceipts || [], processingStages || []),
    [processingSends, processingReceipts, processingStages],
  );

  const getSupplierName = (supplierId: string) => suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
  const getPurchaseNo = (purchaseId: string) => purchases.find(p => p.id === purchaseId)?.purchaseNo;

  const bucketTotals = (b: NonNullable<typeof materialBatches[number]>) => {
    const raw = batchRawAvailableOf(b);
    const inTransit = b.atProcessorPcs || 0;
    const available = batchAvailableTotal(b);
    const finished = b.processedPcs || 0;
    return { raw, inTransit, available, finished, total: raw + inTransit + available + finished };
  };

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center animate-in fade-in">
        <Package className="h-10 w-10 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Material not found</h2>
        <Link to="/materials" className="text-sm font-medium text-primary hover:underline">Back to Raw Materials</Link>
      </div>
    );
  }

  const usageTypeBadge = material.usageType === 'component'
    ? { label: 'Part of a product', tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' }
    : { label: 'Product on its own', tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  const pathLabel = {
    full_chain: 'Full chain',
    single_stage: 'Single processor',
    custom_stages: 'Selected processors',
    ready_made: 'Ready-made',
  }[material.processingPath ?? 'full_chain'];

  const kpis = [
    { label: 'Raw stock', value: stageValues?.raw.pcs ?? 0, money: stageValues?.raw.value ?? 0, tone: 'text-foreground' },
    { label: 'At processor', value: stageValues?.atProcessor.pcs ?? 0, money: stageValues?.atProcessor.value ?? 0, tone: 'text-warning' },
    { label: 'Finished stock', value: stageValues?.finished.pcs ?? 0, money: stageValues?.finished.value ?? 0, tone: 'text-success' },
    { label: 'Processing cost', value: null as number | null, money: processingCost, tone: 'text-info' },
  ];

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link to="/materials" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Raw Materials
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{material.name}</h1>
            {material.code && (
              <span className="font-mono text-xs text-muted-foreground border border-border rounded-md px-2 py-1">{material.code}</span>
            )}
            <span className={cn('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium', usageTypeBadge.tone)}>
              {usageTypeBadge.label}
            </span>
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
              material.status === 'Active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
            )}>
              {material.status}
            </span>
            <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-muted/60 text-muted-foreground">
              {pathLabel}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {category?.name ?? 'Uncategorized'}{material.description ? ` · ${material.description}` : ''}
          </p>
        </div>
      </div>

      {/* ── Stock KPIs ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
            {k.value !== null ? (
              <>
                <div className={cn('mt-1.5 text-2xl font-bold tracking-tight tabular-nums', k.tone)}>{formatNumber(k.value)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{formatCurrency(k.money)} at purchase cost</div>
              </>
            ) : (
              <>
                <div className={cn('mt-1.5 text-2xl font-bold tracking-tight tabular-nums', k.tone)}>{formatCurrency(k.money)}</div>
                <div className="text-xs text-muted-foreground">Σ processor bills for this material</div>
              </>
            )}
          </div>
        ))}
      </section>

      {/* ── Purchases — each goes to its own detail route ──────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Purchases</h2>
            <p className="text-xs text-muted-foreground">Newest first · click a batch to open its full cost and ledger</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{materialBatches.length} {materialBatches.length === 1 ? 'batch' : 'batches'}</span>
        </div>

        {materialBatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-14 text-center">
            <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">No purchases recorded</p>
            <p className="mt-1 text-xs text-muted-foreground">Batches appear here once this material is purchased.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {materialBatches.map(b => {
              const bucket = bucketTotals(b);
              const costPcs = InventoryCalculationService.getBatchCostPerPiece(b);
              const status = b.status === 'Depleted'
                ? 'Depleted'
                : bucket.raw > 0
                  ? 'Raw'
                  : bucket.available > 0 || bucket.inTransit > 0
                    ? 'In processing'
                    : 'Finished';
              const statusTone = status === 'Depleted'
                ? 'bg-muted text-muted-foreground'
                : status === 'Raw'
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  : status === 'In processing'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
              const po = getPurchaseNo(b.purchaseId);
              return (
                <li key={b.id}>
                  <Link
                    to={`/materials/${id}/purchases/${b.id}`}
                    className="group grid grid-cols-12 items-center gap-3 py-4 pl-4 pr-2 transition-colors hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-lg"
                  >
                    <div className="col-span-3 min-w-0 sm:col-span-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{b.batchNo}</span>
                      {po && <span className="block font-mono text-[10px] text-muted-foreground">{po}</span>}
                    </div>
                    <div className="col-span-9 min-w-0 sm:col-span-4 md:col-span-3">
                      <p className="truncate text-sm font-medium text-foreground">{getSupplierName(b.supplierId)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{new Date(b.date).toLocaleDateString()} · {formatNumber(b.initialPcs)} PCS · {formatCurrency(b.amount)}</p>
                    </div>
                    <div className="col-span-12 min-w-0 md:col-span-5 hidden md:block">
                      <BucketBar buckets={bucket} />
                    </div>
                    <div className="col-span-8 xs:col-span-6 sm:col-span-4 md:col-span-1 flex items-center justify-end gap-2">
                      <span className={cn('inline-flex shrink-0 items-center rounded-md px-2 py-1 text-[10px] font-medium', statusTone)}>
                        {status}
                      </span>
                    </div>
                    <div className="col-span-4 xs:col-span-6 sm:col-span-1 flex items-center justify-end">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Processing cost — material totals ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <section className="rounded-2xl border border-border bg-card shadow-sm xl:col-span-3">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="text-sm font-semibold text-foreground">Processing cost, stage by stage</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Billed amounts across all batches of this material</p>
          </div>
          {stageCost.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border/60">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Stage</th>
                    <th className="px-6 py-3 text-right font-medium">Sends</th>
                    <th className="px-6 py-3 text-right font-medium">Received</th>
                    <th className="px-6 py-3 text-right font-medium">Loss</th>
                    <th className="px-6 py-3 text-right font-medium">Billed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {stageCost.rows.map(row => (
                    <tr key={row.stageId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {row.isFinalStage && <span className="mr-1.5 text-emerald-500">★</span>}
                        {row.name}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{row.dispatches}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-success">{formatNumber(row.received)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        {row.loss > 0 ? <span className="text-destructive font-medium">{formatNumber(row.loss)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{formatCurrency(row.billed)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border/60 bg-muted/30 text-xs font-semibold">
                  <tr>
                    <td className="px-6 py-3 text-muted-foreground">Totals</td>
                    <td className="px-6 py-3 text-right tabular-nums">{stageCost.totals.dispatches}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-success">{formatNumber(stageCost.totals.received)}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-destructive">{stageCost.totals.loss > 0 ? formatNumber(stageCost.totals.loss) : '0'}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{formatCurrency(stageCost.totals.billed)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">Nothing processed from this material yet.</div>
          )}
        </section>

        {/* ── Recent sales (read-only, material-level) ──────────────────── */}
        <section className="rounded-2xl border border-border bg-card shadow-sm xl:col-span-2">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="text-sm font-semibold text-foreground">Recent sales</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Sells linked to this material's products</p>
          </div>
          {materialSales.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">No sales recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border/60">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Invoice</th>
                    <th className="px-6 py-3 text-right font-medium">PCS</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialSales.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3 font-medium text-foreground">{s.invoiceNo}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatNumber(s.pcsSold)}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-medium">{formatCurrency(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

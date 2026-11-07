import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Layers,
  Package,
  PackageCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InventoryCalculationService, stageAvailableEntries } from '../lib/business/InventoryCalculationService';
import { materialCostSummary } from '../lib/processing/batchCosts';
import { getMaterialBatchProgress, getSortedStages } from '../lib/processing/stageProgress';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

/** Collapsible tall section — no scroll traps, opens inline. */
function Expander({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/30 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle && <span className="ml-auto text-xs text-muted-foreground">{subtitle}</span>}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="p-0">{children}</div>}
    </div>
  );
}

/** Micro-bar inside a status badge showing raw / WIP / finished split. */
function BucketBar({
  raw,
  wip,
  finished,
}: {
  raw: number;
  wip: number;
  finished: number;
}) {
  const total = raw + wip + finished;
  return (
    <div className="h-1 w-4 rounded-full border border-white/20 overflow-hidden flex">
      {raw > 0 && <div className="h-full w-[calc({raw}*100%)] bg-muted/40" style={{ width: `${Math.max(1, (raw / total) * 100)}%` }} />}
      {wip > 0 && <div className="h-full bg-amber-500/60" style={{ width: `${Math.max(1, (wip / total) * 100)}%` }} />}
      {finished > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${Math.max(1, (finished / total) * 100)}%` }} />}
    </div>
  );
}

export function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    materials, categories, batches, processingSends, purchases,
    products, sales, inventoryMovements,
    suppliers, processors, processingStages, customers, processingReceipts,
  } = useERPStore();

  const material = materials.find(m => m.id === id);
  const category = categories.find(c => c.id === material?.categoryId);
  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  const materialBatches = useMemo(() => {
    return (batches || []).filter(b => b.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, id]);

  const materialMovements = useMemo(() => {
    return (inventoryMovements || []).filter(m => m.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [inventoryMovements, id]);

  const materialSends = useMemo(() => {
    return processingSends.filter(s => s.materialId === id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [processingSends, id]);

  const materialProducts = useMemo(() => {
    return products.filter(p => p.materialId === id);
  }, [products, id]);

  const productIds = materialProducts.map(p => p.id);

  const materialSales = useMemo(() => {
    return sales.filter(s => productIds.includes(s.productId)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, productIds.join('|')]);

  // ── Derived quantities (single source: batches + history) ─────────────────
  const stageValues = useMemo(
    () => (material ? InventoryCalculationService.getMaterialStageValues(material.id, batches || []) : null),
    [material, batches]
  );

  const materialCost = useMemo(() => {
    if (!material || materialBatches.length === 0) return null;
    return materialCostSummary(materialBatches, processingSends, processingStages, processingReceipts);
  }, [materialBatches, processingSends, processingStages, processingReceipts]);

  const batchProgress = useMemo(
    () => (material ? getMaterialBatchProgress(material.id, batches || [], sortedStages) : []),
    [material, batches, sortedStages]
  );

  // Stage-position roll-up: where the material's pcs physically sit right now.
  const positions = useMemo(() => {
    const pos = {
      raw: 0, inTransit: 0, available: 0, finished: 0,
      availableFromStage: null as string | null,
    };
    for (const p of batchProgress) {
      pos.raw += p.rawPcs;
      pos.inTransit += p.inTransitPcs;
      pos.available += p.availablePcs;
      pos.finished += p.finishedPcs;
    }
    const srcNames = new Set<string>();
    for (const p of batchProgress) {
      for (const e of stageAvailableEntries(p.batch)) {
        if (e.pcs <= 0) continue;
        const src = sortedStages.find(s => s.id === e.stageId);
        if (src) srcNames.add(src.name);
      }
    }
    if (srcNames.size > 0) pos.availableFromStage = [...srcNames].join(' + ');
    return pos;
  }, [batchProgress, sortedStages]);

  // Per-stage WIP from the movement history (same basis as the dashboard).
  const stageWip = useMemo(() => sortedStages
    .filter(s => !s.isFinalStage)
    .map(stage => ({
      stage,
      pcs: InventoryCalculationService.getStageWIP(stage.id, processingSends || [], processingReceipts || [], id),
    })), [sortedStages, processingSends, processingReceipts, id]);

  // Loss / yield analytics across the whole chain.
  const totals = useMemo(() => {
    const sent = materialSends.reduce((s, x) => s + (x.pcsSent || 0), 0);
    const loss = materialSends.reduce((s, x) => s + (x.lossQuantity || 0), 0);
    const received = materialSends.reduce((s, x) => s + (x.pcsReceived || 0), 0);
    const purchaseValue = materialBatches.reduce((s, b) => s + (b.amount || 0), 0);
    const processingCost = processingReceipts
      .filter(r => r.materialId === material?.id)
      .reduce((s, r) => s + (r.billAmount || 0), 0);
    const salesValue = materialSales.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const cogs = materialSales.reduce((s, x) => {
      const fifo = InventoryCalculationService.getFIFOCOGSForSale(material!.id, x.pcsSold, batches || []);
      return s + fifo.cogs;
    }, 0);
    return {
      sent, loss, received,
      yieldPct: sent > 0 ? Math.round(((received) / sent) * 100) : null,
      lossPct: sent > 0 ? Math.round((loss / sent) * 1000) / 10 : null,
      purchaseValue, processingCost, salesValue, cogs,
      grossMargin: salesValue - cogs,
      processingCostPerPiece: received > 0 ? processingCost / received : (sent > 0 ? processingCost / sent : 0),
    };
  }, [materialSends, materialBatches, materialSales, batches, material, processingReceipts]);

  if (!material) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Package className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Material Not Found</h2>
        <Link to="/materials" className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to Materials
        </Link>
      </div>
    );
  }

  const getSupplierName = (supplierId: string) => suppliers.find(s => s.id === supplierId)?.name || 'Unknown';
  const getProcessorName = (processorId: string) => processors.find(p => p.id === processorId)?.name || 'Unknown';
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || 'Unknown';
  const getCustomerName = (customerId: string) => customers.find(c => c.id === customerId)?.name || 'Unknown';

  // FIFO profit per sale (batch cost of the pcs this sale consumed).
  const saleProfit = (saleId: string, pcsSold: number) => {
    const fifo = InventoryCalculationService.getFIFOCOGSForSale(material.id, pcsSold, batches || []);
    const sale = materialSales.find(s => s.id === saleId);
    return sale ? sale.totalAmount - fifo.cogs : 0;
  };

  // ── Group purchases by supplier for the card list ───────────────────────
  const purchasesBySupplier = useMemo(() => {
    const bySupplier = new Map<string, { supplierName: string; batches: typeof materialBatches }>();
    for (const b of materialBatches) {
      const purchase = purchases.find(x => x.id === b.purchaseId);
      const supplierName = purchase ? getSupplierName(purchase.supplierId) : 'Unknown supplier';
      const entry = bySupplier.get(supplierName) || { supplierName, batches: [] };
      entry.batches.push(b);
      bySupplier.set(supplierName, entry);
    }
    return [...bySupplier.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [materialBatches, purchases]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-4">
        <Link to="/materials" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{material.name}</h2>
            <span className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
              material.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
            )}>
              {material.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{category?.name || 'Uncategorized'} • {material.description || 'No description'}</p>
        </div>
      </div>

      {/* ── Header summary strip — one row, no boxed KPI cards ── */}
      <section className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-border bg-card px-6 py-5 shadow-sm">
        <div className="min-w-[120px]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Raw Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatNumber(stageValues?.raw.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.raw.value ?? 0)} on hand</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">At Processor (WIP)</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-amber-500">{formatNumber(stageValues?.atProcessor.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-amber-500/70">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.atProcessor.value ?? 0)} on hand</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Finished Stock</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-success">{formatNumber(stageValues?.finished.pcs ?? 0)}<span className="ml-1.5 text-sm font-medium text-success/70">PCS</span></div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(stageValues?.finished.value ?? 0)} on hand</div>
        </div>
        <div className="border-l border-border/60 pl-10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Processing cost / piece</div>
          <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-info">{formatCurrency(totals.processingCostPerPiece)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(totals.processingCost)} total spent on processing</div>
        </div>
      </section>

      {/* ── Per-stage processing cost table (material level) ── */}
      {materialCost && (
        <Expander title="Per-stage processing cost" icon={<Clock className="h-4 w-4" />}>
          <div className="rounded-xl border border-border bg-muted/20">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/60 sticky top-0 border-b border-border/60">
                <tr>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium text-right">Dispatched</th>
                  <th className="px-5 py-3 font-medium text-right">Sent</th>
                  <th className="px-5 py-3 font-medium text-right">Received</th>
                  <th className="px-5 py-3 font-medium text-right">Bill amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {materialCost.lines.length > 0 ? (
                  materialCost.lines.map(l => (
                    <tr key={l.name} className="hover:bg-muted/80 transition-colors">
                      <td className="px-5 py-3 text-foreground">{l.name}</td>
                      <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(l.dispatches)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(l.sent)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(l.received)}</td>
                      <td className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(l.billed)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No processing cost recorded</td>
                  </tr>
                )}
              </tbody>
              {materialCost.lines.length > 0 && (
                <tfoot className="border-t border-border/60 bg-muted/40">
                  <tr>
                    <th className="px-5 py-3 font-medium text-foreground">Total</th>
                    <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.dispatches, 0))}</th>
                    <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.sent, 0))}</th>
                    <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(materialCost.lines.reduce((s, l) => s + l.received, 0))}</th>
                    <th className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(materialCost.processingCost)}</th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Expander>
      )}

      {/* ── Where the pieces sit right now ── */}
      <Expander title="Where the pieces are right now" icon={<Layers className="h-4 w-4" />} subtitle={
        <span className="text-xs text-muted-foreground">
          Total tracked: {formatNumber(positions.raw + positions.inTransit + positions.available + positions.finished)} PCS
          · Dispatched {formatNumber(totals.sent)} · Received back {formatNumber(totals.received)}
          {totals.yieldPct != null && <> · Return yield {totals.yieldPct}%</>}
          {totals.lossPct != null && totals.loss > 0 && <> · <span className="text-destructive font-medium">Loss {formatNumber(totals.loss)} PCS ({totals.lossPct}%)</span></>}
        </span>
      }>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Package className="h-3.5 w-3.5" /> Raw — ready for stage 1</div>
            <div className="text-xl font-bold text-foreground">{formatNumber(positions.raw)} <span className="text-xs font-medium text-muted-foreground">PCS</span></div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Truck className="h-3.5 w-3.5" /> Out with processors</div>
            <div className="text-xl font-bold text-foreground">{formatNumber(positions.inTransit)} <span className="text-xs font-medium text-muted-foreground">PCS</span></div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Received — awaiting next stage
              {positions.availableFromStage && <span className="font-medium text-foreground/70"> (from {positions.availableFromStage})</span>}
            </div>
            <div className="text-xl font-bold text-foreground">{formatNumber(positions.available)} <span className="text-xs font-medium text-muted-foreground">PCS</span></div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><PackageCheck className="h-3.5 w-3.5" /> Finished — sellable</div>
            <div className="text-xl font-bold text-foreground">{formatNumber(positions.finished)} <span className="text-xs font-medium text-muted-foreground">PCS</span></div>
          </div>
        </div>
        {stageWip.some(s => s.pcs > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {stageWip.filter(s => s.pcs > 0).map(({ stage, pcs }) => (
              <span key={stage.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {stage.name}: <span className="font-semibold">{formatNumber(pcs)} PCS</span> in transit
              </span>
            ))}
          </div>
        )}
      </Expander>

      {/* ── Purchases grouped by supplier ── */}
      <Expander title="Purchases" icon={<Package className="h-4 w-4" />} subtitle={
        <span className="text-xs text-muted-foreground">{materialBatches.length} purchase{s(materialBatches.length)} · {formatCurrency(materialCost?.purchaseCost ?? 0)} purchase value</span>
      }>
        <div className="space-y-4">
          {purchasesBySupplier.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No purchases recorded yet.</div>
          ) : (
            purchasesBySupplier.map(({ supplierName, batches: supplierBatches }) => (
              <div key={supplierName} className="space-y-3">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
                  <span className="font-semibold text-foreground">{supplierName}</span>
                  <span className="text-xs font-medium text-muted-foreground">{supplierBatches.length} purchase{s(supplierBatches.length)}</span>
                </div>
                <div className="space-y-2">
                  {supplierBatches.map(b => {
                    const purchase = purchases.find(x => x.id === b.purchaseId);
                    const prog = batchProgress.find(x => x.batch.id === b.id);
                    const costPcs = InventoryCalculationService.getBatchCostPerPiece(b);
                    const availPcs = prog?.availablePcs ?? 0;
                    const sendsHere = materialSends.filter(x => x.batchId === b.id);
                    const sendIds = new Set(sendsHere.map(x => x.id));
                    const receiptsHere = processingReceipts.filter(r => sendIds.has(r.sendId));
                    const recvPcs = receiptsHere.reduce((sum2, r) => sum2 + (r.pcsReceived || 0), 0);
                    const costBilled = receiptsHere.reduce((sum2, r) => sum2 + (r.billAmount || 0), 0);
                    const procCostPerPiece = recvPcs > 0 ? costBilled / recvPcs : 0;
                    const sentPcs = sendsHere.reduce((sum2, x) => sum2 + (x.pcsSent || 0), 0);
                    const lossPcs = sendsHere.reduce((sum2, x) => sum2 + (x.lossQuantity || 0), 0);
                    const pending = Math.max(0, sentPcs - recvPcs - lossPcs);
                    const onHand = (prog?.rawPcs || 0) + (b.atProcessorPcs || 0) + availPcs + (prog?.finishedPcs || 0);
                    const valueOnHand = onHand * costPcs;
                    const PO = purchase?.purchaseNo || '—';
                    return (
                      <article key={b.id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden group cursor-pointer">
                        {/* Purchase header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-5 py-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <Link to={`/materials/${id}/purchases/${b.id}`} className="group text-sm font-semibold text-foreground hover:text-primary">
                              <span className="block text-xs font-normal text-muted-foreground">{PO}</span>
                              {b.batchNo}
                            </Link>
                            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                              {getSupplierName(b.supplierId)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {b.processingPath === 'ready_made' ? 'Ready-made' : 'Full chain'}
                            </span>
                            {/* Status badge + bucket micro-bars */}
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-[10px] font-bold uppercase tracking-wider">
                              {onHand > 0 ? (
                                <>
                                  <span className={onHand === b.initialPcs ? 'text-success' : 'text-amber-500'}>{formatNumber(onHand)} on hand</span>
                                  <BucketBar
                                    raw={prog?.rawPcs ?? 0}
                                    wip={b.atProcessorPcs || 0}
                                    finished={prog?.finishedPcs ?? 0}
                                  />
                                </>
                              ) : (
                                <span className="text-destructive">Depleted</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Purchase numbers */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40">
                          {[
                            { label: 'Weight', value: `${formatNumber(b.weight)} ${b.weightUnit || ''}` },
                            { label: 'Pieces', value: formatNumber(b.initialPcs) },
                            { label: 'Rate', value: `${formatCurrency(b.ratePerUnit)} / ${b.weightUnit || 'unit'}` },
                            { label: 'Amount', value: formatCurrency(b.amount) },
                          ].map(cell => (
                            <div key={cell.label} className="bg-card px-4 py-3">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{cell.label}</div>
                              <div className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{cell.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Processing economics of THIS purchase */}
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-border/60 px-5 py-3">
                          <div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Processing cost / piece</div>
                            <div className="mt-0.5 text-sm font-semibold tabular-nums text-info">{formatCurrency(procCostPerPiece)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Processing</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">Sent {formatNumber(sentPcs)} · Recv {formatNumber(recvPcs)} · Loss {formatNumber(lossPcs)}{pending > 0 ? ` · Pending ${formatNumber(pending)}` : ''}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Cost / piece</div>
                            <div className="mt-0.5 text-xs font-medium tabular-nums text-foreground">{costPcs > 0 ? formatCurrency(costPcs) : '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Value on hand</div>
                            <div className="mt-0.5 text-xs font-medium tabular-nums text-foreground">{formatCurrency(valueOnHand)}</div>
                          </div>
                        </div>
                        <div className="border-t border-border/60 px-5 py-3">
                          <div className="flex items-center justify-between">
                            <Link to={`/materials/${id}/purchases/${b.id}`} className="text-xs font-semibold text-primary hover:underline">
                              Open purchase detail →
                            </Link>
                            <span className="text-xs text-muted-foreground">{format(new Date(b.date), 'd MMM yyyy')}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </Expander>

      {/* ── Movement ledger ── */}
      <Expander title="Movement Ledger" icon={<ArrowRightLeft className="h-4 w-4" />} subtitle={materialMovements.length ? `${materialMovements.length} movement${materialMovements.length === 1 ? '' : 's'}` : 'No movements'}>
        {materialMovements.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">No movements recorded.</div>
        ) : (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Ref</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materialMovements.map(m => (
                <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{format(new Date(m.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div>{m.referenceNo}</div>
                    <div className="text-xs text-muted-foreground font-normal">{m.module}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                      m.transactionType === 'IN' ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    )}>
                      {m.transactionType === 'IN' ? <ArrowDown className="w-3 h-3 mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                      {m.transactionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(m.quantity)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(m.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Expander>

      {/* ── Processing history ── */}
      <Expander title="Processing History" icon={<Truck className="h-4 w-4" />} subtitle={materialSends.length ? `${materialSends.length} dispatch${materialSends.length === 1 ? '' : 'es'}` : 'No processing history'}>
        {materialSends.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">No processing history.</div>
        ) : (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Ref</th>
                <th className="px-4 py-3 font-medium">Processor</th>
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium text-right">Sent</th>
                <th className="px-4 py-3 font-medium text-right">Recv</th>
                <th className="px-4 py-3 font-medium text-right">Loss</th>
                <th className="px-4 py-3 font-medium text-right">Pending</th>
                <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materialSends.map(s => {
                const stage = sortedStages.find(st => st.id === s.stageId);
                const batch = (batches || []).find(b => b.id === s.batchId);
                const pending = (s.pcsSent || 0) - (s.pcsReceived || 0) - (s.lossQuantity || 0);
                const rateMethod = stage?.rateMethod || 'per_piece';
                const estCost = rateMethod === 'per_kg'
                  ? (s.pcsReceived || 0) * (batch?.weightPerPiece || 0) * (s.ratePerPiece || 0)
                  : (s.pcsReceived || 0) * (s.ratePerPiece || 0);
                return (
                  <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.dispatchNo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{getProcessorName(s.processorId)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{batch?.batchNo || '—'}</td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatNumber(s.pcsSent)}</td>
                    <td className="px-4 py-3 text-right text-success tabular-nums">{formatNumber(s.pcsReceived)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(s.lossQuantity || 0) > 0
                        ? <span className="text-destructive font-medium">{formatNumber(s.lossQuantity || 0)}</span>
                        : <AlertTriangle className="inline h-3 w-3 text-muted-foreground/25" aria-hidden="true" />}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {pending > 0
                        ? <span className="text-warning font-bold">{formatNumber(pending)}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{estCost > 0 ? formatCurrency(estCost) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Expander>

      {/* ── Sales ── */}
      <Expander title="Sales History" icon={<Wallet className="h-4 w-4" />} subtitle={materialSales.length ? `${materialSales.length} sale${materialSales.length === 1 ? '' : 's'} · ${formatCurrency(totals.salesValue)} revenue` : 'No sales'}>
        {materialSales.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">No sales recorded.</div>
        ) : (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Revenue</th>
                <th className="px-4 py-3 font-medium text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {materialSales.map(s => (
                <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{format(new Date(s.date), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{s.invoiceNo}</td>
                  <td className="px-4 py-3 text-muted-foreground">{getCustomerName(s.customerId)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{getProductName(s.productId)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(s.pcsSold)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(s.totalAmount)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", saleProfit(s.id, s.pcsSold) >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(saleProfit(s.id, s.pcsSold))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Expander>
    </div>
  );
}

function s(n: number): string {
  return n === 1 ? '' : 's';
}

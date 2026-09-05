import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  CheckCircle2,
  Clock,
  Layers,
  Package,
  PackageCheck,
  Target,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { getMaterialBatchProgress, getSortedStages } from '../lib/processing/stageProgress';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

/**
 * Material detail — the full lifecycle view of one raw material.
 *
 * Everything shown is DERIVED from the authoritative records (purchases, sends,
 * receipts, sales) — no counter is displayed without its matching derivation,
 * so the page can never disagree with the processing engine:
 *  - KPI values come from InventoryCalculationService.getMaterialStageValues
 *    (actual purchase cost per batch, never a blended average).
 *  - The stage-position strip uses the same per-batch progress derivation as
 *    the Send form, so "where are my pcs right now" matches what the user can
 *    actually send next.
 *  - The profit column is the only presentational addition (sale price vs the
 *    FIFO batch cost of the pcs each sale consumed).
 */
export function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    materials, categories, batches, processingSends,
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
      if (p.availablePcs > 0 && p.batch.availableFromStageId) {
        const src = sortedStages.find(s => s.id === p.batch.availableFromStageId);
        if (src) pos.availableFromStage = src.name;
      }
    }
    return pos;
  }, [batchProgress, sortedStages]);

  // Per-stage WIP from the movement history (same basis as the dashboard).
  const stageWip = useMemo(() => sortedStages
    .filter(s => !s.isFinalStage)
    .map(stage => ({
      stage,
      pcs: InventoryCalculationService.getStageWIP(stage.id, processingSends, processingReceipts),
    })), [sortedStages, processingSends, processingReceipts]);

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

      {/* ── Stock KPIs with true values ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Package className="h-5 w-5" />
            <span className="text-sm font-medium">Raw Stock</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{formatNumber(stageValues?.raw.pcs ?? 0)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="text-xs text-muted-foreground mt-1">{formatCurrency(stageValues?.raw.value ?? 0)} at purchase cost</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium">At Processor (WIP)</span>
          </div>
          <div className="text-3xl font-bold text-warning">{formatNumber(stageValues?.atProcessor.pcs ?? 0)} <span className="text-sm font-medium text-amber-500/70">PCS</span></div>
          <div className="text-xs text-muted-foreground mt-1">{formatCurrency(stageValues?.atProcessor.value ?? 0)} at purchase cost</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Target className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">Finished Stock</span>
          </div>
          <div className="text-3xl font-bold text-success">{formatNumber(stageValues?.finished.pcs ?? 0)} <span className="text-sm font-medium text-emerald-500/70">PCS</span></div>
          <div className="text-xs text-muted-foreground mt-1">{formatCurrency(stageValues?.finished.value ?? 0)} at purchase cost</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Wallet className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-medium">Lifetime Processing Cost</span>
          </div>
          <div className="text-3xl font-bold text-info">{formatCurrency(totals.processingCost)}</div>
          <div className="text-xs text-muted-foreground mt-1">Σ processor bills for this material</div>
        </div>
      </div>

      {/* ── Stage-position strip: exactly where the pcs sit right now ───── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4" /> Where the pieces are right now
          </h3>
          <span className="text-xs text-muted-foreground">
            Total tracked: {formatNumber(positions.raw + positions.inTransit + positions.available + positions.finished)} PCS
            · Dispatched {formatNumber(totals.sent)} · Received back {formatNumber(totals.received)}
            {totals.yieldPct != null && <> · Return yield {totals.yieldPct}%</>}
            {totals.lossPct != null && totals.loss > 0 && <> · <span className="text-destructive font-medium">Loss {formatNumber(totals.loss)} PCS ({totals.lossPct}%)</span></>}
          </span>
        </div>
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
        {/* Per-stage WIP dots */}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* ── Movement ledger ─────────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" /> Movement Ledger
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
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
                  {materialMovements.length > 0 ? (
                    materialMovements.map(m => (
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No movements recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Batches with value + stage position ─────────────────────── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[460px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Batches</h3>
              <span className="text-xs text-muted-foreground">Value at each batch's own purchase rate</span>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-muted-foreground bg-card sticky top-0 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch No</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium text-right">Initial</th>
                    <th className="px-4 py-3 font-medium text-right">Raw</th>
                    <th className="px-4 py-3 font-medium text-right">WIP</th>
                    <th className="px-4 py-3 font-medium text-right">Avail</th>
                    <th className="px-4 py-3 font-medium text-right">Finished</th>
                    <th className="px-4 py-3 font-medium text-right">Cost/PCS</th>
                    <th className="px-4 py-3 font-medium text-right">Value on hand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {materialBatches.length > 0 ? (
                    materialBatches.map(b => {
                      const prog = batchProgress.find(p => p.batch.id === b.id);
                      const costPcs = InventoryCalculationService.getBatchCostPerPiece(b);
                      // Everything still on hand for this batch: raw + WIP +
                      // awaiting-next-stage + finished-not-yet-sold (the same
                      // Raw+WIP+Finished basis the Dashboard reconciles on).
                      const valueOnHand = ((prog?.rawPcs || 0) + (b.atProcessorPcs || 0) + (b.stageAvailablePcs || 0) + (prog?.finishedPcs || 0)) * costPcs;
                      return (
                        <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{b.batchNo}</td>
                          <td className="px-4 py-3 text-muted-foreground">{getSupplierName(b.supplierId)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(b.initialPcs)}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(prog?.rawPcs ?? 0)}</td>
                          <td className="px-4 py-3 text-right text-warning tabular-nums">{formatNumber(b.atProcessorPcs || 0)}</td>
                          <td className="px-4 py-3 text-right text-info tabular-nums">{formatNumber(b.stageAvailablePcs || 0)}</td>
                          <td className="px-4 py-3 text-right text-success tabular-nums">{formatNumber(prog?.finishedPcs ?? 0)}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{costPcs > 0 ? formatCurrency(costPcs) : '—'}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(valueOnHand)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No batches recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Processing history with pending/loss and per-batch trail ── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[460px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Processing History</h3>
              {materialSends.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Sent {formatNumber(totals.sent)} · Recv {formatNumber(totals.received)} · Loss {formatNumber(totals.loss)}
                </span>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-0">
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
                  {materialSends.length > 0 ? (
                    materialSends.map(s => {
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No processing history</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Sales with per-sale FIFO profit ─────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden flex flex-col max-h-[460px]">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-muted/40">
              <h3 className="font-semibold text-foreground">Sales History</h3>
              {materialSales.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Revenue {formatCurrency(totals.salesValue)} · COGS {formatCurrency(totals.cogs)} ·
                  <span className={cn("font-semibold ml-1", totals.grossMargin >= 0 ? "text-success" : "text-destructive")}>
                    Margin {formatCurrency(totals.grossMargin)}
                  </span>
                </span>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-0">
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
                  {materialSales.length > 0 ? (
                    materialSales.map(s => (
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
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No sales history</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

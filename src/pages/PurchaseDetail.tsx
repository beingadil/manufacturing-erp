import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import {
  type BatchCostBreakdown,
  batchCostBreakdown,
} from '../lib/processing/batchCosts';
import { cn, formatCurrency, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';

export function PurchaseDetail() {
  const { id: materialId, batchId } = useParams<{ id: string; batchId: string }>();
  if (!materialId || !batchId) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Package className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Purchase not found</h2>
        <Link to="/materials" className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to materials
        </Link>
      </div>
    );
  }
  const {
    batches,
    processingSends,
    processingReceipts,
    processingStages,
    materials,
    suppliers,
    purchases,
  } = useERPStore();

  const batch = batches.find(b => b.id === batchId);
  const material = materials.find(m => m.id === materialId);
  const purchase = purchases.find(p => p.id === batch?.purchaseId);
  const supplier = batch ? suppliers.find(s => s.id === batch.supplierId) : undefined;
  const sortedStages = useMemo(
    () => [...processingStages].sort((a, b) => a.sequence - b.sequence),
    [processingStages],
  );

  const cost = useMemo<BatchCostBreakdown | null>(() => {
    if (!batch) return null;
    return batchCostBreakdown(batch, processingSends, sortedStages, processingReceipts);
  }, [batch, processingSends, sortedStages, processingReceipts]);

  const _stageValues = useMemo(() => {
    if (!batch) return null;
    return InventoryCalculationService.getMaterialStageValues(materialId, batches);
  }, [materialId, batches]);

  if (!batch || !material || !cost) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Package className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Purchase not found</h2>
        <Link to={`/materials/${materialId}`} className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to material
        </Link>
      </div>
    );
  }

  const finishedPcs = batch.processedPcs || 0;
  const _costPerFinishedPcs = finishedPcs > 0 ? cost.totalCostPerPcs * batch.initialPcs : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-4">
        <Link to={`/materials/${materialId}`} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{batch.batchNo}</h2>
            <span className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
              batch.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
            )}>
              {batch.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{material.name}</p>
        </div>
      </div>

      {/* ── Supplier / PO header ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Supplier</span>
            <span className="text-lg font-bold text-foreground">{supplier?.name || 'Unknown'}</span>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchase date</span>
            <span className="text-lg font-bold text-foreground">{new Date(batch.date).toLocaleDateString()}</span>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Path</span>
            <span className="text-lg font-bold text-foreground">{batch.processingPath || 'full_chain'}</span>
          </div>
        </div>
        {batch.weight > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Weight & unit cost</span>
            <span className="text-lg font-bold text-foreground">{formatNumber(batch.weight)} {batch.weightUnit} · {formatCurrency(batch.ratePerUnit)} /unit</span>
          </div>
        )}
      </div>

      {/* ── Bucket KPIs for this purchase ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-muted/20 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Package className="h-5 w-5" />
            <span className="text-sm font-medium">Purchased</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{formatNumber(batch.initialPcs)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="text-xs text-muted-foreground mt-1">{formatCurrency(cost.purchaseCost)} purchase cost</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <PackageCheck className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium">Finished stock</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{formatNumber(finishedPcs)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="text-xs text-muted-foreground mt-1">{finishedPcs > 0 ? formatCurrency(finishedPcs * cost.totalCostPerPcs) + ' value on hand' : 'no finished pcs yet'}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Wallet className="h-5 w-5 text-info" />
            <span className="text-sm font-medium">True cost / PCS</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{formatCurrency(cost.totalCostPerPcs)}</div>
          <div className="text-xs text-muted-foreground mt-1">{cost.purchaseCostPerPcs > 0 ? formatCurrency(cost.purchaseCostPerPcs) + ' purchase + ' + formatCurrency(cost.processingCost / batch.initialPcs) + ' processing' : ''}</div>
        </div>
      </div>

      {/* ── Per-stage processing cost table ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Per-stage processing cost
          </h3>
          <span className="text-xs text-muted-foreground">
            {formatCurrency(cost.processingCost)} across {cost.lines.length} stage{s(cost.lines.length)}
          </span>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/60 sticky top-0 border-b border-border/60">
            <tr>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium text-right">Bill amount</th>
              <th className="px-5 py-3 font-medium text-right">PCS received</th>
              <th className="px-5 py-3 font-medium text-right">Cost / PCS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {cost.lines.length > 0 ? (
              cost.lines.map(l => (
                <tr key={`${l.sequence}-${l.stageName}`} className="hover:bg-muted/80 transition-colors">
                  <td className="px-5 py-3 text-foreground">{l.stageName}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(l.billAmount)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(l.pcsReceived)}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{l.costPerPcs > 0 ? formatCurrency(l.costPerPcs) : '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No processing bills on this purchase</td>
              </tr>
            )}
          </tbody>
          {cost.lines.length > 0 && (
            <tfoot className="border-t border-border/60 bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium text-foreground">Total</th>
                <th className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(cost.processingCost)}</th>
                <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(cost.lines.reduce((s, l) => s + l.pcsReceived, 0))}</th>
                <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(cost.processingCost / cost.lines.reduce((s, l) => s + l.pcsReceived, 0) || 0)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Scoped movement ledger ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Movement ledger
          </h3>
          <span className="text-xs text-muted-foreground">
            {batch.initialPcs} pcs in · {finishedPcs} pcs finished · {((batch.initialPcs - finishedPcs) || 0)} pcs elsewhere
          </span>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/60 sticky top-0 border-b border-border/60">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Ref</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium text-right">Qty</th>
              <th className="px-5 py-3 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            <tr className="hover:bg-muted/80 transition-colors">
              <td className="px-5 py-3 text-muted-foreground tabular-nums">{new Date(batch.date).toLocaleDateString()}</td>
              <td className="px-5 py-3 font-medium text-foreground">{purchase?.purchaseNo || batch.batchNo}</td>
              <td className="px-5 py-3">
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">
                  <Clock className="w-3 h-3 mr-1" /> Purchase
                </span>
              </td>
              <td className="px-5 py-3 text-right font-bold text-foreground tabular-nums">+{formatNumber(batch.initialPcs)}</td>
              <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(batch.initialPcs)}</td>
            </tr>
            {finishedPcs > 0 && (
              <tr className="hover:bg-muted/80 transition-colors">
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{new Date(batch.date).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium text-foreground">Finished goods</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Finished
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-bold text-success tabular-nums">+{formatNumber(finishedPcs)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(finishedPcs)}</td>
              </tr>
            )}
            {(batch.initialPcs - finishedPcs > 0) && (
              <tr className="hover:bg-muted/80 transition-colors">
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{new Date(batch.date).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium text-foreground">In process</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-muted/20 text-muted-foreground">
                    <Truck className="w-3 h-3 mr-1" /> Pipeline
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-bold text-muted-foreground tabular-nums">-{formatNumber(batch.initialPcs - finishedPcs)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function s(n: number): string {
  return n === 1 ? '' : 's';
}

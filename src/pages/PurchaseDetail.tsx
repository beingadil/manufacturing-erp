import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  PackageCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StageProgressStepper } from '../components/processing/StageProgressStepper';
import {
  type BatchCostBreakdown,
  batchCostBreakdown,
} from '../lib/processing/batchCosts';
import { getMaterialBatchProgress, visibleStagesForMaterial } from '../lib/processing/stageProgress';
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
    processors,
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

  const stepperStages = useMemo(
    () => (material ? visibleStagesForMaterial(sortedStages, material) : sortedStages),
    [sortedStages, material],
  );

  const trailProg = useMemo(
    () => (batch ? getMaterialBatchProgress(materialId, [batch], stepperStages)[0] : undefined),
    [batch, materialId, stepperStages],
  );

  // Newer/older sibling batches of this material (newest first).
  const siblingIds = useMemo(() => (batches || [])
    .filter(b => b.materialId === materialId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(b => b.id), [batches, materialId]);
  const siblingIndex = batchId ? siblingIds.indexOf(batchId) : -1;
  const newerSiblingId = siblingIndex > 0 ? siblingIds[siblingIndex - 1] : null;
  const olderSiblingId = siblingIndex >= 0 && siblingIndex < siblingIds.length - 1 ? siblingIds[siblingIndex + 1] : null;

  // ── Real event stream for this batch (newest last, chronological) ─────────
  const sendsHere = useMemo(
    () => (batch ? processingSends
      .filter(s => s.batchId === batch.id && s.status !== 'Adjusted')
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')) : []),
    [batch, processingSends],
  );
  const sendIdsHere = useMemo(() => new Set(sendsHere.map(s => s.id)), [sendsHere]);
  const receiptsHere = useMemo(
    () => processingReceipts
      .filter(r => sendIdsHere.has(r.sendId))
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [processingReceipts, sendIdsHere],
  );
  const dispatchEvents = useMemo(() => {
    const events: { id: string; date: string; ref: string; type: 'Purchase' | 'Dispatch' | 'Receive' | 'Loss'; qty: number; module: string }[] = [
      ...(batch ? [{ id: `purchase-${batch.id}`, date: batch.date, ref: purchase?.purchaseNo || batch.batchNo, type: 'Purchase' as const, qty: batch.initialPcs || 0, module: 'Purchase' }] : []),
      ...sendsHere.flatMap(s => {
        const rows: { id: string; date: string; ref: string; type: 'Dispatch' | 'Loss'; qty: number; module: string }[] = [
          { id: `send-${s.id}`, date: s.date, ref: s.dispatchNo, type: 'Dispatch' as const, qty: -(s.pcsSent || 0), module: 'Dispatch' },
        ];
        if ((s.lossQuantity || 0) > 0) {
          rows.push({ id: `loss-${s.id}`, date: s.date, ref: `${s.dispatchNo} · loss`, type: 'Loss' as const, qty: -(s.lossQuantity || 0), module: 'Loss' });
        }
        return rows;
      }),
      ...receiptsHere.map(r => ({ id: `recv-${r.id}`, date: r.date, ref: r.receiveNo, type: 'Receive' as const, qty: r.pcsReceived || 0, module: 'Receive' })),
    ];
    return events.sort((a, b) => a.date.localeCompare(b.date) || (['Purchase','Dispatch','Loss','Receive'] as const).indexOf(a.type) - (['Purchase','Dispatch','Loss','Receive'] as const).indexOf(b.type));
  }, [batch, purchase, sendsHere, receiptsHere]);

  const ledgerBalance = (() => {
    let bal = 0;
    return dispatchEvents.map(e => { bal += e.qty; return { ...e, balance: bal }; });
  })();

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-4">
        <Link to={`/materials/${materialId}`} className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{batch.batchNo}</h2>
              <span className={cn(
                "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
                batch.status === 'Active' ? "bg-success/10 text-success ring-1 ring-success/20" : "bg-muted text-muted-foreground ring-1 ring-muted-foreground/20"
              )}>
                {batch.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {newerSiblingId && (
                <Link to={`/materials/${materialId}/purchases/${newerSiblingId}`} aria-label="Newer batch" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted" title="Newer batch">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              )}
              {olderSiblingId && (
                <Link to={`/materials/${materialId}/purchases/${olderSiblingId}`} aria-label="Older batch" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted" title="Older batch">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
              {purchase && (
                <Link to={`/purchases/edit/${purchase.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                  Edit purchase
                </Link>
              )}
              <Link to={`/materials/${materialId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                Back to material
              </Link>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{material.name}</p>
        </div>
      </div>

      {/* ── Batch trail hero ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card px-6 py-5 shadow-sm" aria-label="Batch trail">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Truck className="h-4 w-4" /> Batch trail</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            {trailProg && <span>Raw <b className="text-foreground">{formatNumber(trailProg.rawPcs)}</b></span>}
            {trailProg && trailProg.availablePcs > 0 && <span>Avail <b className="text-foreground">{formatNumber(trailProg.availablePcs)}</b></span>}
            {trailProg && trailProg.inTransitPcs > 0 && <span>WIP <b className="text-amber-600">{formatNumber(trailProg.inTransitPcs)}</b></span>}
            {trailProg && trailProg.finishedPcs > 0 && <span>Finished <b className="text-success">{formatNumber(trailProg.finishedPcs)}</b></span>}
            {trailProg?.nextStage && <span>Next up: <b className="text-foreground">{trailProg.nextStage.name}</b></span>}
          </div>
        </div>
        {stepperStages.length > 0 && trailProg ? (
          <div className="mt-4">
            <StageProgressStepper
              stages={stepperStages}
              completedStageIds={trailProg.completedStages.map(s => s.id)}
              currentStageId={trailProg.currentStage?.id}
              nextStageId={trailProg.nextStage?.id}
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Ready-made — bought finished, no processing chain to track.</p>
        )}
      </section>

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
          <div className="text-xs text-muted-foreground mt-1">{cost.purchaseCostPerPcs > 0 ? formatCurrency(cost.purchaseCostPerPcs) + ' purchase + ' + formatCurrency(batch.initialPcs > 0 ? cost.processingCost / batch.initialPcs : 0) + ' processing' : ''}</div>
        </div>
      </div>

      {/* ── Per-stage processing cost table ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Per-stage processing cost
          </h3>
          <span className="text-xs text-muted-foreground">
            {formatCurrency(cost.processingCost)} across {cost.lines.length} {cost.lines.length === 1 ? 'stage' : 'stages'} · total cost / purchased PC
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
                <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(batch.initialPcs > 0 ? cost.processingCost / batch.initialPcs : 0)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Dispatches & receipts for this batch ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Truck className="h-4 w-4" /> Dispatches &amp; receipts
          </h3>
          <span className="text-xs text-muted-foreground">
            {sendsHere.length === 1 ? '1 dispatch' : `${sendsHere.length} dispatches`} ·{' '}
            {receiptsHere.length === 1 ? '1 receipt' : `${receiptsHere.length} receipts`}
          </span>
        </div>
        {sendsHere.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No dispatches recorded for this batch yet.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/60 sticky top-0 border-b border-border/60">
              <tr>
                <th className="px-5 py-3 font-medium">Dispatch</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium">Processor</th>
                <th className="px-5 py-3 font-medium text-right">Sent</th>
                <th className="px-5 py-3 font-medium text-right">Received</th>
                <th className="px-5 py-3 font-medium text-right">Loss</th>
                <th className="px-5 py-3 font-medium text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sendsHere.map(send => {
                const stage = processingStages.find(st => st.id === send.stageId);
                const receipts = receiptsHere.filter(r => r.sendId === send.id);
                const recv = receipts.reduce((sumRec, r) => sumRec + (r.pcsReceived || 0), 0);
                const bill = receipts.reduce((sumRec, r) => sumRec + (r.billAmount || 0), 0);
                const processorName = processors.find(p => p.id === send.processorId)?.name ?? 'Unknown';
                return (
                  <tr key={send.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground tabular-nums">{send.dispatchNo}</td>
                    <td className="px-5 py-3 text-muted-foreground">{stage?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{processorName}</td>
                    <td className="px-5 py-3 text-right text-foreground tabular-nums">{formatNumber(send.pcsSent)}</td>
                    <td className="px-5 py-3 text-right text-success tabular-nums">{formatNumber(recv)}</td>
                    <td className={cn(
                      "px-5 py-3 text-right tabular-nums",
                      (send.lossQuantity || 0) > 0 ? 'text-destructive font-medium' : 'text-muted-foreground',
                    )}>{(send.lossQuantity || 0) > 0 ? formatNumber(send.lossQuantity || 0) : '—'}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{bill > 0 ? formatCurrency(bill) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Scoped movement ledger ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Movement ledger
          </h3>
          <span className="text-xs text-muted-foreground">
            {ledgerBalance.length} {ledgerBalance.length === 1 ? 'event' : 'events'} · real sends, receipts &amp; losses
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
            {ledgerBalance.map(e => (
              <tr key={e.id} className="hover:bg-muted/80 transition-colors">
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{new Date(e.date).toLocaleDateString()}</td>
                <td className="px-5 py-3 font-medium text-foreground">{e.ref}</td>
                <td className="px-5 py-3">
                  <span className={cn(
                    "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                    e.type === 'Purchase' && "bg-success/10 text-success",
                    e.type === 'Dispatch' && "bg-amber-500/10 text-amber-600",
                    e.type === 'Receive' && "bg-sky-500/10 text-sky-600",
                    e.type === 'Loss' && "bg-destructive/10 text-destructive",
                  )}>
                    {e.type === 'Purchase' && <Clock className="w-3 h-3 mr-1" />}
                    {e.type === 'Receive' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {e.type === 'Dispatch' && <Truck className="w-3 h-3 mr-1" />}
                    {e.type}
                  </span>
                </td>
                <td className={cn(
                  "px-5 py-3 text-right font-bold tabular-nums",
                  e.qty >= 0 ? 'text-success' : 'text-destructive',
                )}>
                  {e.qty >= 0 ? '+' : ''}{formatNumber(e.qty)}
                </td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{formatNumber(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
          Signed pcs of pieces that left and returned. Balance is the running net of purchase inflows and processing outflows — it reaches 0 only when every purchased piece is either finished, lost, or still pending out with a processor.
        </p>
      </div>
    </div>
  );
}

import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Factory,
  Package,
  PackageCheck,
  Scale,
  Truck,
  Wallet,
  Workflow,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PartyLedgerModal } from '../components/PartyLedgerModal';
import { Dropdown } from '../components/Dropdown';
import { StageProgressStepper } from '../components/processing/StageProgressStepper';
import {
  type BatchCostBreakdown,
  batchCostBreakdown,
  stageCostBreakdown,
} from '../lib/processing/batchCosts';
import { getMaterialBatchProgress, visibleStagesForMaterial } from '../lib/processing/stageProgress';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { cn, formatCurrency, formatDocDate, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';
import { useShallow } from 'zustand/react/shallow';

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
  const { batches, processingSends, processingReceipts, processingStages, materials, suppliers, processors, purchases } = useERPStore(useShallow(s => ({ batches: s.batches, processingSends: s.processingSends, processingReceipts: s.processingReceipts, processingStages: s.processingStages, materials: s.materials, suppliers: s.suppliers, processors: s.processors, purchases: s.purchases })));

  const batch = batches.find(b => b.id === batchId);
  const material = materials.find(m => m.id === materialId);
  const purchase = purchases.find(p => p.id === batch?.purchaseId);
  const supplier = batch ? suppliers.find(s => s.id === batch.supplierId) : undefined;
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Supplier' } | null>(null);
  const sortedStages = useMemo(
    () => [...processingStages].sort((a, b) => a.sequence - b.sequence),
    [processingStages],
  );

  // The chain THIS batch travels, in business language — never the raw enum.
  const pathInfo = useMemo(() => {
    const path = batch?.processingPath ?? material?.processingPath ?? 'full_chain';
    if (path === 'ready_made') return 'Ready-made';
    if (path === 'single_stage') {
      const stage = material?.fixedStageId ? processingStages.find(s => s.id === material.fixedStageId) : undefined;
      return stage ? `Single · ${stage.name}` : 'Single stage';
    }
    if (path === 'custom_stages') {
      const n = material?.allowedStageIds?.length ?? 0;
      return n > 0 ? `Custom · ${n} stages` : 'Custom stages';
    }
    return 'Full chain';
  }, [batch?.processingPath, material, processingStages]);

  const cost = useMemo<BatchCostBreakdown | null>(() => {
    if (!batch) return null;
    return batchCostBreakdown(batch, processingSends, sortedStages, processingReceipts);
  }, [batch, processingSends, sortedStages, processingReceipts]);

  const stepperStages = useMemo(
    () => (material ? visibleStagesForMaterial(sortedStages, material) : sortedStages),
    [sortedStages, material],
  );

  const trailProg = useMemo(
    () => (batch ? getMaterialBatchProgress(materialId, [batch], stepperStages, material)[0] : undefined),
    [batch, materialId, stepperStages, material],
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

  // Stage-1 (raw-consuming) dispatch split: how much of a dispatch THIS
  // batch fed vs how much sibling stock filled in. The live engine drains
  // this batch first (preferred), then the other Active batches oldest-first
  // — the simulation reproduces exactly that order so the displayed split is
  // honest, not an estimate. In this data: DSP-2026-0018 was 1,042 (1,022
  // from this batch + 20 from SETHI-PO-2026-0006).
  const stageOneSplit = useMemo(() => {
    const out = new Map<string, { own: number; other: number; siblingNos: string[] }>();
    const actives = (batches || [])
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    const rawLeft = new Map(actives.map(b => [b.id, b.initialPcs || 0]));
    const chronological = processingSends
      .filter(s => s.materialId === materialId && s.status !== 'Adjusted' && (s.pcsSent || 0) > 0)
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const pathMaterial = material
      ? { processingPath: material.processingPath, fixedStageId: material.fixedStageId, allowedStageIds: material.allowedStageIds }
      : undefined;
    for (const s of chronological) {
      if (!InventoryCalculationService.sendConsumesRaw(s.stageId ?? '', sortedStages, pathMaterial)) continue;
      let remaining = s.pcsSent || 0;
      let own = 0;
      const others = new Set<string>();
      // Drain order mirrors the engine: the send's own batch first, then the
      // other Active batches oldest-first.
      const order = (s.batchId ? [s.batchId] : []).concat(actives.map(b => b.id).filter(id => id !== s.batchId));
      for (const id of order) {
        if (remaining <= 0) break;
        const take = Math.min(rawLeft.get(id) ?? 0, remaining);
        if (take <= 0) continue;
        rawLeft.set(id, (rawLeft.get(id) ?? 0) - take);
        remaining -= take;
        if (id === batchId) own += take;
        else others.add(id);
      }
      out.set(s.id, {
        own,
        other: Math.max(0, (s.pcsSent || 0) - own),
        siblingNos: [...others].map(oid => actives.find(b => b.id === oid)?.batchNo || 'other batch'),
      });
    }
    return out;
  }, [batches, processingSends, materialId, sortedStages, material, batchId]);

  // Compact filters riding in the section header strips.
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('__all__');
  const [dispatchStageFilter, setDispatchStageFilter] = useState<string>('__all__');

  // Per-stage ledger for this batch: sent / received / lost / LEFT BEHIND out
  // with processors — the honest "where are the pcs" answer per leg.
  const perStage = useMemo(
    () => (batch ? stageCostBreakdown(processingSends, processingReceipts, processingStages, batch.id) : { rows: [], totals: { dispatches: 0, sent: 0, received: 0, loss: 0, pending: 0, billed: 0 } }),
    [batch, processingSends, processingReceipts, processingStages],
  );
  const filteredSends = useMemo(
    () => (dispatchStageFilter === '__all__' ? sendsHere : sendsHere.filter(s => s.stageId === dispatchStageFilter)),
    [sendsHere, dispatchStageFilter],
  );
  const filteredReceipts = useMemo(
    () => (dispatchStageFilter === '__all__' ? receiptsHere : receiptsHere.filter(r => filteredSends.some(s => s.id === r.sendId))),
    [dispatchStageFilter, receiptsHere, filteredSends],
  );
  const filteredLedger = useMemo(
    () => (ledgerTypeFilter === '__all__' ? ledgerBalance : ledgerBalance.filter(e => e.type === ledgerTypeFilter)),
    [ledgerBalance, ledgerTypeFilter],
  );

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

      {/* ── Supplier / PO meta ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20 p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-[1fr_1fr_1.1fr_1.35fr]">
          {/* Supplier — links straight into the party's own sub-ledger */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Factory className="h-3.5 w-3.5 shrink-0" aria-hidden /> Supplier
            </div>
            <button
              type="button"
              onClick={() => supplier && setLedgerParty({ id: supplier.id, name: supplier.name, kind: 'Supplier' })}
              className="group/link mt-1 inline-flex max-w-full items-center gap-1 rounded-md -mx-1 px-1 py-0.5 text-left transition-colors hover:bg-muted"
              title="Open supplier ledger"
            >
              <span className="truncate text-[15px] font-semibold text-foreground transition-colors group-hover/link:text-primary">
                {supplier?.name || 'Unknown'}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-primary" />
            </button>
          </div>

          {/* Purchase date — house date language (dd-MMM-yyyy) */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /> Purchase date
            </div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums text-foreground" title={batch.date}>
              {formatDocDate(batch.date)}
            </div>
          </div>

          {/* Path — humanised, never the raw enum */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Workflow className="h-3.5 w-3.5 shrink-0" aria-hidden /> Path
            </div>
            <div className="mt-1 truncate text-[15px] font-semibold text-foreground" title={pathInfo}>{pathInfo}</div>
          </div>

          {/* Weight & unit cost */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden /> Weight &amp; unit cost
            </div>
            <div className="mt-1 truncate text-[15px] font-semibold tabular-nums text-foreground"
                 title={batch.weight > 0 ? `${formatNumber(batch.weight)} ${batch.weightUnit}` : undefined}>
              {batch.weight > 0
                ? <>{formatNumber(batch.weight)} {batch.weightUnit} <span className="font-normal text-muted-foreground">· {formatCurrency(batch.ratePerUnit)} /unit</span></>
                : <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      </div>
      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}

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

      {/* ── Per-stage processing cost ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Per-stage processing cost
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {formatCurrency(perStage.totals.billed)} across {perStage.rows.length} {perStage.rows.length === 1 ? 'stage' : 'stages'} · total cost / purchased PC
            </span>
            {perStage.totals.pending > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                {formatNumber(perStage.totals.pending)} PCS still out
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="text-xs text-muted-foreground bg-muted/60 sticky top-0 border-b border-border/60">
            <tr>
              <th className="px-5 py-3 font-medium">Stage</th>
              <th className="px-5 py-3 font-medium text-right">Sent</th>
              <th className="px-5 py-3 font-medium text-right">Received</th>
              <th className="px-5 py-3 font-medium text-right">Lost</th>
              <th className="px-5 py-3 font-medium text-right">Left behind</th>
              <th className="px-5 py-3 font-medium text-right">Bill amount</th>
              <th className="px-5 py-3 font-medium text-right">Cost / PCS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {perStage.rows.length > 0 ? (
              perStage.rows.map(l => (
                <tr key={`${l.sequence}-${l.name}`} className="hover:bg-muted/80 transition-colors">
                  <td className="px-5 py-3 text-foreground">{l.name}</td>
                  <td className="px-5 py-3 text-right text-foreground tabular-nums">{formatNumber(l.sent)}</td>
                  <td className="px-5 py-3 text-right text-success tabular-nums">{formatNumber(l.received)}</td>
                  <td className={cn(
                    "px-5 py-3 text-right tabular-nums",
                    l.loss > 0 ? 'text-destructive font-medium' : 'text-muted-foreground',
                  )}>{l.loss > 0 ? formatNumber(l.loss) : '—'}</td>
                  <td className={cn(
                    "px-5 py-3 text-right tabular-nums font-semibold",
                    l.pending > 0 ? 'text-amber-600' : 'text-muted-foreground',
                  )}>{l.pending > 0 ? formatNumber(l.pending) : '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{l.billed > 0 ? formatCurrency(l.billed) : '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{l.received > 0 && l.billed > 0 ? formatCurrency(l.billed / l.received) : '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No processing bills on this purchase</td>
              </tr>
            )}
          </tbody>
          {perStage.rows.length > 0 && (
            <tfoot className="border-t border-border/60 bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium text-foreground">Total</th>
                <th className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatNumber(perStage.totals.sent)}</th>
                <th className="px-5 py-3 text-right font-medium text-success tabular-nums">{formatNumber(perStage.totals.received)}</th>
                <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatNumber(perStage.totals.loss)}</th>
                <th className="px-5 py-3 text-right font-medium text-amber-600 tabular-nums">{perStage.totals.pending > 0 ? formatNumber(perStage.totals.pending) : '—'}</th>
                <th className="px-5 py-3 text-right font-bold text-foreground tabular-nums">{formatCurrency(perStage.totals.billed)}</th>
                <th className="px-5 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(batch.initialPcs > 0 ? cost.processingCost / batch.initialPcs : 0)}</th>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
        {(() => {
          // Only the dispatches visible in this table — this purchase's own
          // contribution to them, and what the sibling stock gave.
          const mixed = sendsHere.map(s => stageOneSplit.get(s.id)).filter((x): x is { own: number; other: number; siblingNos: string[] } => !!x && x.other > 0);
          if (mixed.length === 0) return null;
          const pulled = mixed.reduce((sum, x) => sum + x.other, 0);
          const own = sendsHere.reduce((sum, s) => sum + (stageOneSplit.get(s.id)?.own ?? 0), 0);
          const siblings = [...new Set(mixed.flatMap(x => x.siblingNos))];
          return (
            <p className="border-t border-border/60 px-5 py-2.5 text-[11px] text-muted-foreground">
              * {formatNumber(pulled)} PCS of the dispatches above were drawn from {siblings.join(', ')} — the preferred batch had run out of raw stock, so the oldest stock of <span className="font-medium text-foreground">this material</span> filled the gap. This purchase contributed {formatNumber(own)} PCS.
            </p>
          );
        })()}
      </div>

      {/* ── Dispatches & receipts for this batch ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Truck className="h-4 w-4" /> Dispatches &amp; receipts
          </h3>
          <div className="flex items-center gap-3">
            <Dropdown
              size="sm"
              options={[
                { value: '__all__', label: 'All stages' },
                ...sortedStages.map(s => ({ value: s.id, label: s.name, secondaryLabel: s.isFinalStage ? 'Final stage' : undefined })),
              ]}
              value={dispatchStageFilter}
              onChange={setDispatchStageFilter}
              ariaLabel="Filter dispatches by stage"
              className="w-44"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {dispatchStageFilter !== '__all__'
                ? `${filteredSends.length} of ${sendsHere.length} ${sendsHere.length === 1 ? 'dispatch' : 'dispatches'}`
                : `${sendsHere.length === 1 ? '1 dispatch' : `${sendsHere.length} dispatches`} · ${receiptsHere.length === 1 ? '1 receipt' : `${receiptsHere.length} receipts`}`}
            </span>
          </div>
        </div>
        {filteredSends.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            {dispatchStageFilter !== '__all__' ? 'No dispatches at this stage.' : 'No dispatches recorded for this batch yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
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
              {filteredSends.map(send => {
                const stage = processingStages.find(st => st.id === send.stageId);
                const receipts = filteredReceipts.filter(r => r.sendId === send.id);
                const recv = receipts.reduce((sumRec, r) => sumRec + (r.pcsReceived || 0), 0);
                const bill = receipts.reduce((sumRec, r) => sumRec + (r.billAmount || 0), 0);
                const processorName = processors.find(p => p.id === send.processorId)?.name ?? 'Unknown';
                return (
                  <tr key={send.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground tabular-nums">{send.dispatchNo}</td>
                    <td className="px-5 py-3 text-muted-foreground">{stage?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{processorName}</td>
                    <td className="px-5 py-3 text-right text-foreground tabular-nums">
                      {formatNumber(send.pcsSent)}
                      {(() => {
                        const split = stageOneSplit.get(send.id);
                        if (!split || split.other <= 0) return null;
                        return (
                          <div className="text-[9px] font-normal text-amber-600 whitespace-nowrap" title={`${formatNumber(split.own)} PCS came from this batch, ${formatNumber(split.other)} PCS from ${split.siblingNos.join(', ')} (the oldest batch ran out of raw stock, so this dispatch drew from the other batch(es) of the material).`}>
                            incl. {formatNumber(split.other)} from {split.siblingNos.join(', ')}
                          </div>
                        );
                      })()}
                    </td>
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
          </div>
        )}
      </div>

      {/* ── Scoped movement ledger ──────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/20">
        <div className="px-5 py-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 bg-muted/40">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Movement ledger
          </h3>
          <div className="flex items-center gap-3">
            <Dropdown
              size="sm"
              options={[
                { value: '__all__', label: 'All events' },
                { value: 'Purchase', label: 'Purchase' },
                { value: 'Dispatch', label: 'Dispatch' },
                { value: 'Receive', label: 'Receive' },
                { value: 'Loss', label: 'Loss' },
              ]}
              value={ledgerTypeFilter}
              onChange={setLedgerTypeFilter}
              ariaLabel="Filter movement ledger by event type"
              className="w-40"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {ledgerTypeFilter !== '__all__'
                ? `${filteredLedger.length} of ${ledgerBalance.length} ${ledgerBalance.length === 1 ? 'event' : 'events'}`
                : `${ledgerBalance.length} ${ledgerBalance.length === 1 ? 'event' : 'events'} · real sends, receipts & losses`}
            </span>
          </div>
        </div>
        {filteredLedger.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No {ledgerTypeFilter.toLowerCase()} events on this purchase.
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[560px]">
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
            {filteredLedger.map(e => (
              <tr key={e.id} className="hover:bg-muted/80 transition-colors">
                <td className="px-5 py-3 text-muted-foreground tabular-nums">{formatDocDate(e.date)}</td>
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
        </div>
        )}
        <p className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
          Signed pcs of pieces that left and returned. Balance is the running net of purchase inflows and processing outflows — it reaches 0 only when every purchased piece is either finished, lost, or still pending out with a processor.
        </p>
      </div>
    </div>
  );
}

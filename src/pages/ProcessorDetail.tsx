/**
 * Processor Detail — one worker's workbench: what is pending with them right
 * now (open dispatches with per-batch pcs), this month's throughput, what we
 * owe them, and the route into their party ledger.
 *
 * Every number comes from the same send/receipt records Job Work uses — no
 * separate counters, nothing re-typed.
 */
import { ArrowLeft, CalendarDays, ChevronRight, Clock, MapPin, PackageCheck, Phone, Truck, UserCog, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PartyLedgerModal } from '../components/PartyLedgerModal';
import { cn, formatCurrency, formatDocDate, formatNumber } from '../lib/utils';
import { useERPStore } from '../store/useERPStore';
import { useShallow } from 'zustand/react/shallow';

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ProcessorDetail() {
  const { processorId } = useParams<{ processorId: string }>();
  const { processors, processingSends, processingReceipts, processingStages, materials, batches } = useERPStore(useShallow(s => ({ processors: s.processors, processingSends: s.processingSends, processingReceipts: s.processingReceipts, processingStages: s.processingStages, materials: s.materials, batches: s.batches })));
  const [ledgerParty, setLedgerParty] = useState<{ id: string; name: string; kind: 'Processor' } | null>(null);

  const processor = processors.find(p => p.id === processorId);
  const stage = processor?.stageId ? processingStages.find(s => s.id === processor.stageId) : undefined;
  const monthStartDate = monthStart();

  const sentThisMonth = useMemo(
    () => processingSends.filter(s => s.processorId === processorId && s.status !== 'Adjusted' && new Date(s.date || 0) >= monthStartDate)
      .reduce((sum, s) => sum + (s.pcsSent || 0), 0),
    [processingSends, processorId, monthStartDate],
  );
  const receivedThisMonth = useMemo(
    () => processingReceipts.filter(r => r.processorId === processorId && new Date(r.date || 0) >= monthStartDate)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0),
    [processingReceipts, processorId, monthStartDate],
  );

  // Everything currently in this processor's hands — oldest first (longest waiting).
  const pendingWork = useMemo(() => {
    if (!processor) return [];
    return processingSends
      .filter(s => s.processorId === processor.id && s.status !== 'Adjusted')
      .map(s => {
        const received = processingReceipts.filter(r => r.sendId === s.id).reduce((sum, r) => sum + (r.pcsReceived || 0), 0);
        const pending = Math.max(0, (s.pcsSent || 0) - received - (s.lossQuantity || 0));
        const material = materials.find(m => m.id === s.materialId);
        const batch = batches.find(b => b.id === s.batchId);
        const stageOf = s.stageId ? processingStages.find(st => st.id === s.stageId) : undefined;
        return { send: s, received, pending, material, batch, stage: stageOf };
      })
      .filter(x => x.pending > 0)
      .sort((a, b) => (a.send.date || '').localeCompare(b.send.date || '') || a.send.dispatchNo.localeCompare(b.send.dispatchNo));
  }, [processor, processingSends, processingReceipts, materials, batches, processingStages]);

  const pendingPcs = pendingWork.reduce((sum, x) => sum + x.pending, 0);

  const thisMonthReceipts = useMemo(
    () => processingReceipts
      .filter(r => r.processorId === processorId && new Date(r.date || 0) >= monthStartDate)
      .map(r => ({ receipt: r, material: materials.find(m => m.id === r.materialId), stage: r.stageId ? processingStages.find(st => st.id === r.stageId) : undefined }))
      .sort((a, b) => (b.receipt.date || '').localeCompare(a.receipt.date || '')),
    [processingReceipts, processorId, materials, processingStages, monthStartDate],
  );

  if (!processor) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <UserCog className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Processor not found</h2>
        <Link to="/processors" className="text-sm font-medium text-muted-foreground hover:text-foreground underline">
          Return to processors
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Link
            to="/processors"
            aria-label="Back to processors"
            className="mt-1 inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">{processor.name}</h1>
              <span className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                stage ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground',
              )}>
                {stage ? `${stage.name}${stage.isFinalStage ? ' (Final)' : ''}` : 'General worker'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {processor.contactPerson && <span>{processor.contactPerson}</span>}
              {processor.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {processor.phone}</span>}
              {processor.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {processor.address}</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLedgerParty({ id: processor.id, name: processor.name, kind: 'Processor' })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          <Wallet className="h-4 w-4" /> View ledger
        </button>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Truck className="h-4 w-4 text-amber-600" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">Pending work</span>
          </div>
          <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(pendingPcs)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{pendingWork.length === 0 ? 'nothing out with them' : `${pendingWork.length} open ${pendingWork.length === 1 ? 'dispatch' : 'dispatches'}`}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <CalendarDays className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">In this month</span>
          </div>
          <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(sentThisMonth)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-1 text-xs text-muted-foreground">dispatched to them</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <PackageCheck className="h-4 w-4 text-emerald-500" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">Back this month</span>
          </div>
          <div className="text-3xl font-bold text-foreground tabular-nums">{formatNumber(receivedThisMonth)} <span className="text-sm font-medium text-muted-foreground">PCS</span></div>
          <div className="mt-1 text-xs text-muted-foreground">received &amp; billed back</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Wallet className="h-4 w-4 text-destructive" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">Balance payable</span>
          </div>
          <div className={cn('text-3xl font-bold tabular-nums', processor.balancePayable > 0 ? 'text-destructive' : 'text-foreground')}>{formatCurrency(processor.balancePayable)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{processor.balancePayable > 0 ? 'we owe them for work done' : 'nothing outstanding'}</div>
        </div>
      </div>

      {/* ── Working on now ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/20" aria-label="Pending work">
        <div className="px-5 py-4 border-b border-border/60 bg-muted/40 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Truck className="h-4 w-4" /> Working on now</h3>
          <span className="text-xs text-muted-foreground">oldest first · click a row for the batch trail</span>
        </div>
        {pendingWork.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Clock className="mx-auto h-7 w-7 text-muted-foreground/30" />
            <p className="mt-2 text-sm font-medium text-foreground">Nothing pending with {processor.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Every dispatch to them has come back. Dispatch raw material to put work on their desk.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="text-xs text-muted-foreground bg-muted/60 border-b border-border/60">
                <tr>
                  <th className="px-5 py-3 font-medium">Dispatch</th>
                  <th className="px-5 py-3 font-medium">Material · Batch</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium text-right">Sent</th>
                  <th className="px-5 py-3 font-medium text-right">Received</th>
                  <th className="px-5 py-3 font-medium text-right">Pending</th>
                  <th className="px-5 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {pendingWork.map(({ send, received, pending, material, batch, stage: st }) => (
                  <tr key={send.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground tabular-nums">{send.dispatchNo}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDocDate(send.date)}</div>
                    </td>
                    <td className="px-5 py-3">
                      {material && batch ? (
                        <Link to={`/materials/${material.id}/purchases/${batch.id}`} className="group inline-flex items-center gap-1.5">
                          <span className="min-w-0">
                            <span className="block truncate text-foreground group-hover:text-primary transition-colors">{material.name}</span>
                            <span className="block text-[11px] text-muted-foreground">{batch.batchNo}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{st?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatNumber(send.pcsSent || 0)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-success">{formatNumber(received)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-amber-600">{formatNumber(pending)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link to="/processing/receive" aria-label="Go to Job Work receive" className="text-[11px] font-semibold text-primary hover:underline underline-offset-2">
                        Receive →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── This month's receipts ──────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-muted/20" aria-label="This month's receipts">
        <div className="px-5 py-4 border-b border-border/60 bg-muted/40 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><PackageCheck className="h-4 w-4 text-emerald-500" /> This month&apos;s receipts</h3>
          <span className="text-xs text-muted-foreground">{thisMonthReceipts.length} {thisMonthReceipts.length === 1 ? 'receipt' : 'receipts'}</span>
        </div>
        {thisMonthReceipts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing received from {processor.name} yet this month.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead className="text-xs text-muted-foreground bg-muted/60 border-b border-border/60">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Receipt</th>
                  <th className="px-5 py-3 font-medium">Material</th>
                  <th className="px-5 py-3 font-medium">Stage</th>
                  <th className="px-5 py-3 font-medium text-right">PCS</th>
                  <th className="px-5 py-3 font-medium text-right">Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {thisMonthReceipts.map(({ receipt, material, stage: st }) => (
                  <tr key={receipt.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">{formatDocDate(receipt.date)}</td>
                    <td className="px-5 py-3 font-medium text-foreground tabular-nums">{receipt.receiveNo}</td>
                    <td className="px-5 py-3 text-muted-foreground">{material?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{st?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatNumber(receipt.pcsReceived || 0)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{receipt.billAmount ? formatCurrency(receipt.billAmount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ledgerParty && <PartyLedgerModal party={ledgerParty} onClose={() => setLedgerParty(null)} />}
    </div>
  );
}

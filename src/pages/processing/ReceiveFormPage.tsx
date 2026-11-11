/**
 * Receive from Processor — full-page receipt (route /processing/receive[/:id?]).
 *
 * Left: who / what / how many. Right rail: what you receive, the value, and
 * what the ledger posts when this receipt saves (v4 capitalizes at receipt).
 *
 * A receipt can cover SEVERAL materials: every line is its own dispatch and
 * its own quantity, and each line is received, accrued and billed on its own.
 * The validation path is identical to the modal — inline errors, no picker
 * mystery states, maximum pending shown in the input.
 */
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatNumber, cn } from '../../lib/utils';
import { ErrorManagement } from '../../lib/validation';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { QuickAddProcessor } from '../../components/QuickAddModals';
import { SearchableSelect } from '../../components/SearchableSelect';
import { DatePicker } from '../../components/ui/date-picker';

const control =
  'w-full min-w-0 rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';

/** One material line of the receipt: which dispatch, and how many PCS came back. */
interface ReceiveLine {
  key: string;
  sendId: string;
  pcs: string;
}

let lineSeq = 0;
function newLine(): ReceiveLine {
  lineSeq += 1;
  return { key: `line-${lineSeq}`, sendId: '', pcs: '' };
}

export default function ReceiveFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const { materials, processors, processingSends, processingReceipts, processingStages } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [lines, setLines] = useState<ReceiveLine[]>([newLine()]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);

  const editingReceipt = useMemo(
    () => (editId ? (processingReceipts || []).find(r => r.id === editId) || null : null),
    [editId, processingReceipts],
  );

  // ── Hydrate when editing ──
  useEffect(() => {
    if (!editingReceipt) return;
    setProcessorId(editingReceipt.processorId || '');
    setLines([{ key: 'line-edit', sendId: editingReceipt.sendId || '', pcs: String(editingReceipt.pcsReceived ?? '') }]);
    setDate(editingReceipt.date || new Date().toISOString().split('T')[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingReceipt?.id]);

  const openSends = useMemo(() => processingSends.filter(s =>
    s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial')
  ), [processingSends, processorId]);

  const sendById = (sendId: string) => processingSends.find(s => s.id === sendId);
  const pendingFor = (sendId: string) => {
    const send = sendById(sendId);
    if (!send) return 0;
    const already = processingReceipts.filter(r => r.sendId === sendId).reduce((sum, r) => sum + r.pcsReceived, 0);
    return Math.max(0, send.pcsSent - already - (send.lossQuantity || 0));
  };

  /** Per-line state, computed once for the summary rail and the validation. */
  const lineStates = lines.map(line => {
    const send = sendById(line.sendId);
    const maxPcs = pendingFor(line.sendId);
    const qty = parseInt(line.pcs, 10) || 0;
    return {
      line,
      send,
      maxPcs,
      qty,
      valid: Boolean(line.sendId) && qty > 0 && qty <= maxPcs,
    };
  });

  const totalPcs = lineStates.reduce((sum, s) => sum + (s.valid ? s.qty : 0), 0);
  const duplicateSend = lineStates.some((s, i) =>
    Boolean(s.line.sendId) && lineStates.some((other, j) => j !== i && other.line.sendId === s.line.sendId));

  const canReceive = Boolean(processorId && date)
    && lineStates.length > 0
    && lineStates.every(s => s.valid)
    && !duplicateSend;

  const updateLine = (key: string, patch: Partial<ReceiveLine>) => {
    setError(null);
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setError(null);
    setLines(prev => [...prev, newLine()]);
  };

  const removeLine = (key: string) => {
    setError(null);
    setLines(prev => (prev.length === 1 ? prev : prev.filter(l => l.key !== key)));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!processorId || !date) {
      setError('Processor and date are required.');
      return;
    }
    if (duplicateSend) {
      setError('The same dispatch cannot be received twice on one receipt.');
      return;
    }
    if (lineStates.some(s => !s.line.sendId)) {
      setError('Pick a pending dispatch for every line.');
      return;
    }
    if (lineStates.some(s => !s.qty || s.qty <= 0)) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    }
    if (lineStates.some(s => s.qty > s.maxPcs)) {
      const over = lineStates.find(s => s.qty > s.maxPcs);
      setError(`Only ${formatNumber(over?.maxPcs ?? 0)} PCS are pending on ${over?.send?.dispatchNo ?? 'that dispatch'}.`);
      return;
    }

    ErrorManagement.safeExecuteSync(() => {
      if (editId) {
        const first = lineStates[0];
        ProcessingService.updateReceive(editId, {
          sendId: first.line.sendId,
          processorId,
          materialId: first.send!.materialId,
          pcsReceived: first.qty,
          date,
        });
        toast.success('Receipt updated.');
      } else {
        // One receipt per material line — each material is received, accrued
        // and billed on its own.
        for (const state of lineStates) {
          const previouslyReceived = processingReceipts
            .filter(r => r.sendId === state.line.sendId)
            .reduce((sum, r) => sum + r.pcsReceived, 0);
          ProcessingService.receive({
            sendId: state.line.sendId,
            processorId,
            materialId: state.send!.materialId,
            date,
            pcsReceived: state.qty,
            dispatchedPcs: state.send!.pcsSent,
            previouslyReceivedPcs: previouslyReceived,
          });
        }
        toast.success(
          lineStates.length === 1
            ? 'Receipt saved — accrual and stock ledger updated.'
            : `${lineStates.length} materials received — each accrual and stock ledger updated.`,
        );
      }
      navigate('/processing', { replace: true });
    }, 'Processing Receive Save');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* ── Page header ── */}
      <header className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Processing · Job Work</p>
            <h1 className="text-lg font-semibold leading-tight text-foreground">{isEdit ? 'Edit Receipt' : 'Receive from Processor'}</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Receiving</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatNumber(totalPcs)} PCS</span>
            </div>
            <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isEdit ? 'Editing' : 'Draft'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-7xl gap-5 py-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">Work order</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pick the processor first — only their pending dispatches appear.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-5">
              {/* Processor */}
              <div className="min-w-0">
                <label htmlFor="rf-processor" className={label}>Processor <span className="text-destructive">*</span></label>
                <SearchableSelect
                  options={processors.map(p => ({
                    id: p.id,
                    label: p.name,
                    secondaryLabel: p.stageId
                      ? `${(processingStages || []).find(s => s.id === p.stageId)?.name || 'Worker'}${p.phone ? ` · ${p.phone}` : ''}`
                      : (p.phone ? `General · ${p.phone}` : 'General Worker'),
                    searchValue: p.phone,
                  }))}
                  value={processorId}
                  onChange={(val) => {
                    setProcessorId(val);
                    setLines(prev => prev.map(l => ({ ...l, sendId: '', pcs: '' })));
                    setError(null);
                  }}
                  placeholder="Select processor…"
                  onAdd={() => setAddProcessorOpen(true)}
                  required
                />
              </div>

              {/* Date */}
              <div className="min-w-0">
                <label htmlFor="rf-date" className={label}>Received date <span className="text-destructive">*</span></label>
                <DatePicker id="rf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
              </div>
            </div>
          </section>

          {/* ── Material lines ── */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Materials received</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  One line per material — receive several in one go. Each line is accrued and billed on its own.
                </p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {lines.length} line{lines.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              {lineStates.map((state, index) => {
                const usedElsewhere = new Set(
                  lines.filter(l => l.key !== state.line.key).map(l => l.sendId).filter(Boolean),
                );
                const stage = processingStages.find(x => x.id === state.send?.stageId);
                const material = materials.find(m => m.id === state.send?.materialId);
                return (
                  <div key={state.line.key} className="rounded-xl border border-border bg-background/60 p-3.5">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <label className={label}>
                          Material {index + 1} <span className="text-destructive">*</span>
                        </label>
                        <SearchableSelect
                          options={(!processorId
                            ? []
                            : openSends.filter(s => !usedElsewhere.has(s.id)).map(s => {
                                const m = materials.find(mat => mat.id === s.materialId);
                                const st = processingStages.find(x => x.id === s.stageId);
                                return {
                                  id: s.id,
                                  label: s.dispatchNo,
                                  secondaryLabel: `${new Date(s.date).toLocaleDateString()} · ${m?.name} (${st?.name || 'Initial Processor'}) · ${formatNumber(pendingFor(s.id))} pending`,
                                };
                              })
                          )}
                          value={state.line.sendId}
                          onChange={(val) => updateLine(state.line.key, { sendId: val, pcs: '' })}
                          placeholder={processorId ? 'Select pending dispatch…' : 'Pick a processor first'}
                        />
                      </div>

                      <div className="w-36 shrink-0">
                        <label className={label}>Pcs received <span className="text-destructive">*</span></label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max={state.maxPcs || undefined}
                            inputMode="numeric"
                            placeholder="0"
                            value={state.line.pcs}
                            onChange={e => updateLine(state.line.key, { pcs: e.target.value })}
                            aria-label={`Pieces received on line ${index + 1}`}
                            className={cn(control, 'pr-11 text-right tabular-nums')}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            PCS
                          </span>
                        </div>
                        <p className={cn('mt-1.5 text-right text-[10px] tabular-nums', state.qty > 0 && !state.valid ? 'font-semibold text-destructive' : 'text-muted-foreground/70')}>
                          {!state.line.sendId
                            ? 'Pick a dispatch'
                            : state.qty > 0 && !state.valid
                              ? `Only ${formatNumber(state.maxPcs)} pending`
                              : `${formatNumber(state.maxPcs)} pending`}
                        </p>
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(state.line.key)}
                          aria-label={`Remove material ${index + 1}`}
                          className="mt-6 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {state.send && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-mono font-semibold text-foreground">{state.send.dispatchNo}</span> —{' '}
                        <span className="font-semibold text-foreground">{material?.name ?? 'material'}</span> from{' '}
                        <span className="font-semibold text-foreground">{stage?.name || 'Initial Processor'}</span>
                        {' '}· dispatched {formatNumber(state.send.pcsSent)} PCS
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Add another material
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(totalPcs)} PCS across {lines.length} line{lines.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </section>

          {error && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* ── Receive summary rail ── */}
        <aside className="h-fit xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Receive summary</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live</span>
            </div>
            <div className="divide-y divide-border/50 px-4">
              {lineStates.some(s => s.send) ? (
                <>
                  {lineStates.filter(s => s.send).map(state => {
                    const stage = processingStages.find(x => x.id === state.send?.stageId);
                    const material = materials.find(m => m.id === state.send?.materialId);
                    const already = processingReceipts
                      .filter(r => r.sendId === state.send!.id)
                      .reduce((sum, r) => sum + r.pcsReceived, 0);
                    return (
                      <div key={state.line.key} className="py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dispatch</div>
                        <div className="mt-0.5 text-sm font-semibold text-foreground">{state.send!.dispatchNo}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {material?.name} · from <span className="font-medium text-foreground">{stage?.name || 'Initial Processor'}</span> → {processors.find(p => p.id === state.send!.processorId)?.name}
                        </div>
                        <dl className="mt-2 space-y-1.5">
                          {[
                            ['Dispatched', `${formatNumber(state.send!.pcsSent)} PCS`],
                            ['Received so far', `${formatNumber(already)} PCS`],
                            ['Pending on this leg', `${formatNumber(state.maxPcs)} PCS`],
                          ].map(([dt, dd]) => (
                            <div key={dt} className="flex items-center justify-between gap-4">
                              <dt className="text-xs text-muted-foreground">{dt}</dt>
                              <dd className="text-sm font-medium tabular-nums text-foreground">{dd}</dd>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-xs text-muted-foreground">This receipt</dt>
                            <dd className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              +{formatNumber(state.qty)} PCS
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-xs text-muted-foreground">Remaining after</dt>
                            <dd className={cn('text-sm font-medium tabular-nums', state.maxPcs - state.qty > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>
                              {state.maxPcs - state.qty > 0 ? `${formatNumber(state.maxPcs - state.qty)} PCS` : 'Closes dispatch'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Pick a pending dispatch to preview what posts.
                </div>
              )}
            </div>

            {lineStates.some(s => s.send) && (
              <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What posts at receive</p>
                <ul className="mt-1.5 space-y-1 text-[11px] font-medium leading-snug text-foreground/85">
                  <li>Dr Raw Material Inventory — the accrued processing charge</li>
                  <li className="text-muted-foreground">Cr Accrued Expenses — clears on the processor bill</li>
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  One accrual per material — each line posts on its own.
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            WIP stays zero in the ledger — the accrual credits Raw Material Inventory; the pcs left the trail the moment they were received. Recorded losses, if any, post to Processing Loss instead.
          </p>
        </aside>
      </form>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {lineStates.some(s => s.valid)
              ? `${formatNumber(totalPcs)} PCS ready across ${lineStates.filter(s => s.valid).length} material${lineStates.filter(s => s.valid).length === 1 ? '' : 's'}`
              : 'Pick a pending dispatch for every line to receive.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/processing')}
              className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!canReceive}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {isEdit ? 'Save changes' : lineStates.length > 1 ? `Receive ${lineStates.length} materials` : 'Receive items'}
            </button>
          </div>
        </div>
      </div>

      <QuickAddProcessor
        isOpen={addProcessorOpen}
        onClose={() => setAddProcessorOpen(false)}
        onSuccess={(id: string) => { setProcessorId(id); setAddProcessorOpen(false); }}
      />
    </div>
  );
}

/**
 * Receive from Processor — full-page receipt (route /processing/receive[/:id?]).
 *
 * Left: who / what / how many. Right rail: what you receive, the value, and
 * what the ledger posts when this receipt saves (v4 capitalizes at receipt).
 * The validation path is identical to the modal — inline errors, no picker
 * mystery states, maximum pending shown in the input.
 */
import { ArrowLeft, Check } from 'lucide-react';
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
import { formInputClass } from '../../components/form/formStyles';

const control =
  'w-full min-w-0 rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';

export default function ReceiveFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const { materials, processors, processingSends, processingReceipts, processingStages } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [sendId, setSendId] = useState('');
  const [pcs, setPcs] = useState('');
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
    setSendId(editingReceipt.sendId || '');
    setPcs(String(editingReceipt.pcsReceived ?? ''));
    setDate(editingReceipt.date || new Date().toISOString().split('T')[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingReceipt?.id]);

  const openSends = useMemo(() => processingSends.filter(s =>
    s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial')
  ), [processingSends, processorId]);

  const selectedSend = processingSends.find(s => s.id === sendId);
  const maxPcs = selectedSend ? selectedSend.pcsSent - selectedSend.pcsReceived : 0;
  const qty = parseInt(pcs, 10) || 0;
  const remainingAfter = Math.max(0, maxPcs - qty);
  const selectedStage = processingStages?.find(x => x.id === selectedSend?.stageId);
  const selectedMaterial = materials?.find(m => m.id === selectedSend?.materialId);
  const previouslyReceived = processingReceipts.filter(r => r.sendId === sendId).reduce((sum, r) => sum + r.pcsReceived, 0);

  const validQty = qty > 0 && qty <= maxPcs;
  const canReceive = Boolean(processorId && sendId && validQty && date);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!processorId || !sendId || !pcs || !date) {
      setError('Processor, dispatch, quantity and date are required.');
      return;
    }
    if (!selectedSend) {
      setError('Select a valid pending dispatch.');
      return;
    }
    if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    }
    if (qty > maxPcs) {
      setError(`Only ${formatNumber(maxPcs)} PCS are pending on this dispatch.`);
      return;
    }

    ErrorManagement.safeExecuteSync(() => {
      if (editId) {
        ProcessingService.updateReceive(editId, {
          sendId,
          processorId,
          materialId: selectedSend.materialId,
          pcsReceived: qty,
          date,
        });
        toast.success('Receipt updated.');
      } else {
        ProcessingService.receive({
          sendId,
          processorId,
          materialId: selectedSend.materialId,
          date,
          pcsReceived: qty,
          dispatchedPcs: selectedSend.pcsSent,
          previouslyReceivedPcs: previouslyReceived,
        });
        toast.success('Receipt saved — accrual and stock ledger updated.');
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Pending on pick</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatNumber(maxPcs)} PCS</span>
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
            <div className="grid gap-4 p-4 sm:p-5">
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
                  onChange={(val) => { setProcessorId(val); setSendId(''); setError(null); }}
                  placeholder="Select processor…"
                  onAdd={() => setAddProcessorOpen(true)}
                  required
                />
              </div>

              {/* Pending dispatch */}
              <div className="min-w-0">
                <label htmlFor="rf-dispatch" className={label}>Pending dispatch <span className="text-destructive">*</span></label>
                <select
                  id="rf-dispatch"
                  required
                  value={sendId}
                  onChange={e => { setSendId(e.target.value); setError(null); }}
                  className={formInputClass}
                  disabled={!processorId}
                >
                  <option value="">{processorId ? 'Select pending dispatch…' : 'Pick a processor first'}</option>
                  {openSends.map(s => {
                    const m = materials.find(mat => mat.id === s.materialId);
                    const st = processingStages.find(x => x.id === s.stageId);
                    return (
                      <option key={s.id} value={s.id}>
                        {new Date(s.date).toLocaleDateString()} — {s.dispatchNo} · {m?.name} ({st?.name || 'Initial Processor'}) · {formatNumber(s.pcsSent - s.pcsReceived)} pending
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedSend && maxPcs > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                  Dispatch <span className="font-mono font-semibold text-foreground">{selectedSend.dispatchNo}</span> —{' '}
                  <span className="font-semibold text-foreground">{formatNumber(maxPcs)} PCS pending</span>{' '}
                  from {selectedMaterial?.name ?? 'material'} at{' '}
                  <span className="font-semibold text-foreground">{selectedStage?.name || 'Initial Processor'}</span>
                  {' '}with {processors.find(p => p.id === selectedSend.processorId)?.name}.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">Quantity &amp; date</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Receive everything, or part of it — no automatic loss is ever booked.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              {/* Pcs */}
              <div className="min-w-0">
                <label htmlFor="rf-pcs" className={label}>Pcs received <span className="text-destructive">*</span></label>
                <div className="relative">
                  <input
                    id="rf-pcs"
                    type="number"
                    min="1"
                    max={maxPcs || undefined}
                    required
                    inputMode="numeric"
                    placeholder="0"
                    value={pcs}
                    onChange={e => { setPcs(e.target.value); setError(null); }}
                    aria-label="Pieces received"
                    className={cn(control, 'pr-12 text-right tabular-nums')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    PCS
                  </span>
                </div>
                <p className={cn('mt-1.5 text-right text-[10px] tabular-nums', qty > 0 && !validQty ? 'font-semibold text-destructive' : 'text-muted-foreground/70')}>
                  {!selectedSend ? 'Pick a pending dispatch' : !validQty && qty > 0 ? `Only ${formatNumber(maxPcs)} pending` : `${formatNumber(maxPcs)} pending`}
                </p>
              </div>

              {/* Date */}
              <div className="min-w-0">
                <label htmlFor="rf-date" className={label}>Received date <span className="text-destructive">*</span></label>
                <DatePicker id="rf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
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
              {selectedSend ? (
                <>
                  <div className="py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dispatch</div>
                    <div className="mt-0.5 text-sm font-semibold text-foreground">{selectedSend.dispatchNo}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedMaterial?.name} · from <span className="font-medium text-foreground">{selectedStage?.name || 'Initial Processor'}</span> → {processors.find(p => p.id === selectedSend.processorId)?.name}
                    </div>
                  </div>
                  {[
                    ['Dispatched', `${formatNumber(selectedSend.pcsSent)} PCS`],
                    ['Received so far', `${formatNumber(previouslyReceived)} PCS`],
                    ['Pending on this leg', `${formatNumber(maxPcs)} PCS`],
                  ].map(([dt, dd]) => (
                    <div key={dt} className="flex items-center justify-between gap-4 py-2">
                      <dt className="text-xs text-muted-foreground">{dt}</dt>
                      <dd className="text-sm font-medium tabular-nums text-foreground">{dd}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-xs text-muted-foreground">This receipt</dt>
                    <dd className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{formatNumber(qty)} PCS</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-xs text-muted-foreground">Remaining after</dt>
                    <dd className={cn('text-sm font-medium tabular-nums', remainingAfter > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>
                      {remainingAfter > 0 ? `${formatNumber(remainingAfter)} PCS` : 'Closes dispatch'}
                    </dd>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Pick a pending dispatch to preview what posts.
                </div>
              )}
            </div>

            {selectedSend && (
              <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What posts at receive</p>
                <ul className="mt-1.5 space-y-1 text-[11px] font-medium leading-snug text-foreground/85">
                  <li>Dr Raw Material Inventory — the accrued processing charge</li>
                  <li className="text-muted-foreground">Cr Accrued Expenses — clears on the processor bill</li>
                </ul>
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
            {selectedSend && validQty ? `${remainingAfter > 0 ? `${formatNumber(remainingAfter)} PCS remaining · partial receipt` : 'Closes the dispatch'}` : 'Pick a pending dispatch to receive.'}
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
              {isEdit ? 'Save changes' : 'Receive items'}
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

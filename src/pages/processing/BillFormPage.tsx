/**
 * Generate Processor Bill — full-page bill creation (route /processing/bill/:id?).
 *
 * Receipts are selectable row-by-row; amounts are editable per line so the
 * rate can be finalised at bill time. The rail shows the exact voucher that
 * posts: accrued processing cost clears first, any difference to the rate
 * lives in Processing Expense, the rest goes to the processor's AP account.
 */
import { ArrowLeft, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { adaptiveAmountClass, cn, formatCurrency, formatNumber } from '../../lib/utils';
import { billLineQuantity } from '../../lib/processing/billLineDetails';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { QuickAddProcessor } from '../../components/QuickAddModals';
import { SearchableSelect } from '../../components/SearchableSelect';
import { DatePicker } from '../../components/ui/date-picker';

const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';
const headCell = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60';

export default function BillFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const { materials, processors, processingReceipts, processorBills, processingStages, processingSends, batches } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);
  const [hydrated, setHydrated] = useState(!editId);

  // ── Edit mode: hydrate from the existing bill ──
  useMemo(() => {
    if (editId && processorBills && !hydrated) {
      const bill = processorBills.find(b => b.id === editId);
      if (bill) {
        setProcessorId(bill.processorId);
        setDate(bill.date);
        setSelectedIds(bill.receiptIds);
        setLineAmounts(Object.fromEntries(
          Object.entries(bill.lineAmounts || {}).map(([k, v]) => [k, String(v)])
        ));
        setHydrated(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, processorBills, hydrated]);

  const processor = processors.find(p => p.id === processorId);

  const unbilledReceipts = useMemo(() => {
    if (!processorId) return [];
    // In edit mode the receipts the bill already holds stay visible so the
    // user can keep or remove them. In create mode only truly unbilled receipts qualify.
    const belongsToBill = (r: typeof processingReceipts[number]) =>
      isEdit && !!processorBills.find(b => b.id === editId)?.receiptIds.includes(r.id);
    return processingReceipts.filter(r =>
      r.processorId === processorId && (r.billedStatus === 'Unbilled' || belongsToBill(r))
    );
  }, [processingReceipts, processorId, isEdit, editId, processorBills]);

  const selectedReceipts = unbilledReceipts.filter(r => selectedIds.includes(r.id));
  const billSubtotal = selectedReceipts.reduce(
    (sum, r) => sum + (parseFloat(lineAmounts[r.id] ?? '') || r.billAmount),
    0,
  );
  const accruedToClear = selectedReceipts.reduce((sum, r) => sum + (r.accruedProcessingCost || 0), 0);
  const rateDifference = billSubtotal - accruedToClear;
  const selectedStage = processingStages?.find(s => s.id === selectedReceipts[0]?.stageId);

  /** The billing detail of one receipt: pieces, weight and rate. */
  const quantityFor = (r: typeof processingReceipts[number]) => {
    const send = processingSends.find(s => s.id === r.sendId);
    const batch = send?.batchId ? batches.find(b => b.id === send.batchId) : undefined;
    return billLineQuantity({
      receiveNo: r.receiveNo,
      pcsReceived: r.pcsReceived,
      rateMethod: r.rateMethod,
      billingUnit: r.billingUnit,
      rate: send?.ratePerPiece,
      weightPerPiece: batch?.weightPerPiece,
    });
  };

  /** What each receipt posts on its own — one group per receipt, never combined. */
  const postingFor = (r: typeof processingReceipts[number]) => {
    const amount = parseFloat(lineAmounts[r.id] ?? '') || r.billAmount;
    const accrued = Math.max(0, Number(r.accruedProcessingCost) || 0);
    return { amount, accrued, difference: amount - accrued };
  };

  const toggle = (id: string) => {
    setError(null);
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };
  const selectAll = () => setSelectedIds(unbilledReceipts.map(r => r.id));
  const clearAll = () => setSelectedIds([]);

  const allSelected = selectedIds.length > 0 && selectedIds.length === unbilledReceipts.length;
  const canCreate = Boolean(processorId && selectedIds.length > 0);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!processorId || selectedIds.length === 0) {
      setError('Select a processor and at least one unbilled receipt.');
      return;
    }
    // Build line overrides only where the user changed the amount.
    const overrides: Record<string, number> = {};
    let changed = false;
    for (const r of selectedReceipts) {
      const raw = lineAmounts[r.id];
      if (raw === undefined || raw === '') continue;
      const v = parseFloat(raw);
      if (isNaN(v) || v < 0) {
        setError(`Invalid amount for receipt ${r.receiveNo}.`);
        return;
      }
      if (v !== r.billAmount) {
        overrides[r.id] = v;
        changed = true;
      }
    }

    try {
      if (isEdit) {
        ProcessingService.updateBill(editId!, {
          processorId,
          date,
          receiptIds: selectedIds,
          ...(changed ? { lineAmounts: overrides } : {}),
        });
        toast.success('Processor bill updated.');
      } else {
        ProcessingService.createBill({
          processorId,
          date,
          receiptIds: selectedIds,
          remarks: 'Generated from pending receipts',
          stageId: selectedReceipts[0]?.stageId,
          rateMethod: selectedReceipts[0]?.rateMethod,
          billingUnit: selectedReceipts[0]?.billingUnit,
          ...(changed ? { lineAmounts: overrides } : {}),
        } as any);
        toast.success('Bill created — processor AP and the accrual are updated.');
      }
      navigate('/processing', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Could not create the processor bill.');
    }
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
            <h1 className="text-lg font-semibold leading-tight text-foreground">{isEdit ? 'Edit Processor Bill' : 'Generate Processor Bill'}</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Bill total</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(billSubtotal)}</span>
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
              <p className="mt-0.5 text-xs text-muted-foreground">Pick a processor — their unbilled receipts appear below. Check the ones this bill pays.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-5">
              <div className="min-w-0">
                <label htmlFor="pf-processor" className={label}>Processor <span className="text-destructive">*</span></label>
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
                  onChange={(val) => { setProcessorId(val); setSelectedIds([]); setLineAmounts({}); setError(null); }}
                  placeholder="Select processor…"
                  onAdd={() => setAddProcessorOpen(true)}
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="pf-date" className={label}>Billing date <span className="text-destructive">*</span></label>
                <DatePicker id="pf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
              </div>
            </div>
          </section>

          {/* ── Unbilled receipts ── */}
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Unbilled receipts</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {processorId ? `${unbilledReceipts.length} unbilled` : 'Pick a processor to see receipts'}
                </p>
              </div>
              {unbilledReceipts.length > 0 && (
                <button
                  type="button"
                  onClick={allSelected ? clearAll : selectAll}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted"
                >
                  {allSelected ? 'Clear selection' : 'Select all'}
                </button>
              )}
            </div>

            {!processorId ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Select a processor above to see what they are owed.
              </div>
            ) : unbilledReceipts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No unbilled receipts found for this processor.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2.5 text-left"></th>
                      <th className={cn(headCell, 'px-3 py-2.5 text-left')}>Receipt</th>
                      <th className={cn(headCell, 'px-3 py-2.5 text-left')}>Material</th>
                      <th className={cn(headCell, 'px-3 py-2.5 text-left')}>Billing</th>
                      <th className={cn(headCell, 'px-3 py-2.5 text-right')}>PCS</th>
                      <th className={cn(headCell, 'px-3 py-2.5 text-right')}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {unbilledReceipts.map(r => {
                      const m = materials.find(mat => mat.id === r.materialId);
                      const isSelected = selectedIds.includes(r.id);
                      return (
                        <tr
                          key={r.id}
                          onClick={() => toggle(r.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            isSelected ? 'bg-primary/5' : 'hover:bg-muted/40',
                          )}
                          aria-selected={isSelected}
                        >
                          <td className="px-3 py-2.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
                                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                              )}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5" />}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-xs text-foreground">{r.receiveNo}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(r.date).toLocaleDateString()}</div>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{m?.name}</td>
                          <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{quantityFor(r)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(r.pcsReceived)}</td>
                          <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                            {isSelected ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`Amount for ${r.receiveNo}`}
                                className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
                                value={lineAmounts[r.id] ?? String(r.billAmount)}
                                onChange={e => setLineAmounts(prev => ({ ...prev, [r.id]: e.target.value }))}
                              />
                            ) : (
                              <span className="text-sm font-semibold tabular-nums">{formatCurrency(r.billAmount)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-border/60 bg-muted/20 px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">Selected: <span className="font-semibold text-foreground">{selectedIds.length} receipt{selectedIds.length === 1 ? '' : 's'}</span></span>
                <span className={cn(adaptiveAmountClass(formatCurrency(billSubtotal), 'md'), 'font-bold tabular-nums text-foreground')}>{formatCurrency(billSubtotal)}</span>
              </div>
            )}
          </section>

          {error && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* ── Bill summary rail ── */}
        <aside className="h-fit xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Bill summary</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live</span>
            </div>
            <div className="divide-y divide-border/50 px-4">
              <div className="py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Processor</div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">{processor?.name ?? '—'}</div>
                {selectedStage && <div className="mt-1 text-xs text-muted-foreground">{selectedStage.name} (Final) — receipts this bill pays</div>}
              </div>
              {[
                ['Receipts selected', `${selectedReceipts.length}`],
                ['Accrual to clear', formatCurrency(accruedToClear)],
                ['Rate difference → expense', formatCurrency(Math.abs(rateDifference)) + (rateDifference >= 0 ? ' (debit)' : ' (credit)')],
              ].map(([dt, dd]) => (
                <div key={dt as string} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-xs text-muted-foreground">{dt}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{dd}</dd>
                </div>
              ))}
              <div className="flex baseline justify-between gap-4 py-3.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Bill total</dt>
                <dd className={cn(adaptiveAmountClass(formatCurrency(billSubtotal), 'md'), 'font-bold tabular-nums text-foreground')}>
                  {formatCurrency(billSubtotal)}
                </dd>
              </div>
            </div>

            <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What posts at create</p>
              {selectedReceipts.length === 0 ? (
                <p className="mt-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
                  Each receipt you select posts on its own — its own accrual clear, its own rate difference and its own payable line.
                </p>
              ) : (
                <div className="mt-1.5 space-y-2">
                  {selectedReceipts.map(r => {
                    const { amount, accrued, difference } = postingFor(r);
                    return (
                      <div key={r.id} className="rounded-lg border border-border/60 bg-card px-2.5 py-1.5">
                        <div className="text-[11px] font-semibold leading-snug text-foreground">
                          {r.receiveNo} · {materials.find(m => m.id === r.materialId)?.name ?? 'material'}
                        </div>
                        <div className="text-[10px] tabular-nums text-muted-foreground">{quantityFor(r)}</div>
                        <ul className="mt-1 space-y-0.5 text-[11px] font-medium leading-snug text-foreground/85">
                          {accrued > 0 && <li>Dr Accrued Expenses — {formatCurrency(accrued)}</li>}
                          {Math.abs(difference) > 0 && (
                            <li>{difference >= 0 ? 'Dr' : 'Cr'} Processing Expense — {formatCurrency(Math.abs(difference))}</li>
                          )}
                          <li>Cr Accounts Payable — {formatCurrency(amount)}</li>
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            Rate can be finalised here — the override drives the voucher and the processor's payable balance. It never touches the batch trail.
          </p>
        </aside>
      </form>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedIds.length > 0 ? `${selectedIds.length} receipt${selectedIds.length === 1 ? '' : 's'} ready · ${formatCurrency(billSubtotal)}` : 'Select at least one receipt to create the bill.'}
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
              disabled={!canCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Create bill'}
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

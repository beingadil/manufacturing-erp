/**
 * Purchase Entry — full-page form (routes /purchases/new and /purchases/edit/:id).
 *
 * One line = one material lot. The purchase unit is decided by the material
 * itself (ready-made → pieces, everything else → kilograms), so a line never
 * shows two competing unit controls. The piece weight is carried over from the
 * material's previous purchase and stays editable when it changes.
 */
import { AlertTriangle, ArrowLeft, Check, Info, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MaterialForm } from '../components/forms/MaterialForm';
import { SupplierForm } from '../components/forms/SupplierForm';
import { SearchableSelect } from '../components/SearchableSelect';
import { DatePicker } from '../components/ui/date-picker';
import { adaptiveAmountClass, cn, formatCurrency } from '../lib/utils';
import { PurchaseService } from '../services/PurchaseService';
import { useERPStore } from '../store/useERPStore';

type Line = {
  id: string;
  materialId: string;
  /** Kilograms for weight-based materials, pieces for ready-made materials. */
  qty: string;
  weightPerPiece: string;
  rate: string;
};

const newId = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): Line => ({ id: newId(), materialId: '', qty: '', weightPerPiece: '', rate: '' });

/** Matches the SearchableSelect trigger exactly, so every control on a row lines up. */
const control =
  'w-full min-w-0 rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';
const headCell = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60';

const fmtNum = (n: number) => n.toLocaleString('en-PK');

export default function PurchaseFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);
  const deepNew = searchParams.get('new') === '1';

  const { purchases, materials, suppliers, batches, processingSends, processingReceipts, processorBills } = useERPStore();

  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [originalMaterialId, setOriginalMaterialId] = useState<string | null>(null);
  const [confirmFallback, setConfirmFallback] = useState(false);

  // ── Last known piece weight per material, used to prefill a new line ──
  const pieceWeightByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of batches ?? []) {
      if (!b.weightPerPiece || b.weightPerPiece <= 0) continue;
      const seen = map.get(b.materialId);
      if (seen == null) map.set(b.materialId, b.weightPerPiece);
    }
    return map;
  }, [batches]);

  const isReadyMade = (materialId: string) =>
    materials.find(m => m.id === materialId)?.processingPath === 'ready_made';

  // ── Deep-linked for a new document (or reset for a clean one) ──
  useEffect(() => {
    if (deepNew && !editId) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepNew]);

  // ── Hydrate existing purchase when editing ──
  useEffect(() => {
    if (!editId) return;
    const p = purchases.find(x => x.id === editId);
    if (!p) return;
    const ready = isReadyMade(p.materialId);
    setSupplierId(p.supplierId);
    setDate(p.date);
    setOriginalMaterialId(p.materialId);
    setConfirmFallback(false);
    setLines([
      {
        id: newId(),
        materialId: p.materialId,
        qty: String(ready ? p.directPcs ?? p.calculatedPcs ?? '' : p.weight),
        weightPerPiece: p.weightPerPiece ? String(p.weightPerPiece) : '',
        rate: String(p.ratePerUnit),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function resetForm() {
    setSupplierId('');
    setDate(new Date().toISOString().split('T')[0]);
    setLines([emptyLine()]);
    setFormError(null);
    setShowSupplierForm(false);
    setShowMaterialForm(false);
    setOriginalMaterialId(null);
    setConfirmFallback(false);
  }

  // ── Line-level derived values ──
  const lineView = useMemo(
    () =>
      lines.map(l => {
        const mat = materials.find(m => m.id === l.materialId);
        const ready = mat?.processingPath === 'ready_made';
        const qty = Number(l.qty) || 0;
        const perPiece = Number(l.weightPerPiece) || 0;
        const rate = Number(l.rate) || 0;
        const pcs = ready ? Math.round(qty) : perPiece > 0 ? Math.floor(qty / perPiece) : 0;
        const amount = ready ? pcs * rate : qty * rate;
        return { mat, ready, pcs, amount };
      }),
    [lines, materials]
  );

  // ── Processor-pipeline history for this purchase's batch (edit mode).
  //    The answer decides whether changing the material is a silent fallback
  //    (never dispatched) or a destructive, confirmed one (anything else). ──
  const batchForPurchase = useMemo(
    () => (editId ? batches?.find(b => b.purchaseId === editId) : undefined),
    [batches, editId]
  );
  const pipelineHistory = useMemo(() => {
    if (!batchForPurchase) return null;
    const sends = (processingSends ?? []).filter(s => s.batchId === batchForPurchase.id);
    const sendIds = new Set(sends.map(s => s.id));
    const receipts = (processingReceipts ?? []).filter(r => sendIds.has(r.sendId));
    const buckets = Object.values(batchForPurchase.stageAvailableBySource ?? {});
    // Ready-made lots are finished at birth — processedPcs from a ready-made
    // purchase is not processor history.
    const hasHistory =
      sends.length > 0 ||
      (batchForPurchase.atProcessorPcs ?? 0) > 0 ||
      buckets.some(v => (v ?? 0) > 0);
    const billed =
      receipts.some(r => r.billedStatus === 'Billed') ||
      (processorBills ?? []).some(b => b.receiptIds.some(rid => receipts.some(r => r.id === rid)));
    const adjusted = sends.some(s => s.status === 'Adjusted');
    return { sends: sends.length, receipts: receipts.length, hasHistory, billed, adjusted };
  }, [batchForPurchase, processingSends, processingReceipts, processorBills]);

  const currentMaterialId = lines[0]?.materialId ?? '';
  const materialChanged = isEdit && originalMaterialId !== null && currentMaterialId !== originalMaterialId;
  const needsPipelineReset = materialChanged && !!pipelineHistory?.hasHistory;

  const summary = useMemo(() => {
    const pcs = lineView.reduce((s, v) => s + v.pcs, 0);
    const amount = lineView.reduce((s, v) => s + v.amount, 0);
    const weight = lines.reduce((s, l) => s + (isReadyMade(l.materialId) ? 0 : Number(l.qty) || 0), 0);
    return { pcs, amount, weight };
  }, [lineView, lines, materials]);

  const supplier = suppliers.find(s => s.id === supplierId);

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const handleMaterialChange = (index: number, id: string) => {
    setLine(index, {
      materialId: id,
      weightPerPiece: isReadyMade(id) ? '' : String(pieceWeightByMaterial.get(id) ?? ''),
    });
  };

  /** After the inline material form saves: fill the first empty line, or add one. */
  const handleNewMaterial = (id: string) => {
    const patch: Partial<Line> = {
      materialId: id,
      weightPerPiece: isReadyMade(id) ? '' : String(pieceWeightByMaterial.get(id) ?? ''),
    };
    const emptyIndex = lines.findIndex(l => !l.materialId);
    if (emptyIndex >= 0) setLine(emptyIndex, patch);
    else setLines(prev => [...prev, { ...emptyLine(), ...patch }]);
    setShowMaterialForm(false);
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (index: number) =>
    setLines(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const lineIsReady = (l: Line) => {
    if (!l.materialId || !(Number(l.rate) > 0)) return false;
    const qty = Number(l.qty) > 0;
    return isReadyMade(l.materialId) ? qty : qty && Number(l.weightPerPiece) > 0;
  };

  const readyCount = lines.filter(lineIsReady).length;
  const fallbackBlocked = needsPipelineReset && (pipelineHistory?.billed || pipelineHistory?.adjusted || !confirmFallback);
  const canSave = Boolean(supplierId) && readyCount > 0 && !fallbackBlocked;

  const handleSave = () => {
    if (!canSave) {
      setFormError(
        fallbackBlocked
          ? pipelineHistory?.billed
            ? 'Delete the processor bill covering these receipts before changing the material.'
            : pipelineHistory?.adjusted
              ? 'Undo the merged dispatch before changing the material.'
              : 'Check the confirmation below to delete this entry’s processor entries and change the material.'
          : 'Choose a supplier and complete at least one line before saving.'
      );
      return;
    }
    setFormError(null);
    try {
      if (isEdit && editId) {
        const l = lines[0];
        const ready = isReadyMade(l.materialId);
        const qty = Number(l.qty) || 0;
        PurchaseService.update(editId, {
          supplierId,
          materialId: l.materialId,
          date,
          weight: ready ? 0 : qty,
          weightUnit: ready ? 'PCS' : 'KG',
          ratePerUnit: Number(l.rate),
          weightPerPiece: ready ? 0 : Number(l.weightPerPiece),
          ...(ready ? { directPcs: Math.round(qty) } : {}),
          // Only ever set when the user confirmed the destructive fallback.
          ...(needsPipelineReset && confirmFallback ? { confirmProcessorEntryDeletion: true } : {}),
        });
        toast.success(needsPipelineReset ? 'Purchase updated — processor entries removed, lot back to raw stock.' : 'Purchase updated.');
      } else {
        for (const l of lines) {
          if (!lineIsReady(l)) continue;
          const ready = isReadyMade(l.materialId);
          const qty = Number(l.qty) || 0;
          PurchaseService.create({
            supplierId,
            materialId: l.materialId,
            date,
            weight: ready ? 0 : qty,
            weightUnit: ready ? 'PCS' : 'KG',
            ratePerUnit: Number(l.rate),
            weightPerPiece: ready ? 0 : Number(l.weightPerPiece),
            ...(ready ? { directPcs: Math.round(qty) } : {}),
          });
        }
        toast.success('Purchase saved — stock and ledger updated.');
      }
      resetForm();
      navigate('/purchases', { replace: true });
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not save the purchase.');
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Purchases</p>
            <h1 className="text-lg font-semibold leading-tight text-foreground">{isEdit ? 'Edit purchase' : 'New purchase'}</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Total</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(summary.amount)}</span>
            </div>
            <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Draft
            </span>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto grid max-w-7xl gap-5 py-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* Supplier & date */}
          <section className="rounded-xl border border-border bg-card">
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end sm:p-5">
              <div className="min-w-0">
                <label htmlFor="pf-supplier" className={label}>
                  Supplier <span className="text-destructive">*</span>
                </label>
                <SearchableSelect
                  options={suppliers.map(s => ({ id: s.id, label: s.name, secondaryLabel: s.phone }))}
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Choose a supplier…"
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="pf-date" className={label}>
                  Purchase date <span className="text-destructive">*</span>
                </label>
                <DatePicker id="pf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
              </div>
              <button
                type="button"
                onClick={() => setShowSupplierForm(v => !v)}
                aria-expanded={showSupplierForm}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" />
                Add supplier
              </button>
            </div>
          </section>

          {/* Inline supplier form — the same one the Suppliers module renders */}
          {showSupplierForm && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">New supplier</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Same form as the Suppliers module — it saves here and is selected automatically.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSupplierForm(false)}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close supplier form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <SupplierForm
                  onSaved={id => {
                    setSupplierId(id);
                    setShowSupplierForm(false);
                  }}
                  onCancel={() => setShowSupplierForm(false)}
                />
              </div>
            </section>
          )}

          {/* Material-change fallback — edit mode only */}
          {materialChanged && pipelineHistory && (
            pipelineHistory.hasHistory ? (
              <section
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-destructive">This purchase has been through a processor</p>
                    <p className="mt-1 leading-relaxed text-destructive/90">
                      {pipelineHistory.sends} dispatch{pipelineHistory.sends === 1 ? '' : 'es'}
                      {pipelineHistory.receipts > 0 ? ` and ${pipelineHistory.receipts} receipt${pipelineHistory.receipts === 1 ? '' : 's'}` : ''} belong to this entry.
                      Changing the material deletes them, and the lot falls back to raw stock of the new material — it has to go through the processors again.
                    </p>
                    {pipelineHistory.billed ? (
                      <p className="mt-2 font-medium text-destructive">
                        A processor bill covers these receipts — delete that bill first, then save.
                      </p>
                    ) : pipelineHistory.adjusted ? (
                      <p className="mt-2 font-medium text-destructive">
                        This batch was merged into another dispatch — undo that dispatch first, then save.
                      </p>
                    ) : (
                      <label className="mt-3 flex cursor-pointer items-start gap-2 select-none">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-destructive"
                          checked={confirmFallback}
                          onChange={e => setConfirmFallback(e.target.checked)}
                        />
                        <span className="font-medium text-destructive">
                          I understand — delete the processor entries and change the material.
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    This entry never reached a processor — the purchased quantity will move into raw stock of the new material automatically.
                  </p>
                </div>
              </section>
            )
          )}

          {/* Line items */}
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Line items</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {readyCount} of {lines.length} line{lines.length === 1 ? '' : 's'} complete
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMaterialForm(v => !v)}
                  aria-expanded={showMaterialForm}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  Add material
                </button>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" />
                  Add line
                </button>
              </div>
            </div>

            {/* Column headers — desktop only */}
            <div className="hidden grid-cols-[minmax(0,1fr)_104px_108px_96px_120px_36px] items-center gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 lg:grid">
              <div className={headCell}>Material</div>
              <div className={cn(headCell, 'text-right')}>Qty</div>
              <div className={cn(headCell, 'text-right')}>Rate</div>
              <div className={cn(headCell, 'text-right')}>Wt / pc</div>
              <div className={cn(headCell, 'text-right')}>Amount</div>
              <div />
            </div>

            <div className="divide-y divide-border/50">
              {lines.map((l, i) => {
                const v = lineView[i];
                const unit = v.ready ? 'PCS' : 'KG';
                return (
                  <div
                    key={l.id}
                    className="grid grid-cols-2 gap-3 px-4 py-4 transition-colors hover:bg-muted/20 sm:px-5 lg:grid-cols-[minmax(0,1fr)_104px_108px_96px_120px_36px] lg:items-start lg:gap-2"
                  >
                    {/* Material */}
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <label className={cn(label, 'lg:hidden')}>Material</label>
                      <SearchableSelect
                        options={materials.map(m => ({
                          id: m.id,
                          label: m.name,
                          secondaryLabel:
                            m.processingPath === 'ready_made'
                              ? 'Ready-made'
                              : m.processingPath === 'single_stage'
                                ? 'Single processor'
                                : 'Full chain',
                        }))}
                        value={l.materialId}
                        onChange={val => handleMaterialChange(i, val)}
                        placeholder="Choose a material…"
                        required
                      />
                    </div>

                    {/* Qty — unit is implied by the material, never a separate switch */}
                    <div className="min-w-0">
                      <label htmlFor={`pf-q-${i}`} className={cn(label, 'lg:hidden')}>
                        Qty ({unit})
                      </label>
                      <div className="relative">
                        <input
                          id={`pf-q-${i}`}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          step="any"
                          value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value })}
                          placeholder="0"
                          aria-label={`Quantity in ${unit}`}
                          className={cn(control, 'pr-11 text-right tabular-nums')}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {unit}
                        </span>
                      </div>
                      <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground/70">
                        {v.ready ? 'counted in pcs' : `${fmtNum(v.pcs)} pcs`}
                      </p>
                    </div>

                    {/* Rate */}
                    <div className="min-w-0">
                      <label htmlFor={`pf-rate-${i}`} className={cn(label, 'lg:hidden')}>
                        Rate / {v.ready ? 'pc' : 'KG'}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          Rs
                        </span>
                        <input
                          id={`pf-rate-${i}`}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          step="any"
                          value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value })}
                          placeholder="0"
                          aria-label={`Rate per ${v.ready ? 'piece' : 'kilogram'}`}
                          className={cn(control, 'pl-9 text-right tabular-nums')}
                        />
                      </div>
                    </div>

                    {/* Weight per piece */}
                    <div className="min-w-0">
                      <label htmlFor={`pf-ppc-${i}`} className={cn(label, 'lg:hidden')}>
                        Wt / pc (KG)
                      </label>
                      {v.ready ? (
                        <div className="flex h-[46px] items-center justify-end rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground/50">
                          —
                        </div>
                      ) : (
                        <input
                          id={`pf-ppc-${i}`}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          step="any"
                          value={l.weightPerPiece}
                          onChange={e => setLine(i, { weightPerPiece: e.target.value })}
                          placeholder="0.000"
                          aria-label="Weight per piece in kilograms"
                          className={cn(control, 'text-right tabular-nums')}
                        />
                      )}
                    </div>

                    {/* Amount */}
                    <div className="min-w-0 text-left lg:text-right">
                      <div className={cn(label, 'lg:hidden')}>Amount</div>
                      <div className="flex h-[46px] items-center text-sm font-semibold tabular-nums text-foreground lg:justify-end">
                        {formatCurrency(v.amount)}
                      </div>
                    </div>

                    {/* Remove */}
                    <div className="col-span-2 flex justify-end lg:col-span-1 lg:justify-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                        className="inline-flex h-[46px] w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Remove line ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {formError && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          {/* Inline material form — the same one the Raw Materials module renders */}
          {showMaterialForm && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">New material</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Same form as the Raw Materials module — it saves here and is dropped into the next open line.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMaterialForm(false)}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close material form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <MaterialForm onSaved={handleNewMaterial} onCancel={() => setShowMaterialForm(false)} />
              </div>
            </section>
          )}
        </div>

        {/* ── Summary ── */}
        <aside className="h-fit xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Summary</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Draft</span>
            </div>
            <dl className="divide-y divide-border/50 px-4">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Supplier</dt>
                <dd className="max-w-[170px] truncate text-sm font-medium text-foreground">{supplier?.name ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Lines</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">
                  {lines.length} · {readyCount} complete
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Pieces</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{fmtNum(summary.pcs)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-xs text-muted-foreground">Weight</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{fmtNum(summary.weight)} KG</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-3.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Total</dt>
                <dd className={cn(adaptiveAmountClass(formatCurrency(summary.amount), 'md'), 'font-bold tabular-nums text-foreground')}>{formatCurrency(summary.amount)}</dd>
              </div>
            </dl>
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            Saving posts stock and the supplier ledger entry immediately.
          </p>
        </aside>
      </div>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {readyCount === 0 ? 'No complete lines yet.' : `${readyCount} line${readyCount === 1 ? '' : 's'} ready · ${formatCurrency(summary.amount)}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/purchases')}
              className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Save purchase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

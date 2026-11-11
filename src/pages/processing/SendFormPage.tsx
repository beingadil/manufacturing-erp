/**
 * Send Raw Material — full-page dispatch form (route /processing/send[/:editId?]).
 *
 * Work order → summary rail. Same engine and the same store actions the old
 * Send-to-Processor modal used — this is the shell, never a reimplementation:
 * stage gating, batch availability, the multi-stage stepper, QuickAdd and the
 * duplicate-pending warnings all behave exactly as before. The rail surfaces
 * what the user is about to do: pcs, KG equivalent, est. bill, what happens to
 * this dispatch at receive time, and how much is left where.
 */
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Layers, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InventoryCalculationService, batchAvailableAtSource, batchRawAvailableOf } from '../../lib/business/InventoryCalculationService';
import { batchCanSendToStage, getMaterialBatchProgress, getSortedStages, visibleStagesForMaterial } from '../../lib/processing/stageProgress';
import { adaptiveAmountClass, cn, formatCurrency, formatNumber } from '../../lib/utils';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { QuickAddMaterial, QuickAddProcessor } from '../../components/QuickAddModals';
import { SearchableSelect } from '../../components/SearchableSelect';
import { DatePicker } from '../../components/ui/date-picker';
import { StageProgressStepper } from '../../components/processing/StageProgressStepper';

/** Matches the SearchableSelect trigger exactly, so every control on a row lines up. */
const control =
  'w-full min-w-0 rounded-xl border border-border bg-card px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const label = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70';

/** One material on a dispatch: its own stage, batch, quantity and rate. */
interface DispatchLine {
  key: string;
  materialId: string;
  materialName: string;
  stageId: string;
  stageName: string;
  batchId?: string;
  batchNo: string;
  pcs: number;
  rate: number;
  estBill: number;
}

const fmtNum = (n: number) => n.toLocaleString('en-PK');

export default function SendFormPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const { materials, processors, processingSends, batches, processingStages } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [stageId, setStageId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [pcs, setPcs] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [batchTrailOpen, setBatchTrailOpen] = useState(false);
  /** Materials already captured for this dispatch — each one goes out on its own. */
  const [dispatchLines, setDispatchLines] = useState<DispatchLine[]>([]);

  const editingSend = useMemo(
    () => (editId ? (processingSends || []).find(s => s.id === editId) || null : null),
    [editId, processingSends],
  );

  // ── Hydrate when editing ──
  useEffect(() => {
    if (!editingSend) return;
    setMaterialId(editingSend.materialId || '');
    setBatchId(editingSend.batchId || '');
    setStageId(editingSend.stageId || '');
    setProcessorId(editingSend.processorId || '');
    setPcs(String(editingSend.pcsSent ?? ''));
    setRate(editingSend.ratePerPiece != null ? String(editingSend.ratePerPiece) : '');
    setDate(editingSend.date || new Date().toISOString().split('T')[0]);
    setNote(editingSend.remarks || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSend?.id]);

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);

  // Processing-path gating: ready-made materials never dispatch; single-stage
  // materials only send to their one fixed stage. The stage dropdown and the
  // auto-stage resolver both follow the selected material's path.
  const selectedMaterial = materials.find(m => m.id === materialId);
  const materialPath = selectedMaterial?.processingPath ?? 'full_chain';
  const isSingleStage = materialPath === 'single_stage';
  const fixedStage = isSingleStage && selectedMaterial?.fixedStageId
    ? sortedStages.find(s => s.id === selectedMaterial.fixedStageId) || null
    : null;
  const isCustomStages = materialPath === 'custom_stages';
  const allowedOrderedStages = useMemo(() => (
    isCustomStages
      ? sortedStages.filter(s => (selectedMaterial?.allowedStageIds || []).includes(s.id))
      : []
  ), [isCustomStages, sortedStages, selectedMaterial]);
  const firstAllowedStage = allowedOrderedStages[0] || null;

  const dispatchableMaterials = useMemo(
    () => materials.filter(m => (m.processingPath ?? 'full_chain') !== 'ready_made'),
    [materials]
  );

  // Auto stage resolution: the material's pcs sit at MULTIPLE stages at once.
  // AUTO picks the earliest stage with pcs waiting; the user can override by
  // picking a batch (locks to that batch's next leg) or a stage explicitly.
  const materialProgress = useMemo(() => {
    if (!materialId || sortedStages.length === 0) return null;
    const candidates: { stageId: string; pcs: number }[] = [];
    const rawTotal = (batches || []).filter(b => b.materialId === materialId)
      .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
    const firstStage = isCustomStages ? firstAllowedStage : sortedStages[0];
    if (rawTotal > 0 && firstStage) candidates.push({ stageId: firstStage.id, pcs: rawTotal });
    for (const stage of sortedStages) {
      if (isCustomStages && !allowedOrderedStages.some(s => s.id === stage.id)) continue;
      const avail = (batches || []).filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + batchAvailableAtSource(b, stage.id), 0);
      if (avail <= 0) continue;
      const next = isCustomStages
        ? allowedOrderedStages.find(s => s.sequence > stage.sequence)
        : sortedStages.find(s => s.sequence === stage.sequence + 1);
      if (next) candidates.push({ stageId: next.id, pcs: avail });
    }
    if (candidates.length === 0) return { nextStage: firstStage || sortedStages[0], isRaw: true };
    const best = [...candidates].sort((a, b) => b.pcs - a.pcs)[0];
    const nextStage = sortedStages.find(s => s.id === best.stageId) || null;
    return { nextStage, isRaw: best.stageId === firstStage?.id };
  }, [materialId, batches, sortedStages, isCustomStages, allowedOrderedStages, firstAllowedStage]);

  // The stages this material is actually configured to pass through — the
  // batch trail renders only those, not every stage in the chain.
  const stepperStages = useMemo(
    () => visibleStagesForMaterial(sortedStages, selectedMaterial),
    [sortedStages, selectedMaterial],
  );

  const batchProgress = useMemo(
    () => (materialId ? getMaterialBatchProgress(materialId, batches || [], stepperStages) : []),
    [materialId, batches, stepperStages]
  );

  const effectiveStageId = useMemo(() => {
    if (editId) return stageId;
    if (isSingleStage && fixedStage) return fixedStage.id;
    if (stageId) return stageId;
    if (batchId) {
      const prog = batchProgress.find(p => p.batch.id === batchId);
      if (prog?.nextStage) return prog.nextStage.id;
    }
    return materialProgress?.nextStage?.id || '';
  }, [editId, stageId, batchId, batchProgress, materialProgress, isSingleStage, fixedStage]);

  const effectiveStageIllegal = isCustomStages && !!effectiveStageId
    && !allowedOrderedStages.some(s => s.id === effectiveStageId);

  const effectiveStage = sortedStages.find(s => s.id === effectiveStageId);
  const rateMethod = effectiveStage?.rateMethod || 'per_piece';
  const billingUnit = effectiveStage?.billingUnit || (rateMethod === 'per_kg' ? 'Per KG' : 'Per PCS');

  // Batches that can be sent to the effective stage.
  const sendableBatches = useMemo(() => {
    if (!materialId) return [];
    if (isSingleStage && fixedStage) {
      return (batches || []).filter(b => b.materialId === materialId && batchRawAvailableOf(b) > 0);
    }
    if (isCustomStages) {
      if (firstAllowedStage && effectiveStageId === firstAllowedStage.id) {
        return (batches || []).filter(b => b.materialId === materialId && batchRawAvailableOf(b) > 0);
      }
      const prevSelected = [...allowedOrderedStages].reverse().find(s => s.sequence < (effectiveStage?.sequence ?? 0));
      if (!prevSelected) return [];
      return (batches || []).filter(b => b.materialId === materialId && batchAvailableAtSource(b, prevSelected.id) > 0);
    }
    return (batches || []).filter(b => b.materialId === materialId && batchCanSendToStage(b, effectiveStageId, sortedStages));
  }, [materialId, batches, effectiveStageId, sortedStages, isSingleStage, fixedStage, isCustomStages, allowedOrderedStages, firstAllowedStage, effectiveStage]);

  // Stage options with available pcs (raw → stage 1; received pcs → the next
  // stage after the one that produced them). One option per SOURCE bucket.
  const stageOptions = useMemo(() => {
    if (!materialId || sortedStages.length === 0) return [];
    if (isSingleStage && fixedStage) {
      const rawTotal = (batches || []).filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
      return rawTotal > 0 ? [{ stageId: fixedStage.id, availablePcs: rawTotal }] : [];
    }
    const opts: { stageId: string; availablePcs: number; fromStageName?: string }[] = [];
    const rawTotal = (batches || []).filter(b => b.materialId === materialId)
      .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
    const firstStage = isCustomStages ? firstAllowedStage : sortedStages[0];
    if (rawTotal > 0 && firstStage) opts.push({ stageId: firstStage.id, availablePcs: rawTotal });
    for (const stage of sortedStages) {
      if (isCustomStages && !allowedOrderedStages.some(s => s.id === stage.id)) continue;
      const avail = (batches || []).filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + batchAvailableAtSource(b, stage.id), 0);
      if (avail <= 0) continue;
      const next = isCustomStages
        ? allowedOrderedStages.find(s => s.sequence > stage.sequence)
        : sortedStages.find(s => s.sequence === stage.sequence + 1);
      if (next) opts.push({ stageId: next.id, availablePcs: avail, fromStageName: stage.name });
    }
    return opts;
  }, [materialId, batches, sortedStages, isSingleStage, fixedStage, isCustomStages, allowedOrderedStages, firstAllowedStage]);

  // Total pcs available for this material at the effective stage.
  const totalAvailable = useMemo(() => {
    if (!effectiveStage) return 0;
    if (isSingleStage && fixedStage) {
      return (batches || [])
        .filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
    }
    if (effectiveStage.sequence <= 1 || (isCustomStages && firstAllowedStage && effectiveStage.id === firstAllowedStage.id)) {
      return (batches || [])
        .filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
    }
    // The lib is the single source of truth: custom_stages draws RAW at the
    // FIRST selected stage and the previous SELECTED stage elsewhere; every
    // other path falls through to the full-chain movement map.
    const requiredSource = InventoryCalculationService.requiredSourceForTargetForPath(
      effectiveStageId,
      sortedStages,
      selectedMaterial
        ? { processingPath: selectedMaterial.processingPath, fixedStageId: selectedMaterial.fixedStageId, allowedStageIds: selectedMaterial.allowedStageIds }
        : undefined,
    );
    if (requiredSource === 'raw') return 0;
    return (batches || []).filter(b => b.materialId === materialId)
      .reduce((sum, b) => sum + batchAvailableAtSource(b, requiredSource), 0);
  }, [effectiveStage, effectiveStageId, materialId, batches, sortedStages, isSingleStage, fixedStage, isCustomStages, allowedOrderedStages, firstAllowedStage]);

  const previousPendingSends = useMemo(() => {
    if (!processorId) return [];
    return processingSends.filter(s => s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial'));
  }, [processingSends, processorId]);

  // Stage-matched processors: a worker assigned to a stage can only work that
  // stage; general workers (no stage) can work any.
  const eligibleProcessors = useMemo(() => {
    if (!effectiveStageId) return processors;
    return processors.filter(p => !p.stageId || p.stageId === effectiveStageId);
  }, [processors, effectiveStageId]);
  const stageMismatch = useMemo(
    () => !!(processorId && !eligibleProcessors.some(p => p.id === processorId)),
    [processorId, eligibleProcessors]
  );

  const perPieceKg = useMemo(() => {
    const m = materials.find(mat => mat.id === materialId);
    if (!m) return 0;
    // Piece weight is carried on the batches — use the freshest Active batch.
    const batch = (batches || []).find(b => b.materialId === materialId && b.weightPerPiece && b.weightPerPiece > 0);
    return batch?.weightPerPiece ?? 0;
  }, [materials, materialId, batches]);

  const qty = parseInt(pcs, 10) || 0;
  const rateNum = Number(rate) || 0;
  const perKg = rateMethod === 'per_kg';
  const weightKg = perKg ? qty * perPieceKg : 0;
  const estBill = rateNum > 0 && qty > 0
    ? (perKg ? (weightKg * rateNum) : (qty * rateNum))
    : 0;
  const overRequested = qty > 0 && qty > totalAvailable + 1e-9;
  const canSend = Boolean(
    processorId && date
    && (dispatchLines.length > 0 || (materialId && qty > 0 && rateNum > 0))
    && !overRequested && !stageMismatch && !effectiveStageIllegal,
  );

  // ── Multiple materials in one dispatch ────────────────────────────────────
  // The line editor above stays exactly as it was — all the stage gating and
  // batch availability still resolve for the material in it. "Add to dispatch"
  // captures that material as a line and clears the editor for the next one,
  // so several materials can go out together. Every line is dispatched on its
  // own, with its own stage, batch, quantity and rate.
  const linesEstBill = dispatchLines.reduce((sum, l) => sum + l.estBill, 0);
  const totalDispatchEstBill = linesEstBill + estBill;

  /** Validate the material currently in the editor and capture it as a line. */
  const captureCurrentLine = (): DispatchLine | null => {
    if (!materialId || !pcs || !rate) {
      setError('Material, quantity and rate are required before adding a line.');
      return null;
    }
    if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return null;
    }
    if (qty > totalAvailable) {
      setError(`Only ${formatNumber(totalAvailable)} PCS are available${effectiveStage ? ` for ${effectiveStage.name}` : ''}.`);
      return null;
    }
    if (!rateNum || rateNum <= 0) {
      setError('Rate must be greater than zero.');
      return null;
    }
    if (stageMismatch) {
      setError(`This processor does not work the ${effectiveStage?.name || 'selected'} stage.`);
      return null;
    }
    if (effectiveStageIllegal) {
      setError(`"${selectedMaterial?.name || 'This material'}" only processes at: ${allowedOrderedStages.map(s => s.name).join(', ') || 'its selected stages'}.`);
      return null;
    }
    const batch = (batches || []).find(b => b.id === batchId);
    return {
      key: `line-${Date.now()}-${dispatchLines.length}`,
      materialId,
      materialName: selectedMaterial?.name ?? 'Material',
      stageId: effectiveStageId,
      stageName: effectiveStage?.name ?? '',
      batchId: batchId || undefined,
      batchNo: batch?.batchNo || '',
      pcs: qty,
      rate: rateNum,
      estBill,
    };
  };

  const addCurrentLine = () => {
    setError(null);
    const line = captureCurrentLine();
    if (!line) return;
    setDispatchLines(prev => [...prev, line]);
    // Clear the editor for the next material.
    setMaterialId('');
    setStageId('');
    setBatchId('');
    setPcs('');
    setRate('');
  };

  const removeDispatchLine = (key: string) => {
    setError(null);
    setDispatchLines(prev => prev.filter(l => l.key !== key));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!processorId || !date) {
      setError('Processor and date are required.');
      return;
    }
    // The editor may be empty when every material was already added as a line.
    const hasCurrentLine = Boolean(materialId);
    if (!hasCurrentLine && dispatchLines.length === 0) {
      setError('Add at least one material to the dispatch.');
      return;
    }
    if (hasCurrentLine && (!pcs || !rate)) {
      setError('Quantity and rate are required.');
      return;
    }
    if (!hasCurrentLine) {
      // Only the captured lines are going out — validate them by saving.
    } else if (stageMismatch) {
      setError(`This processor does not work the ${effectiveStage?.name || 'selected'} stage.`);
      return;
    } else if (effectiveStageIllegal) {
      setError(`"${selectedMaterial?.name || 'This material'}" only processes at: ${allowedOrderedStages.map(s => s.name).join(', ') || 'its selected stages'}.`);
      return;
    } else if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    } else if (qty > totalAvailable) {
      setError(`Only ${formatNumber(totalAvailable)} PCS are available${effectiveStage ? ` for ${effectiveStage.name}` : ''}.`);
      return;
    } else if (!rateNum || rateNum <= 0) {
      setError('Rate must be greater than zero.');
      return;
    }

    try {
      if (editId && editingSend) {
        ProcessingService.updateDispatch(editId, {
          processorId,
          materialId,
          batchId: batchId || undefined,
          stageId: effectiveStageId,
          date,
          pcsSent: qty,
          ratePerPiece: rateNum,
          remarks: note || editingSend.remarks,
        });
        toast.success(`${editingSend.dispatchNo} updated.`);
      } else {
        // Every material on the dispatch goes out as its own dispatch line —
        // its own stage, batch, quantity and rate — so each one is tracked and
        // billed separately.
        const lines = dispatchLines.map(l => ({
          materialId: l.materialId,
          stageId: l.stageId || undefined,
          batchId: l.batchId,
          pcsSent: l.pcs,
          ratePerPiece: l.rate,
        }));
        const current = captureCurrentLine();
        if (current) {
          lines.push({
            materialId: current.materialId,
            stageId: current.stageId || undefined,
            batchId: current.batchId,
            pcsSent: current.pcs,
            ratePerPiece: current.rate,
          });
        }
        for (const line of lines) {
          ProcessingService.dispatch({
            processorId,
            materialId: line.materialId,
            stageId: line.stageId,
            batchId: line.batchId,
            pcsSent: line.pcsSent,
            ratePerPiece: line.ratePerPiece,
            date,
            remarks: note || undefined,
          });
        }
        toast.success(
          lines.length === 1
            ? 'Dispatch saved — the stock ledger and WIP board are updated.'
            : `Dispatch saved — ${lines.length} materials sent, each tracked on its own.`,
        );
      }
      navigate('/processing', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Could not save the dispatch.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-16">
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
            <h1 className="text-lg font-semibold leading-tight text-foreground">{isEdit ? 'Edit Dispatch' : 'Send Raw Material'}</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">Est. bill</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatCurrency(totalDispatchEstBill)}</span>
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
              <p className="mt-0.5 text-xs text-muted-foreground">Worker, material, batch and stage — the recipe for the next leg.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              {/* Worker */}
              <div className="min-w-0 sm:col-span-2">
                <label className={label}>Worker <span className="text-destructive">*</span></label>
                <SearchableSelect
                  options={eligibleProcessors.map(p => ({
                    id: p.id,
                    label: p.name,
                    secondaryLabel: p.stageId
                      ? `${(processingStages || []).find(s => s.id === p.stageId)?.name || 'Worker'}${p.phone ? ` · ${p.phone}` : ''}`
                      : (p.phone ? `General · ${p.phone}` : 'General Worker'),
                    searchValue: p.phone,
                  }))}
                  value={stageMismatch ? '' : processorId}
                  onChange={(val) => { setProcessorId(val); setError(null); }}
                  placeholder="Select worker…"
                  onAdd={() => setAddProcessorOpen(true)}
                  required
                />
                {stageMismatch && (
                  <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    This worker does not work the {effectiveStage?.name || 'selected'} stage — pick a {effectiveStage?.name || 'stage'} worker or a general worker.
                  </p>
                )}
              </div>

              {/* Material */}
              <div className="min-w-0 sm:col-span-2">
                <label className={label}>Material <span className="text-destructive">*</span></label>
                <SearchableSelect
                  options={dispatchableMaterials.map(m => {
                    const matBatches = (batches || []).filter(b => b.materialId === m.id);
                    const rawTotal = matBatches.reduce((s, b) => s + batchRawAvailableOf(b), 0);
                    const parts: string[] = [];
                    if (rawTotal > 0) parts.push(`${formatNumber(rawTotal)} PCS raw`);
                    for (const stage of sortedStages) {
                      const avail = matBatches.reduce((s, b) => s + batchAvailableAtSource(b, stage.id), 0);
                      if (avail <= 0) continue;
                      parts.push(`${formatNumber(avail)} PCS from ${stage.name}`);
                    }
                    const status = parts.length > 0 ? parts.join(' · ') : 'No stock available';
                    return { id: m.id, label: m.name, secondaryLabel: status };
                  })}
                  value={materialId}
                  onChange={(val) => { setMaterialId(val); setBatchId(''); setStageId(''); setError(null); }}
                  placeholder="Select material…"
                  onAdd={() => setAddMaterialOpen(true)}
                  required
                />
                {!materialId && (
                  <p className="mt-1.5 text-xs text-muted-foreground/70">Only materials that go through the processor appear here.</p>
                )}
              </div>

              {/* Batch */}
              <div className="min-w-0">
                <label htmlFor="sf-batch" className={label}>Batch <span className="font-normal normal-case text-muted-foreground/60">(auto = oldest first)</span></label>
                <SearchableSelect
                  className="[&>div]:h-full"
                  options={[
                    { id: '', label: 'Auto — oldest batch first', secondaryLabel: 'FIFO' },
                    ...sendableBatches.map(b => {
                      const isStageOne = !effectiveStage || effectiveStage.sequence <= 1;
                      const avail = isStageOne
                        ? batchRawAvailableOf(b)
                        : batchAvailableAtSource(b, InventoryCalculationService.requiredSourceForTarget(effectiveStageId, sortedStages));
                      const fromStage = !isStageOne && effectiveStage
                        ? sortedStages.find(s => s.id === InventoryCalculationService.requiredSourceForTarget(effectiveStageId, sortedStages))
                        : null;
                      return {
                        id: b.id,
                        label: b.batchNo,
                        secondaryLabel: `Available: ${formatNumber(avail)} PCS${effectiveStage ? ` → ${effectiveStage.name}` : ''}${fromStage ? ` from ${fromStage.name}` : ''}`,
                      };
                    }),
                  ]}
                  value={batchId}
                  onChange={(val) => { setBatchId(val); setStageId(''); setError(null); }}
                  placeholder="Select batch…"
                />
              </div>

              {/* Stage */}
              <div className="min-w-0">
                <label htmlFor="sf-stage" className={label}>
                  Processing stage
                  {isSingleStage && fixedStage && <span className="ml-1.5 font-normal normal-case text-muted-foreground/60">(locked — {selectedMaterial?.name} processes here only)</span>}
                </label>
                <SearchableSelect
                  options={(editId
                    ? sortedStages.map(s => ({ id: s.id, label: s.name + (s.isFinalStage ? ' (Final)' : '') }))
                    : stageOptions.map(opt => {
                        const stage = sortedStages.find(s => s.id === opt.stageId);
                        return {
                          id: opt.stageId,
                          label: stage?.name || 'Stage',
                          secondaryLabel: opt.fromStageName
                            ? `${formatNumber(opt.availablePcs)} PCS from ${opt.fromStageName}`
                            : `${formatNumber(opt.availablePcs)} PCS raw`,
                        };
                      })
                  )}
                  value={editId ? stageId : (effectiveStageId || '')}
                  onChange={(val) => { setStageId(val); setBatchId(''); setError(null); }}
                  placeholder="Select stage…"
                />
                {effectiveStageIllegal && (
                  <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    “{selectedMaterial?.name || 'This material'}” only processes at: {allowedOrderedStages.map(s => s.name).join(', ')}.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Batch trail — every batch of this material, at its real stage.
               Closed by default: it is reference, not action — open it only
               when the exact batch and stage matter. */}
          {materialId && batchProgress.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setBatchTrailOpen(v => !v)}
                aria-expanded={batchTrailOpen}
                aria-controls="batch-trail-body"
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground">
                    <Layers className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">Batch trail</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {batchProgress.length} batch{batchProgress.length === 1 ? '' : 'es'} of {selectedMaterial?.name ?? 'this material'} · real stage per batch
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  {batchTrailOpen ? 'Hide' : 'Show'}
                  <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', batchTrailOpen && 'rotate-180')} />
                </span>
              </button>
              {batchTrailOpen && (
                <div id="batch-trail-body" className="border-t border-border/60">
                  <div className="overflow-hidden">
                    {batchProgress.map((prog, i) => {
                      const total = (prog.rawPcs || 0) + (prog.availablePcs || 0) + (prog.inTransitPcs || 0);
                      return (
                        <div key={prog.batch.id} className={cn('px-4 py-3 sm:px-5', i > 0 && 'border-t border-border/40')}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="font-mono text-xs font-semibold text-foreground">{prog.batch.batchNo}</span>
                              <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {formatNumber(total)} PCS
                              </span>
                              {prog.isRaw && <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Raw</span>}
                              {prog.isFinished && <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Finished</span>}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                              {prog.rawPcs > 0 && <span>Raw <span className="font-semibold text-foreground">{formatNumber(prog.rawPcs)}</span></span>}
                              {prog.availablePcs > 0 && <span>Avail <span className="font-semibold text-foreground">{formatNumber(prog.availablePcs)}</span></span>}
                              {prog.inTransitPcs > 0 && <span>WIP <span className="font-semibold text-amber-700 dark:text-amber-300">{formatNumber(prog.inTransitPcs)}</span></span>}
                            </div>
                          </div>
                          <StageProgressStepper
                            stages={stepperStages}
                            completedStageIds={prog.completedStages.map(s => s.id)}
                            currentStageId={prog.currentStage?.id}
                            nextStageId={prog.nextStage?.id}
                            compact
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-foreground">Quantity &amp; rating</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">How much goes, and what it costs per unit.</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
              {/* Pcs */}
              <div className="min-w-0">
                <label htmlFor="sf-pcs" className={label}>Pcs to send <span className="text-destructive">*</span></label>
                <div className="relative">
                  <input
                    id="sf-pcs"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    required
                    placeholder="0"
                    value={pcs}
                    onChange={e => { setPcs(e.target.value); setError(null); }}
                    aria-label="Pieces to send"
                    className={cn(control, 'pr-12 text-right tabular-nums')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    PCS
                  </span>
                </div>
                <p className={cn('mt-1.5 text-right text-[10px] tabular-nums', overRequested ? 'font-semibold text-destructive' : 'text-muted-foreground/70')}>
                  {overRequested
                    ? `Only ${formatNumber(totalAvailable)} available`
                    : `${formatNumber(totalAvailable)} available${effectiveStage ? ` → ${effectiveStage.name}` : ''}`}
                </p>
              </div>

              {/* Rate */}
              <div className="min-w-0">
                <label htmlFor="sf-rate" className={label}>Rate / {perKg ? 'kg' : 'pc'} <span className="text-destructive">*</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Rs</span>
                  <input
                    id="sf-rate"
                    type="number"
                    min="0"
                    inputMode="decimal"
                    required
                    placeholder="0"
                    value={rate}
                    onChange={e => { setRate(e.target.value); setError(null); }}
                    aria-label="Rate"
                    className={cn(control, 'pl-9 text-right tabular-nums')}
                  />
                </div>
                <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-foreground/70">
                  {perKg
                    ? (perPieceKg > 0 ? `${fmtNum(qty * perPieceKg)} KG · ${billingUnit}` : billingUnit)
                    : billingUnit}
                </p>
              </div>

              {/* Date */}
              <div className="min-w-0">
                <label htmlFor="sf-date" className={label}>Dispatch date <span className="text-destructive">*</span></label>
                <DatePicker id="sf-date" value={date} onChange={setDate} className="h-[46px] w-full rounded-xl" />
              </div>

              {/* Remarks */}
              <div className="min-w-0 sm:col-span-3">
                <label htmlFor="sf-remarks" className={label}>Remarks <span className="font-normal normal-case text-muted-foreground/60">(optional)</span></label>
                <input
                  id="sf-remarks"
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. dispatch for Acid stage — 20 Nov"
                  autoComplete="off"
                  className={control}
                />
              </div>
            </div>

            {/* ── Materials on this dispatch ── */}
            {!editId && (
              <div className="border-t border-border/60 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Materials on this dispatch
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Add the material above, then add another — each line goes out on its own.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addCurrentLine}
                    disabled={!materialId}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to dispatch
                  </button>
                </div>

                {dispatchLines.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {dispatchLines.map((l, index) => (
                      <li
                        key={l.key}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-foreground">{l.materialName}</span>
                        <span className="text-xs text-muted-foreground">
                          {l.stageName || 'Initial Processor'}{l.batchNo ? ` · ${l.batchNo}` : ''}
                        </span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {formatNumber(l.pcs)} PCS @ {formatNumber(l.rate)} = {formatCurrency(l.estBill)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDispatchLine(l.key)}
                          aria-label={`Remove ${l.materialName} from the dispatch`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {error && (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* ── Summary rail ── */}
        <aside className="h-fit xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Dispatch summary</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live</span>
            </div>
            <div className="divide-y divide-border/50 px-4">
              <div className="py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Material</div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">{selectedMaterial?.name ?? '—'}</div>
                {batchId && (
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Batch {batches?.find(b => b.id === batchId)?.batchNo}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/80">{effectiveStage?.name ?? '—'}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/80">
                    {effectiveStage ? (sortedStages.find(s => s.sequence === effectiveStage.sequence + 1)?.name ?? 'Final return') : '—'}
                  </span>
                </div>
              </div>

              {[
                ['Pcs to send', fmtNum(qty)],
                ...(perKg ? [['Weight', `${fmtNum(weightKg)} KG`]] : []),
                ['Rate method', billingUnit],
              ].map(([dt, dd]) => (
                <div key={dt as string} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-xs text-muted-foreground">{dt}</dt>
                  <dd className="text-sm font-medium tabular-nums text-foreground">{dd}</dd>
                </div>
              ))}

              <div className="flex baseline justify-between gap-4 py-3.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Est. bill</dt>
                <dd className={cn(adaptiveAmountClass(formatCurrency(estBill), 'md'), 'font-bold tabular-nums text-foreground')}>
                  {formatCurrency(estBill)}
                </dd>
              </div>
            </div>

            {previousPendingSends.length > 0 && (
              <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="flex items-start gap-1.5 text-[11px] font-medium leading-snug text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {previousPendingSends.length} other dispatch{previousPendingSends.length === 1 ? '' : 'es'} already pending at this worker — oldest first: {previousPendingSends.slice(0, 2).map(s => s.dispatchNo).join(', ')}{previousPendingSends.length > 2 ? '…' : ''}
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
            On receive, this cost capitalises to Raw Material Inventory and the accrued charge posts at that moment. Nothing is posted until the pcs come back.
          </p>
        </aside>
      </form>

      {/* ── Action bar ── */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {dispatchLines.length > 0
              ? `${dispatchLines.length + (materialId && qty > 0 && !overRequested ? 1 : 0)} materials ready - ${formatCurrency(totalDispatchEstBill)}`
              : qty > 0 && !overRequested ? `${fmtNum(qty)} pcs ready - ${formatCurrency(estBill)}` : 'Complete the required fields to send.'}
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
              disabled={!canSend}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Send to processor'}
            </button>
          </div>
        </div>
      </div>

      <QuickAddProcessor
        isOpen={addProcessorOpen}
        onClose={() => setAddProcessorOpen(false)}
        onSuccess={(id: string) => { setProcessorId(id); setAddProcessorOpen(false); }}
      />
      <QuickAddMaterial
        isOpen={addMaterialOpen}
        onClose={() => setAddMaterialOpen(false)}
        onSuccess={(id: string) => { setMaterialId(id); setAddMaterialOpen(false); }}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { InventoryCalculationService } from '../../lib/business/InventoryCalculationService';
import { batchCanSendToStage, getMaterialBatchProgress, getSortedStages } from '../../lib/processing/stageProgress';
import { formatNumber } from '../../lib/utils';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { QuickAddMaterial, QuickAddProcessor } from '../QuickAddModals';
import { SearchableSelect } from '../SearchableSelect';
import { DatePicker } from '../ui/date-picker';
import { PageModal } from '../ui/PageModal';
import { StageProgressStepper } from './StageProgressStepper';

interface SendToProcessorFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, the form edits this dispatch (historical records editable). */
  editSendId?: string;
}

/**
 * Send-to-Processor form — multi-stage aware.
 *  - Shows a per-batch stage stepper (different batches of the same material
 *    sit at different stages simultaneously).
 *  - Auto-selects the next valid stage; selecting a batch locks the stage to
 *    that batch's next leg.
 *  - Every rejection shows an inline error (no more silent no-ops).
 */
export function SendToProcessorForm({
  isOpen,
  onClose,
  editSendId,
}: SendToProcessorFormProps) {
  const { materials, processors, processingSends, batches, processingStages } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [stageId, setStageId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [pcs, setPcs] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [adjustPendingIds, setAdjustPendingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);

  // Edit mode: populate the form from the existing dispatch when it opens.
  // Without this the Edit dialog opens blank (and saving would wipe the record).
  useEffect(() => {
    if (!isOpen) return;
    if (editSendId) {
      const send = processingSends.find(s => s.id === editSendId);
      if (send) {
        setMaterialId(send.materialId || '');
        setBatchId(send.batchId || '');
        setStageId(send.stageId || '');
        setProcessorId(send.processorId || '');
        setPcs(String(send.pcsSent ?? ''));
        setRate(send.ratePerPiece != null ? String(send.ratePerPiece) : '');
        setDate(send.date || new Date().toISOString().split('T')[0]);
        setNote(send.remarks || '');
        setAdjustPendingIds([]);
        setError(null);
      }
    } else {
      setMaterialId('');
      setBatchId('');
      setStageId('');
      setProcessorId('');
      setPcs('');
      setRate('');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setAdjustPendingIds([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editSendId]);

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);
  const selectedMaterial = materials.find(m => m.id === materialId);

  // Auto stage resolution: the material's pcs sit at MULTIPLE stages at once
  // (1100 purchased → 1000 at Machine, 100 still raw). AUTO therefore picks
  // the EARLIEST stage with pcs waiting — raw goes to stage 1 first; only
  // when nothing is raw does it move on to the earliest stage with received
  // pcs available. The user can always override by picking a batch (locks to
  // that batch's next leg) or a stage explicitly.
  const materialProgress = useMemo(() => {
    if (!materialId || sortedStages.length === 0) return null;
    const batchesOfMaterial = (batches || []).filter(b => b.materialId === materialId);
    const rawTotal = batchesOfMaterial.reduce(
      (sum, b) => sum + InventoryCalculationService.batchRawAvailable(b), 0
    );
    // Available pcs grouped by the stage that PRODUCED them (availableFromStageId,
    // NOT currentStageId which may have advanced past the source stage by a
    // previous dispatch).
    const stageTotals = new Map<string, number>();
    for (const b of batchesOfMaterial) {
      const avail = b.stageAvailablePcs || 0;
      const fromStage = b.availableFromStageId || b.currentStageId;
      if (avail > 0 && fromStage) {
        stageTotals.set(fromStage, (stageTotals.get(fromStage) || 0) + avail);
      }
    }
    // Candidate targets: stage 1 for raw pcs + the next stage after every source
    // stage holding available pcs. Raw pcs and received pcs COEXIST (3700 came
    // back from Initial while 93 are still raw — BOTH are sendable).
    const candidates: { stageId: string; pcs: number }[] = [];
    if (rawTotal > 0 && sortedStages[0]) candidates.push({ stageId: sortedStages[0].id, pcs: rawTotal });
    for (const stage of sortedStages) {
      const avail = stageTotals.get(stage.id) || 0;
      if (avail <= 0) continue;
      const next = sortedStages.find(s => s.sequence === stage.sequence + 1);
      if (next) candidates.push({ stageId: next.id, pcs: avail });
    }
    if (candidates.length === 0) return { nextStage: sortedStages[0], isRaw: true };
    // Default to the bucket with the MOST pcs so the user lands on their main
    // flow (3700 from Initial, not the 93 raw leftovers).
    const best = [...candidates].sort((a, b) => b.pcs - a.pcs)[0];
    const nextStage = sortedStages.find(s => s.id === best.stageId) || null;
    return { nextStage, isRaw: best.stageId === sortedStages[0]?.id };
  }, [materialId, batches, sortedStages, selectedMaterial]);

  // Per-batch progress for the selected material (the multi-stage view).
  const batchProgress = useMemo(
    () => (materialId ? getMaterialBatchProgress(materialId, batches || [], sortedStages) : []),
    [materialId, batches, sortedStages]
  );

  // Resolve the effective stage: explicit selection > selected batch's next > material auto.
  const effectiveStageId = useMemo(() => {
    if (editSendId) return stageId;
    if (stageId) return stageId;
    if (batchId) {
      const prog = batchProgress.find(p => p.batch.id === batchId);
      if (prog?.nextStage) return prog.nextStage.id;
    }
    return materialProgress?.nextStage?.id || '';
  }, [editSendId, stageId, batchId, batchProgress, materialProgress]);

  const effectiveStage = sortedStages.find(s => s.id === effectiveStageId);
  const rateMethod = effectiveStage?.rateMethod || 'per_piece';

  // Batches that can be sent to the effective stage.
  const sendableBatches = useMemo(() => {
    if (!materialId) return [];
    return (batches || []).filter(b => b.materialId === materialId && batchCanSendToStage(b, effectiveStageId, sortedStages));
  }, [materialId, batches, effectiveStageId, sortedStages]);

  // All target stages the user can send to right now, with the pcs available at
  // each — raw pcs go to stage 1, received pcs go to the NEXT stage after the
  // stage that produced them. Rendered as a real dropdown so the user can send
  // 3700 received pcs to Machine Man even while 93 are still raw.
  const stageOptions = useMemo(() => {
    if (!materialId || sortedStages.length === 0) return [];
    const opts: { stageId: string; availablePcs: number; fromStageName?: string }[] = [];
    const batchesOfMaterial = (batches || []).filter(b => b.materialId === materialId);
    const rawTotal = batchesOfMaterial.reduce(
      (sum, b) => sum + InventoryCalculationService.batchRawAvailable(b), 0
    );
    if (rawTotal > 0 && sortedStages[0]) {
      opts.push({ stageId: sortedStages[0].id, availablePcs: rawTotal });
    }
    const bySource = new Map<string, number>();
    for (const b of batchesOfMaterial) {
      const fromStage = b.availableFromStageId || b.currentStageId;
      const avail = b.stageAvailablePcs || 0;
      if (avail > 0 && fromStage) {
        bySource.set(fromStage, (bySource.get(fromStage) || 0) + avail);
      }
    }
    for (const stage of sortedStages) {
      const avail = bySource.get(stage.id) || 0;
      if (avail <= 0) continue;
      const next = sortedStages.find(s => s.sequence === stage.sequence + 1);
      if (next) opts.push({ stageId: next.id, availablePcs: avail, fromStageName: stage.name });
    }
    return opts;
  }, [materialId, batches, sortedStages]);

  // Total pcs available for this material at the effective stage.
  // Multi-position aware: stage 1 draws raw pcs (never-dispatched remainder);
  // intermediate stages draw every batch holding available pcs at the source
  // stage, regardless of currentStageId (partial re-dispatches advance
  // currentStageId without consuming other batches' availability).
  const totalAvailable = useMemo(() => {
    if (!effectiveStage || effectiveStage.sequence <= 1) {
      return (batches || [])
        .filter(b => b.materialId === materialId)
        .reduce((sum, b) => sum + InventoryCalculationService.batchRawAvailable(b), 0);
    }
    return batchProgress.reduce((sum, p) => {
      const sourceSeq = effectiveStage.sequence - 1;
      const sourceStage = sortedStages.find(s => s.sequence === sourceSeq);
      // Use availableFromStageId from the batch to determine source stage
      // (currentStageId may have advanced past the source stage)
      const availSource = p.batch?.availableFromStageId || p.currentStage?.id;
      const avail = sourceStage && availSource === sourceStage.id
        ? p.availablePcs
        : 0;
      return sum + avail;
    }, 0);
  }, [effectiveStage, selectedMaterial, batchProgress, sortedStages]);

  const previousPendingSends = useMemo(() => {
    if (!processorId) return [];
    return processingSends.filter(s => s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial'));
  }, [processingSends, processorId]);

  // Stage-matched processors: a worker assigned to a stage can only work that
  // stage; general workers (no stage) can work any. Choosing 'Machine' must
  // never offer the Acid man.
  const eligibleProcessors = useMemo(() => {
    if (!effectiveStageId) return processors;
    return processors.filter(p => !p.stageId || p.stageId === effectiveStageId);
  }, [processors, effectiveStageId]);
  const stageMismatch = useMemo(
    () => !!(processorId && !eligibleProcessors.some(p => p.id === processorId)),
    [processorId, eligibleProcessors]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!processorId || !materialId || !pcs || !rate || !date) {
      setError('Processor, material, quantity, rate and date are required.');
      return;
    }
    if (stageMismatch) {
      setError(`This processor does not work the ${effectiveStage?.name || 'selected'} stage.`);
      return;
    }
    const qty = parseInt(pcs, 10);
    if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    }
    if (!editSendId && effectiveStageId && qty > totalAvailable) {
      setError(`Only ${formatNumber(totalAvailable)} PCS are available at ${effectiveStage?.name || 'this stage'}.`);
      return;
    }
    if (batchId) {
      const b = sendableBatches.find(x => x.id === batchId);
      if (b) {
        const isStageOne = !effectiveStage || effectiveStage.sequence <= 1;
        const avail = isStageOne
          ? InventoryCalculationService.batchRawAvailable(b)
          : (b.stageAvailablePcs || 0);
        if (!editSendId && qty > (avail || 0)) {
          setError(`Only ${formatNumber(avail || 0)} PCS available in batch ${b.batchNo}.`);
          return;
        }
      }
    }

    if (editSendId) {
      ProcessingService.updateDispatch(editSendId, {
        processorId,
        materialId,
        stageId: stageId || undefined,
        batchId: batchId || undefined,
        pcsSent: qty,
        ratePerPiece: parseFloat(rate),
        date,
        remarks: note,
      });
    } else {
      ProcessingService.dispatch({
        processorId,
        materialId,
        stageId: effectiveStageId || undefined,
        batchId: batchId || undefined,
        pcsSent: qty,
        ratePerPiece: parseFloat(rate),
        date,
        remarks: note,
      }, adjustPendingIds.length > 0 ? adjustPendingIds : undefined);
    }

    onClose();
    setPcs('');
    setRate('');
    setNote('');
    setBatchId('');
    setStageId('');
    setAdjustPendingIds([]);
    setError(null);
  };

  return (
    <PageModal isOpen={isOpen} onClose={onClose} title={editSendId ? 'Edit Dispatch' : 'Send to Processor'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Processor {effectiveStage && <span className="text-muted-foreground font-normal">· workers for {effectiveStage.name}</span>}
          </label>
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
            placeholder="Select Processor..."
            onAdd={() => setAddProcessorOpen(true)}
            required
          />
          {stageMismatch && (
            <p className="text-xs text-destructive mt-1">
              The selected processor does not work the {effectiveStage?.name} stage — pick a {effectiveStage?.name} worker or a general worker.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Material</label>
          <SearchableSelect
            options={materials.map(m => {
              const matBatches = (batches || []).filter(b => b.materialId === m.id);
              const rawTotal = matBatches.reduce((s, b) => s + InventoryCalculationService.batchRawAvailable(b), 0);
              const bySource = new Map<string, number>();
              for (const b of matBatches) {
                const fromStage = b.availableFromStageId || b.currentStageId;
                const avail = b.stageAvailablePcs || 0;
                if (avail > 0 && fromStage) bySource.set(fromStage, (bySource.get(fromStage) || 0) + avail);
              }
              const parts: string[] = [];
              if (rawTotal > 0) parts.push(`${formatNumber(rawTotal)} PCS raw`);
              for (const stage of sortedStages) {
                const avail = bySource.get(stage.id) || 0;
                if (avail <= 0) continue;
                parts.push(`${formatNumber(avail)} PCS from ${stage.name}`);
              }
              const status = parts.length > 0 ? parts.join(' · ') : 'No stock available';
              return { id: m.id, label: m.name, secondaryLabel: status };
            })}
            value={materialId}
            onChange={(val) => { setMaterialId(val); setBatchId(''); setStageId(''); setError(null); }}
            placeholder="Select Material..."
            onAdd={() => setAddMaterialOpen(true)}
            required
          />
        </div>

        {/* Batch-scoped stage progress — the multi-stage view of this material */}
        {materialId && batchProgress.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Batches of this material — each batch sits at its own stage:
            </div>
            {batchProgress.map(prog => (
              <div key={prog.batch.id} className="rounded-lg border border-border bg-card p-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">
                    {prog.batch.batchNo}
                    {prog.isRaw && <span className="ml-1.5 text-[10px] text-muted-foreground">Raw</span>}
                    {prog.isFinished && <span className="ml-1.5 text-[10px] text-emerald-600">Finished</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground text-right">
                    {prog.rawPcs > 0 && `Raw ${formatNumber(prog.rawPcs)} PCS`}
                    {prog.availablePcs > 0 && `${prog.rawPcs > 0 ? ' · ' : ''}Avail ${formatNumber(prog.availablePcs)} PCS`}
                    {prog.inTransitPcs > 0 && ` · WIP ${formatNumber(prog.inTransitPcs)}`}
                  </span>
                </div>
                <StageProgressStepper
                  stages={sortedStages}
                  completedStageIds={prog.completedStages.map(s => s.id)}
                  currentStageId={prog.currentStage?.id}
                  nextStageId={prog.nextStage?.id}
                  compact
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Batch (optional — Auto picks oldest first)</label>
          <select
            value={batchId}
            onChange={e => { setBatchId(e.target.value); setStageId(''); setError(null); }}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            disabled={!materialId}
          >
            <option value="">Auto (oldest batch first)</option>
            {sendableBatches.map(b => {
              const prog = batchProgress.find(p => p.batch.id === b.id);
              const isStageOne = !effectiveStage || effectiveStage.sequence <= 1;
              const avail = isStageOne
                ? (prog?.rawPcs ?? InventoryCalculationService.batchRawAvailable(b))
                : (prog?.availablePcs || b.stageAvailablePcs || 0);
              return <option key={b.id} value={b.id}>{b.batchNo} (Available: {formatNumber(avail)} PCS{effectiveStage ? ` → ${effectiveStage.name}` : ''}{(() => { const fromStage = !isStageOne ? sortedStages.find(s => s.id === b.availableFromStageId) : null; return fromStage ? ` from ${fromStage.name}` : ''; })()})</option>;
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Processing Stage</label>
          <select
            value={editSendId ? stageId : (effectiveStageId || '')}
            onChange={e => { setStageId(e.target.value); setBatchId(''); setError(null); }}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            disabled={!materialId}
          >
            {!materialId && <option value="">Select material first</option>}
            {editSendId
              ? sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>)
              : stageOptions.map(opt => (
                  <option key={opt.stageId} value={opt.stageId}>
                    {sortedStages.find(s => s.id === opt.stageId)?.name || 'Stage'}
                    {opt.fromStageName
                      ? ` — ${formatNumber(opt.availablePcs)} PCS from ${opt.fromStageName}`
                      : ` — ${formatNumber(opt.availablePcs)} PCS raw`}
                  </option>
                ))}
          </select>
          {!editSendId && materialId && stageOptions.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">No pcs available to send for this material.</p>
          )}
        </div>

        <input
          type="number"
          required
          min="1"
          max={totalAvailable > 0 ? totalAvailable : undefined}
          placeholder="PCS to Send"
          value={pcs}
          onChange={e => setPcs(e.target.value)}
          className="w-full rounded-xl border p-3 text-sm"
        />
        {materialId && effectiveStage && totalAvailable > 0 && (
          <p className="text-xs text-muted-foreground -mt-1">
            Available: {formatNumber(totalAvailable)} PCS
            {effectiveStage.sequence > 1
              ? ` from ${sortedStages.find(s => s.sequence === effectiveStage.sequence - 1)?.name || ''}`
              : ' raw'}
          </p>
        )}
        <input
          type="number"
          step="0.01"
          required
          placeholder={rateMethod === 'per_kg' ? 'Rate Per KG (PKR)' : 'Rate Per Piece (PKR)'}
          value={rate}
          onChange={e => setRate(e.target.value)}
          className="w-full rounded-xl border p-3 text-sm"
        />
        <DatePicker value={date} onChange={setDate} />

        {previousPendingSends.length > 0 && !editSendId && (
          <div className="bg-warning/10 border border-amber-200 rounded-xl p-4 mt-2">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">Processor has pending items. Adjust into new dispatch?</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {previousPendingSends.map(s => {
                const m = materials.find(mat => mat.id === s.materialId);
                const pending = s.pcsSent - s.pcsReceived;
                return (
                  <label key={s.id} className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={adjustPendingIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setAdjustPendingIds(prev => [...prev, s.id]);
                        else setAdjustPendingIds(prev => prev.filter(id => id !== s.id));
                      }}
                    />
                    <span>{m?.name || 'Material'}: {pending} PCS from {s.dispatchNo} ({new Date(s.date).toLocaleDateString()})</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold">
            {editSendId ? 'Save Changes' : 'Send Items'}
          </button>
        </div>
      </form>
      <QuickAddProcessor
        isOpen={addProcessorOpen}
        onClose={() => setAddProcessorOpen(false)}
        onSuccess={(id) => { setProcessorId(id); setAddProcessorOpen(false); }}
      />
      <QuickAddMaterial
        isOpen={addMaterialOpen}
        onClose={() => setAddMaterialOpen(false)}
        onSuccess={(id) => { setMaterialId(id); setAddMaterialOpen(false); }}
      />
    </PageModal>
  );
}

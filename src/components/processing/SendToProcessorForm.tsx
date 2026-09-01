import { useMemo, useState } from 'react';
import { PageModal } from '../ui/PageModal';
import { SearchableSelect } from '../SearchableSelect';
import { DatePicker } from '../ui/date-picker';
import { QuickAddMaterial, QuickAddProcessor } from '../QuickAddModals';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { getMaterialBatchProgress, getSortedStages, batchCanSendToStage } from '../../lib/processing/stageProgress';
import { formatNumber } from '../../lib/utils';
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

  const sortedStages = useMemo(() => getSortedStages(processingStages || []), [processingStages]);
  const selectedMaterial = materials.find(m => m.id === materialId);

  // Material-level next stage (auto) — used when no explicit batch is chosen.
  const materialProgress = useMemo(() => {
    if (!materialId || sortedStages.length === 0) return null;
    const batchesOfMaterial = (batches || []).filter(b => b.materialId === materialId);
    let maxSeq = 0;
    for (const b of batchesOfMaterial) {
      if (b.currentStageId) {
        const st = sortedStages.find(s => s.id === b.currentStageId);
        if (st && st.sequence > maxSeq) maxSeq = st.sequence;
      }
    }
    return {
      nextStage: maxSeq === 0 ? sortedStages[0] : sortedStages.find(s => s.sequence === maxSeq + 1) || null,
      isRaw: maxSeq === 0,
    };
  }, [materialId, batches, sortedStages]);

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

  // Total pcs available for this material at the effective stage.
  const totalAvailable = useMemo(() => {
    if (!effectiveStage) return selectedMaterial?.stockPcs || 0;
    if (effectiveStage.sequence <= 1) return selectedMaterial?.stockPcs || 0;
    return batchProgress
      .filter(p => p.currentStage && effectiveStage.sequence - 1 === (p.currentStage.sequence))
      .reduce((sum, p) => sum + p.availablePcs, 0);
  }, [effectiveStage, selectedMaterial, batchProgress]);

  const previousPendingSends = useMemo(() => {
    if (!processorId) return [];
    return processingSends.filter(s => s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial'));
  }, [processingSends, processorId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!processorId || !materialId || !pcs || !rate || !date) {
      setError('Processor, material, quantity, rate and date are required.');
      return;
    }
    const qty = parseInt(pcs, 10);
    if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    }
    if (effectiveStageId && qty > totalAvailable) {
      setError(`Only ${formatNumber(totalAvailable)} PCS are available at ${effectiveStage?.name || 'this stage'}.`);
      return;
    }
    if (batchId) {
      const b = sendableBatches.find(x => x.id === batchId);
      const avail = b ? (b.stageAvailablePcs || 0) > 0 ? b.stageAvailablePcs : b.remainingPcs : 0;
      if (b && qty > (avail || 0)) {
        setError(`Only ${formatNumber(avail || 0)} PCS available in batch ${b.batchNo}.`);
        return;
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
          <label className="block text-sm font-medium text-foreground/80 mb-1">Processor</label>
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
            onChange={setProcessorId}
            placeholder="Select Processor..."
            onAdd={() => setAddProcessorOpen(true)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Material</label>
          <SearchableSelect
            options={materials.map(m => {
              const hasRaw = (m.stockPcs || 0) > 0;
              const matBatches = (batches || []).filter(b => b.materialId === m.id);
              const hasWip = matBatches.some(b => b.currentStageId);
              const status = hasRaw && !hasWip ? 'Raw' : hasWip ? 'In Progress' : 'Raw';
              return { id: m.id, label: m.name, secondaryLabel: `${status} · ${m.stockPcs || 0} PCS raw` };
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
                  <span className="text-[10px] text-muted-foreground">
                    {prog.availablePcs > 0 && `Avail ${formatNumber(prog.availablePcs)} PCS`}
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
              const avail = prog && prog.availablePcs > 0 ? prog.availablePcs : b.remainingPcs;
              return <option key={b.id} value={b.id}>{b.batchNo} (Available: {formatNumber(avail)} PCS{prog?.nextStage ? ` → ${prog.nextStage.name}` : ''})</option>;
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Processing Stage</label>
          {editSendId ? (
            <select
              value={stageId}
              onChange={e => setStageId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            >
              {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalStage ? ' (Final)' : ''}</option>)}
            </select>
          ) : (
            <div className="w-full rounded-xl border border-border bg-muted/50 p-3 text-sm flex items-center justify-between">
              <span className="font-medium">
                {effectiveStage?.name || 'Select material first'}
                {effectiveStage?.isFinalStage ? ' (Final Stage)' : ''}
              </span>
              {materialProgress?.nextStage && (
                <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">AUTO</span>
              )}
            </div>
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

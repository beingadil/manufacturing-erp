import { useMemo, useState } from 'react';
import { PageModal } from '../ui/PageModal';
import { SearchableSelect } from '../SearchableSelect';
import { DatePicker } from '../ui/date-picker';
import { QuickAddProcessor } from '../QuickAddModals';
import { ErrorManagement } from '../../lib/validation';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { formatNumber } from '../../lib/utils';

interface ReceiveFromProcessorFormProps {
  isOpen: boolean;
  onClose: () => void;
  editReceiveId?: string;
}

/**
 * Receive-from-Processor form. Every rejection shows an inline error (no more
 * silent no-ops). The pending-send picker shows the stage each dispatch went to.
 */
export function ReceiveFromProcessorForm({
  isOpen,
  onClose,
  editReceiveId,
}: ReceiveFromProcessorFormProps) {
  const { materials, processors, processingSends, processingReceipts, processingStages } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [sendId, setSendId] = useState('');
  const [pcs, setPcs] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);

  const openSends = useMemo(() => processingSends.filter(s =>
    s.processorId === processorId && (s.status === 'Pending' || s.status === 'Partial')
  ), [processingSends, processorId]);

  const selectedSend = processingSends.find(s => s.id === sendId);
  const maxPcs = selectedSend ? selectedSend.pcsSent - selectedSend.pcsReceived : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!processorId || !sendId || !pcs || !date) {
      setError('Processor, dispatch, quantity and date are required.');
      return;
    }
    if (!selectedSend) {
      setError('Select a valid pending dispatch.');
      return;
    }
    const qty = parseInt(pcs, 10);
    if (!qty || qty <= 0) {
      setError('Quantity must be a positive whole number of PCS.');
      return;
    }
    if (qty > maxPcs) {
      setError(`Only ${formatNumber(maxPcs)} PCS are pending on this dispatch.`);
      return;
    }

    ErrorManagement.safeExecuteSync(() => {
      if (editReceiveId) {
        ProcessingService.updateReceive(editReceiveId, {
          sendId,
          processorId,
          materialId: selectedSend.materialId,
          pcsReceived: qty,
          date,
        });
      } else {
        const previouslyReceived = processingReceipts
          .filter(r => r.sendId === sendId)
          .reduce((sum, r) => sum + r.pcsReceived, 0);
        ProcessingService.receive({
          sendId,
          processorId,
          materialId: selectedSend.materialId,
          date,
          pcsReceived: qty,
          dispatchedPcs: selectedSend.pcsSent,
          previouslyReceivedPcs: previouslyReceived,
        });
      }
      onClose();
      setPcs('');
      setSendId('');
      setError(null);
    }, 'Processing Receive Save');
  };

  return (
    <PageModal isOpen={isOpen} onClose={onClose} title={editReceiveId ? 'Edit Receipt' : 'Receive from Processor'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Processor</label>
          <SearchableSelect
            options={processors.map(p => ({ id: p.id, label: p.name, searchValue: p.phone }))}
            value={processorId}
            onChange={(val) => { setProcessorId(val); setSendId(''); setError(null); }}
            placeholder="Select Processor..."
            onAdd={() => setAddProcessorOpen(true)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Pending Dispatch</label>
          <select
            required
            value={sendId}
            onChange={e => { setSendId(e.target.value); setError(null); }}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            disabled={!processorId}
          >
            <option value="">Select Pending Send Entry</option>
            {openSends.map(s => {
              const m = materials.find(mat => mat.id === s.materialId);
              const st = processingStages.find(x => x.id === s.stageId);
              return <option key={s.id} value={s.id}>{new Date(s.date).toLocaleDateString()} - {m?.name} ({st?.name || 'Initial Processor'}) ({formatNumber(s.pcsSent - s.pcsReceived)} pending)</option>;
            })}
          </select>
        </div>

        {selectedSend && maxPcs > 0 && (
          <div className="text-xs text-muted-foreground">
            Dispatch <span className="font-mono">{selectedSend.dispatchNo}</span> — {formatNumber(maxPcs)} PCS pending.
          </div>
        )}

        <input
          type="number"
          required
          min="1"
          max={maxPcs || undefined}
          placeholder="PCS Received"
          value={pcs}
          onChange={e => setPcs(e.target.value)}
          className="w-full rounded-xl border p-3 text-sm"
        />
        <DatePicker value={date} onChange={setDate} />

        <div className="flex gap-3">
          <button type="submit" className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold">
            {editReceiveId ? 'Save Changes' : 'Receive Items'}
          </button>
        </div>
      </form>
      <QuickAddProcessor
        isOpen={addProcessorOpen}
        onClose={() => setAddProcessorOpen(false)}
        onSuccess={(id) => { setProcessorId(id); setAddProcessorOpen(false); }}
      />
    </PageModal>
  );
}

import { useMemo, useState } from 'react';
import { PageModal } from '../ui/PageModal';
import { SearchableSelect } from '../SearchableSelect';
import { DatePicker } from '../ui/date-picker';
import { QuickAddProcessor } from '../QuickAddModals';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import { formatCurrency, formatNumber } from '../../lib/utils';

interface CreateProcessorBillFormProps {
  isOpen: boolean;
  onClose: () => void;
  editBillId?: string;
}

/**
 * Create / edit a processor bill. Each unbilled receipt is listed with its
 * default bill amount (computed from the dispatch rate); the amount is
 * editable per line so the rate can be finalized at bill time (the override is
 * stored on the bill and drives the total + voucher).
 */
export function CreateProcessorBillForm({
  isOpen,
  onClose,
  editBillId,
}: CreateProcessorBillFormProps) {
  const { materials, processors, processingReceipts, processorBills } = useERPStore();

  const [processorId, setProcessorId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Per-receipt override amounts (receiptId → amount). Absent = default.
  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [addProcessorOpen, setAddProcessorOpen] = useState(false);

  const unbilledReceipts = useMemo(() => {
    if (!processorId) return [];
    return processingReceipts.filter(r => r.processorId === processorId && r.billedStatus === 'Unbilled');
  }, [processingReceipts, processorId]);

  const selectedReceipts = unbilledReceipts.filter(r => selectedIds.includes(r.id));
  const totalSelected = selectedReceipts.reduce((sum, r) => sum + (parseFloat(lineAmounts[r.id] ?? '') || r.billAmount), 0);

  const toggle = (id: string) => {
    setError(null);
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

    const payload = {
      processorId,
      date,
      receiptIds: selectedIds,
      remarks: 'Generated from pending receipts',
      stageId: selectedReceipts[0]?.stageId,
      rateMethod: selectedReceipts[0]?.rateMethod,
      billingUnit: selectedReceipts[0]?.billingUnit,
      ...(changed ? { lineAmounts: overrides } : {}),
    };

    if (editBillId) {
      ProcessingService.updateBill(editBillId, {
        processorId,
        date,
        receiptIds: selectedIds,
        ...(changed ? { lineAmounts: overrides } : {}),
      });
    } else {
      ProcessingService.createBill(payload as any);
    }

    onClose();
    setSelectedIds([]);
    setLineAmounts({});
    setError(null);
  };

  // For edit mode: prefill from the existing bill.
  useMemo(() => {
    if (editBillId && isOpen) {
      const bill = processorBills.find(b => b.id === editBillId);
      if (bill) {
        setProcessorId(bill.processorId);
        setDate(bill.date);
        setSelectedIds(bill.receiptIds);
        setLineAmounts(Object.fromEntries(
          Object.entries(bill.lineAmounts || {}).map(([k, v]) => [k, String(v)])
        ));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBillId, isOpen]);

  return (
    <PageModal isOpen={isOpen} onClose={onClose} title={editBillId ? 'Edit Processor Bill' : 'Create Processor Bill'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex-1">
            <SearchableSelect
              options={processors.map(p => ({ id: p.id, label: p.name, searchValue: p.phone }))}
              value={processorId}
              onChange={(val) => { setProcessorId(val); setSelectedIds([]); setLineAmounts({}); setError(null); }}
              placeholder="Select Processor..."
              onAdd={() => setAddProcessorOpen(true)}
              required
            />
          </div>
          <DatePicker value={date} onChange={setDate} className="w-1/3" />
        </div>

        {processorId && unbilledReceipts.length === 0 && (
          <div className="p-4 bg-muted/40 rounded-xl text-center text-sm text-muted-foreground">
            No unbilled receipts found for this processor.
          </div>
        )}

        {unbilledReceipts.length > 0 && (
          <div className="border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-4 py-2 w-10"></th>
                  <th className="px-4 py-2">Receipt</th>
                  <th className="px-4 py-2">Material</th>
                  <th className="px-4 py-2 text-right">PCS</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unbilledReceipts.map(r => {
                  const m = materials.find(mat => mat.id === r.materialId);
                  const isSel = selectedIds.includes(r.id);
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => toggle(r.id)}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="pointer-events-none" checked={isSel} readOnly />
                      </td>
                      <td className="px-4 py-3">{r.receiveNo} <br/><span className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()}</span></td>
                      <td className="px-4 py-3">{m?.name}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(r.pcsReceived)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {isSel ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
                            value={lineAmounts[r.id] ?? String(r.billAmount)}
                            onChange={e => setLineAmounts(prev => ({ ...prev, [r.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="font-medium">{formatCurrency(r.billAmount)}</span>
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
          <div className="flex justify-between items-center p-4 bg-muted/40 rounded-xl">
            <span className="font-medium text-foreground/80">Total Selected: {selectedIds.length} receipts</span>
            <span className="text-xl font-bold text-foreground">{formatCurrency(totalSelected)}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={selectedIds.length === 0} className="flex-1 rounded-xl bg-primary p-3 text-primary-foreground font-semibold disabled:opacity-50">
            {editBillId ? 'Save Changes' : 'Create Bill'}
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

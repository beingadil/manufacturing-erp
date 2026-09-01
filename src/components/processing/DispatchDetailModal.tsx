import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { PageModal } from '../ui/PageModal';
import type { Batch, ProcessingReceipt, ProcessingSend, Processor, ProcessingStage, ProcessorBill, RawMaterial, Voucher } from '../../types/erp';
import { StageProgressStepper } from './StageProgressStepper';

interface DispatchDetailModalProps {
  /** The dispatch (send) to show. */
  send: ProcessingSend | null;
  onClose: () => void;
  materials: RawMaterial[];
  processors: Processor[];
  stages: ProcessingStage[];
  batches: Batch[];
  receipts: ProcessingReceipt[];
  bills: ProcessorBill[];
  vouchers: Voucher[];
}

/**
 * Per-dispatch job card — the multi-stage "saved entry" drill-down. Shows the
 * dispatch header (worker, stage, rate) and its full journey: every linked
 * receipt (qty, date, bill amount, billed status), recorded loss, the processor
 * bill, and the generated voucher. This replaces the dead "Eye" row buttons.
 */
export function DispatchDetailModal({
  send,
  onClose,
  materials,
  processors,
  stages,
  batches,
  receipts,
  bills,
  vouchers,
}: DispatchDetailModalProps) {
  const sorted = useMemo(() => [...stages].sort((a, b) => a.sequence - b.sequence), [stages]);
  if (!send) return null;

  const material = materials.find(m => m.id === send.materialId);
  const processor = processors.find(p => p.id === send.processorId);
  const stage = stages.find(s => s.id === send.stageId);
  const batch = batches.find(b => b.id === send.batchId);

  const sendReceipts = receipts.filter(r => r.sendId === send.id);
  const linkedBill = bills.find(b => b.receiptIds.some(rid => sendReceipts.some(r => r.id === rid)));
  const voucher = linkedBill ? vouchers.find(v => v.sourceId === linkedBill.id && v.sourceModule === 'Processing') : undefined;
  const pending = send.pcsSent - send.pcsReceived - (send.lossQuantity || 0);
  const currentIdx = send.stageId ? sorted.findIndex(s => s.id === send.stageId) : -1;
  const completed = currentIdx > 0 ? sorted.slice(0, currentIdx).map(s => s.id) : [];

  return (
    <PageModal isOpen={!!send} onClose={onClose} title="Dispatch Detail" maxWidth="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-mono text-base font-bold text-foreground">{send.dispatchNo}</h4>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${send.status === 'Closed' ? 'bg-muted text-muted-foreground' : 'bg-warning/10 text-warning'}`}>
              {send.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(send.date).toLocaleDateString()} · {material?.name || 'Unknown material'}
            {batch ? ` · Batch ${batch.batchNo}` : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Rate</div>
          <div className="font-bold text-foreground">{formatCurrency(send.ratePerPiece)}{stage?.rateMethod === 'per_kg' ? '/KG' : '/PCS'}</div>
        </div>
      </div>

      {/* Stage progress */}
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="text-[11px] font-medium text-muted-foreground mb-2">
          Worker: {processor?.name || 'Unknown'} · Stage: {stage?.name || 'Initial Processor'}
        </div>
        <StageProgressStepper
          stages={sorted}
          completedStageIds={completed}
          currentStageId={send.stageId}
          nextStageId={currentIdx >= 0 ? sorted[currentIdx + 1]?.id : sorted[0]?.id}
        />
      </div>

      {/* Quantities */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Sent</div>
          <div className="text-lg font-bold text-foreground">{formatNumber(send.pcsSent)} PCS</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Received</div>
          <div className="text-lg font-bold text-success">{formatNumber(send.pcsReceived)} PCS</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Loss</div>
          <div className="text-lg font-bold text-destructive">{formatNumber(send.lossQuantity || 0)} PCS</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Pending</div>
          <div className="text-lg font-bold text-warning">{formatNumber(pending)} PCS</div>
        </div>
      </div>

      {/* Receipts */}
      <div>
        <h5 className="text-sm font-semibold text-foreground mb-2">Receipts ({sendReceipts.length})</h5>
        {sendReceipts.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-3">No receipts recorded against this dispatch yet.</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-3 py-2">Receive #</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Bill Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sendReceipts.map(r => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono">{r.receiveNo}</td>
                    <td className="px-3 py-2">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.pcsReceived)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.billAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${r.billedStatus === 'Billed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {r.billedStatus || 'Unbilled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bill + voucher */}
      <div className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">Processor Bill</div>
          {linkedBill ? (
            <div className="text-sm font-semibold text-foreground">
              {linkedBill.billNo} · {formatCurrency(linkedBill.totalAmount)}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Not billed yet</div>
          )}
        </div>
        {voucher ? (
          <Link to="/accounting/cashbook" className="text-xs font-mono text-primary hover:underline">
            Voucher {voucher.voucherNo} →
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>
    </PageModal>
  );
}

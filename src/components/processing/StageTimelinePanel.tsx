import { ArrowDown, PackageCheck } from 'lucide-react';
import { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../lib/utils';
import type { Batch, ProcessingReceipt, ProcessingSend, Processor, ProcessingStage, RawMaterial } from '../../types/erp';
import { getSortedStages } from '../../lib/processing/stageProgress';

interface StageTimelinePanelProps {
  batches: Batch[];
  materials: RawMaterial[];
  processors: Processor[];
  stages: ProcessingStage[];
  sends: ProcessingSend[];
  receipts: ProcessingReceipt[];
  selectedBatchId: string;
  onSelectBatch: (id: string) => void;
}

/**
 * Upgraded Stage Timeline — the full manufacturing chain for one batch with the
 * ACTUAL entries at each stage (dispatch no, worker, dates, qty, rate, loss),
 * not just aggregate numbers. Auto-openable from any dispatch row.
 */
export function StageTimelinePanel({
  batches,
  materials,
  processors,
  stages,
  sends,
  receipts,
  selectedBatchId,
  onSelectBatch,
}: StageTimelinePanelProps) {
  const sorted = useMemo(() => getSortedStages(stages), [stages]);
  const batch = batches.find(b => b.id === selectedBatchId);

  const rows = useMemo(() => {
    if (!batch) return [];
    const batchSends = sends.filter(s => s.batchId === batch.id && s.status !== 'Adjusted');
    const batchReceipts = receipts.filter(r => batchSends.some(s => s.id === r.sendId));

    return sorted.map(stage => {
      const sendsHere = batchSends.filter(s => s.stageId === stage.id);
      const receiptsHere = batchReceipts.filter(r => r.stageId === stage.id);
      const sent = sendsHere.reduce((sum, s) => sum + s.pcsSent, 0);
      const received = receiptsHere.reduce((sum, r) => sum + r.pcsReceived, 0);
      const loss = sendsHere.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
      const wip = Math.max(0, sent - received - loss);
      return { stage, sendsHere, receiptsHere, sent, received, loss, wip };
    });
  }, [batch, sends, receipts, sorted]);

  if (!selectedBatchId) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border">
        Select a batch above to see its full manufacturing chain: PURCHASE → each stage → FINISHED PRODUCT.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Purchase origin */}
      {batch && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Purchase — {batch.batchNo}</div>
            <div className="text-xs text-muted-foreground">
              Raw on hand: {formatNumber(batch.remainingPcs || 0)} PCS · WIP: {formatNumber(batch.atProcessorPcs || 0)} · Finished: {formatNumber(batch.processedPcs || 0)} · {formatCurrency(batch.amount || 0)}
            </div>
          </div>
        </div>
      )}

      {rows.map(row => (
        <div key={row.stage.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className={`h-2.5 w-2.5 rounded-full ${row.stage.isFinalStage ? 'bg-emerald-500' : 'bg-orange-500'}`} />
            <ArrowDown className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{row.stage.isFinalStage ? '★ ' : ''}{row.stage.name}</span>
                {row.stage.isFinalStage && <span className="text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">Final</span>}
              </div>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <div className="text-muted-foreground">Sent <span className="font-medium text-foreground">{formatNumber(row.sent)}</span></div>
              <div className="text-muted-foreground">Received <span className="font-medium text-success">{formatNumber(row.received)}</span></div>
              {row.loss > 0 && <div className="text-muted-foreground">Loss <span className="font-medium text-destructive">{formatNumber(row.loss)}</span></div>}
              <div className="text-muted-foreground">Held <span className="font-medium text-warning">{formatNumber(row.wip)}</span></div>
            </div>
          </div>

          {/* Actual dispatch/receipt entries at this stage */}
          {(row.sendsHere.length > 0 || row.receiptsHere.length > 0) && (
            <div className="border-t border-border bg-muted/20 px-4 py-2 space-y-1.5">
              {row.sendsHere.map(s => {
                const worker = processors.find(p => p.id === s.processorId)?.name || 'Unknown';
                const pending = s.pcsSent - s.pcsReceived - (s.lossQuantity || 0);
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{s.dispatchNo}</span>
                    <span className="text-muted-foreground flex-1 ml-3">
                      {worker} · {new Date(s.date).toLocaleDateString()} · {formatCurrency(s.ratePerPiece)}{row.stage.rateMethod === 'per_kg' ? '/KG' : '/PCS'}
                    </span>
                    <span className="text-foreground font-medium">{formatNumber(s.pcsSent)} sent</span>
                    <span className={`ml-3 ${pending > 0 ? 'text-warning' : 'text-success'}`}>{formatNumber(pending)} pending</span>
                  </div>
                );
              })}
              {row.receiptsHere.map(r => {
                const worker = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
                return (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{r.receiveNo}</span>
                    <span className="text-muted-foreground flex-1 ml-3">{worker} · {new Date(r.date).toLocaleDateString()}</span>
                    <span className="text-success font-medium">+{formatNumber(r.pcsReceived)} received</span>
                    <span className="ml-3 text-muted-foreground">{formatCurrency(r.billAmount)}{r.billedStatus === 'Billed' ? ' · Billed' : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Finished goods */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <PackageCheck className="h-4 w-4 text-emerald-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Finished Goods</div>
          <div className="text-xs text-muted-foreground">Saleable after the final stage completes</div>
        </div>
        <div className="text-right text-xs">
          <span className="font-medium text-emerald-600">{formatNumber(batch?.processedPcs || 0)} PCS</span>
        </div>
      </div>

      {/* Batch selector moved to the parent (header of the tab) */}
      <div className="pt-1">
        <select
          value={selectedBatchId}
          onChange={e => onSelectBatch(e.target.value)}
          className="w-full sm:max-w-md rounded-xl border border-border bg-background p-3 text-sm"
        >
          <option value="">Select a batch to trace its processing chain...</option>
          {(batches || []).map(b => {
            const mat = materials.find(m => m.id === b.materialId);
            return <option key={b.id} value={b.id}>{b.batchNo} — {mat?.name || 'Material'} ({formatNumber(b.initialPcs)} PCS)</option>;
          })}
        </select>
      </div>
    </div>
  );
}

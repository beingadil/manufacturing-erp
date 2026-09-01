import { ArrowDown, PackageCheck } from 'lucide-react';
import { useMemo } from 'react';
import { formatCurrency, formatDate, formatNumber } from '../../lib/utils';
import { InventoryCalculationService } from '../../lib/business/InventoryCalculationService';
import type { Batch, ProcessingReceipt, ProcessingSend, Processor, ProcessingStage, RawMaterial } from '../../types/erp';
import { getSortedStages } from '../../lib/processing/stageProgress';
import { StageProgressStepper } from './StageProgressStepper';

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
 * Stage Timeline — the full manufacturing chain for ONE batch with the ACTUAL
 * entries at each stage (dispatch no, worker, dates, qty, rate, loss), not
 * just aggregate numbers. Multi-position aware: the batch header shows where
 * every pc sits right now (raw sendable / in WIP / finished).
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
  const material = materials.find(m => m.id === batch?.materialId);

  const rows = useMemo(() => {
    if (!batch) return [];
    const batchSends = sends.filter(s => s.batchId === batch.id && s.status !== 'Adjusted');
    const batchReceipts = receipts.filter(r => batchSends.some(s => s.id === r.sendId));

    return sorted.map(stage => {
      const sendsHere = batchSends.filter(s => s.stageId === stage.id);
      // Legacy receipts may carry no stageId — attribute them via their dispatch's stage.
      const receiptsHere = batchReceipts.filter(r =>
        (r.stageId ?? batchSends.find(s => s.id === r.sendId)?.stageId) === stage.id
      );
      const sent = sendsHere.reduce((sum, s) => sum + s.pcsSent, 0);
      const received = receiptsHere.reduce((sum, r) => sum + r.pcsReceived, 0);
      const loss = sendsHere.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
      const wip = Math.max(0, sent - received - loss);
      return { stage, sendsHere, receiptsHere, sent, received, loss, wip };
    });
  }, [batch, sends, receipts, sorted]);

  // Chain progress: stages fully received out of (sent > 0 and no wip held).
  const progressPct = useMemo(() => {
    if (rows.length === 0) return 0;
    const active = rows.filter(r => r.sent > 0);
    const done = active.filter(r => r.wip <= 0);
    return active.length === 0 ? 0 : Math.round((done.length / active.length) * 100);
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* Batch picker — at the TOP, labeled */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <label htmlFor="timeline-batch" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Trace a batch through the chain
        </label>
        <select
          id="timeline-batch"
          value={selectedBatchId}
          onChange={e => onSelectBatch(e.target.value)}
          className="w-full sm:max-w-md rounded-xl border border-border bg-background p-3 text-sm"
        >
          <option value="">Select a batch…</option>
          {(batches || []).map(b => {
            const mat = materials.find(m => m.id === b.materialId);
            return <option key={b.id} value={b.id}>{b.batchNo} — {mat?.name || 'Material'} ({formatNumber(b.initialPcs)} PCS)</option>;
          })}
        </select>
      </div>

      {!batch ? (
        <div className="p-10 text-center text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border">
          Select a batch above to see its full manufacturing chain: PURCHASE → each stage → FINISHED PRODUCT.
        </div>
      ) : (
        <>
          {/* Purchase origin + current multi-position buckets */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">
                Purchase — {batch.batchNo}{material ? ` · ${material.name}` : ''}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatNumber(batch.initialPcs)} PCS · {formatCurrency(batch.amount || 0)}
                {progressPct > 0 && <span className="ml-2 font-medium text-primary">{progressPct}% through the chain</span>}
              </div>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <div className="text-muted-foreground">Raw sendable <span className="font-medium text-foreground">{formatNumber(InventoryCalculationService.batchRawAvailable(batch))}</span></div>
              <div className="text-muted-foreground">In WIP <span className="font-medium text-warning">{formatNumber(batch.atProcessorPcs || 0)}</span></div>
              <div className="text-muted-foreground">Finished <span className="font-medium text-success">{formatNumber(batch.processedPcs || 0)}</span></div>
            </div>
          </div>

          {/* Compact chain stepper */}
          {sorted.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <StageProgressStepper
                stages={sorted}
                completedStageIds={rows.filter(r => r.sent > 0 && r.wip <= 0).map(r => r.stage.id)}
                currentStageId={sorted.find(s => s.id === batch.currentStageId)?.id}
                compact
              />
            </div>
          )}

          {rows.map(row => {
            const hasActivity = row.sendsHere.length > 0 || row.receiptsHere.length > 0;
            return (
              <div key={row.stage.id} className={`rounded-xl border overflow-hidden ${hasActivity ? 'border-border bg-card' : 'border-border/40 bg-muted/20 opacity-60'}`}>
                <div className="flex items-center gap-3 p-4">
                  <div className={`h-2.5 w-2.5 rounded-full ${row.stage.isFinalStage ? 'bg-emerald-500' : 'bg-orange-500'}`} />
                  <ArrowDown className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{row.stage.isFinalStage ? '★ ' : ''}{row.stage.name}</span>
                      {row.stage.isFinalStage && <span className="text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-full">Final</span>}
                      {!hasActivity && <span className="text-[10px] text-muted-foreground">no activity</span>}
                    </div>
                  </div>
                  {hasActivity && (
                    <div className="text-right text-xs space-y-0.5">
                      <div className="text-muted-foreground">Sent <span className="font-medium text-foreground">{formatNumber(row.sent)}</span></div>
                      <div className="text-muted-foreground">Received <span className="font-medium text-success">{formatNumber(row.received)}</span></div>
                      {row.loss > 0 && <div className="text-muted-foreground">Loss <span className="font-medium text-destructive">{formatNumber(row.loss)}</span></div>}
                      {row.wip > 0 && <div className="text-muted-foreground">Held <span className="font-medium text-warning">{formatNumber(row.wip)}</span></div>}
                    </div>
                  )}
                </div>

                {/* Actual dispatch/receipt entries at this stage */}
                {hasActivity && (
                  <div className="border-t border-border bg-muted/20 px-4 py-2 space-y-1.5">
                    {row.sendsHere.map(s => {
                      const worker = processors.find(p => p.id === s.processorId)?.name || 'Unknown';
                      const pending = s.pcsSent - s.pcsReceived - (s.lossQuantity || 0);
                      return (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
                          <span className="font-mono text-muted-foreground">{s.dispatchNo}</span>
                          <span className="text-muted-foreground flex-1 min-w-0 truncate">
                            {worker} · {formatDate(s.date)} · {formatCurrency(s.ratePerPiece)}{row.stage.rateMethod === 'per_kg' ? '/KG' : '/PCS'}
                          </span>
                          <span className="text-foreground font-medium">{formatNumber(s.pcsSent)} sent</span>
                          <span className={`ml-3 ${pending > 0 ? 'text-warning' : 'text-success'}`}>{formatNumber(Math.max(0, pending))} pending</span>
                        </div>
                      );
                    })}
                    {row.receiptsHere.map(r => {
                      const worker = processors.find(p => p.id === r.processorId)?.name || 'Unknown';
                      return (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
                          <span className="font-mono text-muted-foreground">{r.receiveNo}</span>
                          <span className="text-muted-foreground flex-1 min-w-0 truncate">{worker} · {formatDate(r.date)}</span>
                          <span className="text-success font-medium">+{formatNumber(r.pcsReceived)} received</span>
                          <span className="ml-3 text-muted-foreground">{formatCurrency(r.billAmount)}{r.billedStatus === 'Billed' ? ' · Billed' : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Finished goods */}
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <PackageCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">Finished Goods</div>
              <div className="text-xs text-muted-foreground">Saleable after the final stage completes</div>
            </div>
            <div className="text-right text-xs">
              <span className="font-medium text-emerald-600">{formatNumber(batch.processedPcs || 0)} PCS</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

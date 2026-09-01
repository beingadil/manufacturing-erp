import { ArrowRight, PackageCheck, PackageOpen, User } from 'lucide-react';
import { useMemo } from 'react';
import { formatNumber } from '../../lib/utils';
import type { Batch, ProcessingSend, Processor, ProcessingStage, RawMaterial } from '../../types/erp';
import { StageProgressStepper } from './StageProgressStepper';

interface WipBoardProps {
  stages: ProcessingStage[];
  batches: Batch[];
  materials: RawMaterial[];
  processors: Processor[];
  sends: ProcessingSend[];
  /** Called when the user clicks a dispatch on the board (drill-down). */
  onOpenDispatch: (sendId: string) => void;
}

interface ColumnCard {
  key: string;
  title: string;
  subtitle: string;
  /** 0 = raw, 1..n = stage index, 'finished' = final card. */
  col: number | 'finished';
  stageId?: string;
  detail?: string;
  worker?: string;
  onClick?: () => void;
}

/**
 * WIP Board — the natural multi-stage view. One column per processing stage
 * (raw stock, each stage, finished goods); cards are the batches/dispatches
 * physically sitting there with their send/receive/loss/pending numbers.
 */
export function WipBoard({
  stages,
  batches,
  materials,
  processors,
  sends,
  onOpenDispatch,
}: WipBoardProps) {
  const sorted = useMemo(() => [...stages].sort((a, b) => a.sequence - b.sequence), [stages]);
  const materialName = (id?: string) => materials.find(m => m.id === id)?.name || 'Unknown';
  const processorName = (id?: string) => processors.find(p => p.id === id)?.name || 'Unknown';

  // Raw stock cards — batches with raw pcs on hand.
  const rawCards = batches
    .filter(b => (b.remainingPcs || 0) > 0)
    .map(b => ({ batch: b, col: 0 as const }));

  // Finished cards — batches with finished pcs on hand.
  const finishedCards = batches
    .filter(b => (b.processedPcs || 0) > 0)
    .map(b => ({ batch: b, col: 'finished' as const }));

  // Stage cards — dispatches with WIP pending at that stage (sent but not fully received).
  const stageCards = sends
    .filter(s => {
      const pending = s.pcsSent - s.pcsReceived - (s.lossQuantity || 0);
      return s.status !== 'Adjusted' && pending > 0;
    })
    .map(s => {
      const stageIndex = sorted.findIndex(st => st.id === s.stageId);
      return { send: s, col: stageIndex >= 0 ? (stageIndex + 1) : 1 as number };
    });

  const columns: { label: string; cards: ColumnCard[] }[] = [
    {
      label: 'Raw Stock',
      cards: rawCards.map(({ batch }) => ({
        key: `raw-${batch.id}`,
        title: batch.batchNo,
        subtitle: `${materialName(batch.materialId)} · ${formatNumber(batch.remainingPcs || 0)} PCS`,
        col: 0,
      })),
    },
    ...sorted.map((stage, idx) => ({
      label: stage.isFinalStage ? `★ ${stage.name}` : stage.name,
      cards: stageCards
        .filter(c => c.col === idx + 1)
        .map(c => {
          const s = c.send;
          const pending = s.pcsSent - s.pcsReceived - (s.lossQuantity || 0);
          return {
            key: `send-${s.id}`,
            title: s.dispatchNo,
            subtitle: `${materialName(s.materialId)} · ${formatNumber(pending)} PCS pending`,
            detail: `Sent ${formatNumber(s.pcsSent)} · Recv ${formatNumber(s.pcsReceived)}${s.lossQuantity ? ` · Loss ${formatNumber(s.lossQuantity)}` : ''}`,
            worker: processorName(s.processorId),
            col: idx + 1,
            stageId: stage.id,
            onClick: () => onOpenDispatch(s.id),
          };
        }),
    })),
    {
      label: 'Finished Goods',
      cards: finishedCards.map(({ batch }) => ({
        key: `fin-${batch.id}`,
        title: batch.batchNo,
        subtitle: `${materialName(batch.materialId)} · ${formatNumber(batch.processedPcs || 0)} PCS`,
        col: 'finished',
      })),
    },
  ];

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {columns.map(col => (
          <div key={col.label} className="w-64 shrink-0 rounded-xl border border-border bg-muted/20 flex flex-col">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{col.label}</span>
              <span className="text-[10px] text-muted-foreground">{col.cards.length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1">
              {col.cards.length === 0 ? (
                <div className="text-center text-[11px] text-muted-foreground/50 py-6">Empty</div>
              ) : (
                col.cards.map(card => (
                  <div
                    key={card.key}
                    onClick={card.onClick}
                    className={`rounded-lg border bg-card p-2.5 text-xs ${card.onClick ? 'cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-foreground">{card.title}</span>
                      {card.col === 'finished' ? (
                        <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
                      ) : card.col === 0 ? (
                        <PackageOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1">{card.subtitle}</div>
                    {card.detail && <div className="text-muted-foreground/80 mt-0.5">{card.detail}</div>}
                    {card.worker && <div className="text-primary/80 mt-0.5 flex items-center gap-1"><User className="h-3 w-3" />{card.worker}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact progress stepper usage helper — kept separate so boards stay focused. */
export function BatchStepperInline({ batch, stages }: { batch: Batch; stages: ProcessingStage[] }) {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  const currentIdx = batch.currentStageId ? sorted.findIndex(s => s.id === batch.currentStageId) : -1;
  const completed = currentIdx > 0 ? sorted.slice(0, currentIdx).map(s => s.id) : [];
  return (
    <StageProgressStepper
      stages={stages}
      completedStageIds={completed}
      currentStageId={batch.currentStageId}
      nextStageId={currentIdx >= 0 ? sorted[currentIdx + 1]?.id : sorted[0]?.id}
      compact
    />
  );
}

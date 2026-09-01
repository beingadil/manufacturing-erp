import { formatCurrency, formatNumber } from '../../lib/utils';
import type { ProcessingStage } from '../../types/erp';

interface WipStageStripProps {
  stages: ProcessingStage[];
  /** Per-stage WIP pcs derived from movement history (stageId → pcs). */
  stageWip: { stageId: string; name: string; sequence: number; pcs: number; value: number }[];
  /** Total WIP pcs (atProcessor) for the footer. */
  totalPcs: number;
  totalValue: number;
}

/**
 * WIP-by-stage header strip — at-a-glance visibility of how many pieces sit at
 * each stage of the chain, so the multi-stage state is obvious before you even
 * open a table or board.
 */
export function WipStageStrip({ stages, stageWip, totalPcs, totalValue }: WipStageStripProps) {
  if (stages.length === 0) return null;
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">Work in Progress by Stage</span>
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(totalPcs)} PCS · {formatCurrency(totalValue)}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {sorted.map(stage => {
          const wip = stageWip.find(w => w.stageId === stage.id);
          const pcs = wip?.pcs || 0;
          return (
            <div
              key={stage.id}
              className={`rounded-lg border p-2 ${pcs > 0 ? 'border-warning/40 bg-warning/5' : 'border-border bg-muted/20'}`}
            >
              <div className="text-[10px] font-medium text-muted-foreground truncate" title={stage.name}>
                {stage.isFinalStage ? '★ ' : ''}{stage.name}
              </div>
              <div className={`text-sm font-bold ${pcs > 0 ? 'text-warning' : 'text-foreground/40'}`}>
                {formatNumber(pcs)} <span className="text-[10px] font-medium text-muted-foreground">PCS</span>
              </div>
              {pcs > 0 && <div className="text-[10px] text-muted-foreground">{formatCurrency(wip?.value || 0)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

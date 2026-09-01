import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ProcessingStage } from '../../types/erp';

interface StageProgressStepperProps {
  stages: ProcessingStage[];
  /** Ids of stages that are complete (before current). */
  completedStageIds?: string[];
  /** The current stage id (highlighted as "here"). */
  currentStageId?: string;
  /** The next stage id to move to (pulsing). */
  nextStageId?: string;
  /** Compact variant for tables/rows (smaller labels, no legend). */
  compact?: boolean;
}

/**
 * A horizontal chain stepper showing where a batch sits across the processing
 * stages. Complete legs are green, the current stage is highlighted, and the
 * next stage pulses — the visual answer to "how far along is this batch?".
 */
export function StageProgressStepper({
  stages,
  completedStageIds = [],
  currentStageId,
  nextStageId,
  compact = false,
}: StageProgressStepperProps) {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  if (sorted.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-0.5', compact ? 'max-w-xs' : 'max-w-2xl')}>
      {sorted.map((stage, i) => {
        const isComplete = completedStageIds.includes(stage.id);
        const isCurrent = stage.id === currentStageId;
        const isNext = stage.id === nextStageId;
        return (
          <div key={stage.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={cn(
                  'h-1.5 rounded-full w-full min-w-3',
                  isComplete ? 'bg-green-500' : isNext ? 'bg-primary animate-pulse' : isCurrent ? 'bg-primary' : 'bg-muted'
                )}
              />
              <span
                className={cn(
                  'mt-0.5 truncate',
                  compact ? 'text-[9px]' : 'text-[10px]',
                  isComplete ? 'text-green-600 font-medium' : isCurrent ? 'text-primary font-bold' : isNext ? 'text-primary font-medium' : 'text-muted-foreground'
                )}
                title={stage.name}
              >
                {stage.isFinalStage ? '★ ' : ''}{stage.name}
              </span>
            </div>
            {i < sorted.length - 1 && (
              <span className={cn('shrink-0', isComplete ? 'text-green-500' : 'text-muted-foreground/40')}>
                <Check className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

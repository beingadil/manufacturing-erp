import type { Batch, ProcessingStage } from '../../types/erp';
import {
  batchAvailableAtSource,
  batchAvailableTotal,
  batchRawAvailableOf,
  InventoryCalculationService,
  stageAvailableEntries,
} from '../business/InventoryCalculationService';

/**
 * Batch-scoped stage progress — the building block for multi-stage display.
 *
 * Buckets are DISJOINT (raw / atProcessor / per-source availability / finished),
 * so any sum of them is the true on-hand total and can never double-count.
 * A batch is multi-position: its pcs can sit in several buckets at once, and
 * availability is tracked PER SOURCE STAGE — pcs that came back from Machine
 * and pcs that came back from Initial coexist as separate entries and can
 * never merge or mislabel (the 600+100 collapse bug).
 */

export interface BatchStageProgress {
  batch: Batch;
  /** The stage the batch's dispatched pcs are currently at (null when raw). */
  currentStage: ProcessingStage | null;
  /** Stages strictly before currentStage — completed legs of the chain. */
  completedStages: ProcessingStage[];
  /** The next stage in the chain the batch should move to. */
  nextStage: ProcessingStage | null;
  /** Pcs never dispatched anywhere — sendable to stage 1 at any time. */
  rawPcs: number;
  /** Pcs waiting for their next stage (all sources combined). */
  availablePcs: number;
  /** Pcs currently out with a processor. */
  inTransitPcs: number;
  /** Pcs finished (non-zero once the final stage starts completing). */
  finishedPcs: number;
  isRaw: boolean;
  isFinished: boolean;
  /** 0..1 progress across the whole chain. */
  progressRatio: number;
}

export function getSortedStages(stages: ProcessingStage[]): ProcessingStage[] {
  return [...stages].sort((a, b) => a.sequence - b.sequence);
}

/** Derive one batch's progress from its own disjoint buckets. */
export function getBatchStageProgress(
  batch: Batch,
  stages: ProcessingStage[]
): BatchStageProgress {
  const sorted = getSortedStages(stages);
  const currentStage = batch.currentStageId
    ? sorted.find(s => s.id === batch.currentStageId) || null
    : null;

  // Routing position: the source stage of whatever is WAITING (per-source
  // availability) decides the next leg; when nothing waits, the batch's
  // current stage does. With multiple sources waiting, the EARLIEST stage in
  // the chain routes first (its pcs must complete the chain before later
  // sources' pcs — upstream work always finishes first).
  const waitingSources = stageAvailableEntries(batch)
    .map(e => sorted.find(s => s.id === e.stageId))
    .filter((s): s is ProcessingStage => !!s)
    .sort((a, b) => a.sequence - b.sequence);

  const activeStage = waitingSources[0] || currentStage;
  const nextStage = activeStage
    ? sorted.find(s => s.sequence === activeStage.sequence + 1) || null
    : sorted[0] || null;

  const availablePcs = batchAvailableTotal(batch);
  const inTransitPcs = batch.atProcessorPcs || 0;
  const finishedPcs = batch.processedPcs || 0;
  const rawPcs = batchRawAvailableOf(batch);
  const isRaw = !activeStage;
  const isFinished = !!currentStage && !!sorted.find(s => s.id === currentStage.id)?.isFinalStage
    && inTransitPcs <= 0 && availablePcs <= 0 && rawPcs <= 0;

  const lastRelevantSeq = isFinished
    ? (currentStage?.sequence || 0)
    : (nextStage?.sequence || 0) - 1;
  const progressRatio = sorted.length > 0
    ? Math.max(0, Math.min(1, lastRelevantSeq / sorted.length))
    : 0;

  return {
    batch,
    currentStage,
    completedStages: activeStage ? sorted.filter(s => s.sequence < activeStage.sequence) : [],
    nextStage,
    availablePcs,
    inTransitPcs,
    finishedPcs,
    rawPcs,
    isRaw,
    isFinished,
    progressRatio,
  };
}

/**
 * Map every batch of a material to its stage progress, newest-first for the UI.
 */
export function getMaterialBatchProgress(
  materialId: string,
  batches: Batch[],
  stages: ProcessingStage[]
): BatchStageProgress[] {
  return batches
    .filter(b => b.materialId === materialId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(b => getBatchStageProgress(b, stages));
}

/**
 * True when a dispatch is a candidate for the given target stage.
 *
 * Stage 1 draws the batch's raw pcs (never-dispatched remainder). An
 * intermediate target is legal ONLY for pcs waiting from that target's
 * predecessor stage (movement map: stage N's output IS stage N+1's input).
 */
export function batchCanSendToStage(
  batch: Batch,
  targetStageId: string | undefined,
  stages: ProcessingStage[]
): boolean {
  const sorted = getSortedStages(stages);
  const target = targetStageId ? sorted.find(s => s.id === targetStageId) : undefined;
  if (!target) return batchRawAvailableOf(batch) > 0;
  if (target.sequence <= 1) return batchRawAvailableOf(batch) > 0;
  const requiredSource = InventoryCalculationService.requiredSourceForTarget(target.id, sorted);
  return batchAvailableAtSource(batch, requiredSource) > 0;
}

/**
 * Human label for a stage position used across tables/boards.
 */
export function stageDisplayName(stage: ProcessingStage | undefined | null, fallback = 'Raw'): string {
  if (!stage) return fallback;
  return stage.isFinalStage ? `★ ${stage.name}` : stage.name;
}

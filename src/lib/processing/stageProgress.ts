import type { Batch, ProcessingStage } from '../../types/erp';

/**
 * Batch-scoped stage progress — the building block for multi-stage display.
 *
 * In a multi-stage system the SAME material's batches sit at DIFFERENT stages
 * simultaneously. Material-level progress (the old UI) collapsed them into one
 * number and silently blocked sending an earlier batch forward. These helpers
 * derive progress per batch from the batch's own stage fields (replay-consistent
 * with the live engine: currentStageId = stage last dispatched to, never advanced
 * by a non-final receipt).
 */

export interface BatchStageProgress {
  batch: Batch;
  /** The stage the batch is currently at (null when raw / not yet dispatched). */
  currentStage: ProcessingStage | null;
  /** Stages strictly before currentStage — completed legs of the chain. */
  completedStages: ProcessingStage[];
  /** The next stage in the chain the batch should move to. */
  nextStage: ProcessingStage | null;
  /** Pcs available to send to nextStage (received back from currentStage). */
  availablePcs: number;
  /** Pcs currently out with a processor (in transit at currentStage). */
  inTransitPcs: number;
  /** Pcs finished (only non-zero after the final stage completes). */
  finishedPcs: number;
  isRaw: boolean;
  isFinished: boolean;
  /** 0..1 progress across the whole chain. */
  progressRatio: number;
}

export function getSortedStages(stages: ProcessingStage[]): ProcessingStage[] {
  return [...stages].sort((a, b) => a.sequence - b.sequence);
}

/** Derive one batch's progress from its own stage fields. */
export function getBatchStageProgress(
  batch: Batch,
  stages: ProcessingStage[]
): BatchStageProgress {
  const sorted = getSortedStages(stages);
  const currentStage = batch.currentStageId
    ? sorted.find(s => s.id === batch.currentStageId) || null
    : null;

  const completedStages = currentStage
    ? sorted.filter(s => s.sequence < currentStage.sequence)
    : [];

  const nextStage = currentStage
    ? sorted.find(s => s.sequence === currentStage.sequence + 1) || null
    : sorted[0] || null;

  const availablePcs = batch.stageAvailablePcs || 0;
  const inTransitPcs = batch.atProcessorPcs || 0;
  const finishedPcs = batch.processedPcs || 0;
  const isRaw = !currentStage;
  const isFinished = !!currentStage?.isFinalStage && inTransitPcs <= 0;

  const lastRelevantSeq = isFinished
    ? (currentStage?.sequence || 0)
    : (nextStage?.sequence || 0) - 1;
  const progressRatio = sorted.length > 0
    ? Math.max(0, Math.min(1, lastRelevantSeq / sorted.length))
    : 0;

  return {
    batch,
    currentStage,
    completedStages,
    nextStage,
    availablePcs,
    inTransitPcs,
    finishedPcs,
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
 * True when a dispatch is a candidate for the given target stage:
 *  - stage 1 / legacy: batch has raw pcs on hand
 *  - intermediate: batch is at the stage just before the target and has pcs
 *    available to send forward (currentStageId matches the source stage).
 */
export function batchCanSendToStage(
  batch: Batch,
  targetStageId: string | undefined,
  stages: ProcessingStage[]
): boolean {
  const sorted = getSortedStages(stages);
  const target = targetStageId ? sorted.find(s => s.id === targetStageId) : undefined;
  if (!target) return (batch.remainingPcs || 0) > 0;
  if (target.sequence <= 1) return (batch.remainingPcs || 0) > 0;

  const source = sorted.find(s => s.sequence === target.sequence - 1);
  if (source && batch.currentStageId === source.id) return (batch.stageAvailablePcs || 0) > 0;
  // Legacy batch without a current stage but with available pcs.
  if (!batch.currentStageId) return (batch.stageAvailablePcs || 0) > 0;
  return false;
}

/**
 * Human label for a stage position used across tables/boards.
 */
export function stageDisplayName(stage: ProcessingStage | undefined | null, fallback = 'Raw'): string {
  if (!stage) return fallback;
  return stage.isFinalStage ? `★ ${stage.name}` : stage.name;
}

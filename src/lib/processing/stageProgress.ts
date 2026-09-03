import type { Batch, ProcessingStage } from '../../types/erp';
import { InventoryCalculationService } from '../business/InventoryCalculationService';

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
  /** Pcs never dispatched anywhere — sendable to stage 1 at any time. */
  rawPcs: number;
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

  // A batch is MULTI-POSITION: dispatched pcs sit at currentStageId while pcs
  // that CAME BACK from a processor sit at availableFromStageId waiting for
  // the next leg. When pcs are waiting, the ACTIVE position for routing is the
  // source stage — the next leg is the stage AFTER it (3700 received from
  // Shape Processor must go to Machine, never back to Shape, even while some
  // raw pcs remain and currentStageId has not advanced past the source).
  const sourceStage = batch.availableFromStageId
    ? sorted.find(s => s.id === batch.availableFromStageId) || null
    : null;
  const activeStage = (batch.stageAvailablePcs || 0) > 0 && sourceStage
    ? sourceStage
    : currentStage;

  const completedStages = activeStage
    ? sorted.filter(s => s.sequence < activeStage.sequence)
    : [];

  const nextStage = activeStage
    ? sorted.find(s => s.sequence === activeStage.sequence + 1) || null
    : sorted[0] || null;

  const availablePcs = batch.stageAvailablePcs || 0;
  const inTransitPcs = batch.atProcessorPcs || 0;
  const finishedPcs = batch.processedPcs || 0;
  const rawPcs = InventoryCalculationService.batchRawAvailable(batch);
  const isRaw = !activeStage;
  const isFinished = !!currentStage?.isFinalStage && inTransitPcs <= 0 && availablePcs <= 0;

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
 * A batch is MULTI-POSITION: its pcs can sit in several stage buckets at once
 * (1100 purchased, 1000 at Machine, 100 still raw). currentStageId describes
 * where the DISPATCHED pcs went — it must never lock the other buckets:
 *  - target stage 1 / legacy: the batch has raw pcs never sent anywhere
 *    (remaining − atProcessor − stageAvailable), OR plain remainingPcs for
 *    legacy batches that predate the stage system;
 *  - intermediate target: the batch holds pcs AVAILABLE at the source stage
 *    (stageAvailablePcs > 0) — regardless of currentStageId, because a second
 *    partial dispatch to a later stage advances currentStageId while earlier
 *    received pcs still wait at the source.
 */
export function batchCanSendToStage(
  batch: Batch,
  targetStageId: string | undefined,
  stages: ProcessingStage[]
): boolean {
  const sorted = getSortedStages(stages);
  const target = targetStageId ? sorted.find(s => s.id === targetStageId) : undefined;

  const rawPcs = InventoryCalculationService.batchRawAvailable(batch);
  const legacyRaw = (batch.remainingPcs || 0) > 0
    && !(batch.atProcessorPcs || 0) && !(batch.stageAvailablePcs || 0);

  if (!target || target.sequence <= 1) return rawPcs > 0 || legacyRaw;
  return (batch.stageAvailablePcs || 0) > 0;
}

/**
 * Human label for a stage position used across tables/boards.
 */
export function stageDisplayName(stage: ProcessingStage | undefined | null, fallback = 'Raw'): string {
  if (!stage) return fallback;
  return stage.isFinalStage ? `★ ${stage.name}` : stage.name;
}

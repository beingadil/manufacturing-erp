import type { Batch, ProcessingStage, RawMaterial } from '../../types/erp';
import {
  batchAvailableAtSource,
  batchAvailableTotal,
  batchRawAvailableOf,
  stageAvailableEntries,
  InventoryCalculationService,
} from '../business/InventoryCalculationService';

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

/** The stages a material is actually configured to pass through, in chain order. */
export function visibleStagesForMaterial(
  stages: ProcessingStage[],
  material?: Pick<RawMaterial, 'processingPath' | 'fixedStageId' | 'allowedStageIds'> | null | undefined
): ProcessingStage[] {
  const sorted = getSortedStages(stages);
  if (!material) return sorted;
  const path = material.processingPath ?? 'full_chain';
  if (path === 'ready_made') return [];
  if (path === 'single_stage') {
    const fixed = material.fixedStageId ? sorted.find(s => s.id === material.fixedStageId) : undefined;
    return fixed ? [fixed] : sorted;
  }
  if (path === 'custom_stages') {
    const allowed = new Set(material.allowedStageIds || []);
    // Chain order — the ALLOWED list's tick order is irrelevant.
    return allowed.size > 0 ? sorted.filter(s => allowed.has(s.id)) : sorted;
  }
  return sorted;
}

/** Honest "everything is finished": finished stock exists and nothing else does. */
export function isFullyFinished(batch: Batch): boolean {
  return (batch.processedPcs || 0) > 0
    && (batch.atProcessorPcs || 0) <= 0
    && batchAvailableTotal(batch) <= 0
    && batchRawAvailableOf(batch) <= 0;
}

/** Derive one batch's progress from its own disjoint buckets. */
export function getBatchStageProgress(
  batch: Batch,
  stages: ProcessingStage[],
  material?: Pick<RawMaterial, 'processingPath' | 'fixedStageId' | 'allowedStageIds'> | null
): BatchStageProgress {
  // The chain THIS material travels — a material limited to some stages
  // never shows a "next stage" outside its own chain, and finishes at
  // ITS OWN final stage, not at whatever is globally marked final.
  const sorted = visibleStagesForMaterial(stages, material ?? undefined);
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
    ? sorted.find(s => s.sequence > activeStage.sequence) || null
    : sorted[0] || null;

  const availablePcs = batchAvailableTotal(batch);
  const inTransitPcs = batch.atProcessorPcs || 0;
  const finishedPcs = batch.processedPcs || 0;
  const rawPcs = batchRawAvailableOf(batch);
  const isRaw = !activeStage;
  const isFinished = isFullyFinished(batch);

  const lastRelevantSeq =
    isFinished || sorted.length === 0
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
  stages: ProcessingStage[],
  material?: Pick<RawMaterial, 'processingPath' | 'fixedStageId' | 'allowedStageIds'> | null
): BatchStageProgress[] {
  return batches
    .filter(b => b.materialId === materialId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(b => getBatchStageProgress(b, stages, material));
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

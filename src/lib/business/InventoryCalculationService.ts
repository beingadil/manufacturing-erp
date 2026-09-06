import { Batch, ProcessingReceipt, ProcessingSend, ProcessingStage, Product, RawMaterial, Sale } from '../../types/erp';
import { AppError } from '../errorHandler';

export interface BatchStageValue {
  value: number;
  pcs: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THREE LAWS (processing engine)
 * ═══════════════════════════════════════════════════════════════════════════
 * LAW 1 — ONLY PURCHASE CREATES PCS. Send/receive/loss are MOVES, never
 *         additions. No processing handler may ever grow total stock.
 * LAW 2 — EVERY ACTION IS A TRANSFER. Each mutation deducts from exactly ONE
 *         source bucket and adds the same quantity to exactly ONE destination
 *         bucket, in one atomic store update (all-or-nothing).
 * LAW 3 — TOTAL PCS NEVER CHANGES DURING PROCESSING. After every operation
 *         the sum of all buckets must equal the sum before it; any handler
 *         that would break conservation aborts the whole update.
 *
 * BUCKETS (per batch — disjoint by construction):
 *   raw            = remainingPcs − processedPcs          (never dispatched)
 *   atProcessor    = atProcessorPcs                       (out with a processor now)
 *   available      = stageAvailableBySource[stageId]      (came back from stageId,
 *                                                         waiting for the NEXT stage)
 *   finished       = processedPcs − raw remainder of processedPcs*  (see batchRawAvailable)
 *   sold           = consumed from finished by Sales (consumeFinishedFIFO)
 *
 * MOVEMENT MAP (hard-coded; stage N's output IS stage N+1's input):
 *   SEND stage-1    RAW            → AT_<stage1>
 *   RECV stage-1    AT_<stage1>    → AVAILABLE(source=stage1)   [waits for stage2]
 *   SEND stageN>1   AVAILABLE(src) → AT_<stageN>
 *   RECV final      AT_<final>     → FINISHED
 *   LOSS            AT_<stage>     → gone (real shrinkage)
 *
 * Disjointness is the invariant that kills both historical bugs: the same pcs
 * can never sit in two buckets at once (no 561→961 inflation), and pcs that
 * came back from DIFFERENT stages live in SEPARATE source entries (no
 * 600-from-Machine + 100-from-Initial collapse to 700 "from Initial").
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class InsufficientStockError extends AppError {}
export class InvalidStageTransitionError extends AppError {}
export class ConservationError extends AppError {}

/** Entries of a batch's availability map sorted by source-stage order. */
export function stageAvailableEntries(batch: Batch): { stageId: string; pcs: number }[] {
  const map = batch.stageAvailableBySource || {};
  return Object.entries(map)
    .filter(([, pcs]) => (pcs || 0) > 0)
    .map(([stageId, pcs]) => ({ stageId, pcs: pcs || 0 }));
}

/** Pcs of this batch waiting for their next stage, produced by `sourceStageId`. */
export function batchAvailableAtSource(batch: Batch, sourceStageId: string): number {
  return (batch.stageAvailableBySource?.[sourceStageId]) || 0;
}

/** Total pcs of this batch waiting for their next stage (all sources combined). */
export function batchAvailableTotal(batch: Batch): number {
  return stageAvailableEntries(batch).reduce((s, e) => s + e.pcs, 0);
}

/** Raw pcs of a batch never dispatched anywhere — the undispatched remainder of the
 *  batch's purchase. remainingPcs is decremented only by raw dispatches, and finished
 *  pcs (processedPcs) are carved out of DISPATCHED pcs, never out of remainingPcs —
 *  so the raw bucket IS remainingPcs. This keeps batchTotalPcs identical to the
 *  conservation sum (remainingPcs + atProcessor + availability + processed). */
export function batchRawAvailableOf(batch: Batch): number {
  return Math.max(0, batch.remainingPcs || 0);
}

/** Sum of every bucket a batch holds — must equal initialPcs minus sold at all times. */
export function batchTotalPcs(batch: Batch): number {
  return batchRawAvailableOf(batch) + (batch.atProcessorPcs || 0) + batchAvailableTotal(batch) + (batch.processedPcs || 0);
}

export class InventoryCalculationService {
  /**
   * Weighted-average cost per piece for a material, derived from its Active
   * batches (remaining value ÷ remaining pcs). Zero when the material has no
   * costed batches yet. Used for the per-batch fallback only — never selling price.
   */
  static getWeightedAverageCostPerPiece(materialId: string, batches: Batch[]): number {
    let totalValue = 0;
    let totalPcs = 0;
    for (const b of batches) {
      if (b.materialId !== materialId || b.status !== 'Active' || b.remainingPcs <= 0 || b.initialPcs <= 0) continue;
      totalValue += (b.amount / b.initialPcs) * b.remainingPcs;
      totalPcs += b.remainingPcs;
    }
    return totalPcs > 0 ? totalValue / totalPcs : 0;
  }

  /** Actual purchase cost per piece of one batch (amount ÷ initial pcs). */
  static getBatchCostPerPiece(batch: Batch): number {
    return batch && batch.initialPcs > 0 ? batch.amount / batch.initialPcs : 0;
  }

  /**
   * Value of one batch-stage (raw / at-processor / finished) at the batch's own
   * purchase rate: pcs × (amount ÷ initialPcs). This is the 'show me my stock at
   * the rate I bought it' basis — never a blended weighted average.
   */
  static valueBatchStage(materialId: string, batches: Batch[], stage: 'remainingPcs' | 'atProcessorPcs' | 'processedPcs'): BatchStageValue {
    let value = 0;
    let pcs = 0;
    for (const b of batches) {
      if (b.materialId !== materialId || b.status !== 'Active') continue;
      const stagePcs = b[stage] || 0;
      if (stagePcs <= 0) continue;
      pcs += stagePcs;
      value += stagePcs * this.getBatchCostPerPiece(b);
    }
    return { value, pcs };
  }

  /**
   * Value of one batch's WAITING pcs (stage-available buckets) at the batch's own
   * purchase rate. Waiting pcs are in the processing pipeline — they count as WIP.
   */
  static valueBatchAvailability(materialId: string, batches: Batch[]): BatchStageValue {
    let value = 0;
    let pcs = 0;
    for (const b of batches) {
      if (b.materialId !== materialId || b.status !== 'Active') continue;
      const waiting = batchAvailableTotal(b);
      if (waiting <= 0) continue;
      pcs += waiting;
      value += waiting * this.getBatchCostPerPiece(b);
    }
    return { value, pcs };
  }

  /**
   * Total value of a material's stock at actual purchase cost, per stage.
   * Buckets are disjoint (LAW 2), so raw + atProcessor + finished is the true
   * total and can never double-count.
   */
  static getMaterialStageValues(materialId: string, batches: Batch[]): {
    raw: BatchStageValue;
    atProcessor: BatchStageValue;
    finished: BatchStageValue;
  } {
    const atProcessor = this.valueBatchStage(materialId, batches, 'atProcessorPcs');
    const waiting = this.valueBatchAvailability(materialId, batches);
    return {
      raw: this.valueBatchStage(materialId, batches, 'remainingPcs'),
      // WIP = pcs in the processing pipeline: at a processor now OR received
      // back waiting for the next stage. Buckets are disjoint, so folding the
      // waiting pcs into WIP keeps raw + WIP + finished = total on hand.
      atProcessor: { pcs: atProcessor.pcs + waiting.pcs, value: atProcessor.value + waiting.value },
      finished: this.valueBatchStage(materialId, batches, 'processedPcs'),
    };
  }

  /**
   * FIFO cost of goods sold for a sale: consume finished pcs from the oldest
   * batches first (by purchase date), each at that batch's actual purchase rate.
   * If not enough batch-attributed finished pcs exist (legacy data), the
   * shortfall is valued at the material's weighted-average cost.
   */
  static getFIFOCOGSForSale(
    materialId: string,
    pcsSold: number,
    batches: Batch[]
  ): { cogs: number; consumedPcs: number } {
    const attributed = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.processedPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    let remaining = pcsSold;
    let cogs = 0;
    let consumedPcs = 0;
    for (const b of attributed) {
      if (remaining <= 0) break;
      const take = Math.min(b.processedPcs || 0, remaining);
      cogs += take * this.getBatchCostPerPiece(b);
      consumedPcs += take;
      remaining -= take;
    }
    // Legacy shortfall — value at weighted-average cost so COGS is never silently 0.
    if (remaining > 0) {
      cogs += remaining * this.getWeightedAverageCostPerPiece(materialId, batches);
      consumedPcs += remaining;
    }
    return { cogs, consumedPcs };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOVEMENT ENGINE — each helper moves qty from ONE bucket to ONE bucket
  // across batches (FIFO oldest first, honouring a preferred batch). Every
  // helper is pure: it returns new batch arrays and never mutates input.
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * LAW 2 transfer: RAW → AT_<stage>. Consumes from batches' raw bucket
   * (remainingPcs − processedPcs) oldest-first, optionally preferring one batch.
   * Throws InsufficientStockError when not enough raw pcs exist — never a
   * silent shortfall.
   */
  static moveRawToProcessor(
    materialId: string,
    pcs: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[] } {
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[]
      : candidates;

    let remaining = pcs;
    const takeByBatch = new Map<string, number>();
    const usedBatchIds: string[] = [];
    for (const b of ordered) {
      if (remaining <= 0) break;
      const raw = batchRawAvailableOf(b);
      const take = Math.min(raw, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b.id, take);
      usedBatchIds.push(b.id);
      remaining -= take;
    }
    if (remaining > 0) {
      throw new InsufficientStockError(`Only ${pcs - remaining} of ${pcs} PCS are available in raw stock.`);
    }

    return {
      batches: batches.map(b => {
        const take = takeByBatch.get(b.id) || 0;
        if (take <= 0) return b;
        // remainingPcs is the raw bucket — decrement it. processedPcs (finished)
        // is untouched; batchRawAvailableOf derives the new raw remainder.
        return { ...b, remainingPcs: (b.remainingPcs || 0) - take, atProcessorPcs: (b.atProcessorPcs || 0) + take };
      }),
      usedBatchIds,
    };
  }

  /**
   * LAW 2 transfer: AVAILABLE(source) → AT_<target>. Consumes from the
   * given SOURCE stage's availability entries only — pcs produced by other
   * stages are never touched (multi-source truth). Oldest batch first,
   * optionally preferring one batch. Throws when the source bucket is short —
   * this is what makes stage-skipping and re-processing physically impossible.
   */
  static moveAvailableToProcessor(
    materialId: string,
    sourceStageId: string,
    pcs: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[] } {
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && batchAvailableAtSource(b, sourceStageId) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[]
      : candidates;

    let remaining = pcs;
    const takeByBatch = new Map<string, number>();
    const usedBatchIds: string[] = [];
    for (const b of ordered) {
      if (remaining <= 0) break;
      const avail = batchAvailableAtSource(b, sourceStageId);
      const take = Math.min(avail, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b.id, take);
      usedBatchIds.push(b.id);
      remaining -= take;
    }
    if (remaining > 0) {
      throw new InsufficientStockError(
        `Only ${pcs - remaining} of ${pcs} PCS are available from this stage's output.`
      );
    }

    return {
      batches: batches.map(b => {
        const take = takeByBatch.get(b.id) || 0;
        if (take <= 0) return b;
        const map = { ...(b.stageAvailableBySource || {}) };
        const left = (map[sourceStageId] || 0) - take;
        if (left > 0) map[sourceStageId] = left; else delete map[sourceStageId];
        return { ...b, stageAvailableBySource: map, atProcessorPcs: (b.atProcessorPcs || 0) + take };
      }),
      usedBatchIds,
    };
  }

  /**
   * LAW 2 transfer: AT_<stage> → AVAILABLE(source=stage). A non-final receipt:
   * the pcs leave the processor (atProcessorPcs drops) and wait for the NEXT
   * stage under their producing stage's key. Oldest batch first, preferring
   * the dispatch's own batch so the trail returns where it left.
   */
  static moveProcessorToAvailable(
    materialId: string,
    producedByStageId: string,
    pcs: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[] } {
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.atProcessorPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[]
      : candidates;

    let remaining = pcs;
    const takeByBatch = new Map<string, number>();
    const usedBatchIds: string[] = [];
    for (const b of ordered) {
      if (remaining <= 0) break;
      const wip = b.atProcessorPcs || 0;
      const take = Math.min(wip, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b.id, take);
      usedBatchIds.push(b.id);
      remaining -= take;
    }
    if (remaining > 0) {
      // Should be unreachable (pending is validated first) — fail loud anyway.
      throw new InsufficientStockError(`Only ${pcs - remaining} of ${pcs} PCS are at the processor.`);
    }

    return {
      batches: batches.map(b => {
        const take = takeByBatch.get(b.id) || 0;
        if (take <= 0) return b;
        const map = { ...(b.stageAvailableBySource || {}) };
        map[producedByStageId] = (map[producedByStageId] || 0) + take;
        return { ...b, stageAvailableBySource: map, atProcessorPcs: Math.max(0, (b.atProcessorPcs || 0) - take) };
      }),
      usedBatchIds,
    };
  }

  /**
   * LAW 2 transfer: AT_<stage> → FINISHED. Final-stage receipt. Oldest batch
   * first, preferring the dispatch's batch.
   */
  static attributeReceiptFIFO(
    materialId: string,
    pcsReceived: number,
    batches: Batch[],
    preferredBatchId?: string
  ): Batch[] {
    let remaining = pcsReceived;
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.atProcessorPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[]
      : candidates;
    const takeByBatch = new Map<string, number>();
    for (const b of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(b?.atProcessorPcs || 0, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b!.id, take);
      remaining -= take;
    }
    return batches.map(b => {
      const take = takeByBatch.get(b.id) || 0;
      if (take <= 0) return b;
      return { ...b, atProcessorPcs: Math.max(0, (b.atProcessorPcs || 0) - take), processedPcs: (b.processedPcs || 0) + take };
    });
  }

  /**
   * LAW 2 transfer (shrinkage): AT_<stage> → gone. Recorded loss removes pcs
   * from the batch trail entirely — total inventory value drops by exactly the
   * lost pcs at batch cost.
   */
  static attributeLossFIFO(
    materialId: string,
    pcsLost: number,
    batches: Batch[],
    preferredBatchId?: string
  ): Batch[] {
    let remaining = pcsLost;
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.atProcessorPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[]
      : candidates;
    const takeByBatch = new Map<string, number>();
    for (const b of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(b?.atProcessorPcs || 0, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b!.id, take);
      remaining -= take;
    }
    return batches.map(b => {
      const take = takeByBatch.get(b.id) || 0;
      if (take <= 0) return b;
      return { ...b, atProcessorPcs: Math.max(0, (b.atProcessorPcs || 0) - take) };
    });
  }

  /**
   * LAW 2 shrinkage for recorded loss. The lost pcs may sit at the processor
   * (dispatched, not yet received back) OR in the stage's availability bucket
   * (received back, later reported lost) — consume from atProcessorPcs first,
   * then from the producing stage's availability. Returns how many pcs came
   * from the processor bucket so the caller can adjust material counters.
   */
  static consumeLoss(
    materialId: string,
    stageId: string | undefined,
    pcsLost: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; fromProcessor: number; fromAvailable: number } {
    const ordered = (src: Batch[], get: (b: Batch) => number) => {
      const candidates = src.filter(b => b.materialId === materialId && b.status === 'Active' && get(b) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      return preferredBatchId
        ? ([candidates.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean) as Batch[])
        : candidates;
    };
    const takeFrom = (src: Batch[], get: (b: Batch) => number, qty: number) => {
      let remaining = qty;
      const takeByBatch = new Map<string, number>();
      for (const b of ordered(src, get)) {
        if (remaining <= 0) break;
        const take = Math.min(get(b), remaining);
        if (take <= 0) continue;
        takeByBatch.set(b.id, take);
        remaining -= take;
      }
      return { takeByBatch, consumed: qty - remaining, remaining };
    };

    // Pass 1: pcs still at the processor.
    const p1 = takeFrom(batches, b => b.atProcessorPcs || 0, pcsLost);
    let work = batches.map(b => {
      const take = p1.takeByBatch.get(b.id) || 0;
      return take > 0 ? { ...b, atProcessorPcs: Math.max(0, (b.atProcessorPcs || 0) - take) } : b;
    });

    // Pass 2: pcs waiting in this stage's availability bucket.
    let fromAvailable = 0;
    if (p1.remaining > 0 && stageId) {
      const p2 = takeFrom(work, b => batchAvailableAtSource(b, stageId), p1.remaining);
      if (p2.consumed > 0) {
        work = work.map(b => {
          const take = p2.takeByBatch.get(b.id) || 0;
          if (take <= 0) return b;
          const map = { ...(b.stageAvailableBySource || {}) };
          const left = (map[stageId] || 0) - take;
          if (left > 0) map[stageId] = left; else delete map[stageId];
          return { ...b, stageAvailableBySource: map };
        });
        fromAvailable += p2.consumed;
      }
      // Pass 3: any remaining availability (legacy entries without a stage key).
      if (p2.remaining > 0) {
        const p3 = takeFrom(work, b => batchAvailableTotal(b), p2.remaining);
        if (p3.consumed > 0) {
          work = work.map(b => {
            const take = p3.takeByBatch.get(b.id) || 0;
            if (take <= 0) return b;
            const map = { ...(b.stageAvailableBySource || {}) };
            let need = take;
            for (const e of stageAvailableEntries(b)) {
              if (need <= 0) break;
              const d = Math.min(map[e.stageId] || 0, need);
              if (d > 0) {
                const left = (map[e.stageId] || 0) - d;
                if (left > 0) map[e.stageId] = left; else delete map[e.stageId];
                need -= d;
              }
            }
            return { ...b, stageAvailableBySource: map };
          });
          fromAvailable += p3.consumed;
        }
      }
    }

    return { batches: work, fromProcessor: p1.consumed, fromAvailable };
  }

  /** Legacy alias — raw availability of a batch. */
  static batchRawAvailable(batch: Batch): number {
    return batchRawAvailableOf(batch);
  }

  /** Legacy alias for moveRawToProcessor (old name used by tests/migration). */
  static attributeDispatchFIFO(
    materialId: string,
    pcsSent: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[] } {
    return this.moveRawToProcessor(materialId, pcsSent, batches, preferredBatchId);
  }

  /**
   * Consume finished pcs FIFO across batches (oldest batch first) and return the
   * updated batch list with the sold pcs removed from each batch's processedPcs.
   */
  static consumeFinishedFIFO(materialId: string, pcsSold: number, batches: Batch[]): Batch[] {
    const order = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.processedPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    let remaining = pcsSold;
    const consumedByBatch = new Map<string, number>();
    for (const b of order) {
      if (remaining <= 0) break;
      const take = Math.min(b.processedPcs || 0, remaining);
      consumedByBatch.set(b.id, take);
      remaining -= take;
    }

    return batches.map(b => {
      const take = consumedByBatch.get(b.id) || 0;
      return take > 0 ? { ...b, processedPcs: (b.processedPcs || 0) - take } : b;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOVEMENT MAP + GUARD RAILS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Consume from RAW (stage-1 / legacy dispatch). Unknown stage ids default to
   * raw-consuming so the trail can never lose pcs.
   */
  static sendConsumesRaw(stageId: string | undefined, stages: ProcessingStage[]): boolean {
    if (!stageId) return true;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return true;
    return stage.sequence <= 1;
  }

  /**
   * Final-stage (or legacy stage-less) receipts produce FINISHED goods.
   * Unknown stage ids default to finished-producing so legacy data never strands.
   */
  static receiptProducesFinished(stageId: string | undefined, stages: ProcessingStage[]): boolean {
    if (!stageId) return true;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return true;
    return !!stage.isFinalStage;
  }

  /**
   * MOVEMENT MAP: which source bucket may feed `targetStageId`?
   *   stage 1 feeds from RAW; stage N feeds from the availability produced by
   *   stage N−1. Returns 'raw' or a stageId. Throws InvalidStageTransitionError
   *   for a target with no predecessor (gap in the chain).
   */
  static requiredSourceForTarget(targetStageId: string, stages: ProcessingStage[]): 'raw' | string {
    const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
    const target = sorted.find(s => s.id === targetStageId);
    if (!target) return 'raw'; // unknown stage → legacy raw-consuming behaviour
    if (target.sequence <= 1) return 'raw';
    const source = sorted.find(s => s.sequence === target.sequence - 1);
    if (!source) {
      throw new InvalidStageTransitionError(
        `Stage "${target.name}" has no predecessor — the stage chain has a gap.`
      );
    }
    return source.id;
  }

  /**
   * GUARD RAIL: dispatching to `targetStageId` from `sourceStageId` must follow
   * the movement map (target = source's next stage, or stage 1 from raw).
   */
  static assertLegalTransition(sourceStageId: 'raw' | string, targetStageId: string, stages: ProcessingStage[]): void {
    const required = this.requiredSourceForTarget(targetStageId, stages);
    if (required !== sourceStageId) {
      const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
      const target = sorted.find(s => s.id === targetStageId);
      const source = sourceStageId === 'raw' ? 'raw stock' : sorted.find(s => s.id === sourceStageId)?.name || 'unknown stage';
      throw new InvalidStageTransitionError(
        `Pcs from ${source} can only move to ${required === 'raw' ? 'stage 1' : sorted.find(s => s.id === required)?.name || 'the next stage'}${target ? `, not to ${target.name}` : ''}. Follow the stage sequence.`
      );
    }
  }

  /**
   * LAW 3 — conservation check. Sum of every bucket across `batches` for the
   * given material must equal `expected`. Throws ConservationError (which the
   * caller turns into a full rollback) on any drift. `expectedDelta` is the
   * intentional change (0 for pure moves; −qty for recorded loss).
   */
  static assertConservation(materialId: string, before: Batch[], after: Batch[], expectedDelta = 0): void {
    const sum = (arr: Batch[]) =>
      arr
        .filter(b => b.materialId === materialId && b.status === 'Active')
        .reduce((s, b) => s + (b.remainingPcs || 0) + (b.atProcessorPcs || 0) + batchAvailableTotal(b) + (b.processedPcs || 0), 0);
    const b = sum(before);
    const a = sum(after);
    if (Math.abs((a - b) - expectedDelta) > 0.001) {
      throw new ConservationError(
        `Inventory conservation violated: ${b} PCS before → ${a} PCS after (expected change ${expectedDelta}). Operation rolled back.`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY COMPAT SHIMS (scalar stageAvailablePcs readers → per-source map)
  // ═══════════════════════════════════════════════════════════════════════

  /** Read the scalar legacy availability field onto the per-source map (one entry). */
  static legacyAvailabilityEntries(batch: Batch): { stageId: string; pcs: number }[] {
    const fromMap = stageAvailableEntries(batch);
    if (fromMap.length > 0) return fromMap;
    // Migrate-on-read: legacy persisted fields (not in the type anymore) → single map entry.
    const legacy = batch as any;
    if ((legacy.stageAvailablePcs || 0) > 0 && legacy.availableFromStageId) {
      return [{ stageId: legacy.availableFromStageId, pcs: legacy.stageAvailablePcs }];
    }
    return [];
  }

  /**
   * Replay one material's FULL batch trail from the authoritative history —
   * purchases baseline → dispatches → losses → receipts → sales — under the
   * disjoint bucket engine. Used by the startup migration and by edit/delete
   * replays so every path produces byte-identical trails.
   *
   * `knownShortfallPcs` pcs that history shows were dispatched but which the
   * current batches cannot cover (e.g. the purchase was edited smaller after
   * the fact) are force-created from the baseline so the trail still sums —
   * conservation is checked BEFORE adding the shortfall, so genuine engine
   * bugs still abort.
   */
  static recomputeFinishedPcsForMaterial(
    materialId: string,
    batches: Batch[],
    processingReceipts: ProcessingReceipt[],
    processingSends: ProcessingSend[],
    sales: Sale[],
    products: Product[],
    excludeSaleId?: string,
    stages: ProcessingStage[] = []
  ): Batch[] {
    // 1. Reset this material's batches to the purchase baseline (all raw).
    let trail: Batch[] = batches.map(b =>
      b.materialId === materialId
        ? {
            ...b,
            remainingPcs: b.initialPcs > 0 ? b.initialPcs : b.remainingPcs,
            atProcessorPcs: 0,
            processedPcs: 0,
            stageAvailableBySource: {},
            currentStageId: undefined,
          }
        : b
    );

    // 2. Dispatches: stage-1/legacy draw RAW; intermediate draws are WIP→WIP
    //    (bucket-to-bucket) and never touch raw.
    const orderedSends = [...processingSends]
      .filter(s => s.materialId === materialId && s.status !== 'Adjusted' && (s.pcsSent || 0) > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const s of orderedSends) {
      if (!this.sendConsumesRaw(s.stageId, stages)) continue;
      try {
        const res = this.moveRawToProcessor(materialId, s.pcsSent || 0, trail, s.batchId || undefined);
        trail = res.batches;
        // Display metadata via the shared helper — identical to live handlers.
        trail = this.advanceDrainedBatches(trail, res.usedBatchIds, s.stageId, true);
      } catch (e) {
        if (!(e instanceof InsufficientStockError)) throw e;
        // History overruns the baseline (purchase edited smaller / legacy
        // drift). History is authoritative: force-create the missing pcs on
        // the oldest batch, consume them, verify the result is conserved.
        const before = trail;
        const oldest = [...trail]
          .filter(b => b.materialId === materialId && b.status === 'Active')
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!oldest) throw e;
        const topped = trail.map(b =>
          b.id === oldest.id ? { ...b, remainingPcs: (b.remainingPcs || 0) + (s.pcsSent || 0) } : b
        );
        trail = this.moveRawToProcessor(materialId, s.pcsSent || 0, topped, oldest.id).batches;
        this.assertConservation(materialId, before, trail);
      }
    }

    // 2b. Recorded losses shrink WIP (FIFO, preferring the dispatch's batch).
    for (const s of orderedSends) {
      if (!(s.lossQuantity || 0)) continue;
      trail = this.attributeLossFIFO(materialId, s.lossQuantity || 0, trail, s.batchId || undefined);
    }

    // 3+4. Receipts and intermediate-stage moves replay in ONE chronological
    //      stream so per-source availability forms exactly as it did live.
    const stageEvents = [
      ...orderedSends
        .filter(s => !this.sendConsumesRaw(s.stageId, stages))
        .map(s => ({ kind: 'send' as const, date: s.date || '', s })),
      ...[...processingReceipts]
        .filter(r => r.materialId === materialId && (r.pcsReceived || 0) > 0)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(r => {
          const send = processingSends.find(x => x.id === r.sendId);
          return { kind: 'receipt' as const, date: r.date || '', r, send };
        }),
    ].sort((a, b) => a.date.localeCompare(b.date));

    for (const ev of stageEvents) {
      if (ev.kind === 'send') {
        const s = ev.s;
        const source = this.requiredSourceForTarget(s.stageId!, stages);
        try {
          const res = this.moveAvailableToProcessor(materialId, source, s.pcsSent || 0, trail, s.batchId || undefined);
          trail = res.batches;
          // Display metadata via the shared helper — identical to live handlers.
          trail = this.advanceDrainedBatches(trail, res.usedBatchIds, s.stageId, false);
        } catch (e) {
          if (!(e instanceof InsufficientStockError)) throw e;
          // History over baseline (legacy drift): force-create on the batch
          // holding the most availability at this source, else the oldest.
          const host =
            [...trail]
              .filter(b => b.materialId === materialId && b.status === 'Active')
              .sort((a, b) => batchAvailableAtSource(b, source) - batchAvailableAtSource(a, source))[0] ||
            [...trail].filter(b => b.materialId === materialId && b.status === 'Active').sort((a, b) => a.date.localeCompare(b.date))[0];
          if (host) {
            const before = trail;
            trail = trail.map(b =>
              b.id === host.id
                ? { ...b, stageAvailableBySource: { ...(b.stageAvailableBySource || {}), [source]: (b.stageAvailableBySource?.[source] || 0) + s.pcsSent! } }
                : b
            );
            trail = this.moveAvailableToProcessor(materialId, source, s.pcsSent || 0, trail, host.id).batches;
            this.assertConservation(materialId, before, trail);
          }
        }
      } else {
        const { r, send } = ev;
        const stageId = r.stageId ?? send?.stageId;
        if (this.receiptProducesFinished(stageId, stages)) {
          trail = this.attributeReceiptFIFO(materialId, r.pcsReceived, trail, send?.batchId || undefined);
        } else {
          trail = this.moveProcessorToAvailable(materialId, stageId || 'legacy', r.pcsReceived, trail, send?.batchId || undefined).batches;
        }
      }
    }

    // 5. Sales consume finished pcs FIFO — all sales except the one being
    //    edited/deleted (so the change re-applies cleanly).
    const productIds = new Set(products.filter(p => p.materialId === materialId).map(p => p.id));
    const orderedSales = sales
      .filter(s => s.id !== excludeSaleId && productIds.has(s.productId) && (s.pcsSold || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const sale of orderedSales) {
      trail = this.consumeFinishedFIFO(materialId, sale.pcsSold, trail);
    }

    return trail;
  }

  /**
   * Re-derive the material-level counters from the batch trail. The trail is
   * the single source of truth; counters are a roll-up that can never drift.
   *
   * Semantics: stockPcs = raw on hand; atProcessorPcs = IN THE PROCESSING
   * PIPELINE (physically at a processor OR received back waiting for the next
   * stage — disjoint buckets, so the sum never double-counts);
   * processedStockPcs = finished and on hand.
   */
  static syncMaterialCounters(materials: RawMaterial[], batches: Batch[]): RawMaterial[] {
    return materials.map(m => {
      const own = batches.filter(b => b.materialId === m.id && b.status === 'Active');
      const stockPcs = own.reduce((s, b) => s + batchRawAvailableOf(b), 0);
      const atProcessorPcs = own.reduce((s, b) => s + (b.atProcessorPcs || 0) + batchAvailableTotal(b), 0);
      const processedStockPcs = own.reduce((s, b) => s + (b.processedPcs || 0), 0);
      return { ...m, stockPcs, atProcessorPcs, processedStockPcs };
    });
  }

  /**
   * Display metadata shared by the LIVE handlers and the REPLAY: batches whose
   * source bucket was fully drained by a dispatch advance to the dispatch
   * target. Batches are multi-position — a partial drain keeps its position
   * sendable — so ONLY a full drain advances. Both paths call this one helper
   * so live state and replayed state can never disagree (TEST P invariant).
   */
  static advanceDrainedBatches(
    trail: Batch[],
    usedBatchIds: string[],
    targetStageId: string | undefined,
    consumedRaw: boolean
  ): Batch[] {
    if (!targetStageId || usedBatchIds.length === 0) return trail;
    const drained = new Set(
      usedBatchIds.filter(id => {
        const b = trail.find(x => x.id === id);
        if (!b) return false;
        return consumedRaw ? batchRawAvailableOf(b) === 0 : batchAvailableTotal(b) === 0;
      })
    );
    if (drained.size === 0) return trail;
    return trail.map(b => (drained.has(b.id) ? { ...b, currentStageId: targetStageId } : b));
  }

  /** Total raw material stock across all Active batches (raw bucket). */
  static calculateRawMaterialStock(materialId: string, batches: Batch[]): number {
    return batches
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .reduce((sum, b) => sum + batchRawAvailableOf(b), 0);
  }

  /** Available dispatchable quantity for a specific batch (raw bucket). */
  static getAvailableDispatchQuantity(batchId: string, batches: Batch[]): number {
    const batch = batches.find(b => b.id === batchId);
    return batch ? batchRawAvailableOf(batch) : 0;
  }

  /** Remaining processor balance: dispatched − received for one processor/material. */
  static calculateProcessorPendingBalance(
    processorId: string,
    materialId: string,
    dispatches: any[],
    receipts: any[]
  ): number {
    const totalDispatched = dispatches
      .filter(d => d.processorId === processorId && d.materialId === materialId)
      .reduce((sum, d) => sum + (d.pcsSent || 0), 0);
    const totalReceived = receipts
      .filter(r => r.processorId === processorId && r.materialId === materialId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);
    return totalDispatched - totalReceived;
  }

  /**
   * Per-stage WIP: Σ sent − Σ received − Σ loss for that stage — a pure
   * derivation over the movement history. Disjointness guarantees the same
   * economic pcs are never held in two stages simultaneously.
   */
  static getStageWIP(
    stageId: string | undefined,
    processingSends: ProcessingSend[],
    processingReceipts: ProcessingReceipt[]
  ): number {
    const sent = processingSends
      .filter(s => s.stageId === stageId && s.status !== 'Adjusted')
      .reduce((sum, s) => sum + (s.pcsSent || 0), 0);
    const received = processingReceipts
      .filter(r => r.stageId === stageId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);
    const lost = processingSends
      .filter(s => s.stageId === stageId)
      .reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
    return Math.max(0, sent - received - lost);
  }

  /**
   * Calculate total product stock derived from receipts minus sales.
   * The ERP tracks stock via `processedStockPcs` on the Material linked to the Product.
   */
  static calculateFinishedProductStock(materialId: string, receipts: any[], sales: any[]): number {
    const totalProduced = receipts
      .filter(r => r.materialId === materialId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);
    const totalSold = sales
      .filter(s => s.materialId === materialId)
      .reduce((sum, s) => sum + (s.pcsSold || 0), 0);
    return totalProduced - totalSold;
  }

  /**
   * Compute a receipt's bill amount: per_piece = qty × rate;
   * per_kg = qty × weightPerPiece(kg) × rate. Shared by receipt creation and
   * edits so an edit never leaves a stale billAmount behind.
   */
  static computeReceiptBillAmount(
    pcsReceived: number,
    rateMethod: 'per_piece' | 'per_kg' | undefined,
    send: { ratePerPiece?: number } | undefined,
    batch: { weightPerPiece?: number } | undefined,
    stage?: ProcessingStage
  ): number {
    const method = rateMethod ?? stage?.rateMethod ?? 'per_piece';
    const rate = send?.ratePerPiece || 0;
    return method === 'per_kg'
      ? pcsReceived * (batch?.weightPerPiece || 0) * rate
      : pcsReceived * rate;
  }
}

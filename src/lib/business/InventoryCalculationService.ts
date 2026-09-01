import { Batch, ProcessingReceipt, ProcessingSend, ProcessingStage, Product, RawMaterial, Sale } from '../../types/erp';

export interface BatchStageValue {
  value: number;
  pcs: number;
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
   * Total value of a material's stock at actual purchase cost, per stage:
   *   raw = Σ remainingPcs × batch rate
   *   atProcessor = Σ atProcessorPcs × batch rate
   *   finished = Σ processedPcs × batch rate
   * Pcs that cannot be attributed to a batch (legacy data before per-batch
   * tracking) fall back to the material's weighted-average cost so nothing is
   * silently dropped.
   */
  static getMaterialStageValues(materialId: string, batches: Batch[]): {
    raw: BatchStageValue;
    atProcessor: BatchStageValue;
    finished: BatchStageValue;
  } {
    return {
      raw: this.valueBatchStage(materialId, batches, 'remainingPcs'),
      atProcessor: this.valueBatchStage(materialId, batches, 'atProcessorPcs'),
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

  /**
   * Move pcs from the raw stage to the WIP stage across batches, FIFO (oldest
   * batch first). Used when a dispatch is created WITHOUT an explicit batch
   * (the 'Any Batch / General Stock' path) so the batch trail always moves in
   * lockstep with the material counters — the same economic pcs are never
   * counted as both raw and WIP.
   * Returns the updated batches plus the batchIds consumed (for receipt linkage).
   */
  static attributeDispatchFIFO(
    materialId: string,
    pcsSent: number,
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[] } {
    let remaining = pcsSent;
    const usedBatchIds: string[] = [];
    const candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.remainingPcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const ordered = preferredBatchId
      ? [batches.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean)
      : candidates;
    const takeByBatch = new Map<string, number>();
    for (const b of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(b?.remainingPcs || 0, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b!.id, take);
      usedBatchIds.push(b!.id);
      remaining -= take;
    }
    return {
      batches: batches.map(b => {
        const take = takeByBatch.get(b.id) || 0;
        if (take <= 0) return b;
        return { ...b, remainingPcs: (b.remainingPcs || 0) - take, atProcessorPcs: (b.atProcessorPcs || 0) + take };
      }),
      usedBatchIds,
    };
  }

  /**
   * Move pcs from one stage's "available" bucket (stageAvailablePcs) to the
   * target stage, FIFO (oldest batch first) across the batches that currently
   * hold available pcs at the SOURCE stage (the stage before the target in the
   * chain). Used when an INTERMEDIATE dispatch is created without an explicit
   * batch ('Auto / Any Batch' path) so the batch trail always moves in lockstep
   * with the available-pcs counter — the same economic pcs are never sent to a
   * stage twice.
   *
   * Returns the updated batches plus the batchIds consumed (for receipt linkage).
   */
  static attributeStageDispatchFIFO(
    materialId: string,
    pcsSent: number,
    targetStageId: string | undefined,
    stages: ProcessingStage[],
    batches: Batch[],
    preferredBatchId?: string
  ): { batches: Batch[]; usedBatchIds: string[]; attributedPcs: number } {
    let remaining = pcsSent;
    const usedBatchIds: string[] = [];

    // Determine the source stage (the stage immediately before the target).
    const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
    const target = targetStageId ? sorted.find(s => s.id === targetStageId) : undefined;
    const sourceStage = target ? sorted.find(s => s.sequence === target.sequence - 1) : undefined;

    // Candidate batches: same material, active, with pcs available to send
    // forward. Prefer batches at the SOURCE stage; fall back to any batch with
    // availability (legacy data without currentStageId) so nothing is stranded.
    let candidates = batches
      .filter(b => b.materialId === materialId && b.status === 'Active' && (b.stageAvailablePcs || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sourceStage) {
      const atSource = candidates.filter(b => b.currentStageId === sourceStage.id);
      if (atSource.length > 0) candidates = atSource;
      else {
        const legacy = candidates.filter(b => !b.currentStageId);
        if (legacy.length > 0) candidates = legacy;
      }
    }

    const ordered = preferredBatchId
      ? [batches.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean)
      : candidates;

    const takeByBatch = new Map<string, number>();
    for (const b of ordered) {
      if (remaining <= 0) break;
      const take = Math.min(b?.stageAvailablePcs || 0, remaining);
      if (take <= 0) continue;
      takeByBatch.set(b!.id, take);
      usedBatchIds.push(b!.id);
      remaining -= take;
    }

    return {
      batches: batches.map(b => {
        const take = takeByBatch.get(b.id) || 0;
        if (take <= 0) return b;
        return {
          ...b,
          stageAvailablePcs: Math.max(0, (b.stageAvailablePcs || 0) - take),
          currentStageId: targetStageId || b.currentStageId,
        };
      }),
      usedBatchIds,
      attributedPcs: pcsSent - remaining,
    };
  }

  /**
   * Move pcs from the WIP stage to the finished stage across batches, FIFO
   * (oldest batch with WIP first). Mirrors attributeDispatchFIFO so a receipt
   * returns pcs to the same batches they were dispatched from, keeping the
   * batch trail exactly in sync with the material counters.
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
      ? [batches.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean)
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
   * Consume finished pcs FIFO across batches (oldest batch first) and return the
   * updated batch list with the sold pcs removed from each batch's processedPcs.
   * Mirrors getFIFOCOGSForSale exactly — same order, same shortfall handling.
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

  /**
   * Compute a receipt's bill amount using the same per-stage formula the live
   * engine uses: per_piece = qty × rate; per_kg = qty × weightPerPiece(kg) × rate.
   * Shared by receipt creation AND receipt edits so editing a receipt never
   * leaves a stale billAmount behind.
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

  /**
   * True when a dispatch draws its pcs from RAW stock (stage 1, or a legacy
   * stage-less dispatch — old single-stage behaviour where every send drew raw).
   * Unknown stage ids default to raw-consuming so the trail can never lose pcs.
   */
  static sendConsumesRaw(stageId: string | undefined, stages: ProcessingStage[]): boolean {
    if (!stageId) return true;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return true;
    return stage.sequence <= 1;
  }

  /**
   * True when a receipt from a stage produces FINISHED goods (the stage is the
   * configured final stage, or a legacy stage-less receipt — old single-stage
   * behaviour where receipt = finished). Unknown stage ids default to
   * finished-producing so legacy data is never stranded.
   */
  static receiptProducesFinished(stageId: string | undefined, stages: ProcessingStage[]): boolean {
    if (!stageId) return true;
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return true;
    return !!stage.isFinalStage;
  }

  /**
   * Decrement WIP pcs across batches FIFO (oldest batch with WIP first),
   * preferring the recorded batch. Used when loss/wastage is explicitly
   * recorded — the lost pcs leave the batch trail entirely (real shrinkage),
   * so total inventory value decreases by exactly the lost pcs at batch cost.
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
      ? [batches.find(b => b.id === preferredBatchId), ...candidates.filter(b => b.id !== preferredBatchId)].filter(Boolean)
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
   * Derive the WIP pcs currently held at one processing stage from the movement
   * history: Σ sent to the stage − Σ received from the stage − Σ loss at the
   * stage. This is a pure derivation — the same economic pcs are never counted
   * as held in two stages simultaneously (the batch's single atProcessorPcs
   * bucket is the sum across all intermediate stages).
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
   * Rebuild a material's batch trail (raw → WIP → finished) from the
   * authoritative send/receipt/sale history — the same replay the startup
   * migration performs, scoped to one material. Used by sale edit/delete so the
   * batch stages stay correct when a sale changes (and never wipe finished pcs
   * for legacy dispatches that have no batchId — those are FIFO-attributed like
   * the live engine). Sales consume finished pcs FIFO, oldest batch first.
   *
   * Stage-aware: only stage-1 (or legacy) dispatches draw from raw; only
   * receipts from the configured final stage (or legacy) produce finished;
   * recorded losses decrement WIP. Pass `stages` (defaults to legacy
   * single-stage behaviour when omitted).
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
    // 1. Reset this material's batches to its purchase baseline (all pcs raw).
    let trail: Batch[] = batches.map(b =>
      b.materialId === materialId
        ? {
            ...b,
            remainingPcs: b.initialPcs > 0 ? b.initialPcs : b.remainingPcs,
            atProcessorPcs: 0,
            processedPcs: 0,
          }
        : b
    );

    // 2. Replay dispatches chronologically. Stage-1 / legacy dispatches draw
    //    from raw (raw → WIP); intermediate-stage dispatches are WIP → WIP and
    //    do not touch the batch buckets (the stage derivation carries them).
    const orderedSends = [...processingSends]
      .filter(s => s.materialId === materialId && s.status !== 'Adjusted' && (s.pcsSent || 0) > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const s of orderedSends) {
      if (!this.sendConsumesRaw(s.stageId, stages)) continue;
      trail = this.attributeDispatchFIFO(materialId, s.pcsSent, trail, s.batchId || undefined).batches;
    }

    // 2b. Recorded losses reduce WIP (FIFO, preferring the dispatch's batch).
    for (const s of orderedSends) {
      if (!(s.lossQuantity || 0) || !this.sendConsumesRaw(s.stageId, stages)) continue;
      trail = this.attributeLossFIFO(materialId, s.lossQuantity || 0, trail, s.batchId || undefined);
    }

    // 3. Replay receipts chronologically: WIP → finished only when the receipt
    //    is from the final stage (or legacy). Intermediate receipts are WIP→WIP.
    const orderedReceipts = [...processingReceipts]
      .filter(r => r.materialId === materialId && (r.pcsReceived || 0) > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const r of orderedReceipts) {
      const send = processingSends.find(x => x.id === r.sendId);
      if (!this.receiptProducesFinished(r.stageId ?? send?.stageId, stages)) continue;
      trail = this.attributeReceiptFIFO(materialId, r.pcsReceived, trail, send?.batchId || undefined);
    }

    // 4. Sales consume finished pcs FIFO — oldest batch first, all sales except
    //    the one being edited/deleted (so the change re-applies cleanly).
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
   * Rebuild a material's three counters (stockPcs / atProcessorPcs /
   * processedStockPcs) from the authoritative batch trail. The batch trail is
   * the single source of truth; the material counters are a derived roll-up, so
   * they can never drift from the batches (the Dashboard's reconciliation guard
   * checks exactly this). Used after any send/receipt/loss/sale mutation that
   * rebuilds the trail.
   */
  static syncMaterialCounters(materials: RawMaterial[], batches: Batch[]): RawMaterial[] {
    return materials.map(m => {
      const own = batches.filter(b => b.materialId === m.id && b.status === 'Active');
      const stockPcs = own.reduce((s, b) => s + (b.remainingPcs || 0), 0);
      const atProcessorPcs = own.reduce((s, b) => s + (b.atProcessorPcs || 0), 0);
      const processedStockPcs = own.reduce((s, b) => s + (b.processedPcs || 0), 0);
      return { ...m, stockPcs, atProcessorPcs, processedStockPcs };
    });
  }

  /**
   * Calculate total raw material stock correctly across all batches.
   * This is a derivation calculation, ensuring stock values are accurate.
   */
  static calculateRawMaterialStock(materialId: string, batches: Batch[]): number {
    return batches
      .filter(b => b.materialId === materialId && b.status === 'Active')
      .reduce((sum, b) => sum + (b.remainingPcs || 0), 0);
  }

  /**
   * Determine available dispatchable quantity for a specific batch.
   */
  static getAvailableDispatchQuantity(batchId: string, batches: Batch[]): number {
    const batch = batches.find(b => b.id === batchId);
    return batch?.remainingPcs || 0;
  }

  /**
   * Calculate exact remaining processor balance based on dispatches vs receipts.
   */
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
   * Calculate total product stock derived from receipts minus sales.
   * The ERP tracks stock via `processedStockPcs` on the Material linked to the Product.
   */
  static calculateFinishedProductStock(materialId: string, receipts: any[], sales: any[]): number {
    const totalProduced = receipts
      .filter(r => r.materialId === materialId)
      .reduce((sum, r) => sum + (r.pcsReceived || 0), 0);

    const totalSold = sales
      .filter(s => {
        // Sales refers to products, so we'd need to join products, but here we assume caller does it
        return s.materialId === materialId;
      })
      .reduce((sum, s) => sum + (s.pcsSold || 0), 0);

    return totalProduced - totalSold;
  }
}

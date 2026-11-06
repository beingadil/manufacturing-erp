import type { Batch, ProcessingStage, ProcessingReceipt, ProcessingSend } from '../../types/erp';

export interface StageCostRow {
  name: string;
  sequence: number;
  dispatches: number;
  sent: number;
  received: number;
  loss: number;
  pending: number;
  billed: number;
}

export interface StageCostTotals {
  dispatches: number;
  sent: number;
  received: number;
  loss: number;
  pending: number;
  billed: number;
}

export interface StageCostBreakdown {
  rows: StageCostRow[];
  totals: StageCostTotals;
}

/**
 * Per-stage processing cost for one material's processing history.
 *
 * Rolls receipts up by the stage they were received FROM, linked to their
 * dispatches via sendId. Optional batchId scopes everything to one purchase
 * (sends on that batch + the receipts that close them).
 *
 * Pure over plain data — no store, no database.
 */
export function stageCostBreakdown(
  sends: ProcessingSend[],
  receipts: ProcessingReceipt[],
  stages: ProcessingStage[],
  batchId?: string,
): StageCostBreakdown {
  const stageMap = new Map(stages.map(s => [s.id, s]));
  const sendMap = new Map(sends.map(s => [s.id, s]));

  const scopedSends = batchId ? sends.filter(s => s.batchId === batchId) : sends;
  const scopedSendIds = new Set(scopedSends.map(s => s.id));
  const scopedReceipts = receipts.filter(r => r.sendId && scopedSendIds.has(r.sendId));

  const byStage = new Map<string, StageCostRow>();
  for (const s of scopedSends) {
    const stage = stageMap.get(s.stageId ?? '') ?? null;
    const key = s.stageId ?? '';
    const existing = byStage.get(key);
    const row: StageCostRow = {
      name: stage?.name ?? 'Unstaged',
      sequence: stage?.sequence ?? 999,
      dispatches: 1,
      sent: s.pcsSent || 0,
      received: 0,
      loss: s.lossQuantity || 0,
      pending: 0,
      billed: 0,
    };
    if (existing) {
      existing.dispatches += 1;
      existing.sent += row.sent;
      existing.loss += row.loss;
    } else {
      byStage.set(key, row);
    }
  }

  for (const r of scopedReceipts) {
    const stageId = r.stageId ?? '';
    const existing = byStage.get(stageId);
    const stage = stageMap.get(stageId);
    const row: StageCostRow = {
      name: stage?.name ?? 'Unstaged',
      sequence: stage?.sequence ?? 999,
      dispatches: 0,
      sent: 0,
      received: r.pcsReceived || 0,
      loss: 0,
      pending: 0,
      billed: r.billAmount || 0,
    };
    if (existing) {
      existing.received += row.received;
      existing.billed += row.billed;
    } else {
      byStage.set(stageId, row);
    }
  }

  const rows = [...byStage.values()].map(row => ({
    ...row,
    pending: Math.max(0, row.sent - row.received - row.loss),
  }));

  const liveRows = rows.filter(r => r.dispatches > 0 || r.billed > 0 || r.received > 0);
  liveRows.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));

  const totals: StageCostTotals = liveRows.reduce(
    (acc, r) => ({
      dispatches: acc.dispatches + r.dispatches,
      sent: acc.sent + r.sent,
      received: acc.received + r.received,
      loss: acc.loss + r.loss,
      pending: acc.pending + r.pending,
      billed: acc.billed + r.billed,
    }),
    { dispatches: 0, sent: 0, received: 0, loss: 0, pending: 0, billed: 0 },
  );

  return { rows: liveRows, totals };
}

/**
 * Full per-batch cost breakdown: purchase cost + per-stage processing cost.
 * Built on stageCostBreakdown so the numbers always agree.
 */
export interface BatchCostBreakdown {
  batchId: string;
  batchNo: string;
  purchaseCost: number;
  processingCost: number;
  purchaseCostPerPcs: number;
  totalCostPerPcs: number;
  lines: Array<{
    stageName: string;
    sequence: number;
    billAmount: number;
    pcsReceived: number;
    costPerPcs: number;
  }>;
}

const pcsOf = (n: number | undefined) => Math.max(0, n || 0);

export function batchCostBreakdown(
  batch: Batch,
  sends: ProcessingSend[],
  stages: ProcessingStage[],
  receipts: ProcessingReceipt[],
): BatchCostBreakdown {
  const { rows, totals } = stageCostBreakdown(sends, receipts, stages, batch.id);
  const purchaseCost = pcsOf(batch.amount);
  const finishedPcs = pcsOf(batch.processedPcs);
  const totalReceived = rows.reduce((s, l) => s + l.received, 0);

  return {
    batchId: batch.id,
    batchNo: batch.batchNo,
    purchaseCost,
    processingCost: totals.billed,
    purchaseCostPerPcs: pcsOf(batch.initialPcs) > 0 ? batch.amount / batch.initialPcs : 0,
    totalCostPerPcs:
      pcsOf(batch.initialPcs) > 0 ? (batch.amount + totals.billed) / batch.initialPcs : 0,
    lines: rows.map(l => ({
      stageName: l.name,
      sequence: l.sequence,
      billAmount: l.billed,
      pcsReceived: l.received,
      costPerPcs: l.received > 0 ? l.billed / l.received : 0,
    })),
  };
}

/**
 * Material-level roll-up of per-stage processing cost: every batch's stage
 * lines merged by stage, plus purchase/processing value totals.
 */
export interface MaterialCostSummary {
  materialId: string;
  purchaseCost: number;
  processingCost: number;
  finishedPcs: number;
  costPerFinishedPcs: number;
  lines: StageCostRow[];
}

export function materialCostSummary(
  batches: Batch[],
  sends: ProcessingSend[],
  stages: ProcessingStage[],
  receipts: ProcessingReceipt[],
): MaterialCostSummary {
  const byStage = new Map<string, StageCostRow>();
  let purchaseCost = 0;
  let finishedPcs = 0;

  for (const b of batches) {
    purchaseCost += pcsOf(b.amount);
    finishedPcs += pcsOf(b.processedPcs);
    const { rows } = stageCostBreakdown(sends, receipts, stages, b.id);
    for (const l of rows) {
      const existing = byStage.get(l.name);
      if (existing) {
        existing.dispatches += l.dispatches;
        existing.sent += l.sent;
        existing.received += l.received;
        existing.loss += l.loss;
        existing.billed += l.billed;
      } else {
        byStage.set(l.name, { ...l });
      }
    }
  }

  const lines = [...byStage.values()]
    .filter(r => r.dispatches > 0 || r.billed > 0 || r.received > 0)
    .sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  const finished = pcsOf(finishedPcs);

  return {
    materialId: batches[0]?.materialId || '',
    purchaseCost,
    processingCost: lines.reduce((s, l) => s + l.billed, 0),
    finishedPcs,
    costPerFinishedPcs: finished > 0 ? (purchaseCost + lines.reduce((s, l) => s + l.billed, 0)) / finished : 0,
    lines,
  };
}

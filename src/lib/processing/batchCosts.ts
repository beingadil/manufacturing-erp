import type { ProcessingReceipt, ProcessingSend, ProcessingStage } from '../../types/erp';

/**
 * Per-stage processing cost breakdown — the "where did the processor money
 * go" table for a material or a single purchase.
 *
 * Scope:
 *   - no `batchId` → every send for the material (material totals)
 *   - `batchId` → only sends for that purchase (purchase detail route)
 *
 * Cost attribution: `billAmount` sits on the RECEIPT (that is what the
 * processor invoices), so billed cost per stage = Σ billAmount of in-scope
 * receipts. Legacy receipts without a stageId fall back to their dispatch's
 * stage (same rule used by the timeline and reports). Rows whose stage cannot
 * be resolved — legacy seeds that predate stage tracking — land in a single
 * open, honestly named "Unstaged" line at the bottom, never silently dropped.
 */
export interface StageCostRow {
  stageId: string;
  name: string;
  sequence: number;
  isFinalStage: boolean;
  /** Dispatches recorded at this stage (in scope). */
  dispatches: number;
  sent: number;
  received: number;
  loss: number;
  pending: number;
  /** Σ receipts' billAmount attributed to this stage. */
  billed: number;
}

/** Legacy rows with no resolvable stageId — surfaced openly as their own line. */
export const UNSTAGED_STAGE_ID = '__unstaged__';

export interface StageCostTotals {
  dispatches: number;
  sent: number;
  received: number;
  loss: number;
  pending: number;
  billed: number;
}

function inScope(sends: ProcessingSend[], batchId?: string): ProcessingSend[] {
  return (batchId ? sends.filter(s => s.batchId === batchId) : sends)
    .filter(s => s.status !== 'Adjusted');
}

export function stageCostBreakdown(
  sends: ProcessingSend[],
  receipts: ProcessingReceipt[],
  stages: ProcessingStage[],
  batchId?: string,
): { rows: StageCostRow[]; totals: StageCostTotals } {
  const scopedSends = inScope(sends, batchId);
  const scopedSendIds = new Set(scopedSends.map(s => s.id));
  const scopedReceipts = receipts.filter(r => scopedSendIds.has(r.sendId));
  const stageIds = new Set(stages.map(s => s.id));

  const fallbackStageOf = new Map<string, string | undefined>();
  for (const s of scopedSends) fallbackStageOf.set(s.id, s.stageId);

  // Attribute every send and receipt to a known stage, or mark it unstaged.
  const sendStage = new Map<string, string | undefined>();
  for (const s of scopedSends) {
    sendStage.set(s.id, s.stageId && stageIds.has(s.stageId) ? s.stageId : UNSTAGED_STAGE_ID);
  }
  const receiptStage = new Map<string, string | undefined>();
  for (const r of scopedReceipts) {
    const sid = r.stageId ?? fallbackStageOf.get(r.sendId);
    receiptStage.set(r.id, sid && stageIds.has(sid) ? sid : UNSTAGED_STAGE_ID);
  }

  const rows: StageCostRow[] = [];
  const accumulate = (
    rowSends: ProcessingSend[],
    rowReceipts: ProcessingReceipt[],
  ): Omit<StageCostRow, 'stageId' | 'name' | 'sequence' | 'isFinalStage'> => {
    const sent = rowSends.reduce((sum, s) => sum + (s.pcsSent || 0), 0);
    const received = rowReceipts.reduce((sum, r) => sum + (r.pcsReceived || 0), 0);
    const loss = rowSends.reduce((sum, s) => sum + (s.lossQuantity || 0), 0);
    const billed = rowReceipts.reduce((sum, r) => sum + (r.billAmount || 0), 0);
    return {
      dispatches: rowSends.length,
      sent,
      received,
      loss,
      pending: Math.max(0, sent - received - loss),
      billed,
    };
  };

  for (const stage of [...stages].sort((a, b) => a.sequence - b.sequence)) {
    const sendsHere = scopedSends.filter(s => sendStage.get(s.id) === stage.id);
    const receiptsHere = scopedReceipts.filter(r => receiptStage.get(r.id) === stage.id);
    const agg = accumulate(sendsHere, receiptsHere);
    if (agg.dispatches > 0 || agg.billed > 0) {
      rows.push({
        stageId: stage.id,
        name: stage.name,
        sequence: stage.sequence,
        isFinalStage: !!stage.isFinalStage,
        ...agg,
      });
    }
  }

  // Legacy / stage-less activity: visible, clearly labelled, never hidden.
  const unstagedSends = scopedSends.filter(s => sendStage.get(s.id) === UNSTAGED_STAGE_ID);
  const unstagedReceipts = scopedReceipts.filter(r => receiptStage.get(r.id) === UNSTAGED_STAGE_ID);
  const unstagedAgg = accumulate(unstagedSends, unstagedReceipts);
  if (unstagedAgg.dispatches > 0 || unstagedAgg.billed > 0) {
    rows.push({
      stageId: UNSTAGED_STAGE_ID,
      name: 'Unstaged (before stage tracking)',
      sequence: Number.MAX_SAFE_INTEGER,
      isFinalStage: false,
      ...unstagedAgg,
    });
  }

  const totals = rows.reduce<StageCostTotals>(
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

  return { rows, totals };
}

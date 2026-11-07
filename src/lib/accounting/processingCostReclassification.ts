import type {
  Batch,
  ProcessingCostReclassification,
  ProcessingReceipt,
  ProcessorBill,
  RawMaterial,
} from '../../types/erp';
import { isManufacturingEnabled } from '../business/ManufacturingService';

/**
 * One-time capitalization of processing charges that the pre-v4 policy posted
 * to Processing Expense. The redesign capitalises processing at receipt, so the
 * ledger's Raw Material Inventory must carry the same cost basis the batch trail
 * already uses — otherwise a manufacturing order credits inventory with a
 * processing component the account was never debited for.
 *
 * The reclassification deliberately capitalises ONLY the portion still sitting
 * in on-hand pcs:
 *
 *   - sold / consumed pcs keep their historical expense (no COGS rewrite), and
 *   - the amount is capped by what was actually expensed on posted bills, so an
 *     unbilled receipt can never create a negative expense balance.
 *
 * It is a single forward journal (Dr Raw Material Inventory / Cr Processing
 * Expense), never an edit to a historical voucher.
 */

export interface ReclassificationState {
  stateSchemaVersion?: number;
  batches?: Batch[];
  processingReceipts?: ProcessingReceipt[];
  processorBills?: ProcessorBill[];
  materials?: RawMaterial[];
  processingCostReclassification?: ProcessingCostReclassification;
}

export interface ReclassificationLine {
  materialId: string;
  materialName: string;
  amount: number;
  onHandLegacyCost: number;
  expensedLegacyCost: number;
  batchCount: number;
}

export interface ReclassificationPreview {
  amount: number;
  batchCount: number;
  lines: ReclassificationLine[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Pcs of this batch that are still owned at any stage (raw, WIP, finished). */
export function onHandPcs(batch: Batch): number {
  const stagePcs = Object.values(batch.stageAvailableBySource || {}).reduce(
    (sum, pcs) => sum + Math.max(0, pcs || 0),
    0,
  );
  return (
    Math.max(0, batch.remainingPcs || 0)
    + Math.max(0, batch.atProcessorPcs || 0)
    + Math.max(0, batch.processedPcs || 0)
    + stagePcs
  );
}

const add = (map: Map<string, number>, key: string, value: number) => {
  map.set(key, round2((map.get(key) || 0) + value));
};

/**
 * How much historical processing expense is still embedded in inventory, per
 * material. Batches without the migration stamp fall back to their full
 * processingCost: before this feature existed every accumulated charge was
 * legacy (v4 receipts are already stamped on the receipt).
 */
export function previewProcessingCostReclassification(
  state: ReclassificationState,
): ReclassificationPreview {
  const empty: ReclassificationPreview = { amount: 0, batchCount: 0, lines: [] };
  if (!isManufacturingEnabled(state)) return empty;
  if (state.processingCostReclassification) return empty;

  const batches = state.batches || [];
  if (batches.length === 0) return empty;

  // 1. Processing expense actually posted by legacy bills, per material.
  const receipts = state.processingReceipts || [];
  const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));
  const expensedLegacy = new Map<string, number>();
  for (const bill of state.processorBills || []) {
    for (const receiptId of bill.receiptIds || []) {
      const receipt = receiptById.get(receiptId);
      if (!receipt) continue;
      // v4 receipts were capitalised at receipt; their bill only true-ups the
      // difference, so none of this amount is historical expense.
      if (receipt.accruedVoucherId || (receipt.accruedProcessingCost || 0) > 0) continue;
      const amount = Number(bill.lineAmounts?.[receiptId] ?? receipt.billAmount) || 0;
      if (amount > 0) add(expensedLegacy, receipt.materialId, amount);
    }
  }

  // 2. Legacy processing cost still attached to pcs on hand, per material.
  const onHandLegacy = new Map<string, number>();
  const batchCountByMaterial = new Map<string, number>();
  for (const batch of batches) {
    const legacy = Math.max(0, Number(batch.legacyProcessingCost ?? batch.processingCost) || 0);
    if (legacy <= 0 || !(batch.initialPcs > 0)) continue;
    const ratio = Math.min(1, onHandPcs(batch) / batch.initialPcs);
    const amount = round2(legacy * ratio);
    if (!(amount > 0)) continue;
    add(onHandLegacy, batch.materialId, amount);
    batchCountByMaterial.set(batch.materialId, (batchCountByMaterial.get(batch.materialId) || 0) + 1);
  }

  // 3. Never capitalise more than was expensed for that material.
  const lines: ReclassificationLine[] = [];
  for (const [materialId, onHandAmount] of onHandLegacy) {
    const expensed = expensedLegacy.get(materialId) || 0;
    const amount = round2(Math.min(onHandAmount, expensed));
    if (!(amount > 0)) continue;
    lines.push({
      materialId,
      materialName: (state.materials || []).find(material => material.id === materialId)?.name ?? 'Unknown material',
      amount,
      onHandLegacyCost: onHandAmount,
      expensedLegacyCost: round2(expensed),
      batchCount: batchCountByMaterial.get(materialId) || 0,
    });
  }

  lines.sort((a, b) => b.amount - a.amount || a.materialName.localeCompare(b.materialName));
  return {
    amount: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
    batchCount: lines.reduce((sum, line) => sum + line.batchCount, 0),
    lines,
  };
}

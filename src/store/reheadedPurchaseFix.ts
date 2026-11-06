import type { Batch, InventoryMovement } from '../types/erp';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';

/**
 * One-time data repair for purchase entries that were re-"headed" to a different
 * material before the fallback logic existed (editing the material on a saved
 * purchase used to update the purchase row but leave the batch on the OLD
 * material, so stock re-derived against the wrong material and the new one
 * showed nothing).
 *
 * Repairs, idempotently:
 *  1. Batch material head  → moved onto the purchase's chosen material.
 *  2. Batch supplier head  → moved onto the purchase's current supplier
 *     (editing the purchase's supplier never reached the batch, so the
 *     Batches table on the material detail page showed the old supplier).
 *  3. Purchase movement quantity → set to the purchase's calculated pieces.
 *     Legacy rows logged a unit-less quantity (e.g. 20 / 14) that
 *     contradicted the purchase they belong to.
 *  4. Movement running balance → recomputed for every material touched by
 *     (1)/(2)/(3), replaying the ledger (IN adds, OUT subtracts) so the
 *     detail page's Movement Ledger never contradicts its own rows.
 *
 * Policy (user-confirmed):
 *  • Handle / Kalsii lots (ready-made) keep their ready-made status — only
 *    the head changes; they stay in the finished pool of the new material.
 *  • Everything else (Circle etc.) lands in RAW stock of the new material —
 *    every unmatched lot in practice was never dispatched, so raw is correct.
 *  • A mismatch whose batch HAS reached the processor pipeline is SKIPPED,
 *    never silently migrated — deleting processor history requires an explicit,
 *    confirmed action (see the purchase edit fallback).
 *
 * PURE + IDEMPOTENT: runs on every startup rehydration. After the first run
 * each purchase matches its batch, so it no-ops forever after.
 */
export interface ReheadedPurchaseFixReport {
  /** Batches moved onto the purchase's chosen material (head correction). */
  batchesRehead: number;
  /** Batches moved onto the purchase's current supplier. */
  supplierSynced: number;
  /** Purchase movements whose quantity did not match the purchase — repaired. */
  movementsRepaired: number;
  /** Materials whose movement running balance was replayed. */
  balancesReplayed: number;
  /** Mismatches skipped because the batch entered the processor pipeline. */
  pipelineSkipped: number;
  /** Mismatch whose target material no longer exists — skipped. */
  missingMaterial: number;
}

export interface ReheadedPurchaseFixResult {
  state: any;
  report: ReheadedPurchaseFixReport;
}

export function fixReheadedPurchases(state: any): ReheadedPurchaseFixResult {
  const report: ReheadedPurchaseFixReport = {
    batchesRehead: 0,
    supplierSynced: 0,
    movementsRepaired: 0,
    balancesReplayed: 0,
    pipelineSkipped: 0,
    missingMaterial: 0,
  };

  const materials: any[] = state.materials ?? [];
  const purchases: any[] = state.purchases ?? [];
  const batches: Batch[] = state.batches ?? [];
  const sends: any[] = state.processingSends ?? [];
  const movements: InventoryMovement[] = state.inventoryMovements ?? [];

  if (purchases.length === 0 || batches.length === 0) {
    return { state, report };
  }

  const sendBatchIds = new Set(sends.map(s => s?.batchId).filter(Boolean));
  const materialIds = new Set(materials.map(m => m?.id));
  const batchByPurchaseId = new Map(batches.map(b => [b?.purchaseId, b]));
  const purchaseByNo = new Map(purchases.map(p => [p?.purchaseNo, p]));

  const reheads = new Map<string, string>(); // batchId → new materialId
  for (const p of purchases) {
    const b = batchByPurchaseId.get(p?.id);
    if (!b) continue; // purchase without a batch — an old, harmless shape
    if (b.materialId === p?.materialId) continue; // head already matches
    if (!materialIds.has(p?.materialId)) {
      report.missingMaterial += 1;
      continue;
    }
    if (sendBatchIds.has(b.id)) {
      report.pipelineSkipped += 1;
      continue;
    }
    reheads.set(b.id, p.materialId);
  }

  // (1) Move the batches onto the chosen heads. Quantities are NOT touched —
  //     these lots were never dispatched, so their raw/finished split is
  //     already correct; only the head changes. (A ready-made batch reports
  //     raw 0 via remainingPcs being 0 anyway, so keeping its counts is
  //     enough for the roll-up.)
  const touchedMaterials = new Set<string>();
  const batchesAfter: Batch[] = batches.map(b => {
    const newId = reheads.get(b.id);
    if (!newId) return b;
    touchedMaterials.add(newId);
    return {
      ...b,
      materialId: newId,
      stageAvailableBySource: {},
      atProcessorPcs: 0,
      processingCost: 0,
      currentStageId: undefined,
    };
  });

  // Re-attribute the purchase's inventory movements to the head the user
  // chose — by batchId where it exists, else by the purchase's reference no.
  const purchaseNoToMaterial = new Map<string, string>();
  for (const b of batches) {
    const newId = reheads.get(b.id);
    if (!newId) continue;
    const p = purchases.find(x => x?.id === b.purchaseId);
    if (p?.purchaseNo) purchaseNoToMaterial.set(p.purchaseNo, newId);
  }
  const batchToMaterial = new Map(reheads);
  const movementsAfter: InventoryMovement[] = movements.map(im => {
    const byBatch = im?.batchId ? batchToMaterial.get(im.batchId) : undefined;
    const byReference = im?.referenceNo ? purchaseNoToMaterial.get(im.referenceNo) : undefined;
    const target = byBatch ?? byReference;
    return target ? { ...im, materialId: target } : im;
  });

  // (2) Supplier sync — the batch's supplier follows the purchase's current
  //     supplier (editing the purchase never propagated it).
  const purchaseById = new Map<string, any>(purchases.map(p => [p?.id, p]));
  const batchesSupplierSynced = batchesAfter.map(b => {
    const p = purchaseById.get(b?.purchaseId);
    if (p && b.supplierId !== p.supplierId) {
      touchedMaterials.add(b.materialId);
      return { ...b, supplierId: p.supplierId };
    }
    return b;
  });

  // (3) Purchase movement quantity — must equal the purchase it documents.
  const movementsQtyRepaired = movementsAfter.map(im => {
    if (im?.module !== 'Purchase') return im;
    const p = purchaseByNo.get(im?.referenceNo);
    if (!p) return im;
    const expected = Number(p.calculatedPcs) || 0;
    if (Number(im.quantity) !== expected) {
      touchedMaterials.add(im.materialId);
      return { ...im, quantity: expected };
    }
    return im;
  });

  // (4) Balance replay for every material touched — IN adds, OUT subtracts,
  //     IN before OUT on the same date, by id for ties.
  const byMaterial = new Map<string, InventoryMovement[]>();
  for (const im of movementsQtyRepaired) {
    const list = byMaterial.get(im.materialId) ?? [];
    list.push(im);
    byMaterial.set(im.materialId, list);
  }
  const balanceOf = new Map<string, number>();
  for (const [materialId, list] of byMaterial) {
    if (!touchedMaterials.has(materialId)) continue;
    list.sort((a, b) => {
      const d = String(a?.date ?? '').localeCompare(String(b?.date ?? ''));
      if (d !== 0) return d;
      const typeRank = (x: InventoryMovement) => (x?.transactionType === 'IN' ? 0 : 1);
      const r = typeRank(a) - typeRank(b);
      if (r !== 0) return r;
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });
    let balance = 0;
    for (const im of list) {
      const qty = Number(im?.quantity) || 0;
      balance += im?.transactionType === 'IN' ? qty : -qty;
      balanceOf.set(im.id, balance);
    }
  }
  const movementsFinal = movementsQtyRepaired.map(im => {
    const b = balanceOf.get(im.id);
    return b === undefined || b === im.runningBalance ? im : { ...im, runningBalance: b };
  });
  report.balancesReplayed = [...byMaterial.keys()].filter(m => touchedMaterials.has(m)).length;

  report.batchesRehead = reheads.size;
  report.supplierSynced = batchesSupplierSynced.filter((b, i) => b !== batchesAfter[i]).length;
  report.movementsRepaired = movementsQtyRepaired.filter((im, i) => im !== movementsAfter[i]).length;

  // Re-derive EVERY material's counters from the rebuilt trail — raw stock,
  // at-processor and finished can never drift, whatever the history looks like.
  const materialsAfter = InventoryCalculationService.syncMaterialCounters(materials, batchesSupplierSynced);

  return {
    state: {
      ...state,
      batches: batchesSupplierSynced,
      materials: materialsAfter,
      inventoryMovements: movementsFinal,
    },
    report,
  };
}

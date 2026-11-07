import { v4 as uuidv4 } from 'uuid';
import { StoreApi } from 'zustand';
import { getSystemAccountBySubtype, getSystemCOGSAccount, getSystemInventoryAccount } from '../lib/accounting/accountClassification';
import {
  buildManufacturedSale,
  buildProcessorBill,
  buildReceiptAccrual,
  postingTotal,
} from '../lib/accounting/manufacturingPosting';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import {
  consumeLotsFIFO,
  isManufacturingEnabled,
  restoreLotAllocations,
} from '../lib/business/ManufacturingService';
import { consumeComponentStock, isAssembled, perUnitRequirement, restoreComponentStock, roundQty } from '../lib/business/ProductAssemblyService';
import { UnitConversionService } from '../lib/business/UnitConversionService';
import { AppError } from '../lib/errorHandler';
import type { Batch, InventoryMovement, JournalEntry, ProcessingReceipt, ProcessingSend, Product, RawMaterial, Sale, Voucher } from '../types/erp';
import { ERPState } from './useERPStore';

/**
 * A completed manufacturing order freezes the cost and quantity of every batch
 * it drew from. Changing or deleting that stock afterwards would silently
 * rewrite a posted cost, so destructive paths that touch such a batch are
 * refused with a clear instruction instead.
 */
function assertBatchesNotConsumedByManufacturing(
  state: ERPState,
  batchIds: Iterable<string | undefined>,
  action: string,
): void {
  const ids = new Set([...batchIds].filter((id): id is string => !!id));
  if (ids.size === 0) return;
  for (const order of state.manufacturingOrders || []) {
    if (order.status !== 'Completed') continue;
    const hit = (order.consumptions || []).find(c => ids.has(c.batchId));
    if (hit) {
      throw new AppError(
        `This ${action} would change stock that completed manufacturing order ${order.orderNo} already consumed. ` +
        'Completed manufacturing costs are immutable — record a new purchase or reverse the order before editing this batch.',
      );
    }
  }
}

/**
 * Material-level guard for processing edits that cannot name a single batch
 * (legacy dispatches/receipts created without one). If any completed MO drew
 * this material, the replay could shrink stock below what the MO consumed.
 */
function assertMaterialNotConsumedByManufacturing(
  state: ERPState,
  materialId: string | undefined,
  action: string,
): void {
  if (!materialId) return;
  for (const order of state.manufacturingOrders || []) {
    if (order.status !== 'Completed') continue;
    if ((order.consumptions || []).some(c => c.materialId === materialId)) {
      throw new AppError(
        `This ${action} would replay stock for a material already consumed by completed manufacturing order ${order.orderNo}. ` +
        'Completed manufacturing costs are immutable.',
      );
    }
  }
}

/**
 * Rebuild a processing bill's voucher after its receipts or total changed.
 * Legacy bills keep the old two-leg shape; v4 bills clear the receipt accrual
 * and post only the true-up difference to Processing Expense.
 */
function rebuildProcessingBillVoucher(
  state: ERPState,
  bill: { id: string; billNo: string; date: string; processorId: string; receiptIds: string[]; totalAmount: number },
  receipts: ProcessingReceipt[],
  vouchers: Voucher[],
  entries: JournalEntry[],
): { vouchers: Voucher[]; journalEntries: JournalEntry[] } {
  const voucher = vouchers.find(v => v.sourceId === bill.id && v.sourceModule === 'Processing');
  if (!voucher) return { vouchers, journalEntries: entries };

  const payableAccount = state.accounts.find(a => a.linkedEntityId === bill.processorId)
    || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Payable');

  if (isManufacturingEnabled(state)) {
    const accruedTotal = bill.receiptIds.reduce((sum, rid) => {
      const receipt = receipts.find(r => r.id === rid);
      return sum + Math.max(0, Number(receipt?.accruedProcessingCost) || 0);
    }, 0);
    const posting = buildProcessorBill(
      state.accounts,
      state.accountSubtypes,
      payableAccount,
      bill.totalAmount,
      accruedTotal,
      `Processing Bill ${bill.billNo}`,
    );
    const total = postingTotal(posting);
    const existing = entries.filter(je => je.voucherId === voucher.id);
    return {
      vouchers: vouchers.map(v =>
        v.id === voucher.id ? { ...v, date: bill.date, totalDebit: total, totalCredit: total } : v
      ),
      journalEntries: [
        ...entries.filter(je => je.voucherId !== voucher.id),
        ...posting.map(line => {
          const match = existing.find(e => e.accountId === line.accountId);
          return {
            id: match?.id || uuidv4(),
            voucherId: voucher.id,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            narration: line.narration,
          };
        }),
      ],
    };
  }

  return {
    vouchers: vouchers.map(v =>
      v.id === voucher.id ? { ...v, date: bill.date, totalDebit: bill.totalAmount, totalCredit: bill.totalAmount } : v
    ),
    journalEntries: entries.map(je =>
      je.voucherId === voucher.id
        ? { ...je, debit: je.debit > 0 ? bill.totalAmount : 0, credit: je.credit > 0 ? bill.totalAmount : 0 }
        : je
    ),
  };
}

/**
 * Rebuild one material's batch trail from the authoritative history, using the
 * store's stage master (stage-aware FIFO replay — only stage-1/legacy sends
 * draw raw, only final-stage/legacy receipts produce finished, recorded losses
 * shrink WIP). The returned batches are the single source of truth; callers
 * then re-derive material counters via syncMaterialCounters.
 */
function applyBatchReplayForMaterial(
  materialId: string,
  state: ERPState,
  sends: ProcessingSend[],
  receipts: ProcessingReceipt[],
  sales: Sale[],
  products: Product[]
): Batch[] {
  return InventoryCalculationService.recomputeFinishedPcsForMaterial(
    materialId,
    state.batches || [],
    receipts,
    sends,
    sales,
    products,
    undefined,
    state.processingStages || [],
    undefined,
    state.manufacturingOrders || []
  );
}

/**
 * Fallback for a purchase whose MATERIAL is being changed ("re-headed").
 *
 * Rules:
 *  1. The lot never entered the processor pipeline → it moves into raw stock
 *     (or the finished pool, for a ready-made target material) under the NEW
 *     material. No processor entries exist, so nothing is deleted.
 *  2. The lot DID go through the processor pipeline → the change is refused
 *     until the caller confirms. Confirming deletes this purchase's dispatches
 *     and their receipts, unwinds their stock effects, and puts the lot back
 *     into raw stock of the NEW material — it has to go through the
 *     processors again.
 *
 * The change is always refused (even confirmed) when a processor bill covers
 * any receipt that would be deleted — bills are accounting documents and must
 * be removed by the user first — and when one of this batch's dispatches was
 * flagged 'Adjusted' (its pieces were merged into another dispatch).
 */
function materialChangeFallback(
  state: ERPState,
  id: string,
  purchaseData: any,
  oldPurchase: any,
  oldBatch: Batch | undefined,
  oldMaterialId: string,
  newMaterialId: string,
  newPath: string,
  newMaterial: RawMaterial | undefined,
  newCalculatedPcs: number,
  newAmount: number,
  readyNow: boolean,
  confirmDeletion: boolean
): ERPState {
  const purchaseNo = oldPurchase.purchaseNo;
  const stages = state.processingStages ?? [];
  const sendsForBatch = oldBatch
    ? (state.processingSends ?? []).filter(s => s.batchId === oldBatch.id)
    : [];
  const sendIds = new Set(sendsForBatch.map(s => s.id));
  const receiptsToDelete = (state.processingReceipts ?? []).filter(r => sendIds.has(r.sendId));
  const batchBuckets = oldBatch?.stageAvailableBySource ?? {};
  // Ready-made lots are finished at birth — a ready-made batch's processedPcs
  // is NOT processor history. History means: dispatches for this batch, pcs
  // currently at a processor, or stage availability buckets from receipts.
  const inPipeline =
    sendsForBatch.length > 0 ||
    (oldBatch?.atProcessorPcs ?? 0) > 0 ||
    Object.values(batchBuckets).some(v => (v ?? 0) > 0);

  if (inPipeline) {
    const adjusted = sendsForBatch.find(s => s.status === 'Adjusted');
    if (adjusted) {
      throw new AppError(`This batch was merged into another dispatch (${adjusted.dispatchNo}). Undo that dispatch before changing the material.`);
    }
    const billed = (state.processorBills ?? []).find(b =>
      b.receiptIds.some(rid => receiptsToDelete.some(r => r.id === rid))
    );
    if (billed) {
      throw new AppError(`Receipts from this purchase are covered by processor bill ${billed.billNo}. Delete that bill before changing the material.`);
    }
    if (!confirmDeletion) {
      throw new AppError('This purchase went through a processor. Confirm the change to delete its processor entries.');
    }
  }

  // Purchase row (confirmProcessorEntryDeletion is already stripped by the caller)
  const updatedPurchases = state.purchases.map(p =>
    p.id === id ? { ...p, ...purchaseData, materialId: newMaterialId, calculatedPcs: newCalculatedPcs, amount: newAmount } : p
  );

  // Move the batch onto the new material, reset to a clean raw (or finished,
  // for ready-made) state.
  let trail: Batch[] = state.batches ?? [];
  if (oldBatch) {
    const reset: Batch = {
      ...oldBatch,
      materialId: newMaterialId,
      supplierId: purchaseData.supplierId ?? oldBatch.supplierId,
      weight: purchaseData.weight,
      weightUnit: purchaseData.weightUnit,
      ratePerUnit: purchaseData.ratePerUnit,
      weightPerPiece: purchaseData.weightPerPiece,
      processingPath: newPath as Batch['processingPath'],
      fixedStageId: newMaterial?.fixedStageId,
      allowedStageIds: newMaterial?.allowedStageIds,
      initialPcs: newCalculatedPcs,
      remainingPcs: newPath === 'ready_made' ? 0 : newCalculatedPcs,
      processedPcs: newPath === 'ready_made' ? newCalculatedPcs : 0,
      atProcessorPcs: 0,
      processingCost: 0,
      stageAvailableBySource: {},
      currentStageId: undefined,
      status: 'Active',
      amount: newAmount,
    };
    trail = trail.map(b => (b.id === reset.id ? reset : b));
  }

  // Pipeline case: delete this batch's dispatches + receipts and replay both
  // materials from the remaining history so every counter re-derives.
  let remainingSends = state.processingSends ?? [];
  let remainingReceipts = state.processingReceipts ?? [];
  let removedReferenceNos: string[] = [];
  if (inPipeline) {
    remainingSends = remainingSends.filter(s => !sendIds.has(s.id));
    remainingReceipts = remainingReceipts.filter(r => !receiptsToDelete.some(x => x.id === r.id));
    removedReferenceNos = [
      ...sendsForBatch.map(s => s.dispatchNo),
      ...receiptsToDelete.map(r => r.receiveNo),
    ];
    trail = InventoryCalculationService.recomputeFinishedPcsForMaterial(
      oldMaterialId, trail, remainingReceipts, remainingSends,
      state.sales ?? [], state.products ?? [], undefined, stages,
      undefined, state.manufacturingOrders ?? []
    );
    trail = InventoryCalculationService.recomputeFinishedPcsForMaterial(
      newMaterialId, trail, remainingReceipts, remainingSends,
      state.sales ?? [], state.products ?? [], undefined, stages,
      undefined, state.manufacturingOrders ?? []
    );
  }

  const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, trail);

  // Inventory movements: drop the deleted pipeline entries' movements, and
  // re-attribute the purchase movement to the new material.
  const removedSet = new Set(removedReferenceNos);
  const updatedInventoryMovements = (state.inventoryMovements ?? [])
    .filter(im => !removedSet.has(im.referenceNo))
    .map(im =>
      im.referenceNo === purchaseNo || (oldBatch && im.batchId === oldBatch.id)
        ? { ...im, materialId: newMaterialId }
        : im
    );

  // Voucher + JEs narration (same math as the ordinary path)
  const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Purchase');
  let updatedVouchers = state.vouchers;
  let updatedJournalEntries = state.journalEntries;
  if (voucher) {
    updatedVouchers = state.vouchers.map(v =>
      v.id === voucher.id
        ? {
            ...v,
            totalDebit: newAmount,
            totalCredit: newAmount,
            narration: readyNow
              ? `Ready-made purchase: ${newCalculatedPcs} PCS from Supplier`
              : `Purchase of ${purchaseData.weight} ${purchaseData.weightUnit} from Supplier`,
          }
        : v
    );
    updatedJournalEntries = state.journalEntries.map(je =>
      je.voucherId === voucher.id
        ? { ...je, debit: je.debit > 0 ? newAmount : 0, credit: je.credit > 0 ? newAmount : 0 }
        : je
    );
  }

  return {
    ...state,
    purchases: updatedPurchases,
    batches: trail,
    materials: updatedMaterials,
    inventoryMovements: updatedInventoryMovements,
    processingSends: remainingSends,
    processingReceipts: remainingReceipts,
    vouchers: updatedVouchers,
    journalEntries: updatedJournalEntries,
  };
}

/**
 * NOTE: this module deliberately does NOT import AccountingEngine (that would
 * create a static import cycle: crudActions → AccountingEngine → useERPStore →
 * crudActions, which crashes in isolated entry points). Instead the store wires
 * a recompute callback — AccountingEngine.recomputePartyBalances() — as the
 * third argument, so party balances are always re-derived from the COMPLETE
 * ledger after every mutation (spec §14).
 */
export const createCRUDActions = (
  set: StoreApi<ERPState>['setState'],
  _get: StoreApi<ERPState>['getState'],
  afterMutation?: () => void
) => ({
  deletePurchase: (id: string) => {
    set((state) => {
      const purchase = state.purchases.find(p => p.id === id);
      if (!purchase) return state;

      // 1. Remove associated batch
      const batch = state.batches.find(b => b.purchaseId === id);
      const batchId = batch?.id;
      if (batch) {
        assertBatchesNotConsumedByManufacturing(state, [batch.id], 'purchase deletion');
      }
      
      // 2. Reduce material stock — ready-made purchases landed in the
      // FINISHED pool, so the reversal must come from the same pool.
      const wasReadyMade = (batch?.processingPath ?? 'full_chain') === 'ready_made';
      let updatedMaterials = state.materials;
      if (batch) {
        updatedMaterials = state.materials.map(m => 
          m.id === purchase.materialId 
            ? wasReadyMade
              ? { ...m, processedStockPcs: Math.max(0, (m.processedStockPcs || 0) - batch.initialPcs) }
              : { ...m, stockPcs: m.stockPcs - batch.initialPcs }
            : m
        );
      }

      // 3. Remove inventory movement for this batch/purchase
      const updatedInventoryMovements = state.inventoryMovements.filter(im => 
        im.referenceNo !== purchase.purchaseNo && im.batchId !== batchId
      );

      // 4. NOTE: the supplier's balancePayable is derived from the linked
      //    account's COMPLETE ledger via the afterMutation callback (the store
      //    wires AccountingEngine.recomputePartyBalances) — never decremented
      //    here (spec §14).

      // 5. Remove associated voucher and journal entries
      const voucher = state.vouchers.find(v => v.sourceId === purchase.id && v.sourceModule === 'Purchase');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      return {
        ...state,
        purchases: state.purchases.filter(p => p.id !== id),
        batches: state.batches.filter(b => b.purchaseId !== id),
        materials: updatedMaterials,
        inventoryMovements: updatedInventoryMovements,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },

  updatePurchase: (id: string, data: any) => {
    // A robust way to update a transaction is to reverse the old one, and apply the new one.
    // However, since we might want to keep the same IDs (like voucherNo, purchaseNo),
    // it's cleaner to calculate diffs and apply them.
    // For simplicity, we'll update the fields directly and adjust balances by the diff.
    set((state) => {
      const oldPurchase = state.purchases.find(p => p.id === id);
      if (!oldPurchase) return state;

      // ── Material change ("re-head" the purchase) — fallback rules:
      //   • Batch never reached a processor → the whole lot moves into raw
      //     stock of the NEW material (automatic, no ceremony).
      //   • Batch already went through the processor pipeline → the change is
      //     REFUSED unless the caller passes confirmProcessorEntryDeletion:true.
      //     The confirmation deletes this batch's dispatches/receipts and falls
      //     the lot back to raw stock of the NEW material — it has to go
      //     through the processors again.
      const oldMaterialId = oldPurchase.materialId;
      const newMaterialId = (data?.materialId !== undefined ? data.materialId : oldMaterialId) as string;
      const materialChanged = newMaterialId !== oldMaterialId;
      const newMaterial = materialChanged ? state.materials.find(m => m.id === newMaterialId) : undefined;
      if (materialChanged && !newMaterial) {
        throw new AppError('Choose a valid material before saving.');
      }
      const newPath = newMaterial?.processingPath ?? 'full_chain';
      const { confirmProcessorEntryDeletion, ...purchaseData } = data ?? {};

      // Ready-made purchases keep their direct-pcs entry mode (pcs × rate/pc);
      // everything else derives pcs from weight ÷ weightPerPiece. When the
      // material is being changed, the NEW material's path decides the pool
      // the pcs land in, so the two stay consistent with the UI line model.
      const oldBatch = state.batches.find(b => b.purchaseId === id);
      const wasReadyMade = (oldBatch?.processingPath ?? 'full_chain') === 'ready_made';
      const readyNow = materialChanged ? newPath === 'ready_made' : wasReadyMade;
      const newCalculatedPcs = readyNow && purchaseData.directPcs
        ? Math.max(0, Math.round(purchaseData.directPcs))
        : UnitConversionService.calculatePcsFromWeight(purchaseData.weight, purchaseData.weightUnit, purchaseData.weightPerPiece);
      const newAmount = readyNow && purchaseData.directPcs
        ? Math.round(purchaseData.directPcs) * purchaseData.ratePerUnit
        : purchaseData.weight * purchaseData.ratePerUnit;

      const diffPcs = newCalculatedPcs - oldPurchase.calculatedPcs;

      // Completed manufacturing orders freeze the lots they consumed. A
      // material change or a quantity reduction would rewrite that trail, so
      // it is refused before any mutation happens.
      const quantityEdited = purchaseData.weight !== undefined || purchaseData.directPcs !== undefined;
      if (oldBatch && (materialChanged || (quantityEdited && newCalculatedPcs < (oldBatch.initialPcs || 0)))) {
        assertBatchesNotConsumedByManufacturing(
          state,
          [oldBatch.id],
          materialChanged ? 'material change' : 'quantity reduction',
        );
      }

      if (materialChanged) {
        return materialChangeFallback(
          state, id, purchaseData, oldPurchase, oldBatch,
          oldMaterialId, newMaterialId, newPath, newMaterial,
          newCalculatedPcs, newAmount, readyNow, confirmProcessorEntryDeletion === true
        );
      }

      // Update Purchase
      const updatedPurchases = state.purchases.map(p => 
        p.id === id ? { ...p, ...purchaseData, calculatedPcs: newCalculatedPcs, amount: newAmount } : p
      );

      // Update Batch — supplier follows the purchase (editing the purchase's
      // supplier used to leave the batch on the old one).
      let updatedBatches = state.batches;
      const nextSupplierId = purchaseData.supplierId ?? oldPurchase.supplierId;
      if (oldBatch) {
        updatedBatches = state.batches.map(b => 
          b.id === oldBatch.id 
            ? { ...b, weight: purchaseData.weight, weightUnit: purchaseData.weightUnit, ratePerUnit: purchaseData.ratePerUnit, weightPerPiece: purchaseData.weightPerPiece, initialPcs: newCalculatedPcs, remainingPcs: b.remainingPcs + diffPcs, amount: newAmount, supplierId: nextSupplierId } 
            : b
        );
      }

      // Update Material stock — ready-made pcs live in the FINISHED pool.
      const updatedMaterials = state.materials.map(m => 
        m.id === oldPurchase.materialId 
          ? readyNow
            ? { ...m, processedStockPcs: Math.max(0, (m.processedStockPcs || 0) + diffPcs) }
            : { ...m, stockPcs: m.stockPcs + diffPcs }
          : m
      );

      // NOTE: the supplier's balancePayable is derived from the linked account's
      // COMPLETE ledger via the afterMutation callback — never adjusted here (spec §14).

      // Update Voucher and JEs
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Purchase');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.map(v => 
          v.id === voucher.id
            ? {
                ...v,
                totalDebit: newAmount,
                totalCredit: newAmount,
                narration: readyNow
                  ? `Ready-made purchase: ${newCalculatedPcs} PCS from Supplier`
                  : `Purchase of ${data.weight} ${data.weightUnit} from Supplier`,
              }
            : v
        );
        updatedJournalEntries = state.journalEntries.map(je => 
          je.voucherId === voucher.id 
            ? { ...je, debit: je.debit > 0 ? newAmount : 0, credit: je.credit > 0 ? newAmount : 0 }
            : je
        );
      }

      return {
        ...state,
        purchases: updatedPurchases,
        batches: updatedBatches,
        materials: updatedMaterials,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },

  deleteSale: (id: string) => {
    set((state) => {
      const sale = state.sales.find(s => s.id === id);
      if (!sale) return state;

      // Manufacturing v4: the sale was fulfilled from finished-goods lots, so
      // deleting it hands exactly those lot quantities back. Material batches
      // are untouched — a manufactured sale never consumed them.
      if (sale.stockModelAtSale === 'manufactured') {
        const saleVoucherIds = new Set(
          state.vouchers
            .filter(v => v.sourceId === id && v.sourceModule === 'Sales')
            .map(v => v.id),
        );
        return {
          ...state,
          sales: state.sales.filter(s => s.id !== id),
          finishedGoodsLots: restoreLotAllocations(state.finishedGoodsLots || [], sale.lotAllocations),
          inventoryMovements: (state.inventoryMovements || []).filter(im =>
            !(im.referenceNo === sale.invoiceNo && im.module === 'Sale' && im.productId === sale.productId)
          ),
          vouchers: state.vouchers.filter(v => !saleVoucherIds.has(v.id)),
          journalEntries: state.journalEntries.filter(je => !saleVoucherIds.has(je.voucherId)),
        };
      }

      const product = state.products.find(p => p.id === sale.productId);

      // NOTE: the customer's balanceReceivable is derived from the linked
      // account's COMPLETE ledger via the afterMutation callback — never
      // decremented here (spec §14).

      // Remove inventory movement
      const updatedInventoryMovements = state.inventoryMovements.filter(im => im.referenceNo !== sale.invoiceNo);

      // A product made from several materials was FULFILLED at the point of
      // sale: its parts came off RAW stock, and the product itself holds no
      // stock to rebuild. Deleting the sale must therefore hand those raw
      // pieces back, or the parts stay consumed forever. (A single-material
      // product keeps the finished-pcs replay below, unchanged.)
      if (product && isAssembled(product)) {
        let restored = state.batches;
        for (const [materialId, perUnitQty] of perUnitRequirement(product)) {
          restored = restoreComponentStock(restored, materialId, roundQty(perUnitQty * sale.pcsSold));
        }
        return {
          ...state,
          sales: state.sales.filter(s => s.id !== id),
          materials: InventoryCalculationService.syncMaterialCounters(state.materials, restored),
          batches: restored,
          inventoryMovements: updatedInventoryMovements,
          vouchers: state.vouchers.filter(v => !(v.sourceId === id && v.sourceModule === 'Sales')),
          journalEntries: state.journalEntries.filter(je => {
            const v = state.vouchers.find(x => x.id === je.voucherId);
            return !(v && v.sourceId === id && v.sourceModule === 'Sales');
          }),
        };
      }

      // Restore the finished pcs this sale consumed (FIFO) back onto batches
      // (stage-aware replay), then re-derive the material counters from the
      // rebuilt trail so they can never drift.
      let updatedBatches = state.batches;
      if (product?.materialId) {
        updatedBatches = InventoryCalculationService.recomputeFinishedPcsForMaterial(
          product.materialId,
          state.batches || [],
          state.processingReceipts || [],
          state.processingSends || [],
          state.sales || [],
          state.products || [],
          id,
          state.processingStages || [],
          undefined,
          state.manufacturingOrders || []
        );
      }
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      // Remove voucher and JEs
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      return {
        ...state,
        sales: state.sales.filter(s => s.id !== id),
        materials: updatedMaterials,
        batches: updatedBatches,
        inventoryMovements: updatedInventoryMovements,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },

  updateSale: (id: string, data: any) => {
    set((state) => {
      const oldSale = state.sales.find(s => s.id === id);
      if (!oldSale) return state;

      // Manufacturing v4: a manufactured sale consumed specific FG lots. An
      // edit returns the old allocations first, then draws the new product /
      // quantity FIFO — so changing 5 → 8 never double-deducts and changing
      // the product releases the abandoned product's stock.
      if (oldSale.stockModelAtSale === 'manufactured') {
        const newProductId = data.productId ?? oldSale.productId;
        const product = state.products.find(p => p.id === newProductId);
        if (!product) throw new AppError('Choose a valid product before saving the sale.');

        const newPcsSold = data.pcsSold !== undefined ? Math.round(Number(data.pcsSold)) : oldSale.pcsSold;
        const newPricePerPiece = data.pricePerPiece !== undefined
          ? Number(data.pricePerPiece)
          : oldSale.pricePerPiece;
        if (!Number.isFinite(newPcsSold) || newPcsSold <= 0) {
          throw new AppError('Quantity sold must be a whole number greater than zero.');
        }
        if (!(newPricePerPiece > 0)) {
          throw new AppError('Price per piece must be greater than zero.');
        }
        const newDate = data.date ?? oldSale.date;
        const newTotalAmount = roundQty(newPcsSold * newPricePerPiece);

        let lots = restoreLotAllocations(state.finishedGoodsLots || [], oldSale.lotAllocations);
        const consumed = consumeLotsFIFO(lots, newProductId, newPcsSold);
        if (consumed.shortage) {
          throw new AppError(
            `Not enough finished stock for ${product.name}: need ${consumed.shortage.required} PCS ` +
            `but only ${consumed.shortage.available} are in finished-goods lots.`,
          );
        }
        lots = consumed.lots;

        const updatedSale: Sale = {
          ...oldSale,
          ...data,
          productId: newProductId,
          date: newDate,
          pcsSold: newPcsSold,
          pricePerPiece: newPricePerPiece,
          totalAmount: newTotalAmount,
          lotAllocations: consumed.allocations,
          cogsAmount: consumed.cogs,
          stockModelAtSale: 'manufactured',
        };
        const updatedSales = state.sales.map(s => (s.id === id ? updatedSale : s));

        const remaining = lots
          .filter(l => l.productId === newProductId)
          .reduce((sum, l) => sum + (l.pcsRemaining || 0), 0);
        const updatedInventoryMovements = [
          {
            id: uuidv4(),
            materialId: product.materialId || '',
            productId: product.id,
            date: newDate,
            referenceNo: oldSale.invoiceNo,
            module: 'Sale' as const,
            transactionType: 'OUT' as const,
            quantity: newPcsSold,
            runningBalance: remaining,
            remarks: `Sold as finished goods: ${product.name}`,
          },
          ...(state.inventoryMovements || []).filter(im =>
            !(im.referenceNo === oldSale.invoiceNo && im.module === 'Sale' && im.productId === oldSale.productId)
          ),
        ];

        const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;
        if (voucher) {
          const posting = buildManufacturedSale(
            state.accounts,
            state.accountSubtypes,
            data.customerId ?? oldSale.customerId,
            newTotalAmount,
            consumed.cogs,
            `Sale ${oldSale.invoiceNo} — ${newPcsSold} × ${product.name}`,
          );
          const total = postingTotal(posting);
          updatedVouchers = state.vouchers.map(v =>
            v.id === voucher.id
              ? { ...v, date: newDate, totalDebit: total, totalCredit: total }
              : v,
          );
          const existingEntries = state.journalEntries.filter(je => je.voucherId === voucher.id);
          updatedJournalEntries = [
            ...state.journalEntries.filter(je => je.voucherId !== voucher.id),
            ...posting.map(line => {
              const match = existingEntries.find(e => e.accountId === line.accountId);
              return {
                id: match?.id || uuidv4(),
                voucherId: voucher.id,
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                narration: line.narration,
              };
            }),
          ];
        }

        return {
          ...state,
          sales: updatedSales,
          finishedGoodsLots: lots,
          inventoryMovements: updatedInventoryMovements,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries,
        };
      }

      // `data` is Partial<Sale>: an edit that only touches the date must not
      // silently rewrite the quantity and price to NaN.
      const newPcsSold = data.pcsSold ?? oldSale.pcsSold;
      const newPricePerPiece = data.pricePerPiece ?? oldSale.pricePerPiece;
      const newDate = data.date ?? oldSale.date;
      const newTotalAmount = newPcsSold * newPricePerPiece;

      const updatedSales = state.sales.map(s =>
        s.id === id ? { ...s, ...data, pcsSold: newPcsSold, pricePerPiece: newPricePerPiece, totalAmount: newTotalAmount } : s
      );

      // ── Assembled product: re-derive the component consumption ──────────
      // An assembled sale consumed raw parts at the moment it was saved. An
      // edit therefore has to give the OLD consumption back and take the NEW
      // one, otherwise changing 5 → 8 leaves stock three sets short and
      // deleting the components later returns the wrong amount. Everything is
      // computed on private copies because databaseMiddleware runs the `set`
      // updater twice (validation, then commit).
      const oldProduct = state.products.find(p => p.id === oldSale.productId);
      const newProduct = state.products.find(p => p.id === data.productId) ?? oldProduct;
      if ((oldProduct && isAssembled(oldProduct)) || (newProduct && isAssembled(newProduct))) {
        let nextBatches = state.batches.map(b => ({ ...b }));
        const newMovements: InventoryMovement[] = [];

        // Whichever SIDE is a single-material product still goes through the
        // finished-pcs replay, or swapping a simple sale onto an assembled
        // product would leave the old product's finished stock permanently
        // deducted by this sale.
        for (const side of [oldProduct, newProduct]) {
          if (!side || isAssembled(side) || !side.materialId) continue;
          nextBatches = InventoryCalculationService.recomputeFinishedPcsForMaterial(
            side.materialId,
            nextBatches,
            state.processingReceipts || [],
            state.processingSends || [],
            updatedSales,
            state.products || [],
            undefined,
            state.processingStages || [],
            undefined,
            state.manufacturingOrders || [],
          );
        }

        // Return the old product's parts first, then draw the new plan.
        if (oldProduct && isAssembled(oldProduct)) {
          for (const [materialId, perUnitQty] of perUnitRequirement(oldProduct)) {
            nextBatches = restoreComponentStock(nextBatches, materialId, roundQty(perUnitQty * oldSale.pcsSold));
          }
        }
        const invoiceNo = updatedSales.find(s => s.id === id)?.invoiceNo ?? oldSale.invoiceNo;
        let partsCost = 0;
        if (newProduct && isAssembled(newProduct)) {
          for (const [materialId, perUnitQty] of perUnitRequirement(newProduct)) {
            const required = roundQty(perUnitQty * newPcsSold);
            const result = consumeComponentStock(nextBatches, materialId, required);
            if (result.shortage > 1e-9) {
              throw new AppError(
                `Not enough stock to record this edit: ` +
                `${state.materials.find(m => m.id === materialId)?.name ?? materialId} ` +
                `is short ${result.shortage}.`,
                'INSUFFICIENT_STOCK',
              );
            }
            nextBatches = result.batches;
            partsCost = roundQty(
              partsCost + required * InventoryCalculationService.getWeightedAverageCostPerPiece(materialId, nextBatches),
            );
            newMovements.push({
              id: uuidv4(),
              materialId,
              date: newDate,
              referenceNo: invoiceNo,
              module: 'Sale',
              transactionType: 'OUT',
              quantity: required,
              runningBalance: InventoryCalculationService.calculateRawMaterialStock(materialId, nextBatches),
              remarks: `Used in ${newProduct.name} \u00d7 ${newPcsSold}`,
            });
          }
        }

        // One movement per component, replacing whatever the old edit wrote.
        const updatedInventoryMovements = [
          ...newMovements,
          ...(state.inventoryMovements || []).filter(im => im.referenceNo !== invoiceNo),
        ];

        const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
        let updatedVouchers = state.vouchers;
        let updatedJournalEntries = state.journalEntries;
        if (voucher) {
          // Same four-leg shape addSale posts for an assembled sale: revenue
          // against receivables, and the purchase value of the parts against
          // Raw Material Inventory (never Finished Goods — assembled goods are
          // never booked there).
          // `data` is Partial<Sale>, so a metadata-only edit (price/date fix)
          // carries no customerId. Compare truthily, not with ===, or the find
          // below matches every account whose linkedEntityId is also undefined
          // — the stock and COGS accounts — and posts the revenue leg to them.
          const customerId = data.customerId ?? oldSale.customerId;
          const receivableAccount = state.accounts.find(a => a.linkedEntityId && a.linkedEntityId === customerId)
            || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Receivable');
          const salesAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Sales');
          const cogsAccount = getSystemCOGSAccount(state.accounts, state.accountSubtypes);
          const rawInventoryAccount = getSystemInventoryAccount(state.accounts, state.accountSubtypes, 'Raw Material Inventory');
          const hasPartsLeg = partsCost > 0 && !!cogsAccount && !!rawInventoryAccount;
          const voucherTotal = newTotalAmount + (hasPartsLeg ? partsCost : 0);

          updatedVouchers = state.vouchers.map(v =>
            v.id === voucher.id ? { ...v, totalDebit: voucherTotal, totalCredit: voucherTotal, date: newDate } : v
          );

          const rebuiltEntries: { accountId: string; debit: number; credit: number }[] = [];
          if (receivableAccount) rebuiltEntries.push({ accountId: receivableAccount.id, debit: newTotalAmount, credit: 0 });
          if (salesAccount) rebuiltEntries.push({ accountId: salesAccount.id, debit: 0, credit: newTotalAmount });
          if (hasPartsLeg) {
            rebuiltEntries.push({ accountId: cogsAccount!.id, debit: partsCost, credit: 0 });
            rebuiltEntries.push({ accountId: rawInventoryAccount!.id, debit: 0, credit: partsCost });
          }
          const existingEntries = state.journalEntries.filter(je => je.voucherId === voucher.id);
          updatedJournalEntries = [
            ...state.journalEntries.filter(je => je.voucherId !== voucher.id),
            ...rebuiltEntries.map(ne => {
              const match = existingEntries.find(e => e.accountId === ne.accountId);
              return { id: match?.id || uuidv4(), voucherId: voucher.id, ...ne };
            }),
          ];
        }

        return {
          ...state,
          sales: updatedSales,
          batches: nextBatches,
          materials: InventoryCalculationService.syncMaterialCounters(state.materials, nextBatches),
          inventoryMovements: updatedInventoryMovements,
          vouchers: updatedVouchers,
          journalEntries: updatedJournalEntries,
        };
      }

      // NOTE: the customer's balanceReceivable is derived from the linked
      // account's COMPLETE ledger via the afterMutation callback — never
      // adjusted here (spec §14).

      // Rebuild the affected materials' finished pcs per batch from the
      // authoritative history (receipts produce, sales consume FIFO,
      // stage-aware) so an edit re-applies cleanly at actual purchase cost.
      // Recompute EVERY affected material — both the old and the new product's
      // material when the product was changed — otherwise the abandoned
      // material keeps counting this sale as consumed (stale finished stock).
      const affectedMaterialIds = [...new Set(
        [data.productId, oldSale.productId]
          .map(pid => state.products.find(p => p.id === pid)?.materialId)
          .filter((mid): mid is string => !!mid)
      )];
      let updatedBatches = state.batches;
      for (const materialId of affectedMaterialIds) {
        updatedBatches = InventoryCalculationService.recomputeFinishedPcsForMaterial(
          materialId,
          updatedBatches || [],
          state.processingReceipts || [],
          state.processingSends || [],
          updatedSales,
          state.products || [],
          undefined,
          state.processingStages || [],
          undefined,
          state.manufacturingOrders || []
        );
      }
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Sales');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        // Rebuild the sale voucher's entries by account role (receivable / sales /
        // COGS / finished goods) so the COGS leg is recomputed at the new quantity
        // instead of every debit/credit being stamped with the sale amount.
        // COGS must come from the NEW product's material when the product was
        // changed — the old either/or find() could pick whichever product came
        // first in the array, pricing the voucher leg from the wrong material.
        const product = state.products.find(p => p.id === data.productId)
          || state.products.find(p => p.id === oldSale.productId);
        const linkedMaterialId = product?.materialId;
        const fifo = linkedMaterialId
          ? InventoryCalculationService.getFIFOCOGSForSale(linkedMaterialId, newPcsSold, updatedBatches || [])
          : { cogs: 0 };
        const cogsAmount = fifo.cogs;

        const editCustomerId = data.customerId ?? oldSale.customerId;
        const receivableAccount = state.accounts.find(a => a.linkedEntityId && a.linkedEntityId === editCustomerId)
          || getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Accounts Receivable');
        const salesAccount = getSystemAccountBySubtype(state.accounts, state.accountSubtypes, 'Sales');
        const cogsAccount = getSystemCOGSAccount(state.accounts, state.accountSubtypes);
        const finishedGoodsAccount = getSystemInventoryAccount(state.accounts, state.accountSubtypes, 'Finished Goods Inventory');

        const rebuiltEntries: { accountId: string; debit: number; credit: number }[] = [];
        if (receivableAccount) rebuiltEntries.push({ accountId: receivableAccount.id, debit: newTotalAmount, credit: 0 });
        if (salesAccount) rebuiltEntries.push({ accountId: salesAccount.id, debit: 0, credit: newTotalAmount });
        if (cogsAmount > 0 && cogsAccount) rebuiltEntries.push({ accountId: cogsAccount.id, debit: cogsAmount, credit: 0 });
        if (cogsAmount > 0 && finishedGoodsAccount) rebuiltEntries.push({ accountId: finishedGoodsAccount.id, debit: 0, credit: cogsAmount });

        const voucherTotal = newTotalAmount + cogsAmount;
        updatedVouchers = state.vouchers.map(v => 
          v.id === voucher.id ? { ...v, totalDebit: voucherTotal, totalCredit: voucherTotal, date: data.date } : v
        );

        const existingEntries = state.journalEntries.filter(je => je.voucherId === voucher.id);
        updatedJournalEntries = [
          ...state.journalEntries.filter(je => je.voucherId !== voucher.id),
          ...rebuiltEntries.map(ne => {
            const match = existingEntries.find(e => e.accountId === ne.accountId);
            return { id: match?.id || uuidv4(), voucherId: voucher.id, ...ne };
          })
        ];
      }

      return {
        ...state,
        sales: updatedSales,
        materials: updatedMaterials,
        batches: updatedBatches,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },

  deleteAccount: (id: string) => {
    set((state) => ({
      ...state,
      accounts: state.accounts.filter(a => a.id !== id)
    }));
  },

  updateSupplier: (id: string, data: any) => set(state => ({ suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...data } : s) })),
  updateCustomer: (id: string, data: any) => set(state => ({ customers: state.customers.map(c => c.id === id ? { ...c, ...data } : c) })),
  updateProcessor: (id: string, data: any) => set(state => ({ processors: state.processors.map(p => p.id === id ? { ...p, ...data } : p) })),

  deleteProcessor: (id: string) => {
    const processor = _get().processors.find(p => p.id === id);
    if (!processor) return { deleted: false, reason: 'Processor not found' };

    // Reference guard — deleting a processor that processing jobs point at
    // would orphan dispatches, receipts, bills and ledger rows.
    const state = _get();
    const sendCount = state.processingSends.filter(s => s.processorId === id).length;
    const receiptCount = state.processingReceipts.filter(r => r.processorId === id).length;
    const billCount = state.processorBills.filter(b => b.processorId === id).length;
    const entryCount = processor.accountId
      ? state.journalEntries.filter(e => e.accountId === processor.accountId).length
      : 0;

    if (sendCount > 0 || receiptCount > 0 || billCount > 0 || entryCount > 0) {
      const impact: string[] = [];
      if (sendCount > 0) impact.push(`${sendCount} processing job(s)`);
      if (receiptCount > 0) impact.push(`${receiptCount} receipt(s)`);
      if (billCount > 0) impact.push(`${billCount} bill(s)`);
      if (entryCount > 0) impact.push(`${entryCount} ledger entr(y/ies)`);
      // Deactivate to preserve referential integrity (same policy as materials).
      set({
        processors: state.processors.map(p => p.id === id ? { ...p, status: 'Inactive' } : p)
      });
      return { deleted: false, reason: `Referenced by ${impact.join(', ')} — deactivated instead` };
    }

    // No references: remove the processor and its (empty) AP account together.
    set({
      processors: state.processors.filter(p => p.id !== id),
      accounts: processor.accountId
        ? state.accounts.filter(a => a.id !== processor.accountId)
        : state.accounts
    });
    return { deleted: true };
  },

  updateAccount: (id: string, data: any) => {
    set((state) => ({
      ...state,
      accounts: state.accounts.map(a => a.id === id ? { ...a, ...data } : a)
    }));
  },

  /**
   * Delete a dispatch (send) and fully reverse its stock + batch-trail effect.
   * Cascades: receipts of this dispatch are removed with it, and any processor
   * bills covering them are reversed (vouchers and journal entries deleted) in
   * one atomic step — the user does not have to delete bill → receipt → send
   * manually. Safety rules:
   *  - A receipt whose finished goods were already sold cannot be deleted —
   *    the remaining production could not cover the sales (guarded no-op).
   *  - Bills shared with OTHER sends keep their remaining receipts, with a
   *    recomputed total and voucher amount.
   *  - Sends that were merged into this dispatch ('Adjusted') are restored to
   *    Pending so their pcs stay in the trail.
   * The batch trail is rebuilt from the remaining history (same FIFO replay the
   * engine and migration use), so legacy no-batch dispatches are handled
   * correctly and the same pcs are never counted twice.
   */
  deleteProcessingSend: (id: string) => {
    set((state) => {
      const send = state.processingSends.find(s => s.id === id);
      if (!send) return state;

      if (send.batchId) {
        assertBatchesNotConsumedByManufacturing(state, [send.batchId], 'dispatch deletion');
      } else {
        assertMaterialNotConsumedByManufacturing(state, send.materialId, 'dispatch deletion');
      }

      // ── Cascade receipts ────────────────────────────────────────────────
      const receiptsToDelete = (state.processingReceipts || []).filter(r => r.sendId === id);
      const receiptIds = new Set(receiptsToDelete.map(r => r.id));
      const remainingReceipts = (state.processingReceipts || []).filter(r => r.sendId !== id);

      // Safety: a receipt whose finished goods were already sold cannot be
      // deleted — the remaining production could not cover the sales, so the
      // material counters and batch trail would diverge. Abort the cascade.
      if (receiptsToDelete.length > 0) {
        const remainingProduction = remainingReceipts
          .filter(r => r.materialId === send.materialId)
          .reduce((sum, r) => sum + r.pcsReceived, 0);
        const productIds = new Set(state.products.filter(p => p.materialId === send.materialId).map(p => p.id));
        const soldPcs = state.sales
          .filter(sale =>
            sale.stockModelAtSale !== 'manufactured'
            && productIds.has(sale.productId)
          )
          .reduce((sum, sale) => sum + sale.pcsSold, 0);
        if (remainingProduction < soldPcs) return state;
      }

      // Sends merged back into this dispatch ('adjusted') — restore to Pending.
      const adjustedOrphans = state.processingSends.filter(s => s.adjustedToDispatchId === id);
      const restoredOrphans = adjustedOrphans.map(s => ({
        ...s,
        status: 'Pending' as const,
        adjustedToDispatchId: undefined,
        remarks: (s.remarks || '').replace(/ \(Adjusted .*\)$/, '')
      }));
      const remainingSends = [
        ...state.processingSends.filter(s => s.id !== id && s.adjustedToDispatchId !== id),
        ...restoredOrphans
      ];

      // ── Cascade bills covering the deleted receipts ─────────────────────
      // Fully-owned bills (every receipt belongs to this send) are removed
      // together with their voucher + journal entries; shared bills keep their
      // other receipts with a recomputed total and voucher amount.
      let updatedBills = state.processorBills || [];
      let updatedVouchers = state.vouchers || [];
      let updatedJournalEntries = state.journalEntries || [];
      const billsTouching = updatedBills.filter(b =>
        b.receiptIds.some(rid => receiptIds.has(rid))
      );
      for (const bill of billsTouching) {
        const remaining = bill.receiptIds.filter(rid => !receiptIds.has(rid));
        if (remaining.length === 0) {
          updatedBills = updatedBills.filter(b => b.id !== bill.id);
          const voucher = updatedVouchers.find(v => v.sourceId === bill.id && v.sourceModule === 'Processing');
          if (voucher) {
            updatedVouchers = updatedVouchers.filter(v => v.id !== voucher.id);
            updatedJournalEntries = updatedJournalEntries.filter(je => je.voucherId !== voucher.id);
          }
        } else {
          const newTotal = remaining.reduce((sum, rid) => {
            const r = state.processingReceipts.find(x => x.id === rid);
            return sum + (bill.lineAmounts?.[rid] ?? r?.billAmount ?? 0);
          }, 0);
          const lineAmounts = { ...(bill.lineAmounts || {}) };
          for (const rid of receiptIds) delete lineAmounts[rid];
          const updatedBill = { ...bill, receiptIds: remaining, totalAmount: newTotal, lineAmounts };
          updatedBills = updatedBills.map(b => b.id === bill.id ? updatedBill : b);
          const rebuilt = rebuildProcessingBillVoucher(
            state,
            updatedBill,
            remainingReceipts,
            updatedVouchers,
            updatedJournalEntries,
          );
          updatedVouchers = rebuilt.vouchers;
          updatedJournalEntries = rebuilt.journalEntries;
        }
      }

      // Remove the accrual vouchers of the cascaded receipts and the write-off
      // vouchers of this dispatch's recorded losses. Deleting the source
      // document must never leave orphaned journal entries behind.
      const orphanVoucherIds = new Set<string>();
      for (const receipt of receiptsToDelete) {
        if (receipt.accruedVoucherId) orphanVoucherIds.add(receipt.accruedVoucherId);
      }
      for (const loss of state.processingLosses || []) {
        if (loss.sendId === id && loss.voucherId) orphanVoucherIds.add(loss.voucherId);
      }
      if (orphanVoucherIds.size > 0) {
        updatedVouchers = updatedVouchers.filter(v => !orphanVoucherIds.has(v.id));
        updatedJournalEntries = updatedJournalEntries.filter(je => !orphanVoucherIds.has(je.voucherId));
      }

      // Rebuild the batch trail from the remaining history (idempotent,
      // stage-aware FIFO replay — the deleted send's loss is removed with it),
      // then re-derive the material counters from the rebuilt trail.
      const updatedBatches = InventoryCalculationService.recomputeFinishedPcsForMaterial(
        send.materialId,
        state.batches || [],
        remainingReceipts,
        remainingSends,
        state.sales || [],
        state.products || [],
        undefined,
        state.processingStages || [],
        undefined,
        state.manufacturingOrders || []
      );
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      // Remove this dispatch's + its receipts' inventory movements
      const removedReferenceNos = new Set([
        send.dispatchNo,
        ...receiptsToDelete.map(r => r.receiveNo)
      ]);
      return {
        ...state,
        processingSends: remainingSends,
        processingReceipts: remainingReceipts,
        processorBills: updatedBills,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries,
        materials: updatedMaterials,
        batches: updatedBatches,
        processingLosses: (state.processingLosses || []).filter(l => l.sendId !== id),
        inventoryMovements: state.inventoryMovements.filter(im => !removedReferenceNos.has(im.referenceNo))
      };
    });
    afterMutation?.();
  },


  updateProcessingSend: (id: string, data: any) => {
    set((state) => {
      const oldSend = state.processingSends.find(s => s.id === id);
      if (!oldSend) return state;

      const touchesStock = ['pcsSent', 'stageId', 'batchId', 'date', 'lossQuantity'].some(k => k in data);
      if (touchesStock) {
        if (oldSend.batchId) {
          assertBatchesNotConsumedByManufacturing(state, [oldSend.batchId], 'dispatch edit');
        } else {
          assertMaterialNotConsumedByManufacturing(state, oldSend.materialId, 'dispatch edit');
        }
      }

      const updatedSends = state.processingSends.map(s =>
        s.id === id ? { ...s, ...data } : s
      );

      // Rebuild the whole trail for this material (handles pcs, stage, and
      // loss changes in one pass) and re-derive counters from it — the batch
      // trail is the single source of truth.
      const updatedBatches = applyBatchReplayForMaterial(
        oldSend.materialId,
        state,
        updatedSends,
        state.processingReceipts || [],
        state.sales || [],
        state.products || []
      );
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      return {
        ...state,
        processingSends: updatedSends,
        materials: updatedMaterials,
        batches: updatedBatches
      };
    });
  },


  /**
   * Delete a processing receipt and reverse its stock + batch-trail effect.
   * Safety rules:
   *  - A billed receipt cannot be deleted — delete the processor bill first.
   *  - A receipt whose finished goods have already been sold cannot be deleted
   *    (the remaining receipts could not cover the sales) — delete the sale first.
   * Only this receipt's share is removed from the send's pcsReceived (other
   * receipts on the same send are preserved), and the batch trail is rebuilt
   * from the remaining history.
   */
  deleteProcessingReceipt: (id: string) => {
    set((state) => {
      const receipt = state.processingReceipts.find(r => r.id === id);
      if (!receipt) return state;

      // Guard: billed receipts must be un-billed (delete the bill) first.
      if (receipt.billedStatus === 'Billed') return state;

      const receiptSend = state.processingSends.find(s => s.id === receipt.sendId);
      if (receiptSend?.batchId) {
        assertBatchesNotConsumedByManufacturing(state, [receiptSend.batchId], 'receipt deletion');
      } else {
        assertMaterialNotConsumedByManufacturing(state, receipt.materialId, 'receipt deletion');
      }

      // Guard: don't allow deleting a receipt whose finished goods were already
      // sold — the remaining production could not cover the sales, so the
      // material counters and batch trail would diverge.
      const remainingReceipts = state.processingReceipts.filter(r => r.id !== id);
      const remainingProduction = remainingReceipts
        .filter(r => r.materialId === receipt.materialId)
        .reduce((sum, r) => sum + r.pcsReceived, 0);
      const productIds = new Set(state.products.filter(p => p.materialId === receipt.materialId).map(p => p.id));
      const soldPcs = state.sales
        .filter(s => s.stockModelAtSale !== 'manufactured' && productIds.has(s.productId))
        .reduce((sum, s) => sum + s.pcsSold, 0);
      if (remainingProduction < soldPcs) return state;

      // Remove only this receipt's share from the send and recompute status
      const updatedSends = state.processingSends.map(s => {
        if (s.id !== receipt.sendId) return s;
        const newReceived = Math.max(0, s.pcsReceived - receipt.pcsReceived);
        const status = newReceived >= s.pcsSent ? 'Closed' : newReceived > 0 ? 'Partial' : 'Pending';
        return { ...s, pcsReceived: newReceived, status: status as 'Closed' | 'Partial' | 'Pending' | 'Adjusted' };
      });

      // Rebuild the batch trail from the remaining history (idempotent,
      // stage-aware FIFO replay), then re-derive material counters.
      const updatedBatches = applyBatchReplayForMaterial(
        receipt.materialId,
        state,
        updatedSends,
        remainingReceipts,
        state.sales || [],
        state.products || []
      );
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      // Remove this receipt's inventory movement and, on v4 data, its receipt
      // accrual voucher (the cost was capitalised at receipt).
      const accrualVoucherId = receipt.accruedVoucherId;
      return {
        ...state,
        processingReceipts: remainingReceipts,
        processingSends: updatedSends,
        materials: updatedMaterials,
        batches: updatedBatches,
        vouchers: accrualVoucherId
          ? state.vouchers.filter(v => v.id !== accrualVoucherId)
          : state.vouchers,
        journalEntries: accrualVoucherId
          ? state.journalEntries.filter(je => je.voucherId !== accrualVoucherId)
          : state.journalEntries,
        inventoryMovements: state.inventoryMovements.filter(im => im.referenceNo !== receipt.receiveNo)
      };
    });
  },


  updateProcessingReceipt: (id: string, data: any) => {
    set((state) => {
      const oldReceipt = state.processingReceipts.find(r => r.id === id);
      if (!oldReceipt) return state;

      const oldSend = state.processingSends.find(s => s.id === oldReceipt.sendId);
      const touchesStock = ['pcsReceived', 'stageId', 'sendId', 'rateMethod', 'date'].some(k => k in data);
      if (touchesStock) {
        if (oldSend?.batchId) {
          assertBatchesNotConsumedByManufacturing(state, [oldSend.batchId], 'receipt edit');
        } else {
          assertMaterialNotConsumedByManufacturing(state, oldReceipt.materialId, 'receipt edit');
        }
      }

      // v4 bills clear the receipt accrual and post only a true-up. Changing a
      // billed receipt would require rewriting both documents, so the bill is
      // deliberately the unit of correction: delete it first.
      if (isManufacturingEnabled(state) && oldReceipt.billedStatus === 'Billed') {
        throw new AppError(
          `Receipt ${oldReceipt.receiveNo} is already billed. Delete its processor bill before editing the receipt.`,
        );
      }

      const updatedReceipts = state.processingReceipts.map(r =>
        r.id === id ? { ...r, ...data } : r
      );

      // Recompute the edited receipt's billAmount with the same per-stage
      // formula the engine uses (per_piece = qty × rate; per_kg = qty ×
      // weightPerPiece × rate), so an edit never leaves a stale bill amount.
      const receipt = updatedReceipts.find(r => r.id === id)!;
      const send = state.processingSends.find(s => s.id === receipt.sendId);
      const stage = (state.processingStages || []).find(s => s.id === (receipt.stageId ?? send?.stageId));
      const batch = send?.batchId ? state.batches.find(b => b.id === send.batchId) : undefined;
      const rateMethod = receipt.rateMethod ?? stage?.rateMethod ?? 'per_piece';
      const billAmount = InventoryCalculationService.computeReceiptBillAmount(
        receipt.pcsReceived,
        rateMethod,
        send,
        batch,
        stage
      );
      const finalReceipts = updatedReceipts.map(r =>
        r.id === id
          ? {
              ...r,
              billAmount,
              rateMethod,
              billingUnit: r.billingUnit ?? stage?.billingUnit,
              ...(isManufacturingEnabled(state) && oldReceipt.accruedProcessingCost !== undefined
                ? { accruedProcessingCost: billAmount }
                : {}),
            }
          : r
      );

      // On v4 receipts the processing charge was capitalised at receipt. An
      // edit that changes the quantity/rate must therefore rewrite that same
      // accrual voucher — not post a second one.
      let accrualPatch: { vouchers: Voucher[]; journalEntries: JournalEntry[] } | null = null;
      if (isManufacturingEnabled(state) && oldReceipt.accruedVoucherId) {
        const accrualVoucher = state.vouchers.find(v => v.id === oldReceipt.accruedVoucherId);
        if (accrualVoucher) {
          const posting = buildReceiptAccrual(
            state.accounts,
            state.accountSubtypes,
            billAmount,
            `Processing accrued — ${oldReceipt.receiveNo}`,
          );
          if (posting.length > 0) {
            const existing = state.journalEntries.filter(je => je.voucherId === accrualVoucher.id);
            accrualPatch = {
              vouchers: state.vouchers.map(v =>
                v.id === accrualVoucher.id ? { ...v, totalDebit: billAmount, totalCredit: billAmount } : v
              ),
              journalEntries: [
                ...state.journalEntries.filter(je => je.voucherId !== accrualVoucher.id),
                ...posting.map(line => {
                  const match = existing.find(e => e.accountId === line.accountId);
                  return {
                    id: match?.id || uuidv4(),
                    voucherId: accrualVoucher.id,
                    accountId: line.accountId,
                    debit: line.debit,
                    credit: line.credit,
                    narration: line.narration,
                  };
                }),
              ],
            };
          }
        }
      }

      // If the edited receipt is Billed, cascade the new amount into its bill
      // and that bill's voucher so the ledger and processor balance never drift.
      let updatedBills = state.processorBills;
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      const linkedBills = state.processorBills.filter(b => b.receiptIds.includes(id));
      if (receipt.billedStatus === 'Billed' && linkedBills.length > 0) {
        updatedBills = state.processorBills.map(bill => {
          if (!bill.receiptIds.includes(id)) return bill;
          const newTotal = bill.receiptIds.reduce((sum, rid) => {
            const r = finalReceipts.find(x => x.id === rid);
            return sum + (bill.lineAmounts?.[rid] ?? r?.billAmount ?? 0);
          }, 0);
          const updatedBill = { ...bill, totalAmount: newTotal };
          const rebuilt = rebuildProcessingBillVoucher(
            state,
            updatedBill,
            finalReceipts,
            updatedVouchers,
            updatedJournalEntries,
          );
          updatedVouchers = rebuilt.vouchers;
          updatedJournalEntries = rebuilt.journalEntries;
          return updatedBill;
        });
      }

      if (accrualPatch) {
        updatedVouchers = accrualPatch.vouchers;
        updatedJournalEntries = accrualPatch.journalEntries;
      }

      const updatedSends = state.processingSends.map(s => {
        if (s.id === oldReceipt.sendId) {
          const newReceived = s.pcsReceived + (data.pcsReceived - oldReceipt.pcsReceived);
          return {
            ...s,
            pcsReceived: newReceived,
            status: (newReceived >= s.pcsSent ? 'Closed' : 'Partial') as 'Closed' | 'Partial' | 'Pending' | 'Adjusted'
          };
        }
        return s;
      });

      // Rebuild the whole batch trail for this material and re-derive counters.
      const updatedBatches = applyBatchReplayForMaterial(
        oldReceipt.materialId,
        state,
        updatedSends,
        finalReceipts,
        state.sales || [],
        state.products || []
      );
      const updatedMaterials = InventoryCalculationService.syncMaterialCounters(state.materials, updatedBatches);

      return {
        ...state,
        processingReceipts: finalReceipts,
        processingSends: updatedSends,
        materials: updatedMaterials,
        batches: updatedBatches,
        processorBills: updatedBills,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },


  deleteProcessorBill: (id: string) => {
    set((state) => {
      const bill = state.processorBills.find(b => b.id === id);
      if (!bill) return state;

      // Restore receipt statuses
      const updatedReceipts = state.processingReceipts.map(r => 
        bill.receiptIds.includes(r.id) ? { ...r, billedStatus: 'Unbilled' as const } : r
      );

      // NOTE: the processor's balancePayable is derived from the linked
      // account's COMPLETE ledger via the afterMutation callback — never
      // decremented here (spec §14).

      // Remove voucher
      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Processing');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.filter(v => v.id !== voucher.id);
        updatedJournalEntries = state.journalEntries.filter(je => je.voucherId !== voucher.id);
      }

      return {
        ...state,
        processorBills: state.processorBills.filter(b => b.id !== id),
        processingReceipts: updatedReceipts,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },


  updateProcessorBill: (id: string, data: any) => {
    set((state) => {
      const oldBill = state.processorBills.find(b => b.id === id);
      if (!oldBill) return state;

      // Recompute the total from the (possibly overridden) per-line amounts.
      // When the edit carries lineAmounts, total = Σ overrides; otherwise the
      // caller-provided totalAmount is used (legacy behaviour).
      let newTotalAmount = data.totalAmount;
      if (data.lineAmounts) {
        newTotalAmount = oldBill.receiptIds.reduce((sum, rid) => sum + (data.lineAmounts[rid] ?? 0), 0);
      } else if (newTotalAmount === undefined) {
        // Fall back to the existing total when neither totalAmount nor
        // lineAmounts is supplied (metadata-only edit).
        newTotalAmount = oldBill.totalAmount;
      }

      const { lineAmounts, ...rest } = data;
      const updatedBills = state.processorBills.map(b =>
        b.id === id ? {
          ...b,
          ...rest,
          totalAmount: newTotalAmount,
          ...(lineAmounts ? { lineAmounts } : {}),
        } : b
      );
      const updatedBill = updatedBills.find(b => b.id === id)!;

      // NOTE: the processor's balancePayable is derived from the linked
      // account's COMPLETE ledger via the afterMutation callback — never
      // adjusted here (spec §14).

      const rebuilt = rebuildProcessingBillVoucher(
        state,
        updatedBill,
        state.processingReceipts,
        state.vouchers,
        state.journalEntries,
      );

      return {
        ...state,
        processorBills: updatedBills,
        vouchers: rebuilt.vouchers,
        journalEntries: rebuilt.journalEntries
      };
    });
    afterMutation?.();
  },


});

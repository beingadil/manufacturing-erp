import { v4 as uuidv4 } from 'uuid';
import { StoreApi } from 'zustand';
import { getSystemAccountBySubtype, getSystemCOGSAccount, getSystemInventoryAccount } from '../lib/accounting/accountClassification';
import { AppError } from '../lib/errorHandler';
import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { consumeComponentStock, isAssembled, perUnitRequirement, restoreComponentStock, roundQty } from '../lib/business/ProductAssemblyService';
import { UnitConversionService } from '../lib/business/UnitConversionService';
import type { Batch, InventoryMovement, ProcessingReceipt, ProcessingSend, Product, Sale } from '../types/erp';
import { ERPState } from './useERPStore';

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
    state.processingStages || []
  );
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

      // Ready-made purchases keep their direct-pcs entry mode (pcs × rate/pc);
      // everything else derives pcs from weight ÷ weightPerPiece.
      const oldBatch = state.batches.find(b => b.purchaseId === id);
      const wasReadyMade = (oldBatch?.processingPath ?? 'full_chain') === 'ready_made';
      const newCalculatedPcs = wasReadyMade && data.directPcs
        ? Math.max(0, Math.round(data.directPcs))
        : UnitConversionService.calculatePcsFromWeight(data.weight, data.weightUnit, data.weightPerPiece);
      const newAmount = wasReadyMade && data.directPcs
        ? Math.round(data.directPcs) * data.ratePerUnit
        : data.weight * data.ratePerUnit;

      const diffPcs = newCalculatedPcs - oldPurchase.calculatedPcs;

      // Update Purchase
      const updatedPurchases = state.purchases.map(p => 
        p.id === id ? { ...p, ...data, calculatedPcs: newCalculatedPcs, amount: newAmount } : p
      );

      // Update Batch
      let updatedBatches = state.batches;
      if (oldBatch) {
        updatedBatches = state.batches.map(b => 
          b.id === oldBatch.id 
            ? { ...b, weight: data.weight, weightUnit: data.weightUnit, ratePerUnit: data.ratePerUnit, weightPerPiece: data.weightPerPiece, initialPcs: newCalculatedPcs, remainingPcs: b.remainingPcs + diffPcs, amount: newAmount } 
            : b
        );
      }

      // Update Material stock — ready-made pcs live in the FINISHED pool.
      const updatedMaterials = state.materials.map(m => 
        m.id === oldPurchase.materialId 
          ? wasReadyMade
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
                narration: wasReadyMade
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
          state.processingStages || []
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
          state.processingStages || []
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

      // ── Cascade receipts ────────────────────────────────────────────────
      const receiptsToDelete = (state.processingReceipts || []).filter(r => r.sendId === id);
      const receiptIds = new Set(receiptsToDelete.map(r => r.id));

      // Safety: a receipt whose finished goods were already sold cannot be
      // deleted — the remaining production could not cover the sales, so the
      // material counters and batch trail would diverge. Abort the cascade.
      if (receiptsToDelete.length > 0) {
        const remainingReceiptsAll = (state.processingReceipts || []).filter(r => r.sendId !== id);
        const remainingProduction = remainingReceiptsAll
          .filter(r => r.materialId === send.materialId)
          .reduce((sum, r) => sum + r.pcsReceived, 0);
        const productIds = new Set(state.products.filter(p => p.materialId === send.materialId).map(p => p.id));
        const soldPcs = state.sales
          .filter(sale => productIds.has(sale.productId))
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
            return sum + (r?.billAmount || 0);
          }, 0);
          const lineAmounts = { ...(bill.lineAmounts || {}) };
          for (const rid of receiptIds) delete lineAmounts[rid];
          updatedBills = updatedBills.map(b => b.id === bill.id
            ? { ...b, receiptIds: remaining, totalAmount: newTotal, lineAmounts }
            : b);
          const voucher = updatedVouchers.find(v => v.sourceId === bill.id && v.sourceModule === 'Processing');
          if (voucher) {
            updatedVouchers = updatedVouchers.map(v =>
              v.id === voucher.id ? { ...v, totalDebit: newTotal, totalCredit: newTotal } : v
            );
            updatedJournalEntries = updatedJournalEntries.map(je =>
              je.voucherId === voucher.id
                ? { ...je, debit: je.debit > 0 ? newTotal : 0, credit: je.credit > 0 ? newTotal : 0 }
                : je
            );
          }
        }
      }

      const remainingReceipts = (state.processingReceipts || []).filter(r => r.sendId !== id);

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
        state.processingStages || []
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
        inventoryMovements: state.inventoryMovements.filter(im => !removedReferenceNos.has(im.referenceNo))
      };
    });
    afterMutation?.();
  },


  updateProcessingSend: (id: string, data: any) => {
    set((state) => {
      const oldSend = state.processingSends.find(s => s.id === id);
      if (!oldSend) return state;

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

      // Guard: don't allow deleting a receipt whose finished goods were already
      // sold — the remaining production could not cover the sales, so the
      // material counters and batch trail would diverge.
      const remainingReceipts = state.processingReceipts.filter(r => r.id !== id);
      const remainingProduction = remainingReceipts
        .filter(r => r.materialId === receipt.materialId)
        .reduce((sum, r) => sum + r.pcsReceived, 0);
      const productIds = new Set(state.products.filter(p => p.materialId === receipt.materialId).map(p => p.id));
      const soldPcs = state.sales
        .filter(s => productIds.has(s.productId))
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

      // Remove this receipt's inventory movement
      return {
        ...state,
        processingReceipts: remainingReceipts,
        processingSends: updatedSends,
        materials: updatedMaterials,
        batches: updatedBatches,
        inventoryMovements: state.inventoryMovements.filter(im => im.referenceNo !== receipt.receiveNo)
      };
    });
  },


  updateProcessingReceipt: (id: string, data: any) => {
    set((state) => {
      const oldReceipt = state.processingReceipts.find(r => r.id === id);
      if (!oldReceipt) return state;

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
        r.id === id ? { ...r, billAmount, rateMethod, billingUnit: r.billingUnit ?? stage?.billingUnit } : r
      );

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
            return sum + (r?.billAmount || 0);
          }, 0);
          const voucher = state.vouchers.find(v => v.sourceId === bill.id && v.sourceModule === 'Processing');
          if (voucher) {
            updatedVouchers = state.vouchers.map(v =>
              v.id === voucher.id ? { ...v, totalDebit: newTotal, totalCredit: newTotal } : v
            );
            updatedJournalEntries = state.journalEntries.map(je =>
              je.voucherId === voucher.id
                ? { ...je, debit: je.debit > 0 ? newTotal : 0, credit: je.credit > 0 ? newTotal : 0 }
                : je
            );
          }
          return { ...bill, totalAmount: newTotal };
        });
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

      // NOTE: the processor's balancePayable is derived from the linked
      // account's COMPLETE ledger via the afterMutation callback — never
      // adjusted here (spec §14).

      const voucher = state.vouchers.find(v => v.sourceId === id && v.sourceModule === 'Processing');
      let updatedVouchers = state.vouchers;
      let updatedJournalEntries = state.journalEntries;
      if (voucher) {
        updatedVouchers = state.vouchers.map(v =>
          v.id === voucher.id ? { ...v, totalDebit: newTotalAmount, totalCredit: newTotalAmount, date: data.date } : v
        );
        updatedJournalEntries = state.journalEntries.map(je =>
          je.voucherId === voucher.id
            ? { ...je, debit: je.debit > 0 ? newTotalAmount : 0, credit: je.credit > 0 ? newTotalAmount : 0 }
            : je
        );
      }

      return {
        ...state,
        processorBills: updatedBills,
        vouchers: updatedVouchers,
        journalEntries: updatedJournalEntries
      };
    });
    afterMutation?.();
  },


});

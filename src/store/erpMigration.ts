import { InventoryCalculationService } from '../lib/business/InventoryCalculationService';
import { buildDefaultStages } from '../lib/processing/processingStageSeed';
import type { Account, AccountSubtype, ProcessingStage, Voucher, VoucherType } from '../types/erp';

/**
 * Persist v3 migration (spec §4, §15, §17, §27).
 *
 * Because the ERP store uses skipHydration + manual bootstrap rehydration
 * (main.tsx reads the key_value_store blob and calls setState directly),
 * the zustand persist `migrate` callback is NOT invoked. This function is
 * exported and applied in main.tsx before setState — and also referenced by
 * the persist migrate for safety.
 *
 * Steps:
 *  1. Remap legacy voucher types → canonical set (CP/BP/CR/BR/JV + system types).
 *  2. Nest party (customer/supplier/processor) accounts under the AR/AP
 *     control accounts via parentId.
 *  3. Drop the legacy `ledgerEntries` parallel trail (single source of truth).
 *  4. Reconstruct per-batch inventory stages (raw → WIP → finished) from the
 *     send/receipt/sale history. Unconditional and idempotent — runs every
 *     startup so the batch trail can never drift from the material counters.
 */
export function migrateERPState(state: any): any {
  if (!state || typeof state !== 'object') return state;

  const accounts: Account[] = Array.isArray(state.accounts) ? state.accounts : [];
  const subtypes: AccountSubtype[] = Array.isArray(state.accountSubtypes) ? state.accountSubtypes : [];

  // Resolve subtype names for legacy type remapping
  const subtypeName = (accountId: string): string | undefined => {
    const acc = accounts.find(a => a.id === accountId);
    return subtypes.find(s => s.id === acc?.subtypeId)?.name;
  };

  // 1. Voucher type remap
  let vouchers: Voucher[] = Array.isArray(state.vouchers) ? state.vouchers : [];
  const journalEntries: { voucherId: string; accountId: string; debit: number; credit: number }[] =
    Array.isArray(state.journalEntries) ? state.journalEntries : [];

  const remapType = (v: Voucher): VoucherType => {
    const legacyType = v.type as string; // legacy persisted types may not be in the canonical union
    if (legacyType === 'Contra Voucher' || legacyType === 'Opening Balance') return 'Journal Voucher';
    if (legacyType === 'Receipt Voucher' || legacyType === 'Payment Voucher') {
      const isReceipt = legacyType === 'Receipt Voucher';
      const entries = journalEntries.filter(e => e.voucherId === v.id);
      // Header side: debit for receipt, credit for payment (the cash/bank leg)
      const header = entries.find(e => (isReceipt ? e.debit > 0 : e.credit > 0));
      const sub = header ? subtypeName(header.accountId) : undefined;
      const isCash = sub === 'Cash';
      if (isReceipt) return isCash ? 'Cash Receipt' : 'Bank Receipt';
      return isCash ? 'Cash Payment' : 'Bank Payment';
    }
    return v.type as VoucherType;
  };
  vouchers = vouchers.map(v => ({ ...v, type: remapType(v) }));

  // 2. Nest party accounts under AR/AP control accounts
  const findControl = (name: string): string | undefined => {
    const subtype = subtypes.find(s => s.name === name);
    if (!subtype) return undefined;
    return accounts.find(a => a.subtypeId === subtype.id && a.isSystem)?.id;
  };
  const arControlId = findControl('Accounts Receivable');
  const apControlId = findControl('Accounts Payable');
  const customerIds = new Set((state.customers || []).map((c: any) => c.id));
  const supplierIds = new Set((state.suppliers || []).map((s: any) => s.id));
  const processorIds = new Set((state.processors || []).map((p: any) => p.id));

  const migratedAccounts = accounts.map(acc => {
    if (acc.parentId || !acc.linkedEntityId) return acc;
    let parentId: string | undefined;
    if (customerIds.has(acc.linkedEntityId)) parentId = arControlId;
    else if (supplierIds.has(acc.linkedEntityId) || processorIds.has(acc.linkedEntityId)) parentId = apControlId;
    return parentId ? { ...acc, parentId } : acc;
  });

  // 4. Seed the processing stage master when empty (spec §4): the default
  //    chain Initial Processor → Machine → Acid → Polish (final). Idempotent —
  //    no-ops once stages exist, so user-configured stages are never overwritten.
  let processingStages: ProcessingStage[] = Array.isArray(state.processingStages) ? state.processingStages : [];
  if (processingStages.length === 0) {
    processingStages = buildDefaultStages();
  }

  // 5. Reconstruct per-batch stages (raw → WIP → finished) from the
  //    authoritative send/receipt/sale history. This runs on EVERY startup and
  //    is fully idempotent: batches are reset to their purchase baseline and the
  //    history is replayed with the same FIFO helpers the live engine uses, so
  //    re-running always yields the same trail. This replaces the old
  //    field-presence gate (`alreadyMigrated`), which could stamp stale 0-stage
  //    fields onto batches and then skip the backfill forever — the exact
  //    double-count symptom (raw + finished showing the same pcs).
  //
  //    Stage-aware (spec §6): only stage-1 / legacy dispatches draw from raw;
  //    only receipts from the configured final stage / legacy produce finished;
  //    recorded losses shrink WIP. The same economic pcs are never counted in
  //    two stages simultaneously.
  const batches = Array.isArray(state.batches) ? state.batches : [];
  const sends = Array.isArray(state.processingSends) ? state.processingSends : [];
  const receipts = Array.isArray(state.processingReceipts) ? state.processingReceipts : [];
  const salesArr = Array.isArray(state.sales) ? state.sales : [];
  const products = Array.isArray(state.products) ? state.products : [];

  let migratedBatches = batches;
  if (batches.length > 0) {
    // Reset every batch to its purchase baseline (all pcs in the raw stage).
    let trail: any[] = batches.map((b: any) => ({
      ...b,
      remainingPcs: b.initialPcs > 0 ? b.initialPcs : b.remainingPcs,
      atProcessorPcs: 0,
      processedPcs: 0,
    }));

    // Dispatches: stage-1 / legacy draws raw → WIP. Intermediate-stage
    // dispatches are WIP → WIP and do not touch the batch buckets.
    const orderedSends = [...sends]
      .filter((s: any) => s.status !== 'Adjusted' && (s.pcsSent || 0) > 0)
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    for (const s of orderedSends) {
      if (!InventoryCalculationService.sendConsumesRaw(s.stageId, processingStages)) continue;
      trail = InventoryCalculationService.attributeDispatchFIFO(
        s.materialId,
        s.pcsSent,
        trail as any,
        s.batchId || undefined
      ).batches;
    }

    // Recorded losses: WIP −= loss (FIFO, preferring the dispatch's batch).
    for (const s of orderedSends) {
      if (!(s.lossQuantity || 0)) continue;
      if (!InventoryCalculationService.sendConsumesRaw(s.stageId, processingStages)) continue;
      trail = InventoryCalculationService.attributeLossFIFO(
        s.materialId,
        s.lossQuantity || 0,
        trail as any,
        s.batchId || undefined
      );
    }

    // Receipts: final-stage / legacy → WIP to finished (prefer the send's
    // batch). Intermediate receipts are WIP → WIP and do not touch buckets.
    const orderedReceipts = [...receipts]
      .filter((r: any) => (r.pcsReceived || 0) > 0)
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    for (const r of orderedReceipts) {
      const send = sends.find((x: any) => x.id === r.sendId);
      const stageId = r.stageId ?? send?.stageId;
      if (!InventoryCalculationService.receiptProducesFinished(stageId, processingStages)) continue;
      trail = InventoryCalculationService.attributeReceiptFIFO(
        r.materialId,
        r.pcsReceived,
        trail as any,
        send?.batchId || undefined
      );
    }

    // Non-final stage receipts: received pcs become available at the next stage
    // in the chain (stageAvailablePcs += received, currentStageId -> next stage).
    const stagesSorted = [...processingStages].sort((a: any, b: any) => a.sequence - b.sequence);
    for (const r of orderedReceipts) {
      const send = sends.find((x: any) => x.id === r.sendId);
      const stageId = r.stageId ?? send?.stageId;
      if (InventoryCalculationService.receiptProducesFinished(stageId, processingStages)) continue;
      const currentStage = stagesSorted.find((s: any) => s.id === stageId);
      const nextStageId = currentStage?.nextStageId;
      trail = trail.map((b: any) => {
        if (send?.batchId && b.id === send.batchId) {
          return {
            ...b,
            currentStageId: nextStageId || undefined,
            stageAvailablePcs: (b.stageAvailablePcs || 0) + (r.pcsReceived || 0),
          };
        }
        return b;
      });
    }

    // Sales: finished → sold consume FIFO per material (same as the engine).
    const productMaterial = new Map<string, string>(
      products.map((p: any) => [p.id as string, p.materialId as string])
    );
    const orderedSales = [...salesArr]
      .filter((s: any) => (s.pcsSold || 0) > 0)
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    for (const sale of orderedSales) {
      const materialId = productMaterial.get(sale.productId);
      if (!materialId) continue;
      trail = InventoryCalculationService.consumeFinishedFIFO(materialId, sale.pcsSold, trail as any);
    }

    migratedBatches = trail;
  }

  // 6. Drop legacy parallel trail
  const { ledgerEntries, ...rest } = state;

  return {
    ...rest,
    accounts: migratedAccounts,
    vouchers,
    batches: migratedBatches,
    processingStages,
  };
}

import { v4 as uuidv4 } from 'uuid';
import { DocumentNumberingService } from '../lib/business/DocumentNumberingService';
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

  // 2b. Backfill party accounts — parties saved before account auto-creation
  //     existed have no linked account, so they never appear in the Chart of
  //     Accounts. Create an AR/AP-nested account per party missing one, and
  //     stamp accountId back onto the party record. Idempotent: runs every
  //     startup; parties with an existing linked account are skipped, and
  //     re-running never duplicates accounts or codes.
  const linkedAccounts = migratedAccounts.filter(a => a.linkedEntityId);
  const hasLinkedAccount = (party: any): boolean =>
    !!party.id && (linkedAccounts.some(a => a.linkedEntityId === party.id)
      || (!!party.accountId && migratedAccounts.some(a => a.id === party.accountId)));
  const typeCount = (type: string) => migratedAccounts.filter(a => a.type === type).length;

  const ensurePartyAccount = (party: any, type: 'Assets' | 'Liabilities', subtypeName: string, controlId: string | undefined): any => {
    if (hasLinkedAccount(party)) return party;
    const subtype = subtypes.find(s => s.name === subtypeName);
    const account: Account = {
      id: uuidv4(),
      code: DocumentNumberingService.generateAccountCode(type, typeCount(type)),
      name: party.name || party.code || 'Party',
      subtypeId: subtype?.id || '',
      type,
      openingBalance: 0,
      openingBalanceType: type === 'Assets' ? 'Debit' : 'Credit',
      status: 'Active',
      isSystem: false,
      linkedEntityId: party.id,
      parentId: controlId
    };
    migratedAccounts.push(account);
    return { ...party, accountId: account.id };
  };

  const rawCustomers = Array.isArray(state.customers) ? state.customers : [];
  const rawSuppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const rawProcessors = Array.isArray(state.processors) ? state.processors : [];
  const migratedCustomers = rawCustomers.map((c: any) => ensurePartyAccount(c, 'Assets', 'Accounts Receivable', arControlId));
  const migratedSuppliers = rawSuppliers.map((s: any) => ensurePartyAccount(s, 'Liabilities', 'Accounts Payable', apControlId));
  const migratedProcessors = rawProcessors.map((p: any) => ensurePartyAccount(p, 'Liabilities', 'Accounts Payable', apControlId));

  // 4. Seed the processing stage master when empty (spec §4): the default
  //    chain Initial Processor → Machine → Acid → Polish → Spot Machine (final). Idempotent —
  //    no-ops once stages exist, so user-configured stages are never overwritten.
  let processingStages: ProcessingStage[] = Array.isArray(state.processingStages) ? state.processingStages : [];
  if (processingStages.length === 0) {
    processingStages = buildDefaultStages();
  } else if (processingStages.length < 5) {
    // Migrate existing 4-stage data: add Spot Machine as the new final stage
    // and remove the final flag from Polish.
    const hasSpotMachine = processingStages.some(s => s.name === 'Spot Machine');
    if (!hasSpotMachine) {
      const spotMachine: ProcessingStage = {
        id: 'stage-spot-machine-migrated',
        name: 'Spot Machine',
        sequence: 5,
        description: 'Spot machine processing — the final stage. Completing it produces saleable Finished Goods.',
        active: true,
        inputUnit: 'PCS',
        billingUnit: 'Per KG',
        billingEnabled: true,
        rateMethod: 'per_kg',
        isFinalStage: true,
      };
      // Unset final on Polish (old stage 4)
      processingStages = processingStages.map(s => ({
        ...s,
        isFinalStage: s.name === 'Polish' ? false : s.isFinalStage,
      }));
      processingStages.push(spotMachine);
      // Wire nextStageId chain
      const ordered = [...processingStages].sort((a, b) => a.sequence - b.sequence);
      ordered.forEach((s, i) => {
        s.nextStageId = ordered[i + 1]?.id;
      });
    }
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
    // Replay each material's full trail through the SAME bucket engine the
    // live handlers use (disjoint per-source availability, movement-map
    // enforced, conservation-checked). One code path for startup migration,
    // edits, and deletes — replay is consistent by construction.
    let trail: any[] = batches;
    const materialIds = [...new Set(batches.map((b: any) => String(b.materialId)))];
    for (const mid of materialIds as string[]) {
      trail = InventoryCalculationService.recomputeFinishedPcsForMaterial(
        String(mid),
        trail,
        receipts,
        sends,
        salesArr,
        products,
        undefined,
        processingStages
      );
    }
    // Scrub the legacy scalar availability fields — the per-source map
    // (stageAvailableBySource) replaced them and stale values must never
    // re-enter the store.
    migratedBatches = trail.map((b: any) => {
      if (!('stageAvailablePcs' in b) && !('availableFromStageId' in b)) return b;
      const { stageAvailablePcs: _sap, availableFromStageId: _afs, ...rest } = b;
      void _sap; void _afs;
      return rest;
    });
  }

  // 5b. Re-derive material counters from the rebuilt batch trail — the trail
  //     is the single source of truth (pipeline semantics: atProcessorPcs
  //     spans at-processor + waiting buckets). Idempotent.
  const migratedMaterials = InventoryCalculationService.syncMaterialCounters(
    Array.isArray(state.materials) ? state.materials : [],
    migratedBatches
  );

  // 6. Drop legacy parallel trail
  const { ledgerEntries, ...rest } = state;

  return {
    ...rest,
    accounts: migratedAccounts,
    vouchers,
    batches: migratedBatches,
    materials: migratedMaterials,
    processingStages,
    customers: migratedCustomers,
    suppliers: migratedSuppliers,
    processors: migratedProcessors,
  };
}

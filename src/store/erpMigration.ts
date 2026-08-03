import type { Account, AccountSubtype, Voucher, VoucherType } from '../types/erp';

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

  // 3. Drop legacy parallel trail
  const { ledgerEntries, ...rest } = state;

  return {
    ...rest,
    accounts: migratedAccounts,
    vouchers,
  };
}

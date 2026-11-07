import type { Account, AccountSubtype } from '../../types/erp';

/**
 * Subtype-based account classification helpers (spec §25).
 * Accounting behavior MUST come from account type/subtype metadata —
 * never from account names.
 */

export function getSubtypeName(
  account: Pick<Account, 'subtypeId'>,
  subtypes: AccountSubtype[]
): string | undefined {
  return subtypes.find(s => s.id === account.subtypeId)?.name;
}

export function isCashAccount(account: Pick<Account, 'subtypeId'>, subtypes: AccountSubtype[]): boolean {
  return getSubtypeName(account, subtypes) === 'Cash';
}

export function isBankAccount(account: Pick<Account, 'subtypeId'>, subtypes: AccountSubtype[]): boolean {
  return getSubtypeName(account, subtypes) === 'Bank';
}

export function isCashOrBankAccount(account: Pick<Account, 'subtypeId'>, subtypes: AccountSubtype[]): boolean {
  return isCashAccount(account, subtypes) || isBankAccount(account, subtypes);
}

export function isAssetAccount(account: Pick<Account, 'type'>): boolean {
  return account.type === 'Assets';
}

/** Expenses + COGS + Other Expenses */
export function isExpenseAccount(account: Pick<Account, 'type'>): boolean {
  return account.type === 'Expenses' || account.type === 'Cost of Goods Sold' || account.type === 'Other Expenses';
}

/** Account whose normal balance is a debit. */
export function isDebitNormalAccount(account: Pick<Account, 'type'>): boolean {
  return isAssetAccount(account) || isExpenseAccount(account);
}

// ── Collections ───────────────────────────────────────────────────────────────

export function getCashAccounts(accounts: Account[], subtypes: AccountSubtype[]): Account[] {
  return accounts.filter(a => isCashAccount(a, subtypes));
}

export function getChequeAccounts(accounts: Account[], subtypes: AccountSubtype[]): Account[] {
  return accounts.filter(a => getSubtypeName(a, subtypes) === 'Cheques');
}

export function getBankAccounts(accounts: Account[], subtypes: AccountSubtype[]): Account[] {
  return accounts.filter(a => isBankAccount(a, subtypes));
}

export function getCashBankAccounts(accounts: Account[], subtypes: AccountSubtype[]): Account[] {
  return accounts.filter(a => isCashOrBankAccount(a, subtypes));
}

/**
 * Find the system control/expense account for a subtype (spec §25).
 * Posting must resolve accounts by subtype metadata — never by account name.
 */
export function getSystemAccountBySubtype(
  accounts: Account[],
  subtypes: AccountSubtype[],
  subtypeName: string
): Account | undefined {
  const subtype = subtypes.find(s => s.name === subtypeName);
  if (!subtype) return undefined;
  return accounts.find(a => a.subtypeId === subtype.id && a.isSystem);
}

/**
 * System inventory bucket accounts (Raw Material / WIP / Finished Goods). The
 * seeded chart has three accounts sharing the 'Inventory' subtype, so a plain
 * subtype lookup is ambiguous — the seed's own account names are the contract
 * here (never user-entered data), with a same-subtype fallback for safety.
 */
export function getSystemInventoryAccount(
  accounts: Account[],
  subtypes: AccountSubtype[],
  name: 'Raw Material Inventory' | 'Work in Progress Inventory' | 'Finished Goods Inventory'
): Account | undefined {
  const subtype = subtypes.find(s => s.name === 'Inventory');
  if (!subtype) return undefined;
  return (
    accounts.find(a => a.subtypeId === subtype.id && a.isSystem && a.name === name)
    || accounts.find(a => a.subtypeId === subtype.id && a.isSystem)
  );
}

/**
 * The system COGS account used for cost-of-goods-sold postings on sale.
 * Prefers a dedicated 'Cost of Goods Sold' account if one exists, otherwise
 * falls back to the seeded system COGS account (subtype 'Purchases').
 */
export function getSystemCOGSAccount(
  accounts: Account[],
  subtypes: AccountSubtype[]
): Account | undefined {
  const dedicated = accounts.find(a => a.type === 'Cost of Goods Sold' && /cost of goods sold/i.test(a.name));
  if (dedicated) return dedicated;
  const subtype = subtypes.find(s => s.name === 'Purchases');
  if (!subtype) return undefined;
  return accounts.find(a => a.subtypeId === subtype.id && a.isSystem);
}

/**
 * The liability account used to accrue processing costs at receipt. The seed
 * creates a dedicated 'Accrued Expenses' account inside the Accounts Payable
 * subtype; older installs that predate it fall back to the AP control account.
 */
export function getAccruedExpensesAccount(
  accounts: Account[],
  subtypes: AccountSubtype[]
): Account | undefined {
  const named = accounts.find(a => a.name === 'Accrued Expenses' && a.status !== 'Inactive');
  if (named) return named;
  return getSystemAccountBySubtype(accounts, subtypes, 'Accounts Payable');
}

/** The system expense account that absorbs recorded processing losses. */
export function getSystemProcessingLossAccount(
  accounts: Account[],
  subtypes: AccountSubtype[]
): Account | undefined {
  const named = accounts.find(a => a.name === 'Processing Loss' && a.status !== 'Inactive');
  if (named) return named;
  return getSystemAccountBySubtype(accounts, subtypes, 'Processing Expense');
}

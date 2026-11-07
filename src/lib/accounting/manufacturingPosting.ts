import type { Account, AccountSubtype } from '../../types/erp';
import { AppError } from '../errorHandler';
import {
  getAccruedExpensesAccount,
  getSystemAccountBySubtype,
  getSystemCOGSAccount,
  getSystemInventoryAccount,
  getSystemProcessingLossAccount,
} from './accountClassification';

/**
 * Voucher legs for the manufacturing redesign. Every builder returns a
 * BALANCED entry list (Σ debit = Σ credit) and resolves accounts by metadata,
 * never by user-visible names — except the three inventory buckets and the
 * 'Accrued Expenses' / 'Processing Loss' system rows, which the seed owns.
 */

export interface PostingLine {
  accountId: string;
  debit: number;
  credit: number;
  narration?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function requireAccount(account: Account | undefined, label: string): Account {
  if (!account) {
    throw new AppError(`${label} account is missing from the chart of accounts. Restore or seed the chart before posting.`);
  }
  return account;
}

function total(lines: PostingLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.debit, 0));
}

function assertBalanced(lines: PostingLine[], label: string): PostingLine[] {
  const debit = round2(lines.reduce((sum, l) => sum + l.debit, 0));
  const credit = round2(lines.reduce((sum, l) => sum + l.credit, 0));
  if (Math.abs(debit - credit) > 0.01) {
    throw new AppError(`${label} posting does not balance (Dr ${debit} / Cr ${credit}).`);
  }
  return lines;
}

/** Processing cost capitalised at receipt: Dr Raw Material / Cr Accrued. */
export function buildReceiptAccrual(
  accounts: Account[],
  subtypes: AccountSubtype[],
  amount: number,
  narration: string,
): PostingLine[] {
  const value = round2(amount);
  if (value <= 0) return [];
  const raw = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Raw Material Inventory'), 'Raw Material Inventory');
  const accrued = requireAccount(getAccruedExpensesAccount(accounts, subtypes), 'Accrued Expenses');
  return assertBalanced([
    { accountId: raw.id, debit: value, credit: 0, narration },
    { accountId: accrued.id, debit: 0, credit: value, narration },
  ], 'Receipt accrual');
}

/**
 * Processor bill true-up. Any difference between what was accrued at receipt
 * and the final bill goes to Processing Expense; the rest clears the accrual.
 */
export function buildProcessorBill(
  accounts: Account[],
  subtypes: AccountSubtype[],
  processorAccount: Account | undefined,
  billAmount: number,
  accruedAmount: number,
  narration: string,
): PostingLine[] {
  const bill = round2(billAmount);
  // Clear the FULL accrual, not just the billed portion: an under-bill credits
  // the difference back to Processing Expense instead of stranding it on the
  // balance sheet forever.
  const accrued = round2(Math.max(0, accruedAmount));
  const payable = requireAccount(
    processorAccount || getSystemAccountBySubtype(accounts, subtypes, 'Accounts Payable'),
    'Accounts Payable',
  );
  const expense = requireAccount(
    getSystemAccountBySubtype(accounts, subtypes, 'Processing Expense'),
    'Processing Expense',
  );
  const accruedAccount = accrued > 0
    ? requireAccount(getAccruedExpensesAccount(accounts, subtypes), 'Accrued Expenses')
    : undefined;

  const lines: PostingLine[] = [];
  if (accrued > 0) {
    lines.push({ accountId: accruedAccount!.id, debit: accrued, credit: 0, narration });
  }
  const difference = round2(bill - accrued);
  if (difference > 0) {
    lines.push({ accountId: expense.id, debit: difference, credit: 0, narration: `${narration} — bill above accrual` });
  } else if (difference < 0) {
    lines.push({ accountId: expense.id, debit: 0, credit: -difference, narration: `${narration} — bill below accrual` });
  }
  lines.push({ accountId: payable.id, debit: 0, credit: bill, narration });
  return assertBalanced(lines, 'Processor bill');
}

/**
 * MO completion: the component value leaves raw inventory, the optional
 * conversion cost is accrued, and the whole cost enters Finished Goods. WIP is
 * deliberately untouched — the ledger WIP balance stays zero.
 */
export function buildManufacturingCompletion(
  accounts: Account[],
  subtypes: AccountSubtype[],
  materialCost: number,
  productionCost: number,
  narration: string,
): PostingLine[] {
  const material = round2(materialCost);
  const production = round2(productionCost);
  const totalCost = round2(material + production);
  if (totalCost <= 0) return [];
  const finished = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Finished Goods Inventory'), 'Finished Goods Inventory');
  const raw = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Raw Material Inventory'), 'Raw Material Inventory');
  const lines: PostingLine[] = [
    { accountId: finished.id, debit: totalCost, credit: 0, narration },
  ];
  if (material > 0) {
    lines.push({ accountId: raw.id, debit: 0, credit: material, narration });
  }
  if (production > 0) {
    const accrued = requireAccount(getAccruedExpensesAccount(accounts, subtypes), 'Accrued Expenses');
    lines.push({ accountId: accrued.id, debit: 0, credit: production, narration: `${narration} — conversion cost accrued` });
  }
  return assertBalanced(lines, 'Manufacturing completion');
}

/**
 * One-time capitalization of pre-v4 processing charges that were expensed at
 * bill time: Dr Raw Material Inventory / Cr Processing Expense. The credit
 * reverses only the on-hand share, so sold quantities keep their historical
 * expense and no COGS is recalculated.
 */
export function buildProcessingCostReclassification(
  accounts: Account[],
  subtypes: AccountSubtype[],
  amount: number,
  narration: string,
): PostingLine[] {
  const value = round2(amount);
  if (value <= 0) return [];
  const raw = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Raw Material Inventory'), 'Raw Material Inventory');
  const expense = requireAccount(
    getSystemAccountBySubtype(accounts, subtypes, 'Processing Expense'),
    'Processing Expense',
  );
  return assertBalanced([
    { accountId: raw.id, debit: value, credit: 0, narration },
    { accountId: expense.id, debit: 0, credit: value, narration },
  ], 'Processing cost reclassification');
}

/** Recorded processing loss: Dr Processing Loss / Cr Raw Material at batch cost. */
export function buildProcessingLoss(
  accounts: Account[],
  subtypes: AccountSubtype[],
  cost: number,
  narration: string,
): PostingLine[] {
  const value = round2(cost);
  if (value <= 0) return [];
  const loss = requireAccount(getSystemProcessingLossAccount(accounts, subtypes), 'Processing Loss');
  const raw = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Raw Material Inventory'), 'Raw Material Inventory');
  return assertBalanced([
    { accountId: loss.id, debit: value, credit: 0, narration },
    { accountId: raw.id, debit: 0, credit: value, narration },
  ], 'Processing loss');
}

/**
 * A manufactured-goods sale: revenue against receivables, and the lots' actual
 * produced cost against Finished Goods. This is the only sales COGS path in
 * v4 — material batches are never touched by a finished-goods sale.
 */
export function buildManufacturedSale(
  accounts: Account[],
  subtypes: AccountSubtype[],
  customerId: string,
  revenue: number,
  cogs: number,
  narration: string,
): PostingLine[] {
  const revenueAmount = round2(revenue);
  const cogsAmount = round2(cogs);
  const receivable = requireAccount(
    accounts.find(a => !!customerId && a.linkedEntityId === customerId)
      || getSystemAccountBySubtype(accounts, subtypes, 'Accounts Receivable'),
    'Accounts Receivable',
  );
  const sales = requireAccount(getSystemAccountBySubtype(accounts, subtypes, 'Sales'), 'Sales');
  const lines: PostingLine[] = [
    { accountId: receivable.id, debit: revenueAmount, credit: 0, narration },
    { accountId: sales.id, debit: 0, credit: revenueAmount, narration },
  ];
  if (cogsAmount > 0) {
    const cogsAccount = requireAccount(getSystemCOGSAccount(accounts, subtypes), 'Cost of Goods Sold');
    const finished = requireAccount(getSystemInventoryAccount(accounts, subtypes, 'Finished Goods Inventory'), 'Finished Goods Inventory');
    lines.push(
      { accountId: cogsAccount.id, debit: cogsAmount, credit: 0, narration: `${narration} — cost of goods sold` },
      { accountId: finished.id, debit: 0, credit: cogsAmount, narration: `${narration} — finished goods released` },
    );
  }
  return assertBalanced(lines, 'Manufactured sale');
}

/** Total of a posting list, for the voucher header. */
export function postingTotal(lines: PostingLine[]): number {
  return total(lines);
}

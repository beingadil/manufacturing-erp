import { v4 as uuidv4 } from 'uuid';
import type { Account, AccountSubtype, Batch, JournalEntry, Product, Sale, Voucher } from '../../types/erp';
import { getSystemCOGSAccount, } from './accountClassification';

/**
 * One-time data-fix for historical postings created before the accounting
 * engine was corrected:
 *
 *  1. Purchases used to post DR 'Purchases' (COGS expense) / CR Payable. The
 *     correct treatment is DR Raw Material Inventory (asset) — stock must
 *     appear on the Balance Sheet from the moment it is bought. Every legacy
 *     Purchase voucher's debit leg is remapped to the Raw Material Inventory
 *     account.
 *
 *  2. Sales used to post DR Receivable / CR Sales with NO cost-of-goods-sold
 *     leg, so profit ignored the cost of what was sold. Every legacy Sales
 *     voucher gets DR COGS / CR Finished Goods Inventory at the historical
 *     weighted-average purchase cost up to the sale date.
 *
 * The function is PURE and IDEMPOTENT: it runs on every startup rehydration
 * (like migrateERPState) and no-ops once the data is already fixed. Nothing
 * here requires a one-time flag, so a half-applied migration can never wedge
 * the app — the next launch simply finishes the job.
 */

export interface PostingFixReport {
  /** Legacy purchase vouchers whose COGS debit was remapped to inventory. */
  purchasesRemapped: number;
  /** Legacy sales vouchers that received a COGS + Finished Goods leg. */
  salesCogsAdded: number;
  /** Sales skipped because no costed batches existed before the sale date. */
  salesSkippedNoCost: number;
  /** True when required system accounts are missing — fix skipped entirely. */
  skippedMissingAccounts: boolean;
}

/**
 * Historical weighted-average purchase cost per piece for a material, using
 * every batch purchased on or before `asOfDate` (initial quantity basis —
 * remainingPcs is current-day state and cannot reconstruct the past).
 */
export function historicalWeightedAverageCost(
  materialId: string,
  batches: Batch[],
  asOfDate: string
): number {
  let totalValue = 0;
  let totalPcs = 0;
  for (const b of batches) {
    if (b.materialId !== materialId || b.initialPcs <= 0) continue;
    if (b.date > asOfDate) continue;
    totalValue += b.amount || 0;
    totalPcs += b.initialPcs;
  }
  return totalPcs > 0 ? totalValue / totalPcs : 0;
}

export function fixHistoricalPostings(state: any): { state: any; report: PostingFixReport } {
  const report: PostingFixReport = {
    purchasesRemapped: 0,
    salesCogsAdded: 0,
    salesSkippedNoCost: 0,
    skippedMissingAccounts: false,
  };
  if (!state || typeof state !== 'object') return { state, report };

  const accounts: Account[] = Array.isArray(state.accounts) ? state.accounts : [];
  const subtypes: AccountSubtype[] = Array.isArray(state.accountSubtypes) ? state.accountSubtypes : [];
  const vouchers: Voucher[] = Array.isArray(state.vouchers) ? state.vouchers : [];
  const journalEntries: JournalEntry[] = Array.isArray(state.journalEntries) ? state.journalEntries : [];
  const batches: Batch[] = Array.isArray(state.batches) ? state.batches : [];
  const sales: Sale[] = Array.isArray(state.sales) ? state.sales : [];
  const products: Product[] = Array.isArray(state.products) ? state.products : [];

  // Exact seeded-account matching (no fallback): remapping a purchase debit to
  // the wrong inventory bucket would mislabel stock, so if the exact system
  // accounts are missing the migration declines to run rather than guess.
  const inventorySubtype = subtypes.find(s => s.name === 'Inventory');
  const exactInventory = (name: string) => inventorySubtype
    ? accounts.find(a => a.subtypeId === inventorySubtype.id && a.isSystem && a.name === name)
    : undefined;
  const inventoryAccount = exactInventory('Raw Material Inventory');
  const finishedGoodsAccount = exactInventory('Finished Goods Inventory');
  const cogsAccount = getSystemCOGSAccount(accounts, subtypes);

  // The legacy posting target: the seeded system COGS account (subtype
  // 'Purchases') that addPurchase used to debit before the fix.
  const purchasesSubtype = subtypes.find(s => s.name === 'Purchases');
  const legacyPurchaseAccount = purchasesSubtype
    ? accounts.find(a => a.subtypeId === purchasesSubtype.id && a.isSystem)
    : undefined;

  if (!inventoryAccount || !cogsAccount || !finishedGoodsAccount || !legacyPurchaseAccount) {
    report.skippedMissingAccounts = true;
    return { state, report };
  }

  const voucherById = new Map(vouchers.map(v => [v.id, v]));

  // ── Part 1: remap legacy purchase debits COGS → Raw Material Inventory ──
  const nextEntries: JournalEntry[] = journalEntries.map(je => {
    const v = voucherById.get(je.voucherId);
    if (
      v?.sourceModule === 'Purchase'
      && je.debit > 0
      && je.accountId === legacyPurchaseAccount.id
    ) {
      report.purchasesRemapped += 1;
      return { ...je, accountId: inventoryAccount.id };
    }
    return je;
  });

  // ── Part 2: back-fill COGS on legacy sales vouchers ──────────────────────
  const entriesByVoucher = new Map<string, JournalEntry[]>();
  for (const je of nextEntries) {
    const arr = entriesByVoucher.get(je.voucherId) || [];
    arr.push(je);
    entriesByVoucher.set(je.voucherId, arr);
  }

  const addedEntries: JournalEntry[] = [];
  const nextVouchers: Voucher[] = vouchers.map(v => {
    if (v.sourceModule !== 'Sales') return v;
    const entries = entriesByVoucher.get(v.id) || [];

    // Already fixed (a COGS-type debit leg exists).
    const hasCogsLeg = entries.some(e => e.debit > 0 && e.accountId === cogsAccount.id);
    if (hasCogsLeg) return v;

    const sale = sales.find(s => s.id === v.sourceId);
    const product = sale ? products.find(p => p.id === sale.productId) : undefined;
    const materialId = product?.materialId;
    const costPerPiece = materialId ? historicalWeightedAverageCost(materialId, batches, v.date) : 0;
    const cogsAmount = costPerPiece * (sale?.pcsSold || 0);

    if (cogsAmount <= 0) {
      report.salesSkippedNoCost += 1;
      return v;
    }

    addedEntries.push(
      { id: uuidv4(), voucherId: v.id, accountId: cogsAccount.id, debit: cogsAmount, credit: 0 },
      { id: uuidv4(), voucherId: v.id, accountId: finishedGoodsAccount.id, debit: 0, credit: cogsAmount }
    );
    report.salesCogsAdded += 1;
    return {
      ...v,
      totalDebit: (v.totalDebit || 0) + cogsAmount,
      totalCredit: (v.totalCredit || 0) + cogsAmount,
    };
  });

  return {
    state: {
      ...state,
      vouchers: nextVouchers,
      journalEntries: [...nextEntries, ...addedEntries],
    },
    report,
  };
}

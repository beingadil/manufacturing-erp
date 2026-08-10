import { describe, it, expect } from 'vitest';
import { fixHistoricalPostings, historicalWeightedAverageCost } from './historicalPostingFix';
import type { Account, AccountSubtype, Voucher } from '../../types/erp';

function buildFixture() {
  const subtypes: AccountSubtype[] = [
    { id: 'st-inv', name: 'Inventory', type: 'Assets', isSystem: true },
    { id: 'st-purch', name: 'Purchases', type: 'Cost of Goods Sold', isSystem: true },
    { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets', isSystem: true },
    { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities', isSystem: true },
    { id: 'st-sales', name: 'Sales', type: 'Revenue', isSystem: true },
  ];

  const accounts: Account[] = [
    { id: 'rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'fg', code: '1103', name: 'Finished Goods Inventory', subtypeId: 'st-inv', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'legacy-cogs', code: '5001', name: 'Purchases', subtypeId: 'st-purch', type: 'Cost of Goods Sold', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', isSystem: true },
    { id: 'cust', code: '1201', name: 'Customer A', subtypeId: 'st-ar', type: 'Assets', openingBalance: 0, openingBalanceType: 'Debit', status: 'Active', linkedEntityId: 'c1' },
    { id: 'sup', code: '2001', name: 'Supplier A', subtypeId: 'st-ap', type: 'Liabilities', openingBalance: 0, openingBalanceType: 'Credit', status: 'Active', linkedEntityId: 's1' },
    { id: 'sales-rev', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue', openingBalance: 0, openingBalanceType: 'Credit', status: 'Active', isSystem: true },
  ];

  const v = (id: string, sourceModule: Voucher['sourceModule'], date: string, debitTotal: number): Voucher => ({
    id, voucherNo: 'V-' + id, date, type: sourceModule === 'Purchase' ? 'Purchase Voucher' : 'Sales Voucher',
    referenceNo: '', sourceModule, sourceId: id === 'v-pur' ? 'p1' : id === 'v-sale1' ? 's1' : 's2',
    narration: '', totalDebit: debitTotal, totalCredit: debitTotal, createdAt: date, status: 'Posted',
  });

  return {
    accountSubtypes: subtypes,
    accounts,
    vouchers: [
      v('v-pur', 'Purchase', '2026-07-01', 10000),
      v('v-sale1', 'Sales', '2026-07-10', 5000),
      v('v-sale2', 'Sales', '2026-05-01', 3000), // no batches before this date
    ],
    journalEntries: [
      { id: 'je-pur-dr', voucherId: 'v-pur', accountId: 'legacy-cogs', debit: 10000, credit: 0 },
      { id: 'je-pur-cr', voucherId: 'v-pur', accountId: 'sup', debit: 0, credit: 10000 },
      { id: 'je-s1-dr', voucherId: 'v-sale1', accountId: 'cust', debit: 5000, credit: 0 },
      { id: 'je-s1-cr', voucherId: 'v-sale1', accountId: 'sales-rev', debit: 0, credit: 5000 },
      { id: 'je-s2-dr', voucherId: 'v-sale2', accountId: 'cust', debit: 3000, credit: 0 },
      { id: 'je-s2-cr', voucherId: 'v-sale2', accountId: 'sales-rev', debit: 0, credit: 3000 },
    ],
    batches: [
      { id: 'b1', batchNo: 'B-1', purchaseId: 'p1', supplierId: 's1', materialId: 'm1', date: '2026-06-01', weight: 0, weightUnit: 'KGs' as const, ratePerUnit: 0, weightPerPiece: 1, initialPcs: 100, remainingPcs: 100, amount: 1000, status: 'Active' as const },
      { id: 'b2', batchNo: 'B-2', purchaseId: 'p2', supplierId: 's1', materialId: 'm1', date: '2026-08-01', weight: 0, weightUnit: 'KGs' as const, ratePerUnit: 0, weightPerPiece: 1, initialPcs: 100, remainingPcs: 100, amount: 3000, status: 'Active' as const },
    ],
    sales: [
      { id: 's1', invoiceNo: 'INV-1', customerId: 'c1', productId: 'pr1', date: '2026-07-10', pcsSold: 10, pricePerPiece: 500, totalAmount: 5000 },
      { id: 's2', invoiceNo: 'INV-2', customerId: 'c1', productId: 'pr1', date: '2026-05-01', pcsSold: 6, pricePerPiece: 500, totalAmount: 3000 },
    ],
    products: [{ id: 'pr1', name: 'Product A', materialId: 'm1', sellingPrice: 500 }],
  };
}

describe('historicalWeightedAverageCost', () => {
  it('averages batches purchased on or before the as-of date only', () => {
    const f = buildFixture();
    // Only b1 (1,000/100 = 10) counts before 2026-07-10
    expect(historicalWeightedAverageCost('m1', f.batches, '2026-07-10')).toBe(10);
    // Both batches count after 2026-08-01: (1,000 + 3,000) / 200 = 20
    expect(historicalWeightedAverageCost('m1', f.batches, '2026-08-01')).toBe(20);
    // Nothing before May
    expect(historicalWeightedAverageCost('m1', f.batches, '2026-04-01')).toBe(0);
  });
});

describe('fixHistoricalPostings', () => {
  it('remaps legacy purchase debits from COGS to Raw Material Inventory', () => {
    const { state, report } = fixHistoricalPostings(buildFixture());
    expect(report.purchasesRemapped).toBe(1);
    const purDr = state.journalEntries.find((e: any) => e.id === 'je-pur-dr');
    expect(purDr.accountId).toBe('rm');
    expect(purDr.debit).toBe(10000);
    // Credit leg untouched
    expect(state.journalEntries.find((e: any) => e.id === 'je-pur-cr').accountId).toBe('sup');
  });

  it('back-fills COGS + Finished Goods on legacy sales at historical cost', () => {
    const { state, report } = fixHistoricalPostings(buildFixture());
    expect(report.salesCogsAdded).toBe(1);
    const sale1Entries = state.journalEntries.filter((e: any) => e.voucherId === 'v-sale1');
    expect(sale1Entries).toHaveLength(4);
    const cogs = sale1Entries.find((e: any) => e.debit > 0 && e.accountId === 'legacy-cogs');
    const fg = sale1Entries.find((e: any) => e.credit > 0 && e.accountId === 'fg');
    expect(cogs.debit).toBe(100); // 10 pcs × 10 cost
    expect(fg.credit).toBe(100);
    const voucher = state.vouchers.find((v: any) => v.id === 'v-sale1');
    expect(voucher.totalDebit).toBe(5100);
    expect(voucher.totalCredit).toBe(5100);
  });

  it('skips sales with no costed batches before the sale date', () => {
    const { state, report } = fixHistoricalPostings(buildFixture());
    expect(report.salesSkippedNoCost).toBe(1);
    expect(state.journalEntries.filter((e: any) => e.voucherId === 'v-sale2')).toHaveLength(2);
  });

  it('is idempotent — a second run changes nothing', () => {
    const first = fixHistoricalPostings(buildFixture());
    const second = fixHistoricalPostings(first.state);
    expect(second.report.purchasesRemapped).toBe(0);
    expect(second.report.salesCogsAdded).toBe(0);
    expect(second.state.journalEntries.length).toBe(first.state.journalEntries.length);
  });

  it('skips entirely when required system accounts are missing', () => {
    const f: any = buildFixture();
    f.accounts = f.accounts.filter((a: any) => a.id !== 'rm');
    const { state, report } = fixHistoricalPostings(f);
    expect(report.skippedMissingAccounts).toBe(true);
    expect(state.journalEntries.length).toBe(f.journalEntries.length);
  });
});

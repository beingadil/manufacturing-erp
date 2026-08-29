import { describe, expect, it } from 'vitest';
import { DashboardSummaryOptions, DashboardSummaryService, DashboardSummaryState } from './DashboardSummaryService';

/**
 * Pure fixture state — no zustand store, no SQLite. Exercises the summary
 * service against hand-built accounts, vouchers, entries and batches.
 */
function buildState(): DashboardSummaryState {
  const subtypes = [
    { id: 'st-cash', name: 'Cash', type: 'Assets' as const, isSystem: true },
    { id: 'st-bank', name: 'Bank', type: 'Assets' as const, isSystem: true },
    { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
    { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
  ];

  const accounts = [
    { id: 'acct-cash', code: '1001', name: 'Cash in Hand', subtypeId: 'st-cash', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    { id: 'acct-bank', code: '1002', name: 'HBL - Business Account', subtypeId: 'st-bank', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: false },
    { id: 'acct-cust', code: '1201', name: 'Customer A', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, linkedEntityId: 'cust-1', parentId: 'acct-ar-control' },
    { id: 'acct-ar-control', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    { id: 'acct-sup', code: '2001', name: 'Supplier A', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 5000, openingBalanceType: 'Credit' as const, status: 'Active' as const, linkedEntityId: 'sup-1', parentId: 'acct-ap-control' },
    { id: 'acct-ap-control', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
    { id: 'acct-rev', code: '4001', name: 'Sales Revenue', subtypeId: 'st-rev', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const },
    { id: 'acct-exp', code: '5001', name: 'Office Expense', subtypeId: 'st-exp', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const },
    { id: 'acct-eq', code: '3001', name: 'Owner Capital', subtypeId: 'st-eq', type: 'Equity' as const, openingBalance: 20000, openingBalanceType: 'Credit' as const, status: 'Active' as const },
  ];

  const v = (id: string, voucherNo: string, date: string, type: string, status: 'Posted' | 'Cancelled' = 'Posted') => ({
    id, voucherNo, date, type, referenceNo: '', sourceModule: 'Cashbook' as const, sourceId: undefined, narration: '', totalDebit: 0, totalCredit: 0, createdAt: date, status,
  });

  const vouchers = [
    v('v-sale', 'SV-0001', '2026-07-01', 'Sales Voucher'),
    v('v-receipt', 'CR-0001', '2026-07-02', 'Cash Receipt'),
    v('v-payment', 'CP-0001', '2026-07-03', 'Cash Payment'),
    v('v-cancelled', 'CP-0002', '2026-07-05', 'Cash Payment', 'Cancelled'),
    v('v-future', 'CR-0002', '2026-08-01', 'Cash Receipt'),
  ];

  const je = (id: string, voucherId: string, accountId: string, debit: number, credit: number) => ({ id, voucherId, accountId, debit, credit });

  const journalEntries = [
    // 1 Jul: sale on credit — Customer DR 20,000 / Revenue CR 20,000
    je('je-1', 'v-sale', 'acct-cust', 20000, 0),
    je('je-2', 'v-sale', 'acct-rev', 0, 20000),
    // 2 Jul: cash receipt from customer — Cash DR 10,000 / Customer CR 10,000
    je('je-3', 'v-receipt', 'acct-cash', 10000, 0),
    je('je-4', 'v-receipt', 'acct-cust', 0, 10000),
    // 3 Jul: expense paid in cash — Expense DR 4,000 / Cash CR 4,000
    je('je-5', 'v-payment', 'acct-exp', 4000, 0),
    je('je-6', 'v-payment', 'acct-cash', 0, 4000),
    // 5 Jul: CANCELLED — must never affect balances or profit
    je('je-7', 'v-cancelled', 'acct-cash', 0, 9999),
    je('je-8', 'v-cancelled', 'acct-exp', 9999, 0),
    // 1 Aug: AFTER asOfDate — must not count toward 31 Jul balances
    je('je-9', 'v-future', 'acct-cash', 5000, 0),
    je('je-10', 'v-future', 'acct-cust', 0, 5000),
  ];

  const batches = [
    // m1: 200,000 for 1,000 pcs (200/pc); 400 raw remaining → 80,000; 50 finished from this batch → 10,000
    { id: 'b1', batchNo: 'B-0001', purchaseId: 'p1', supplierId: 'sup-1', materialId: 'm1', date: '2026-06-01', weight: 0, weightUnit: 'KGs' as const, ratePerUnit: 0, weightPerPiece: 1, initialPcs: 1000, remainingPcs: 400, amount: 200000, status: 'Active' as const, atProcessorPcs: 0, processedPcs: 50 },
    // m1: 100,000 for 500 pcs (200/pc); 500 remaining → 100,000
    { id: 'b2', batchNo: 'B-0002', purchaseId: 'p2', supplierId: 'sup-1', materialId: 'm1', date: '2026-06-15', weight: 0, weightUnit: 'KGs' as const, ratePerUnit: 0, weightPerPiece: 1, initialPcs: 500, remainingPcs: 500, amount: 100000, status: 'Active' as const, atProcessorPcs: 0, processedPcs: 0 },
  ];

  return {
    accounts,
    accountSubtypes: subtypes,
    journalEntries,
    vouchers,
    batches,
    materials: [
      { id: 'm1', name: 'Steel Coil', categoryId: 'c1', status: 'Active' as const, stockPcs: 900, processedStockPcs: 50 },
    ],
    customers: [{ id: 'cust-1', name: 'Customer A', balanceReceivable: 0, accountId: 'acct-cust' }],
    suppliers: [{ id: 'sup-1', name: 'Supplier A', balancePayable: 0, accountId: 'acct-sup' }],
    processors: [],
    sales: [
      { id: 's1', invoiceNo: 'INV-1', customerId: 'cust-1', productId: 'pr1', date: '2026-07-10', pcsSold: 10, pricePerPiece: 3000, totalAmount: 30000 },
      { id: 's2', invoiceNo: 'INV-2', customerId: 'cust-1', productId: 'pr1', date: '2026-09-01', pcsSold: 5, pricePerPiece: 3000, totalAmount: 15000 },
    ],
    purchases: [
      { id: 'p1', purchaseNo: 'PO-1', supplierId: 'sup-1', materialId: 'm1', date: '2026-07-20', weight: 1, weightUnit: 'KGs' as const, ratePerUnit: 12000, weightPerPiece: 1, calculatedPcs: 1, amount: 12000 },
      { id: 'p2', purchaseNo: 'PO-2', supplierId: 'sup-1', materialId: 'm1', date: '2026-08-05', weight: 1, weightUnit: 'KGs' as const, ratePerUnit: 9000, weightPerPiece: 1, calculatedPcs: 1, amount: 9000 },
    ],
    processorBills: [
      { id: 'pb1', billNo: 'BILL-1', processorId: 'pr1', date: '2026-07-15', receiptIds: [], totalAmount: 25000 },
      { id: 'pb2', billNo: 'BILL-2', processorId: 'pr1', date: '2026-08-10', receiptIds: [], totalAmount: 40000 },
    ],
  } as DashboardSummaryState;
}

const options: DashboardSummaryOptions = {
  asOfDate: '2026-07-31',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

describe('DashboardSummaryService.getSummary', () => {
  it('values cash and bank balances as of the period end, excluding future & cancelled vouchers', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    // 10,000 in − 4,000 out = 6,000. Future (+5,000) and cancelled (−9,999) excluded.
    expect(s.cashInHand).toBe(6000);
    expect(s.bankTotal).toBe(0);
  });

  it('derives receivables/payables from linked party sub-ledger balances', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    // Customer: 20,000 sale − 10,000 cash receipt = 10,000 outstanding
    expect(s.receivables.total).toBe(10000);
    expect(s.receivables.customersOutstanding).toBe(1);
    // Supplier: 5,000 credit opening balance
    expect(s.payables.total).toBe(5000);
    expect(s.payables.suppliersOutstanding).toBe(1);
  });

  it('values raw materials from the batch cost basis and processed stock at weighted-average cost', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    // Raw: (200,000/1,000 × 400) + (100,000/500 × 500) = 80,000 + 100,000 = 180,000
    expect(s.inventory.rawMaterials).toBe(180000);
    // Processed: WA cost 180,000/900 = 200 × 50 pcs = 10,000
    expect(s.inventory.processedStock).toBe(10000);
    // Finished goods ARE the processed stock — same value, plus operational quantities
    expect(s.inventory.finishedGoods).toBe(10000);
    expect(s.inventory.rawPcs).toBe(900);
    expect(s.inventory.wipPcs).toBe(0);
    expect(s.inventory.finishedPcs).toBe(50);
    // Batch-basis total (190,000) equals the per-material roll-up (200 × 950 pcs)
    expect(s.inventory.reconciled).toBe(true);
    expect(s.inventory.total).toBe(190000);
  });

  it('computes period profit from posted entries only (opening balances excluded)', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    expect(s.profit.revenue).toBe(20000);
    expect(s.profit.expenses).toBe(4000);
    expect(s.profit.net).toBe(16000);
  });

  it('sums balance-sheet totals and net working capital from the engine balances', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    // Assets: cash 6,000 + customer 10,000 = 16,000 (bank 0)
    expect(s.totalAssets).toBe(16000);
    // Liabilities: supplier 5,000; Equity: owner capital 20,000
    expect(s.totalLiabilities).toBe(5000);
    expect(s.equity).toBe(20000);
    // NWC = cash + bank + receivables + inventory − payables
    expect(s.netWorkingCapital).toBe(6000 + 0 + 10000 + 190000 - 5000);
  });

  it('scopes period sales/purchases/processing and cash receipts/payments to the window', () => {
    const s = DashboardSummaryService.getSummary(buildState(), options);
    expect(s.periodSales).toBe(30000); // Sep sale excluded
    expect(s.periodPurchases).toBe(12000); // Aug purchase excluded
    expect(s.periodProcessing).toBe(25000); // Aug processor bill excluded
    expect(s.periodCashReceipts).toBe(10000);
    expect(s.periodCashPayments).toBe(4000);
  });
});

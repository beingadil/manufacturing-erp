import { beforeAll, describe, expect, it } from 'vitest';
import { AccountingEngine } from '../lib/accounting/AccountingEngine';
import { useERPStore } from './useERPStore';

/**
 * Regression tests for the Supplier / Customer / Processor balance bug.
 *
 * The listing balance (balancePayable / balanceReceivable) MUST be derived from
 * the party's linked account COMPLETE ledger — never from the latest/top entry
 * and never from incremental counters that drift on edit/delete.
 *
 *   Supplier payable  = Total Credits − Total Debits   (credit-normal)
 *   Customer receivable = Total Debits − Total Credits (debit-normal)
 *   Processor follows its own account nature
 *
 * Every assertion here checks:  stored listing balance === ledger closing balance.
 */

function ledgerBalance(accountId: string): number {
  const s = useERPStore.getState();
  return AccountingEngine.getAccountBalances(s.accounts, s.journalEntries, s.vouchers).get(accountId) || 0;
}

function seed() {
  const s = useERPStore.getState();
  useERPStore.setState({
    accountSubtypes: [
      { id: 'st-cash', name: 'Cash', type: 'Assets' as const, isSystem: true },
      { id: 'st-inv', name: 'Inventory', type: 'Assets' as const, isSystem: true },
      { id: 'st-ap', name: 'Accounts Payable', type: 'Liabilities' as const, isSystem: true },
      { id: 'st-ar', name: 'Accounts Receivable', type: 'Assets' as const, isSystem: true },
      { id: 'st-sales', name: 'Sales', type: 'Revenue' as const, isSystem: true },
      { id: 'st-proc', name: 'Processing Expense', type: 'Expenses' as const, isSystem: true },
    ],
    accounts: [
      { id: 'acct-cash', code: '1001', name: 'Cash in Hand', subtypeId: 'st-cash', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-rm', code: '1101', name: 'Raw Material Inventory', subtypeId: 'st-inv', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ap', code: '2000', name: 'Accounts Payable', subtypeId: 'st-ap', type: 'Liabilities' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-ar', code: '1200', name: 'Accounts Receivable', subtypeId: 'st-ar', type: 'Assets' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-sales', code: '4001', name: 'Sales Revenue', subtypeId: 'st-sales', type: 'Revenue' as const, openingBalance: 0, openingBalanceType: 'Credit' as const, status: 'Active' as const, isSystem: true },
      { id: 'acct-proc-exp', code: '5101', name: 'Processing Expense', subtypeId: 'st-proc', type: 'Expenses' as const, openingBalance: 0, openingBalanceType: 'Debit' as const, status: 'Active' as const, isSystem: true },
    ],
    suppliers: [],
    customers: [],
    processors: [],
    purchases: [],
    sales: [],
    batches: [],
    inventoryMovements: [],
    vouchers: [],
    journalEntries: [],
    materials: [],
    products: [],
  } as any);

  const supplierId = s.addSupplier({ name: 'Supplier A' });
  const customerId = s.addCustomer({ name: 'Customer A' });
  const processorId = s.addProcessor({ name: 'Processor A' });
  const materialId = s.addRawMaterial({ name: 'Steel Coil', categoryId: 'c1' });
  s.addProduct({ name: 'Jug', materialId, price: 3000 });
  const st = useERPStore.getState();
  return {
    supplierId,
    customerId,
    processorId,
    materialId,
    supplierAccount: st.accounts.find(a => a.linkedEntityId === supplierId)!,
    customerAccount: st.accounts.find(a => a.linkedEntityId === customerId)!,
    processorAccount: st.accounts.find(a => a.linkedEntityId === processorId)!,
  };
}

describe('party balances derive from the COMPLETE ledger', () => {
  let ids: ReturnType<typeof seed>;

  beforeAll(() => {
    ids = seed();
  });

  it('supplier: purchase → payable = ledger; full payment → 0, even though the latest entry is the large credit', () => {
    const { supplierId, materialId, supplierAccount } = ids;

    // Purchase of 1,000 KGs @ 276 = Rs 276,000 on credit
    useERPStore.getState().addPurchase({
      supplierId,
      materialId,
      date: '2026-08-01',
      weight: 1000,
      weightUnit: 'KGs',
      ratePerUnit: 276,
      weightPerPiece: 0.25,
    } as any);

    let s = useERPStore.getState();
    expect(s.suppliers[0].balancePayable).toBe(276000);
    expect(s.suppliers[0].balancePayable).toBe(ledgerBalance(supplierAccount.id));

    // Full payment of Rs 276,000 via the cash payment flow (AccountingEngine
    // posts the voucher AND recomputes the party balance from the ledger).
    AccountingEngine.createVoucher(
      { date: '2026-08-02', type: 'Cash Payment' as any, sourceModule: 'Cashbook' as any, narration: 'Full payment' },
      [
        { accountId: supplierAccount.id, debit: 276000, credit: 0 },
        { accountId: 'acct-cash', debit: 0, credit: 276000 },
      ]
    );

    s = useERPStore.getState();
    // THE BUG: balance was previously taken from the latest/top entry (the
    // 276,000 credit) or left at the stale incremental value. It must be 0.
    expect(s.suppliers[0].balancePayable).toBe(0);
    expect(s.suppliers[0].balancePayable).toBe(ledgerBalance(supplierAccount.id));
  });

  it('supplier: editing the payment voucher reconciles the listing balance to the ledger (176,000 owed)', () => {
    const { supplierAccount } = ids;
    const s = useERPStore.getState();
    const paymentVoucher = s.vouchers.find(v => v.type === 'Cash Payment')!;

    // Edit the payment from 276,000 to 100,000 — true payable = 276,000 − 100,000
    AccountingEngine.updateVoucher(
      paymentVoucher.id,
      { date: paymentVoucher.date },
      [
        { accountId: supplierAccount.id, debit: 100000, credit: 0 },
        { accountId: 'acct-cash', debit: 0, credit: 100000 },
      ]
    );

    const st = useERPStore.getState();
    expect(ledgerBalance(supplierAccount.id)).toBe(176000);
    expect(st.suppliers[0].balancePayable).toBe(176000);
  });

  it('supplier: deleting the payment voucher restores the full payable from the ledger', () => {
    const { supplierAccount } = ids;
    const s = useERPStore.getState();
    const paymentVoucher = s.vouchers.find(v => v.type === 'Cash Payment')!;

    AccountingEngine.deleteVoucher(paymentVoucher.id);

    const st = useERPStore.getState();
    expect(ledgerBalance(supplierAccount.id)).toBe(276000);
    expect(st.suppliers[0].balancePayable).toBe(276000);
  });

  it('customer: sale → receivable = ledger; partial receipt reduces it exactly', () => {
    const { customerId, materialId, customerAccount } = ids;
    const s = useERPStore.getState();

    // Move 100 pcs to finished stock (dispatch → receipt) so the sale is legal
    s.addProcessingSend({ processorId: ids.processorId, materialId, date: '2026-08-05', pcsSent: 100, ratePerPiece: 50 });
    const sendId = useERPStore.getState().processingSends[0].id;
    s.addProcessingReceipt({ sendId, processorId: ids.processorId, materialId, date: '2026-08-06', pcsReceived: 100 });

    // Sale of 100 pcs @ 3,000 = Rs 300,000 on credit
    s.addSale({ customerId, productId: s.products[0].id, date: '2026-08-07', pcsSold: 100, pricePerPiece: 3000 } as any);

    let st = useERPStore.getState();
    expect(st.customers[0].balanceReceivable).toBe(300000);
    expect(st.customers[0].balanceReceivable).toBe(ledgerBalance(customerAccount.id));

    // Partial cash receipt of 100,000
    AccountingEngine.createVoucher(
      { date: '2026-08-08', type: 'Cash Receipt' as any, sourceModule: 'Cashbook' as any, narration: 'Partial receipt' },
      [
        { accountId: 'acct-cash', debit: 100000, credit: 0 },
        { accountId: customerAccount.id, debit: 0, credit: 100000 },
      ]
    );

    st = useERPStore.getState();
    expect(ledgerBalance(customerAccount.id)).toBe(200000);
    expect(st.customers[0].balanceReceivable).toBe(200000);
  });

  it('processor: bill → payable = ledger; payment settles it to 0', () => {
    const { processorId, processorAccount } = ids;
    const s = useERPStore.getState();

    // Bill the 100-pc receipt at Rs 50/pc = Rs 5,000
    const receiptId = s.processingReceipts[0].id;
    s.addProcessorBill({ processorId, date: '2026-08-09', receiptIds: [receiptId] });

    let st = useERPStore.getState();
    expect(ledgerBalance(processorAccount.id)).toBe(5000);
    expect(st.processors[0].balancePayable).toBe(5000);

    // Pay the processor in full
    AccountingEngine.createVoucher(
      { date: '2026-08-10', type: 'Cash Payment' as any, sourceModule: 'Cashbook' as any, narration: 'Processor payment' },
      [
        { accountId: processorAccount.id, debit: 5000, credit: 0 },
        { accountId: 'acct-cash', debit: 0, credit: 5000 },
      ]
    );

    st = useERPStore.getState();
    expect(ledgerBalance(processorAccount.id)).toBe(0);
    expect(st.processors[0].balancePayable).toBe(0);
  });

  it('recomputePartyBalances is idempotent — never changes a reconciled balance', () => {
    const s = useERPStore.getState();
    const before = {
      supplier: s.suppliers[0].balancePayable,
      customer: s.customers[0].balanceReceivable,
      processor: s.processors[0].balancePayable,
    };
    AccountingEngine.recomputePartyBalances();
    const after = useERPStore.getState();
    expect(after.suppliers[0].balancePayable).toBe(before.supplier);
    expect(after.customers[0].balanceReceivable).toBe(before.customer);
    expect(after.processors[0].balancePayable).toBe(before.processor);
  });
});

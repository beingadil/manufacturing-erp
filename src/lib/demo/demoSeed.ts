/**
 * Demo data seeder — DEV SERVER ONLY.
 *
 * Seeds a realistic, internally-consistent manufacturing scenario across every
 * module (master data, purchases, processing, sales, cash cycle, accounting)
 * so the app is never empty in development. The Balance Sheet produced by this
 * dataset is BALANCED by design:
 *
 *   Assets 897,500 = Liabilities 358,000 + Equity 539,500
 *
 * The seeder is gated on `import.meta.env.DEV` in main.tsx and never ships in
 * production builds (Vite statically replaces DEV with false and tree-shakes
 * the import). It is idempotent: it only runs once per browser profile and
 * never touches existing user data.
 */
import { useERPStore } from '../../store/useERPStore';
import type { Account, VoucherType } from '../../types/erp';
import { getSystemAccountBySubtype, getSystemInventoryAccount } from '../accounting/accountClassification';

const DAY_MS = 24 * 60 * 60 * 1000;
/** ISO date `n` days before today, so "This Week / This Month" filters show data. */
const dateAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().split('T')[0];

const SEED_MARKER = 'manufacturing-erp-demo-seeded';

function postVoucher(
  date: string,
  narration: string,
  entries: { account: Account; debit: number; credit: number }[],
  type: VoucherType = 'Journal Voucher',
  referenceNo?: string
) {
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  useERPStore.getState().addVoucher(
    {
      date,
      type,
      referenceNo,
      sourceModule: 'Manual',
      narration,
      totalDebit,
      totalCredit,
      status: 'Posted',
      createdBy: 'System (demo data)',
    },
    entries.map(e => ({ accountId: e.account.id, debit: e.debit, credit: e.credit }))
  );
}

function postTransfer(date: string, dr: Account, cr: Account, amount: number, narration: string) {
  postVoucher(date, narration, [
    { account: dr, debit: amount, credit: 0 },
    { account: cr, debit: 0, credit: amount },
  ]);
}

function postDrCr(
  date: string,
  dr: Account | undefined,
  cr: Account | undefined,
  amount: number,
  narration: string,
  type: VoucherType = 'Journal Voucher'
) {
  if (!dr || !cr) return;
  postVoucher(date, narration, [
    { account: dr, debit: amount, credit: 0 },
    { account: cr, debit: 0, credit: amount },
  ], type);
}

export function seedDemoData(): { seeded: boolean; reason?: string } {
  const store = useERPStore.getState();

  // Idempotency: never seed over existing user data, and never re-seed after
  // the user wiped everything (System Maintenance wipe clears the ERP store but
  // leaves this marker, so a wipe gives a clean slate).
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_MARKER)) {
      return { seeded: false, reason: 'demo already seeded once on this machine' };
    }
  } catch { /* localStorage unavailable */ }

  if (
    store.customers.length > 0 || store.suppliers.length > 0 || store.processors.length > 0 ||
    store.purchases.length > 0 || store.sales.length > 0 || store.categories.length > 0 ||
    store.materials.length > 0
  ) {
    return { seeded: false, reason: 'existing data present — seed skipped' };
  }

  const { accounts, accountSubtypes } = store;
  const findAccount = (name: string) => accounts.find(a => a.name === name);
  const cash = findAccount('Cash in Hand');
  const bank = findAccount('Bank - Primary');
  const ownerCapital = findAccount("Owner's Capital");
  const rent = findAccount('Rent Expense');
  const salaries = findAccount('Salaries Expense');
  const utilities = findAccount('Utilities Expense');

  const rawInventory = getSystemInventoryAccount(accounts, accountSubtypes, 'Raw Material Inventory');
  const wipInventory = getSystemInventoryAccount(accounts, accountSubtypes, 'Work in Progress Inventory');
  const finishedInventory = getSystemInventoryAccount(accounts, accountSubtypes, 'Finished Goods Inventory');
  const salesRevenue = getSystemAccountBySubtype(accounts, accountSubtypes, 'Sales');

  if (!cash || !bank || !ownerCapital || !rent || !salaries || !utilities ||
    !rawInventory || !wipInventory || !finishedInventory || !salesRevenue) {
    return { seeded: false, reason: 'Chart of Accounts not fully seeded yet' };
  }

  // Mark BEFORE creating anything so a partial failure never re-runs.
  try { localStorage.setItem(SEED_MARKER, '1'); } catch { /* noop */ }

  const partyAccount = (partyId: string) =>
    useERPStore.getState().accounts.find(a => a.linkedEntityId === partyId);

  // ── Opening balances (the equity that funds the cash) ────────────────────
  store.updateAccount(cash.id, { openingBalance: 500000, openingBalanceType: 'Debit' });
  store.updateAccount(ownerCapital.id, { openingBalance: 500000, openingBalanceType: 'Credit' });

  // ── Master data ──────────────────────────────────────────────────────────
  const catRaw = store.addCategory({ name: 'Raw Material', description: 'Base manufacturing inputs', status: 'Active' });
  const catPack = store.addCategory({ name: 'Packaging', description: 'Packing & finishing materials', status: 'Active' });

  const steelId = store.addRawMaterial({
    name: 'Steel Coil', categoryId: catRaw, unit: 'KGs', minStockLevel: 500,
    description: 'CRCA steel coil — 0.25 kg per piece', status: 'Active',
  });
  const aluminumId = store.addRawMaterial({
    name: 'Aluminum Sheet', categoryId: catRaw, unit: 'KGs', minStockLevel: 300,
    description: 'Aluminum sheet — 0.2 kg per piece', status: 'Active',
  });
  store.addRawMaterial({
    name: 'Packing Cartons', categoryId: catPack, unit: 'PCS', minStockLevel: 200,
    description: 'Export-grade cartons', status: 'Active',
  });

  const supplierA = store.addSupplier({
    name: 'Adil Traders', contactPerson: 'Adil', phone: '+92 300 1234567',
    email: 'sales@adiltraders.com', address: 'G-9 Industrial Estate, Karachi',
    ntn: 'NTN-1001', notes: 'Steel supplier', status: 'Active',
  });
  const supplierB = store.addSupplier({
    name: 'Ahmed Steel', contactPerson: 'Ahmed', phone: '+92 301 7654321',
    email: 'info@ahmedsteel.com', address: 'SITE Area, Lahore',
    ntn: 'NTN-1002', notes: 'Aluminum supplier', status: 'Active',
  });

  const customerA = store.addCustomer({
    name: 'JKJ Industries', contactPerson: 'Javed', phone: '+92 302 5556667',
    email: 'orders@jkj.com', address: 'Faisalabad', ntn: 'NTN-2001', status: 'Active',
  });
  store.addCustomer({
    name: 'Bismillah Traders', contactPerson: 'Bismillah', phone: '+92 303 2223334',
    email: 'info@bismillahtraders.com', address: 'Multan', ntn: 'NTN-2002', status: 'Active',
  });

  const processorA = store.addProcessor({
    name: 'Sharif Processing', contactPerson: 'Sharif', phone: '+92 304 9998887',
    email: 'work@sharifprocessing.com', address: 'Karachi',
    notes: 'Stitching & finishing', status: 'Active',
  });
  store.addProcessor({
    name: 'Greenline Job Work', contactPerson: 'Greenline', phone: '+92 305 4445556',
    email: 'contact@greenline.com', address: 'Lahore', status: 'Active',
  });

  // ── Purchases (auto-post DR Raw Material Inventory / CR Supplier AP) ─────
  // Steel: 1,000 KGs × Rs 300 = Rs 300,000 → 4,000 PCS @ Rs 75/PCS
  store.addPurchase({
    supplierId: supplierA, materialId: steelId, date: dateAgo(12),
    weight: 1000, weightUnit: 'KGs', ratePerUnit: 300, weightPerPiece: 0.25,
    invoiceNo: 'SUP-INV-1001', remarks: 'Steel coil purchase',
  });
  // Aluminum: 500 KGs × Rs 400 = Rs 200,000 → 2,500 PCS @ Rs 80/PCS
  store.addPurchase({
    supplierId: supplierB, materialId: aluminumId, date: dateAgo(11),
    weight: 500, weightUnit: 'KGs', ratePerUnit: 400, weightPerPiece: 0.2,
    invoiceNo: 'SUP-INV-1002', remarks: 'Aluminum sheet purchase',
  });

  // ── Processing: send 4,000 PCS steel → receive finished → processor bill ─
  store.addProcessingSend({
    processorId: processorA, materialId: steelId, date: dateAgo(10),
    pcsSent: 4000, ratePerPiece: 2, remarks: 'Stitching & finishing dispatch',
  });
  const sendId = useERPStore.getState().processingSends[0]?.id;
  if (sendId) {
    store.addProcessingReceipt({
      sendId, processorId: processorA, materialId: steelId, date: dateAgo(8),
      pcsReceived: 4000, remarks: 'All 4,000 PCS received back',
    });
  }
  const receipt = useERPStore.getState().processingReceipts[0];
  if (receipt) {
    store.addProcessorBill({
      processorId: processorA, date: dateAgo(8),
      receiptIds: [receipt.id], remarks: 'Processing charges @ Rs 2/PCS',
    });
  }

  // Finished-goods product linked to the steel material
  const productId = store.addProduct({
    name: 'Stitched Coil Sheets', materialId: steelId, categoryId: catRaw, unit: 'PCS',
    price: 150, sellingPrice: 150, sku: 'FG-STL-001',
    description: 'Finished stitched sheets from steel coil', status: 'Active',
  });

  // ── Sale (auto-posts DR AR / CR Sales + DR COGS / CR Finished Goods) ─────
  // 1,500 PCS × Rs 150 = Rs 225,000; COGS = 1,500 × Rs 75 = Rs 112,500
  store.addSale({
    customerId: customerA, productId, date: dateAgo(5),
    pcsSold: 1500, pricePerPiece: 150,
  });

  // ── Inventory transfers mirroring the processing movement ────────────────
  // The app's Processing module does not auto-post these transfers (a known,
  // documented gap), so the demo includes them to keep the Balance Sheet
  // reconciled with physical stock: Raw → WIP on dispatch, WIP → Finished on
  // receipt. Same economic value, just moving state.
  // postTransfer(date, DR, CR, amount, narration) — the material LEAVES the
  // debit side and ENTERS the credit side of the transfer.
  postTransfer(
    dateAgo(10),
    wipInventory, rawInventory, 300000,
    'Transfer: Raw Material → Work in Progress (dispatch of 4,000 PCS steel to processor)'
  );
  postTransfer(
    dateAgo(8),
    finishedInventory, wipInventory, 300000,
    'Transfer: Work in Progress → Finished Goods (4,000 PCS received from processor)'
  );

  // ── Cash cycle ───────────────────────────────────────────────────────────
  postDrCr(
    dateAgo(4), cash, partyAccount(customerA), 100000,
    'Cash received from JKJ Industries against invoice', 'Cash Receipt'
  );
  postDrCr(
    dateAgo(3), partyAccount(supplierA), cash, 150000,
    'Payment to Adil Traders against purchase', 'Cash Payment'
  );
  postDrCr(dateAgo(3), rent, cash, 20000, 'Factory rent for the month', 'Cash Payment');
  postDrCr(dateAgo(2), salaries, cash, 40000, 'Monthly salaries', 'Cash Payment');
  postDrCr(dateAgo(2), utilities, cash, 5000, 'Electricity & utilities bill', 'Cash Payment');
  postDrCr(dateAgo(1), bank, cash, 200000, 'Cash deposited into Bank - Primary', 'Bank Receipt');

  return { seeded: true };
}

/**
 * Dev helper: wipes the ERP store and re-seeds Chart of Accounts + demo data.
 * Exposed on `window.__resetDemoData()` in dev so a fresh demo can be
 * regenerated without restarting the dev server.
 */
export async function resetDemoData(): Promise<{ seeded: boolean; reason?: string }> {
  try { localStorage.removeItem(SEED_MARKER); } catch { /* noop */ }
  useERPStore.getState().wipeAllData();

  const { seedDefaultChartOfAccounts } = await import('../chartOfAccountsSeed');
  const st = useERPStore.getState();
  seedDefaultChartOfAccounts(
    () => useERPStore.getState(),
    { addAccountSubtype: st.addAccountSubtype, addAccount: st.addAccount } as any
  );
  return seedDemoData();
}

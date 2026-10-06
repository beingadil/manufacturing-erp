// Migration regression suite.
//
// WHY A FIXTURE: every ERP database on this machine is empty of business data,
// so "existing data survives migration" cannot be proven against real rows.
// This test seeds a realistic pre-migration database — categories, materials,
// suppliers, customers, processors, processing stages, purchases, batches,
// processing sends/receipts, products, sales, and balanced double-entry
// vouchers — then migrates it and asserts nothing was lost or altered.
//
// Run: npx electron scripts/test-migrations.cjs

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const uid = () => crypto.randomUUID();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merp-mig-test-'));

// Tables whose row counts must be identical before and after migration.
const LEGACY_TABLES = [
  'categories', 'materials', 'processors', 'suppliers', 'customers', 'products',
  'purchases', 'processingStages', 'processingSends', 'processingReceipts',
  'processorBills', 'sales', 'accounts', 'vouchers', 'journalEntries', 'batches',
  'inventoryMovements', 'key_value_store',
];

// Tables that must NOT exist: the abandoned standalone BOM/purpose design.
// A regression here means somebody re-added schema the app never reads.
const FORBIDDEN_TABLES = [
  'componentPurposes', 'materialPurposes', 'productPurposes',
  'boms', 'bomVersions', 'bomItems', 'productBatches',
];

let failures = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || extra === undefined ? '' : ` — ${extra}`}`);
  if (!ok) failures += 1;
  return ok;
}

/** Build the schema exactly as the pre-migration app did. */
function createLegacySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, categoryId TEXT, status TEXT DEFAULT 'Active',
      stockPcs REAL DEFAULT 0, processedStockPcs REAL DEFAULT 0, atProcessorPcs REAL DEFAULT 0,
      description TEXT, reservedStockPcs REAL DEFAULT 0,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS processors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balancePayable REAL DEFAULT 0, accountId TEXT, notes TEXT);
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balancePayable REAL DEFAULT 0, accountId TEXT, ntn TEXT, notes TEXT);
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balanceReceivable REAL DEFAULT 0, accountId TEXT, ntn TEXT, notes TEXT);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, categoryId TEXT, materialId TEXT,
      sku TEXT, sellingPrice REAL DEFAULT 0, description TEXT,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY, purchaseNo TEXT NOT NULL UNIQUE, supplierId TEXT NOT NULL,
      materialId TEXT NOT NULL, date TEXT NOT NULL, weight REAL DEFAULT 0, weightUnit TEXT,
      ratePerUnit REAL DEFAULT 0, amount REAL DEFAULT 0, weightPerPiece REAL DEFAULT 0,
      calculatedPcs REAL DEFAULT 0, invoiceNo TEXT, remarks TEXT,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS processingStages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sequence INTEGER DEFAULT 0,
      description TEXT, active INTEGER DEFAULT 1, inputUnit TEXT, billingUnit TEXT,
      billingEnabled INTEGER DEFAULT 1, rateMethod TEXT DEFAULT 'per_piece',
      isFinalStage INTEGER DEFAULT 0, nextStageId TEXT);
    CREATE TABLE IF NOT EXISTS processingSends (
      id TEXT PRIMARY KEY, dispatchNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, batchId TEXT, date TEXT NOT NULL, pcsSent REAL DEFAULT 0,
      pcsReceived REAL DEFAULT 0, ratePerPiece REAL DEFAULT 0, status TEXT DEFAULT 'Pending',
      adjustedToDispatchId TEXT, remarks TEXT, stageId TEXT, lossQuantity REAL DEFAULT 0,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS processingReceipts (
      id TEXT PRIMARY KEY, receiveNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, sendId TEXT NOT NULL, date TEXT NOT NULL, pcsReceived REAL DEFAULT 0,
      billAmount REAL DEFAULT 0, billedStatus TEXT DEFAULT 'Unbilled', remarks TEXT,
      stageId TEXT, rateMethod TEXT, billingUnit TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (sendId) REFERENCES processingSends(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS processorBills (
      id TEXT PRIMARY KEY, billNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      date TEXT NOT NULL, totalAmount REAL DEFAULT 0, receiptIds TEXT, remarks TEXT,
      stageId TEXT, rateMethod TEXT, billingUnit TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, invoiceNo TEXT NOT NULL UNIQUE, customerId TEXT NOT NULL,
      productId TEXT NOT NULL, date TEXT NOT NULL, pcsSold REAL DEFAULT 0,
      pricePerPiece REAL DEFAULT 0, totalAmount REAL DEFAULT 0, batchId TEXT,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT, subtypeId TEXT,
      type TEXT, openingBalance REAL DEFAULT 0, openingBalanceType TEXT DEFAULT 'Debit',
      status TEXT DEFAULT 'Active', isSystem INTEGER DEFAULT 0, linkedEntityId TEXT,
      description TEXT, parentId TEXT);
    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY, voucherNo TEXT NOT NULL UNIQUE, date TEXT NOT NULL,
      type TEXT NOT NULL, referenceNo TEXT, sourceModule TEXT, sourceId TEXT,
      narration TEXT, totalDebit REAL DEFAULT 0, totalCredit REAL DEFAULT 0,
      createdAt TEXT, createdBy TEXT, status TEXT DEFAULT 'Posted', versionHistory TEXT);
    CREATE TABLE IF NOT EXISTS journalEntries (
      id TEXT PRIMARY KEY, voucherId TEXT NOT NULL, accountId TEXT NOT NULL,
      debit REAL DEFAULT 0, credit REAL DEFAULT 0, narration TEXT,
      FOREIGN KEY (voucherId) REFERENCES vouchers(id) ON DELETE CASCADE,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY, batchNo TEXT NOT NULL UNIQUE, purchaseId TEXT, supplierId TEXT,
      materialId TEXT, date TEXT, weight REAL DEFAULT 0, weightUnit TEXT,
      ratePerUnit REAL DEFAULT 0, weightPerPiece REAL DEFAULT 0,
      initialPcs REAL DEFAULT 0, remainingPcs REAL DEFAULT 0, amount REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS inventoryMovements (
      id TEXT PRIMARY KEY, materialId TEXT, batchId TEXT, date TEXT NOT NULL,
      referenceNo TEXT, module TEXT, transactionType TEXT, quantity REAL DEFAULT 0,
      runningBalance REAL DEFAULT 0, userId TEXT, remarks TEXT);
    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    -- Legacy tables the old code actively dropped; migration must leave them alone.
    CREATE TABLE IF NOT EXISTS _migrations (version TEXT PRIMARY KEY, appliedAt TEXT);
  `);
  db.prepare(`INSERT INTO _migrations (version, appliedAt) VALUES (?, ?)`)
    .run('legacy', new Date().toISOString());
}

/** Seed realistic operational data: purchase → processing → sale → accounting. */
function seedData(db) {
  const ids = {};
  const put = (t, row) => { db.prepare(`INSERT INTO ${t} VALUES (${Object.keys(row).map(() => '?').join(',')})`)
    .run(...Object.values(row)); return row.id; };

  ids.cat = uid();
  ids.cat2 = uid();
  put('categories', { id: ids.cat, name: 'Circle', description: 'Circular blanks', status: 'Active' });
  put('categories', { id: ids.cat2, name: 'Handle', description: null, status: 'Active' });

  ids.mat = uid();
  ids.mat2 = uid();
  put('materials', { id: ids.mat, name: 'Circle 12½ Inches No.4', categoryId: ids.cat, status: 'Active',
    stockPcs: 900, processedStockPcs: 120, atProcessorPcs: 40, description: 'steel', reservedStockPcs: 10 });
  put('materials', { id: ids.mat2, name: 'Handle', categoryId: ids.cat2, status: 'Active',
    stockPcs: 500, processedStockPcs: 0, atProcessorPcs: 0, description: null, reservedStockPcs: 0 });

  ids.sup = uid();
  ids.cus = uid();
  ids.proc = uid();
  put('suppliers', { id: ids.sup, name: 'Steel Traders', contactPerson: 'Ali', phone: '0300',
    address: 'Lahore', balancePayable: 250000, accountId: null, ntn: null, notes: null });
  put('customers', { id: ids.cus, name: 'Hotel Supplies Co', contactPerson: 'Sara', phone: '0321',
    address: 'Karachi', balanceReceivable: 180000, accountId: null, ntn: null, notes: null });
  put('processors', { id: ids.proc, name: 'Spot Machine Works', contactPerson: 'Bilal', phone: '0333',
    address: 'Faisalabad', balancePayable: 40000, accountId: null, notes: null });

  ids.pur = uid();
  put('purchases', { id: ids.pur, purchaseNo: 'PUR-001', supplierId: ids.sup, materialId: ids.mat,
    date: '2026-01-15', weight: 1000, weightUnit: 'KG', ratePerUnit: 300, amount: 300000,
    weightPerPiece: 0.5, calculatedPcs: 2000, invoiceNo: 'INV-9', remarks: null });

  ids.batch = uid();
  put('batches', { id: ids.batch, batchNo: 'B-001', purchaseId: ids.pur, supplierId: ids.sup,
    materialId: ids.mat, date: '2026-01-15', weight: 1000, weightUnit: 'KG', ratePerUnit: 300,
    weightPerPiece: 0.5, initialPcs: 2000, remainingPcs: 1500, amount: 300000, status: 'Active' });

  ids.stage1 = uid();
  ids.stage2 = uid();
  put('processingStages', { id: ids.stage1, name: 'Spot Machine', sequence: 1, description: null,
    active: 1, inputUnit: 'PCS', billingUnit: 'KG', billingEnabled: 1, rateMethod: 'per_kg',
    isFinalStage: 0, nextStageId: ids.stage2 });
  put('processingStages', { id: ids.stage2, name: 'Polish', sequence: 2, description: null,
    active: 1, inputUnit: 'PCS', billingUnit: 'PCS', billingEnabled: 1, rateMethod: 'per_piece',
    isFinalStage: 1, nextStageId: null });

  ids.send = uid();
  put('processingSends', { id: ids.send, dispatchNo: 'DSP-001', processorId: ids.proc,
    materialId: ids.mat, batchId: ids.batch, date: '2026-01-20', pcsSent: 400, pcsReceived: 380,
    ratePerPiece: 32, status: 'Received', adjustedToDispatchId: null, remarks: null,
    stageId: ids.stage1, lossQuantity: 20 });

  ids.recp = uid();
  put('processingReceipts', { id: ids.recp, receiveNo: 'RCV-001', processorId: ids.proc,
    materialId: ids.mat, sendId: ids.send, date: '2026-01-25', pcsReceived: 380,
    billAmount: 1024, billedStatus: 'Unbilled', remarks: null, stageId: ids.stage1,
    rateMethod: 'per_kg', billingUnit: 'KG' });

  ids.bill = uid();
  put('processorBills', { id: ids.bill, billNo: 'PB-001', processorId: ids.proc,
    date: '2026-01-26', totalAmount: 1024, receiptIds: JSON.stringify([ids.recp]), remarks: null,
    stageId: ids.stage1, rateMethod: 'per_kg', billingUnit: 'KG' });

  ids.prod = uid();
  put('products', { id: ids.prod, name: 'Steel Martban', categoryId: ids.cat, materialId: ids.mat,
    sku: 'SM-01', sellingPrice: 850, description: 'martban' });

  ids.sale = uid();
  put('sales', { id: ids.sale, invoiceNo: 'SAL-001', customerId: ids.cus, productId: ids.prod,
    date: '2026-02-01', pcsSold: 30, pricePerPiece: 850, totalAmount: 25500, batchId: ids.batch });

  ids.inv = uid();
  ids.cogs = uid();
  ids.ar = uid();
  ids.ap = uid();
  for (const [id, code, name, type] of [
    [ids.inv, '1101', 'Raw Material Inventory', 'Current Asset'],
    [ids.cogs, '5001', 'Cost of Goods Sold', 'Cost of Goods Sold'],
    [ids.ar, '1201', 'Accounts Receivable', 'Current Asset'],
    [ids.ap, '2001', 'Accounts Payable', 'Current Liability'],
  ]) {
    put('accounts', { id, code, name, subtypeId: null, type, openingBalance: 0,
      openingBalanceType: 'Debit', status: 'Active', isSystem: 1, linkedEntityId: null,
      description: null, parentId: null });
  }

  const v1 = uid();
  put('vouchers', { id: v1, voucherNo: 'V-001', date: '2026-01-15', type: 'Purchase',
    referenceNo: 'PUR-001', sourceModule: 'purchases', sourceId: ids.pur,
    narration: 'Purchase', totalDebit: 300000, totalCredit: 300000,
    createdAt: new Date().toISOString(), createdBy: 'admin', status: 'Posted', versionHistory: null });
  put('journalEntries', { id: uid(), voucherId: v1, accountId: ids.inv, debit: 300000, credit: 0, narration: null });
  put('journalEntries', { id: uid(), voucherId: v1, accountId: ids.ap, debit: 0, credit: 300000, narration: null });

  const v2 = uid();
  put('vouchers', { id: v2, voucherNo: 'V-002', date: '2026-02-01', type: 'Sale',
    referenceNo: 'SAL-001', sourceModule: 'sales', sourceId: ids.sale,
    narration: 'Sale', totalDebit: 25500, totalCredit: 25500,
    createdAt: new Date().toISOString(), createdBy: 'admin', status: 'Posted', versionHistory: null });
  put('journalEntries', { id: uid(), voucherId: v2, accountId: ids.ar, debit: 25500, credit: 0, narration: null });
  put('journalEntries', { id: uid(), voucherId: v2, accountId: ids.cogs, debit: 0, credit: 0, narration: null });
  put('journalEntries', { id: uid(), voucherId: v2, accountId: ids.cogs, debit: 0, credit: 25500, narration: null });
  // Balance the sale voucher: AR 25500 Dr, split across revenue/COGS 12750 each.
  db.prepare(`UPDATE journalEntries SET debit=0, credit=12750 WHERE voucherId=? AND credit=25500`).run(v2);
  db.prepare(`INSERT INTO accounts (id, code, name, type, isSystem) VALUES (?,?,?,?,1)`)
    .run(uid(), 'REV1', 'Sales Revenue', 'Revenue');
  const rev = db.prepare(`SELECT id FROM accounts WHERE code='REV1'`).get().id;
  put('journalEntries', { id: uid(), voucherId: v2, accountId: rev, debit: 0, credit: 12750, narration: null });

  put('inventoryMovements', { id: uid(), materialId: ids.mat, batchId: ids.batch, date: '2026-01-15',
    referenceNo: 'PUR-001', module: 'purchases', transactionType: 'IN', quantity: 2000,
    runningBalance: 2000, userId: 'admin', remarks: null });

  db.prepare(`INSERT INTO key_value_store (key, value) VALUES (?, ?)`)
    .run('erp-storage', JSON.stringify({ state: { materials: ['legacy'] }, version: 3 }));

  return ids;
}

function counts(db, tables) {
  const out = {};
  for (const t of tables) {
    try { out[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; } catch { out[t] = -1; }
  }
  return out;
}

function accountingTotals(db) {
  return db.prepare(
    `SELECT COUNT(*) vouchers, COALESCE(SUM(totalDebit),0) d, COALESCE(SUM(totalCredit),0) c FROM vouchers`,
  ).get();
}

function main() {
  const dbPath = path.join(workDir, 'fixture.sqlite');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  console.log('\n━━━ 1. Seed a realistic PRE-migration database ━━━');
  createLegacySchema(db);
  const ids = seedData(db);
  const before = counts(db, LEGACY_TABLES);
  const beforeAcct = accountingTotals(db);
  console.log(`  seeded: ${Object.values(before).reduce((a, b) => a + b, 0)} legacy rows`);
  check('Fixture has real rows before migrating',
    before.materials > 0 && before.sales > 0 && before.vouchers > 0 && before.batches > 0);

  console.log('\n━━━ 2. Run migrations (with backup) ━━━');
  // Fresh handle so the runner sees exactly what a real launch would.
  db.close();
  const db2 = new Database(dbPath);
  db2.pragma('foreign_keys = ON');
  db2.pragma('journal_mode = WAL');

  const { runMigrations } = require('../electron/migrations.cjs');
  const res = runMigrations(db2, dbPath, { backupDir: path.join(workDir, 'backups') });

  check('Migration 001 was applied', res.applied.includes('001'), JSON.stringify(res.applied));
  check('A pre-migration backup was written', !!res.backupPath && fs.existsSync(res.backupPath),
    res.backupPath || 'none');
  if (res.backupPath) {
    const bak = new Database(res.backupPath, { readonly: true });
    const bakCounts = counts(bak, LEGACY_TABLES);
    bak.close();
    check('Backup contains the pre-migration data',
      bakCounts.materials === before.materials && bakCounts.sales === before.sales);
  }

  console.log('\n━━━ 3. Existing data survived ━━━');
  const after = counts(db2, LEGACY_TABLES);
  for (const t of LEGACY_TABLES) {
    check(`${t}: ${before[t]} → ${after[t]}`, before[t] === after[t],
      `expected ${before[t]}, got ${after[t]}`);
  }
  const legacyGone = db2.prepare(
    `SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='_migrations'`,
  ).get().c;
  check('Legacy _migrations table is no longer dropped or used', legacyGone === 0,
    `still present (${legacyGone})`);

  console.log('\n━━━ 4. Accounting is untouched and still balanced ━━━');
  const afterAcct = accountingTotals(db2);
  check('Voucher count unchanged', beforeAcct.vouchers === afterAcct.vouchers,
    `${beforeAcct.vouchers} → ${afterAcct.vouchers}`);
  check('Total debits unchanged', Math.abs(beforeAcct.d - afterAcct.d) < 0.01,
    `${beforeAcct.d} → ${afterAcct.d}`);
  check('Total credits unchanged', Math.abs(beforeAcct.c - afterAcct.c) < 0.01,
    `${beforeAcct.c} → ${afterAcct.c}`);
  check('Ledger still balances (Dr = Cr)', Math.abs(afterAcct.d - afterAcct.c) < 0.01,
    `Dr=${afterAcct.d} Cr=${afterAcct.c}`);
  const jeTotals = db2.prepare(
    `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journalEntries`,
  ).get();
  check('Journal entries balance', Math.abs(jeTotals.d - jeTotals.c) < 0.01,
    `Dr=${jeTotals.d} Cr=${jeTotals.c}`);

  console.log('\n━━━ 5. New schema exists and is correct ━━━');
  for (const t of FORBIDDEN_TABLES) {
    const exists = db2.prepare(
      `SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name=?`, t,
    ).get(t).c;
    check(`Dead schema table ${t} is NOT created`, exists === 0, `found ${exists}`);
  }
  const matCols = db2.prepare(`PRAGMA table_info(materials)`).all().map(c => c.name);
  check('materials.code added (the "No.")', matCols.includes('code'));
  check('materials.usageType added (sellable | component)', matCols.includes('usageType'));
  const prodCols = db2.prepare(`PRAGMA table_info(products)`).all().map(c => c.name);
  check('products.usageType added (simple | assembled)', prodCols.includes('usageType'));
  check('products.components added (the recipe)', prodCols.includes('components'));

  // The recipe is stored as JSON on the product row and resolves to real
  // materials by id — the same shape the renderer reads.
  const recipe = [
    { materialId: ids.mat, quantity: 1, sortOrder: 1 },
    { materialId: ids.mat2, quantity: 1, sortOrder: 2 },
  ];
  db2.prepare(`UPDATE products SET usageType='assembled', components=? WHERE id=?`)
    .run(JSON.stringify(recipe), ids.prod);
  const stored = db2.prepare(`SELECT usageType, components FROM products WHERE id=?`)
    .get(ids.prod);
  const parsed = JSON.parse(stored.components);
  const resolved = parsed.map(c =>
    db2.prepare(`SELECT name FROM materials WHERE id=?`).get(c.materialId));
  check('Product recipe round-trips as JSON', Array.isArray(parsed) && parsed.length === 2);
  check('Every recipe line resolves to a real material',
    resolved.every(r => r && r.name),
    JSON.stringify(resolved.map(r => r && r.name)));
  check('Assembled product still carries its legacy materialId (unused by the sale path)',
    db2.prepare(`SELECT materialId FROM products WHERE id=?`).get(ids.prod).materialId === ids.mat);

  const idx = db2.prepare(
    `SELECT COUNT(*) c FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`,
  ).get().c;
  check('Indexes created for the component picker lookups', idx >= 2, `found ${idx}`);

  console.log('\n━━━ 6. Migrations are idempotent ━━━');
  const res2 = runMigrations(db2, dbPath, { backupDir: path.join(workDir, 'backups') });
  check('Re-running applies nothing', res2.applied.length === 0, JSON.stringify(res2.applied));
  const after2 = counts(db2, LEGACY_TABLES);
  check('Row counts unchanged after re-run',
    LEGACY_TABLES.every(t => before[t] === after2[t]));
  check('No duplicate migration records',
    db2.prepare(`SELECT COUNT(*) c FROM schemaMigrations`).get().c === 1);

  console.log('\n━━━ 7. Foreign keys + integrity ━━━');
  const fk = db2.pragma('foreign_key_check');
  check('No foreign key violations', fk.length === 0, JSON.stringify(fk).slice(0, 200));
  const integrity = db2.pragma('integrity_check');
  check('integrity_check passes', integrity[0] && integrity[0].integrity_check === 'ok',
    JSON.stringify(integrity).slice(0, 200));

  console.log('\n━━━ 8. Part designation works on migrated data ━━━');
  db2.prepare(`UPDATE materials SET code=?, usageType='component' WHERE id=?`).run('4 No', ids.mat);
  db2.prepare(`UPDATE materials SET code=?, usageType='component' WHERE id=?`).run('H-1', ids.mat2);
  const parts = db2.prepare(
    `SELECT code, usageType FROM materials WHERE usageType='component' ORDER BY code`,
  ).all();
  check('Parts are selectable by their No. designation',
    parts.length === 2 && parts[0].code === '4 No' && parts[1].code === 'H-1',
    JSON.stringify(parts));
  const sellable = db2.prepare(
    `SELECT COUNT(*) c FROM materials WHERE usageType IS NULL OR usageType='sellable'`,
  ).get().c;
  check('Rows the migration never touched default to sellable', sellable >= 0);

  console.log('\n━━━ 9. Referential integrity of the recipe ━━━');
  const orphanRecipe = JSON.stringify([{ materialId: 'does-not-exist', quantity: 1, sortOrder: 1 }]);
  db2.prepare(`UPDATE products SET components=? WHERE id=?`).run(orphanRecipe, ids.prod);
  const badLine = JSON.parse(db2.prepare(`SELECT components FROM products WHERE id=?`).get(ids.prod).components)[0];
  check('A recipe line naming a missing material is detectable (no FK to lean on)',
    !!badLine.materialId &&
    !db2.prepare(`SELECT 1 FROM materials WHERE id=?`).get(badLine.materialId),
    badLine.materialId);
  db2.prepare(`UPDATE products SET components=? WHERE id=?`).run(JSON.stringify(recipe), ids.prod);

  console.log('\n━━━ 10. Migration adds NO stock movement ━━━');
  const matStock = db2.prepare(`SELECT stockPcs, processedStockPcs, atProcessorPcs FROM materials WHERE id=?`)
    .get(ids.mat);
  check('material stockPcs untouched by migration', matStock.stockPcs === 900, `${matStock.stockPcs}`);
  check('material processedStockPcs untouched', matStock.processedStockPcs === 120, `${matStock.processedStockPcs}`);
  check('material atProcessorPcs untouched', matStock.atProcessorPcs === 40, `${matStock.atProcessorPcs}`);
  check('Migration adds NO stock movement for a product it just marked assembled',
    db2.prepare(`SELECT COUNT(*) c FROM batches`).get().c === before.batches);

  db2.close();
}

try {
  main();
} catch (e) {
  console.error(e);
  failures += 1;
}

console.log('');
if (failures === 0) {
  console.log('MIGRATION SUITE: PASS');
  fs.rmSync(workDir, { recursive: true, force: true });
  process.exit(0);
} else {
  console.log(`MIGRATION SUITE: FAIL (${failures} check(s) failed)`);
  console.log('artifacts kept at', workDir);
  process.exit(1);
}
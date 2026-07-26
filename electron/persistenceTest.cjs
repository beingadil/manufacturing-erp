/**
 * Persistence Smoke Test — runs inside Electron so better-sqlite3's native
 * binary matches the correct NODE_MODULE_VERSION.
 *
 * Usage:
 *   npx electron electron/persistenceTest.cjs --write    # creates test records
 *   npx electron electron/persistenceTest.cjs --verify   # reads & compares
 *
 * The orchestrator (scripts/persistence-smoke-test.sh) deletes the old DB,
 * runs --write, then runs --verify in a fresh process.
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database.cjs');

// Route test data to an isolated directory so we never touch the real database
const TEST_DB_DIR = process.env.ELECTRON_USER_DATA;
if (TEST_DB_DIR) {
  app.setPath('userData', TEST_DB_DIR);
}

const MODE = process.argv.includes('--verify') ? 'verify' : 'write';
const TEST_PREFIX = '__persistence_test__';

// Test data payloads — one record per entity type to exercise the full write path
const TEST_DATA = {
  categories: {
    id: `${TEST_PREFIX}_cat_1`,
    name: 'Persistence Test Category',
    description: 'Created by persistence smoke test',
    status: 'Active',
  },
  suppliers: {
    id: `${TEST_PREFIX}_sup_1`,
    name: 'Persistence Test Supplier',
    contactPerson: 'Test Contact',
    phone: '555-0100',
    address: '123 Test St',
    balancePayable: 1000,
    accountId: null,
    ntn: 'NTN-TEST-001',
    notes: 'Persistence test supplier',
  },
  customers: {
    id: `${TEST_PREFIX}_cust_1`,
    name: 'Persistence Test Customer',
    contactPerson: 'Jane Buyer',
    phone: '555-0200',
    address: '456 Buyers Ln',
    balanceReceivable: 2000,
    accountId: null,
    ntn: 'NTN-TEST-002',
    notes: 'Persistence test customer',
  },
  materials: {
    id: `${TEST_PREFIX}_mat_1`,
    name: 'Persistence Test Material',
    categoryId: `${TEST_PREFIX}_cat_1`,
    status: 'Active',
    stockPcs: 500,
    processedStockPcs: 100,
    atProcessorPcs: 50,
    description: 'Test material for persistence',
    reservedStockPcs: 10,
  },
  products: {
    id: `${TEST_PREFIX}_prod_1`,
    name: 'Persistence Test Product',
    categoryId: `${TEST_PREFIX}_cat_1`,
    materialId: `${TEST_PREFIX}_mat_1`,
    sku: 'TST-001',
    sellingPrice: 49.99,
    description: 'Test product for persistence',
  },
  processors: {
    id: `${TEST_PREFIX}_proc_1`,
    name: 'Persistence Test Processor',
    contactPerson: 'Bob Processor',
    phone: '555-0300',
    address: '789 Process Ave',
    balancePayable: 500,
    accountId: null,
    notes: 'Persistence test processor',
  },
  accountSubtypes: {
    id: `${TEST_PREFIX}_subtype_1`,
    name: 'Persistence Test Subtype',
    type: 'Assets',
    description: 'Test account subtype for persistence',
    isSystem: 0,
  },
  accounts: {
    id: `${TEST_PREFIX}_acct_1`,
    code: '9999-TEST',
    name: 'Persistence Test Account',
    subtypeId: `${TEST_PREFIX}_subtype_1`,
    type: 'Assets',
    openingBalance: 0,
    openingBalanceType: 'Debit',
    status: 'Active',
    description: 'Test account for persistence',
    isSystem: 0,
    linkedEntityId: null,
    parentId: null,
  },
  vouchers: {
    id: `${TEST_PREFIX}_vouch_1`,
    voucherNo: 'TST-0001',
    date: '2026-01-15',
    type: 'Journal Voucher',
    referenceNo: 'REF-TEST-001',
    sourceModule: 'Manual',
    sourceId: null,
    narration: 'Persistence test voucher',
    totalDebit: 100,
    totalCredit: 100,
    createdBy: 'smoke-test',
    createdAt: '2026-01-15T10:00:00.000Z',
    status: 'Posted',
    versionHistory: '[{"action":"Created","modifiedAt":"2026-01-15T10:00:00.000Z","modifiedBy":"smoke-test"}]',
  },
  journalEntries: {
    id: `${TEST_PREFIX}_je_1`,
    voucherId: `${TEST_PREFIX}_vouch_1`,
    accountId: `${TEST_PREFIX}_acct_1`,
    debit: 100,
    credit: 0,
    narration: 'Persistence test journal entry',
  },
  purchases: {
    id: `${TEST_PREFIX}_purch_1`,
    purchaseNo: 'PO-TEST-0001',
    supplierId: `${TEST_PREFIX}_sup_1`,
    materialId: `${TEST_PREFIX}_mat_1`,
    date: '2026-01-15',
    weight: 1000,
    weightUnit: 'KGs',
    ratePerUnit: 5,
    amount: 5000,
    weightPerPiece: 0.5,
    calculatedPcs: 2000,
    invoiceNo: 'INV-TEST-001',
    remarks: 'Persistence test purchase',
  },
  sales: {
    id: `${TEST_PREFIX}_sale_1`,
    invoiceNo: 'SINV-TEST-0001',
    customerId: `${TEST_PREFIX}_cust_1`,
    productId: `${TEST_PREFIX}_prod_1`,
    date: '2026-01-15',
    pcsSold: 100,
    pricePerPiece: 49.99,
    totalAmount: 4999,
    batchId: null,
  },
  inventoryMovements: {
    id: `${TEST_PREFIX}_inv_1`,
    materialId: `${TEST_PREFIX}_mat_1`,
    batchId: null,
    date: '2026-01-15',
    referenceNo: 'REF-TEST-INV-001',
    module: 'Adjustment',
    transactionType: 'IN',
    userId: 'smoke-test',
    quantity: 100,
    runningBalance: 600,
    remarks: 'Persistence test inventory movement',
  },
  batches: {
    id: `${TEST_PREFIX}_batch_1`,
    batchNo: 'BATCH-TEST-0001',
    purchaseId: `${TEST_PREFIX}_purch_1`,
    supplierId: `${TEST_PREFIX}_sup_1`,
    materialId: `${TEST_PREFIX}_mat_1`,
    date: '2026-01-15',
    weight: 1000,
    weightUnit: 'KGs',
    ratePerUnit: 5,
    weightPerPiece: 0.5,
    initialPcs: 2000,
    remainingPcs: 2000,
    amount: 5000,
    status: 'Active',
  },
};

const KEY_VALUE_PAYLOAD = {
  key: `${TEST_PREFIX}_kv_test`,
  value: '{"testData":true,"createdAt":"2026-01-15T10:00:00.000Z","items":["a","b","c"],"metadata":{"version":1,"run":"persistence-smoke-test"}}',
};

/** Build a target row map: tableName → { colName: value, … } */
function buildExpectedRows() {
  const rows = {};
  for (const [table, data] of Object.entries(TEST_DATA)) {
    rows[table] = data;
  }
  return rows;
}

// ── Write Phase ────────────────────────────────────────────────────────────

function writeTestData() {
  console.log('[SmokeTest] Writing test data…');

  // 1. Entity tables — insert via the database module's execute()
  for (const [table, data] of Object.entries(TEST_DATA)) {
    const cols = Object.keys(data);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => data[c]);
    const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
    db.execute(sql, values);
    console.log(`  ✓ ${table}`);
  }

  // 2. key_value_store — this is the Zustand persist path
  db.execute(
    'INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [KEY_VALUE_PAYLOAD.key, KEY_VALUE_PAYLOAD.value]
  );
  console.log('  ✓ key_value_store');

  console.log('[SmokeTest] Write phase complete.');
  app.exit(0);
}

// ── Verify Phase ────────────────────────────────────────────────────────────

function verifyTestData() {
  console.log('[SmokeTest] Verifying persisted data…');
  let failures = 0;
  const expectedRows = buildExpectedRows();

  for (const [table, expected] of Object.entries(expectedRows)) {
    const id = expected.id;
    const row = db.queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);

    if (!row) {
      console.error(`  ✗ ${table}: row with id "${id}" NOT FOUND`);
      failures++;
      continue;
    }

    // Compare every expected column against the actual row
    let mismatches = 0;
    for (const [col, expectedVal] of Object.entries(expected)) {
      const actualVal = row[col];
      // Convert both to strings for comparison (number ↔ string, null ↔ undefined)
      const a = actualVal == null ? '' : String(actualVal);
      const e = expectedVal == null ? '' : String(expectedVal);
      if (a !== e) {
        if (mismatches === 0) console.error(`  ✗ ${table}:`);
        console.error(`      col "${col}": expected "${e}", got "${a}"`);
        mismatches++;
        failures++;
      }
    }

    if (mismatches === 0) {
      console.log(`  ✓ ${table}`);
    }
  }

  // Verify key_value_store
  const kvRow = db.queryOne('SELECT value FROM key_value_store WHERE key = ?', [KEY_VALUE_PAYLOAD.key]);
  if (!kvRow) {
    console.error('  ✗ key_value_store: entry NOT FOUND');
    failures++;
  } else {
    // Verify the JSON payload round-tripped
    try {
      const parsed = JSON.parse(kvRow.value);
      const original = JSON.parse(KEY_VALUE_PAYLOAD.value);
      if (parsed.testData === original.testData && parsed.metadata.version === original.metadata.version) {
        console.log('  ✓ key_value_store');
      } else {
        console.error('  ✗ key_value_store: JSON payload mismatch');
        failures++;
      }
    } catch {
      console.error('  ✗ key_value_store: value is not valid JSON');
      failures++;
    }
  }

  // Run integrity check
  const integrity = db.runIntegrityCheck();
  if (integrity.success) {
    console.log('  ✓ integrity_check: PASSED');
  } else {
    console.error('  ✗ integrity_check: FAILED —', integrity.details?.join(', '));
    failures++;
  }

  if (failures > 0) {
    console.error(`\n[SmokeTest] FAILED — ${failures} check(s) failed.`);
    app.exit(1);
  } else {
    console.log('\n[SmokeTest] PASSED — all persistence checks passed.');
    app.exit(0);
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Silence validateSchema() in test mode — it runs inside initializeDatabase()
  // but we still want the result
  const initResult = db.initializeDatabase();
  if (!initResult.success) {
    console.error('[SmokeTest] FATAL: Database initialization failed.');
    app.exit(1);
    return;
  }

  if (MODE === 'verify') {
    verifyTestData();
  } else {
    writeTestData();
  }
});

// Safety net — if app doesn't initialize within 30s, bail
setTimeout(() => {
  console.error('[SmokeTest] FATAL: Timed out waiting for Electron app to initialize.');
  app.exit(1);
}, 30_000);

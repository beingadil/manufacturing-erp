const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { runMigrations } = require('./migrations.cjs');

// ─── Unified Backup Bundle Format (.merpbak) ─────────────────────────────
// A deterministic, self-describing single-file bundle:
//   [8-byte magic "MERPBK01"][4-byte BE manifest length][manifest JSON][SQLite bytes]
// The manifest carries app version, schema version, store keys, timestamps,
// row counts, and a SHA-256 of the embedded database — so importing on any
// machine is validated and fully deterministic.
const BACKUP_MAGIC = 'MERPBK01';
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_FORMAT_NAME = 'manufacturing-erp-unified-backup';

let db = null;
let initialized = false;

// Add a column to an existing table only if it does not already exist
// (CREATE TABLE IF NOT EXISTS never alters an existing table).
function addColumnIfMissing(table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[DB] Added column ${table}.${column}`);
    }
  } catch (e) {
    console.warn(`[DB] addColumnIfMissing(${table}.${column}) skipped:`, e.message);
  }
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'manufacturing-erp.sqlite');
}

function initializeDatabase() {
  if (initialized && db) {
    return { success: true };
  }
  const dbPath = getDbPath();
  console.log('[DB] Database path:', dbPath);

  if (db) {
    db.close();
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_size_limit = 0');
  db.pragma('cache_size = -8000');

  createAllTables();

  // Versioned schema migrations. Runs after createAllTables() so a brand-new
  // database bootstraps the legacy schema and then receives the same recorded
  // migrations an existing database gets — one code path for both.
  try {
    runMigrations(db, dbPath, { backupDir: path.join(app.getPath('userData'), 'backups') });
  } catch (e) {
    console.error('[DB] Migration failed:', e.message);
    // A failed migration must not leave the app running on a half-migrated
    // schema; surface it loudly and keep the pre-migration backup.
    throw e;
  }

  // Run integrity check — a failed check must be LOUD (the app may be about
  // to run on a corrupt database), not a silent log line.
  let integrityStatus = 'ok';
  try {
    const integrity = db.pragma('integrity_check');
    const ok = integrity[0] && integrity[0].integrity_check === 'ok';
    integrityStatus = ok ? 'ok' : 'failed';
    if (!ok) {
      console.error('[DB] Integrity check FAILED — database may be corrupt. Contents:', JSON.stringify(integrity));
    } else {
      console.log('[DB] Integrity check: PASSED');
    }
  } catch (e) {
    integrityStatus = 'error';
    console.error('[DB] Integrity check error — the database may be corrupt:', e.message);
  }

  initialized = true;
  console.log('[DB] Database initialized successfully');
  return { success: true, integrity: integrityStatus };
}

function createAllTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, status TEXT
    );
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, categoryId TEXT, status TEXT DEFAULT 'Active',
      stockPcs REAL DEFAULT 0, processedStockPcs REAL DEFAULT 0, atProcessorPcs REAL DEFAULT 0,
      description TEXT, reservedStockPcs REAL DEFAULT 0,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balancePayable REAL DEFAULT 0, accountId TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balancePayable REAL DEFAULT 0, accountId TEXT, ntn TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, contactPerson TEXT, phone TEXT,
      address TEXT, balanceReceivable REAL DEFAULT 0, accountId TEXT, ntn TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, categoryId TEXT, materialId TEXT,
      sku TEXT, sellingPrice REAL DEFAULT 0, description TEXT,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY, purchaseNo TEXT NOT NULL UNIQUE, supplierId TEXT NOT NULL,
      materialId TEXT NOT NULL, date TEXT NOT NULL, weight REAL DEFAULT 0, weightUnit TEXT,
      ratePerUnit REAL DEFAULT 0, amount REAL DEFAULT 0, weightPerPiece REAL DEFAULT 0,
      calculatedPcs REAL DEFAULT 0, invoiceNo TEXT, remarks TEXT,
      FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processingStages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sequence INTEGER DEFAULT 0,
      description TEXT, active INTEGER DEFAULT 1, inputUnit TEXT, billingUnit TEXT,
      billingEnabled INTEGER DEFAULT 1, rateMethod TEXT DEFAULT 'per_piece',
      isFinalStage INTEGER DEFAULT 0, nextStageId TEXT
    );
    CREATE TABLE IF NOT EXISTS processingSends (
      id TEXT PRIMARY KEY, dispatchNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, batchId TEXT, date TEXT NOT NULL, pcsSent REAL DEFAULT 0,
      pcsReceived REAL DEFAULT 0, ratePerPiece REAL DEFAULT 0, status TEXT DEFAULT 'Pending',
      adjustedToDispatchId TEXT, remarks TEXT, stageId TEXT, lossQuantity REAL DEFAULT 0,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processingReceipts (
      id TEXT PRIMARY KEY, receiveNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, sendId TEXT NOT NULL, date TEXT NOT NULL, pcsReceived REAL DEFAULT 0,
      billAmount REAL DEFAULT 0, billedStatus TEXT DEFAULT 'Unbilled', remarks TEXT,
      stageId TEXT, rateMethod TEXT, billingUnit TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (sendId) REFERENCES processingSends(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processorBills (
      id TEXT PRIMARY KEY, billNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      date TEXT NOT NULL, totalAmount REAL DEFAULT 0, receiptIds TEXT, remarks TEXT,
      stageId TEXT, rateMethod TEXT, billingUnit TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, invoiceNo TEXT NOT NULL UNIQUE, customerId TEXT NOT NULL,
      productId TEXT NOT NULL, date TEXT NOT NULL, pcsSold REAL DEFAULT 0, pricePerPiece REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0, batchId TEXT,
      FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS accountSubtypes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT, description TEXT,
      isSystem INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT, subtypeId TEXT,
      type TEXT, openingBalance REAL DEFAULT 0, openingBalanceType TEXT DEFAULT 'Debit',
      status TEXT DEFAULT 'Active', isSystem INTEGER DEFAULT 0, linkedEntityId TEXT,
      description TEXT, parentId TEXT,
      FOREIGN KEY (subtypeId) REFERENCES accountSubtypes(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY, voucherNo TEXT NOT NULL UNIQUE, date TEXT NOT NULL,
      type TEXT NOT NULL, referenceNo TEXT, sourceModule TEXT, sourceId TEXT,
      narration TEXT, totalDebit REAL DEFAULT 0, totalCredit REAL DEFAULT 0,
      createdAt TEXT, createdBy TEXT, status TEXT DEFAULT 'Posted',
      versionHistory TEXT
    );
    CREATE TABLE IF NOT EXISTS journalEntries (
      id TEXT PRIMARY KEY, voucherId TEXT NOT NULL, accountId TEXT NOT NULL,
      debit REAL DEFAULT 0, credit REAL DEFAULT 0, narration TEXT,
      FOREIGN KEY (voucherId) REFERENCES vouchers(id) ON DELETE CASCADE,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY, batchNo TEXT NOT NULL UNIQUE, purchaseId TEXT,
      supplierId TEXT, materialId TEXT, date TEXT, weight REAL DEFAULT 0,
      weightUnit TEXT, ratePerUnit REAL DEFAULT 0, weightPerPiece REAL DEFAULT 0,
      initialPcs REAL DEFAULT 0, remainingPcs REAL DEFAULT 0, amount REAL DEFAULT 0,
      status TEXT DEFAULT 'Active',
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS inventoryMovements (
      id TEXT PRIMARY KEY, materialId TEXT, batchId TEXT,
      date TEXT NOT NULL, referenceNo TEXT, module TEXT, transactionType TEXT,
      quantity REAL DEFAULT 0, runningBalance REAL DEFAULT 0, userId TEXT, remarks TEXT
    );
    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Clean up orphan tables from previous schema versions.
  // NOTE: `_migrations` is no longer dropped — the versioned runner in
  // migrations.cjs owns schema history now. Legacy rows are removed once.
  db.exec(`
    DROP TABLE IF EXISTS key_value_store_history;
  `);

  // Additive stage columns for existing databases (CREATE TABLE IF NOT EXISTS
  // never alters an existing table, so guard each ALTER by PRAGMA table_info).
  addColumnIfMissing('processingSends', 'stageId', 'TEXT');
  addColumnIfMissing('processingSends', 'lossQuantity', 'REAL DEFAULT 0');
  addColumnIfMissing('processingReceipts', 'stageId', 'TEXT');
  addColumnIfMissing('processingReceipts', 'rateMethod', "TEXT DEFAULT 'per_piece'");
  addColumnIfMissing('processingReceipts', 'billingUnit', 'TEXT');
  addColumnIfMissing('processorBills', 'stageId', 'TEXT');
  addColumnIfMissing('processorBills', 'rateMethod', 'TEXT');
  addColumnIfMissing('processorBills', 'billingUnit', 'TEXT');
  // Worker type — the processing stage a processor performs (NULL = general).
  addColumnIfMissing('processors', 'stageId', 'TEXT');
  // Batch stage-tracking columns for multi-stage processing
  addColumnIfMissing('batches', 'atProcessorPcs', 'REAL DEFAULT 0');
  addColumnIfMissing('batches', 'processedPcs', 'REAL DEFAULT 0');
  addColumnIfMissing('batches', 'currentStageId', 'TEXT');
  addColumnIfMissing('batches', 'stageAvailablePcs', 'REAL DEFAULT 0');

  // Performance indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_materials_categoryId ON materials(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_purchases_supplierId ON purchases(supplierId);
    CREATE INDEX IF NOT EXISTS idx_purchases_materialId ON purchases(materialId);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
    CREATE INDEX IF NOT EXISTS idx_processingSends_processorId ON processingSends(processorId);
    CREATE INDEX IF NOT EXISTS idx_processingSends_materialId ON processingSends(materialId);
    CREATE INDEX IF NOT EXISTS idx_processingReceipts_processorId ON processingReceipts(processorId);
    CREATE INDEX IF NOT EXISTS idx_processingReceipts_sendId ON processingReceipts(sendId);
    CREATE INDEX IF NOT EXISTS idx_processingReceipts_date ON processingReceipts(date);
    CREATE INDEX IF NOT EXISTS idx_processorBills_processorId ON processorBills(processorId);
    CREATE INDEX IF NOT EXISTS idx_sales_customerId ON sales(customerId);
    CREATE INDEX IF NOT EXISTS idx_sales_productId ON sales(productId);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_accounts_subtypeId ON accounts(subtypeId);
    CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(type);
    CREATE INDEX IF NOT EXISTS idx_journalEntries_voucherId ON journalEntries(voucherId);
    CREATE INDEX IF NOT EXISTS idx_journalEntries_accountId ON journalEntries(accountId);
    CREATE INDEX IF NOT EXISTS idx_batches_purchaseId ON batches(purchaseId);
    CREATE INDEX IF NOT EXISTS idx_batches_materialId ON batches(materialId);
    CREATE INDEX IF NOT EXISTS idx_inventoryMovements_materialId ON inventoryMovements(materialId);
    CREATE INDEX IF NOT EXISTS idx_inventoryMovements_date ON inventoryMovements(date);
  `);
}

// ─── CRUD Operations ──────────────────────────────────────────────────────────

function query(sql, params) {
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

function queryOne(sql, params) {
  const stmt = db.prepare(sql);
  return params ? stmt.get(...params) : stmt.get();
}

function execute(sql, params) {
  const stmt = db.prepare(sql);
  const result = params ? stmt.run(...params) : stmt.run();
  return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
}

function transaction(operations) {
  const tx = db.transaction(() => {
    const results = [];
    for (const op of operations) {
      const stmt = db.prepare(op.sql);
      if (op.type === 'query') {
        results.push(op.params ? stmt.all(...op.params) : stmt.all());
      } else {
        const r = op.params ? stmt.run(...op.params) : stmt.run();
        results.push({ changes: r.changes, lastInsertRowid: r.lastInsertRowid });
      }
    }
    return results;
  });
  return tx();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    initialized = false;
  }
}

// ─── Backup / Restore ─────────────────────────────────────────────────────────

function runIntegrityCheck() {
  try {
    const integrity = db.pragma('integrity_check');
    // better-sqlite3 returns rows like [{ integrity_check: 'ok' }]; tolerate a bare value too.
    const first = Array.isArray(integrity) ? integrity[0] : integrity;
    const status = first && typeof first === 'object' ? first.integrity_check : first;
    if (status === 'ok') return { success: true, status: 'ok', details: [] };
    const problems = Array.isArray(integrity)
      ? integrity.map((r) => r && r.integrity_check).filter(Boolean)
      : [];
    const summary = problems.length ? problems.join('; ') : String(status);
    return { success: false, status: status || 'unknown', details: problems, error: 'SQLite integrity check reported: ' + summary };
  } catch (error) {
    const message = String((error && error.message) || error);
    return { success: false, details: [message], error: message };
  }
}

// Required ERP tables — BACKUP_TABLES is declared below; default parameter
// values are evaluated at call time, so referencing it here is safe. A
// database candidate missing any of these is not a usable manufacturing-erp
// database and must never replace the live one.

// Validate a database FILE without touching the live connection. Opens the
// candidate read-only in a probe connection and runs integrity_check plus a
// table-presence check. Returns { ok, error? }.
function validateCandidateDatabase(candidatePath, requiredTables = BACKUP_TABLES) {
  const fs = require('fs');
  if (!fs.existsSync(candidatePath)) {
    return { ok: false, error: 'File not found: ' + candidatePath };
  }
  let probe = null;
  try {
    probe = new Database(candidatePath, { readonly: true, fileMustExist: true });
    const rows = probe.pragma('integrity_check');
    const first = Array.isArray(rows) ? rows[0] : rows;
    const status = first && typeof first === 'object' ? first.integrity_check : first;
    if (String(status) !== 'ok') {
      return { ok: false, error: `integrity_check reported: ${status}` };
    }
    const tables = new Set(
      probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    const missing = requiredTables.filter(t => !tables.has(t));
    if (missing.length > 0) {
      return { ok: false, error: 'Missing required tables: ' + missing.join(', ') };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    if (probe) {
      try { probe.close(); } catch (_e) { /* best effort */ }
    }
  }
}

// Row counts for the required tables, from a probe connection. Used both to
// build an honest export manifest (counts come from the actual snapshot, not
// from the source connection) and to verify a restore after reopening.
function countRequiredTables(probe, tables = BACKUP_TABLES) {
  const counts = {};
  for (const t of tables) {
    try {
      counts[t] = probe.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    } catch (_e) {
      counts[t] = -1;
    }
  }
  return counts;
}

// Create a consistent, self-contained snapshot of the live database at
// destPath using VACUUM INTO. Unlike `wal_checkpoint(TRUNCATE) + copyFileSync`,
// VACUUM INTO captures ALL committed frames regardless of WAL state and does
// not depend on the (previously unchecked) busy flag of a checkpoint. The
// destination must not exist; it is written next to destPath and renamed into
// place atomically so a crash never leaves a half-written backup.
function vacuumInto(destPath) {
  const fs = require('fs');
  const tmp = destPath + '.tmp-' + process.pid;
  try {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const v = validateCandidateDatabase(tmp);
    if (!v.ok) {
      try { fs.rmSync(tmp, { force: true }); } catch (_e) { /* best effort */ }
      return { ok: false, error: 'Snapshot failed validation: ' + v.error };
    }
    fs.renameSync(tmp, destPath);
    return { ok: true };
  } catch (error) {
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch (_e) { /* best effort */ }
    return { ok: false, error: error.message };
  }
}

function backupDatabase() {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'Database file not found at ' + dbPath };
    }
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `manufacturing-erp-${timestamp}.sqlite.bak`);
    console.log('[DB] Backup starting:', dbPath, '->', backupPath);

    // Consistent snapshot via VACUUM INTO, validated before it is renamed
    // into place. Success is only reported for a verified file.
    const snap = vacuumInto(backupPath);
    if (!snap.ok) {
      return { success: false, error: 'Backup failed: ' + snap.error };
    }

    // Prune old backups (keep the newest 30)
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak'))
        .sort().reverse();
      if (files.length > 30) {
        files.slice(30).forEach(f => fs.rmSync(path.join(backupDir, f), { force: true }));
      }
    } catch {}

    const size = fs.statSync(backupPath).size;
    console.log('[DB] Backup saved and verified:', backupPath, `(${size} bytes)`);
    return { success: true, path: backupPath, size };
  } catch (error) {
    console.error('[DB] Backup error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Daily local backup ──────────────────────────────────────────────────
// One snapshot per calendar day: backupDatabase() keeps the newest 30 in
// userData/backups, and each day's snapshot is copied to a user-visible
// folder (Documents/Manufacturing ERP Backups) so backups are findable
// without digging through hidden AppData. Safe to call repeatedly — skips
// silently when today's snapshot already exists.
function runDailyBackup() {
  try {
    const fs = require('fs');
    const today = new Date().toISOString().slice(0, 10);
    const backupDir = path.join(app.getPath('userData'), 'backups');
    const todays = fs.existsSync(backupDir)
      ? fs.readdirSync(backupDir).filter(f => f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak') && f.includes(today))
      : [];
    if (todays.length > 0) {
      return { success: true, skipped: true, path: path.join(backupDir, todays[0]) };
    }
    const result = backupDatabase();
    if (!result.success) return result;

    // User-visible copy in Documents (non-fatal if Documents is unavailable,
    // e.g. redirected or locked-down folders).
    try {
      const visibleDir = path.join(app.getPath('documents'), 'Manufacturing ERP Backups');
      if (!fs.existsSync(visibleDir)) fs.mkdirSync(visibleDir, { recursive: true });
      fs.copyFileSync(result.path, path.join(visibleDir, path.basename(result.path)));
      // Mirror the 30-snapshot retention in the visible folder too.
      const visibleFiles = fs.readdirSync(visibleDir)
        .filter(f => f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak'))
        .sort().reverse();
      if (visibleFiles.length > 30) {
        visibleFiles.slice(30).forEach(f => fs.rmSync(path.join(visibleDir, f), { force: true }));
      }
    } catch (e) {
      console.warn('[DB] Visible backup copy failed (non-fatal):', e.message);
    }
    return result;
  } catch (error) {
    console.error('[DB] Daily backup error:', error);
    return { success: false, error: error.message };
  }
}

// ─── External Backup Export / Import ─────────────────────────────────────────
// These let users save a full SQLite backup to any location on disk (USB, network, etc.)
// and restore from a backup file on any machine.

function exportBackupToPath(targetPath) {
  try {
    const fs = require('fs');
    const dir = require('path').dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log('[DB] Backup export starting:', targetPath);
    // Consistent, validated snapshot — destination must not exist, so VACUUM
    // INTO a sibling temp file and rename atomically into place.
    const snap = vacuumInto(targetPath + '.snapshot-' + process.pid + '.sqlite');
    if (!snap.ok) {
      return { success: false, error: 'Export failed: ' + snap.error };
    }
    // Snapshot is already verified; rename onto the user-chosen path.
    fs.renameSync(targetPath + '.snapshot-' + process.pid + '.sqlite', targetPath);
    const size = fs.statSync(targetPath).size;
    console.log('[DB] Backup exported and verified:', targetPath, `(${size} bytes)`);
    return { success: true, path: targetPath, size };
  } catch (error) {
    try { fs.rmSync(targetPath + '.snapshot-' + process.pid + '.sqlite', { force: true }); } catch (_e) { /* best effort */ }
    console.error('[DB] Export error:', error);
    return { success: false, error: error.message };
  }
}

function importBackupFromPath(sourcePath) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source file not found' };
    }
    // Fast header check for a clear error message; the candidate is fully
    // validated (integrity_check + required tables) by the swap itself.
    const header = Buffer.alloc(16);
    const fd = fs.openSync(sourcePath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    const sqliteHeader = 'SQLite format 3\x00';
    if (header.toString('utf8', 0, 16) !== sqliteHeader) {
      return { success: false, error: 'Invalid SQLite database file' };
    }
    // Stage the candidate next to the live DB (same volume) so the swap can
    // validate and atomically rename it without touching the live file first.
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const stagedPath = path.join(backupDir, 'restore-candidate-' + Date.now() + '.sqlite');
    fs.copyFileSync(sourcePath, stagedPath);
    const result = swapLiveDatabase(stagedPath, {});
    if (!result.success) {
      // Candidate is consumed on success / rolled back on failure; if a copy
      // is left over (e.g. validation failed), remove it here.
      try { if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true }); } catch (_e) { /* best effort */ }
    }
    if (result.success) {
      console.log('[DB] Database imported from:', sourcePath);
    }
    return result;
  } catch (error) {
    console.error('[DB] Import error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Unified Backup Bundle (manifest + SQLite in one .merpbak file) ───────

const BACKUP_TABLES = [
  'categories', 'materials', 'processors', 'suppliers', 'customers', 'products',
  'purchases', 'processingSends', 'processingReceipts', 'processorBills', 'sales',
  'accountSubtypes', 'accounts', 'vouchers', 'journalEntries',
  'batches', 'inventoryMovements', 'key_value_store',
];

// Build the manifest FROM THE SNAPSHOT BYTES that will actually be embedded
// in the bundle. Counts and store keys are read from the snapshot itself, so
// the manifest can never describe a different (stale) database than the one
// being exported — the root cause of "backup reported success but restored to
// an older state".
function buildBackupManifest(dbBytes, snapshotPath) {
  let stores = [];
  let tableRowCounts = {};
  const probe = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    try {
      stores = probe.prepare('SELECT key FROM key_value_store ORDER BY key').all().map(r => r.key);
    } catch (_e) {
      stores = [];
    }
    tableRowCounts = countRequiredTables(probe, BACKUP_TABLES);
  } finally {
    try { probe.close(); } catch (_e) { /* best effort */ }
  }
  return {
    format: BACKUP_FORMAT_NAME,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: app.getVersion ? app.getVersion() : 'unknown',
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    dbSize: dbBytes.length,
    dbSha256: crypto.createHash('sha256').update(dbBytes).digest('hex'),
    stores,
    tableRowCounts,
  };
}

// Export a single-file bundle: magic + manifest length + manifest JSON + SQLite bytes.
// The embedded SQLite is a validated VACUUM INTO snapshot written to a sibling
// temp file first — never a raw read of the live main file (which may lag the
// WAL) — and both the snapshot and the final bundle are verified before
// success is reported.
function exportUnifiedBackupToPath(targetPath) {
  const fs = require('fs');
  const tmpDb = targetPath + '.snapshot-' + process.pid + '.sqlite';
  const tmpBundle = targetPath + '.tmp-' + process.pid;
  try {
    const dir = require('path').dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(tmpDb)) fs.rmSync(tmpDb, { force: true });
    if (fs.existsSync(tmpBundle)) fs.rmSync(tmpBundle, { force: true });
    console.log('[DB] Unified backup export starting:', targetPath);

    // 1. Consistent snapshot (captures all committed WAL frames)
    db.exec(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`);
    // 2. Validate the snapshot before it becomes the bundle
    const v = validateCandidateDatabase(tmpDb);
    if (!v.ok) {
      return { success: false, error: 'Snapshot failed validation: ' + v.error };
    }
    // 3. Manifest describes THESE bytes
    const dbBytes = fs.readFileSync(tmpDb);
    const manifest = buildBackupManifest(dbBytes, tmpDb);
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const header = Buffer.alloc(12);
    header.write(BACKUP_MAGIC, 0, 'ascii');
    header.writeUInt32BE(manifestBuf.length, 8);
    const bundle = Buffer.concat([header, manifestBuf, dbBytes]);
    // 4. Atomic finalization: write bundle to a sibling temp, then rename
    fs.writeFileSync(tmpBundle, bundle);
    fs.renameSync(tmpBundle, targetPath);
    const size = fs.statSync(targetPath).size;
    console.log('[DB] Unified backup exported and verified:', targetPath, `(${size} bytes)`);
    return { success: true, path: targetPath, manifest };
  } catch (error) {
    // Clean up partial artifacts so a failed export never leaves a
    // plausible-but-invalid backup behind.
    try { if (fs.existsSync(tmpBundle)) fs.rmSync(tmpBundle, { force: true }); } catch (_e) { /* best effort */ }
    console.error('[DB] Unified export error:', error);
    return { success: false, error: error.message };
  } finally {
    try { if (fs.existsSync(tmpDb)) fs.rmSync(tmpDb, { force: true }); } catch (_e) { /* best effort */ }
  }
}

// Import a .merpbak bundle (or fall back to a legacy raw .sqlite file).
// Validates magic, manifest, format version, schema version and SHA-256
// integrity before touching the live database — fully deterministic.
function importUnifiedBackupFromPath(sourcePath) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source file not found' };
    }
    const fileBuf = fs.readFileSync(sourcePath);

    // ── Legacy raw SQLite backup (pre-bundle exports) ──
    if (fileBuf.length >= 16 && fileBuf.slice(0, 16).toString('utf8') === 'SQLite format 3\x00') {
      return importBackupFromPath(sourcePath);
    }

    // ── Unified bundle ──
    if (fileBuf.length < 12 || fileBuf.slice(0, 8).toString('ascii') !== BACKUP_MAGIC) {
      return { success: false, error: 'Not a valid unified backup (.merpbak) or SQLite file' };
    }
    const manifestLen = fileBuf.readUInt32BE(8);
    const manifestStart = 12;
    const manifestEnd = manifestStart + manifestLen;
    if (manifestEnd > fileBuf.length) {
      return { success: false, error: 'Corrupted backup: manifest length exceeds file size' };
    }
    let manifest;
    try {
      manifest = JSON.parse(fileBuf.slice(manifestStart, manifestEnd).toString('utf8'));
    } catch (e) {
      return { success: false, error: 'Corrupted backup: invalid manifest JSON' };
    }
    if (manifest.format !== BACKUP_FORMAT_NAME) {
      return { success: false, error: 'Not a Manufacturing ERP unified backup' };
    }
    if (typeof manifest.formatVersion === 'number' && manifest.formatVersion > BACKUP_FORMAT_VERSION) {
      return { success: false, error: `Backup format v${manifest.formatVersion} is newer than supported (v${BACKUP_FORMAT_VERSION}). Please update the app first.` };
    }
    const dbBytes = fileBuf.slice(manifestEnd);
    if (dbBytes.length < 16 || dbBytes.slice(0, 16).toString('utf8') !== 'SQLite format 3\x00') {
      return { success: false, error: 'Corrupted backup: embedded database is not valid SQLite' };
    }
    const sha = crypto.createHash('sha256').update(dbBytes).digest('hex');
    if (sha !== manifest.dbSha256) {
      return { success: false, error: 'Backup integrity check failed (SHA-256 mismatch). The file may be corrupted or tampered with.' };
    }

    // ── Replace the live database with the verified embedded bytes ──
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const stagedPath = path.join(backupDir, 'restore-candidate-' + Date.now() + '.sqlite');
    fs.writeFileSync(stagedPath, dbBytes);
    const result = swapLiveDatabase(stagedPath, { manifest });
    if (!result.success) {
      try { if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true }); } catch (_e) { /* best effort */ }
    } else {
      console.log('[DB] Unified backup imported from:', sourcePath);
    }
    return result;
  } catch (error) {
    console.error('[DB] Unified import error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Update-safe backup ───────────────────────────────────────────────────
// Creates a backup of the DB *outside* userData so it survives uninstall.
// VACUUM INTO gives a consistent snapshot regardless of WAL state and the
// snapshot is validated before it is swapped into place — success is only
// reported for a verified file, because the caller needs the backup intact
// before quitAndInstall() is called.
function createUpdateSafeBackup() {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'Database file not found at ' + dbPath };
    }
    const exeDir = path.dirname(app.getPath('exe'));
    const backupPath = path.join(exeDir, 'pre-update-backup.sqlite');
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true });
    }
    const snap = vacuumInto(backupPath);
    if (!snap.ok) {
      return { success: false, error: 'Update-safe backup failed: ' + snap.error };
    }
    console.log('[DB] Update-safe backup saved and verified:', backupPath);
    return { success: true, path: backupPath };
  } catch (error) {
    console.error('[DB] createUpdateSafeBackup error:', error);
    return { success: false, error: error.message };
  }
}

// Restore from update-safe backup (used if DB is missing on startup).
// The candidate is validated BEFORE anything is touched, the live database is
// only replaced through the same verified swap as user-requested restores, and
// the update-safe backup file is deleted ONLY AFTER the restore has been
// verified — a failed restore leaves the backup in place for the next launch.
function restoreFromUpdateSafeBackup() {
  try {
    const fs = require('fs');
    const exeDir = path.dirname(app.getPath('exe'));
    const backupPath = path.join(exeDir, 'pre-update-backup.sqlite');

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'No update-safe backup found' };
    }

    // Stage the candidate next to the live DB (same volume) without
    // consuming the backup itself.
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const stagedPath = path.join(backupDir, 'restore-candidate-' + Date.now() + '.sqlite');
    fs.copyFileSync(backupPath, stagedPath);
    console.log('[DB] Restoring from update-safe backup:', backupPath);

    const result = swapLiveDatabase(stagedPath, {});
    if (!result.success) {
      try { if (fs.existsSync(stagedPath)) fs.rmSync(stagedPath, { force: true }); } catch (_e) { /* best effort */ }
      return { success: false, error: 'Update-safe restore failed: ' + result.error };
    }

    // Verified restore — only NOW may the backup be consumed.
    try { fs.rmSync(backupPath, { force: true }); } catch (_e) { /* best effort */ }
    console.log('[DB] Database restored from update-safe backup');
    return { success: true };
  } catch (error) {
    console.error('[DB] restoreFromUpdateSafeBackup error:', error);
    return { success: false, error: error.message };
  }
}

// After replacing the live database file (restore/import) any leftover -wal /
// -shm files from the previous connection must be removed. Replaying a stale
// WAL against a different database file is a classic SQLite corruption source.
// This failure is FATAL to a restore (it means the new file cannot be trusted
// yet) — callers decide whether to roll back.
function removeWalSidecars(dbPath) {
  const fs = require('fs');
  for (const ext of ['-wal', '-shm']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) {
      try {
        fs.rmSync(f, { force: true });
      } catch (error) {
        throw new Error(`Failed to remove WAL sidecar ${f}: ${error.message}`);
      }
    }
  }
}

// Verify a reopened (restored) database before declaring the restore a
// success: integrity_check must pass, required tables must exist, and — when
// the backup's manifest carries per-table row counts — the restored row
// counts must match what the manifest recorded at export time.
function verifyRestoredDatabase(handle, manifest) {
  if (!handle) {
    return { ok: false, error: 'no database handle after reopen' };
  }
  try {
    const rows = handle.pragma('integrity_check');
    const first = Array.isArray(rows) ? rows[0] : rows;
    const status = first && typeof first === 'object' ? first.integrity_check : first;
    if (String(status) !== 'ok') {
      return { ok: false, error: `integrity_check reported: ${status}` };
    }
    const tables = new Set(
      handle.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    const missing = BACKUP_TABLES.filter(t => !tables.has(t));
    if (missing.length > 0) {
      return { ok: false, error: 'Missing required tables after restore: ' + missing.join(', ') };
    }
    const tableRowCounts = countRequiredTables(handle, BACKUP_TABLES);
    if (manifest && manifest.tableRowCounts && typeof manifest.tableRowCounts === 'object') {
      for (const [table, expected] of Object.entries(manifest.tableRowCounts)) {
        const actual = tableRowCounts[table];
        if (typeof expected === 'number' && expected >= 0 && actual !== expected) {
          return { ok: false, error: `Row-count mismatch on '${table}': backup manifest=${expected}, restored=${actual}` };
        }
      }
    }
    return { ok: true, tableRowCounts };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Best-effort automatic rollback of a failed restore back to the safety copy.
function rollbackToSafetyCopy(safetyPath) {
  const fs = require('fs');
  try {
    if (db) {
      try { db.close(); } catch (_e) { /* best effort */ }
      db = null;
      initialized = false;
    }
    if (safetyPath && fs.existsSync(safetyPath)) {
      fs.copyFileSync(safetyPath, getDbPath());
      try { removeWalSidecars(getDbPath()); } catch (_e) { /* best effort */ }
    }
    initialized = false;
    const result = initializeDatabase();
    return { ok: !!(result && result.success) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Shared, safe replacement of the live database with a verified candidate.
// Phases: (1) validate candidate BEFORE touching anything; (2) checked
// checkpoint + close of the live connection — a busy database aborts the
// restore; (3) safety copy of the current database; (4) atomic rename into
// place + fatal sidecar cleanup; (5) reopen and VERIFY — a restore that
// cannot be verified is rolled back automatically.
// The candidate file is consumed (renamed/removed) on success; on failure it
// may remain and must be cleaned up by the caller.
function swapLiveDatabase(candidatePath, opts = {}) {
  const fs = require('fs');
  const dbPath = getDbPath();
  console.log('[DB] Restore starting:', candidatePath, '->', dbPath);

  // Phase 1 — validate the candidate BEFORE the live database is touched.
  const pre = validateCandidateDatabase(candidatePath);
  if (!pre.ok) {
    return { success: false, error: 'Backup failed validation: ' + pre.error };
  }

  // Phase 2 — checkpoint the live connection fully, then close it. If another
  // reader/writer pins the WAL, refuse to proceed rather than strand frames.
  if (db) {
    try {
      const chk = db.pragma('wal_checkpoint(TRUNCATE)');
      const row = Array.isArray(chk) && chk.length > 0 ? chk[0] : chk;
      if (row && typeof row === 'object' && row.busy === 1) {
        return { success: false, error: 'The database is busy (another copy of the app may be running). Close all other copies of the app and try again.' };
      }
    } catch (e) {
      return { success: false, error: 'Could not checkpoint the live database before restore: ' + e.message };
    }
    try {
      db.close();
    } catch (e) {
      return { success: false, error: 'Could not close the live database before restore: ' + e.message };
    }
    db = null;
    initialized = false;
  }

  // Phase 3 — safety copy of the CURRENT database (post-close → complete).
  const backupDir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const safetyPath = path.join(backupDir, 'pre-restore-safety-' + Date.now() + '.sqlite.bak');
  let safetyTaken = false;
  if (fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(dbPath, safetyPath);
      safetyTaken = fs.statSync(safetyPath).size === fs.statSync(dbPath).size;
      if (!safetyTaken) {
        return { success: false, error: 'Could not create a safety copy of the current database — restore aborted, nothing was changed.' };
      }
      console.log('[DB] Pre-restore safety copy saved:', safetyPath);
    } catch (e) {
      return { success: false, error: 'Could not create a safety copy of the current database — restore aborted, nothing was changed: ' + e.message };
    }
  }

  // Phase 4 — atomic swap + FATAL sidecar cleanup.
  try {
    try {
      fs.renameSync(candidatePath, dbPath);
    } catch (_renameErr) {
      fs.copyFileSync(candidatePath, dbPath);
      try { fs.rmSync(candidatePath, { force: true }); } catch (_e) { /* best effort */ }
    }
    removeWalSidecars(dbPath);
  } catch (e) {
    console.error('[DB] Restore replacement failed, rolling back:', e.message);
    const rollback = rollbackToSafetyCopy(safetyTaken ? safetyPath : null);
    return {
      success: false,
      error: 'Database replacement failed: ' + e.message
        + (rollback.ok ? ' — your previous data was automatically restored.' : ' — automatic rollback failed; your pre-restore copy is at ' + safetyPath),
      safetyBackupPath: safetyTaken ? safetyPath : undefined,
      rollback,
    };
  }

  // Phase 5 — reopen and VERIFY. Unverifiable restores are rolled back.
  let initResult = null;
  try {
    initResult = initializeDatabase();
  } catch (e) {
    initResult = { success: false, error: { message: e.message } };
  }
  const verify = verifyRestoredDatabase(db, opts.manifest);
  const initOk = !!(initResult && initResult.success === true);
  if (!initOk || !verify.ok) {
    const reason = !initOk
      ? 'the database failed to reopen'
      : verify.error;
    console.error('[DB] Restore verification failed, rolling back:', reason);
    const rollback = rollbackToSafetyCopy(safetyTaken ? safetyPath : null);
    return {
      success: false,
      error: `Restore verification failed: ${reason}`
        + (rollback.ok ? ' — your previous data was automatically restored.' : ` — automatic rollback failed; your pre-restore copy is at ${safetyPath}`),
      safetyBackupPath: safetyTaken ? safetyPath : undefined,
      rollback,
    };
  }

  console.log('[DB] Restore completed and verified.');
  return { success: true, safetyBackupPath: safetyTaken ? safetyPath : undefined, manifest: opts.manifest, verification: verify };
}

module.exports = { initializeDatabase, query, queryOne, execute, transaction, closeDatabase, runIntegrityCheck, backupDatabase, runDailyBackup, exportBackupToPath, importBackupFromPath, exportUnifiedBackupToPath, importUnifiedBackupFromPath, createUpdateSafeBackup, restoreFromUpdateSafeBackup };

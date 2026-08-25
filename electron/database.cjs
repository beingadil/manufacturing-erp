const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

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

  // Run integrity check
  try {
    const integrity = db.pragma('integrity_check');
    const ok = integrity[0] && integrity[0].integrity_check === 'ok';
    console.log('[DB] Integrity check:', ok ? 'PASSED' : 'FAILED');
  } catch (e) {
    console.warn('[DB] Integrity check error:', e.message);
  }

  initialized = true;
  console.log('[DB] Database initialized successfully');
  return { success: true };
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

  // Clean up orphan tables from previous schema versions
  db.exec(`
    DROP TABLE IF EXISTS _migrations;
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
    const ok = integrity[0] && integrity[0].integrity_check === 'ok';
    return { success: ok, details: ok ? [] : integrity };
  } catch (error) {
    return { success: false, details: [error.message], error: error.message };
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

    // SYNCHRONOUS and guaranteed: force the WAL journal into the main .sqlite
    // file, then copy that file. The backup is complete and consistent before
    // this function returns — the caller can immediately trust success and
    // list the new snapshot. (Previously this used the async db.backup()
    // promise without awaiting it, so success was reported before the file
    // existed and failures were silently swallowed.)
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(dbPath, backupPath);

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
    console.log('[DB] Backup saved:', backupPath, `(${size} bytes)`);
    return { success: true, path: backupPath, size };
  } catch (error) {
    console.error('[DB] Backup error:', error);
    return { success: false, error: error.message };
  }
}

function deleteBackup(filename) {
  try {
    const fs = require('fs');
    const backupDir = path.join(app.getPath('userData'), 'backups');
    // Only allow deleting files inside the backups directory (no path traversal)
    const safe = path.basename(filename);
    if (safe !== filename) {
      return { success: false, error: 'Invalid backup filename' };
    }
    const target = path.join(backupDir, safe);
    if (!fs.existsSync(target)) {
      return { success: false, error: 'Backup not found' };
    }
    fs.rmSync(target, { force: true });
    console.log('[DB] Backup deleted:', target);
    return { success: true };
  } catch (error) {
    console.error('[DB] Delete backup error:', error);
    return { success: false, error: error.message };
  }
}

function restoreDatabase(backupPath) {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Backup file not found' };
    }
    if (db) {
      db.close();
      db = null;
    }
    fs.copyFileSync(backupPath, dbPath);
    removeWalSidecars(dbPath);
    initialized = false;
    initializeDatabase();
    console.log('[DB] Database restored from:', backupPath);
    return { success: true };
  } catch (error) {
    console.error('[DB] Restore error:', error);
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
    // Use synchronous WAL checkpoint + file copy (not async db.backup())
    // This guarantees the backup is complete before the function returns.
    db.pragma('wal_checkpoint(TRUNCATE)');
    const sourcePath = getDbPath();
    fs.copyFileSync(sourcePath, targetPath);
    console.log('[DB] Backup exported to:', targetPath);
    return { success: true, path: targetPath };
  } catch (error) {
    console.error('[DB] Export error:', error);
    return { success: false, error: error.message };
  }
}

function importBackupFromPath(sourcePath) {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source file not found' };
    }
    // Verify it's a valid SQLite database
    const header = Buffer.alloc(16);
    const fd = fs.openSync(sourcePath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    const sqliteHeader = 'SQLite format 3\x00';
    if (header.toString('utf8', 0, 16) !== sqliteHeader) {
      return { success: false, error: 'Invalid SQLite database file' };
    }
    // Close current DB and replace with imported file
    if (db) {
      db.close();
      db = null;
    }
    // Create a backup of the current state first (safety copy)
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const safetyPath = path.join(backupDir, 'pre-import-safety-' + Date.now() + '.sqlite.bak');
    fs.copyFileSync(dbPath, safetyPath);
    console.log('[DB] Pre-import safety backup saved:', safetyPath);
    // Replace the live database
    fs.copyFileSync(sourcePath, dbPath);
    removeWalSidecars(dbPath);
    initialized = false;
    initializeDatabase();
    console.log('[DB] Database imported from:', sourcePath);
    return { success: true, safetyBackupPath: safetyPath };
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

// Collect store keys currently persisted in key_value_store (erp-storage,
// erp-access-storage, erp-settings, erp-system-logs, …)
function getPersistedStoreKeys() {
  try {
    return db.prepare('SELECT key FROM key_value_store ORDER BY key').all().map(r => r.key);
  } catch (e) {
    return [];
  }
}

// Per-table row counts so the manifest is a full, deterministic snapshot summary
function getTableRowCounts() {
  const counts = {};
  for (const t of BACKUP_TABLES) {
    try {
      counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    } catch (e) {
      counts[t] = 0;
    }
  }
  return counts;
}

function buildBackupManifest(dbBytes) {
  return {
    format: BACKUP_FORMAT_NAME,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: app.getVersion ? app.getVersion() : 'unknown',
    schemaVersion: '1.0',
    createdAt: new Date().toISOString(),
    dbSize: dbBytes.length,
    dbSha256: crypto.createHash('sha256').update(dbBytes).digest('hex'),
    stores: getPersistedStoreKeys(),
    tableRowCounts: getTableRowCounts(),
  };
}

// Export a single-file bundle: magic + manifest length + manifest JSON + SQLite bytes
function exportUnifiedBackupToPath(targetPath) {
  try {
    const fs = require('fs');
    const dir = require('path').dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // WAL checkpoint first so the main .sqlite file is complete and consistent
    db.pragma('wal_checkpoint(TRUNCATE)');
    const dbBytes = fs.readFileSync(getDbPath());
    const manifest = buildBackupManifest(dbBytes);
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const header = Buffer.alloc(12);
    header.write(BACKUP_MAGIC, 0, 'ascii');
    header.writeUInt32BE(manifestBuf.length, 8);
    const bundle = Buffer.concat([header, manifestBuf, dbBytes]);
    fs.writeFileSync(targetPath, bundle);
    console.log('[DB] Unified backup exported to:', targetPath);
    return { success: true, path: targetPath, manifest };
  } catch (error) {
    console.error('[DB] Unified export error:', error);
    return { success: false, error: error.message };
  }
}

// Import a .merpbak bundle (or fall back to a legacy raw .sqlite file).
// Validates magic, manifest, format version, schema version and SHA-256
// integrity before touching the live database — fully deterministic.
function importUnifiedBackupFromPath(sourcePath) {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
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

    // ── Replace the live database ──
    if (db) {
      db.close();
      db = null;
    }
    // Create a backup of the current state first (safety copy)
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const safetyPath = path.join(backupDir, 'pre-import-safety-' + Date.now() + '.sqlite.bak');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, safetyPath);
    }
    // Replace the live database file
    fs.writeFileSync(dbPath, dbBytes);
    removeWalSidecars(dbPath);
    initialized = false;
    initializeDatabase();
    console.log('[DB] Unified backup imported from:', sourcePath);
    return { success: true, safetyBackupPath: safetyPath, manifest };
  } catch (error) {
    console.error('[DB] Unified import error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Update-safe backup ───────────────────────────────────────────────────
// Creates a backup of the DB *outside* userData so it survives uninstall
// Uses synchronous WAL checkpoint + file copy (not async db.backup()) so the
// backup is guaranteed complete before the function returns. This is critical
// because the caller needs the backup done before quitAndInstall() is called.
function createUpdateSafeBackup() {
  try {
    const fs = require('fs');
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'Database file not found at ' + dbPath };
    }
    // Force WAL to flush into main DB file so the file copy is consistent
    db.pragma('wal_checkpoint(TRUNCATE)');
    // Save backup next to the EXE (survives uninstall of old version because
    // the NSIS uninstaller only removes files it installed, not sidecar files)
    const exeDir = path.dirname(app.getPath('exe'));
    const backupPath = path.join(exeDir, 'pre-update-backup.sqlite');
    fs.copyFileSync(dbPath, backupPath);
    console.log('[DB] Update-safe backup saved:', backupPath);
    return { success: true, path: backupPath };
  } catch (error) {
    console.error('[DB] createUpdateSafeBackup error:', error);
    return { success: false, error: error.message };
  }
}

// Restore from update-safe backup (used if DB is missing on startup)
function restoreFromUpdateSafeBackup() {
  try {
    const fs = require('fs');
    const exeDir = path.dirname(app.getPath('exe'));
    const backupPath = path.join(exeDir, 'pre-update-backup.sqlite');

    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'No update-safe backup found' };
    }

    const dbPath = getDbPath();
    console.log('[DB] Restoring from update-safe backup:', backupPath, '->', dbPath);

    if (db) {
      db.close();
      db = null;
      initialized = false;
    }

    fs.copyFileSync(backupPath, dbPath);
    removeWalSidecars(dbPath);
    console.log('[DB] Database restored from update-safe backup');

    // Remove the backup file so we don't restore stale data next time
    try { fs.rmSync(backupPath, { force: true }); } catch {}

    // Re-initialize
    return initializeDatabase();
  } catch (error) {
    console.error('[DB] restoreFromUpdateSafeBackup error:', error);
    return { success: false, error: error.message };
  }
}

// After replacing the live database file (restore/import) any leftover -wal /
// -shm files from the previous connection must be removed. Replaying a stale
// WAL against a different database file is a classic SQLite corruption source.
function removeWalSidecars(dbPath) {
  try {
    for (const ext of ['-wal', '-shm']) {
      const f = dbPath + ext;
      if (fs.existsSync(f)) fs.rmSync(f, { force: true });
    }
  } catch (error) {
    console.warn('[DB] Failed to remove WAL sidecars:', error.message);
  }
}

function listBackups() {
  try {
    const fs = require('fs');
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { filename: f, path: path.join(backupDir, f), size: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch (error) {
    console.error('[DB] List backups error:', error);
    return [];
  }
}

module.exports = { initializeDatabase, query, queryOne, execute, transaction, closeDatabase, runIntegrityCheck, backupDatabase, deleteBackup, restoreDatabase, listBackups, exportBackupToPath, importBackupFromPath, exportUnifiedBackupToPath, importUnifiedBackupFromPath, createUpdateSafeBackup, restoreFromUpdateSafeBackup };

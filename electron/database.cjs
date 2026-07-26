const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;
let initialized = false;

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
    CREATE TABLE IF NOT EXISTS processingSends (
      id TEXT PRIMARY KEY, dispatchNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, batchId TEXT, date TEXT NOT NULL, pcsSent REAL DEFAULT 0,
      pcsReceived REAL DEFAULT 0, ratePerPiece REAL DEFAULT 0, status TEXT DEFAULT 'Pending',
      adjustedToDispatchId TEXT, remarks TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processingReceipts (
      id TEXT PRIMARY KEY, receiveNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      materialId TEXT NOT NULL, sendId TEXT NOT NULL, date TEXT NOT NULL, pcsReceived REAL DEFAULT 0,
      billAmount REAL DEFAULT 0, billedStatus TEXT DEFAULT 'Unbilled', remarks TEXT,
      FOREIGN KEY (processorId) REFERENCES processors(id) ON DELETE RESTRICT,
      FOREIGN KEY (materialId) REFERENCES materials(id) ON DELETE RESTRICT,
      FOREIGN KEY (sendId) REFERENCES processingSends(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS processorBills (
      id TEXT PRIMARY KEY, billNo TEXT NOT NULL UNIQUE, processorId TEXT NOT NULL,
      date TEXT NOT NULL, totalAmount REAL DEFAULT 0, receiptIds TEXT, remarks TEXT,
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
    CREATE TABLE IF NOT EXISTS ledgerEntries (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, partyId TEXT, partyType TEXT,
      type TEXT, amount REAL DEFAULT 0, referenceNo TEXT, description TEXT, voucherId TEXT,
      FOREIGN KEY (voucherId) REFERENCES vouchers(id) ON DELETE CASCADE
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
    CREATE INDEX IF NOT EXISTS idx_ledgerEntries_partyId ON ledgerEntries(partyId);
    CREATE INDEX IF NOT EXISTS idx_ledgerEntries_voucherId ON ledgerEntries(voucherId);
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
    const backupDir = path.join(app.getPath('userData'), 'backups');
    const fs = require('fs');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `manufacturing-erp-${timestamp}.sqlite.bak`);

    db.backup(backupPath)
      .then(() => {
        console.log('[DB] Backup saved:', backupPath);
        // Prune old backups (keep last 30)
        try {
          const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('manufacturing-erp-') && f.endsWith('.sqlite.bak'))
            .sort().reverse();
          if (files.length > 30) {
            files.slice(30).forEach(f => fs.rmSync(path.join(backupDir, f), { force: true }));
          }
        } catch {}
      })
      .catch(err => console.error('[DB] Backup failed:', err));

    return { success: true, path: backupPath };
  } catch (error) {
    console.error('[DB] Backup error:', error);
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
    // Use better-sqlite3's native backup API for a consistent, valid SQLite file
    db.backup(targetPath)
      .then(() => {
        console.log('[DB] Backup exported to:', targetPath);
      })
      .catch(err => console.error('[DB] Backup export failed:', err));
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
    initialized = false;
    initializeDatabase();
    console.log('[DB] Database imported from:', sourcePath);
    return { success: true, safetyBackupPath: safetyPath };
  } catch (error) {
    console.error('[DB] Import error:', error);
    return { success: false, error: error.message };
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

module.exports = { initializeDatabase, query, queryOne, execute, transaction, closeDatabase, runIntegrityCheck, backupDatabase, restoreDatabase, listBackups, exportBackupToPath, importBackupFromPath };

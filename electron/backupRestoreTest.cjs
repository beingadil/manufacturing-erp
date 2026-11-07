/**
 * Backup/Restore Integration Test — runs inside Electron so better-sqlite3's
 * native binary matches the correct NODE_MODULE_VERSION.
 *
 * Usage:
 *   ELECTRON_USER_DATA=<isolated temp dir> npx electron electron/backupRestoreTest.cjs
 *
 * HARD SAFETY RULE: ELECTRON_USER_DATA is REQUIRED and must live under the OS
 * temp directory. This script refuses to run against any other path — it must
 * never touch the real %APPDATA%\manufacturing-erp database.
 *
 * Scenario (all on an isolated database):
 *   seed → export (.merpbak) → independently validate the bundle →
 *   mutate the live DB → import the bundle → verify the restore is exact →
 *   corrupt-bundle rejection → verify the live DB is untouched by the failure.
 */
const { app } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const TEST_DIR = process.env.ELECTRON_USER_DATA;
if (!TEST_DIR) {
  console.error('[BackupRestoreTest] FATAL: ELECTRON_USER_DATA is required and must be an isolated temp dir.');
  app.exit(2);
}
const resolved = path.resolve(TEST_DIR);
const tmpRoot = path.resolve(os.tmpdir());
if (!resolved.startsWith(tmpRoot + path.sep)) {
  console.error('[BackupRestoreTest] FATAL: ELECTRON_USER_DATA must be under the OS temp directory (got:', resolved, '). Refusing to touch anything else.');
  app.exit(2);
}
app.setPath('userData', resolved);

const db = require('./database.cjs');
const MARKER_CAT = '__backup_test__cat';
const MARKER_CAT_2 = '__backup_test__cat_after_export';
const KV_KEY = 'erp-storage';
const KV_VALUE_SEEDED = '{"state":{"categories":[{"id":"__backup_test__cat","name":"Backup Test Category"}]},"version":3}';

let failures = 0;
const ok = (cond, label) => {
  if (cond) { console.log('  ✓', label); }
  else { console.error('  ✗', label); failures++; }
};

function tableCount(table) {
  const row = db.queryOne(`SELECT COUNT(*) AS c FROM ${table}`);
  return row ? row.c : -1;
}

function plantRows() {
  db.execute(
    'INSERT OR REPLACE INTO categories (id, name, description, status) VALUES (?, ?, ?, ?)',
    [MARKER_CAT, 'Backup Test Category', 'planted by backupRestoreTest', 'Active']
  );
  db.execute(
    'INSERT OR REPLACE INTO key_value_store (key, value, updated_at) VALUES (?, ?, strftime(\'%Y-%m-%d %H:%M:%f\', \'now\'))',
    [KV_KEY, KV_VALUE_SEEDED]
  );
}

app.whenReady().then(() => {
  let init;
  try {
    init = db.initializeDatabase();
  } catch (e) {
    console.error('[BackupRestoreTest] initializeDatabase threw:', e.message);
    app.exit(1);
    return;
  }
  if (!init || !init.success) {
    console.error('[BackupRestoreTest] FATAL: database initialization failed');
    app.exit(1);
    return;
  }

  // ── 1. Seed ────────────────────────────────────────────────────────
  console.log('\n[1] Seed');
  plantRows();
  ok(tableCount('categories') === 1, 'seeded exactly one marker category');
  ok(!!db.queryOne('SELECT value FROM key_value_store WHERE key = ?', [KV_KEY]), 'seeded key_value_store blob');

  // ── 2. Export ──────────────────────────────────────────────────────
  console.log('\n[2] Export .merpbak');
  const bundlePath = path.join(resolved, 'roundtrip.merpbak');
  const exportResult = db.exportUnifiedBackupToPath(bundlePath);
  ok(exportResult && exportResult.success === true, 'export reports success');
  ok(fs.existsSync(bundlePath), 'bundle file exists on disk');
  ok(exportResult.manifest && exportResult.manifest.dbSha256, 'manifest carries SHA-256');

  // ── 3. Independently validate the bundle (outside the app code) ─────
  console.log('\n[3] Independent bundle validation');
  let shaOk = false;
  let tablesOk = false;
  try {
    const fileBuf = fs.readFileSync(bundlePath);
    const manifestLen = fileBuf.readUInt32BE(8);
    const manifest = JSON.parse(fileBuf.slice(12, 12 + manifestLen).toString('utf8'));
    const dbBytes = fileBuf.slice(12 + manifestLen);
    const crypto = require('crypto');
    const sha = crypto.createHash('sha256').update(dbBytes).digest('hex');
    shaOk = sha === manifest.dbSha256;
    const restoreCandidate = path.join(resolved, 'probe.sqlite');
    fs.writeFileSync(restoreCandidate, dbBytes);
    const probe = new (require('better-sqlite3'))(restoreCandidate, { readonly: true });
    const integrity = probe.pragma('integrity_check');
    const status = integrity && integrity[0] && integrity[0].integrity_check;
    const tables = new Set(probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
    tablesOk = String(status) === 'ok' && ['categories', 'key_value_store', 'accounts', 'vouchers', 'batches'].every(t => tables.has(t));
    probe.close();
    fs.rmSync(restoreCandidate, { force: true });
  } catch (e) {
    console.error('  independent validation error:', e.message);
  }
  ok(shaOk, 'embedded SHA-256 matches manifest');
  ok(tablesOk, 'embedded database passes integrity_check and contains required tables');

  // ── 4. Mutate the live DB (things a restore must undo) ─────────────
  console.log('\n[4] Mutate live DB');
  db.execute(
    'INSERT OR REPLACE INTO categories (id, name, description, status) VALUES (?, ?, ?, ?)',
    [MARKER_CAT_2, 'After-export category', 'must disappear after restore', 'Active']
  );
  db.execute('DELETE FROM key_value_store WHERE key = ?', [KV_KEY]);
  ok(tableCount('categories') === 2, 'mutation applied (2 categories)');
  ok(!db.queryOne('SELECT value FROM key_value_store WHERE key = ?', [KV_KEY]), 'mutation applied (blob deleted)');

  // ── 5. Import the bundle ────────────────────────────────────────────
  console.log('\n[5] Import bundle');
  const importResult = db.importUnifiedBackupFromPath(bundlePath);
  ok(importResult && importResult.success === true, 'import reports success');
  if (!importResult || !importResult.success) {
    console.error('  import error:', importResult && importResult.error);
  }

  // ── 6. Verify the restored state is exactly the seeded state ────────
  console.log('\n[6] Verify restored state');
  ok(tableCount('categories') === 1, 'restored database holds exactly the seeded category');
  ok(!!db.queryOne('SELECT * FROM categories WHERE id = ?', [MARKER_CAT]), 'seeded category present after restore');
  ok(!db.queryOne('SELECT * FROM categories WHERE id = ?', [MARKER_CAT_2]), 'post-export mutation is GONE after restore');
  const kv = db.queryOne('SELECT value FROM key_value_store WHERE key = ?', [KV_KEY]);
  ok(kv && kv.value === KV_VALUE_SEEDED, 'key_value_store blob restored byte-for-byte');
  const integrityNow = db.runIntegrityCheck();
  ok(integrityNow.success, 'integrity_check passes on the restored database');

  // ── 7. Corrupt bundle must be REJECTED; live DB must survive it ─────
  console.log('\n[7] Corrupt bundle rejection');
  // Re-seed a recognizable state, export, then corrupt a copy of the bundle.
  db.execute(
    'INSERT OR REPLACE INTO categories (id, name, description, status) VALUES (?, ?, ?, ?)',
    [MARKER_CAT_2, 'After-export category', 'must survive failed restore', 'Active']
  );
  const bundlePath2 = path.join(resolved, 'roundtrip2.merpbak');
  const export2 = db.exportUnifiedBackupToPath(bundlePath2);
  ok(export2 && export2.success === true, 'second export succeeds');
  const corruptPath = path.join(resolved, 'roundtrip2-corrupt.merpbak');
  fs.copyFileSync(bundlePath2, corruptPath);
  const corruptBuf = fs.readFileSync(corruptPath);
  corruptBuf[corruptBuf.length - 100] ^= 0xff; // flip a byte inside the embedded DB payload
  fs.writeFileSync(corruptPath, corruptBuf);
  const corruptImport = db.importUnifiedBackupFromPath(corruptPath);
  ok(corruptImport && corruptImport.success === false, 'corrupt bundle is rejected (SHA-256 mismatch)');
  ok(!!db.queryOne('SELECT * FROM categories WHERE id = ?', [MARKER_CAT_2]), 'live data survived the rejected restore');
  const integrityAfter = db.runIntegrityCheck();
  ok(integrityAfter.success, 'live database still passes integrity_check');

  // ── 8. Nonexistent file must be rejected cleanly ────────────────────
  console.log('\n[8] Missing backup rejection');
  const missingImport = db.importUnifiedBackupFromPath(path.join(resolved, 'does-not-exist.merpbak'));
  ok(missingImport && missingImport.success === false, 'missing backup is rejected');

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('');
  if (failures > 0) {
    console.error(`[BackupRestoreTest] FAILED — ${failures} check(s) failed.`);
    app.exit(1);
    return;
  }
  console.log('[BackupRestoreTest] PASSED — export → mutate → import → verify roundtrip is exact, corrupt backups are rejected safely.');
  app.exit(0);
});

setTimeout(() => {
  console.error('[BackupRestoreTest] FATAL: Timed out.');
  app.exit(1);
}, 60_000);

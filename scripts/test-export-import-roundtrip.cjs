// Regression suite for the user's actual failing flow:
//   "Export Backup (.merpbak)" → later "Import Backup" on the same or another
//   machine → data must come back.
//
// NOTE: scripts/test-backup-restore-flow.cjs does NOT cover this. It creates a
// snapshot with backupDatabase() (raw .sqlite.bak) and imports it through the
// legacy importBackupFromPath() branch. The unified bundle path —
// exportUnifiedBackupToPath() → importUnifiedBackupFromPath() — is what the
// Export/Import buttons actually call, and it had no coverage at all.
//
// Run: npx electron scripts/test-export-import-roundtrip.cjs

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merp-roundtrip-'));
app.setPath('userData', path.join(workDir, 'userData'));
app.setPath('documents', path.join(workDir, 'documents'));
fs.mkdirSync(path.join(workDir, 'userData'), { recursive: true });
fs.mkdirSync(path.join(workDir, 'documents'), { recursive: true });

const db = require('../electron/database.cjs');

// The production UPSERT (millisecond precision), copied from database.cjs so the
// test exercises the same statement the app writes with.
const UPSERT = `INSERT INTO key_value_store (key, value, updated_at)
  VALUES (?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
  ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at`;

let failures = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || extra === undefined ? '' : ` — ${extra}`}`);
  if (!ok) failures += 1;
  return ok;
}

function main() {
  db.initializeDatabase();

  const stateWithData = JSON.stringify({
    state: {
      categories: [{ id: 'cat-1', name: 'Steel' }],
      materials: [{ id: 'mat-1', name: 'Sheet' }],
      purchases: [{ id: 'pur-1', amount: 100 }],
    },
    version: 3,
  });

  // ── 1. User has data and exports a portable bundle ──────────────────────
  db.execute(UPSERT, ['erp-storage', stateWithData]);
  db.execute(
    `INSERT OR REPLACE INTO categories (id, name, description, status)
     VALUES ('cat-1', 'Steel', 'roundtrip probe', 'Active')`
  );

  const bundlePath = path.join(workDir, 'roundtrip.merpbak');
  const exported = db.exportUnifiedBackupToPath(bundlePath);
  check('Export .merpbak succeeds', exported.success, exported.error);
  if (!exported.success) { finish(); return; }

  // ── 2. What actually landed in the bundle? ──────────────────────────────
  const bundle = fs.readFileSync(bundlePath);
  const magic = bundle.slice(0, 8).toString('ascii');
  const manifestLen = bundle.readUInt32BE(8);
  const manifest = JSON.parse(bundle.slice(12, 12 + manifestLen).toString('utf8'));
  const embedded = bundle.slice(12 + manifestLen);

  check('Bundle has the MERPBK01 magic', magic === 'MERPBK01', `got "${magic}"`);
  check('Embedded payload starts with the SQLite header',
    embedded.slice(0, 16).toString('utf8') === 'SQLite format 3\x00');

  // Read the bundle's DB in isolation — this is the artifact that travels to
  // the other PC, so it must be judged on its own, not on the live database.
  const probePath = path.join(workDir, 'probe.sqlite');
  fs.writeFileSync(probePath, embedded);
  const Database = require('better-sqlite3');
  const probe = new Database(probePath, { readonly: true });
  let probeRow = null;
  let probeCats = 0;
  try {
    probeRow = probe.prepare('SELECT value FROM key_value_store WHERE key = ?').get('erp-storage');
    probeCats = probe.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  } catch (e) {
    check('Bundle database is readable', false, e.message);
  }
  check('Bundle contains the erp-storage blob', !!(probeRow && probeRow.value && probeRow.value.includes('cat-1')));
  check('Bundle contains the categories row', probeCats > 0, `categories=${probeCats}`);
  probe.close();

  check('Manifest lists erp-storage as a persisted store',
    Array.isArray(manifest.stores) && manifest.stores.includes('erp-storage'),
    JSON.stringify(manifest.stores));

  // ── 3. User destroys their data, then imports the bundle ────────────────
  db.execute('DELETE FROM key_value_store');
  db.execute('DELETE FROM categories');
  const afterWipe = db.queryOne('SELECT value FROM key_value_store WHERE key = ?', ['erp-storage']);
  check('Data is gone before import', !afterWipe);

  // Rows that exist NOW but are NOT in the bundle. Wiping first would let a
  // merging restore pass, so this residue is what makes "fully overwrites the
  // current database" an assertion that can actually fail.
  db.execute('INSERT INTO key_value_store (key, value) VALUES (?, ?)',
    ['__residue_probe', '{"value":"survivor","savedAt":1}']);
  db.execute('INSERT INTO categories (id, name) VALUES (?, ?)', ['residue-cat', 'RESIDUE-CATEGORY']);
  check('Residue row exists before import',
    !!db.queryOne('SELECT value FROM key_value_store WHERE key = ?', ['__residue_probe']));

  const imported = db.importUnifiedBackupFromPath(bundlePath);
  check('Import reports success', imported.success, imported.error);
  if (!imported.success) { finish(); return; }

  // ── 4. Did the restore bring the data back? ─────────────────────────────
  const restored = db.queryOne('SELECT value FROM key_value_store WHERE key = ?', ['erp-storage']);
  const restoredCats = db.queryOne('SELECT COUNT(*) AS c FROM categories');
  check('erp-storage came back with its data',
    !!(restored && restored.value && restored.value.includes('cat-1')),
    restored ? restored.value.slice(0, 120) : 'row missing');
  check('categories came back', restoredCats && restoredCats.c > 0, `categories=${restoredCats ? restoredCats.c : 'n/a'}`);

  // ── 5. No residue: the restore REPLACED the database, it did not merge ────
  const residueKey = db.queryOne('SELECT value FROM key_value_store WHERE key = ?', ['__residue_probe']);
  const residueCat = db.queryOne('SELECT COUNT(*) AS c FROM categories WHERE id = ?', ['residue-cat']);
  check('Restore dropped the residue key (overwrote, did not merge)', !residueKey,
    'row survived the restore');
  check('Restore dropped the residue category (overwrote, did not merge)',
    !!residueCat && residueCat.c === 0, `residue rows still present: ${residueCat ? residueCat.c : 'n/a'}`);

  const integrity = db.runIntegrityCheck();
  check('Integrity passes after import', integrity.success === true, integrity.error);

  finish();
}

function finish() {
  console.log('');
  if (failures === 0) {
    console.log('EXPORT/IMPORT ROUNDTRIP: PASS (export → wipe → import → data restored, no residue)');
    db.closeDatabase();
    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(0);
  } else {
    console.log(`EXPORT/IMPORT ROUNDTRIP: FAIL (${failures} check(s) failed)`);
    db.closeDatabase();
    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(1);
  }
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}

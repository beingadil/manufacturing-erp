// Regression suite: "save category/material/purchase → delete → import from
// backup → data must come back" (issue reported by the user).
//
// Uses the REAL electron/database.cjs (backup/restore/import + key_value_store)
// and replicates the renderer's SQLiteStorageAdapter.getItem() mirror logic so
// the end-to-end outcome — including the localStorage-mirror defeat and its
// fix — is pinned without needing the full renderer. The replication models a
// legacy envelope (no `unsynced` flag): the production adapter now also trusts
// an explicit unsynced mirror, but the restore invariant tested here is the
// same — a cleared mirror lets the restored SQLite rows win.
//
// Run: npx electron scripts/test-backup-restore-flow.cjs

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merp-flow-test-'));
app.setPath('userData', path.join(workDir, 'userData'));
app.setPath('documents', path.join(workDir, 'documents'));
fs.mkdirSync(path.join(workDir, 'userData'), { recursive: true });
fs.mkdirSync(path.join(workDir, 'documents'), { recursive: true });

const db = require('../electron/database.cjs');

// ── faithful replication of SQLiteStorageAdapter's mirror logic ─────────────
const STALE_TOLERANCE_MS = 2000;
function parseSqliteTimestamp(updatedAt) {
  if (!updatedAt) return 0;
  const t = Date.parse(updatedAt.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}
// Returns what the renderer's getItem() would return, and whether it "healed".
function adapterGetItem(sqliteRow, mirror) {
  if (sqliteRow && sqliteRow.value != null) {
    const sqliteSavedAt = parseSqliteTimestamp(sqliteRow.updated_at);
    if (!mirror || sqliteSavedAt >= mirror.savedAt - STALE_TOLERANCE_MS) {
      return { returned: sqliteRow.value, healed: false };
    }
    // Mirror newer → previous SQLite write "failed" → return mirror + heal SQLite
    return { returned: mirror.value, healed: true };
  }
  if (mirror) return { returned: mirror.value, healed: false };
  return { returned: null, healed: false };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UPSERT = `INSERT INTO key_value_store (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

let failures = 0;
function check(name, cond) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures += 1;
  return ok;
}

async function main() {
  db.initializeDatabase();

  const stateWithData = JSON.stringify({
    state: { categories: [{ id: 'cat-1', name: 'Steel' }], materials: [{ id: 'mat-1', name: 'Sheet' }], purchases: [{ id: 'pur-1', amount: 100 }] },
    version: 3,
  });
  const stateAfterDelete = JSON.stringify({
    state: { categories: [], materials: [], purchases: [] },
    version: 3,
  });

  // 1. User saves data → persist setItem → SQLite + localStorage mirror (T1)
  db.execute(UPSERT, ['erp-storage', stateWithData]);
  const mirrorSavedAt_afterSave = Date.now();
  await sleep(2100); // exceed STALE_TOLERANCE_MS so timestamps are unambiguous

  // 2. User creates the backup
  const bak = db.backupDatabase();
  check('Create Backup succeeds', bak.success);
  if (!bak.success) { console.log('  (cannot continue without a backup)'); process.exit(1); }
  const dbPath = path.join(app.getPath('userData'), 'manufacturing-erp.sqlite');

  // 3. User deletes the data → persist setItem → SQLite + mirror now hold deleted state (T2)
  await sleep(2100);
  db.execute(UPSERT, ['erp-storage', stateAfterDelete]);
  const mirrorSavedAt_afterDelete = Date.now();
  await sleep(2100);

  // 4. User imports the backup (unified .merpbak path used by the Import button)
  const imp = db.importUnifiedBackupFromPath(bak.path);
  check('Import reports success', imp.success);
  if (!imp.success) { console.log('  import error:', imp.error); process.exit(1); }

  // 5. Main-process DB now holds the restored data (restore itself works)
  const row = db.queryOne('SELECT value, updated_at FROM key_value_store WHERE key = ?', ['erp-storage']);
  const mainHasRestoredData = !!(row && row.value && row.value.includes('cat-1'));
  check('Main-process DB contains the category after import', mainHasRestoredData);

  // 6. The restored database is intact and usable after the reopen.
  //    (removeWalSidecars deletes stale -wal/-shm before re-initializing;
  //    fresh sidecars are expected once the live WAL-mode connection reopens,
  //    so integrity + data correctness are the assertions that can fail.)
  const integrity = db.runIntegrityCheck();
  check('Database integrity passes after import', integrity.success === true);

  // 7. Without invalidation the mirror (newer) defeats the restore — documents
  //    why clearStorageMirrors() is required.
  const mirror = { value: stateAfterDelete, savedAt: mirrorSavedAt_afterDelete };
  const withoutFix = adapterGetItem(row, mirror);
  check('Without invalidation the newer mirror overrides the restore (bug documented)', withoutFix.healed === true && !withoutFix.returned.includes('cat-1'));

  // 8. With the fix (mirrors invalidated before reload) the restored state wins.
  const withFix = adapterGetItem(row, null);
  check('After clearStorageMirrors() the restored SQLite state wins', !!withFix.returned && withFix.returned.includes('cat-1'));

  console.log('');
  if (failures === 0) {
    console.log('BACKUP/RESTORE FLOW: PASS (data saved → deleted → imported → restored)');
    db.closeDatabase();
    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(0);
  } else {
    console.log(`BACKUP/RESTORE FLOW: FAIL (${failures} check(s) failed)`);
    db.closeDatabase();
    fs.rmSync(workDir, { recursive: true, force: true });
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

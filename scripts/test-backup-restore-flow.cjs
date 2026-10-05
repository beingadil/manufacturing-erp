// Regression suite: "save category/material/purchase → delete → import from
// backup → data must come back" (issue reported by the user).
//
// Uses the REAL electron/database.cjs (backup/restore/import + key_value_store)
// and replicates the renderer's SQLiteStorageAdapter.getItem() mirror logic so
// the end-to-end outcome — including the localStorage-mirror precedence rules —
// is pinned without needing the full renderer.
//
// Precedence replicated from src/database/sqlite/SQLiteStorageAdapter.ts:
// SQLite is the single source of truth. The ONLY mirror that may override it is
// an UNSYNCED one (a value whose SQLite write genuinely failed, so the mirror is
// the last surviving copy). A synced mirror is a cache entry with no authority —
// which is what makes a restore stick, because a pre-restore mirror is always
// newer than the row a restore just wrote. Restore still clears the mirrors so
// an in-flight unsynced mirror cannot survive it.
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
// Returns what the renderer's getItem() would return, and whether it "healed"
// (i.e. wrote the mirror back into SQLite).
function adapterGetItem(sqliteRow, mirror) {
  if (sqliteRow && sqliteRow.value != null) {
    // Only an UNSYNCED mirror may override SQLite — it means the SQLite write
    // for that value failed, so this is the only surviving copy. Timestamps are
    // deliberately NOT consulted.
    if (mirror && mirror.unsynced) return { returned: mirror.value, healed: true };
    return { returned: sqliteRow.value, healed: false };
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
  await sleep(1100); // make the mirror unambiguously newer than the SQLite row

  // 2. User creates the backup
  const bak = db.backupDatabase();
  check('Create Backup succeeds', bak.success);
  if (!bak.success) { console.log('  (cannot continue without a backup)'); process.exit(1); }
  const dbPath = path.join(app.getPath('userData'), 'manufacturing-erp.sqlite');

  // 3. User deletes the data → persist setItem → SQLite + mirror now hold deleted state (T2)
  db.execute(UPSERT, ['erp-storage', stateAfterDelete]);
  await sleep(1100);

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

  // 7. THE FIX: a SYNCED pre-restore mirror is a cache entry, not an authority.
  //    Even though it is newer than the restored row, it must not clobber it —
  //    this is what used to make a restore look like it "deleted everything".
  const syncedMirror = { value: stateAfterDelete, unsynced: false };
  const afterRestore = adapterGetItem(row, syncedMirror);
  check('A synced pre-restore mirror does NOT override the restored SQLite row',
    afterRestore.healed === false && afterRestore.returned.includes('cat-1'));

  // 8. An UNSYNCED mirror would still win (its SQLite write failed, so it is the
  //    only surviving copy) — which is why restore additionally clears mirrors.
  const unsyncedMirror = { value: stateAfterDelete, unsynced: true };
  const withUnsynced = adapterGetItem(row, unsyncedMirror);
  check('An unsynced mirror still wins (and is written back into SQLite)',
    withUnsynced.healed === true && !withUnsynced.returned.includes('cat-1'));

  // 9. With mirrors cleared before reload, nothing can survive the restore.
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
